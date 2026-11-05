import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHistory} from '../web/history.js';
test('ten changes bound both directions and branching drops redo',()=>{
 const h=createHistory();h.reset({n:0});for(let n=1;n<=12;n++)h.record({n});
 assert.equal(h.states.length,11);for(let n=11;n>=2;n--)assert.deepEqual(h.move(-1),{n});assert.equal(h.move(-1),null);
 assert.deepEqual(h.move(1),{n:3});h.record({n:99});assert.equal(h.move(1),null);assert.deepEqual(h.move(-1),{n:3});
});
test('one gesture or input session is one step, same values are ignored',()=>{
 const h=createHistory();h.reset({n:0});for(let n=1;n<=20;n++)h.record({n},'drag');assert.equal(h.states.length,2);
 h.end();h.record({n:20});assert.equal(h.states.length,2);h.record({n:21},'drag');assert.equal(h.states.length,3);assert.deepEqual(h.move(-1),{n:20});
});
test('restore cursor preserves redo and isolates new state objects',()=>{
 const h=createHistory();h.reset({n:0},[{n:0},{n:1},{n:2}],1);assert.deepEqual(h.move(1),{n:2});assert.deepEqual(h.move(-1),{n:1});
});
