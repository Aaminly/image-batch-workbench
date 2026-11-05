import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
await fs.mkdir('work',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});page.on('dialog',d=>d.accept());
try{
 await page.goto('http://127.0.0.1:8765');
 const result=await page.evaluate(async()=>{
  const {createProject,addVariant}=await import('/state.js');const {render}=await import('/render.js');
  const p=createProject();p.copy={title:'',subtitle:'',cta:''};const v=addVariant(p,100,100);v.box={x:0,y:0,w:100,h:100};v.background='transparent';
  const source=document.createElement('canvas');source.width=source.height=100;const c=source.getContext('2d');c.fillStyle='red';c.fillRect(0,0,100,100);c.clearRect(40,40,10,10);c.clearRect(60,60,20,20);c.fillStyle='rgba(255,0,0,.5)';c.fillRect(60,60,20,20);
  const out=document.createElement('canvas');v.feather=0;render(out,p,v,{original:source});const zero=out.toDataURL()===source.toDataURL();
  const pixel=(x,y)=>Array.from(out.getContext('2d').getImageData(x,y,1,1).data);
  v.feather=.2;render(out,p,v,{original:source});const edge=pixel(0,50)[3],transition=pixel(10,50)[3],center=pixel(30,50)[3];
  const sides=[pixel(50,0)[3],pixel(99,50)[3],pixel(50,99)[3]],hole=pixel(45,45)[3],semi=pixel(70,70)[3];
  v.crop=true;v.scale=2;render(out,p,v,{original:source});const croppedEdge=pixel(0,50)[3];
  v.crop=false;v.scale=1;v.background='solid';v.color='#00ff00';
  const logo=document.createElement('canvas');logo.width=logo.height=10;logo.getContext('2d').fillStyle='blue';logo.getContext('2d').fillRect(0,0,10,10);v.logoX=0;v.logoY=0;v.logoWidth=10;
  render(out,p,v,{original:source,logo});const logoPixel=pixel(0,0),backgroundPixel=pixel(0,50);
  let allocs=0;const originalCreate=document.createElement.bind(document);document.createElement=function(name,...args){if(name==='canvas')allocs++;return originalCreate(name,...args);};
  // Normal translations must reuse the last raster, rather than allocating per pointermove.
  v.box={x:10,y:10,w:80,h:80};render(out,p,v,{original:source});allocs=0;v.dx=1;render(out,p,v,{original:source});const moveAllocs=allocs;document.createElement=originalCreate;
  return {zero,edge,transition,center,sides,hole,semi,croppedEdge,logoPixel,backgroundPixel,moveAllocs};
 });
 assert.equal(result.zero,true,'zero feather must preserve all source pixels');assert.ok(result.edge<20&&result.transition>100&&result.transition<160&&result.center===255,JSON.stringify(result));assert.ok(result.sides.every(a=>a<20));assert.equal(result.hole,0);assert.equal(result.semi,128);assert.ok(result.croppedEdge<20);assert.deepEqual(result.logoPixel,[0,0,255,255]);assert.ok(result.backgroundPixel[1]>240);assert.equal(result.moveAllocs,0);
 await page.locator('#image-input').setInputFiles('tests/fixtures/astronaut.png');await page.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});
 await page.locator('#feather').fill('0.2');await page.locator('#feather').dispatchEvent('input');assert.equal(await page.locator('#feather-value').textContent(),'20%');
 await page.locator('[data-size="970x90"]').click();assert.equal(await page.locator('#feather').inputValue(),'0');await page.locator('#variant-select').selectOption('300x250');assert.equal(await page.locator('#feather').inputValue(),'0.2');
 const nativeSource=(await fs.readFile('tests/fixtures/astronaut.png')).toString('base64');
 const preview=await page.evaluate(async data=>{const {render,loadImage}=await import('/render.js');const {createProject,addVariant}=await import('/state.js');const p=createProject(),v=addVariant(p,300,250);v.feather=.2;const c=document.createElement('canvas');render(c,p,v,{original:await loadImage(`data:image/png;base64,${data}`)});const {pngBlob}=await import('/render.js');const raw=c.toDataURL().split(',')[1];const bytes=new Uint8Array(await(await pngBlob(c)).arrayBuffer());if(btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))!==raw)throw Error('raw render mismatch');const {compressedPng}=await import('/compression.js');const compressed=new Uint8Array(await(await compressedPng(c)).arrayBuffer());return btoa(Array.from(compressed,b=>String.fromCharCode(b)).join(''));},nativeSource);await fs.writeFile('work/feather-expected-native.png',Buffer.from(preview,'base64'));const png=page.waitForEvent('download');await page.locator('#export-png').click();await(await png).saveAs('work/feather-preview.png');assert.ok((await fs.readFile('work/feather-preview.png')).toString('base64')===preview,'compressed export differs from expected render');
 const save=page.waitForEvent('download');await page.locator('#save-project').click();await(await save).saveAs('work/feather.adproject.json');await page.locator('#feather').fill('0');await page.locator('#feather').dispatchEvent('input');await page.locator('#project-input').setInputFiles('work/feather.adproject.json');await page.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});assert.equal(await page.locator('#feather').inputValue(),'0.2');
 const zip=page.waitForEvent('download');await page.locator('#export-all').click();await(await zip).saveAs('work/feather.zip');
 await page.screenshot({path:'work/feather-desktop.png',fullPage:true});
 await page.locator('#reset-layout').evaluate(el=>{for(let x=el.parentElement;x;x=x.parentElement)if(x.tagName==='DETAILS')x.open=true;});await page.locator('#reset-layout').click();assert.equal(await page.locator('#feather').inputValue(),'0');
 const mobile=await browser.newPage({viewport:{width:390,height:844}});await mobile.goto('http://127.0.0.1:8765');await mobile.locator('#project-input').setInputFiles('work/feather.adproject.json');await mobile.locator('#notice').filter({hasText:'项目已打开'}).waitFor({state:'attached'});await mobile.locator('#feather').scrollIntoViewIfNeeded();await mobile.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await mobile.screenshot({path:'work/feather-mobile.png'});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await mobile.close();
 console.log(JSON.stringify({pixels:result,ui:true,independent:true,roundtrip:true,native_render_png_identical:true,zip:true,mobile:true},null,2));
}finally{await browser.close();}
