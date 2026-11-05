import {chromium} from 'playwright';import assert from 'node:assert/strict';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18767',browser=await chromium.launch({channel:'chrome',headless:true}),p=await browser.newPage({viewport:{width:1512,height:1000}});p.setDefaultTimeout(7000);p.on('dialog',d=>d.accept());const saved=()=>p.waitForFunction(()=>document.getElementById('draft-status').textContent.startsWith('已保存')&&!document.getElementById('batch-select').disabled);
async function dbAction(mode,arg){return p.evaluate(async({mode,arg})=>{
 const db=await new Promise(ok=>{const r=indexedDB.open('ad-studio-recovery');r.onsuccess=()=>ok(r.result);}),tab=sessionStorage.getItem('ad-studio-page');
 try{
  if(mode==='remove')return await new Promise(ok=>{const tx=db.transaction('images','readwrite'),req=tx.objectStore('images').index('tab').getAll(tab);let row;req.onsuccess=()=>{row=req.result[0];tx.objectStore('images').delete(row.key);};tx.oncomplete=()=>ok(row);});
  if(mode==='restore')return await new Promise(ok=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put(arg);tx.oncomplete=()=>ok(true);});
  return await Promise.all(['images','checkpoints'].map(name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).count();r.onsuccess=()=>ok(r.result);})));
 }finally{db.close();}
 },{mode,arg});}

try{
 await p.goto(base);await saved();const text='恢复检查点'+Date.now();await p.route('**/api/drafts/*',r=>r.request().method()==='PUT'?r.fulfill({status:507,contentType:'application/json',body:'{"detail":"测试暂不提交"}'}):r.continue());await p.locator('[data-layer="title"]').click();await p.locator('#title').fill(text);await p.locator('#draft-status').filter({hasText:'保存失败'}).waitFor({state:'attached'});
 const removed=await dbAction('remove');assert.ok(removed);await p.reload();await p.locator('#draft-status').filter({hasText:'素材缺失'}).waitFor({state:'attached'});await p.locator('[data-layer="title"]').click();await p.locator('#title').fill('失败后仍保留原检查点');await p.locator('#draft-status').filter({hasText:'刷新保护失败'}).waitFor({state:'attached'});
 for(let n=0;n<3&&await p.locator('#notifications').isVisible();n++)await p.locator('#toast-close').click();let creates=0;p.on('request',r=>{if(r.url().includes('new_batch=true'))creates++;});await p.locator('#draft-new').click();assert.equal(creates,0,'frozen checkpoint must prevent creating batches');
 await dbAction('restore',removed);await p.unrouteAll({behavior:'ignoreErrors'});for(let n=0;n<3&&await p.locator('#notifications').isVisible();n++)await p.locator('#toast-close').click();await p.locator('details.project-menu > summary').click();await p.locator('#cache-reload').click();await saved();assert.equal(await p.locator('#title').inputValue(),text);
 const counts=await dbAction('counts');
 assert.deepEqual(counts,[0,0]);console.log('PASS frozen errors block new batch, repaired checkpoint retries past old rejection and clears all temporary data');
}finally{await browser.close();}
