import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createProject,addVariant} from '../web/state.js';
import {addElement} from '../web/elements.js';
import {imageSources} from '../web/image-content.js';
import {selectLayer} from './support/select-layer.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-cutouts-')),out=path.resolve('work/image-cutouts');await fs.mkdir(out,{recursive:true});
execFileSync('.venv/bin/python',['-c',"from PIL import Image;import sys;Image.open('tests/fixtures/astronaut.png').crop((100,20,440,450)).save(sys.argv[1])",path.join(root,'portrait.png')]);
const data=file=>fs.readFile(file).then(b=>'data:image/png;base64,'+b.toString('base64'));
const original=await data('tests/fixtures/astronaut.png'),portrait=await data(path.join(root,'portrait.png'));
const project=createProject();for(const size of [[300,250],[600,500],[640,640],[600,900]])addVariant(project,...size);
const one=addElement(project,'300x250','image',{data:original,width:512,height:512}),two=addElement(project,'300x250','image',{data:portrait,width:340,height:430});project.variants[2].locked=true;
await fs.writeFile(path.join(root,'project.json'),JSON.stringify(project));
const ip=process.env.STUDIO_TEST_IP||'127.0.0.1',port=18841,base=`http://${ip}:${port}`;
const code=`import sys,json\nfrom pathlib import Path\nimport server,uvicorn\nfrom drafts import DraftStore\nserver.ROOT=Path(sys.argv[1]);store=DraftStore(server.ROOT/'.local/drafts');r=store.create();p=json.loads((server.ROOT/'project.json').read_text())\nimport base64\nfor key,value in p['media'].items():p['media'][key]=store.asset(r['id'],base64.b64decode(value.split(',')[1]))\nstore.save(r['id'],0,{'project':p,'ui':{'currentId':'300x250','excludedExportSizes':[]}})\nuvicorn.run(server.app,host='0.0.0.0',port=${port},log_level='warning')`;
const child=spawn('.venv/bin/python',['-c',code,root],{env:{...process.env,STUDIO_LAN_IP:ip==='127.0.0.1'?'':ip}});let logs='';child.stderr.on('data',b=>logs+=b);
const browser=await chromium.launch({channel:'chrome',headless:true}),p=await browser.newPage({viewport:{width:1512,height:982},acceptDownloads:true});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const ready=()=>p.waitForFunction(()=>!document.querySelector('#batch-select').disabled&&document.querySelector('#stage').dataset.canvasState==='ready');
async function saved(){await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.startsWith('已保存'));}
async function snapshot(){await ready();await p.locator('.project-menu').evaluate(e=>e.open=true);const event=p.waitForEvent('download');await p.locator('#save-project').click();const result=JSON.parse(await fs.readFile(await(await event).path(),'utf8'));await p.locator('.project-menu').evaluate(e=>e.open=false);return result;}
async function install(value){await p.locator('.project-menu').evaluate(e=>e.open=true);await p.locator('#project-input').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('项目已打开'));await ready();await p.locator('.project-menu').evaluate(e=>e.open=false);}
const timings={};
try{
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 await p.goto(base);await ready();
 const initial=await snapshot();
 for(const id of [one,two]){
  await selectLayer(p,id);assert.equal(await p.locator('#cutout').isVisible(),true,'every selected image must show cutout');await p.waitForFunction(()=>!document.querySelector('#cutout').disabled);
  const before=await snapshot(),other=id===one?two:one,otherBefore=imageSources(before,before.variants[0],other),frame=structuredClone(before.variants[0].elements.find(e=>e.id===id));
  const started=Date.now();await p.locator('#cutout').click();assert.equal(await p.locator('[data-element-type="image"]').isDisabled(),true);
  await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('抠图完成')||document.querySelector('#notice').classList.contains('error'),null,{timeout:180000});assert.match(await p.locator('#notice').textContent(),/抠图完成/);timings[id]=Date.now()-started;
  const result=await snapshot(),sources=imageSources(result,result.variants[0],id);assert.ok(sources.cutout);assert.notEqual(sources.original,sources.cutout);assert.equal(sources.original,id===one?original:portrait);assert.equal(sources.usingCutout,true);assert.deepEqual(imageSources(result,result.variants[0],other),otherBefore);
  assert.deepEqual(imageSources(result,result.variants[1],id),sources);assert.equal(imageSources(result,result.variants[2],id).cutout,null);assert.equal(imageSources(result,result.variants[3],id),null);
  for(const key of ['x','y','width','height','scaleX','scaleY'])assert.equal(result.variants[0].elements.find(e=>e.id===id)[key],frame[key]);
  await fs.writeFile(path.join(out,id+'-original.png'),Buffer.from(sources.original.split(',')[1],'base64'));await fs.writeFile(path.join(out,id+'-result.png'),Buffer.from(sources.cutout.split(',')[1],'base64'));
  await p.locator('#use-original').click();const switched=await snapshot();assert.equal(imageSources(switched,switched.variants[0],id).usingCutout,false);
  const sourceState=await snapshot();assert.equal(imageSources(sourceState,sourceState.variants[0],id).original,sources.original);
  await p.locator('#use-cutout').click();const active=await snapshot();await p.locator('#undo').click();assert.deepEqual(await snapshot(),sourceState);await p.locator('#redo').click();assert.deepEqual(await snapshot(),active);
 }
 const result=await snapshot();await saved();await p.reload();await ready();assert.deepEqual(await snapshot(),result);console.log('PASS two real independent added-image cutouts, source switching, locks, undo/redo, saved refresh',timings);
 await selectLayer(p,one);await p.route('**/api/cutout',r=>r.fulfill({status:503,contentType:'application/json',body:'{"detail":"test model unavailable"}'}));await p.locator('#cutout').click();await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('test model unavailable'));assert.deepEqual(await snapshot(),result);await p.unroute('**/api/cutout');
 // A failed server save leaves a real browser checkpoint; reload must restore it.
 await p.route('**/api/drafts/*',r=>r.request().method()==='PUT'?r.fulfill({status:503,contentType:'application/json',body:'{"detail":"test save unavailable"}'}):r.continue());await p.locator('#use-original').click();await p.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('失败'));const pending=await snapshot();await p.unrouteAll();await p.reload();await ready();await saved();assert.deepEqual(await snapshot(),pending);await selectLayer(p,one);await p.locator('#use-cutout').click();await saved();
 const png=p.waitForEvent('download');await p.locator('#export-png').click();await(await png).saveAs(path.join(out,'added-only-300x250.png'));await ready();
 await p.locator('#open-export').click();const zip=p.waitForEvent('download');await p.locator('#export-all').click();await(await zip).saveAs(path.join(out,'added-only.zip'));await p.locator('#close-export').click();await ready();
 // Old slots remain compatible but are presented as ordinary image objects.
 const legacy=await snapshot();legacy.assets.original=original;legacy.assets.logo=portrait;legacy.assets.logoOriginal=portrait;await install(legacy);
 for(const id of ['image','logo']){await selectLayer(p,id);await p.waitForFunction(()=>!document.querySelector('#cutout').disabled);await p.locator('#cutout').click();await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('抠图完成')||document.querySelector('#notice').classList.contains('error'),null,{timeout:180000});assert.match(await p.locator('#notice').textContent(),/抠图完成/);const state=await snapshot();assert.ok(imageSources(state,state.variants[0],id).cutout);await p.locator('#use-original').click();const restored=await snapshot();assert.equal(imageSources(restored,restored.variants[0],id).usingCutout,false);}
 await selectLayer(p,two);await p.screenshot({path:path.join(out,'desktop.png')});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,timings,errors,base,checks:['two actual model results','legacy image/logo real cutout','source isolation','locked/group isolation','unchanged transform','undo redo','saved and unsaved refresh','failure atomicity','added-only PNG ZIP']},null,2));
 console.log('PASS legacy image/Logo, independent originals, failure safety, saved/pending reload, added-only PNG/ZIP; screenshots saved');
}catch(error){console.error(error);console.error('NOTICE',await p.locator('#notice').textContent().catch(()=>''));await p.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(root,{recursive:true,force:true});if(logs)console.error(logs);}
