import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url=process.env.STUDIO_URL||'http://127.0.0.1:18765';
assert.notEqual(new URL(url).port,'8765','使用隔离实例');
await fs.mkdir('work/typography',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1512,height:982}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const measurements=[];
async function audit(state){
 const result=await page.evaluate(()=>{
  const visible=e=>e.checkVisibility()&&!e.closest('.visually-hidden');
  const text=[...document.querySelectorAll('.inspector *')].filter(e=>visible(e)&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
  const small=text.filter(e=>parseFloat(getComputedStyle(e).fontSize)<13).map(e=>({id:e.id,text:e.textContent.trim().slice(0,45),size:getComputedStyle(e).fontSize}));
  const clipped=[...document.querySelectorAll('.inspector button,.inspector summary,.inspector label,.inspector .field-pair,.inspector .color-control')].filter(e=>visible(e)&&e.scrollWidth>e.clientWidth+1).map(e=>({id:e.id,text:e.textContent.trim().slice(0,45),width:e.clientWidth,scroll:e.scrollWidth}));
  const selects=[...document.querySelectorAll('select')].filter(visible).map(e=>{const s=getComputedStyle(e),ctx=document.createElement('canvas').getContext('2d');ctx.font=s.font;const value=e.selectedOptions[0]?.textContent||'';return{id:e.id,font:parseFloat(s.fontSize),line:parseFloat(s.lineHeight),height:e.clientHeight,needed:ctx.measureText(value).width,available:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),position:s.backgroundPosition,image:s.backgroundImage};});
  return {small,clipped,selects,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 measurements.push({state,...result});
 assert.deepEqual(result.small,[],`${state}:右侧文字至少13px`);
 assert.deepEqual(result.clipped,[],`${state}:文字与控件不裁切`);
 assert.equal(result.overflow,false,`${state}:页面不横向溢出`);
 for(const s of result.selects){assert.ok(s.font>=14,`${s.id}下拉文字至少14px`);assert.ok(s.available>=s.needed,`${s.id}选中值不碰箭头 ${JSON.stringify(s)}`);assert.ok(s.position.includes('50%'));assert.ok(s.image.includes('chevron-down.svg'));assert.ok(s.height>=s.line+12);}
}
try{
 await page.goto(url);await page.waitForFunction(()=>!document.querySelector('header').inert);
 const fixture=await page.evaluate(async()=>{const {createProject,addVariant}=await import('/state.js');const p=createProject();for(const [w,h]of [[300,250],[600,500],[6000,2400]])addVariant(p,w,h);const png=(w,h,color)=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,w,h);return c.toDataURL();};p.assets.original=png(100,150,'#ca793d');p.assets.logo=png(80,20,'#eeeeee');p.backgrounds=[{id:'bg',name:'用于检查长文件名称换行与对齐的背景素材'.repeat(4)+'.png',width:300,height:250,data:png(300,250,'#29382e')}];return p;});
 await page.locator('.project-menu summary').click();await page.locator('#project-input').setInputFiles({name:'typography.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.querySelectorAll('.canvas-board').length===3&&!document.getElementById('draft-new').disabled);await page.locator('.project-menu summary').click();
 await page.locator('[data-layer=title]').click();
 await audit('desktop-title');
 for(const [name,width,height] of [['desktop',1512,982],['medium',1100,700],['short',1512,620],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.locator('#tab-properties').click();
  for(const layer of ['title','subtitle','cta','image','logo']){
   await page.locator(`[data-layer=${layer}]`).click();
   if(layer==='title'){
    await page.locator('#text-height-mode').selectOption('fixed');await page.locator('#underline-style').selectOption('swoosh');await page.locator('#stroke-width').fill('2');await page.locator('#shadow-enabled').check();await page.locator('#separator-enabled').check();
   }
   await page.locator('#scope-details').evaluate(e=>e.open=true);await audit(`${name}-${layer}-scope`);await page.locator('#scope-details').evaluate(e=>e.open=false);
   await page.locator('#inspector-more').evaluate(e=>e.open=true);await page.locator('#warnings-details').evaluate(e=>e.open=true);
   await audit(`${name}-${layer}`);
  }
  await page.locator('[data-layer=title]').click();await page.locator('.inspector').evaluate(e=>e.scrollTop=0);await page.locator('.inspector').screenshot({path:`work/typography/${name}-text.png`});
  await page.locator('#tab-background').click();
  for(const mode of ['matched','all','current']){await page.locator('#background-mode').selectOption(mode);await page.locator('#background-management').evaluate(e=>e.open=true);await audit(`${name}-background-${mode}`);}
  await page.locator('#background-material').scrollIntoViewIfNeeded();await page.locator('.inspector').screenshot({path:`work/typography/${name}-background.png`});
 }
 await page.locator('#tab-properties').click();await page.locator('[data-layer=title]').click();
 for(const id of ['batch-select','variant-select','preview-mode','font-weight','text-height-mode','underline-style','background-mode']){
  if(id==='background-mode')await page.locator('#tab-background').click();else if(['font-weight','text-height-mode','underline-style'].includes(id)){await page.locator('#tab-properties').click();await page.locator('[data-layer=title]').click();}
  const select=page.locator('#'+id),values=await select.locator('option').evaluateAll(els=>els.map(e=>e.value));
  const original=await select.inputValue();
  for(const value of values){await select.selectOption(value);await page.waitForFunction(()=>!document.getElementById('batch-select').disabled);await audit(`options-${id}-${value}`);}
  await select.selectOption(original);await page.waitForFunction(()=>!document.getElementById('batch-select').disabled);await select.focus();assert.equal(await select.evaluate(e=>document.activeElement===e),true,`${id}可获得焦点`);await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await select.selectOption(original);await page.keyboard.press('Tab');assert.equal(await select.evaluate(e=>document.activeElement===e),false);
 }
 assert.deepEqual(errors,[]);await fs.writeFile('work/typography/measurements.json',JSON.stringify(measurements,null,2));console.log('PASS clear inspector typography, all selected dropdown values/centered arrows, all layers/effects/background modes, desktop/medium/short/mobile');
}finally{await browser.close();}
