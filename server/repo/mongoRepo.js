'use strict';

var mongodb = require('mongodb');

function toApi(doc) {
  if (!doc) return null;
  var t = Object.assign({}, doc, { id: String(doc._id) });
  delete t._id;
  return t;
}

function MongoRepo(client, collection) {
  this.client = client;
  this.tasks = collection;
}

MongoRepo.connect = async function (url) {
  var client = new mongodb.MongoClient(url);
  await client.connect();
  var tasks = client.db().collection('tasks');
  await tasks.createIndex({ order: 1 });
  await tasks.createIndex({ status: 1, order: 1 });
  await tasks.createIndex({ tags: 1 });
  await tasks.createIndex({ title: 'text', notes: 'text' });
  return new MongoRepo(client, tasks);
};

function objectId(id) {
  return mongodb.ObjectId.isValid(id) ? new mongodb.ObjectId(id) : null;
}

MongoRepo.prototype.list = async function (filter) {
  filter = filter || {};
  var query = {};
  if (filter.status) query.status = filter.status;
  if (filter.tag) query.tags = filter.tag;
  if (filter.q) query.$text = { $search: filter.q };
  var docs = await this.tasks.find(query).sort({ order: 1, createdAt: 1 }).toArray();
  return docs.map(toApi);
};

MongoRepo.prototype.create = async function (data) {
  var last = await this.tasks.find({}).sort({ order: -1 }).limit(1).next();
  var ts = new Date().toISOString();
  var doc = Object.assign({ order: last ? last.order + 1 : 1 }, data, {
    version: 1, createdAt: ts, updatedAt: ts, completedAt: data.status === 'done' ? ts : null
  });
  var res = await this.tasks.insertOne(doc);
  doc._id = res.insertedId;
  return toApi(doc);
};

MongoRepo.prototype.get = async function (id) {
  var _id = objectId(id);
  return _id ? toApi(await this.tasks.findOne({ _id: _id })) : null;
};

MongoRepo.prototype.update = async function (id, patch, expectedVersion) {
  var _id = objectId(id);
  if (!_id) return { error: 'not_found' };
  var current = await this.tasks.findOne({ _id: _id });
  if (!current) return { error: 'not_found' };
  if (expectedVersion !== undefined && expectedVersion !== current.version) return { error: 'conflict', current: toApi(current) };

  var ts = new Date().toISOString();
  var set = Object.assign({}, patch, { updatedAt: ts });
  if (patch.status === 'done' && current.status !== 'done') set.completedAt = ts;
  if (patch.status && patch.status !== 'done') set.completedAt = null;

  // The version predicate makes the check-and-set atomic against concurrent writers.
  var res = await this.tasks.findOneAndUpdate(
    { _id: _id, version: current.version },
    { $set: set, $inc: { version: 1 } },
    { returnDocument: 'after' }
  );
  if (!res) return { error: 'conflict', current: toApi(await this.tasks.findOne({ _id: _id })) };
  return { task: toApi(res) };
};

MongoRepo.prototype.remove = async function (id) {
  var _id = objectId(id);
  if (!_id) return false;
  return (await this.tasks.deleteOne({ _id: _id })).deletedCount === 1;
};

MongoRepo.prototype.close = function () {
  return this.client.close();
};

module.exports = MongoRepo;
