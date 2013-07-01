Hammer = {
  Data: {},
  Util: {}
};

Hammer.Util.autoTextArea = function (ta) {
  var oldh = parseInt(ta.style.height);
  var height = (ta.scrollHeight);
  var capped = (height > 200) ? 200 : height;
  ta.style.height = capped + 'px';

  // Chrome adds an extra 4px. This fixes that bug
  if (parseInt(ta.style.height) - oldh < 6) {
    ta.style.height = oldh + 'px';
  }
};

Hammer.Request = Backbone.Model.extend({
  defaults: function () {
    return {
      started: null,
      ended: null,
      state: 'fresh', 
      method: 'GET',
      server: 'http://localhost:9200',
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
    
    if (parts.length === 3 && last.match(/^[^_].+$/)) {
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
  url: function () {
    return this.get('method') + '/' + this.get('path');
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
    
    $.ajax(
      this.url(),
      {
        type: this.get('method'),
        data: body,
        processData: false
      }
    ).success(
      function (d,ts,xhr) {
        self.set({state: 'succeeded', response: d, status: xhr.status});
        self.trigger('complete');
        self.trigger('success');
      }
    ).error(
      function (xhr) {
        self.set({state: 'errored', response: xhr.responseText, status: xhr.status});
        self.trigger('complete');
        self.trigger('error');
    }).done(
      function (xhr) {
        self.set('ended', Date.now());
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
      request.save();
      request.off('complete', adder);
    };
    request.on('complete', adder, this);
  },
  comparator: function (request) {
    return(- request.get('started'));
  }
});

ko.bindingHandlers.autoTextArea = {
  update: function(ta, valueAccessor, allBindingsAccessor) {
    Hammer.Util.autoTextArea(ta);
  }
};

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
      return '';
    }
  }, this);

  this.apiSubmit = ko.computed(function () {
    var type = (this.path().substr(0,0) + request.api());
    if (type === 'null') 
      type = '';
    else 
      type = ' ' + type.toUpperCase() + '';
    return 'Execute ' + this.method() + type.toUpperCase() + $('<span> (&#9166; or CTRL+&#9166;)</span>').text();
  }, this);

  this.updatePath = function (vm, e) {
    request.set('path', $(e.currentTarget).val());
    request.apiGuessSettings();
    return true;
  }

  this.url = ko.computed(function (self) {
    return request.url();
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

  this.responseFmt = ko.computed(function() {
    var respJSON;
    var respStr;
    if (_.isString(this.response())) {
      try {
        respJSON = JSON.parse(this.response())
      } catch (ex) {
        respStr = this.response();
      }
    } else {
      respJSON = this.response();
    }
    
    if (respJSON) {
      return JSON.stringify(respJSON, null, 2);
    } else {
      return respStr;
    }
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

$(function () {
  Hammer.Data.history = new Hammer.RequestHistory();
  Hammer.Data.current = new Hammer.Request();
  
  // The Current Request
  var curReqVM = new Hammer.CurrentRequestVM(Hammer.Data.current);
  ko.applyBindings(curReqVM, $('#current-request')[0]);
  
  // The list of past requests
  var histReqsVM = new Hammer.HistoricalRequestsVM(Hammer.Data.history);
  ko.applyBindings(histReqsVM, $('#request-history')[0]);
});
