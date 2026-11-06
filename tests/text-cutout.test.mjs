import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addVariant,validateProject} from '../web/state.js';
import {addElement,elementFor,editElement,internElementMedia,removeElement} from '../web/elements.js';
import {applyImageSource,applyTextCutout,imageSources,cutoutTextVisible,validateTextCutoutResult} from '../web/image-content.js';
import {draftSnapshot} from '../web/drafts.js';
import {mediaRect} from '../web/layer-geometry.js';
const original='data:image/png;base64,AAAA',subject='data:image/png;base64,BBBB',text='data:image/png;base64,CCCC';
const result={subject,text,width:1000,height:500,bounds:[600,100,900,200]};
test('split image limits apply to each decoded PNG, not combined base64 JSON',()=>{
 const large='data:image/png;base64,'+Buffer.alloc(24*1024*1024).toString('base64');
 assert.doesNotThrow(()=>validateTextCutoutResult({...result,subject:large,text:large}));
 const tooLarge='data:image/png;base64,'+Buffer.alloc(32*1024*1024+1).toString('base64');
 assert.throws(()=>validateTextCutoutResult({...result,subject:tooLarge}),/32 MB/);
 assert.throws(()=>validateTextCutoutResult({...result,text:tooLarge}),/32 MB/);
 assert.throws(()=>validateTextCutoutResult({...result,text:'data:image/png;base64,AA'}));
});
function fixture(){const p=createProject();for(const size of [[300,250],[600,500],[640,640],[600,900]])addVariant(p,...size);const id=addElement(p,'300x250','image',{data:original,width:1000,height:500});p.variants[2].locked=true;return {p,id};}
test('split text uses each actual parent frame, respects locks and missing parents',()=>{
 const {p,id}=fixture();elementFor(p.variants[1],id).x=87;const locked=structuredClone(p.variants[2]);
 applyTextCutout(p,'300x250',id,result);
 for(const v of p.variants.slice(0,2)){
  const e=v.elements.find(e=>e.cutoutParent===id),parent=elementFor(v,id);
  assert.equal(e.x,parent.x+parent.width*.6);assert.equal(e.y,parent.y+parent.height*.2);
  assert.equal(e.width,parent.width*.3);assert.equal(e.height,parent.height*.2);
  assert.equal(p.media[e.media],text);assert.equal(cutoutTextVisible(p,v,e),true);
 }
 assert.deepEqual(p.variants[2],locked);assert.equal(p.variants[3].elements.length,0);assert.doesNotThrow(()=>validateProject(p));
});
test('source switching hides/reveals text and repeat replaces instead of duplicating',()=>{
 const {p,id}=fixture();applyTextCutout(p,'300x250',id,result);const v=p.variants[0],first=v.elements.find(e=>e.cutoutParent===id);
 applyImageSource(p,v.id,id,{...imageSources(p,v,id),usingCutout:false});assert.equal(cutoutTextVisible(p,v,first),false);
 applyImageSource(p,v.id,id,{...imageSources(p,v,id),usingCutout:true});assert.equal(cutoutTextVisible(p,v,first),true);
 applyTextCutout(p,v.id,id,result);assert.equal(v.elements.filter(e=>e.cutoutParent===id).length,1);
 applyImageSource(p,v.id,id,{original,cutout:original,usingCutout:true});assert.equal(v.elements.filter(e=>e.cutoutParent===id).length,0);
});
test('replacement and deletion clean derived layers and media; standalone replacement detaches text',()=>{
 const {p,id}=fixture();applyTextCutout(p,'300x250',id,result);const textId=p.variants[0].elements.find(e=>e.cutoutParent===id).id;
 editElement(p,'300x250',textId,{media:internElementMedia(p,original)},false);assert.equal(elementFor(p.variants[0],textId).cutoutParent,undefined);
 editElement(p,'300x250',id,{media:internElementMedia(p,text)},false);assert.equal(p.variants[0].elements.filter(e=>e.cutoutParent===id).length,0);
 removeElement(p,'600x500',id,false);assert.equal(p.variants[1].elements.length,0);
});
test('legacy frame maps cropped text and persistence retains associations with valid references',()=>{
 const {p}=fixture();p.assets.original=original;applyTextCutout(p,'300x250','image',result,false);
 const v=p.variants[0],e=v.elements.find(e=>e.cutoutParent==='image'),r=mediaRect(v,'image',{width:1000,height:500});
 assert.equal(e.x,r.x+r.w*.6);assert.equal(e.y,r.y+r.h*.2);
 const snapshot=draftSnapshot(p,{});for(const image of snapshot.images)image.target[image.key]=image.data;
 assert.deepEqual(validateProject(snapshot.project),validateProject(p));
 e.cutoutResult='m999';assert.throws(()=>validateProject(p));
});
test('a new plain result clears text even when the PNG is identical to the split subject',()=>{
 const {p,id}=fixture();applyTextCutout(p,'300x250',id,result);
 applyImageSource(p,'300x250',id,{original,cutout:subject,usingCutout:true,reprocess:true});
 assert.equal(p.variants[0].elements.filter(e=>e.cutoutParent===id).length,0);
});
test('visible built-in text wins clicks over a lower derived image',async()=>{
 const {hitTest}=await import('../web/canvas-editor.js');const r={x:0,y:0,w:100,h:50};
 const regions={added:[{id:'element-text',hitRects:[r]}],layers:{title:{hitRects:[r]}},hitLayers:[{id:'element-text',hitRects:[r]},{id:'title',hitRects:[r]}]};
 assert.equal(hitTest(regions,{crop:false},20,20),'title');
});
