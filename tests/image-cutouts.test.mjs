import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addVariant,validateProject} from '../web/state.js';
import {addElement,editElement,elementFor,internElementMedia,removeElement} from '../web/elements.js';
import {pruneMedia} from '../web/shared-content.js';
import {draftSnapshot} from '../web/drafts.js';
import {imageSources,applyImageSource} from '../web/image-content.js';
const a='data:image/png;base64,AAAA',b='data:image/png;base64,BBBB',cutA='data:image/png;base64,CCCC',cutB='data:image/png;base64,DDDD';
function fixture(){const p=createProject();for(const size of [[300,250],[600,500],[640,640]])addVariant(p,...size);const one=addElement(p,'300x250','image',{data:a,width:100,height:100}),two=addElement(p,'300x250','image',{data:b,width:100,height:100});return {p,one,two};}
test('each added image retains its own original and result without moving or duplicating binary data',()=>{
 const {p,one,two}=fixture(),frame=structuredClone(elementFor(p.variants[0],one));
 applyImageSource(p,'300x250',one,{original:a,cutout:cutA,usingCutout:true});
 applyImageSource(p,'300x250',two,{original:b,cutout:cutB,usingCutout:true});
 assert.deepEqual(imageSources(p,p.variants[0],one),{original:a,cutout:cutA,usingCutout:true});
 assert.deepEqual(imageSources(p,p.variants[0],two),{original:b,cutout:cutB,usingCutout:true});
 applyImageSource(p,'300x250',one,{...imageSources(p,p.variants[0],one),usingCutout:false});
 assert.equal(p.media[elementFor(p.variants[0],one).media],a);assert.equal(p.media[elementFor(p.variants[0],two).media],cutB);
 for(const k of ['x','y','width','height','scaleX','scaleY'])assert.equal(elementFor(p.variants[0],one)[k],frame[k]);
 pruneMedia(p);assert.equal(Object.keys(p.media).length,4);assert.doesNotThrow(()=>validateProject(p));
 const snapshot=draftSnapshot(p,{});for(const i of snapshot.images)i.target[i.key]=i.data;assert.deepEqual(validateProject(snapshot.project),validateProject(p));
});
test('cutout sync pairs original and result, respects locks and skips missing objects',()=>{
 const {p,one}=fixture();p.variants[1].locked=true;const before=structuredClone(p.variants[1]);
 applyImageSource(p,'300x250',one,{original:a,cutout:cutA,usingCutout:true});
 assert.deepEqual(p.variants[1],before);assert.equal(imageSources(p,p.variants[2],one).cutout,cutA);
 applyImageSource(p,'300x250',one,{original:b,cutout:cutB,usingCutout:true},false);
 assert.deepEqual(imageSources(p,p.variants[0],one),{original:b,cutout:cutB,usingCutout:true});assert.equal(imageSources(p,p.variants[2],one).original,a);
 applyImageSource(p,'300x250',one,{original:b,cutout:cutB,usingCutout:true},true);assert.equal(imageSources(p,p.variants[2],one).original,b);
});
test('replacing an image clears only its own result and prunes unused refs',()=>{
 const {p,one,two}=fixture();applyImageSource(p,'300x250',one,{original:a,cutout:cutA,usingCutout:true});
 editElement(p,'300x250',one,{media:internElementMedia(p,b)});pruneMedia(p);
 assert.deepEqual(imageSources(p,p.variants[0],one),{original:b,cutout:null,usingCutout:false});assert.equal(imageSources(p,p.variants[0],two).original,b);
 assert.ok(!Object.values(p.media).includes(cutA));removeElement(p,'300x250',one);assert.ok(Object.values(p.media).includes(b));
});
test('legacy images remain readable, invalid original/result refs are rejected',()=>{
 const {p,one}=fixture();assert.equal(imageSources(p,p.variants[0],one).original,a);assert.equal(elementFor(p.variants[0],one).originalMedia,undefined);
 p.assets.original=a;p.assets.logo=b;applyImageSource(p,'300x250','logo',{original:b,cutout:cutB,usingCutout:true});assert.equal(imageSources(p,p.variants[0],'image').original,a);assert.equal(imageSources(p,p.variants[0],'logo').cutout,cutB);
 const e=elementFor(p.variants[0],one);e.originalMedia='m999';assert.throws(()=>validateProject(p));e.originalMedia=e.media;e.cutoutMedia='m999';assert.throws(()=>validateProject(p));
});
