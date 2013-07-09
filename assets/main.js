window.Hammer = {
  Data: {},
  Util: {}
};

// Backbone Models + Collections

Hammer.Util.autoTextArea = function (ta) {
  var oldh = parseInt(ta.style.height,10);
  var height = (ta.scrollHeight);
  var capped = (height > 200) ? 200 : height;
  ta.style.height = capped + 'px';

  // Chrome adds an extra 4px. This fixes that bug
  if (parseInt(ta.style.height, 10) - oldh < 6) {
    ta.style.height = oldh + 'px';
  }
};

Hammer.Index = Backbone.Model.extend({});
Hammer.Indexes = Backbone.Collection.extend({
  model: Hammer.Index,
  refresh: function (server) {
    var self = this;
    $.get(server + '/_cluster/state').
      success(function (body) {
        self.reset((_.map(_.keys(body.metadata.indices), function (idx) {
          return {index: idx};
        })));
      });
  }
});

Hammer.Request = Backbone.Model.extend({
  defaults: function () {
    var server;
    
    var pathComponents = _.compact(window.location.pathname.split('/'));
    if (pathComponents[pathComponents.length - 1] === 'elastic-hammer'
        && pathComponents[pathComponents.length - 2] === '_plugin') {
      server = window.location.protocol + '//' + window.location.host;
      if (pathComponents.length > 2) {
        server = server + '/' + (pathComponents.slice(0, pathComponents.length -2).join('/'));
      }
    } else {
      server = 'http://localhost:9200';
    };
    
    return {
      started: null,
      ended: null,
      state: 'fresh',
      method: 'GET',
      server: server,
      path: '',
      body: null,
      response: null,
      status: null,
      errors: ""
    };
  },
  initialize: function () {
    this.on('change', this.validate, this);
  },
  bodyCapable: function () {
    var method = this.get('method');
    return (method === 'PUT' || method === 'POST');
  },
  ok: function () {
    var status = this.get('status')
    return (status >= 200 && status < 300);
  },
  // Attempt to guess helpful API settings as paths are typed
  apiGuessSettings: function () {
    var a = this.api();
    var newVals = {};
    if (a === 'search') {
      newVals.method = 'POST';
      if (! this.get('body')) {
        newVals.body = '{"query": {"match_all": {}}}'
      }
    } else if (a === 'bulk') {
      newVals.method = 'POST';
      if (! this.get('body')) {
        newVals.body = '{"index": {"_index": "INDEXNAME", "_type": "TYPENAME", "_id": "ID"}}\n{"field1": "value"}\n'
      }
    }

    this.set(newVals);
  },
  api: function () {
    var noquery = this.get('path').replace(/\?.*/, '');
    var parts = noquery.split("/");
    if (parts[0] == "") {
      parts = parts.slice(1); // Discard leading '/' part
    }

    var last = _.last(parts);

    switch (last)
    {
    case '_search':
      return 'search';
    case '_mapping':
      return 'mapping';
    case '_settings':
      return '_settings';
    case '_bulk':
      return 'bulk';
    };

    if (parts.length === 3 && last.match(/^[^_].*$/)) {
      return "document";
    }

    return null;
  },
  validate: function () {
    if  (!this.bodyCapable()) {
      this.set('body', null);
    }

    var body = this.get('body');
    var method = this.get('method');
    if (this.bodyCapable() && body !== undefined && body !== null && body.trim() !== '' && this.api() !== 'bulk') {
      try {
        JSON.parse(body);
      } catch (ex) {
        this.set('errors', "Invalid JSON: " + ex);
        return false;
      }
    }

    this.set('errors', null);
    return true;
  },
  reqUrl: function () {
    return this.get('server') + '/' + this.get('path');
  },
  // Return statuses rounded down to the nearest 100. i.e. 201 -> 200
  statusGroup: function () {
    if (this.get('state') === 'errored' && !this.get('status')) return 'errored';
    if (!this.get('status') === null) return null;
    var s = this.get('status');
    return s - (s % 100);
  },
  exec: function () {
    if (this.get('state') !== 'fresh') {
      console.error("Already ran!", this.get('state'), this);
      return;
    }

    this.set('state', 'running');
    var self = this;
    var m = this.get('method');
    var body = null;
    if (m === 'POST' || m === 'PUT') {
      body = this.get('body');
    }

    this.set('started', Date.now());

    var reqUrl = this.reqUrl();
    console.log("TARGET", reqUrl);
    $.ajax(
      reqUrl,
      {
        type: this.get('method'),
        data: body,
        processData: false
      }
    ).success(
      function (d,ts,xhr) {
        self.set({state: 'succeeded', response: d, status: xhr.status});
        self.trigger('success');
      }
    ).error(
      function (xhr) {
        self.set({state: 'errored', response: xhr.responseText, status: xhr.status});

        self.trigger('error');
    }).complete(
      function (xhr) {
        self.set('ended', Date.now());
        self.trigger('complete');
    });

  },
  execRecord: function () {
    var eClone = this.clone();
    Hammer.Data.history.watch(eClone);
    eClone.exec();
  },
  url: function () {
    return this.get('server') + '/' + this.get('path');
  }
});

Hammer.RequestHistory = Backbone.Collection.extend({
  localStorage: new Backbone.LocalStorage("request-history"),
  maxRecords: 500,
  model: Hammer.Request,
  initialize: function () {
    this.fetch();
    this.on('add', this.trim, this);
  },
  trim: function () {
    if (this.size() > this.maxRecords) {
      var i = this.maxRecords;
      var m;
      while (m = this.models[i]) {
        i++;
        m.destroy();
      }
    }
  },
  watch: function (request) {
    var adder = null;
    adder = function () {
      this.add(request);
      var res = this.sync("create", request);
      //request.off('complete', adder);
    };
    request.on('complete', adder, this);
  },
  comparator: function (request) {
    return(- request.get('started'));
  }
});

// ViewModels

ko.bindingHandlers.autoTextArea = {
  update: function(ta, valueAccessor, allBindingsAccessor) {
    Hammer.Util.autoTextArea(ta);
  }
};

Hammer.IndexVM = function (index) {
  _.extend(this, kb.viewModel(index));
}

Hammer.IndexesVM = function(indexes) {
  this.indexes = kb.collectionObservable(indexes, {view_model: Hammer.IndexVM})
};

Hammer.ClearHistoryVM = function () {
  this.clear = function () {
    if (confirm("Are you sure? This will delete ALL request history!")) {
      // TODO: Not sure why this needs to be called multiple times
      // It will delete > 1 models, but stop at some point for reasons
      // I don't understand
      while (Hammer.Data.history.size() > 0) {
        Hammer.Data.history.map(function (m,i) { 
          return m.destroy();
        });
      };
    }
  };
}

Hammer.RequestBaseVM = function (request) {
  _.extend(this, kb.viewModel(request));
  this.exec = function (self) {
    request.execRecord();
  };

  var self = this;
  this.bodyCapable = ko.computed(function () {
    var m = this.method();
    return (m === 'POST' || m === 'PUT')
  }, this);

  this.api = ko.computed(function () {
    // For some reason peek() seems to get optimized out, and
    // this never triggers unless we actually use the path() with IO
    var apiStr = request.api();
    if (apiStr) {
      return this.path().substr(0,0) + request.api();
    } else {
      return '?';
    }
  }, this);

  this.apiSubmit = ko.computed(function () {
    var type = (this.path().substr(0,0) + request.api());
    if (type === 'null')
      type = '';
    else
      type = ' ' + type.toUpperCase() + '';
    return 'Execute ' + this.method() + type.toUpperCase() +' (⏎ or CTRL+⏎)';
  }, this);

  this.fetchIndexes = function (vm, e) {
    Hammer.Data.indexes.refresh(this.server());
  };

  this.updatePath = function (vm, e) {
    request.set('path', $(e.currentTarget).val());
    request.apiGuessSettings();
    return true;
  };

  this.url = ko.computed(function (self) {
    return request.reqUrl();
  });

  this.autoTextArea = function (vm, e) {
    Hammer.Util.autoTextArea(e.currentTarget);
    return true;
  };

  this.vAutoTextArea = function (vm, e) {
    request.set('body', $(e.currentTarget).val());
    request.validate();
    Hammer.Util.autoTextArea(e.currentTarget);
    return true;
  };
};

Hammer.CurrentRequestVM = function (request) {
  _.extend(this, new Hammer.RequestBaseVM(request));

  this.checkCtrlEnter = function (self,e) {
    if (e.keyCode == 13 && e.ctrlKey) {
      request.execRecord();
      return false;
    }
    return true
  };
};

Hammer.HistoricalRequestVM = function (request) {
  _.extend(this, new Hammer.RequestBaseVM(request));

  this.runAgain = function () {
    Hammer.Data.current.set({
      method: request.get('method'),
      server: request.get('server'),
      path: request.get('path'),
      body: request.get('body')
    });
    window.scrollTo(0,0);
    $('#current-request').addClass('highlight');
    setTimeout(function () {
     $('#current-request').removeClass('highlight')
    }, 200);
    $('#path').focus();
  };

  this.slashPath = ko.computed(function () {
    return '/' + this.path();
  }, this);

  this.serverNoProto = ko.computed(function () {
    return this.server().replace(/^https?:\/\//,'');
  }, this);

  this.rtt = ko.computed(function () {
    if (this.ended() && this.started()) {
      return (this.ended() - this.started()) + 'ms';
    } else {
      return null
    }
  },this);

  this.contextMeta = ko.computed(function () {
    var api = request.api();
    if (! api || !request.ok()) return;
    
    var response = this.response();
    var ths = [];
    var tds = [];
    var kv = function(k,v) { 
      ths.push({th: k});
      tds.push({td: v});
    }
    if (api === 'search') {
      kv('took', response.took + 'ms');
      kv('total', response.hits.total);
      kv('max score', response.hits.max_score);
      kv('shards', response._shards.successful + '/' + response._shards.total)
    } else {
      return;
    }
    return {ths: ths, tds: tds};
  }, this);

  this.responseParsed = ko.computed(function () {
    var respJSON;
    if (_.isString(this.response())) {
      try {
        respJSON = JSON.parse(this.response())
      } catch (ex) {
        respStr = this.response();
      }
    } else {
      respJSON = this.response();
    }
    return respJSON;
  }, this);

  this.responseFmt = ko.computed(function () {
    var respStr;
    var respJSON = this.responseParsed();

    if (respJSON) {
      return JSON.stringify(respJSON, null, 2);
    } else {
      return respStr;
    }
  }, this);

  var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/

  var escaper = $('<span>');
  var formatValue = function (value) {
    value = escaper.text(value).html();
    
    if (_.isString(value) && value.match(urlPattern)) {
      // Cheesey HTML escape
      var inner = value;
      if (value.match(/\.(jpg|jpeg|png|gif)$/)) {
        inner = "<img src='" + value + "'/>"; 
      }
      return "<a href='" + value + "'>" + inner + '</a>';
    } else {
      return value;
    }
  }
  
  var templateifyObject;
  templateifyObject = function (value, name) {
    if (_.isArray(value)) {
      return {name: name, isObject: true, value: _.map(value, function (v,i) { return templateifyObject(v, i) })};
    } else if (_.isObject(value)) {
      return {name: name, value: _.map(value, templateifyObject), isObject: true };
    } else {
      return {name: name, value: formatValue(value), isObject: false};
    }
  };

  this.responseNodes = ko.computed(function () {
    var resp;
    var rp = this.responseParsed();
    if (this.api() == 'search' && rp.hits) {
      resp = rp.hits.hits;
    } else {
      this.responseParsed();
    }

    return _.map(resp, templateifyObject);
  }, this);

  this.formattableResponse = ko.computed(function () {
    if (this.status() > 299 || this.status < 200) return false;
    return (this.api() === 'search') || (this.api() === "document" && this.method() === 'GET');
  }, this);

  this.statusGroup = ko.computed(function () {
    this.status.peek();
    this.state.peek();
    return request.statusGroup();
  }, this);
};

Hammer.HistoricalRequestsVM = function (requests) {
  this.requests = kb.collectionObservable(requests, {view_model: Hammer.HistoricalRequestVM})
}

// Initialization

$(function () {
  Hammer.Data.history = new Hammer.RequestHistory();
  Hammer.Data.current = new Hammer.Request();
  Hammer.Data.indexes = new Hammer.Indexes;

  // The Current Request
  var curReqVM = new Hammer.CurrentRequestVM(Hammer.Data.current);
  ko.applyBindings(curReqVM, $('#current-request')[0]);

  ko.applyBindings(new Hammer.ClearHistoryVM, $('#clear-request-history')[0]);
    
  // The list of past requests
  var histReqsVM = new Hammer.HistoricalRequestsVM(Hammer.Data.history);
  ko.applyBindings(histReqsVM, $('#historical-reqs')[0]);
  
  // Datalist for indexes
  var indexesDLVM = new Hammer.IndexesVM(Hammer.Data.indexes);
  ko.applyBindings(indexesDLVM, $('#pathauto')[0]);
});
