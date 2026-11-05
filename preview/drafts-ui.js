export function setupDraftUI({drafts,isBusy,setBusy,install,notice,draftStatus,endEdit,viewError}){
 const $=id=>document.getElementById(id);let travelling=false;const queue=[];
 const label=document.createElement('span');label.textContent='在线预览 · 刷新重置';$('batch-select').parentElement.append(label);
 $('open-export').textContent='下载项目 JSON';$('open-export').onclick=()=>{if(!isBusy())$('save-project').click();};
 const note=document.querySelector('.privacy-note');note.textContent='图片仅在浏览器处理。刷新会清空，请下载 JSON 保留修改。抠图、PNG/ZIP 导出与自动保存需使用本机完整版。';
 const link=document.createElement('a');link.href='https://github.com/Aaminly/image-batch-workbench#快速开始';link.target='_blank';link.rel='noopener noreferrer';link.textContent='安装本机完整版 ↗';note.append(document.createElement('br'),link);
 async function requestTravel(delta,repeat=false){
  if(isBusy()&&!travelling||repeat&&queue.at(-1)===delta)return;queue.push(delta);if(travelling)return;travelling=true;
  try{endEdit();setBusy(true);drafts.end();while(queue.length){await drafts.travel(queue.shift(),(project,ui)=>install(project,ui,true,true));const error=viewError();if(error)throw Error(error);}}
  catch(error){queue.length=0;notice(`预览撤销 / 重做失败：${error.message}`,true);}
  finally{travelling=false;setBusy(false);}
 }
 for(const [id,delta]of [['undo',-1],['redo',1]])$(id).onclick=()=>requestTravel(delta);
 return{requestTravel,restore:async()=>{try{drafts.seed();return true;}catch(error){draftStatus(`预览初始化失败：${error.message}`,true);return false;}}};
}
