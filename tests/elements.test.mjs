import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addVariant,validateProject} from '../web/state.js';
import * as elements from '../web/elements.js';
import {pruneMedia} from '../web/shared-content.js';
import {syncGroupFromVariant,syncVariantChanges} from '../web/size-sync.js';
import {draftSnapshot} from '../web/drafts.js';
const data='data:image/png;base64,AAAA';
function fixture(){const p=createProject();for(const size of [[300,250],[600,500],[300,600],[640,640]])addVariant(p,...size);return p;}
test('add each type twice with independent content, shared IDs and isolated sizes',()=>{
 const p=fixture(),[a,b,c,d]=p.variants;d.locked=true;
 assert.equal(typeof elements.addElement,'function');
 for(const type of ['text','image','button'])for(let i=0;i<2;i++)elements.addElement(p,a.id,type,type==='image'?{data,width:100,height:50}:{},true);
 assert.equal(a.elements.length,6);assert.equal(b.elements.length,6);assert.equal(c.elements.length,0);assert.equal(d.elements.length,0);
 assert.deepEqual(a.elements.map(e=>e.id),b.elements.map(e=>e.id));assert.equal(new Set(a.elements.map(e=>e.id)).size,6);
 assert.equal(Object.keys(p.media).length,1);assert.equal(a.elements[2].media,a.elements[3].media);
 elements.editElement(p,a.id,a.elements[0].id,{text:'独立文字'},false);assert.equal(b.elements[0].text,'新增文字');assert.equal(a.elements[1].text,'新增文字');
 assert.equal(validateProject(p).variants[0].elements.length,6);
});
test('turning sync back on edits existing objects only; size and legacy group locks survive',()=>{
 const p=fixture(),[a,b]=p.variants,id=elements.addElement(p,a.id,'text',{},false);
 elements.editElement(p,a.id,id,{text:'只在当前'},true);assert.equal(b.elements.length,0);
 p.lockedGroups=['自定义'];const custom=addVariant(p,301,251);elements.addElement(p,custom.id,'button',{},true);assert.equal(a.elements.length,1);
 const count=b.elements.length;a.locked=true;elements.addElement(p,a.id,'text',{},true);assert.equal(b.elements.length,count);
});
test('new size and group overwrite scale layouts, without sharing mutable objects',()=>{
 const p=fixture(),a=p.variants[0],id=elements.addElement(p,a.id,'button',{},false);a.elements[0].x=30;a.elements[0].y=25;a.elements[0].style.fontSize=20;
 const newSize=addVariant(p,900,750);assert.equal(newSize.elements[0].x,90);assert.equal(newSize.elements[0].y,75);assert.equal(newSize.elements[0].style.fontSize,60);
 syncGroupFromVariant(p,a.id);const b=p.variants[1];assert.equal(b.elements[0].x,60);assert.equal(b.elements[0].style.fontSize,40);
 const before=structuredClone(a);a.elements[0].x+=10;a.elements[0].style.color='#ff0000';syncVariantChanges(p,before,a,{layerId:id});assert.equal(b.elements[0].x,80);assert.equal(b.elements[0].style.color,'#ff0000');
 assert.notEqual(a.elements[0],b.elements[0]);
});
test('media survives pruning, snapshots and JSON reopen, then is collected after last reference',()=>{
 const p=fixture(),a=p.variants[0];elements.addElement(p,a.id,'image',{data,width:100,height:50},true);const ref=a.elements[0].media;
 pruneMedia(p);assert.equal(p.media[ref],data);p.variants.splice(0,1);pruneMedia(p);assert.equal(p.media[ref],data);
 const snap=draftSnapshot(p,{});assert.equal(snap.project.media[ref],null);for(const i of snap.images)i.target[i.key]=i.data;
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(snap.project))),validateProject(p));
 for(const v of p.variants)v.elements=[];pruneMedia(p);assert.equal(p.media[ref],undefined);
});
test('invalid image, duplicate IDs, dangling media and unsafe layout are rejected atomically',()=>{
 const p=fixture(),a=p.variants[0],before=structuredClone(p);
 assert.throws(()=>elements.addElement(p,a.id,'image',{data:'https://invalid',width:1,height:1},true));assert.deepEqual(p,before);
 const id=elements.addElement(p,a.id,'text',{},false);const bad=structuredClone(p);bad.variants[0].elements.push(structuredClone(bad.variants[0].elements[0]));assert.throws(()=>validateProject(bad));
 const layout=structuredClone(p);layout.variants[0].elements[0].x=Infinity;assert.throws(()=>validateProject(layout));
 elements.addElement(p,a.id,'image',{data,width:10,height:20},false);delete p.media[a.elements[1].media];assert.throws(()=>validateProject(p));
});
test('added layers move, resize and hit in paint order without moving legacy text',async()=>{
 const {moveLayer,hitTest}=await import('../web/canvas-editor.js'),{resizeLayer}=await import('../web/layer-geometry.js');
 const p=fixture(),v=p.variants[0],id=elements.addElement(p,v.id,'text',{},false),before=structuredClone(v),e=v.elements[0];
 moveLayer(v,id,before,20,10);assert.equal(e.x,50);assert.equal(e.y,35);assert.equal(v.textLayers.title.dx,0);
 const frame={x:50,y:35,w:180,h:30};resizeLayer(v,id,structuredClone(v),frame,'se',180,30);assert.equal(e.style.scaleX,2);assert.equal(e.style.scaleY,2);
 assert.equal(hitTest({added:[{id,hitRects:[frame]}],layers:{title:{hitRects:[frame]}}},v,60,40),id);
});
test('each added type synchronizes corner scaling with independent axis ratios and fixed opposite edges',async()=>{
 const {resizeLayer}=await import('../web/layer-geometry.js');
 for(const type of ['text','button','image']){
  const p=fixture(),a=p.variants[0],b=p.variants[1],id=elements.addElement(p,a.id,type,type==='image'?{data,width:100,height:50}:{},true),ea=a.elements[0],eb=b.elements[0],sb=eb.style||eb;
  sb.scaleX=2;sb.scaleY=.5;const before=structuredClone(a),fa={x:30,y:25,w:100,h:40},fb={x:60,y:50,w:400,h:40},next=resizeLayer(a,id,before,fa,'nw',20,8);
  const oldB=structuredClone(eb);syncVariantChanges(p,before,a,{resize:'nw',layerId:id,startFrame:fa,frame:next,frames:{[b.id]:fb}});
  const own=b.elements[0],style=own.style||own;assert.ok(Math.abs(style.scaleX-1.6)<1e-9);assert.ok(Math.abs(style.scaleY-.4)<1e-9);
  assert.ok(Math.abs(own.x-oldB.x-80)<1e-9);assert.ok(Math.abs(own.y-oldB.y-8)<1e-9);validateProject(p);
 }
});
test('import rejects one shared ID used for different types across dimensions',()=>{
 const p=fixture(),id=elements.addElement(p,p.variants[0].id,'text',{},true),b=p.variants[1];
 Object.assign(b.elements[0],{type:'image',media:'m1',width:100,height:50,scaleX:1,scaleY:1});p.media={m1:data};
 assert.throws(()=>validateProject(p),/类型|元素/);
});
test('a rejected added-layer gesture restores its starting layout',async()=>{
 const {resizeLayer}=await import('../web/layer-geometry.js'),p=fixture(),v=p.variants[0],id=elements.addElement(p,v.id,'image',{data,width:100,height:50},false);v.elements[0].x=-5000;const start=structuredClone(v),frame={x:-5000,y:25,w:150,h:75};
 resizeLayer(v,id,start,frame,'w',-20,0);assert.notDeepEqual(v,start);
 resizeLayer(v,id,start,frame,'w',-1000000,0);assert.deepEqual(v,start);
});
test('content edits reject fields that do not belong to the selected element type',()=>{
 const p=fixture(),a=p.variants[0],textId=elements.addElement(p,a.id,'text',{},false),imageId=elements.addElement(p,a.id,'image',{data,width:100,height:50},false),before=structuredClone(p);
 assert.throws(()=>elements.editElement(p,a.id,textId,{media:a.elements[1].media},true));
 assert.throws(()=>elements.editElement(p,a.id,imageId,{text:'错误字段'},true));assert.deepEqual(p,before);
});
test('image aspect and existing axis deformation survive add, size inheritance and group overwrite',()=>{
 const p=createProject(),a=addVariant(p,300,250),b=addVariant(p,640,640);elements.addElement(p,a.id,'image',{data,width:100,height:50},true);
 assert.equal(b.elements[0].width/b.elements[0].height,2);assert.equal(b.elements[0].width,320);
 a.elements[0].scaleX=2;a.elements[0].scaleY=.5;
 const c=addVariant(p,1080,1080);assert.equal(c.elements[0].width/c.elements[0].height,2);assert.equal(c.elements[0].scaleX/c.elements[0].scaleY,4);
 syncGroupFromVariant(p,a.id);assert.equal(b.elements[0].width/b.elements[0].height,2);assert.equal(b.elements[0].scaleX/b.elements[0].scaleY,4);
});
