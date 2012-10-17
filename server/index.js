'use strict';

var createApp = require('./app');
var MemoryRepo = require('./repo/memoryRepo');
var MongoRepo = require('./repo/mongoRepo');

(async function main() {
  var repo = process.env.MONGO_URL ? await MongoRepo.connect(process.env.MONGO_URL) : new MemoryRepo();
  var port = Number(process.env.PORT) || 3000;
  createApp(repo).listen(port, function () {
    console.log('TaskFlow on http://localhost:' + port);
  });
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
