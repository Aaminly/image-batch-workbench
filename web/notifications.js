export function createNotifications(root,message,closeButton,noticeStatus,draftStatus,{duration=2200}={}){
 let timer=null,token=0,current=null;const errors=new Map();
 function hide(){clearTimeout(timer);token++;current=null;root.hidden=true;}
 function show(text,source,error=false,persistent=false){
  clearTimeout(timer);const version=++token;current={source,error};message.textContent=text;root.classList.toggle('error',error);root.hidden=false;
  if(!persistent&&!error)timer=setTimeout(()=>{if(version===token)hide();},duration);
 }
 function showError(){const next=errors.entries().next().value;if(next){show(next[1],next[0],true,true);return true;}return false;}
 function close(){if(current?.error)errors.delete(current.source);hide();showError();}
 closeButton.onclick=close;
 return{
  notice(text,error=false){
   noticeStatus.textContent=text;noticeStatus.classList.toggle('error',error);
   if(error){errors.set('notice',text);showError();return;}
   if(showError())return;show(text,'notice',false,/正在|读取背景/.test(text));
  },
  draft(text,error=false){
   draftStatus.textContent=text;draftStatus.classList.toggle('error',error);
   if(error){errors.set('draft',text);showError();return;}
   if(text.startsWith('已保存')){
    errors.delete('draft');if(showError())return;
    if(!current||current.source==='saved'||current.source==='draft')show('已保存','saved');
   }else if(current?.source==='saved')hide();
  },close
 };
}
