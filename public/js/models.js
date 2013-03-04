/* global Backbone, _ */
var TaskFlow = window.TaskFlow || {};

(function () {
  'use strict';

  TaskFlow.Task = Backbone.Model.extend({
    urlRoot: '/api/tasks',
    defaults: { title: '', notes: '', status: 'todo', priority: 'normal', due: null, tags: [] },

    // Client-side mirror of the server rules so the user gets instant feedback.
    validate: function (attrs) {
      if (!attrs.title || !$.trim(attrs.title)) return 'Title is required.';
      if (attrs.title.length > 140) return 'Title is too long.';
    },

    isOverdue: function () {
      var due = this.get('due');
      return !!due && this.get('status') !== 'done' && due < new Date().toISOString().slice(0, 10);
    },

    // Optimistic concurrency: send the version we last saw.
    sync: function (method, model, options) {
      if (method === 'update' || method === 'patch') {
        options.headers = _.extend({ 'If-Match': '"' + model.get('version') + '"' }, options.headers);
      }
      return Backbone.sync.apply(this, arguments);
    }
  });

  TaskFlow.Tasks = Backbone.Collection.extend({
    model: TaskFlow.Task,
    url: '/api/tasks',
    comparator: 'order',

    reorder: function (ids) {
      var self = this;
      return $.ajax({ url: '/api/tasks/reorder', type: 'POST', contentType: 'application/json', data: JSON.stringify({ ids: ids }) })
        .done(function (tasks) { self.set(tasks, { merge: true, remove: false }); self.sort(); });
    }
  });

  /** "Buy milk #errands #home" -> { title: 'Buy milk', tags: ['errands','home'] } */
  TaskFlow.parseQuickAdd = function (text) {
    var tags = [];
    var title = text.replace(/(^|\s)#([\w-]{1,24})/g, function (_, space, tag) {
      tags.push(tag.toLowerCase());
      return '';
    }).replace(/\s+/g, ' ').trim();
    return { title: title, tags: _.uniq(tags) };
  };
})();
