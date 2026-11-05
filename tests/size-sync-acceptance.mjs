import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});page.setDefaultTimeout(15000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={};
const save=async(name)=>{const event=page.waitForEvent('download');await page.locator('#save-project').click();await(await event).saveAs(`work/${name}.json`);return JSON.parse(await fs.readFile(`work/${name}.json`,'utf8'));};
try{
 await page.goto('http://127.0.0.1:8765');await page.waitForFunction(()=>!document.querySelector('#model-status').textContent.includes('正在检查'));await page.locator('#draft-new').click();await page.locator('#notice').filter({hasText:'已新建批次'}).waitFor({state:'attached'});await page.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await page.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});await page.locator('#all-sizes').click();await page.locator('#variant-select').selectOption('300x250');await page.locator('#sync-sizes').check();
 await page.locator('#export-none').click();await page.locator('[data-layer="title"]').click();
 const before=await save('sync-38-before');assert.equal(before.variants.length,38);
 await page.locator('#preview').focus();await page.keyboard.press('ArrowRight');
 const after=await save('sync-38-keyboard');for(const v of after.variants){const old=before.variants.find(b=>b.id===v.id);assert.ok(Math.abs(v.textLayers.title.dx-old.textLayers.title.dx-v.text.w/270)<1e-8);}
 // One pointer gesture, including reversal, must use its initial snapshots.
 const handle=await page.locator('[data-resize="w"]').boundingBox(),x=handle.x+handle.width/2,y=handle.y+handle.height/2;
 await page.mouse.move(x,y);await page.mouse.down();const frames=[];
 for(const delta of [10,20,30,15,0]){const start=performance.now();await page.mouse.move(x+delta,y);await page.evaluate(()=>new Promise(requestAnimationFrame));frames.push(performance.now()-start);}
 await page.mouse.up();const reverted=await save('sync-38-drag');for(const v of reverted.variants){const old=after.variants.find(b=>b.id===v.id);assert.ok(Math.abs(v.textLayers.title.dx-old.textLayers.title.dx)<1e-7);assert.ok(Math.abs((v.textLayers.title.width??v.text.w)-(old.textLayers.title.width??old.text.w))<1e-7);}
 report.pointerFrameRoundtripMs=frames;report.visibleCards=await page.locator('.size-preview').evaluateAll(cards=>cards.filter(c=>{const r=c.getBoundingClientRect(),b=c.parentElement.getBoundingClientRect();return r.bottom>=b.top&&r.top<=b.bottom;}).length);report.rasterPixels=await page.locator('.size-preview canvas').evaluateAll(cs=>cs.reduce((sum,c)=>sum+c.width*c.height,0));assert.ok(report.visibleCards<12);assert.ok(report.rasterPixels<1000000);
 await page.locator('#size-previews').evaluate(el=>el.scrollTop=el.scrollHeight);await page.locator('.size-preview').last().click();assert.equal(await page.locator('#variant-select').inputValue(),'1920x1080');
 await page.locator('#variant-select').selectOption('300x250');await page.locator('#sync-sizes').check();await page.locator('#reset-layout').evaluate(el=>{for(let x=el.parentElement;x;x=x.parentElement)if(x.tagName==='DETAILS')x.open=true;});await page.locator('#reset-layout').click();const reset=await save('sync-reset');assert.deepEqual(reset.variants.find(v=>v.id==='600x900'),reverted.variants.find(v=>v.id==='600x900'));
 // Project restore enables synchronization by default.
 await page.locator('#project-input').setInputFiles('work/sync-38-keyboard.json');await page.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});assert.equal(await page.locator('#sync-sizes').isChecked(),true);await page.locator('#variant-select').selectOption('300x250');
 const restored=await save('sync-restored');assert.deepEqual(restored.variants,after.variants);
 // Rapid choices settle at final requested size.
 await page.evaluate(()=>{const select=document.querySelector('#variant-select');for(const id of ['1080x1920','970x90','600x900']){select.value=id;select.dispatchEvent(new Event('change'));}});await page.waitForFunction(()=>document.querySelector('#variant-select').value==='600x900');
 await page.waitForTimeout(220);assert.equal(await page.locator('#preview-surface').evaluate(el=>el.getAnimations().length),0);
 await page.screenshot({path:'work/sync-38-desktop.png'});
 for(const [width,height]of [[1440,650],[1024,768],[800,900],[390,844]]){await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`work/sync-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} overflow`);}
 await page.setViewportSize({width:1600,height:1000});await page.locator('#variant-select').selectOption('300x250');await page.locator('#export-select-all').click();
 // Native-size PNG from the actual export path.
 const event=page.waitForEvent('download');await page.locator('#export-png').click();await(await event).saveAs('work/sync-current.png');const bytes=await fs.readFile('work/sync-current.png');assert.equal(bytes.readUInt32BE(16),300);assert.equal(bytes.readUInt32BE(20),250);
 // Every rendered thumbnail matches the same native render pipeline at its raster resolution.
 const same=await page.evaluate(async p=>{const {render,loadAssets}=await import('/render.js'),assets=await loadAssets(p);return [...document.querySelectorAll('.size-preview')].filter(b=>b.querySelector('canvas').width>1).slice(0,4).every(b=>{const c=b.querySelector('canvas'),v=p.variants.find(v=>v.id===b.dataset.variant),out=document.createElement('canvas');render(out,p,v,assets,{pixelWidth:c.width,pixelHeight:c.height});return out.toDataURL()===c.toDataURL();});},restored);assert.ok(same);
 assert.deepEqual(errors,[]);report.errors=errors;report.result='PASS';await fs.writeFile('work/sync-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
