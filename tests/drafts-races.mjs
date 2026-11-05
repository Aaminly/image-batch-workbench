import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18765',browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({acceptDownloads:true});const ids=new Set();
try{
 const previous=await(await context.request.get(`${base}/api/drafts`)).json();if(previous.length)await context.request.post(`${base}/api/drafts/delete`,{data:{ids:previous.map(r=>r.id)}});
 const p=await context.newPage();p.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());await p.goto(base);await p.locator('#draft-new').click();
 let uploads=0;const metadata=[];p.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/assets'))uploads++;if(r.method()==='PUT'&&r.url().includes('/api/drafts/'))metadata.push(r.postDataBuffer().length);});
 await p.locator('#image-input').setInputFiles('tests/fixtures/astronaut.png');await p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});const id=(await(await context.request.get(`${base}/api/drafts`)).json())[0].id;ids.add(id);
 let release,started;const held=new Promise(r=>release=r),start=new Promise(r=>started=r);let first=true;
 await p.route(`${base}/api/drafts/${id}`,async route=>{if(route.request().method()==='PUT'&&first){first=false;started();await held;}await route.continue();});
 await p.locator('#title').fill('保存中的第一个版本');await start;await p.locator('#title').fill('保存期间继续编辑的最新版');release();await p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});await p.unroute(`${base}/api/drafts/${id}`);
 const record=await(await context.request.get(`${base}/api/drafts/${id}`)).json();assert.equal(record.project.copy.title,'保存期间继续编辑的最新版');assert.equal(uploads,1);assert.ok(metadata.every(n=>n<150000),metadata);
 // Real second tab loads exactly the same revision, then loses the update race.
 const q=await context.newPage();q.setDefaultTimeout(10000);q.on('dialog',d=>d.accept());await q.goto(base);await q.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
 await p.locator('#title').fill('第一页更新');await p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});await q.locator('#title').fill('第二页不能覆盖');await q.locator('#draft-status').filter({hasText:'其他页面'}).waitFor({state:'attached'});assert.equal((await(await context.request.get(`${base}/api/drafts/${id}`)).json()).project.copy.title,'第一页更新');
 // Saving failure blocks switching and preserves the current editor.
 await p.route(`${base}/api/drafts/${id}`,async route=>{if(route.request().method()==='PUT')await route.fulfill({status:507,contentType:'application/json',body:JSON.stringify({detail:'测试磁盘写入失败'})});else await route.continue();});
 await p.locator('#title').fill('磁盘失败时仍保留');await p.locator('#draft-status').filter({hasText:'保存失败'}).waitFor({state:'attached'});await p.locator('#toast-close').click();await p.locator('#draft-new').click();assert.equal(await p.locator('#title').inputValue(),'磁盘失败时仍保留');await p.screenshot({path:'work/drafts-save-error.png'});await p.unroute(`${base}/api/drafts/${id}`);await p.locator('#title').fill('恢复保存后最新版');await p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
 await context.request.post(`${base}/api/drafts/delete`,{data:{ids:[id]}});await p.locator('#title').fill('删除后不能复活');await p.locator('#draft-status').filter({hasText:'已删除'}).waitFor({state:'attached'});assert.equal((await context.request.get(`${base}/api/drafts/${id}`)).status(),404);
 await fs.writeFile('work/drafts-request-cost.json',JSON.stringify({sourceUploads:uploads,metadataBytes:metadata},null,2));console.log('PASS in-flight edits, one image upload, lightweight saves, real two-tab conflict, disk failure preserves editor, deleted ID rejects updates',metadata);
}finally{for(const id of ids)await context.request.post(`${base}/api/drafts/delete`,{data:{ids:[id]}}).catch(()=>{});await browser.close();}
