import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-elements-')),port=18769,url=`http://127.0.0.1:${port}`;
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
 await page.locator('[data-element-type="text"]').click();
 assert.equal(await page.getByRole('button',{name:'＋ 新增文字',exact:true}).count(),1,'文字列表必须提供新增入口');
 for(const type of ['text','button','image']){
  await page.locator(`[data-element-type="${type}"]`).click();
  for(let i=0;i<2;i++){
   if(type==='image'){const chooser=page.waitForEvent('filechooser');await page.locator('#add-element').click();await(await chooser).setFiles('tests/fixtures/layout.png');await ready();}
   else await page.locator('#add-element').click();
   await page.waitForFunction(()=>document.querySelector('#element-objects [data-layer^="element-"][aria-pressed="true"]'));
   if(type!=='image'){await page.locator('#element-copy').fill(`${type} ${i+1}`);if(type==='button')await page.locator('#accent').fill(i?'#ff0000':'#00ff00');}
   const selected=await page.locator('#element-objects [aria-pressed="true"]').getAttribute('data-layer'),box=await page.locator('#selection-box').boundingBox();assert.ok(box);const x=box.x+Math.min(5,box.width*.2),y=box.y+Math.min(12,box.height*.3);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8,y+5);await page.mouse.up();assert.equal(await page.locator('#element-objects [aria-pressed="true"]').getAttribute('data-layer'),selected);
   await page.locator('#center-horizontal').click();await page.locator('#inspector-more').evaluate(el=>el.open=true);await page.locator('#layer-scale').fill('1.2');
  }
 }
 // A cancelled chooser and invalid bytes must not add an object or a history step.
 const beforeCancel=await save();
 const chooser=page.waitForEvent('filechooser');await page.locator('#add-element').click();await(await chooser).setFiles([]);
 assert.deepEqual(await save(),beforeCancel);
 await page.locator('#element-image-input').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});await ready();
 assert.deepEqual(await save(),beforeCancel);
 // One click is one undo operation, and redo restores exactly that object.
 await page.locator('[data-element-type="text"]').click();await page.locator('#add-element').click();assert.equal((await save()).variants[0].elements.length,7);
 await page.locator('#undo').click();await ready();assert.equal((await save()).variants[0].elements.length,6);
 await page.locator('#redo').click();await ready();assert.equal((await save()).variants[0].elements.length,7);
 await page.locator('#undo').click();await ready();
 const saved=await save();assert.equal(saved.variants[0].elements.length,6);assert.equal(saved.variants[0].elements[0].text,'text 1');assert.equal(saved.variants[0].elements[2].accent,'#00ff00');assert.equal(saved.variants[0].elements[3].accent,'#ff0000');
 const projectPath=path.join(root,'saved.json');await fs.writeFile(projectPath,JSON.stringify(saved));
 await page.reload();await ready();assert.equal((await save()).variants[0].elements.length,6,'草稿刷新保留对象');
 await page.locator('#project-input').setInputFiles(projectPath);await page.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});assert.equal((await save()).variants[0].elements.length,6);
 const pixels=await page.evaluate(async p=>{const {loadAssets,render}=await import('/render.js'),{hitTest}=await import('/canvas-editor.js');const c=document.createElement('canvas'),v=p.variants[0],assets=await loadAssets(p),result=render(c,p,v,assets),copy=structuredClone(p);copy.variants[0].elements=[];const old=document.createElement('canvas');render(old,copy,copy.variants[0],assets);const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data,b=old.getContext('2d').getImageData(0,0,old.width,old.height).data;let changed=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])changed++;return {changed,count:result.regions.added?.length,hit:hitTest(result.regions,v,150,50)};},saved);
 assert.ok(pixels.changed>0);assert.equal(pixels.count,6);
 // Exercise actual pointer movement and corner handles for each added type.
 for(const type of ['text','button','image']){
  const id=saved.variants[0].elements.find(e=>e.type===type).id;await page.locator(`[data-element-type="${type}"]`).click();await page.locator(`[data-layer="${id}"]`).click();
  await page.locator('#center-horizontal').click();await page.locator('#center-vertical').click();
  // Select via actual painted pixels and then move with the canvas keyboard.
  const before=await save();await page.locator('#preview').focus();await page.keyboard.press('ArrowRight');const moved=await save();
  assert.equal(moved.variants[0].elements.find(e=>e.id===id).x,before.variants[0].elements.find(e=>e.id===id).x+1);
  const handle=page.locator('[data-resize="se"]'),box=await handle.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+12,box.y+box.height/2+8);await page.mouse.up();
  const resized=await save(),e=resized.variants[0].elements.find(e=>e.id===id),old=moved.variants[0].elements.find(e=>e.id===id);assert.ok((e.style||e).scaleX>(old.style||old).scaleX);
 }
 const finalProject=await save();
 // The production PNG and ZIP routes must contain the same rendered objects.
 const expected=await page.evaluate(async p=>{const {loadAssets,render}=await import('/render.js'),{compressedPng}=await import('/compression.js'),c=document.createElement('canvas');render(c,p,p.variants[0],await loadAssets(p));return Array.from(new Uint8Array(await(await compressedPng(c)).arrayBuffer()));},finalProject);
 const pngWait=page.waitForEvent('download');await page.locator('#export-png').click();const png=Buffer.from(await fs.readFile(await(await pngWait).path()));assert.deepEqual(png,Buffer.from(expected));
 await page.locator('#open-export').click();await page.locator('#export-all').click();await page.waitForFunction(()=>!document.querySelector('#export-all').disabled&&!document.querySelector('#export-download').hidden);const zipResponse=await page.request.get(new URL(await page.locator('#export-download').getAttribute('href'),url).href);assert.equal(zipResponse.status(),200);await fs.writeFile(path.join(root,'export.zip'),await zipResponse.body());await fs.writeFile(path.join(root,'expected.png'),Buffer.from(expected));
 const {execFileSync}=await import('node:child_process');execFileSync('.venv/bin/python',['-c',"import zipfile,sys,pathlib; z=zipfile.ZipFile(sys.argv[1]); names=[n for n in z.namelist() if n.endswith('.png')]; assert len(names)==1; assert z.read(names[0])==pathlib.Path(sys.argv[2]).read_bytes()",path.join(root,'export.zip'),path.join(root,'expected.png')]);
 await page.locator('#close-export').click();await page.locator('.project-menu').evaluate(el=>el.open=false);
 // Old layout remains byte-for-byte identical after adding objects.
 const stable=await page.evaluate(async p=>{const {layoutText}=await import('/text-layout.js'),c=document.createElement('canvas').getContext('2d'),v=p.variants[0],a=layoutText(c,p,v).filter(e=>!e.id.startsWith('element-'));return JSON.stringify(a)===JSON.stringify(layoutText(c,p,{...v,elements:[]}));},finalProject);assert.equal(stable,true);
 for(const size of [{width:1440,height:720},{width:390,height:844},{width:768,height:640}]){
  await page.setViewportSize(size);await page.locator('[data-element-type="text"]').click();await page.locator(`[data-layer="${finalProject.variants[0].elements[0].id}"]`).click();if(await page.locator('#close-text-style').isVisible())await page.locator('#close-text-style').click();await page.locator('#add-element').scrollIntoViewIfNeeded();assert.ok(await page.locator('#add-element').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(root,`viewport-${size.width}x${size.height}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:path.join(root,'desktop.png'),fullPage:true});
 const mixed=await page.evaluate(async()=>{
  const {createProject,addVariant}=await import('/state.js'),{addElement}=await import('/elements.js'),{loadAssets,render}=await import('/render.js');
  const p=createProject(),a=addVariant(p,300,250),b=addVariant(p,640,640),src=document.createElement('canvas');src.width=100;src.height=50;const c=src.getContext('2d');c.fillStyle='#ea3344';c.fillRect(0,0,100,50);const data=src.toDataURL();addElement(p,a.id,'image',{data,width:100,height:50},true);const assets=await loadAssets(p),out=document.createElement('canvas');render(out,p,b,assets);const e=b.elements[0],r=out.getContext('2d').getImageData(Math.round(e.x+e.width/2),Math.round(e.y+e.height/2),1,1).data;const start=performance.now();for(let i=0;i<10;i++)render(out,p,b,assets);return {aspect:e.width/e.height,width:e.width,pixel:[...r],renderMs:(performance.now()-start)/10};
 });assert.equal(mixed.aspect,2);assert.equal(mixed.width,320);assert.deepEqual(mixed.pixel,[234,51,68,255]);
 const scopeFixture=await page.evaluate(async()=>{const {createProject,addVariant}=await import('/state.js'),p=createProject();addVariant(p,300,250);addVariant(p,600,500);return p;});
 await page.locator('#project-input').setInputFiles({name:'scope.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scopeFixture))});await page.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});await ready();
 await page.locator('#sync-sizes').uncheck();await page.locator('[data-element-type="text"]').click();await page.locator('#add-element').click();await page.locator('#sync-sizes').check();
 assert.equal(await page.locator('#scope-summary').textContent(),'影响 1 个 ›');assert.equal(await page.locator('#scope-list li').count(),1);
 assert.match(await page.locator('#add-element').getAttribute('title'),/2/);await page.locator('#tab-background').click();assert.equal(await page.locator('#background-scope').textContent(),'影响 2 个尺寸');
 const report={pass:true,root,pixels,mixed,errors,checks:['six independent elements','pointer drag and corner resize','independent button colors','cancel/error atomic','undo redo','draft reload','project reopen','PNG ZIP exact bytes','responsive layouts','legacy text geometry stable']};await fs.writeFile(path.join(root,'evidence.json'),JSON.stringify(report,null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report));
}catch(error){console.error('FAIL ROOT',root,'NOTICE',await page.locator('#notice').textContent());await page.screenshot({path:path.join(root,'failure.png'),fullPage:true});throw error;}finally{await browser.close();child.kill();if(stderr)console.error(stderr);}
