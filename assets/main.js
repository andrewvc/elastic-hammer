// Autocomplete
(function() {
  "use strict";

  var WORD = /[\w$]+/, RANGE = 500;
  var keywords = "query filter from size sort field fields boost _boost properties rescore true false not to \
    index not_analyzed mapping settings mappings yes no enabled \
    match term terms operator or and type boolean bool slop window_size multi_match must should boosting positive negative negative_boost common custom_filters_score score_mode custom_score params script custom_boost_factor constant_score dis_max filtered fuzzy_like_this like_text max_query_terms fuzzy_like_this_field function_score fuzzy coordinates geo_shape has_child has_parent ids indices match_all more_like_this more_like_this_field nested prefix query_string range gt lt gte lte regexp span_first span_multi span_near clauses slop in_order span_not include exclude span_or span_term top_children _scope wildcard minimum_should_match exists geo_bounding_box geo_distance distance geo_polygon points geo_shape geohash geohash_prefix geohash_precision limit missing existence numeric_range \
    facets facet_filter histogram interval date_histogram statistical terms_stats \
    query_weight rescore_query_weight \
    integer long string float double null multi_field ip index_name precision_stepinclude_in_all geo_point lat lon validate geohash geohash_precision geohash_prefix validate validate_lat validate_lon normalize normalize_lat normalize_lon attachment \
    analyzer analysis standard simple whitespace stop keyword pattern snowball custom char_filter html_strip tokenizer stopwords keyword edgeNGram min_gram max_gram token_chars path_hierarchy letter pattern_replace \
    null_value store uax_url_email max_token_length \
  number_of_shards number_of_replicas warmers source";

  CodeMirror.registerHelper("hint", "elasticsearch", function(editor, options) {

    var word = options && options.word || WORD;
    var range = options && options.range || RANGE;
    var cur = editor.getCursor(), curLine = editor.getLine(cur.line);
    var start = cur.ch, end = start;
    while (end < curLine.length && word.test(curLine.charAt(end))) ++end;
    while (start && word.test(curLine.charAt(start - 1))) --start;
    var curWord = start != end && curLine.slice(start, end);


    var matches = _.uniq(keywords.match(new RegExp(curWord + "[A-Za-z_]+", "g")))
    if (matches) {
      return {list: matches, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end)};
    } else {
      return null;
    }
  });
})();

CodeMirror.commands.autocomplete = function(cm) {
  CodeMirror.showHint(cm, CodeMirror.hint.elasticsearch);
};

window.Hammer = {
  Data: {},
  Util: {}
};

// Global event bus
Hammer.eventBus = {}
_.extend(Hammer.eventBus, Backbone.Events);

Hammer.Util.urlPattern = /^http:\/\/\w+(\.\w+)*(:[0-9]+)?\/?(\/[.\w]*)*/;

Hammer.Util.autoTextArea = function (ta) {
  var oldh = parseInt(ta.style.height,10);
  var height = (ta.scrollHeight);
  var capped = (height > 500) ? 500 : height;
  ta.style.height = capped + 'px';

  // Chrome adds an extra 4px. This fixes that bug
  if (parseInt(ta.style.height, 10) - oldh < 6) {
    ta.style.height = oldh + 'px';
  }
};

// Print an object as yaml-ish HTML recursively
Hammer.Util.typeString = function (o) {
  if (_.isArray(o)) {
    return "[]"
  } else if (_.isObject(o)) {
    return "{}"
  }
  return "";
};

Hammer.Util.yamlRoots = {
  string: $('<span class="yaml-string">'),
  boolTrue: $('<span class="yaml-boolean true">true</span>'),
  boolFalse: $('<span class="yaml-boolean false">false</span>'),
  number: $('<span class="yaml-number">'),
  null: $('<span class="yaml-null">null</span>'),
  arrRoot: $('<ol class="yaml-array" start="0"></ol>'),
  arrElem: $('<li class="yaml-array-elem">'),
  mapRoot: $('<ul class="yaml-map">'),
  mapElem: $('<li class="yaml-map-elem">'),
  mapKey: $('<span class="yaml-map-key">'),
  anchor: $('<a>'),
  img: $('<img>'),
};

Hammer.Util.printYaml = function (obj) {
  if (_.isString(obj)) {
    var s = Hammer.Util.yamlRoots.string.clone();
    
    if (! obj.match(Hammer.Util.urlPattern)) {
      s.text('"' + obj + '"');
      return s;
    } else {
      var a = Hammer.Util.yamlRoots.anchor.clone();

      a.attr('href', obj);
      
      if (obj.match(/\.(jpg|jpeg|png|gif|bmp)$/)) {
        img = Hammer.Util.yamlRoots.img.clone();
        img.attr('src', obj);
        a.html(img)
      } else {
        a.text(obj);        
      }
      
      return a;
    }
  } else if (_.isNumber(obj)) {
    var s = Hammer.Util.yamlRoots.number.clone();
    s.text(obj);
    return s;
  } else if (_.isNull(obj)) {
    return Hammer.Util.yamlRoots.null.clone();
  } else if (_.isBoolean(obj)) {
    return (obj ? Hammer.Util.yamlRoots.boolTrue.clone() : Hammer.Util.yamlRoots.boolFalse.clone());
  } else if (_.isArray(obj)) {
    var arr = Hammer.Util.yamlRoots.arrRoot.clone();
    return arr.html(_.map(obj, function (v) {
      var li = Hammer.Util.yamlRoots.arrElem.clone(); 
      li.html(Hammer.Util.printYaml(v))
      return li;
    }));
  } else if (_.isObject(obj)) {
    var map = Hammer.Util.yamlRoots.mapRoot.clone();
    return map.html(_.map(_.keys(obj), function(k) {
      var v = obj[k];
      var li = Hammer.Util.yamlRoots.mapElem.clone();
      var key = Hammer.Util.yamlRoots.mapKey.clone();
      var ts = Hammer.Util.typeString(v);

      if (ts) {
        key.addClass("expandable");
        key.addClass("open");
        key.text("▾ " + k + ts);
      } else {
        key.text(k + ': ');
      }

      li.append(key);
      li.append(Hammer.Util.printYaml(v));
      return li;
    }));
  } else {
    console.error("Can't YAMLize obj", obj);
  }
};

// Backbone Models + Collections

Hammer.Index = Backbone.Model.extend({});
Hammer.Indexes = Backbone.Collection.extend({
  model: Hammer.Index,
  refresh: function (server) {
    var self = this;
    $.get(server + '/_cluster/state?filter_nodes=true&filter_routing_table=true&filter_blocks=true').
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
    
    if (window.location.href === "http://elastichammer.exploringelasticsearch.com") {
      server = window.location.href;
    } else if (window.location.href.match(/^file\:\/\//)) {
      server = 'http://localhost:9200'; 
    } else {
      server = window.location.href;
    }

    var pathComponents = _.compact(window.location.pathname.split('/'));
    if (pathComponents[pathComponents.length - 1] === 'elastic-hammer'
        && pathComponents[pathComponents.length - 2] === '_plugin') {
      server = window.location.protocol + '//' + window.location.host;
      if (pathComponents.length > 2) {
        server = server + '/' + (pathComponents.slice(0, pathComponents.length -2).join('/'));
      }
    } else {
     
    };
    
    return {
      started: null,
      ended: null,
      state: 'fresh',
      method: 'POST',
      server: server,
      path: '_search',
      body: '{}',
      response: null,
      status: null,
      errors: ""
    };
  },
  
  initialize: function () {
    // Changes when re-initialized with a new state
    // This helps keep codemirror in sync
    this.generation = 0;
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
    case '_analyze':
      return 'analyze';
    case '_bulk':
      return 'bulk';
    };

    if (parts.length === 3 && last.match(/^[^_].*$/)) {
      return "document";
    }

    return null;
  },
  
  reqUrl: function () {
    return this.get('server') + '/' + this.get('path');
  },
  // Return statuses rounded down to the nearest 100. i.e. 201 -> 200
  statusGroup: function () {
    if (!this.get('state')) { return null };
    if (this.get('state') === 'errored' && !this.get('status')) return 'errored';
    if (!this.get('status') === null) return null;
    var s = this.get('status');
    console.log("SG", s - (s % 100));
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
    return $.ajax(
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
    var eFuture = eClone.exec();
    Hammer.Data.last.set(eClone.attributes);
    eFuture.complete(function () {
      console.log("UPD", Hammer.Data.last);
      Hammer.Data.last.set(eClone.attributes);
    });
  },
  url: function () {
    return this.get('server') + '/' + this.get('path');
  }
});

Hammer.RequestHistory = Backbone.Collection.extend({
  localStorage: new Backbone.LocalStorage("request-history"),
  maxRecords: 120,
  model: Hammer.Request,
  initialize: function () {
    this.on('sync', function () {
      setTimeout(function () {
        Hammer.eventBus.trigger('historyLoaded');
      }, 0);
    });
    this.fetch();
    this.on('add', this.trim, this);
    this.on('add', function () {
      Hammer.eventBus.trigger('requestAdded', this);
    }, this);
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

ko.bindingHandlers.codemirror = {
  init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
    var options = valueAccessor();
    var defaultOptions = {
      extraKeys: {'Ctrl-Space': 'autocomplete'},
      foldGutter: {
    	  rangeFinder: new CodeMirror.fold.combine(CodeMirror.fold.brace)
      }
    };


    var editor = CodeMirror.fromTextArea(element, _.extend(defaultOptions, options));

    var timeout;
    editor.on("keyup", function(cm, event) {
      var popupKeyCodes = {
        "9": "tab",
        "13": "enter",
        "27": "escape",
        "33": "pageup",
        "34": "pagedown",
        "35": "end",
        "36": "home",
        "38": "up",
        "40": "down"
      }
      if(!popupKeyCodes[(event.keyCode || event.which).toString()] && !editor.state.completionActive)
      {
        if(timeout) clearTimeout(timeout);
        timeout = setTimeout(function() {
          CodeMirror.showHint(cm, CodeMirror.hint.elasticsearch, {completeSingle: false});
        }, 150);
      }            
    });

    editor.on('change', function(cm) {
      allBindingsAccessor().value(cm.getValue());
    });
    element.editor = editor;

    if(allBindingsAccessor().value()) {
      $(element).data('generation', bindingContext.$data.model().generation);
      editor.setValue(allBindingsAccessor().value());
    }
    editor.refresh();
    var wrapperElement = $(editor.getWrapperElement());

    ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
      wrapperElement.remove();
    });
  },
  update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
    var $e = $(element);
    var newBody = bindingContext.$data.model().get('body') || "";
    var oldGeneration = $e.data('generation')
    var newGeneration = bindingContext.$data.model().generation;

    if(element.editor) {
      if (oldGeneration !== newGeneration) {
        console.log("CHANGE", oldGeneration, newGeneration);
        element.editor.refresh();
        $e.data('generation', newGeneration);
        element.editor.setValue(newBody);      
      }
    }
  }
};

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

  this.completed = ko.computed(function () {
    return (this.state() === "succeeded" || this.state() == "errored");
  }, this);

  this.running = ko.computed(function () {
    return this.state() === "running";
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
    return '▶ ' + type.toUpperCase() +' (⏎ or CTRL+⏎)';
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

  // Tidy up the view by closing requests once they are no longer fresh
  // Only the most recent request stays visible unless a secondary requset is opened
  var self = this;
  var closer = function () {
    //self.prettyChosen(false)
    Hammer.eventBus.off('requestAdded', closer);
  };
  Hammer.eventBus.on('requestAdded', closer);
  Hammer.eventBus.on('historyLoaded', function () {
    //self.prettyChosen(false)
  });

  this.save = function () {
    Hammer.Data.history.add(request);
    Hammer.Data.history.sync("create", request);
  };

  this.runAgain = function () {
    Hammer.Data.current.generation += 1;
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
    var respJSON = this.responseParsed();

    if (respJSON) {
      return JSON.stringify(respJSON, null, 2);
    } else {
      return this.response();
    }
  }, this);

  var formatValue = function (value) {    
    var isString = typeof(value) === 'string'
    if (isString && value.match(urlPattern)) {
      // Cheesey HTML escape

      return {"hammer-no-escape": true, value: "<a href='" + value + "'>" + inner + '</a>'};
    } else if (isString) {
      return '"' + value + '"';
    } else {
      return value;
    }
  }
 
  this.formattedResponse = ko.computed(function () {
    return Hammer.Util.printYaml(this.response()).html();
  }, this);

  this.formattableResponse = ko.computed(function () {
    // Pretty format all non-string (JSON) responses
    return !_.isString(this.response());
  }, this);

  this.prettyChosen = ko.observable(true);
  this.prettyActivated = ko.computed(function () {
    return !this.formattableResponse() || this.prettyChosen();
  }, this);
  
  this.jsonChosen = ko.observable(false);
  this.jsonActivated = ko.computed(function () {
    return !this.formattableResponse() || this.jsonChosen();
  }, this);


  this.toggleExpansion = function (vm,e) {
    var expandable = $(e.target).closest(".expandable");
    if (expandable.hasClass('open')) {
      expandable.text("▸" + expandable.text().slice(1));
      expandable.siblings().hide();
      expandable.removeClass('open');
    } else {
      expandable.text("▾" + expandable.text().slice(1));
      expandable.siblings().show();
      expandable.addClass('open');
    }
  };

  this.togglePretty = function () {
    this.jsonChosen(false);
    this.prettyChosen(true);
  }

  this.toggleJson = function () {
    this.prettyChosen(false);
    this.jsonChosen(true);
  }

  this.shardFailure = ko.computed(function () {
    var resp = this.response();
    return (!!(resp && resp._shards && resp._shards.failures)).toString();
  }, this);
  
  this.statusGroup = ko.computed(function () {
    console.log("SGINV", "OK", request.statusGroup());
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
  Hammer.Data.last = new Hammer.Request();
  Hammer.Data.indexes = new Hammer.Indexes;

  // The current request
  var curReqVM = new Hammer.CurrentRequestVM(Hammer.Data.current);
  ko.applyBindings(curReqVM, $('#current-request')[0]);

  // The last executed Request
  var lastReqVM = new Hammer.HistoricalRequestVM(Hammer.Data.last);
  ko.applyBindings(lastReqVM, $('#last-request')[0]);


  ko.applyBindings(new Hammer.ClearHistoryVM, $('#clear-request-history')[0]);
    
  // The list of past requests
  var histReqsVM = new Hammer.HistoricalRequestsVM(Hammer.Data.history);
  ko.applyBindings(histReqsVM, $('#historical-reqs')[0]);
  
  // Datalist for indexes
  var indexesDLVM = new Hammer.IndexesVM(Hammer.Data.indexes);
  ko.applyBindings(indexesDLVM, $('#pathauto')[0]);
});
