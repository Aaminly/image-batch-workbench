let downloadUrl=null;
function releaseDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
if(typeof window!=='undefined')window.addEventListener('pagehide',releaseDownload);
export async function createArchiveUpload(expectedFiles,signal){
 signal?.throwIfAborted();
 if(!Number.isSafeInteger(expectedFiles)||expectedFiles<1)throw Error('导出文件数量无效');
 const {ZipWriter,BlobWriter,BlobReader}=await import('../node_modules/@zip.js/zip.js/dist/zip-core-external.min.js');
 signal?.throwIfAborted();releaseDownload();
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});
 let output=new BlobWriter('application/zip'),writer=new ZipWriter(output,{level:0,useWebWorkers:false}),count=0,done=false;
 function check(){controller.signal.throwIfAborted();signal?.throwIfAborted();if(done)throw Error('导出任务已结束');}
 return{
  async append(blob,name){
   check();if(count>=expectedFiles)throw Error('导出文件数量超过计划');
   if(!/^[\p{L}\p{N}_-]+\.png$/u.test(name))throw Error('导出文件名无效');
   await writer.add(name,new BlobReader(blob),{signal:controller.signal});check();count++;
  },
  async finish(){
   check();if(count!==expectedFiles)throw Error('导出文件数量与计划不一致');
   const blob=await writer.close();check();done=true;writer=output=null;signal?.removeEventListener('abort',abort);
   downloadUrl=URL.createObjectURL(blob);
   const ownUrl=downloadUrl;signal?.addEventListener('abort',()=>{if(downloadUrl===ownUrl)releaseDownload();else URL.revokeObjectURL(ownUrl);},{once:true});
   return{downloadUrl};
  },
  async cancel(){
   if(done)return;done=true;controller.abort();signal?.removeEventListener('abort',abort);
   const stream=output?.writable;writer=output=null;
   try{if(stream&&!stream.locked)await stream.abort();}catch{} // Cleanup must not mask the original export failure.
  }
 };
}
