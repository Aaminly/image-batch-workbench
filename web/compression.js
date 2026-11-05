import {pngBlob} from './render.js';
export async function compressedPng(canvas,signal){
 const response=await fetch('/api/compress-png',{method:'POST',headers:{'Content-Type':'image/png'},body:await pngBlob(canvas),signal});
 if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.detail||`本地PNG压缩失败（${response.status}）`);}
 return response.blob();
}
