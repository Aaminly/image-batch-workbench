import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-delete-')),port=18773,url=`http://127.0.0.1:${port}`;
const child=spawn('.venv/bin/python',['-c',`import sys\nfrom pathlib import Path\nimport server,uvicorn\nserver.ROOT=Path(sys.argv[1])\nuvicorn.run(server.app,host='127.0.0.1',port=${port},log_level='warning')`,root]);
let stderr='';child.stderr.on('data',b=>stderr+=b);
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
await page.addInitScript(()=>{
 // Observe the actual JSON export Blob, avoiding Chrome's repeated-download throttle.
 const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='application/json')window.projectExport=blob;return create(blob);};
 document.addEventListener('click',e=>{if(e.target.closest('a')?.download?.endsWith('.adproject.json'))e.preventDefault();},true);
});
page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)console.error('HTTP',r.status(),r.url());});page.on('dialog',d=>d.accept());
async function ready(){await page.waitForFunction(()=>!document.querySelector('#project-input').disabled);}
async function save(){await page.evaluate(()=>window.projectExport=null);await page.locator('#save-project').evaluate(el=>{const d=el.closest('details');if(d)d.open=true;});await page.locator('#save-project').click();await page.waitForFunction(()=>!!window.projectExport);return page.evaluate(async()=>JSON.parse(await window.projectExport.text()));}
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await page.goto(url);await ready();
 const data='data:image/png;base64,'+(await fs.readFile('tests/fixtures/layout.png')).toString('base64');
 const fixture=await page.evaluate(async data=>{const {createProject,addVariant}=await import('/state.js'),{addElement}=await import('/elements.js'),p=createProject();for(const [w,h]of [[300,250],[600,500],[300,600],[640,640]])addVariant(p,w,h);for(const type of ['text','image','button'])for(let i=0;i<2;i++)addElement(p,'300x250',type,type==='image'?{data,width:100,height:150}:{},true);p.variants[3].locked=true;return p;},data);
 async function install(p){await page.locator('#project-input').setInputFiles({name:'delete-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});await ready();}
 await install(fixture);
 for(const type of ['text','image','button']){
  const id=fixture.variants[0].elements.find(e=>e.type===type).id;
  await page.locator(`[data-element-type="${type}"]`).click();await page.locator(`[data-layer="${id}"]`).click();
  assert.equal(await page.locator('#delete-element').count(),1,'新增对象必须提供删除入口');
  // Make a preceding text edit so undo proves deletion is a separate history step.
  if(type!=='image')await page.locator('#element-copy').fill('删除前保留的文字');
  const before=await save();await page.locator('#delete-element').focus();await page.keyboard.press('Enter');
  const removed=await save();assert.equal(removed.variants[0].elements.length,5);assert.ok(!removed.variants[0].elements.some(e=>e.id===id));assert.ok(!removed.variants[1].elements.some(e=>e.id===id));assert.ok(removed.variants[3].elements.some(e=>e.id===id));
  assert.equal(await page.locator(`[data-layer="${id}"]`).count(),0);assert.equal(await page.locator('#selection-box').isVisible(),false);assert.equal(await page.locator('#delete-element').isVisible(),false);
  await page.locator('#undo').click();await ready();const restored=await save();assert.deepEqual(restored,before);const order=await page.locator('#element-objects [data-layer^="element-"]').evaluateAll(rows=>rows.map(row=>row.dataset.layer));assert.deepEqual(order,restored.variants[0].elements.map(e=>e.id));
  if(type==='image'){
   const visible=await page.evaluate(async({p,id})=>{const {loadAssets,render}=await import('/render.js'),c=document.createElement('canvas'),r=render(c,p,p.variants[0],await loadAssets(p));return !!r.regions.added.find(e=>e.id===id&&e.rect.w>0);},{p:restored,id});assert.equal(visible,true);
  }
  await page.locator('#redo').click();await ready();assert.deepEqual(await save(),removed);
  // Isolated current-size deletion and reload retain the other size's image/reference.
  await page.reload();await ready();assert.deepEqual(await save(),removed);
  await install(fixture);
 }
 await page.locator('[data-element-type="image"]').click();const imageId=fixture.variants[0].elements.find(e=>e.type==='image').id;await page.locator(`[data-layer="${imageId}"]`).click();await page.locator('#sync-sizes').uncheck();await page.locator('#delete-element').click();const isolated=await save();assert.ok(isolated.variants[1].elements.some(e=>e.id===imageId));
 for(const [type,id]of [['text','title'],['image','image'],['button','cta']]){await page.locator(`[data-element-type="${type}"]`).click();await page.locator(`[data-layer="${id}"]`).click();assert.equal(await page.locator('#delete-element').isVisible(),false);}
 await install(fixture);await page.locator('[data-element-type="image"]').click();await page.locator(`[data-layer="${imageId}"]`).click();
 // Hold a real export request to verify the ordinary busy state disables deletion.
 let release,entered;const gate=new Promise(r=>release=r),requestStarted=new Promise(r=>entered=r);await page.route('**/api/archives',async route=>{entered();await gate;await route.continue();});
 await page.locator('#open-export').click();await page.locator('#export-all').click();await requestStarted;assert.equal(await page.locator('#delete-element').isDisabled(),true);const unchanged=fixture.variants[0].elements.length;await page.locator('#delete-element').evaluate(el=>el.click());release();await page.waitForFunction(()=>!document.querySelector('#export-all').disabled);await page.locator('#close-export').click();assert.equal((await save()).variants[0].elements.length,unchanged);
 await page.locator('.project-menu').evaluate(el=>el.open=false);
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.locator('#delete-element').scrollIntoViewIfNeeded();await page.locator('#delete-element').focus();assert.equal(await page.locator('#delete-element').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,`delete-${width}.png`),fullPage:true});}
 assert.deepEqual(errors,[]);const report={pass:true,root,errors,checks:['text/image/button delete','sync scope and locks','keyboard activation','one-step undo redo','image visibly restores','save reload','busy disabled','builtin controls hidden','desktop/mobile layout']};await fs.writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){console.error('FAIL ROOT',root,'NOTICE',await page.locator('#notice').textContent());await page.screenshot({path:path.join(root,'failure.png'),fullPage:true});throw error;}finally{await browser.close();child.kill();if(stderr)console.error(stderr);}
