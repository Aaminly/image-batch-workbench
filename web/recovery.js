import {randomUUID} from './uuid.js';
import {MEDIA_KEYS} from './shared-content.js';
import {claimPage} from './page-claim.js';
const DB='ad-studio-recovery';
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
function slots(project){return [...MEDIA_KEYS.map(key=>({target:project.assets,key})),...project.backgrounds.map(target=>({target,key:'data'})),...Object.keys(project.media||{}).map(key=>({target:project.media,key}))];}
export async function openRecovery(){
 const claim=await claimPage(),tab=claim.id;let db,existing;
 try{
  db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{req.result.createObjectStore('checkpoints');const images=req.result.createObjectStore('images',{keyPath:'key'});images.createIndex('tab','tab');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('浏览器缓存被旧页面占用，请保留当前页面并关闭旧页面后重试'));});
  existing=await request(db.transaction('images').objectStore('images').index('tab').getAll(tab));
 }catch(error){db?.close();await claim.release();throw error;}
 const known=new Map(existing.map(image=>[image.data,image.key]));let scheduled=new Set(existing.map(image=>image.key)),healthy=true;const active=new Set();
 function transaction(stores,work){
  if(!healthy)throw Error('刷新保护已暂停，请先保存项目备份后重新打开页面');
  const tx=db.transaction(stores,'readwrite',{durability:'strict'});active.add(tx);
  const done=new Promise((resolve,reject)=>{tx.oncomplete=()=>{active.delete(tx);resolve();};tx.onabort=()=>{active.delete(tx);healthy=false;for(const later of active)try{later.abort();}catch{}reject(tx.error||Error('浏览器缓存事务已中止'));};tx.onerror=()=>{};});
  try{work(tx);}catch(error){tx.abort();done.catch(()=>{});throw error;}
  return done;
 }
 function write(meta,states){
  const used=new Set(),before=scheduled;
  const done=transaction(['checkpoints','images'],tx=>{
   const images=tx.objectStore('images');
   for(const state of states)for(const image of state.images){
    let key=known.get(image.data);if(!key){key=`${tab}:${randomUUID()}`;known.set(image.data,key);}const firstUse=!used.has(key);used.add(key);
    if(!before.has(key)&&firstUse)images.put({key,tab,data:image.data});image.target[image.key]=key;
   }
   tx.objectStore('checkpoints').put({...meta,history:states.map(({project,ui})=>({project,ui}))},tab);
   for(const key of before)if(!used.has(key))images.delete(key);
  });
  scheduled=used;done.then(()=>{for(const [data,key]of known)if(!scheduled.has(key))known.delete(data);},()=>{});return done;
 }
 async function read(){
  const tx=db.transaction(['checkpoints','images']),record=await request(tx.objectStore('checkpoints').get(tab));if(!record)return null;
  if(!Array.isArray(record.history)||record.history.length<1||record.history.length>11||!Number.isInteger(record.cursor)||record.cursor<0||record.cursor>=record.history.length||!Number.isSafeInteger(record.localVersion)||record.localVersion<1||!Number.isSafeInteger(record.revision)||record.revision<0)throw Error('刷新保护记录无效，原检查点已保留');
  const pending=record.pendingCommit;if((record.id!==null&&(typeof record.id!=='string'||!/^([0-9a-f]{32})$/.test(record.id)))||(pending!==null&&(!pending||!/^([0-9a-f]{32})$/.test(pending.token)||!Number.isSafeInteger(pending.version)||pending.version<1||pending.version>record.localVersion||!Number.isSafeInteger(pending.revision)||pending.revision<0||pending.revision>record.revision)))throw Error('刷新保护提交标识无效，原检查点已保留');
  // Queue all image reads while the transaction is active; resolve shared strings once.
  const keys=new Set(record.history.flatMap(state=>slots(state.project).map(slot=>slot.target[slot.key]).filter(Boolean)));
  const images=await Promise.all([...keys].map(async key=>[key,await request(tx.objectStore('images').get(key))]));const data=new Map(images);
  for(const [key,image]of images)if(!image||image.tab!==tab||typeof image.data!=='string')throw Error('刷新保护素材缺失，已保留检查点，请勿清理浏览器数据');
  for(const [key,image]of images){known.set(image.data,key);scheduled.add(key);}
  for(const state of record.history)for(const slot of slots(state.project)){const key=slot.target[slot.key];if(key)slot.target[slot.key]=data.get(key).data;}
  return record;
 }
 function acknowledge(version,revision,token,latestVersion){
  const collect=version===latestVersion,oldKeys=scheduled;
  const done=transaction(['checkpoints','images'],tx=>{const store=tx.objectStore('checkpoints'),req=store.get(tab);req.onsuccess=()=>{
   const record=req.result;if(!record)return;
   if(record.localVersion<=version){store.delete(tab);if(collect)for(const key of oldKeys)tx.objectStore('images').delete(key);}
   else if(record.pendingCommit?.token===token){record.revision=revision;record.pendingCommit=null;store.put(record,tab);}
  };});
  // Later queued edits must upload their images again after this deletion.
  if(collect){scheduled=new Set();known.clear();}return done;
 }

 function clear(){return transaction(['checkpoints','images'],tx=>{tx.objectStore('checkpoints').delete(tab);for(const key of scheduled)tx.objectStore('images').delete(key);scheduled=new Set();known.clear();});}
 return {read,write,acknowledge,clear};
}
