import {elementFor,editElement,internElementMedia,addElement} from './elements.js';
import {contentFor,editShared,pruneMedia} from './shared-content.js';
import {sameEditDomain} from './locks.js';
import {mediaRect} from './layer-geometry.js';

export function imageSources(p,v,id){
 const e=elementFor(v,id);
 if(e?.type==='image')return {original:p.media[e.originalMedia??e.media],cutout:e.cutoutMedia?p.media[e.cutoutMedia]:null,usingCutout:!!e.cutoutMedia&&e.media===e.cutoutMedia};
 const own=contentFor(p,v);
 if(id==='image')return {original:own.assets.original,cutout:own.assets.cutout,usingCutout:own.source==='cutout'};
 if(id==='logo')return {original:own.assets.logoOriginal??own.assets.logo,cutout:own.assets.logoCutout,usingCutout:!!own.assets.logoCutout&&own.assets.logo===own.assets.logoCutout};
 return null;
}

export function applyImageSource(p,sourceId,id,{original,cutout,usingCutout,reprocess=false},sync=true){
 const v=p.variants.find(v=>v.id===sourceId),e=elementFor(v,id);
 if(!imageSources(p,v,id)||!original||(usingCutout&&!cutout))throw Error('图片原图或抠图结果不存在');
 for(const target of p.variants)if(target.id===sourceId||(sync&&sameEditDomain(p,v,target))){const old=imageSources(p,target,id);if(old&&(reprocess||old.original!==original||old.cutout!==cutout))target.elements=(target.elements||[]).filter(e=>e.cutoutParent!==id);}
 if(e){
  const originalMedia=internElementMedia(p,original),cutoutMedia=cutout?internElementMedia(p,cutout):null;
  editElement(p,sourceId,id,{media:usingCutout?cutoutMedia:originalMedia,originalMedia,cutoutMedia},sync);pruneMedia(p);
 }else editShared(p,v,id==='logo'?{logo:usingCutout?cutout:original,logoOriginal:original,logoCutout:cutout}:{original,cutout,source:usingCutout?'cutout':'original'},sync);
}

export function cutoutTextVisible(p,v,e){
 if(!e.cutoutParent)return true;
 const source=imageSources(p,v,e.cutoutParent);
 return !!source?.usingCutout&&source.cutout===p.media[e.cutoutResult];
}

export const MAX_IMAGE_BYTES=32*1024*1024;
export function validateTextCutoutResult(result){
 if(!result||typeof result!=='object')throw Error('文字分层结果无效');
 const {subject,text,width,height,bounds}=result;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>24000000||!Array.isArray(bounds)||bounds.length!==4||bounds.some(n=>!Number.isInteger(n))||bounds[0]<0||bounds[1]<0||bounds[2]>width||bounds[3]>height||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw Error('文字分层结果尺寸无效');
 for(const data of [subject,text]){
  if(typeof data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('文字分层图片格式无效');
  const encoded=data.slice(22),padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
  if(encoded.length%4)throw Error('文字分层图片格式无效');
  if(encoded.length/4*3-padding>MAX_IMAGE_BYTES)throw Error('抠图结果超过32 MB，原图已保留，请缩小图片后重试');
 }
}

export function applyTextCutout(p,sourceId,id,result,sync=true){
 validateTextCutoutResult(result);
 const {subject,text,width,height,bounds}=result;
 const source=p.variants.find(v=>v.id===sourceId),original=imageSources(p,source,id)?.original;
 applyImageSource(p,sourceId,id,{original,cutout:subject,usingCutout:true},sync);
 const targets=p.variants.filter(v=>(v.id===sourceId||(sync&&sameEditDomain(p,source,v)))&&imageSources(p,v,id));
 const layerId=addElement(p,sourceId,'image',{data:text,width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]},false),template=structuredClone(elementFor(source,layerId)),cutoutResult=internElementMedia(p,subject);
 for(const v of targets){
  v.elements=v.elements.filter(e=>e.id!==layerId&&e.cutoutParent!==id);
  const r=mediaRect(v,id,{width,height});
  v.elements.push({...template,x:r.x+r.w*bounds[0]/width,y:r.y+r.h*bounds[1]/height,width:r.w*(bounds[2]-bounds[0])/width,height:r.h*(bounds[3]-bounds[1])/height,cutoutParent:id,cutoutResult});
 }
 pruneMedia(p);
}
