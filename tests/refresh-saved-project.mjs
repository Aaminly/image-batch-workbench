import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18766',path=(await fs.readFile('work/refresh-live-export-location.txt','utf8')).trim();
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept());
const saved=()=>p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
const project=async()=>{const event=p.waitForEvent('download');await p.locator('#save-project').click();return JSON.parse(await fs.readFile(await(await event).path(),'utf8'));};
try{
 await p.goto(base);await saved();await p.locator('#project-input').setInputFiles(path);await p.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});await saved();
 await p.locator('#title').fill('完整项目刷新核对');await saved();await p.locator('[data-layer="title"]').click();await p.locator('#font-size').fill('29');await saved();await p.locator('#dx').fill('73');await saved();
 const before=await project(),size=await p.locator('#variant-select').inputValue();await p.reload();await saved();const after=await project();assert.deepEqual(after,before,'saved whole project must survive reload');assert.equal(await p.locator('#variant-select').inputValue(),size);console.log('PASS all 38 variants, embedded images, per-size overrides, layouts/text styles: complete project exact after saved/reload');
}finally{await b.close();}
