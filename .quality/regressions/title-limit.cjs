const assert = require('node:assert/strict');
const {validateTask} = require('../../server/validate.js');
assert.equal(validateTask({title:'x'.repeat(140)}, false).errors.title, undefined);
assert.ok(validateTask({title:'x'.repeat(141)}, false).errors.title);
console.log('Task title boundary passed');
