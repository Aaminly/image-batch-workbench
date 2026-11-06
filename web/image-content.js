import {elementFor,editElement,internElementMedia} from './elements.js';
import {contentFor,editShared,pruneMedia} from './shared-content.js';

export function imageSources(p,v,id){
 const e=elementFor(v,id);
 if(e?.type==='image')return {original:p.media[e.originalMedia??e.media],cutout:e.cutoutMedia?p.media[e.cutoutMedia]:null,usingCutout:!!e.cutoutMedia&&e.media===e.cutoutMedia};
 const own=contentFor(p,v);
 if(id==='image')return {original:own.assets.original,cutout:own.assets.cutout,usingCutout:own.source==='cutout'};
 if(id==='logo')return {original:own.assets.logoOriginal??own.assets.logo,cutout:own.assets.logoCutout,usingCutout:!!own.assets.logoCutout&&own.assets.logo===own.assets.logoCutout};
 return null;
}

export function applyImageSource(p,sourceId,id,{original,cutout,usingCutout},sync=true){
 const v=p.variants.find(v=>v.id===sourceId),e=elementFor(v,id);
 if(!imageSources(p,v,id)||!original||(usingCutout&&!cutout))throw Error('图片原图或抠图结果不存在');
 if(e){
  const originalMedia=internElementMedia(p,original),cutoutMedia=cutout?internElementMedia(p,cutout):null;
  editElement(p,sourceId,id,{media:usingCutout?cutoutMedia:originalMedia,originalMedia,cutoutMedia},sync);pruneMedia(p);
 }else editShared(p,v,id==='logo'?{logo:usingCutout?cutout:original,logoOriginal:original,logoCutout:cutout}:{original,cutout,source:usingCutout?'cutout':'original'},sync);
}
