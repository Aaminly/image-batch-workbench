const PART_BYTES=24*1024*1024,PART_FILES=200;
async function jsonRequest(url,options){const response=await fetch(url,options);if(response.ok)return response.json();let data;try{data=await response.json();}catch{}throw Error(data?.detail||`本机导出服务错误（${response.status}）`);}
export async function createArchiveUpload(expectedFiles,signal){
 const created=await jsonRequest('/api/archives',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedFiles}),signal});
 const token=created.token,base=`/api/archives/${token}`;let form=new FormData(),bytes=0,files=0,seq=0,uploaded=0,done=false;
 const cancel=async()=>{if(done)return;done=true;try{await fetch(base,{method:'DELETE',keepalive:true});}catch{}};
 const leaving=()=>{if(!done)fetch(base,{method:'DELETE',keepalive:true}).catch(()=>{});};if(typeof window!=='undefined')window.addEventListener('pagehide',leaving);
 async function flush(){
  if(!files)return;signal?.throwIfAborted();let receipt;
  for(let attempt=0;attempt<2;attempt++){
   try{receipt=await jsonRequest(`${base}/parts/${seq}`,{method:'POST',body:form,signal});break;}
   catch(error){if(signal?.aborted||attempt||!(error instanceof TypeError))throw error;}
  }
  if(receipt.nextSeq!==seq+1||receipt.files!==uploaded+files)throw Error('导出分片回执不一致，请重新导出');
  uploaded+=files;seq++;form=new FormData();bytes=0;files=0;
 }
 return{
  async append(blob,name){signal?.throwIfAborted();if(blob.size>created.maxPartBytes-1024*1024)throw Error('单张PNG超过本机传输容量，请缩小该尺寸');if(files&&(bytes+blob.size>PART_BYTES||files>=PART_FILES))await flush();form.append('files',blob,name);bytes+=blob.size;files++;if(bytes>=PART_BYTES||files>=PART_FILES)await flush();},
  async finish(){await flush();signal?.throwIfAborted();let result;for(let attempt=0;attempt<2;attempt++){try{result=await jsonRequest(`${base}/finish`,{method:'POST',signal});break;}catch(error){if(signal?.aborted||attempt||!(error instanceof TypeError))throw error;}}done=true;if(typeof window!=='undefined')window.removeEventListener('pagehide',leaving);return result;},
  async cancel(){if(typeof window!=='undefined')window.removeEventListener('pagehide',leaving);await cancel();}
 };
}
