import {MEDIA_KEYS} from './shared-content.js';
import {createHistory} from './history.js';
import {openRecovery} from './recovery.js';
export async function draftRequest(url,options={}){
 const response=await fetch(`/api/drafts${url}`,options);let data;try{data=await response.json();}catch{}
 if(!response.ok){const error=Error(data?.detail||`草稿服务错误（${response.status}）`);error.status=response.status;throw error;}
 return data;
}
function jsonOptions(method,data){return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)};}
// Strip image strings before cloning: frequent edits copy only layout, never the embedded image payload.
export function draftSnapshot(project,ui){
 const images=[],assets={},backgrounds=project.backgrounds.map(b=>{const copy={...b,data:null};if(b.data)images.push({data:b.data,target:copy,key:'data'});return copy;});
 for(const key of MEDIA_KEYS){assets[key]=null;if(project.assets[key])images.push({data:project.assets[key],target:assets,key});}
 const media=Object.fromEntries(Object.keys(project.media||{}).map(key=>[key,null]));
 const light=structuredClone({...project,assets,backgrounds,...(project.media?{media}:{})});
 for(const image of images)image.target=image.target===assets?light.assets:light.backgrounds[backgrounds.indexOf(image.target)];
 for(const [key,data]of Object.entries(project.media||{}))images.push({data,target:light.media,key});
 return {project:light,ui:structuredClone(ui),images};
}
function dataBlob(data){const [header,encoded]=data.split(',');return new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:header.includes('jpeg')?'image/jpeg':'image/png'});}
export function createDrafts({snapshot,isBusy,status,saved,historyChanged=()=>{}}){
 const history=createHistory();
 function capture(){const state=snapshot();for(const image of state.images)image.target[image.key]=image.data;return {project:state.project,ui:state.ui};}
 function seed(){history.reset(capture());ready=true;historyChanged(history);}
 function mark(group=null){if(!history.record(capture(),group))return false;touch();historyChanged(history);return true;}
 function checkpoint(){
  try{if(frozen)throw Error('原检查点尚未恢复，已禁止覆盖；请保存项目备份后重新载入缓存');lastCheckpoint=recovery.write({id,revision,localVersion:version,cursor:history.cursor,pendingCommit:inFlight},history.states.map(state=>draftSnapshot(state.project,state.ui)));}
  catch(error){lastCheckpoint=Promise.reject(error);}
  lastCheckpoint.catch(error=>status(`刷新保护失败：${error.message}；请先保存项目备份`,true));return lastCheckpoint;
 }
 function touch(){version++;backupVersion=-1;status('尚未保存');checkpoint();if(!blocked)schedule();}

 let id=null,revision=0,version=0,stored=0,timer=null,running=null,blocked=false,backupVersion=-1,refs=new Map(),recovery=null,inFlight=null,lastCheckpoint=Promise.resolve(),ready=false,frozen=false;
 async function initialize(){if(!recovery)recovery=await openRecovery();}
 function resume(record){lastCheckpoint=Promise.resolve();ready=true;frozen=false;clearTimeout(timer);id=record.id;revision=record.revision;version=record.localVersion;stored=0;inFlight=record.pendingCommit;blocked=false;refs.clear();history.reset(null,record.history,record.cursor);historyChanged(history);status('正在恢复未提交的编辑…');}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(isBusy()){schedule();return;}flush().catch(()=>{});},350);}
 async function perform(){
  try{
   while(stored<version){
    if(inFlight&&id){
     const remote=await draftRequest(`/${id}`);
     if(remote.commitId===inFlight.token){const pending=inFlight;revision=remote.revision;stored=Math.max(stored,pending.version);inFlight=null;await recovery.acknowledge(pending.version,revision,pending.token,version);if(stored===version){status(`已保存 · ${new Date(remote.updated*1000).toLocaleTimeString()}`);saved();return;}}
     else if(remote.revision!==revision){const error=Error('当前实例已在其他页面更新，已保留本页编辑，请先保存项目备份再重新载入');error.status=409;throw error;}
     else inFlight=null;
    }
    const targetVersion=version,cursor=history.cursor,states=history.states.map(state=>draftSnapshot(state.project,state.ui));status('正在保存…');
    if(!id){const created=await draftRequest('',{method:'POST'});id=created.id;revision=created.revision;if(revision!==0){const error=Error('当前实例已在其他页面更新，请先保存项目备份，再重新载入缓存');error.status=409;throw error;}await checkpoint();}
    for(const captured of states)for(const image of captured.images){
     let ref=refs.get(image.data);
     if(!ref){const result=await draftRequest(`/${id}/assets`,{method:'POST',body:await dataBlob(image.data)});ref=result.ref;refs.set(image.data,ref);}
     image.target[image.key]=ref;
    }
    const token=crypto.randomUUID().replaceAll('-','');inFlight={token,version:targetVersion,revision};await checkpoint();
    const result=await draftRequest(`/${id}`,jsonOptions('PUT',{...states[cursor],images:undefined,history:states.map(({project,ui})=>({project,ui})),cursor,revision,commitId:token}));
    revision=result.revision;stored=targetVersion;inFlight=null;await recovery.acknowledge(targetVersion,revision,token,version);refs=new Map(states.flatMap(state=>state.images.map(image=>[image.data,refs.get(image.data)])));
    if(stored===version){status(`已保存 · ${new Date(result.updated*1000).toLocaleTimeString()}`);saved();}
   }
  }catch(error){if(error.status===409||error.status===404)blocked=true;status(`保存失败：${error.message}`,true);throw error;}
 }
 async function flush(){
  clearTimeout(timer);if(blocked&&backupVersion===version)return;
  if(blocked)throw Error('缓存已冲突或删除，请先保存项目备份，再重新载入缓存');
  if(running){await running;if(stored<version)return flush();return;}
  if(stored===version)return;
  running=(async()=>{await lastCheckpoint;await perform();})();try{await running;}finally{running=null;}
 }
 async function load(identifier){
  const record=await draftRequest(`/${identifier}`);if(!record.project)throw Error('此草稿尚未保存完成');
  const states=record.history||[{project:record.project,ui:record.ui}],cache=new Map(),loadedRefs=new Map();
  async function restore(ref){if(!ref)return null;if(!cache.has(ref))cache.set(ref,(async()=>{const response=await fetch(`/api/drafts/${identifier}/assets/${ref}`);if(!response.ok)throw Error('草稿素材读取失败，当前工作已保留');const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('草稿素材读取失败'));reader.readAsDataURL(blob);});})());const data=await cache.get(ref);loadedRefs.set(data,ref);return data;}
  for(const {project:next} of states){
  for(const key of MEDIA_KEYS)next.assets[key]=await restore(next.assets[key]);
  for(const bg of next.backgrounds)bg.data=await restore(bg.data);
  for(const key of Object.keys(next.media||{}))next.media[key]=await restore(next.media[key]);
  }
  const cursor=record.cursor??states.length-1;return {record,project:states[cursor].project,states,cursor,refs:loadedRefs};
 }
 function adopt(loaded){lastCheckpoint=Promise.resolve();ready=true;frozen=false;clearTimeout(timer);id=loaded.record.id;revision=loaded.record.revision;refs=loaded.refs;version=stored=0;blocked=false;backupVersion=-1;inFlight=null;history.reset(null,loaded.states,loaded.cursor);historyChanged(history);status(`已保存 · ${new Date(loaded.record.updated*1000).toLocaleTimeString()}`);}
 function assertCanSwitch(){if(frozen)throw Error('原检查点尚未恢复，不能切换或新建批次；请重试恢复并保留本机数据');}
 function startBatch(record){
  assertCanSwitch();
  clearTimeout(timer);id=record.id;revision=record.revision;version=stored=0;refs.clear();blocked=frozen=false;backupVersion=-1;inFlight=null;lastCheckpoint=Promise.resolve();seed();touch();
 }
 async function travel(delta,install){
  history.end();const before=history.cursor,next=history.move(delta);if(!next)return;touch();
  try{const view=snapshot().ui;await install(next.project,{...next.ui,currentId:view.currentId,previewMode:view.previewMode,syncSizes:view.syncSizes});historyChanged(history);}catch(error){history.move(before-history.cursor);touch();throw error;}
 }
 return {assertCanSwitch,get frozen(){return frozen;},startBatch,initialize,readRecovery:()=>recovery.read(),forgetRecovery:()=>recovery.clear(),resume,mark,flush,load,adopt,seed,travel,failed:()=>{const failedBeforeInstall=!ready;if(!history.states.length)seed();frozen=failedBeforeInstall;blocked=true;},end:()=>history.end(),backedUp:()=>{backupVersion=version;},get id(){return id;},get pending(){return stored<version;},get canUndo(){return history.canUndo;},get canRedo(){return history.canRedo;},list:()=>draftRequest('')};
}
