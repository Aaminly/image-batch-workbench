import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createProject,addVariant} from '../web/state.js';
import {addElement} from '../web/elements.js';
import {selectLayer} from './support/select-layer.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'cutout-limits-')),port=18844,base=`http://127.0.0.1:${port}`;
const original=await fs.readFile('tests/fixtures/astronaut.png'),originalData='data:image/png;base64,'+original.toString('base64');
const project=createProject();addVariant(project,300,250);const id=addElement(project,'300x250','image',{data:originalData,width:512,height:512});await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(project));
const code=`import sys,json,base64\nfrom pathlib import Path\nimport server,uvicorn\nfrom drafts import DraftStore\nserver.ROOT=Path(sys.argv[1]);s=DraftStore(server.ROOT/'.local/drafts');r=s.create();p=json.loads((server.ROOT/'fixture.json').read_text())\nfor key,value in p['media'].items():p['media'][key]=s.asset(r['id'],base64.b64decode(value.split(',')[1]))\ns.save(r['id'],0,{'project':p,'ui':{'currentId':'300x250','excludedExportSizes':[]}})\nuvicorn.run(server.app,host='127.0.0.1',port=${port},log_level='warning')`;
const child=spawn('.venv/bin/python',['-c',code,root]);let logs='';child.stderr.on('data',b=>logs+=b);
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1512,height:982}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const record=async()=>{const batch=await page.locator('#batch-select').inputValue();return(await page.request.get(base+'/api/drafts/'+batch)).json();};
try{
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#batch-select').disabled&&document.querySelector('#stage').dataset.canvasState==='ready');await selectLayer(page,id);await page.waitForFunction(()=>!document.querySelector('#cutout').disabled);
 await page.locator('#keep-text').check();await page.locator('#split-text').check();
 // Valid PNG with trailing padding exercises response size without requiring a 24 MP model call.
 const padded=bytes=>'data:image/png;base64,'+Buffer.concat([original,Buffer.alloc(bytes-original.length)]).toString('base64');
 let result={subject:padded(24*1024*1024),text:originalData,width:512,height:512,bounds:[0,0,512,512]};
 await page.route('**/api/cutout?mode=split',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)}));
 await page.locator('#cutout').click();await page.waitForFunction(()=>!document.querySelector('#cutout').disabled);assert.match(await page.locator('#notice').textContent(),/抠图完成/);
 await page.waitForFunction(()=>document.querySelector('#draft-status').textContent.startsWith('已保存'));const before=await record();assert.equal(before.project.variants[0].elements.length,2);
 result={...result,subject:padded(32*1024*1024+1)};await page.locator('#cutout').click();await page.waitForFunction(()=>!document.querySelector('#cutout').disabled);assert.match(await page.locator('#notice').textContent(),/超过32 MB/);assert.deepEqual(await record(),before);
 assert.deepEqual(errors,[]);console.log('PASS split JSON above 32 MiB with legal images saves; oversized individual PNG leaves draft unchanged');
}finally{await browser.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(root,{recursive:true,force:true});if(logs)console.error(logs);}
