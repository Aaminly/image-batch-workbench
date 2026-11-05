import {chromium} from 'playwright';import assert from 'node:assert/strict';
const base=process.env.STUDIO_URL||'http://127.0.0.1:18766',browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:1000}});const saved=p=>p.locator('#draft-status').filter({hasText:'已保存'}).waitFor({state:'attached'});
try{
 const a=await ctx.newPage();a.on('dialog',d=>d.accept());await a.goto(base);await saved(a);const ids=await a.locator('#variant-select option').evaluateAll(els=>els.map(e=>e.value));assert.ok(ids.length>1);
 await a.locator('#variant-select').selectOption(ids[0]);await a.locator('#sync-sizes').uncheck();await a.locator('#title').fill('本页独立文案');await saved(a);await a.locator('[data-layer="subtitle"]').click();await a.locator('#font-size').fill('31');await saved(a);
 const b=await ctx.newPage();b.on('dialog',d=>d.accept());await b.goto(base);await saved(b);await b.locator('#variant-select').selectOption(ids[1]);await a.reload();await saved(a);
 assert.equal(await a.locator('#variant-select').inputValue(),ids[0],'other page must not replace this page current size on reload');assert.equal(await a.locator('#title').inputValue(),'本页独立文案');assert.equal(await a.evaluate(()=>document.querySelector('[data-layer][aria-pressed="true"]')?.dataset.layer||''),'subtitle','selected layer must restore');assert.equal(await a.locator('#font-size').inputValue(),'31');
 await a.locator('#draft-new').click();await saved(a);await a.reload();await saved(a);assert.equal(await a.locator('#variant-select').inputValue(),'300x250');assert.equal(await a.evaluate(()=>document.querySelector('[data-layer][aria-pressed="true"]')?.dataset.layer||''),'');
 console.log('PASS saved reload retains per-page size, effective content, selected layer and matching property values');
}finally{await browser.close();}
