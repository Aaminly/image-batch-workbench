import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const dpr of [1,2]){
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:dpr});
  await page.goto('http://127.0.0.1:8765/render.js');
  await page.setContent(`<style>#stage{width:900px;height:700px;position:relative;overflow:hidden}#canvas-world{transform-origin:0 0}.canvas-board{position:absolute}.board-thumbnail{width:100%;height:100%}</style><div id="stage"><div id="canvas-world"><div id="preview-surface"></div></div></div><svg id="canvas-minimap"></svg><div id="group-nav"></div>${['canvas-zoom','fit-all','fit-current','zoom-in','zoom-out'].map(id=>`<button id="${id}"></button>`).join('')}`);
  await page.evaluate(async()=>{
   const {createInfiniteCanvas}=await import('/infinite-canvas.js'),{createProject,addVariant}=await import('/state.js');
   const project=createProject();project.variants=[];addVariant(project,300,300);addVariant(project,600,600);
   const state={project,assets:{},currentId:'300x300',busy:false,sync:false};
   window.testState=state;window.studio=createInfiniteCanvas(document.querySelector('#stage'),()=>state,id=>{state.currentId=id;studio.update();},()=>document.createElement('button'),()=>document.createElement('button'));studio.update();
  });
  await page.locator('#fit-all').click();
  const metrics=()=>page.locator('.canvas-board:not(.current) canvas').evaluate(c=>({w:c.width,h:c.height,screen:c.getBoundingClientRect().width}));
  await page.waitForTimeout(250);
  let m=await metrics();assert.ok(Math.abs(m.w-m.screen*dpr)<2,`default DPR${dpr}: ${JSON.stringify(m)}`);
  const before=m.w;await page.locator('#zoom-in').click();await page.waitForTimeout(250);m=await metrics();assert.ok(m.w>before,'unselected boards redraw on zoom');assert.ok(Math.abs(m.w-m.screen*dpr)<2,JSON.stringify(m));
  await page.locator('.canvas-board:not(.current) .board-label').click();await page.waitForTimeout(250);m=await metrics();assert.ok(Math.abs(m.w-m.screen*dpr)<2,'previously selected board remains sharp');
  const comparison=await page.evaluate(async()=>{const {render}=await import('/render.js');const c=document.querySelector('.canvas-board:not(.current) canvas'),v=testState.project.variants.find(v=>v.id===c.parentElement.dataset.variant),out=document.createElement('canvas');render(out,testState.project,v,{}, {pixelWidth:c.width,pixelHeight:c.height});return out.toDataURL()===c.toDataURL();});assert.ok(comparison,'unselected content matches direct full-resolution render');
  await page.screenshot({path:`work/canvas-clarity-dpr${dpr}.png`});
  console.log('PASS unselected default, zoom, selection DPR',dpr,m);await page.evaluate(async()=>{const {PRESET_GROUPS,addVariant}=await import('/state.js');for(const g of PRESET_GROUPS)for(const [w,h]of g.sizes)addVariant(testState.project,w,h);studio.update();studio.actual();});
  await page.waitForTimeout(350);
  const cost=await page.evaluate(()=>{const stage=document.querySelector('#stage').getBoundingClientRect();return [...document.querySelectorAll('.board-thumbnail:not([hidden])')].map(c=>{const r=c.getBoundingClientRect();return{pixels:c.width*c.height,visible:r.right>stage.left&&r.left<stage.right&&r.bottom>stage.top&&r.top<stage.bottom,w:c.width,screen:r.width};});});
  assert.ok(cost.length>=37);assert.ok(cost.filter(c=>!c.visible).every(c=>c.pixels<=115200),'offscreen boards release high-resolution buffers');assert.ok(cost.reduce((n,c)=>n+c.pixels,0)<20000000,'many boards stay within bounded pixel cost');
  await page.locator('#fit-all').click();await page.waitForTimeout(350);
  const all=await page.evaluate(()=>[...document.querySelectorAll('.board-thumbnail:not([hidden])')].map(c=>({w:c.width,screen:c.getBoundingClientRect().width})));
  assert.ok(all.every(c=>Math.abs(c.w-c.screen*dpr)<2),'newly visible boards redraw without selecting');console.log('PASS 38+ board viewport budget',dpr,cost.reduce((n,c)=>n+c.pixels,0));await page.close();
 }
}finally{await browser.close();}
