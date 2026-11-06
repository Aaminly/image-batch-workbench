import {importLegacyImage} from './support/select-layer.mjs';
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18765';
const browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());
const saved=page=>page.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
try{
 await p.goto(base);await p.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));await p.locator('#draft-new').click();
 await p.locator('#title').fill('基线');await p.locator('#title').blur();await saved(p);
 await p.locator('[data-size="970x90"]').click();await saved(p);let puts=0;p.on('request',r=>{if(r.method()==='PUT'&&r.url().includes('/api/drafts/'))puts++;});
 await p.locator('#variant-select').selectOption('300x250');await p.locator('#variant-select').selectOption('970x90');await p.locator('#preview-mode').selectOption('actual');await p.waitForTimeout(650);assert.equal(puts,0,'navigation must not save');
 for(let n=1;n<=12;n++){await p.locator('#title').fill(`版本${n}`);await p.locator('#title').blur();}
 await saved(p);for(let n=11;n>=2;n--){await p.locator('#undo').click();assert.equal(await p.locator('#title').inputValue(),`版本${n}`);}
 assert.equal(await p.locator('#undo').isDisabled(),true);await saved(p);await p.reload();await saved(p);assert.equal(await p.locator('#title').inputValue(),'版本2');
 await p.locator('#redo').click();assert.equal(await p.locator('#title').inputValue(),'版本3');await p.locator('#title').fill('分支');await p.locator('#title').blur();assert.equal(await p.locator('#redo').isDisabled(),true);await saved(p);
 const rows=await (await ctx.request.get(`${base}/api/drafts`)).json();assert.equal(rows.length,1);const id=rows[0].id;
 await p.locator('#draft-new').click();await saved(p);await p.locator('#undo').click();assert.equal(await p.locator('#title').inputValue(),'分支');await saved(p);
 await importLegacyImage(p,'tests/fixtures/layout.png');await saved(p);let record=await(await ctx.request.get(`${base}/api/drafts/${id}`)).json();let count=record.history.length;
 await p.locator('#preview-mode').selectOption('fit');await p.locator('[data-layer="title"]').click();const canvas=await p.locator('#preview').boundingBox();const rect=await p.evaluate(async record=>{const {layoutText}=await import('/text-layout.js');const v=record.project.variants.find(v=>v.id===document.querySelector('#variant-select').value);return {...layoutText(document.createElement('canvas').getContext('2d'),record.project,v).find(l=>l.id==='title').hitRects[0],vw:v.width,vh:v.height};},record);const box={x:canvas.x+rect.x*canvas.width/rect.vw,y:canvas.y+rect.y*canvas.height/rect.vh,width:rect.w*canvas.width/rect.vw,height:rect.h*canvas.height/rect.vh};await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+30,box.y+box.height/2+10,{steps:12});await p.mouse.up();await saved(p);
 record=await(await ctx.request.get(`${base}/api/drafts/${id}`)).json();assert.equal(record.history.length,count+1,'whole drag is one step');
 const q=await ctx.newPage();q.on('dialog',d=>d.accept());await q.goto(base);await saved(q);await p.locator('#title').fill('第一页');await p.locator('#title').blur();await saved(p);await q.locator('#title').fill('冲突保留');await q.locator('#title').blur();await q.locator('#draft-status').filter({hasText:'其他页面'}).waitFor({state:'attached'});assert.equal(await q.locator('#title').inputValue(),'冲突保留');
 const download=q.waitForEvent('download');await q.locator('#save-project').click();await download;await q.locator('#cache-reload').click();await saved(q);assert.equal(await q.locator('#title').inputValue(),'第一页');
 await p.screenshot({path:'work/instance-desktop.png'});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'work/instance-mobile.png'});
 console.log('PASS zero-save navigation, 10-step undo/redo, refresh, branching, singleton new, one-step drag, conflicts/export/reload');
}finally{await browser.close();}
