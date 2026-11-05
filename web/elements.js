import {pruneMedia} from './shared-content.js';
import {defaultTextLayer,validateProject} from './state.js';
import {sameEditDomain} from './locks.js';
export const elementFor=(v,id)=>v?.elements?.find(e=>e.id===id);
export const elementType=(v,id)=>elementFor(v,id)?.type||({title:'text',subtitle:'text',cta:'button',image:'image',logo:'image'}[id]??null);
export const isTextLayer=(v,id)=>['text','button'].includes(elementType(v,id));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const limits={x:[-12000,12000],y:[-12000,12000],width:[1,12000],height:[1,12000],fontSize:[4,1000],strokeWidth:[0,30],shadowBlur:[0,100],shadowX:[-1000,1000],shadowY:[-1000,1000],separatorWidth:[.1,30]};
function ratios(source,target){const x=target.width/source.width,y=target.height/source.height;return {x,y,width:x,height:y,fontSize:Math.min(x,y),strokeWidth:Math.min(x,y),shadowBlur:Math.min(x,y),shadowX:x,shadowY:y,separatorWidth:Math.min(x,y)};}
function scaleFields(value,ratio){const next=structuredClone(value);for(const [key,factor]of Object.entries(ratio))if(typeof next[key]==='number')next[key]=clamp(next[key]*factor,...limits[key]);return next;}
export function copyElements(source,target){const ratio=ratios(source,target);target.elements=(source.elements||[]).map(e=>({...scaleFields(e,e.type==='image'?{...ratio,width:Math.min(ratio.x,ratio.y),height:Math.min(ratio.x,ratio.y)}:ratio),...(e.style?{style:scaleFields(e.style,ratio)}:{})}));}
export function internElementMedia(p,data){
 if(typeof data!=='string'||data.length>45000000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(data))throw Error('请使用有效的PNG/JPEG图片');
 p.media??={};const found=Object.keys(p.media).find(key=>p.media[key]===data);if(found)return found;
 let id;do{id=`m${p.mediaSerial=(p.mediaSerial||0)+1}`;}while(Object.hasOwn(p.media,id));p.media[id]=data;return id;
}
export function addElement(p,sourceId,type,options={},sync=true){
 if(!['text','button','image'].includes(type))throw Error('元素类型无效');
 const source=p.variants.find(v=>v.id===sourceId);if(!source)throw Error('当前尺寸不存在');
 const next=structuredClone(p),own=next.variants.find(v=>v.id===sourceId);let id;do{id='element-'+crypto.randomUUID();}while(next.variants.some(v=>elementFor(v,id)));
 const e={id,type,x:source.width*.1,y:source.height*.1};
 if(type==='image'){
  if(!Number.isFinite(options.width)||!Number.isFinite(options.height)||options.width<1||options.height<1||options.width*options.height>24000000)throw Error('图片尺寸无效');
  const fit=Math.min(source.width*.5/options.width,source.height*.5/options.height);Object.assign(e,{media:internElementMedia(next,options.data),width:options.width*fit,height:options.height*fit,scaleX:1,scaleY:1});
 }else Object.assign(e,{text:type==='button'?'新增按钮':'新增文字',accent:source.accent,style:{...defaultTextLayer(),width:source.width*.6,fontSize:Math.max(4,source.fontSize*(type==='button'?.5:1)),fontWeight:type==='button'?600:400,color:type==='button'?'#111820':source.textColor}});
 for(const target of next.variants)if(target.id===sourceId||(sync&&sameEditDomain(next,own,target))){const temp={width:source.width,height:source.height,elements:[e]},scaled={width:target.width,height:target.height};copyElements(temp,scaled);target.elements=[...(target.elements||[]),scaled.elements[0]];}
 validateProject(next);
 for(const target of p.variants)target.elements=next.variants.find(v=>v.id===target.id).elements;
 if(next.media)p.media=next.media;if(next.mediaSerial!==undefined)p.mediaSerial=next.mediaSerial;return id;
}
export function editElement(p,sourceId,id,patch,sync=true){
 const source=p.variants.find(v=>v.id===sourceId);if(!source||!elementFor(source,id))throw Error('元素不存在');
 const allowed=elementFor(source,id).type==='image'?'media':'text';
 if(Object.keys(patch).some(k=>k!==allowed))throw Error('元素内容字段无效');
 if(Object.hasOwn(patch,'text')&&(typeof patch.text!=='string'||patch.text.length>2000))throw Error('文案长度或格式无效');
 if(Object.hasOwn(patch,'media')&&!Object.hasOwn(p.media||{},patch.media))throw Error('图片素材不存在');
 for(const target of p.variants)if(target.id===sourceId||(sync&&sameEditDomain(p,source,target))){const e=elementFor(target,id);if(e)Object.assign(e,patch);}
}
export function syncElementChanges(before,after,target){
 const ratio=ratios(after,target);
 for(const next of after.elements||[]){const old=elementFor(before,next.id),own=elementFor(target,next.id);if(!old||!own)continue;
  for(const key of ['x','y','width','height','accent','scaleX','scaleY'])if(next[key]!==old[key])own[key]=typeof next[key]==='number'?['scaleX','scaleY'].includes(key)?clamp(own[key]*next[key]/old[key],.01,100):clamp(own[key]+(next[key]-old[key])*(ratio[key]||1),...limits[key]):next[key];
  if(next.style)for(const [key,value]of Object.entries(next.style))if(value!==old.style[key]){
   if(value===null||typeof value!=='number')own.style[key]=value;
   else if(['scaleX','scaleY'].includes(key))own.style[key]=clamp(own.style[key]*value/old.style[key],.01,100);
   else if(limits[key])own.style[key]=clamp((own.style[key]??0)+(value-(old.style[key]??0))*(ratio[key]||1),...limits[key]);
   else own.style[key]=value;
  }
 }
}

export function removeElement(p,sourceId,id,sync=true){
 const source=p.variants.find(v=>v.id===sourceId);if(!elementFor(source,id))throw Error('请选择新增的文字、图片或按钮');
 const targets=p.variants.filter(v=>(v.id===sourceId||(sync&&sameEditDomain(p,source,v)))&&elementFor(v,id));
 for(const target of targets)target.elements=target.elements.filter(e=>e.id!==id);
 pruneMedia(p);return targets.map(v=>v.id);
}
