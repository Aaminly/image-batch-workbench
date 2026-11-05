import {mediaRect} from './layer-geometry.js';
import {drawFeathered} from './feather.js';
import {layoutText,paintText,unionRects} from './text-layout.js';
import {MEDIA_KEYS,contentFor} from './shared-content.js';
const decodedMedia=new Map();
export function variantAssets(project,variant,assets){
 const effective=contentFor(project,variant),result={...assets};
 for(const key of MEDIA_KEYS){const data=effective.assets[key];if(data&&decodedMedia.has(data))result[key]=decodedMedia.get(data);else if(data===null||Object.hasOwn(variant?.content||{},key))result[key]=null;}
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
 const img=assets[p.source];
 if(img){
  const r=mediaRect(v,'image',img);
  if(!v.crop&&outside(r,w,h))warnings.push('主体图片超出画布，导出时仅保留画布内部分');
  if(v.crop){ctx.save();ctx.beginPath();ctx.rect(v.box.x,v.box.y,v.box.w,v.box.h);ctx.clip();if(outside(r,v.box.x+v.box.w,v.box.y+v.box.h)||r.x<v.box.x||r.y<v.box.y)warnings.push('已开启裁切：部分图片可能不在图片区内');}
  drawFeathered(ctx,img,r,v.crop?v.box:null,v.feather??0,{x:viewport.x,y:viewport.y,width:viewport.w,height:viewport.h});if(v.crop)ctx.restore();regions.image=r;
  if(r.w>img.width*1.01||r.h>img.height*1.01)warnings.push('主体图片放大超过原始分辨率，无法增加原有细节');
  if(Math.min(r.w,r.h)<40)warnings.push('主体显示较小，请以实际像素检查细节');
 }
 if(assets.logo){const logo=assets.logo,r=mediaRect(v,'logo',logo);ctx.drawImage(logo,r.x,r.y,r.w,r.h);regions.logo=r;if(outside(r,w,h))warnings.push('Logo超出画布');}
 ctx.textBaseline='top';const layers=layoutText(ctx,p,v);paintText(ctx,layers,v.accent);
 regions.layers=Object.fromEntries(layers.map(layer=>[layer.id,layer]));regions.text=unionRects(layers.map(layer=>layer.rect));
 for(const layer of layers){warnings.push(...layer.warnings);if(outside(layer.rect,w,h))warnings.push('文字或效果超出画布；请调整位置、字号或效果范围，文案未被删除');}
 if(overlaps(regions.image,regions.text))warnings.push('图片与文字区域重叠，请检查是否遮挡主体');
 return {warnings:[...new Set(warnings)],regions};
}
export function pngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG导出失败')),'image/png'));}
