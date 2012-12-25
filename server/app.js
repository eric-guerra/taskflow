'use strict';

var path = require('path');
var express = require('express');
var validateTask = require('./validate').validateTask;
var STATUSES = require('./validate').STATUSES;

function wrap(fn) {
  return function (req, res, next) { Promise.resolve(fn(req, res, next)).catch(next); };
}

function createApp(repo) {
  var app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  var api = express.Router();

  api.get('/tasks', wrap(async function (req, res) {
    var filter = {};
    if (req.query.status) {
      if (STATUSES.indexOf(req.query.status) < 0) return res.status(400).json({ errors: { status: 'unknown status' } });
      filter.status = req.query.status;
    }
    if (req.query.tag) filter.tag = String(req.query.tag).toLowerCase();
    if (req.query.q) filter.q = String(req.query.q);
    res.json(await repo.list(filter));
  }));

  api.post('/tasks', wrap(async function (req, res) {
    var result = validateTask(req.body, false);
    if (Object.keys(result.errors).length) return res.status(422).json({ errors: result.errors });
    var task = await repo.create(result.value);
    res.status(201).location('/api/tasks/' + task.id).json(task);
  }));

  api.get('/tasks/:id', wrap(async function (req, res) {
    var task = await repo.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'not_found' });
    res.json(task);
  }));

  // Backbone's save() sends PUT with the full model; PATCH is used for partial updates (save(attrs, {patch:true})).
  function update(partial) {
    return wrap(async function (req, res) {
      var body = Object.assign({}, req.body);
      ['id', 'version', 'createdAt', 'updatedAt', 'completedAt'].forEach(function (k) { delete body[k]; });
      var result = validateTask(body, partial);
      if (Object.keys(result.errors).length) return res.status(422).json({ errors: result.errors });

      var ifMatch = req.get('If-Match');
      var expected = ifMatch !== undefined ? Number(String(ifMatch).replace(/"/g, '')) : undefined;
      if (expected !== undefined && !Number.isInteger(expected)) return res.status(400).json({ error: 'bad If-Match' });

      var out = await repo.update(req.params.id, result.value, expected);
      if (out.error === 'not_found') return res.status(404).json({ error: 'not_found' });
      if (out.error === 'conflict') return res.status(409).json({ error: 'conflict', current: out.current });
      res.set('ETag', '"' + out.task.version + '"').json(out.task);
    });
  }
  api.put('/tasks/:id', update(false));
  api.patch('/tasks/:id', update(true));

  api.delete('/tasks/:id', wrap(async function (req, res) {
    if (!(await repo.remove(req.params.id))) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  }));

  // Reorder after drag-and-drop: body is the full ordered list of ids.
  api.post('/tasks/reorder', wrap(async function (req, res) {
    var ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.some(function (id) { return typeof id !== 'string'; })) {
      return res.status(422).json({ errors: { ids: 'ids must be an array of task ids' } });
    }
    for (var i = 0; i < ids.length; i++) {
      var out = await repo.update(ids[i], { order: i + 1 });
      if (out.error) return res.status(404).json({ error: 'not_found', id: ids[i] });
    }
    res.json(await repo.list({}));
  }));

  api.get('/stats', wrap(async function (req, res) {
    var tasks = await repo.list({});
    var today = new Date().toISOString().slice(0, 10);
    var stats = { total: tasks.length, overdue: 0, byStatus: { todo: 0, doing: 0, done: 0 } };
    tasks.forEach(function (t) {
      stats.byStatus[t.status]++;
      if (t.due && t.due < today && t.status !== 'done') stats.overdue++;
    });
    res.json(stats);
  }));

  app.use('/api', api);

  app.use(function (err, req, res, next) {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
    console.error(err);
    res.status(500).json({ error: 'internal' });
  });

  return app;
}

module.exports = createApp;
