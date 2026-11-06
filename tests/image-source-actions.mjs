import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createProject,addVariant} from '../web/state.js';
import {addElement} from '../web/elements.js';
import {applyImageSource,imageSources} from '../web/image-content.js';
import {selectLayer} from './support/select-layer.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'image-actions-')),port=18842,ip=process.env.STUDIO_TEST_IP||'127.0.0.1',base=`http://${ip}:${port}`;
const data=file=>fs.readFile(file).then(b=>'data:image/png;base64,'+b.toString('base64'));
const original=await data('tests/fixtures/astronaut.png'),result=await data('tests/fixtures/layout.png');
const project=createProject();addVariant(project,300,250);const one=addElement(project,'300x250','image',{data:original,width:512,height:512}),two=addElement(project,'300x250','image',{data:result,width:100,height:100});applyImageSource(project,'300x250',one,{original,cutout:result,usingCutout:true});await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(project));
const code=`import sys,json,base64\nfrom pathlib import Path\nimport server,uvicorn\nfrom drafts import DraftStore\nserver.ROOT=Path(sys.argv[1]);s=DraftStore(server.ROOT/'.local/drafts');r=s.create();p=json.loads((server.ROOT/'fixture.json').read_text())\nfor key,value in p['media'].items():p['media'][key]=s.asset(r['id'],base64.b64decode(value.split(',')[1]))\ns.save(r['id'],0,{'project':p,'ui':{'currentId':'300x250','excludedExportSizes':[]}})\nuvicorn.run(server.app,host='0.0.0.0',port=${port},log_level='warning')`;
const child=spawn('.venv/bin/python',['-c',code,root],{env:{...process.env,STUDIO_LAN_IP:ip==='127.0.0.1'?'':ip}});let logs='';child.stderr.on('data',b=>logs+=b);
const browser=await chromium.launch({channel:'chrome',headless:true}),p=await browser.newPage({viewport:{width:1512,height:982},acceptDownloads:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const ready=()=>p.waitForFunction(()=>!document.querySelector('#batch-select').disabled&&document.querySelector('#stage').dataset.canvasState==='ready');
async function snapshot(){await ready();await p.locator('.project-menu').evaluate(e=>e.open=true);const pending=p.waitForEvent('download');await p.locator('#save-project').click();const value=JSON.parse(await fs.readFile(await(await pending).path(),'utf8'));await p.locator('.project-menu').evaluate(e=>e.open=false);return value;}
async function paste(data){await p.evaluate(async data=>{const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(new File([blob],'pasted.png',{type:'image/png'}));document.querySelector('#stage').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));},data);await ready();}
try{
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 await p.goto(base);await ready();await selectLayer(p,one);const before=await snapshot();
 await paste(original);const replaced=await snapshot();assert.equal(imageSources(replaced,replaced.variants[0],one).cutout===null,true,'paste replaces selected image and clears its old result');assert.deepEqual(imageSources(replaced,replaced.variants[0],two),imageSources(before,before.variants[0],two));assert.equal(replaced.assets.original,null,'paste must not fill a hidden primary slot');
 await p.locator('#undo').click();assert.deepEqual(await snapshot(),before);await p.locator('#redo').click();assert.deepEqual(await snapshot(),replaced);
 await selectLayer(p,'title');await paste(original);const added=await snapshot();assert.equal(added.variants[0].elements.length,3);assert.equal(added.assets.original,null);
 const beforeImport=await snapshot();await p.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await ready();const imported=await snapshot();assert.equal(imported.variants[0].elements.length,beforeImport.variants[0].elements.length+1);assert.deepEqual(imageSources(imported,imported.variants[0],one),imageSources(beforeImport,beforeImport.variants[0],one));
 await selectLayer(p,one);const invalidChooser=p.waitForEvent('filechooser');await p.locator('#replace-element-image').click();await(await invalidChooser).setFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});await ready();assert.deepEqual(await snapshot(),imported);
 // Existing original/result state is removed by an explicit file replacement too.
 const replaceChooser=p.waitForEvent('filechooser');await p.locator('#replace-element-image').click();await(await replaceChooser).setFiles('tests/fixtures/layout.png');await ready();const file=await snapshot();assert.ok(imageSources(file,file.variants[0],one).original===result);assert.equal(imageSources(file,file.variants[0],one).cutout,null);
 await p.reload();await ready();assert.deepEqual(await snapshot(),file);
 await selectLayer(p,one);await p.waitForFunction(()=>!document.querySelector('#cutout').disabled);
 await p.route('**/api/cutout',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.alloc(32*1024*1024+1)}));await p.locator('#cutout').click();await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('超过32 MB'),null,{timeout:4000});assert.deepEqual(await snapshot(),file);await p.unroute('**/api/cutout');
 await p.route('**/api/cutout',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('broken image')}));await p.locator('#cutout').click();await ready();assert.deepEqual(await snapshot(),file);await p.unroute('**/api/cutout');
assert.deepEqual(errors,[]);console.log('PASS selected-image paste, no-selection paste adds, file replacement, undo/redo, invalid-image atomicity, saved refresh');
}catch(e){console.error(e);throw e;}
finally{await browser.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(root,{recursive:true,force:true});if(logs)console.error(logs);}
