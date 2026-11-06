import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto((process.env.STUDIO_URL||'http://127.0.0.1:8765')+'/style.css');
 const result=await page.evaluate(async()=>{
  const {createProject,addVariant}=await import('/state.js'),{loadAssets,render}=await import('/render.js'),{applyTextCutout,applyImageSource,imageSources}=await import('/image-content.js'),{hitTest}=await import('/canvas-editor.js');
  const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const subject=canvas(100,100),text=canvas(24,24),merged=canvas(100,100);subject.getContext('2d').fillStyle='red';subject.getContext('2d').fillRect(0,0,40,100);text.getContext('2d').fillStyle='lime';text.getContext('2d').fillRect(2,2,20,20);text.getContext('2d').clearRect(7,7,10,10);merged.getContext('2d').drawImage(subject,0,0);merged.getContext('2d').drawImage(text,68,38);
  const comparisons=[];
  for(const crop of [false,true])for(const feather of [0,.2]){
   const p=createProject();p.copy={title:'',subtitle:'',cta:''};p.assets.original=merged.toDataURL();const v=addVariant(p,100,100);v.background='transparent';v.box={x:0,y:0,w:100,h:100};v.crop=crop;v.scale=crop?1.25:1;v.feather=feather;
   applyTextCutout(p,v.id,'image',{subject:subject.toDataURL(),text:text.toDataURL(),width:100,height:100,bounds:[68,38,92,62]},false);
   const a=canvas(100,100),b=canvas(100,100);const regions=render(a,p,v,await loadAssets(p)).regions,layer=v.elements[0];
   const hit=regions.added.find(e=>e.id===layer.id);if(hit.frameRect.w>31)throw Error('text hit frame covers full image');
   const q=structuredClone(p);q.variants[0].elements=[];applyImageSource(q,v.id,'image',{original:q.assets.original,cutout:merged.toDataURL(),usingCutout:true});render(b,q,q.variants[0],await loadAssets(q));
   const x=a.getContext('2d').getImageData(0,0,100,100).data,y=b.getContext('2d').getImageData(0,0,100,100).data;
   let max=0,total=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);max=Math.max(max,d);total+=d;}
   comparisons.push({crop,feather,max,mean:total/x.length});
  }
  const p=createProject();p.copy={title:'TOP',subtitle:'',cta:''};p.assets.original=merged.toDataURL();const v=addVariant(p,200,200);v.box={x:0,y:0,w:200,h:200};applyTextCutout(p,v.id,'image',{subject:subject.toDataURL(),text:text.toDataURL(),width:100,height:100,bounds:[68,38,92,62]},false);
  const out=canvas(200,200);let assets=await loadAssets(p),regions=render(out,p,v,assets).regions,title=regions.layers.title.hitRects[0],layer=v.elements[0];Object.assign(layer,{x:title.x,y:title.y,width:title.w,height:title.h});regions=render(out,p,v,assets).regions;
  const clicked=hitTest(regions,v,title.x+title.w/2,title.y+title.h/2);
  applyImageSource(p,v.id,'image',{...imageSources(p,v,'image'),usingCutout:false});regions=render(out,p,v,await loadAssets(p)).regions;
  return {comparisons,clicked,hidden:!regions.added.some(e=>e.id===layer.id)};
 });
 assert.equal(result.clicked,'title');assert.equal(result.hidden,true);for(const c of result.comparisons){assert.ok(c.max<=2,JSON.stringify(c));assert.ok(c.mean<=.1,JSON.stringify(c));}
 console.log('PASS actual Canvas crop/feather composition, tight hit frames, visible paint-order clicks and original hides layer',JSON.stringify(result));
}finally{await browser.close();}
