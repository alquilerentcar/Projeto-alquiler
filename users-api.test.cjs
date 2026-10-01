const {test}=require('node:test'),assert=require('node:assert/strict');test('legacy users API is closed',async()=>{await assert.rejects(require('./users-api.js')({},{}),error=>error.status===410);});
