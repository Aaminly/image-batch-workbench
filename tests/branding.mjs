import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {selectLayer} from './support/select-layer.mjs';
const base=process.env.STUDIO_URL;
assert(base&&new URL(base).port!=='8765','Set STUDIO_URL to an isolated test instance.');
const name='图片批处理工作台';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.goto(base);
 await page.waitForFunction(()=>document.getElementById('stage').dataset.canvasState==='ready');
 assert.equal(await page.title(),name,'restored page keeps the product name');
 await selectLayer(page,'title');
 await page.locator('#title').fill('品牌标题回归');
 assert.equal(await page.title(),`● ${name}`,'dirty state keeps the product name');
 await page.waitForFunction(name=>document.title===name,name,{timeout:8000});
 await page.reload();
 await page.waitForFunction(()=>document.getElementById('stage').dataset.canvasState==='ready');
 assert.equal(await page.title(),name,'saved and reloaded page keeps the product name');
 console.log('PASS: product name survives restore, edit, autosave and reload.');
}finally{await browser.close();}
