import {sameEditDomain,isGroupLocked} from './locks.js';
export const MEDIA_KEYS=['original','cutout','logo','logoOriginal','logoCutout'];
const mediaKeys=MEDIA_KEYS,copyKeys=['title','subtitle','cta'];
export const SHARED_KEYS=[...mediaKeys,...copyKeys,'source','backgrounds','backgroundMode','activeBackgroundId','exportAllBackgrounds'];
const rootValue=(p,key)=>mediaKeys.includes(key)?p.assets[key]:copyKeys.includes(key)?p.copy[key]:p[key];
function store(p,key,value){
 const intern=data=>{if(data===null)return null;p.media??={};const found=Object.keys(p.media).find(id=>p.media[id]===data);if(found)return found;let id;do{id=`m${p.mediaSerial=(p.mediaSerial||0)+1}`;}while(Object.hasOwn(p.media,id));p.media[id]=data;return id;};
 if(mediaKeys.includes(key))return intern(value);
 if(key==='backgrounds')return value.map(b=>({...b,data:intern(b.data)}));
 return structuredClone(value);
}
function restore(p,key,value){
 if(mediaKeys.includes(key))return value===null?null:p.media[value];
 if(key==='backgrounds')return value.map(b=>({...b,data:p.media[b.data]}));
 return value;
}
export function contentFor(p,v){
 const values={};for(const [key,value]of Object.entries(v?.content||{}))values[key]=restore(p,key,value);
 return {...p,...Object.fromEntries(Object.entries(values).filter(([k])=>!mediaKeys.includes(k)&&!copyKeys.includes(k))),assets:{...p.assets,...Object.fromEntries(mediaKeys.filter(k=>Object.hasOwn(values,k)).map(k=>[k,values[k]]))},copy:{...p.copy,...Object.fromEntries(copyKeys.filter(k=>Object.hasOwn(values,k)).map(k=>[k,values[k]]))}};
}
export function editShared(p,source,patch,sync=true){
 if(Object.hasOwn(patch,'logo')){const own=contentFor(p,source);patch={logoOriginal:own.assets.logoOriginal??own.assets.logo,logoCutout:own.assets.logoCutout??null,...patch};}
 if(Object.hasOwn(patch,'source')){const own=contentFor(p,source);patch={original:own.assets.original,cutout:own.assets.cutout,...patch};}
 if(['backgrounds','backgroundMode','activeBackgroundId','exportAllBackgrounds'].some(k=>Object.hasOwn(patch,k))){const own=contentFor(p,source),backgrounds=patch.backgrounds||own.backgrounds;patch={backgrounds,backgroundMode:own.backgroundMode,exportAllBackgrounds:own.exportAllBackgrounds,activeBackgroundId:backgrounds.some(b=>b.id===own.activeBackgroundId)?own.activeBackgroundId:null,...patch};}
 const targets=[...p.variants,{id:'baseline',content:p.sharedBaseline||{},baseline:true}];
 for(const [key,value]of Object.entries(patch)){
  if(!SHARED_KEYS.includes(key))throw Error('未知共享字段');
  for(const target of targets){
   const receives=target.baseline?sync&&!source.locked&&!isGroupLocked(p,source):target.id===source.id||(sync&&sameEditDomain(p,source,target));
   target.content??={};
   if(receives)delete target.content[key];
   else if(!Object.hasOwn(target.content,key))target.content[key]=store(p,key,rootValue(p,key));
   if(target.baseline)p.sharedBaseline=target.content;
  }
  if(mediaKeys.includes(key))p.assets[key]=value;else if(copyKeys.includes(key))p.copy[key]=value;else p[key]=structuredClone(value);
 }
 if(Object.hasOwn(patch,'backgrounds'))for(const target of p.variants)if(target.id===source.id||(sync&&sameEditDomain(p,source,target)))if(!patch.backgrounds.some(b=>b.id===target.backgroundPreference))target.backgroundPreference=null;
 pruneMedia(p);
}
export function inheritGroupContent(p,v){
 const peer=p.variants.find(other=>other.id!==v.id&&sameEditDomain(p,v,other));
 v.content=structuredClone(peer?.content||p.sharedBaseline||{});
}
export function pruneMedia(p){
 const used=new Set();for(const content of [...p.variants.map(v=>v.content),p.sharedBaseline])for(const [key,value]of Object.entries(content||{})){if(mediaKeys.includes(key)&&value)used.add(value);if(key==='backgrounds')for(const bg of value)used.add(bg.data);}
 for(const id of Object.keys(p.media||{}))if(!used.has(id))delete p.media[id];
}

export function copyVariantContent(p,source,targets){
 const own=contentFor(p,source),values=Object.fromEntries([...mediaKeys,...copyKeys,'source'].map(key=>[key,store(p,key,rootValue(own,key))]));
 for(const target of targets)target.content={...target.content,...values};
 pruneMedia(p);
}
