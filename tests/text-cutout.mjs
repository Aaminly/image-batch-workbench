import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createProject,addVariant} from '../web/state.js';
import {addElement} from '../web/elements.js';
import {selectLayer} from './support/select-layer.mjs';
const out=path.resolve('work/text-cutout'),root=await fs.mkdtemp(path.join(os.tmpdir(),'text-cutout-'));
await fs.mkdir(out,{recursive:true});
execFileSync('.venv/bin/python',['-c',`from PIL import Image,ImageDraw,ImageFont
im=Image.new('RGBA',(1100,720),'#f0e8d8');im.alpha_composite(Image.open('tests/fixtures/astronaut.png').convert('RGBA'),(30,80))
d=ImageDraw.Draw(im);d.text((620,180),'精彩短剧',font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',62),fill='#142850');d.text((620,290),'GOOD',font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',64),fill='#8b2438')
im.save('work/text-cutout/original.png')`]);
const original='data:image/png;base64,'+(await fs.readFile(path.join(out,'original.png'))).toString('base64');
const project=createProject();for(const size of [[300,250],[600,500],[640,640]])addVariant(project,...size);
const id=addElement(project,'300x250','image',{data:original,width:1100,height:720});project.variants[2].locked=true;
await fs.writeFile(path.join(root,'project.json'),JSON.stringify(project));
const port=18842,base=`http://127.0.0.1:${port}`;
const code=`import sys,json,base64\nfrom pathlib import Path\nimport server,uvicorn\nfrom drafts import DraftStore\nserver.ROOT=Path(sys.argv[1]);store=DraftStore(server.ROOT/'.local/drafts');r=store.create();p=json.loads((server.ROOT/'project.json').read_text())\nfor key,value in p['media'].items():p['media'][key]=store.asset(r['id'],base64.b64decode(value.split(',')[1]))\nstore.save(r['id'],0,{'project':p,'ui':{'currentId':'300x250','excludedExportSizes':[]}})\nuvicorn.run(server.app,host='127.0.0.1',port=${port},log_level='warning')`;
const child=spawn('.venv/bin/python',['-c',code,root]);let logs='';child.stderr.on('data',b=>logs+=b);
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1512,height:982},acceptDownloads:true});page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));const evidence={requests:[],errors,splitOnly:process.env.SPLIT_ONLY==='1'};
const ready=()=>page.waitForFunction(()=>!document.querySelector('#batch-select').disabled&&document.querySelector('#stage').dataset.canvasState==='ready');
async function snapshot(){await ready();await page.locator('.project-menu').evaluate(e=>e.open=true);const event=page.waitForEvent('download');await page.locator('#save-project').click();const data=JSON.parse(await fs.readFile(await(await event).path(),'utf8'));await page.locator('.project-menu').evaluate(e=>e.open=false);return data;}
async function run(mode,checkBusy=true){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/cutout'&&r.request().method()==='POST',{timeout:180000});await page.locator('#cutout').click();if(checkBusy){assert.equal(await page.locator('#keep-text').isDisabled(),true);await page.screenshot({path:path.join(out,'loading.png')});}const r=await response;evidence.requests.push({mode,status:r.status(),url:r.url()});assert.equal(r.status(),200);await page.waitForFunction(()=>!document.querySelector('#cutout').disabled);assert.match(await page.locator('#notice').textContent(),/抠图完成/);}

try{
 for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/api/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 await page.goto(base);await ready();await selectLayer(page,id);
 assert.equal(await page.locator('#keep-text').count(),1,'text options must be available for selected images');
 assert.equal(await page.locator('#keep-text').isChecked(),false);assert.equal(await page.locator('#split-text').isDisabled(),true);
 const a=await page.locator('#source-switch').boundingBox(),b=await page.locator('#cutout-options').boundingBox(),c=await page.locator('#cutout').boundingBox();assert.ok(a.y+a.height<=b.y&&b.y+b.height<=c.y,'approved control order');
 await page.screenshot({path:path.join(out,'desktop-default.png')});await page.locator('#keep-text').focus();await page.locator('#cutout-options').screenshot({path:path.join(out,'focus.png')});await page.keyboard.press('Space');assert.equal(await page.locator('#split-text').isDisabled(),false);await page.locator('#split-text').check();await page.locator('#keep-text').uncheck();assert.equal(await page.locator('#split-text').isChecked(),false);assert.equal(await page.locator('#split-text').isDisabled(),true);
 if(!evidence.splitOnly){await run('plain');assert.equal((await snapshot()).variants[0].elements.length,1);}
 await page.locator('#keep-text').check();if(!evidence.splitOnly){await run('keep');assert.equal((await snapshot()).variants[0].elements.length,1);}
 await page.locator('#split-text').check();await run('split');let split=await snapshot();
 const layer=split.variants[0].elements.find(e=>e.cutoutParent===id);assert.ok(layer);const parent=split.variants[0].elements.find(e=>e.id===id),bounds=[Math.round((layer.x-parent.x)*1100/parent.width),Math.round((layer.y-parent.y)*720/parent.height),Math.round((layer.x+layer.width-parent.x)*1100/parent.width),Math.round((layer.y+layer.height-parent.y)*720/parent.height)],result={subject:split.media[parent.cutoutMedia],text:split.media[layer.media],width:1100,height:720,bounds};assert.equal(split.variants[1].elements.length,2);assert.equal(split.variants[2].elements.length,1);
 await page.screenshot({path:path.join(out,'desktop-split.png')});
 await page.locator('#use-original').click();assert.equal(await page.locator(`[data-layer="${layer.id}"]`).isVisible(),false);const switched=await snapshot();
 await page.locator('#use-cutout').click();assert.equal(await page.locator(`[data-layer="${layer.id}"]`).isVisible(),true);await page.locator('#undo').click();assert.deepEqual(await snapshot(),switched);await page.locator('#redo').click();
 await selectLayer(page,layer.id);assert.equal(await page.locator('#split-text').isDisabled(),true);await page.locator('#element-x').fill('90');await page.locator('#element-x').dispatchEvent('input');split=await snapshot();assert.equal(split.variants[0].elements.find(e=>e.id===layer.id).x,90);
 await page.waitForFunction(()=>document.querySelector('#draft-status').textContent.startsWith('已保存'));await page.reload();await ready();assert.deepEqual(await snapshot(),split);
 await selectLayer(page,id);await page.locator('#keep-text').check();await page.locator('#split-text').check();
 await page.route('**/api/cutout?mode=split',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)}));await run('split',false);assert.equal((await snapshot()).variants[0].elements.length,2);await page.unrouteAll();
 const stable=await snapshot();await page.route('**/api/cutout?mode=split',r=>r.fulfill({status:422,contentType:'application/json',body:JSON.stringify({detail:'文字覆盖主体，无法分层'})}));await page.locator('#cutout').click();await page.waitForFunction(()=>document.querySelector('#notice').classList.contains('error'));assert.deepEqual(await snapshot(),stable);await page.screenshot({path:path.join(out,'error.png')});await page.locator('#toast-close').click();await page.unrouteAll();
 const png=page.waitForEvent('download');await page.locator('#export-png').click();await(await png).saveAs(path.join(out,'export.png'));await ready();
 await page.locator('#open-export').click();const zip=page.waitForEvent('download');await page.locator('#export-all').click();await(await zip).saveAs(path.join(out,'export.zip'));await page.locator('#close-export').click();await ready();
 for(const [name,width,height] of [['short',1280,620],['mobile',390,844]]){await page.setViewportSize({width,height});await selectLayer(page,id);await page.locator('#cutout-options').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});const box=await page.locator('#cutout-options').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);evidence.passed=true;await fs.writeFile(path.join(out,evidence.splitOnly?'browser-split-final.json':'browser.json'),JSON.stringify(evidence,null,2));console.log(`PASS ${evidence.splitOnly?'final actual split':'actual three modes'}, dependent checkboxes, locks, cropped text layer, switch, move, history, save reload, repeat/failure atomicity, PNG ZIP, desktop/short/mobile`);
}catch(error){await page.screenshot({path:path.join(out,'browser-failure.png'),fullPage:true}).catch(()=>{});console.error('NOTICE',await page.locator('#notice').textContent().catch(()=>''));throw error;}
finally{await browser.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await fs.rm(root,{recursive:true,force:true});if(logs)console.error(logs);}
