import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDrafts} from '../preview/drafts.js';
const fixture=()=>{let value=0;const statuses=[];const history=createDrafts({snapshot:()=>({project:{value},ui:{currentId:'a'},images:[]}),status:s=>statuses.push(s),historyChanged:()=>{}});history.seed();return{history,statuses,set:n=>{value=n},install:async p=>{value=p.value},get:()=>value};};
test('preview keeps real session history without claiming persistent saves',async()=>{
 const f=fixture();f.set(1);assert(f.history.mark());assert(f.history.pending);await f.history.flush();assert(f.history.pending);assert(f.statuses.every(s=>!s.includes('已保存')));
 f.history.backedUp();assert(!f.history.pending);f.set(2);f.history.mark();await f.history.travel(-1,f.install);assert.equal(f.get(),1);assert(f.history.pending);await f.history.travel(1,f.install);assert.equal(f.get(),2);
});
test('preview failed installation restores the previous project and history cursor',async()=>{
 const f=fixture();f.set(1);f.history.mark();let first=true;await assert.rejects(f.history.travel(-1,async p=>{await f.install(p);if(first){first=false;throw Error('render failed')}}));assert.equal(f.get(),1);assert(f.history.canUndo);assert(!f.history.canRedo);
});
test('preview history keeps ten changes, merges inputs and clears a redo branch',async()=>{
 const f=fixture();for(let i=1;i<=14;i++){f.set(i);f.history.mark();f.history.end();}let count=0;while(f.history.canUndo){await f.history.travel(-1,f.install);count++;}assert.equal(count,10);f.set(50);f.history.mark('text');f.set(51);f.history.mark('text');assert(!f.history.canRedo);await f.history.travel(-1,f.install);assert.equal(f.get(),4);
});
