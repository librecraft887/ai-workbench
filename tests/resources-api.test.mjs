import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost,onRequestGet} from '../edge-functions/api/resources.js';
test('resources reject anonymous access before any database call',async()=>{
 assert.equal((await onRequestGet({request:new Request('https://app.test/api/resources'),env:{}})).status,401);
 const r=await onRequestPost({request:new Request('https://app.test/api/resources',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({action:'publish'})}),env:{}});
 assert.equal(r.status,403);
});
