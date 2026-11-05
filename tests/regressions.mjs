import fs from 'node:fs/promises';
await fs.mkdir('work',{recursive:true});
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
let browser;before(async()=>browser=await chromium.launch({channel:'chrome',headless:true}));after(async()=>browser.close());
async function page(){const p=await browser.newPage({viewport:{width:1440,height:1000}});await p.goto('http://127.0.0.1:8765');return p;}
async function warnings(p,edit){return p.evaluate(async edit=>{const {createProject,addVariant}=await import('/state.js');const {render}=await import('/render.js');const project=createProject();const v=addVariant(project,edit.width||300,edit.height||250);if(edit.narrow){project.copy={title:'',subtitle:'',cta:'看'};v.text={x:295,y:20,w:3};v.fontSize=40;}return render(document.createElement('canvas'),project,v,{}).warnings;},edit);}
test('default normal layout keeps every text layer on canvas',async()=>{const p=await page();try{const result=await warnings(p,{});assert.ok(!result.some(s=>s.includes('文字超出')),result.join(';'));}finally{await p.close();}});
test('CTA overflow is reported for a single glyph wider than its area',async()=>{const p=await page();try{assert.ok((await warnings(p,{narrow:true})).some(s=>s.includes('文字')), 'must warn about CTA text overflow');}finally{await p.close();}});
test('small subtitle is reported even when headline is above threshold',async()=>{const p=await page();try{assert.ok((await warnings(p,{width:970,height:90})).some(s=>s.includes('字号偏小')));}finally{await p.close();}});
test('oversized input is rejected visibly instead of silently truncated',async()=>{const p=await page();try{await p.locator('#title').evaluate(e=>{e.value='长'.repeat(2100);e.dispatchEvent(new Event('input',{bubbles:true}));});await p.locator('#save-project').click();assert.match(await p.locator('#notice').textContent(),/长度/);}finally{await p.close();}});
test('browser can run real local cutout without CSP data-fetch violation',async()=>{const p=await page();try{await p.locator('#image-input').setInputFiles('tests/fixtures/astronaut.png');await p.locator('#cutout:not([disabled])').waitFor();await p.locator('#cutout').click();assert.equal(await p.locator('#title').isDisabled(),true,'busy must disable copy edits');await p.waitForFunction(()=>!document.querySelector('#cutout').disabled,{},{timeout:60000});assert.match(await p.locator('#notice').textContent(),/抠图完成/);await p.screenshot({path:'work/real-cutout-ui.png',fullPage:true});}finally{await p.close();}});
