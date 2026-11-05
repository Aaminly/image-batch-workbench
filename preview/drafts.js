import {createHistory} from '../web/history.js';
export {draftSnapshot} from '../web/drafts.js';
export function createDrafts({snapshot,status,historyChanged=()=>{}}){
 const history=createHistory();let pending=false;
 function capture(){const state=snapshot();for(const image of state.images)image.target[image.key]=image.data;return{project:state.project,ui:state.ui};}
 function changed(){pending=true;status('仅当前页面 · 未下载 JSON');historyChanged(history);}
 return{
  seed(){history.reset(capture());status('仅当前页面 · 刷新重置');historyChanged(history);},
  mark(group=null){if(!history.record(capture(),group))return false;changed();return true;},
  end:()=>history.end(),
  // Session edits are already in memory; there is no persistent save to flush.
  flush:async()=>{},
  backedUp(){pending=false;status('JSON 已生成 · 刷新重置');},
  get pending(){return pending;},get canUndo(){return history.canUndo;},get canRedo(){return history.canRedo;},
  async travel(delta,install){
   const before=capture(),cursor=history.cursor,next=history.move(delta);if(!next)return;
   try{await install(next.project,{...next.ui,currentId:before.ui.currentId,previewMode:before.ui.previewMode,syncSizes:before.ui.syncSizes});changed();}
   catch(error){history.move(cursor-history.cursor);historyChanged(history);try{await install(before.project,before.ui);}catch(rollback){throw new AggregateError([error,rollback],'撤销失败且恢复失败，请下载当前项目并刷新');}throw error;}
  }
 };
}
