import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18766',browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({acceptDownloads:true});
const saved=p=>p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
const open=async()=>{const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('dialog',d=>d.accept());await p.goto(base);await saved(p);await p.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));return p;};
const record=async()=>{const rows=await(await ctx.request.get(`${base}/api/drafts`)).json();return (await ctx.request.get(`${base}/api/drafts/${rows[0].id}`)).json();};
try{
 const p=await open();let first=true,release,ready;const held=new Promise(r=>release=r),started=new Promise(r=>ready=r);
 await p.route('**/api/drafts/*',async route=>{if(route.request().method()==='PUT'&&first){first=false;const response=await route.fetch();ready(await response.json());await held;await route.fulfill({response}).catch(()=>{});}else await route.continue();});
 await p.locator('#title').fill('响应丢失但已落盘');const acknowledged=await started;await p.reload();await saved(p);release();assert.equal(await p.locator('#title').inputValue(),'响应丢失但已落盘');assert.equal((await record()).revision,acknowledged.revision,'lost response must not duplicate commit');await p.unrouteAll({behavior:'ignoreErrors'});
 console.log('PASS committed PUT with lost response recovers without duplicate revision');
 let finish,start;const barrier=new Promise(r=>finish=r),waiting=new Promise(r=>start=r);first=true;
 await p.route('**/api/drafts/*',async route=>{if(route.request().method()==='PUT'&&first){first=false;await route.fetch();start();await barrier;await route.abort().catch(()=>{});}else await route.continue();});
 await p.locator('#title').fill('请求中旧版本');await waiting;await p.locator('#title').fill('请求中继续编辑的最新版');await p.reload();await saved(p);finish();assert.equal(await p.locator('#title').inputValue(),'请求中继续编辑的最新版');assert.equal((await record()).project.copy.title,'请求中继续编辑的最新版');await p.unrouteAll({behavior:'ignoreErrors'});
 console.log('PASS newer pending edits survive old committed response and reload');
 await p.locator('#image-input').setInputFiles('tests/fixtures/astronaut.png');await p.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});await p.reload();await saved(p);
 const image=(await record()).project.assets.original;const response=await ctx.request.get(`${base}/api/drafts/${(await record()).id}/assets/${image}`);assert.deepEqual(await response.body(),await fs.readFile('tests/fixtures/astronaut.png'));
 console.log('PASS image larger than unload request budget survives immediate reload');
 const q=await open();await p.locator('#title').fill('另一页成功保存');await saved(p);await q.locator('#title').fill('冲突页待恢复的现场');await q.locator('#draft-status').filter({hasText:'其他页面'}).waitFor({state:'attached'});await q.reload();await q.locator('#draft-status').filter({hasText:'其他页面'}).waitFor({state:'attached'});assert.equal(await q.locator('#title').inputValue(),'冲突页待恢复的现场');assert.equal((await record()).project.copy.title,'另一页成功保存');
 const download=q.waitForEvent('download');await q.locator('#save-project').click();await download;if(await q.locator('#notifications').isVisible())await q.locator('#toast-close').click();await q.locator('#cache-reload').click();await saved(q);assert.equal(await q.locator('#title').inputValue(),'另一页成功保存');
 console.log('PASS conflict reload preserves local scene and cannot overwrite server; explicit backup/reload clears it');
 const popup=ctx.waitForEvent('page');await p.evaluate(url=>window.open(url),base);const duplicate=await popup;duplicate.on('dialog',d=>d.accept());await saved(duplicate);assert.notEqual(await duplicate.evaluate(()=>sessionStorage.getItem('ad-studio-page')),await p.evaluate(()=>sessionStorage.getItem('ad-studio-page')));await duplicate.close();
 console.log('PASS cloned sessionStorage tab gets an independent recovery identity');
}finally{await browser.close();}
