import {elementFor,copyElements,syncElementChanges} from './elements.js';
import {resizeLayer,preserveTextPositions,mediaRect} from './layer-geometry.js';
import {resolvedTextStyle} from './text-layout.js';
import {sameEditDomain,groupName} from './locks.js';
import {copyVariantContent} from './shared-content.js';
import {imageRect} from './state.js';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const ids=['title','subtitle','cta'];
function syncImageTransform(target,source,image,targetImage,resize){
 const sourceRect=mediaRect(source,'image',image);let limited=false;
 if(resize){
  const base=imageRect(targetImage.width,targetImage.height,target.box,target.scale),sx=target.imageScaleX??1,sy=target.imageScaleY??1,w=base.w*sx,h=base.h*sy;
  const length=Math.max(sourceRect.w,sourceRect.h)*Math.min(target.width,target.height)/Math.min(source.width,source.height);
  const min=Math.max(.01/sx,.01/sy),max=Math.min(100/sx,100/sy,12000/w,12000/h,target.crop?Infinity:target.width/w,target.crop?Infinity:target.height/h);
  if(min>max)return true;
  const wanted=length/Math.max(w,h),factor=clamp(wanted,min,max);limited=Math.abs(factor-wanted)>1e-10;
  target.imageScaleX=clamp(sx*factor,.01,100);target.imageScaleY=clamp(sy*factor,.01,100);
 }
 const base=mediaRect({...target,dx:0,dy:0},'image',targetImage);
 const dx=(sourceRect.x+sourceRect.w/2)*target.width/source.width-base.x-base.w/2,dy=(sourceRect.y+sourceRect.h/2)*target.height/source.height-base.y-base.h/2;
 target.dx=clamp(dx,-12000,12000);target.dy=clamp(dy,-12000,12000);
 return limited||target.dx!==dx||target.dy!==dy;
}

export function syncVariantChanges(project,before,after,edit={},assets={}){
 const limited=[];
 for(const target of project.variants){
  if(target.id===after.id||!sameEditDomain(project,after,target))continue;
  if(elementFor(after,edit.layerId)&&!elementFor(target,edit.layerId))continue;
  const image=assets.image,targetImage=edit.targetAssets&&Object.hasOwn(edit.targetAssets,target.id)?edit.targetAssets[target.id].image:image;
  const imageResize=edit.imageResize||['scale','imageScaleX','imageScaleY'].some(key=>before[key]!==after[key])||edit.layerId==='image'&&!!edit.resize;
  const imageMove=edit.layerId==='image'||before.dx!==after.dx||before.dy!==after.dy;
  const syncImage=image&&targetImage&&(imageMove||imageResize);
  if(syncImage&&syncImageTransform(target,after,image,targetImage,imageResize))limited.push(target.id);
  if(!syncImage&&edit.resize&&edit.frames?.[target.id]&&edit.startFrame&&edit.frame){const frame=edit.frames[target.id],ratioX=edit.frame.w/edit.startFrame.w,ratioY=edit.frame.h/edit.startFrame.h;resizeLayer(target,edit.layerId,structuredClone(target),frame,edit.resize,(ratioX-1)*frame.w*(edit.resize.includes('w')?-1:1),(ratioY-1)*frame.h*(edit.resize.includes('n')?-1:1),edit.targetAssets?.[target.id]||assets);continue;}
  syncElementChanges(before,after,target);
  const targetBefore=structuredClone(target);
  const delta=(key,ratio,min,max)=>{if(before[key]!==after[key])target[key]=clamp(target[key]+(after[key]-before[key])*ratio,min,max);};
  const multiply=(key,min,max)=>{if(before[key]!==after[key])target[key]=clamp(target[key]*after[key]/before[key],min,max);};
  if(!syncImage){delta('dx',target.box.w/before.box.w,-12000,12000);delta('dy',target.box.h/before.box.h,-12000,12000);for(const key of ['imageScaleX','imageScaleY'])multiply(key,.01,100);multiply('scale',.1,5);}
  for(const key of ['logoScaleX','logoScaleY'])multiply(key,.01,100);
  multiply('logoWidth',1,6000);
  delta('logoX',target.width/before.width,-6000,12000);delta('logoY',target.height/before.height,-6000,12000);
  for(const key of ['crop','feather','accent','background','color','color2'])if(before[key]!==after[key])target[key]=after[key];
  for(const id of ids){
   const old=resolvedTextStyle(before,id),next=resolvedTextStyle(after,id),own=resolvedTextStyle(target,id),layer=target.textLayers[id];
   for(const key of Object.keys(after.textLayers[id])){
    if(before.textLayers[id][key]===after.textLayers[id][key])continue;
    if(edit.frameEdit&&id!==edit.layerId&&key==='dy')continue;
    if(key==='dx'&&edit.layerId===id&&edit.resize?.includes('w')){
     layer.dx=clamp(own.dx+own.width-clamp(own.width*next.width/old.width,1,12000),-12000,12000);
    }else if(key==='dx'||key==='dy'){
     const ratio=key==='dx'?target.text.w/before.text.w:Math.max(1,target.height-target.text.y)/Math.max(1,before.height-before.text.y);
     layer[key]=clamp(own[key]+(next[key]-old[key])*ratio,-12000,12000);
    }else if(key==='scaleX'||key==='scaleY')layer[key]=clamp(own[key]*next[key]/old[key],.01,100);
    else if(key==='height')layer.height=next.height===null?null:clamp(next.height*target.height/after.height,1,12000);
    else if(key==='width'||key==='fontSize')layer[key]=clamp(own[key]*next[key]/old[key],key==='width'?1:4,key==='width'?12000:1000);
    else if(['strokeWidth','shadowBlur','shadowX','shadowY','separatorWidth'].includes(key)){
     const limits={strokeWidth:[0,30],shadowBlur:[0,100],shadowX:[-1000,1000],shadowY:[-1000,1000],separatorWidth:[.1,30]};
     layer[key]=clamp(own[key]+(next[key]-old[key])*own.fontSize/old.fontSize,...limits[key]);
    }else layer[key]=after.textLayers[id][key];
   }
  }
  if(edit.frameEdit&&!preserveTextPositions(target,targetBefore,edit.layerId,assets.layout))target.textLayers=targetBefore.textLayers;
 }
 return limited;
}

export function groupSyncTargets(project,source){
 return source?project.variants.filter(v=>v.id!==source.id&&groupName(v)===groupName(source)&&sameEditDomain(project,source,v)):[];
}
export function syncGroupFromVariant(project,sourceId){
 const source=project.variants.find(v=>v.id===sourceId);
 if(!source)throw Error('同步源尺寸不存在');
 const targets=groupSyncTargets(project,source);
 if(!targets.length)return [];
 for(const target of targets){
  copyElements(source,target);
  const x=target.width/source.width,y=target.height/source.height,s=Math.min(target.width,target.height)/Math.min(source.width,source.height);
  for(const key of ['scale','imageScaleX','imageScaleY','logoScaleX','logoScaleY','crop','feather','textColor','accent','background','color','color2'])target[key]=source[key];
  for(const [key,ratio,min,max]of [['dx',x,-12000,12000],['dy',y,-12000,12000],['logoX',x,-6000,12000],['logoY',y,-6000,12000],['logoWidth',s,1,6000],['fontSize',s,4,1000]])target[key]=clamp(source[key]*ratio,min,max);
  for(const key of ['box','text'])target[key]=Object.fromEntries(Object.entries(source[key]).map(([field,value])=>[field,clamp(value*(['x','w'].includes(field)?x:y),['w','h'].includes(field)?1:-12000,12000)]));
  for(const id of ids){
   const style=resolvedTextStyle(source,id),layer={...style};
   for(const [key,ratio,min,max]of [['dx',x,-12000,12000],['dy',y,-12000,12000],['width',x,1,12000],['fontSize',s,4,1000],['strokeWidth',s,0,30],['shadowBlur',s,0,100],['shadowX',s,-1000,1000],['shadowY',s,-1000,1000],['separatorWidth',s,.1,30]])layer[key]=clamp(style[key]*ratio,min,max);
   layer.height=style.height===null?null:clamp(style.height*y,1,12000);
   target.textLayers[id]=layer;
  }
 }
 copyVariantContent(project,source,targets);
 return targets.map(v=>v.id);
}
