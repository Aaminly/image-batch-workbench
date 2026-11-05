import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18765',browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({acceptDownloads:true});
const saved=p=>p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
try{
 const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());await p.goto(base);await p.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));await p.locator('#draft-new').click();
 await p.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await saved(p);const rows=await(await ctx.request.get(`${base}/api/drafts`)).json(),id=rows[0].id;
 let download=p.waitForEvent('download');await p.locator('#save-project').click();const file=await download,project=JSON.parse(await fs.readFile(await file.path(),'utf8'));
 project.copy.title='导入后';project.assets.cutout=project.assets.original;project.assets.logo=project.assets.original;project.source='cutout';project.backgrounds=[{id:'bg-import',name:'背景.png',data:project.assets.original,width:600,height:500}];project.activeBackgroundId='bg-import';project.backgroundMode='current';
 await p.locator('#title').fill('导入前');await p.locator('#title').blur();await saved(p);
 await p.locator('#project-input').setInputFiles({name:'all-assets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});await saved(p);
 assert.equal((await(await ctx.request.get(`${base}/api/drafts`)).json()).length,1);assert.equal((await(await ctx.request.get(`${base}/api/drafts`)).json())[0].id,id);
 await p.reload();await saved(p);assert.equal(await p.locator('#title').inputValue(),'导入后');assert.equal(await p.locator('#remove-logo').isDisabled(),false);assert.equal(await p.locator('#background-list .background-row').count(),1);
 await p.locator('#undo').click();assert.equal(await p.locator('#title').inputValue(),'导入前');assert.equal(await p.locator('#remove-logo').isDisabled(),true);await p.locator('#redo').click();assert.equal(await p.locator('#title').inputValue(),'导入后');await saved(p);
 console.log('PASS import replaces singleton, all assets restore after refresh, undo/redo restores previous project and media');
}finally{await browser.close();}
