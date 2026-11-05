import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18765',file='work/instance-restart-evidence.json',mode=process.argv[2]||'assert';const browser=await chromium.launch({channel:'chrome',headless:true});
const digest=r=>createHash('sha256').update(JSON.stringify({history:r.history,cursor:r.cursor})).digest('hex');
try{
 const p=await browser.newPage();p.on('dialog',d=>d.accept());await p.goto(base);await p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
 if(mode==='prepare'){await p.locator('#undo').click();await p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});}
 const rows=await(await p.request.get(`${base}/api/drafts`)).json(),r=await(await p.request.get(`${base}/api/drafts/${rows[0].id}`)).json();assert.ok(r.cursor<r.history.length-1);assert.equal(await p.locator('#redo').isDisabled(),false);
 if(mode==='prepare')await fs.writeFile(file,JSON.stringify({id:r.id,digest:digest(r),states:r.history.length,cursor:r.cursor}));else{const before=JSON.parse(await fs.readFile(file));assert.equal(r.id,before.id);assert.equal(digest(r),before.digest);await p.locator('#redo').click();assert.equal(await p.locator('#title').inputValue(),'导入后');console.log('PASS process restart preserves exact history/cursor and redo restores imported content');}
}finally{await browser.close();}
