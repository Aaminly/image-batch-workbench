import {selectLayer} from './support/select-layer.mjs';
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const url=process.env.STUDIO_URL||'http://127.0.0.1:18765';assert.notEqual(new URL(url).port,'8765');await fs.mkdir('work/canvas-shortcuts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),p=await browser.newPage({viewport:{width:1512,height:982}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
const zoom=()=>p.locator('#stage').evaluate(e=>Number(e.dataset.zoom));const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
try{
 await p.goto(url);await p.waitForFunction(()=>!document.getElementById('draft-new').disabled);await p.locator('#draft-new').click();await p.waitForFunction(()=>!document.getElementById('draft-new').disabled);await p.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await p.waitForFunction(()=>!document.getElementById('export-png').disabled);
 await p.waitForFunction(()=>document.getElementById('draft-status').textContent.startsWith('已保存'));const batch=await p.locator('#batch-select').inputValue(),recordBefore=await(await p.request.get(`${url}/api/drafts/${batch}`)).json();
 await selectLayer(p,'title');await p.locator('#stage').focus();
 const browserView=await p.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale}));const original=await zoom();await p.keyboard.press('Control+Equal');close(await zoom(),original*1.2);
 for(const modifier of ['Control','Meta']){
  await p.keyboard.press(`${modifier}+Digit0`);close(await zoom(),1);
  for(let n=1;n<=9;n++){await p.keyboard.press(`${modifier}+Digit${n}`);close(await zoom(),n/10);}
  await p.keyboard.press(`${modifier}+Equal`);close(await zoom(),1.08);await p.keyboard.press(`${modifier}+Minus`);close(await zoom(),.9);
  await p.keyboard.press(`${modifier}+Shift+Equal`);close(await zoom(),1.08);
  await p.keyboard.press(`${modifier}+NumpadAdd`);close(await zoom(),1.296);await p.keyboard.press(`${modifier}+NumpadSubtract`);close(await zoom(),1.08);
  await p.keyboard.press(`${modifier}+Numpad0`);close(await zoom(),1);await p.keyboard.press(`${modifier}+Numpad5`);close(await zoom(),.5);
 }
 // Native controls retain their own keyboard input; toolbar button focus can zoom.
 for(const id of ['title','font-size','font-weight']){await p.locator('#'+id).focus();const before=await zoom();await p.keyboard.press('Control+Equal');await p.keyboard.press('Meta+Minus');close(await zoom(),before);}
 await p.locator('#zoom-in').focus();await p.keyboard.press('Control+Digit0');close(await zoom(),1);
 await p.locator('#open-export').click();await p.keyboard.press('Control+Minus');close(await zoom(),1);await p.locator('#close-export').click();
 await p.locator('#stage').focus();await p.keyboard.press('Equal');await p.keyboard.press('Minus');await p.keyboard.press('Digit0');close(await zoom(),1);
 // Repeated zooms clamp, keep the viewport center anchored, and do not add layout history.
 const history=await p.locator('#undo').isEnabled(),view=()=>p.locator('#canvas-world').evaluate(e=>{const m=new DOMMatrix(e.style.transform),r=document.getElementById('stage');return{x:(r.clientWidth/2-m.e)/m.a,y:(r.clientHeight/2-m.f)/m.d};}),center=await view();
 for(let i=0;i<35;i++)await p.keyboard.press('Control+Equal');close(await zoom(),64);let after=await view();assert.ok(Math.hypot((after.x-center.x)*await zoom(),(after.y-center.y)*await zoom())<.05,`CSS矩阵序列化后中心锚点误差小于0.05屏幕像素: ${JSON.stringify({center,after,zoom:await zoom()})}`);
 for(let i=0;i<50;i++)await p.keyboard.press('Control+Minus');close(await zoom(),.05);after=await view();assert.ok(Math.hypot((after.x-center.x)*await zoom(),(after.y-center.y)*await zoom())<.05,`CSS矩阵序列化后中心锚点误差小于0.05屏幕像素: ${JSON.stringify({center,after,zoom:await zoom()})}`);assert.equal(await p.locator('#undo').isEnabled(),history);
 await p.keyboard.press('Control+Digit0');close(await zoom(),1);
 const stage=await p.locator('#stage').boundingBox(),point={x:stage.x+stage.width*.7,y:stage.y+stage.height*.4};await p.locator('#stage').focus();await p.keyboard.down('Space');await p.mouse.move(point.x,point.y);await p.mouse.down();await p.mouse.move(point.x+15,point.y+10);await p.keyboard.press('Control+Equal');close(await zoom(),1.2);const panZoom=await p.locator('#canvas-world').evaluate(e=>e.style.transform);await p.mouse.move(point.x+55,point.y+30);assert.equal(await p.locator('#canvas-world').evaluate(e=>e.style.transform),panZoom,'缩放后不续接旧平移');await p.mouse.up();await p.keyboard.up('Space');assert.equal(await p.locator('#stage').evaluate(e=>e.classList.contains('panning')),false);
 const map=await p.locator('#canvas-minimap').boundingBox();await p.mouse.move(map.x+map.width*.5,map.y+map.height*.5);await p.mouse.down();await p.keyboard.press('Control+Digit0');close(await zoom(),1);const mapZoom=await p.locator('#canvas-world').evaluate(e=>e.style.transform);await p.mouse.move(map.x+map.width*.8,map.y+map.height*.7);assert.equal(await p.locator('#canvas-world').evaluate(e=>e.style.transform),mapZoom,'缩放后不续接旧小地图拖动');await p.mouse.up();
 assert.equal(await p.locator('[data-layer=title]').getAttribute('aria-pressed'),'true','缩放保留选择');
 assert.deepEqual(await p.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale})),browserView,'不触发浏览器网页缩放');const recordAfter=await(await p.request.get(`${url}/api/drafts/${batch}`)).json();assert.deepEqual(recordAfter,recordBefore,'视图操作不改草稿数据或版本');await p.waitForFunction(()=>{const surface=document.getElementById('preview-surface'),stage=document.getElementById('stage'),width=Number(document.getElementById('variant-select').value.split('x')[0]),expected=Math.round(parseFloat(surface.style.width)/width*Number(stage.dataset.zoom)*100);return document.getElementById('preview-scale').textContent.includes(`显示 ${expected}%`);});await p.waitForFunction(()=>JSON.parse(sessionStorage.getItem('ad-studio-canvas')).zoom===1);assert.equal(await p.locator('#canvas-zoom').textContent(),'100%');assert.ok(await p.locator('.minimap-viewport').getAttribute('width'));await p.screenshot({path:'work/canvas-shortcuts/keyboard.png'});assert.deepEqual(errors,[]);console.log('PASS canvas Ctrl/Meta +/-/0–9 and numpad zoom, editor/modal guards, focus, clamps, center anchor, selection/history isolation');
}finally{await browser.close();}
