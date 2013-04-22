'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var createApp = require('../server/app');
var MemoryRepo = require('../server/repo/memoryRepo');
var validateTask = require('../server/validate').validateTask;

function start() {
  return new Promise(function (resolve) {
    var server = createApp(new MemoryRepo()).listen(0, function () {
      var base = 'http://localhost:' + server.address().port + '/api';
      resolve({
        close: function () { return new Promise(function (r) { server.close(r); }); },
        call: async function (method, path, body, headers) {
          var res = await fetch(base + path, {
            method: method,
            headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
            body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
          });
          var text = await res.text();
          return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
        }
      });
    });
  });
}

test('CRUD lifecycle', async function (t) {
  var api = await start();
  t.after(api.close);

  var created = await api.call('POST', '/tasks', { title: '  Write report ', tags: ['Work', 'work'], due: '2012-05-01' });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, 'Write report');
  assert.deepEqual(created.body.tags, ['work']);
  assert.equal(created.body.status, 'todo');
  assert.equal(created.body.version, 1);
  var id = created.body.id;

  assert.equal((await api.call('GET', '/tasks/' + id)).body.title, 'Write report');

  var patched = await api.call('PATCH', '/tasks/' + id, { status: 'done' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, 'done');
  assert.ok(patched.body.completedAt);
  assert.equal(patched.body.version, 2);
  assert.equal(patched.headers.get('etag'), '"2"');

  var reopened = await api.call('PATCH', '/tasks/' + id, { status: 'doing' });
  assert.equal(reopened.body.completedAt, null);

  assert.equal((await api.call('DELETE', '/tasks/' + id)).status, 204);
  assert.equal((await api.call('GET', '/tasks/' + id)).status, 404);
  assert.equal((await api.call('DELETE', '/tasks/' + id)).status, 404);
});

test('optimistic concurrency with If-Match', async function (t) {
  var api = await start();
  t.after(api.close);
  var id = (await api.call('POST', '/tasks', { title: 'Shared task' })).body.id;

  var first = await api.call('PATCH', '/tasks/' + id, { title: 'Edit A' }, { 'If-Match': '"1"' });
  assert.equal(first.status, 200);
  var second = await api.call('PATCH', '/tasks/' + id, { title: 'Edit B' }, { 'If-Match': '"1"' });
  assert.equal(second.status, 409);
  assert.equal(second.body.current.title, 'Edit A');
  assert.equal((await api.call('PATCH', '/tasks/' + id, { title: 'x' }, { 'If-Match': 'abc' })).status, 400);
});

test('server-managed fields cannot be overwritten', async function (t) {
  var api = await start();
  t.after(api.close);
  var task = (await api.call('POST', '/tasks', { title: 'T' })).body;
  var res = await api.call('PUT', '/tasks/' + task.id, Object.assign({}, task, { title: 'T2', id: 'hacked', version: 99, createdAt: '1999-01-01' }));
  assert.equal(res.status, 200);
  assert.equal(res.body.id, task.id);
  assert.equal(res.body.version, 2);
  assert.equal(res.body.createdAt, task.createdAt);
});

test('filtering, search and stats', async function (t) {
  var api = await start();
  t.after(api.close);
  await api.call('POST', '/tasks', { title: 'Buy milk', tags: ['errands'] });
  await api.call('POST', '/tasks', { title: 'Fix bike', notes: 'flat tire', status: 'doing' });
  await api.call('POST', '/tasks', { title: 'Old thing', due: '2000-01-01' });

  assert.equal((await api.call('GET', '/tasks?status=doing')).body.length, 1);
  assert.equal((await api.call('GET', '/tasks?tag=ERRANDS')).body[0].title, 'Buy milk');
  assert.equal((await api.call('GET', '/tasks?q=TIRE')).body[0].title, 'Fix bike');
  assert.equal((await api.call('GET', '/tasks?status=nope')).status, 400);

  var stats = (await api.call('GET', '/stats')).body;
  assert.deepEqual(stats, { total: 3, overdue: 1, byStatus: { todo: 2, doing: 1, done: 0 } });
});

test('reorder persists order', async function (t) {
  var api = await start();
  t.after(api.close);
  var a = (await api.call('POST', '/tasks', { title: 'A' })).body.id;
  var b = (await api.call('POST', '/tasks', { title: 'B' })).body.id;
  var c = (await api.call('POST', '/tasks', { title: 'C' })).body.id;

  var res = await api.call('POST', '/tasks/reorder', { ids: [c, a, b] });
  assert.deepEqual(res.body.map(function (x) { return x.title; }), ['C', 'A', 'B']);
  assert.deepEqual((await api.call('GET', '/tasks')).body.map(function (x) { return x.title; }), ['C', 'A', 'B']);
  assert.equal((await api.call('POST', '/tasks/reorder', { ids: ['missing'] })).status, 404);
  assert.equal((await api.call('POST', '/tasks/reorder', { ids: 'nope' })).status, 422);
});

test('rejects invalid payloads', async function (t) {
  var api = await start();
  t.after(api.close);
  var res = await api.call('POST', '/tasks', { title: '', priority: 'urgent', due: '05/01/2012', tags: ['has space'] });
  assert.equal(res.status, 422);
  assert.deepEqual(Object.keys(res.body.errors).sort(), ['due', 'priority', 'tags', 'title']);
  assert.equal((await api.call('POST', '/tasks', '{not json')).status, 400);
});

test('validateTask partial mode only checks present fields', function () {
  var out = validateTask({ priority: 'high' }, true);
  assert.deepEqual(out, { value: { priority: 'high' }, errors: {} });
  assert.deepEqual(validateTask({ due: '' }, true).value, { due: null });
});
