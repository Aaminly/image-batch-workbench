import {randomUUID} from './uuid.js';
const KEY='ad-studio-page';

// An open upgraded connection owns the ID until the page exits. No heartbeat expiry.
function databaseClaim(id){
 const name=`ad-studio-page-lock:${id}`;
 return new Promise((resolve,reject)=>{
  let settled=false,probe,upgrade,owned=false,ownerDB;
  const channel=new BroadcastChannel(name),nonce=randomUUID();
  const ping=()=>{if(!settled)channel.postMessage({ping:nonce});};
  const finish=(value,error)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(poll);probe?.close();if(!value)channel.close();if(error)reject(error);else resolve(value);};
  channel.onmessage=({data})=>{
   if(ownerDB&&data?.ping)channel.postMessage({pong:data.ping});
   else if(!settled&&data?.pong===nonce)finish(null);
  };
  // Queued opens may never emit blocked. Only an active owner can justify a new ID.
  const timer=setTimeout(()=>finish(null,Error('页面独占检查超时，原刷新检查点已保留，请关闭旧页面后刷新重试')),2000);
  const poll=setInterval(ping,100);ping();
  const first=indexedDB.open(name);
  first.onupgradeneeded=()=>{if(settled)first.transaction.abort();};
  first.onblocked=ping;
  first.onerror=()=>{if(!settled)finish(null,first.error);};
  first.onsuccess=()=>{
   probe=first.result;if(settled){probe.close();return;}
   const version=probe.version;probe.close();
   upgrade=indexedDB.open(name,version+1);
   upgrade.onupgradeneeded=()=>{if(settled){upgrade.transaction.abort();return;}owned=true;};
   upgrade.onblocked=ping;
   upgrade.onerror=()=>{if(!settled){if(upgrade.error?.name==='VersionError')ping();else finish(null,upgrade.error);}};
   upgrade.onsuccess=()=>{
    const db=upgrade.result;
    if(settled||!owned){db.close();if(!settled)ping();return;}
    ownerDB=db;
    finish({id,release:async()=>{ownerDB.close();ownerDB=null;channel.close();}});
   };
  };
 });
}

function nativeClaim(id){
 return new Promise((resolve,reject)=>{
  const finished=navigator.locks.request(`ad-studio-page:${id}`,{ifAvailable:true},async lock=>{
   if(!lock){resolve(null);return;}
   let release;const held=new Promise(done=>release=done);
   resolve({id,release:async()=>{release();await finished;}});await held;
  });finished.catch(reject);
 });
}

export async function claimPage(){
 let id=sessionStorage.getItem(KEY)||randomUUID();
 for(;;){
  const claim=await (navigator.locks?nativeClaim(id):databaseClaim(id));
  if(claim){sessionStorage.setItem(KEY,id);return claim;}
  id=randomUUID();
 }
}
