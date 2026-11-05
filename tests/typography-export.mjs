import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const url=process.env.STUDIO_URL||'http://127.0.0.1:18765';assert.notEqual(new URL(url).port,'8765');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({acceptDownloads:true});
try{
 await page.goto(url);await page.waitForFunction(()=>!document.getElementById('draft-new').disabled);await page.locator('#draft-new').click();await page.waitForFunction(()=>!document.getElementById('draft-new').disabled);await page.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await page.waitForFunction(()=>!document.getElementById('export-png').disabled);
 const hashes=[];
 for(const version of ['before','after']){
  if(version==='before')await page.route('**/style.css',route=>route.fulfill({path:'work/typography/before.css',contentType:'text/css'}));else await page.unroute('**/style.css');
  await page.reload();await page.waitForFunction(()=>document.getElementById('stage').dataset.canvasState==='ready'&&!document.getElementById('export-png').disabled);
  const event=page.waitForEvent('download');await page.locator('#export-png').click();const file=`work/typography/${version}.png`;await(await event).saveAs(file);hashes.push(createHash('sha256').update(await fs.readFile(file)).digest('hex'));
 }
 assert.equal(hashes[0],hashes[1],'CSS字号修复不改变实际PNG');await fs.writeFile('work/typography/export.json',JSON.stringify({before:hashes[0],after:hashes[1],identical:true},null,2));console.log('PASS actual exported PNG identical before/after UI typography CSS');
}finally{await browser.close();}
