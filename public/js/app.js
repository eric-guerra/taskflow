/* global Backbone, TaskFlow */
(function () {
  'use strict';

  var Router = Backbone.Router.extend({
    routes: {
      '': 'all',
      'status/:status': 'byStatus',
      'tag/:tag': 'byTag'
    },
    all: function () { app.setFilter({}); },
    byStatus: function (status) { app.setFilter({ status: status }); },
    byTag: function (tag) { app.setFilter({ tag: tag }); }
  });

  var tasks = new TaskFlow.Tasks();
  var app = new TaskFlow.AppView({ collection: tasks });

  tasks.fetch({ reset: true }).done(function () {
    new Router();
    Backbone.history.start();
  });
})();
