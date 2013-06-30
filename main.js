Hammer = {
  Data: {}
};

Hammer.Request = Backbone.Model.extend({
  defaults: function () {
    return {
      state: 'fresh', 
      method: 'GET',
      server: 'http://localhost:9200',
      path: '',
      body: null
    };
  },
  exec: function () {
    if (this.get('state') !== 'fresh') {
      console.error("Already ran!", this.get('state'), this);
      return;
    }
    
    this.set('state', 'running');
    console.log("NOW", this.cid, this.attributes);
    var self = this;
    var m = this.get('method');
    var body = null;
    if (m === 'POST' || m === 'PUT') {
      body = this.get('body');
    }
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
      }
    );
    
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
  model: Hammer.Request,
  watch: function (request) {
    var adder = function () {
      this.add(request);
    };
    request.on('complete', adder, this);
  }
});

Hammer.CurrentRequestVM = function (request) {
  _.extend(this, kb.viewModel(request));
  
  this.exec = function (self) {
    request.execRecord();
  };

  this.bodyCapable = ko.computed(function () {
    var m = this.method();
    return (m === 'POST' || m === 'PUT')
  }, this);

  this.checkCtrlEnter = function (self,e) {
    if (e.keyCode == 13 && e.ctrlKey) {
      this.execRecord();
      return false;
    }
    return true
  }
}

$(function () {
  Hammer.Data.history = new Hammer.RequestHistory();
  Hammer.Data.current = new Hammer.Request();
  var curReqVM = new Hammer.CurrentRequestVM(Hammer.Data.current);
  ko.applyBindings(curReqVM, $('#current-request')[0]);
  
});

/*


  Hammer.RequestFormView = Backbone.View.extend({
  className: 'request-form',
  events: {
  keypress: 'keypress',
  submit: 'blockSubmit',
  change: 'change',
  "click input[type=submit]": "exec"
  },
  initialize: function () {
  this.tmpl = Hammer.templates['request-form-tmpl'];
  this.render();
  this.on('change:model',
  function (newModel) {
  this.model = newModel;
  },
  this);
  },
  render: function () {
  this.$el.html(this.tmpl(this.model.toJSON()));        
  },
  change: function () {
  this.readForm();
  var $f = this.$el.find('form');

  $f.attr('class', 'method-' + this.model.get('method').toLowerCase());
  },
  updateForm: function () {
  var $f = this.$el.find('form');

  $f.find('#ajax-method').val(this.model.get('method'));
  $f.find('#server').val(this.model.get('server'));
  $f.find('#path').val(this.model.get('path'));
  $f.find('textarea[name=body]').val(this.model.get('body'));
  },
  readForm: function () {
  var $f = this.$el.find('form');
  var attrs = {
  method: $f.find('#ajax-method').val(),
  server: $f.find('#server').val(),
  path: $f.find('#path').val(),
  body: $f.find('textarea[name=body]').val()
  };        
  this.model.set(attrs);
  },
  exec: function () {
  this.readForm();
  this.model.exec();
  },
  blockSubmit: function (e) {
  e.preventDefault();  
  },
  keypress: function (e) {
  if ($(e.target).attr('name') === 'body') {
  if (Hammer.Util.isCtrlEnter(e)) {
  e.preventDefault();
  this.exec();
  }
  } else if (e.keyCode === 13) {
  e.preventDefault();
  this.exec();
  }
  }
  });



  Hammer.RequestView = Backbone.View.extend({
  className: 'request',
  initialize: function () {
  this.tmpl = Hammer.templates['request-tmpl'];
  },
  render: function () {
  this.$el.html(this.tmpl(this.model.toJSON()));
  },
  adjustSize: function () {
  this.$el.find('textarea').each(function (i,ta) {
  console.log(ta,i,ta.scrollHeight);
  var rows = Math.ceil(ta.scrollHeight / 13);
  $(ta).attr('rows', (rows > 20 ? 20 : rows));
  });
  }
  });

  Hammer.RequestHistoryView = Backbone.View.extend({
  tagName: 'section',
  className: 'request-history',
  initialize: function (opts) {
  this.tmpl = Hammer.templates['request-history-tmpl'];
  this.history = opts.history;
  this.render();
  
  this.history.on('add', this.addRequest, this);
  },
  render: function () {
  this.$el.html(this.tmpl({content: ""}));
  },
  addRequest: function (request) {
  var requestView = new Hammer.RequestView({model: request});
  requestView.render();
  $('.requests',this.$el).prepend(requestView.el);
  requestView.adjustSize();
  }
  });

  Hammer.RequestRouter = Backbone.Router.extend({
  initialize: function () {
  this.history = new Hammer.RequestHistory;
  this.reqHistoryView = new Hammer.RequestHistoryView({history: this.history});
  
  this.curReqView = new Hammer.RequestFormView({model: new Hammer.Request});

  this.showNew();
  // why does this not work?
  this.curReqView.$el.find('#path').focus();
  
  $('#content').append(this.curReqView.el);
  $('#content').append(this.reqHistoryView.el);
  },
  showNew: function () {
  this.curReq = this.curReq ? this.curReq.clone() : new Hammer.Request;
  this.history.watch(this.curReq);
  this.curReq.set('state', 'fresh');
  this.curReqView.trigger('change:model', this.curReq);
  this.curReq.on('complete', this.showNew, this);
  }
  });

  $(function () {
  Hammer.loadTemplates();
  window.hammerRouter = new Hammer.RequestRouter;
  Backbone.history.start();
  });

*/
