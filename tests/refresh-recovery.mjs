import {chromium} from 'playwright';import assert from 'node:assert/strict';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18766',browser=await chromium.launch({channel:'chrome',headless:true}),p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
const saved=()=>p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
try{
 await p.goto(base);await saved();await p.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));
 await p.locator('#title').fill('刷新恢复回归A');await saved();await p.reload();await saved();assert.equal(await p.locator('#title').inputValue(),'刷新恢复回归A');
 await p.locator('#title').fill('刷新恢复回归B');await p.waitForTimeout(500);await p.locator('#title').fill('刷新恢复回归C');await saved();await p.reload();await saved();assert.equal(await p.locator('#title').inputValue(),'刷新恢复回归C');
 await p.locator('#dx').fill('53');await saved();await p.reload();await saved();assert.equal(await p.locator('#dx').inputValue(),'53');assert.deepEqual(errors,[]);
 console.log('PASS real-shape cached project: document text, continuous input after saved, layout persist after reload');
 // Reload immediately after an input, before the debounce expires.
 await p.locator('#title').fill('立即刷新回归');await p.reload();await saved();assert.equal(await p.locator('#title').inputValue(),'立即刷新回归','last input must survive an immediate reload');
 console.log('PASS immediate reload');
}finally{await browser.close();}
