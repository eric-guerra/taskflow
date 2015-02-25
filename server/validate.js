'use strict';

var PRIORITIES = ['low', 'normal', 'high'];
var STATUSES = ['todo', 'doing', 'done'];

/**
 * Validates a task payload. With partial=true (PATCH) only present fields are checked.
 * Returns { value, errors } where errors maps field -> message.
 */
function validateTask(input, partial) {
  var errors = {};
  var value = {};
  input = input || {};

  if (!partial || 'title' in input) {
    var title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 140) errors.title = 'Title is required (max 140 characters).';
    else value.title = title;
  }
  if ('notes' in input) {
    if (typeof input.notes !== 'string' || input.notes.length > 5000) errors.notes = 'Notes must be text up to 5000 characters.';
    else value.notes = input.notes;
  } else if (!partial) {
    value.notes = '';
  }
  if (!partial || 'status' in input) {
    var status = input.status === undefined && !partial ? 'todo' : input.status;
    if (STATUSES.indexOf(status) < 0) errors.status = 'Status must be one of ' + STATUSES.join(', ') + '.';
    else value.status = status;
  }
  if (!partial || 'priority' in input) {
    var priority = input.priority === undefined && !partial ? 'normal' : input.priority;
    if (PRIORITIES.indexOf(priority) < 0) errors.priority = 'Priority must be one of ' + PRIORITIES.join(', ') + '.';
    else value.priority = priority;
  }
  if ('due' in input) {
    if (input.due === null || input.due === '') value.due = null;
    else if (typeof input.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.due) || isNaN(Date.parse(input.due))) errors.due = 'Due date must be YYYY-MM-DD.';
    else value.due = input.due;
  } else if (!partial) {
    value.due = null;
  }
  if ('tags' in input) {
    if (!Array.isArray(input.tags) || input.tags.length > 10 || input.tags.some(function (t) { return typeof t !== 'string' || !/^[\w-]{1,24}$/.test(t); })) {
      errors.tags = 'Tags must be up to 10 words (letters, digits, dashes).';
    } else {
      value.tags = Array.from(new Set(input.tags.map(function (t) { return t.toLowerCase(); })));
    }
  } else if (!partial) {
    value.tags = [];
  }
  if ('order' in input) {
    if (typeof input.order !== 'number' || !isFinite(input.order)) errors.order = 'Order must be a number.';
    else value.order = input.order;
  }
  return { value: value, errors: errors };
}

module.exports = { validateTask: validateTask, STATUSES: STATUSES, PRIORITIES: PRIORITIES };
