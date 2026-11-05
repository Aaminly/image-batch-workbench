import {chromium} from 'playwright';import assert from 'node:assert/strict';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18765',browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const ready=p=>p.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));
const saved=p=>p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
try{
 let rows=await(await ctx.request.get(`${base}/api/drafts`)).json();if(rows.length)await ctx.request.post(`${base}/api/drafts/delete`,{data:{ids:rows.map(r=>r.id)}});
 const a=await ctx.newPage(),b=await ctx.newPage();for(const p of [a,b]){p.setDefaultTimeout(6000);p.on('dialog',d=>d.accept());await p.goto(base);await ready(p);}
 await a.locator('#title').fill('A先保存');await a.locator('#title').blur();await saved(a);await b.locator('#title').fill('B旧基线');await b.locator('#title').blur();await b.waitForTimeout(700);
 rows=await(await ctx.request.get(`${base}/api/drafts`)).json();let record=await(await ctx.request.get(`${base}/api/drafts/${rows[0].id}`)).json();assert.equal(record.project.copy.title,'A先保存','empty-start second page must not overwrite');
 await a.locator('[data-size="970x90"]').click();await saved(a);await a.locator('#variant-list .variant-row').filter({has:a.locator('.size-choice',{hasText:'970 × 90'})}).getByRole('button',{name:'移除 970 × 90',exact:true}).click();
 await saved(a);assert.equal(await a.locator('#variant-select').inputValue(),'300x250');await a.locator('#undo').click();assert.equal(await a.locator('#variant-select option').count(),2);await a.locator('#redo').click();await saved(a);await a.reload();await saved(a);assert.equal(await a.locator('#variant-select option').count(),1);
 await a.locator('#sync-sizes').uncheck();await a.locator('#title').fill('独立编辑');await a.locator('#title').blur();await saved(a);await a.locator('#undo').click();assert.equal(await a.locator('#sync-sizes').isChecked(),false,'undo must preserve current sync mode');
 console.log('PASS empty-start two-page conflict, delete current size saves and undo/redo/refresh restores correct sizes');
}finally{await browser.close();}
