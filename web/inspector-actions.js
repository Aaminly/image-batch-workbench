import {elementFor} from './elements.js';
import {sameEditDomain} from './locks.js';
import {moveLayer} from './canvas-editor.js';
import {TEXT_IDS} from './layer-geometry.js';
export function centerSelection(project,sourceId,id,axis,sync,getFrame){
 if(!['x','y'].includes(axis)||(![...TEXT_IDS,'image','logo'].includes(id)&&!project.variants.some(v=>elementFor(v,id))))throw Error('请选择有效图层和居中方向');
 const source=project.variants.find(v=>v.id===sourceId);if(!source)throw Error('当前尺寸不存在');
 const targets=project.variants.filter(v=>v.id===source.id||(sync&&sameEditDomain(project,source,v)&&(!elementFor(source,id)||elementFor(v,id))));
 const changes=targets.map(v=>{
  const frame=getFrame(v);if(!frame||![frame.x,frame.y,frame.w,frame.h].every(Number.isFinite)||frame.w<=0||frame.h<=0)throw Error(`${v.id} 缺少该图层或素材，未修改任何尺寸`);
  const dx=axis==='x'?(v.width-frame.w)/2-frame.x:0,dy=axis==='y'?(v.height-frame.h)/2-frame.y:0,next=structuredClone(v);
  moveLayer(next,id,v,dx,dy);const added=elementFor(next,id),own=added||(TEXT_IDS.includes(id)?next.textLayers[id]:next),old=elementFor(v,id)||(TEXT_IDS.includes(id)?v.textLayers[id]:v),x=added?'x':id==='logo'?'logoX':'dx',y=added?'y':id==='logo'?'logoY':'dy';
  if(Math.abs(own[x]-old[x]-dx)>.001||Math.abs(own[y]-old[y]-dy)>.001)throw Error(`${v.id} 超出位置范围，未修改任何尺寸`);
  const check=getFrame(next),error=axis==='x'?check?.x+check?.w/2-v.width/2:check?.y+check?.h/2-v.height/2;
  if(!Number.isFinite(error)||Math.abs(error)>.001)throw Error(`${v.id} 无法满足居中边界，未修改任何尺寸`);
  return {v,next};
 });
 for(const {v,next}of changes)Object.assign(v,next);
 return targets.map(v=>v.id);
}
