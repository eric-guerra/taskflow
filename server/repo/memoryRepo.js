'use strict';

var crypto = require('crypto');

/**
 * In-memory task repository. Same async contract as MongoRepo:
 *   list(filter) create(data) get(id) update(id, patch, expectedVersion) remove(id)
 * `version` supports optimistic concurrency: an update with a stale version fails with conflict.
 */
function MemoryRepo(now) {
  this.tasks = new Map();
  this.now = now || function () { return new Date().toISOString(); };
}

function matches(task, filter) {
  if (filter.status && task.status !== filter.status) return false;
  if (filter.tag && task.tags.indexOf(filter.tag) < 0) return false;
  if (filter.q) {
    var q = filter.q.toLowerCase();
    if (task.title.toLowerCase().indexOf(q) < 0 && task.notes.toLowerCase().indexOf(q) < 0) return false;
  }
  return true;
}

MemoryRepo.prototype.list = async function (filter) {
  filter = filter || {};
  return Array.from(this.tasks.values())
    .filter(function (t) { return matches(t, filter); })
    .sort(function (a, b) { return a.order - b.order || a.createdAt.localeCompare(b.createdAt); })
    .map(function (t) { return Object.assign({}, t); });
};

MemoryRepo.prototype.create = async function (data) {
  var maxOrder = 0;
  this.tasks.forEach(function (t) { if (t.order > maxOrder) maxOrder = t.order; });
  var ts = this.now();
  var task = Object.assign({ order: maxOrder + 1 }, data, {
    id: crypto.randomBytes(12).toString('hex'),
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    completedAt: data.status === 'done' ? ts : null
  });
  this.tasks.set(task.id, task);
  return Object.assign({}, task);
};

MemoryRepo.prototype.get = async function (id) {
  var t = this.tasks.get(id);
  return t ? Object.assign({}, t) : null;
};

MemoryRepo.prototype.update = async function (id, patch, expectedVersion) {
  var t = this.tasks.get(id);
  if (!t) return { error: 'not_found' };
  if (expectedVersion !== undefined && expectedVersion !== t.version) return { error: 'conflict', current: Object.assign({}, t) };
  var ts = this.now();
  var next = Object.assign({}, t, patch, { version: t.version + 1, updatedAt: ts });
  if (patch.status === 'done' && t.status !== 'done') next.completedAt = ts;
  if (patch.status && patch.status !== 'done') next.completedAt = null;
  this.tasks.set(id, next);
  return { task: Object.assign({}, next) };
};

MemoryRepo.prototype.remove = async function (id) {
  return this.tasks.delete(id);
};

MemoryRepo.prototype.close = async function () {};

module.exports = MemoryRepo;
