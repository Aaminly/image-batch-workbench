export function setupDraftUI({drafts,isBusy,setBusy,install,blank,changed,notice,draftStatus,endEdit=()=>{},viewError=()=>null}){
 const $=id=>document.getElementById(id),select=$('batch-select');
 let refreshVersion=0,travelling=false;const historyQueue=[];
 const remember=()=>sessionStorage.setItem('ad-studio-batch',drafts.id||'');
 async function refresh(){const version=++refreshVersion,rows=await drafts.list();if(version!==refreshVersion)return;select.replaceChildren(...rows.map(row=>{const option=document.createElement('option');option.value=row.id;option.textContent=`${row.name} · ${row.sizes.length} 尺寸`;return option;}));if(!rows.some(row=>row.id===drafts.id)){const option=document.createElement('option');option.value=drafts.id||'';option.textContent='当前批次（尚未保存）';select.prepend(option);}select.value=drafts.id||'';}
 async function action(work){if(isBusy())return;setBusy(true);try{await work();await refresh();}catch(e){notice(e.message,true);try{await refresh();}catch{select.value=drafts.id||'';}}finally{setBusy(false);}}
 window.addEventListener('batch-saved',()=>refresh().catch(e=>notice(e.message,true)));
 $('draft-new').onclick=()=>action(async()=>{drafts.assertCanSwitch();await drafts.flush();drafts.end();const record=await (await import('./drafts.js')).draftRequest('?new_batch=true',{method:'POST'});if(record.id===drafts.id||record.revision!==0)throw Error('本机服务仍是旧版本，请重启工作台后重试；原批次已保留');const next=blank();next.name=`批次 ${new Date().toLocaleString('zh-CN',{hour12:false})}`;await install(next);drafts.startBatch(record);remember();await drafts.flush();notice('已新建批次，原批次已保留，可在顶部切换。');});
 select.onchange=()=>{const id=select.value;action(async()=>{drafts.assertCanSwitch();await drafts.flush();drafts.end();const loaded=await drafts.load(id);await install(loaded.project,loaded.record.ui);drafts.adopt(loaded);await drafts.forgetRecovery();remember();notice('已切换批次。');});};
 function requestTravel(delta,repeat=false){
  if((isBusy()&&!travelling)||(repeat&&historyQueue.at(-1)===delta))return;
  historyQueue.push(delta);if(travelling)return;travelling=true;
  return (async()=>{
   try{
    endEdit();setBusy(true);
    while(historyQueue.length){
     const step=historyQueue.shift();await drafts.flush();
     if(step<0?!drafts.canUndo:!drafts.canRedo)continue;
     await drafts.travel(step,(project,ui)=>install(project,ui,true,true));
     const previewError=viewError();
     try{await drafts.flush();}catch(error){if(previewError)throw Error(`${previewError}；${error.message}`);throw error;}
     if(previewError)throw Error(`画布预览加载失败：${previewError}；当前状态已保存，已停止后续撤销与重做，请刷新重试。`);
    }
   }catch(error){historyQueue.length=0;notice(error.message,true);}
   finally{travelling=false;setBusy(false);}
  })();
 }
 for(const [id,delta]of [['undo',-1],['redo',1]])$(id).onclick=()=>requestTravel(delta);
 async function restore(recover=true){
  await drafts.initialize();const pending=recover?await drafts.readRecovery():null;
  if(pending){const state=pending.history[pending.cursor];await install(state.project,state.ui);drafts.resume(pending);remember();await drafts.flush();notice('已恢复刷新前的批次编辑。');return;}
  const rows=await drafts.list(),preferred=sessionStorage.getItem('ad-studio-batch'),row=rows.find(row=>row.id===preferred)||rows[0];
  if(row){const loaded=await drafts.load(row.id);await install(loaded.project,loaded.record.ui);drafts.adopt(loaded);}else{drafts.seed();}
  if(!recover)await drafts.forgetRecovery();remember();
 }
 $('cache-reload').onclick=()=>action(async()=>{const frozen=drafts.frozen;if(!frozen)await drafts.flush();await restore(frozen);notice('已重新载入当前批次缓存。');});
 return {requestTravel,restore:async()=>{setBusy(true);try{await restore();await refresh();return true;}catch(e){drafts.failed();draftStatus(`缓存恢复失败：${e.message}`,true);notice('未替换当前内容，请保留本机数据目录；可保存项目备份后重新载入。',true);return false;}finally{setBusy(false);}}};
}
