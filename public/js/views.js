/* global Backbone, _, TaskFlow */
(function () {
  'use strict';

  TaskFlow.TaskView = Backbone.View.extend({
    tagName: 'li',
    className: 'task',
    template: _.template($('#task-template').html()),

    events: {
      'change .toggle': 'toggle',
      'change .status': 'changeStatus',
      'dblclick .title': 'edit',
      'blur .edit': 'finishEdit',
      'keydown .edit': 'editKey',
      'click .destroy': 'destroy',
      'dragstart': 'dragStart',
      'dragover': 'dragOver',
      'drop': 'drop'
    },

    initialize: function () {
      this.listenTo(this.model, 'change', this.render);
      this.listenTo(this.model, 'destroy', this.remove);
      this.$el.attr('draggable', true);
    },

    render: function () {
      var data = _.extend(this.model.toJSON(), { overdue: this.model.isOverdue() });
      this.$el.html(this.template(data))
        .toggleClass('done', data.status === 'done')
        .attr('data-id', this.model.id);
      return this;
    },

    save: function (attrs) {
      var model = this.model;
      var previous = model.pick(_.keys(attrs));
      model.save(attrs, {
        patch: true,
        wait: false,
        error: function (m, xhr) {
          if (xhr.status === 409 && xhr.responseJSON) {
            model.set(xhr.responseJSON.current);
            TaskFlow.flash('Someone else changed this task; showing the latest version.');
          } else {
            model.set(previous);
            TaskFlow.flash('Could not save: ' + (xhr.responseJSON ? JSON.stringify(xhr.responseJSON.errors || xhr.responseJSON) : xhr.statusText));
          }
        }
      });
    },

    toggle: function () { this.save({ status: this.model.get('status') === 'done' ? 'todo' : 'done' }); },
    changeStatus: function (e) { this.save({ status: $(e.target).val() }); },

    edit: function () {
      var $title = this.$('.title');
      $('<input class="edit" maxlength="140">').val(this.model.get('title')).replaceAll($title).focus().select();
    },

    editKey: function (e) {
      if (e.which === 13) this.finishEdit(e);
      if (e.which === 27) this.render();
    },

    finishEdit: function (e) {
      var value = $.trim($(e.target).val());
      if (value && value !== this.model.get('title')) this.save({ title: value });
      else this.render();
    },

    destroy: function () { this.model.destroy({ wait: true }); },

    dragStart: function (e) {
      e.originalEvent.dataTransfer.setData('text/plain', this.model.id);
      e.originalEvent.dataTransfer.effectAllowed = 'move';
    },
    dragOver: function (e) { e.preventDefault(); },
    drop: function (e) {
      e.preventDefault();
      var draggedId = e.originalEvent.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== this.model.id) this.trigger('reorder', draggedId, this.model.id);
    }
  });

  TaskFlow.AppView = Backbone.View.extend({
    el: '#app',
    events: {
      'submit #new-task': 'create',
      'input #search': 'search'
    },

    initialize: function (options) {
      this.filter = { status: '', tag: '', q: '' };
      this.listenTo(this.collection, 'add remove reset sort change', _.debounce(this.render, 0));
      this.listenTo(this.collection, 'add remove reset change:status', this.refreshStats);
      this.refreshStats();
    },

    setFilter: function (filter) {
      this.filter = _.extend({ status: '', tag: '', q: this.filter.q }, filter);
      this.$('#filters a').removeClass('active').filter('[data-status="' + this.filter.status + '"]').addClass('active');
      this.render();
    },

    visible: function () {
      var f = this.filter;
      return this.collection.filter(function (t) {
        if (f.status && t.get('status') !== f.status) return false;
        if (f.tag && !_.contains(t.get('tags'), f.tag)) return false;
        if (f.q && (t.get('title') + ' ' + t.get('notes')).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
        return true;
      });
    },

    render: function () {
      var $list = this.$('#task-list').empty();
      var self = this;
      _.each(this.visible(), function (task) {
        var view = new TaskFlow.TaskView({ model: task });
        self.listenTo(view, 'reorder', self.reorder);
        $list.append(view.render().el);
      });
      if (!$list.children().length) $list.append('<li class="empty">Nothing here.</li>');
      return this;
    },

    create: function (e) {
      e.preventDefault();
      var form = e.target;
      var parsed = TaskFlow.parseQuickAdd(form.title.value);
      var task = new TaskFlow.Task(_.extend(parsed, { priority: form.priority.value, due: form.due.value || null }));
      if (!task.isValid()) { TaskFlow.flash(task.validationError); return; }
      this.collection.create(task, {
        wait: true,
        success: function () { form.reset(); },
        error: function (m, xhr) { TaskFlow.flash(JSON.stringify((xhr.responseJSON || {}).errors || xhr.statusText)); }
      });
    },

    search: _.debounce(function (e) {
      this.filter.q = $(e.target).val();
      this.render();
    }, 150),

    reorder: function (draggedId, targetId) {
      var ids = this.collection.pluck('id');
      ids = _.without(ids, draggedId);
      ids.splice(_.indexOf(ids, targetId), 0, draggedId);
      this.collection.reorder(ids);
    },

    refreshStats: _.debounce(function () {
      var $stats = this.$('#stats');
      $.getJSON('/api/stats', function (s) {
        $stats.text(s.byStatus.todo + ' to do · ' + s.byStatus.doing + ' doing · ' + s.byStatus.done + ' done' +
          (s.overdue ? ' · ' + s.overdue + ' overdue' : ''));
      });
    }, 100)
  });

  TaskFlow.flash = function (message) {
    $('#error').text(message).show().delay(4000).fadeOut();
  };
})();
