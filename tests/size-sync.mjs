import {importLegacyImage} from './support/select-layer.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});
page.on('dialog',d=>d.accept());
try{
 await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));await page.locator('#draft-new').click();await page.locator('#notice').filter({hasText:'已新建批次'}).waitFor({state:'attached'});
 assert.equal(await page.locator('#sync-sizes').count(),1,'应提供全尺寸同步开关');assert.equal(await page.locator('#sync-sizes').isChecked(),true,'默认勾选');assert.equal((await page.locator('.sync-toolbar label').innerText()).trim(),'同步操作同比例尺寸');
 await importLegacyImage(page,'tests/fixtures/layout.png');await page.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});
 for(const size of ['600x900','1080x1080','970x90','1080x1920','336x280','580x400','750x200','1200x600','640x640','720x900'])await page.locator(`[data-size="${size}"]`).click();
 await page.locator('#variant-select').selectOption('300x250');
 const save=async(name)=>{const event=page.waitForEvent('download');await page.locator('#save-project').click();const d=await event;await d.saveAs(`work/${name}.json`);return JSON.parse(await fs.readFile(`work/${name}.json`,'utf8'));};
 const initial=await save('sync-initial');await page.locator('#sync-sizes').check();assert.deepEqual((await save('sync-on')).variants,initial.variants);
 await page.locator('#dx').fill('20');await page.locator('#dx').dispatchEvent('input');
 await page.locator('[data-layer="title"]').click();await page.locator('#text-color').fill('#ff0000');await page.locator('#text-color').dispatchEvent('input');
 const synced=await save('sync-edited');for(const v of synced.variants){assert.ok(Math.abs(v.dx-20*v.box.w/initial.variants[0].box.w)<1e-8);assert.equal(v.textLayers.title.color,'#ff0000');}
 const cards=page.locator('.size-preview');await cards.first().waitFor();const boxes=await cards.evaluateAll(els=>els.slice(0,4).map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y};}));assert.equal(boxes[0].x,boxes[2].x);assert.equal(boxes[1].x,boxes[3].x);assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[2].y>boxes[0].y);
 const stage=await page.locator('#stage').boundingBox(),rail=await page.locator('#size-previews').boundingBox();assert.ok(stage.x+stage.width<=rail.x+1);assert.ok(Math.abs(stage.height-rail.height)<2);
 await cards.first().click();assert.equal(await page.locator('#variant-select').inputValue(),'336x280');
 const animation=await page.locator('#preview-surface').evaluate(el=>el.getAnimations().map(a=>a.effect.getTiming().duration));assert.ok(animation.includes(180),'切换应有180ms动画');
 assert.deepEqual((await save('sync-switched')).variants,synced.variants);
 await page.locator('#sync-sizes').uncheck();await page.locator('#dx').fill('99');await page.locator('#dx').dispatchEvent('input');const isolated=await save('sync-off');assert.equal(isolated.variants[0].dx,20);assert.equal(isolated.variants.find(v=>v.id==='336x280').dx,99);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.size-preview').first().click();assert.equal(await page.locator('#preview-surface').evaluate(el=>el.getAnimations().length),0);
 await page.screenshot({path:'work/sync-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:'work/sync-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS enable no overwrite, all size edits, 2-column geometry, full-height main, switch no mutation, 180ms animation, reduced motion, off isolation, mobile');
}finally{await browser.close();}
