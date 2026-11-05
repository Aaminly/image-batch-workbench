import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addVariant,validateProject} from '../web/state.js';
import {syncVariantChanges} from '../web/size-sync.js';
import {mediaRect} from '../web/layer-geometry.js';
const image={width:100,height:100};
function setup(){
 const p=createProject();p.variants=[];
 const a=addVariant(p,300,250),b=addVariant(p,720,900),locked=addVariant(p,640,640),other=addVariant(p,600,900);locked.locked=true;
 a.box={x:0,y:0,w:100,h:100};b.box={x:10,y:20,w:200,h:300};
 a.dx=60;a.dy=40;b.dx=-70;b.dy=123;
 return {p,a,b,locked,other};
}
const near=(actual,want)=>assert.ok(Math.abs(actual-want)<1e-8,`${actual} != ${want}`);
const center=(v,img=image)=>{const r=mediaRect(v,'image',img);return[(r.x+r.w/2)/v.width,(r.y+r.h/2)/v.height];};
test('图片移动以实际画板中心比例同步，清除目标历史偏移而不动锁定和其他组',()=>{
 const {p,a,b,locked,other}=setup(),before=structuredClone(a),untouched=structuredClone([locked,other]),box=structuredClone(b.box);
 a.dx=100;a.dy=75;syncVariantChanges(p,before,a,{layerId:'image',targetAssets:{[b.id]:{image}}},{image});
 near(center(b)[0],.5);near(center(b)[1],.5);assert.deepEqual(b.box,box);assert.deepEqual([locked,other],untouched);validateProject(p);
});
test('单轴拖动以及拖回起点也同步完整位置，不保留另一个轴的旧误差',()=>{
 const {p,a,b}=setup(),before=structuredClone(a);a.dx=43;
 syncVariantChanges(p,before,a,{layerId:'image'},{image});near(center(b)[0],.31);near(center(b)[1],.36);
 const {p:q,a:c,b:d}=setup();syncVariantChanges(q,structuredClone(c),c,{layerId:'image'},{image});near(center(d)[0],110/300);near(center(d)[1],90/250);
});
test('文字操作不重定位主体',()=>{
 const {p,a,b}=setup(),before=structuredClone(a),saved=structuredClone(b);a.textLayers.title.color='#ff0000';syncVariantChanges(p,before,a,{}, {image});assert.equal(b.dx,saved.dx);assert.equal(b.dy,saved.dy);
});
test('缩放按画板短边换算真实大小，保持目标宽高比和精确中心',()=>{
 const {p,a,b}=setup();a.dx=100;a.dy=75;b.imageScaleX=.5;b.imageScaleY=.5;
 const before=structuredClone(a);a.scale=2;
 syncVariantChanges(p,before,a,{layerId:'image'},{image});
 const r=mediaRect(b,'image',image);near(r.w,576);near(r.h,576);near(center(b)[0],.5);near(center(b)[1],.5);
 const back=structuredClone(b);b.scale*=.5;syncVariantChanges(p,back,b,{layerId:'image'},{image});near(mediaRect(a,'image',image).w,100);
 validateProject(p);
});
test('图片手柄缩放不沿用目标历史大小或中心，其他图层不变',()=>{
 const {p,a,b}=setup();a.dx=100;a.dy=75;const before=structuredClone(a),old=mediaRect(a,'image',image),layers=structuredClone(b.textLayers);
 a.imageScaleX=a.imageScaleY=1.5;a.dx=125;a.dy=100;
 const next=mediaRect(a,'image',image);syncVariantChanges(p,before,a,{layerId:'image',resize:'se',startFrame:old,frame:next,frames:{[b.id]:mediaRect(b,'image',image)}},{image});
 near(mediaRect(b,'image',image).w,432);near(center(b)[0],175/300);near(center(b)[1],150/250);assert.deepEqual(b.textLayers,layers);
});
test('独立素材和非均匀历史缩放保留宽高比，非裁切限制后中心仍精确',()=>{
 const {p,a,b}=setup(),targetImage={width:50,height:200};a.crop=true;b.imageScaleX=2;b.imageScaleY=.5;a.dx=100;a.dy=75;
 const before=structuredClone(a);a.scale=5;
 const result=syncVariantChanges(p,before,a,{layerId:'image',targetAssets:{[b.id]:{image:targetImage}}},{image});
 const r=mediaRect(b,'image',targetImage);near(r.w/r.h,1);near(r.w,720);near(center(b,targetImage)[0],center(a)[0]);near(center(b,targetImage)[1],center(a)[1]);assert.deepEqual(result,[b.id]);validateProject(p);
});
test('裁切允许超画板缩放并使用相同比例，正常大小换源无漂移',()=>{
 const {p,a,b}=setup();a.crop=b.crop=true;const before=structuredClone(a);a.scale=4;
 assert.deepEqual(syncVariantChanges(p,before,a,{layerId:'image'},{image}),[]);near(mediaRect(b,'image',image).w,1152);
 const start=structuredClone(b);b.imageScaleX*=.5;b.imageScaleY*=.5;syncVariantChanges(p,start,b,{layerId:'image'},{image});near(mediaRect(a,'image',image).w,200);
 for(let i=0;i<10;i++){syncVariantChanges(p,structuredClone(a),a,{layerId:'image',resize:'se'},{image});syncVariantChanges(p,structuredClone(b),b,{layerId:'image',resize:'se'},{image});}near(mediaRect(a,'image',image).w,200);validateProject(p);
});
