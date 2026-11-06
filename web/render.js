import {mediaRect} from './layer-geometry.js';
import {drawFeathered} from './feather.js';
import {layoutText,paintText,unionRects} from './text-layout.js';
import {MEDIA_KEYS,contentFor} from './shared-content.js';
import {cutoutTextVisible} from './image-content.js';
const decodedMedia=new Map();
export function variantAssets(project,variant,assets){
 const effective=contentFor(project,variant),result={...assets};
 for(const key of MEDIA_KEYS){const data=effective.assets[key];if(data&&decodedMedia.has(data))result[key]=decodedMedia.get(data);else if(data===null||Object.hasOwn(variant?.content||{},key))result[key]=null;}
 for(const e of variant?.elements||[])if(e.type==='image')result[e.id]=decodedMedia.get(project.media?.[e.media])||null;
 return result;
}
export {FONT} from './text-layout.js';
export async function loadImage(src){
 if(!src)return null;
 if(decodedMedia.has(src))return decodedMedia.get(src);
 const img=new Image();img.src=src;await img.decode();
 if(img.width*img.height>24000000||img.width<1)throw Error('素材超过2400万像素或无法解码');
 return img;
}
export async function loadAssets(project){
 const live=new Set(Object.values(project.assets).filter(Boolean));
 for(const v of project.variants)for(const e of v.elements||[])if(e.type==='image')live.add(project.media[e.media]);
 for(const content of [...project.variants.map(v=>v.content),project.sharedBaseline])for(const key of MEDIA_KEYS)if(content?.[key])live.add(project.media[content[key]]);
 await Promise.all([...live].map(async data=>{if(!decodedMedia.has(data))decodedMedia.set(data,await loadImage(data));}));
 for(const key of decodedMedia.keys())if(!live.has(key))decodedMedia.delete(key);
 return Object.fromEntries(MEDIA_KEYS.map(k=>[k,project.assets[k]?decodedMedia.get(project.assets[k]):null]));
}
function outside(r,w,h){return r.x<-.01||r.y<-.01||r.x+r.w>w+.01||r.y+r.h>h+.01;}
function overlaps(a,b){return a&&b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
export function render(canvas,p,v,assets,{pixelWidth=v.width,pixelHeight=v.height,viewport={x:0,y:0,w:v.width,h:v.height},outsideOnly=false}={}){
 if(p.sharedBaseline||p.media||Object.keys(v.content||{}).length)assets=variantAssets(p,v,assets);p=contentFor(p,v);
 canvas.width=pixelWidth;canvas.height=pixelHeight;
 const ctx=canvas.getContext('2d');ctx.setTransform(pixelWidth/viewport.w,0,0,pixelHeight/viewport.h,-viewport.x*pixelWidth/viewport.w,-viewport.y*pixelHeight/viewport.h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';const w=v.width,h=v.height,warnings=[],regions={};
 ctx.clearRect(viewport.x,viewport.y,viewport.w,viewport.h);
 if(outsideOnly){ctx.beginPath();ctx.rect(viewport.x,viewport.y,viewport.w,viewport.h);ctx.rect(0,0,w,h);ctx.clip('evenodd');}
 if(v.background!=='transparent'){
  ctx.fillStyle=v.color;
  if(v.background==='gradient'){const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,v.color);g.addColorStop(1,v.color2);ctx.fillStyle=g;}
  ctx.fillRect(0,0,w,h);
 }
 if(assets.background){
  const image=assets.background,scale=Math.max(w/image.width,h/image.height)*(v.bgZoom??1),bw=image.width*scale,bh=image.height*scale;
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.drawImage(image,(w-bw)*(v.bgX??.5),(h-bh)*(v.bgY??.5),bw,bh);ctx.restore();
  if(scale>1.01)warnings.push('背景图片分辨率低于输出尺寸，放大可能损失清晰度');
 }
 regions.added=[];regions.hitLayers=[];
 function paintImage(e){
  const image=assets[e.id];if(!image||!cutoutTextVisible(p,v,e))return;
  const r=mediaRect(v,e.id,image),main=e.cutoutParent==='image';
  if(main&&v.crop){ctx.save();ctx.beginPath();ctx.rect(v.box.x,v.box.y,v.box.w,v.box.h);ctx.clip();}
  const parent=main&&assets[p.source]?mediaRect(v,'image',assets[p.source]):r;
  drawFeathered(ctx,image,r,main&&v.crop?v.box:null,main?v.feather??0:0,{x:viewport.x,y:viewport.y,width:viewport.w,height:viewport.h},parent);
  if(main&&v.crop)ctx.restore();
  const hit=main&&v.crop?{x:Math.max(r.x,v.box.x),y:Math.max(r.y,v.box.y),w:Math.max(0,Math.min(r.x+r.w,v.box.x+v.box.w)-Math.max(r.x,v.box.x)),h:Math.max(0,Math.min(r.y+r.h,v.box.y+v.box.h)-Math.max(r.y,v.box.y))}:r;
  regions.added.push({id:e.id,frameRect:r,rect:r,hitRects:hit.w&&hit.h?[hit]:[]});
  regions.hitLayers.push(regions.added.at(-1));
  if(outside(r,w,h))warnings.push('新增图片超出画布');if(r.w>image.width*1.01||r.h>image.height*1.01)warnings.push('新增图片放大超过原始分辨率');
 }
 const associated=new Map();for(const e of v.elements||[])if(e.cutoutParent){if(!associated.has(e.cutoutParent))associated.set(e.cutoutParent,[]);associated.get(e.cutoutParent).push(e);}
 const paintTextImages=id=>{for(const e of associated.get(id)||[])paintImage(e);};
 const img=assets[p.source];
 if(img){
  const r=mediaRect(v,'image',img);
  if(!v.crop&&outside(r,w,h))warnings.push('主体图片超出画布，导出时仅保留画布内部分');
  if(v.crop){ctx.save();ctx.beginPath();ctx.rect(v.box.x,v.box.y,v.box.w,v.box.h);ctx.clip();if(outside(r,v.box.x+v.box.w,v.box.y+v.box.h)||r.x<v.box.x||r.y<v.box.y)warnings.push('已开启裁切：部分图片可能不在图片区内');}
  drawFeathered(ctx,img,r,v.crop?v.box:null,v.feather??0,{x:viewport.x,y:viewport.y,width:viewport.w,height:viewport.h});if(v.crop)ctx.restore();regions.image=r;
  if(r.w>img.width*1.01||r.h>img.height*1.01)warnings.push('主体图片放大超过原始分辨率，无法增加原有细节');
  if(Math.min(r.w,r.h)<40)warnings.push('主体显示较小，请以实际像素检查细节');
 }
 if(regions.image){const r=regions.image,hit=v.crop?{x:Math.max(r.x,v.box.x),y:Math.max(r.y,v.box.y),w:Math.max(0,Math.min(r.x+r.w,v.box.x+v.box.w)-Math.max(r.x,v.box.x)),h:Math.max(0,Math.min(r.y+r.h,v.box.y+v.box.h)-Math.max(r.y,v.box.y))}:r;regions.hitLayers.push({id:'image',hitRects:hit.w&&hit.h?[hit]:[]});}
 paintTextImages('image');
 if(assets.logo){const logo=assets.logo,r=mediaRect(v,'logo',logo);ctx.drawImage(logo,r.x,r.y,r.w,r.h);regions.logo=r;if(outside(r,w,h))warnings.push('Logo超出画布');}
 if(regions.logo)regions.hitLayers.push({id:'logo',hitRects:[regions.logo]});
 paintTextImages('logo');
 ctx.textBaseline='top';const layers=layoutText(ctx,p,v);paintText(ctx,layers.filter(l=>!l.id.startsWith('element-')),v.accent);
 regions.hitLayers.push(...layers.filter(l=>!l.id.startsWith('element-')));
 for(const e of v.elements||[]){
  if(e.cutoutParent)continue;
  if(e.type==='image'){paintImage(e);paintTextImages(e.id);}
  else {const layer=layers.find(l=>l.id===e.id);if(layer){paintText(ctx,[layer],e.accent);regions.added.push(layer);regions.hitLayers.push(layer);}}
 }
 regions.layers=Object.fromEntries([...layers,...regions.added].map(layer=>[layer.id,layer]));regions.text=unionRects(layers.map(layer=>layer.rect));
 for(const layer of layers){warnings.push(...layer.warnings);if(outside(layer.rect,w,h))warnings.push('文字或效果超出画布；请调整位置、字号或效果范围，文案未被删除');}
 if(overlaps(regions.image,regions.text))warnings.push('图片与文字区域重叠，请检查是否遮挡主体');
 return {warnings:[...new Set(warnings)],regions};
}
export function pngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG导出失败')),'image/png'));}
