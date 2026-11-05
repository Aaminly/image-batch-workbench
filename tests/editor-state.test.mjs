import {test} from 'node:test';import assert from 'node:assert/strict';import * as state from '../web/state.js';import * as backgrounds from '../web/backgrounds.js';
const data='data:image/png;base64,aGVsbG8=';
test('background quantity is limited by actual project bytes rather than a fixed image count',()=>{
 const p=state.createProject();state.addVariant(p,200,200);p.backgrounds=Array.from({length:26},(_,i)=>({id:`bg${i}`,name:`${i}.png`,data,width:200,height:200}));assert.doesNotThrow(()=>state.validateProject(p));assert.doesNotThrow(()=>state.validateBackgroundBatch(p,Array.from({length:30},()=>({name:'x.png',type:'image/png',size:100}))));
});
test('exact size wins, same ratio is used second, all duplicates are kept and unmatched is explicit',()=>{
 assert.equal(typeof backgrounds.buildAssignments,'function');const p=state.createProject();for(const [w,h]of [[200,200],[640,640],[300,250],[970,90]])state.addVariant(p,w,h);
 p.backgrounds=[{id:'s1',name:'s.png',data,width:200,height:200},{id:'s2',name:'s.png',data,width:200,height:200},{id:'large',name:'l.png',data,width:400,height:400},{id:'wide',name:'w.png',data,width:600,height:500}];
 const plan=backgrounds.buildAssignments(p);assert.deepEqual(plan.byVariant['200x200'],['s1','s2']);assert.deepEqual(plan.byVariant['640x640'],['s1','s2','large']);assert.deepEqual(plan.byVariant['300x250'],['wide']);assert.deepEqual(plan.byVariant['970x90'],[]);assert.deepEqual(plan.unmatched,['970x90']);assert.equal(plan.count,6);
});
test('legacy cross-product projects keep saved behavior and text effects default to original pixels',()=>{
 const p=state.createProject();state.addVariant(p,300,250);p.backgrounds=[{id:'bg1',name:'b.png',data}];p.activeBackgroundId='bg1';p.exportAllBackgrounds=true;delete p.backgroundMode;delete p.variants[0].textLayers;const q=state.validateProject(p);assert.equal(q.backgroundMode,'all');assert.equal(q.variants[0].textLayers.title.strokeWidth,0);assert.equal(q.variants[0].textLayers.cta.shadowEnabled,false);
 q.variants[0].textLayers.title.dx=35;q.variants[0].textLayers.title.strokeWidth=2;q.variants[0].textLayers.title.shadowEnabled=true;assert.deepEqual(state.validateProject(JSON.parse(JSON.stringify(q))),q);
 for(const patch of [{strokeWidth:Infinity},{shadowBlur:-1},{shadowOpacity:2},{shadowEnabled:'true'},{strokeColor:'red'}]){const bad=structuredClone(q);Object.assign(bad.variants[0].textLayers.subtitle,patch);assert.throws(()=>state.validateProject(bad));}
});
test('text decoration settings migrate, roundtrip and reject unsafe values',()=>{
 const p=state.createProject();state.addVariant(p,728,90);const old=p.variants[0].textLayers.title;
 for(const k of ['fontWeight','italic','underline','underlineColor','separatorColor','separatorWidth','separatorHeight'])delete old[k];
 const q=state.validateProject(p),s=q.variants[0].textLayers.title;assert.equal(s.italic,false);assert.equal(s.underline,'none');
 Object.assign(s,{fontWeight:900,italic:true,underline:'swoosh',underlineColor:'#ffee00',separatorColor:'#ffff00',separatorWidth:2,separatorHeight:.8});assert.deepEqual(state.validateProject(JSON.parse(JSON.stringify(q))),q);
 for(const patch of [{fontWeight:0},{italic:'yes'},{underline:'bad'},{underlineColor:'red'},{separatorWidth:-1},{separatorHeight:5}]){const bad=structuredClone(q);Object.assign(bad.variants[0].textLayers.title,patch);assert.throws(()=>state.validateProject(bad));}
});
test('each text layer saves independent wrapping width and rejects invalid widths',()=>{const p=state.createProject(),v=state.addVariant(p,500,300);v.textLayers.title.width=120;const q=state.validateProject(p);assert.equal(q.variants[0].textLayers.subtitle.width,null);assert.equal(q.variants[0].textLayers.title.width,120);for(const width of [0,Infinity,'100']){v.textLayers.title.width=width;assert.throws(()=>state.validateProject(p));}});
