import {selectLayer,importLegacyImage} from './support/select-layer.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProject,addVariant} from '../web/state.js';

const ip=process.env.STUDIO_TEST_IP||execFileSync('.venv/bin/python',['-c','from launcher import configuration;print(configuration(True)[1])'],{encoding:'utf8'}).trim();
const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-lan-')),port=18831,base=`http://${ip}:${port}`;
const project=createProject();addVariant(project,300,250);await fs.writeFile(path.join(root,'project.json'),JSON.stringify(project));
const code=`import sys,json\nfrom pathlib import Path\nimport server,uvicorn\nfrom drafts import DraftStore\nserver.ROOT=Path(sys.argv[1]);store=DraftStore(server.ROOT/'.local/drafts');r=store.create();store.save(r['id'],0,{'project':json.loads((server.ROOT/'project.json').read_text()),'ui':{'currentId':'300x250','excludedExportSizes':[]}})\nuvicorn.run(server.app,host='0.0.0.0',port=${port},log_level='warning')`;
const child=spawn('.venv/bin/python',['-c',code,root],{env:{...process.env,STUDIO_LAN_IP:ip==='127.0.0.1'?'':ip}});let logs='';child.stderr.on('data',b=>logs+=b);
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];context.on('page',p=>{p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());});
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');assert.ok(!(await p.locator('#draft-status').textContent()).includes('失败'),await p.locator('#draft-status').textContent());await p.waitForFunction(()=>!document.querySelector('#project-input').disabled);};
const saved=p=>p.waitForFunction(()=>document.querySelector('#draft-status').textContent.startsWith('已保存'));
try{
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`${base}/api/status`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 const p=await context.newPage();await p.goto(base);await ready(p);
 assert.deepEqual(await p.evaluate(()=>[isSecureContext,typeof crypto.randomUUID,typeof navigator.locks]),ip==='127.0.0.1'?[true,'function','object']:[false,'undefined','undefined']);
 await selectLayer(p,'title');await p.locator('#title').fill('LAN saved title');await saved(p);
 await p.reload();await ready(p);await selectLayer(p,'title');assert.equal(await p.locator('#title').inputValue(),'LAN saved title');
 await p.locator('[data-element-type="text"]').click();await p.locator('#add-element').click();await p.locator('#element-copy').fill('LAN added text');await saved(p);
 const backgroundSaved=p.waitForResponse(r=>r.request().method()==='PUT'&&r.ok());await p.locator('#background-files').setInputFiles('tests/fixtures/layout.png');await backgroundSaved;await saved(p);
 const imageSaved=p.waitForResponse(r=>r.request().method()==='PUT'&&r.ok());await importLegacyImage(p,'tests/fixtures/layout.png');await imageSaved;await saved(p);
 const record=await p.evaluate(async()=>fetch('/api/drafts/'+document.querySelector('#batch-select').value).then(r=>r.json()));assert.equal(record.project.backgrounds.length,1);assert.ok(record.project.assets.original);assert.ok(JSON.stringify(record.project).includes('LAN added text'));
 const download=p.waitForEvent('download');await p.locator('#export-png').click();const png=await download;assert.equal(png.suggestedFilename(),'300x250.png');assert.equal(await png.failure(),null);
 console.log('PASS LAN HTTP editing, added text, background/subject import, persisted assets/text, PNG export, autosave and saved reload');
 // Keep the real server unchanged while the local checkpoint records an edit.
 await p.route('**/api/drafts/*',r=>r.request().method()==='PUT'?r.fulfill({status:503,contentType:'application/json',body:'{"detail":"test temporarily unavailable"}'}):r.continue());
 await selectLayer(p,'title');await p.locator('#title').fill('LAN pending checkpoint');
 await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('失败'));
 const owner=await p.evaluate(()=>sessionStorage.getItem('ad-studio-page'));
 await p.unrouteAll();await p.reload();await ready(p);await saved(p);await selectLayer(p,'title');assert.equal(await p.locator('#title').inputValue(),'LAN pending checkpoint');assert.equal(await p.evaluate(()=>sessionStorage.getItem('ad-studio-page')),owner);
 console.log('PASS LAN unsaved checkpoint refresh recovery');
 // A slow or unresponsive IDB connection is not proof another editor owns this ID.
 await p.route('**/api/drafts/*',r=>r.request().method()==='PUT'?r.fulfill({status:503,contentType:'application/json',body:'{"detail":"test offline"}'}):r.continue());
 await p.locator('#title').fill('checkpoint survives slow lock');await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('失败'));await p.unrouteAll();
 await p.goto(`${base}/assets/favicon.svg`);
 const blocker=await context.newPage();await blocker.goto(`${base}/assets/favicon.svg`);
 await blocker.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open(`ad-studio-page-lock:${id}`);r.onsuccess=()=>{window.blockingDB=r.result;resolve();};r.onerror=()=>reject(r.error);}),owner);
 if(ip!=='127.0.0.1'){
  await p.goto(base);await p.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');
  assert.equal(await p.evaluate(()=>sessionStorage.getItem('ad-studio-page')),owner,'slow IDB must not abandon the pending checkpoint identity');
  assert.ok((await p.locator('#draft-status').textContent()).includes('失败'));
 }
 await blocker.close();await p.goto(base);await ready(p);await saved(p);await selectLayer(p,'title');assert.equal(await p.locator('#title').inputValue(),'checkpoint survives slow lock');
 console.log('PASS slow/unresponsive lock retains identity and pending checkpoint, recovers after release');

 // Deliberately clone sessionStorage IDs as browser duplicate-tab does.
 const copies=await Promise.all([context.newPage(),context.newPage()]);
 await Promise.all(copies.map(async q=>{await q.addInitScript(id=>{if(!sessionStorage.getItem('ad-studio-page'))sessionStorage.setItem('ad-studio-page',id);},owner);await q.goto(base);await ready(q);await q.locator('#draft-new').click();await saved(q);}));
 const ids=await Promise.all([p,...copies].map(q=>q.evaluate(()=>sessionStorage.getItem('ad-studio-page'))));assert.equal(new Set(ids).size,3);
 await Promise.all([p,...copies].map(async(q,i)=>{await q.route('**/api/drafts/*',r=>r.request().method()==='PUT'?r.fulfill({status:503,contentType:'application/json',body:'{"detail":"test offline"}'}):r.continue());await selectLayer(q,'title');await q.locator('#title').fill(`isolated checkpoint ${i}`);await q.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('失败'));}));
 await Promise.all([p,...copies].map(async(q,i)=>{await q.unrouteAll();await q.reload();await ready(q);await saved(q);await selectLayer(q,'title');assert.equal(await q.locator('#title').inputValue(),`isolated checkpoint ${i}`);}));
 await Promise.all(copies.map(q=>q.close()));await p.reload();await ready(p);assert.equal(await p.evaluate(()=>sessionStorage.getItem('ad-studio-page')),owner);
 assert.deepEqual(errors,[]);console.log('PASS three copied tabs start, preserve isolated checkpoints, refresh and close without stealing owner');
 console.log(`Verified ${base} using local Chrome; no second physical device tested`);
}finally{await browser.close();child.kill();await new Promise(ok=>child.exitCode!==null?ok():child.once('exit',ok));await fs.rm(root,{recursive:true,force:true});if(logs)console.error(logs);}
