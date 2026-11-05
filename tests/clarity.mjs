import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import fs from 'node:fs/promises';
let browser;before(async()=>browser=await chromium.launch({channel:'chrome',headless:true}));after(async()=>browser.close());
test('Retina preview redraws vectors and image at physical pixels without changing native export',async()=>{
 const p=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2,acceptDownloads:true});p.on('dialog',d=>d.accept());
 try{await p.goto('http://127.0.0.1:8765');await p.locator('#image-input').setInputFiles('tests/fixtures/astronaut.png');await p.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});
 const metrics=await p.locator('#preview').evaluate(c=>{const b=c.getBoundingClientRect();return{w:c.width,h:c.height,cssW:b.width,cssH:b.height,dpr:devicePixelRatio};});
 assert.ok(Math.abs(metrics.w-metrics.cssW*2)<=1&&Math.abs(metrics.h-metrics.cssH*2)<=1,JSON.stringify(metrics));assert.ok(metrics.cssW>300,'fit preview should use available stage space');
 const d=p.waitForEvent('download');await p.locator('#export-png').click();await(await d).saveAs('work/clarity-native.png');
 await p.screenshot({path:'work/clarity-retina.png',fullPage:true});
 const compare=await p.evaluate(async()=>{
  const {render,loadAssets}=await import('/render.js');const {createProject,addVariant}=await import('/state.js');
  const c=document.querySelector('#preview'),ctx=c.getContext('2d'),project=createProject();const file=document.querySelector('#image-input');
  // Use an independently drawn high-frequency image to catch bitmap upscaling.
  const src=document.createElement('canvas');src.width=src.height=600;const s=src.getContext('2d');s.fillStyle='white';s.fillRect(0,0,600,600);s.fillStyle='black';for(let x=0;x<600;x+=2)s.fillRect(x,0,1,600);
  const v=addVariant(project,300,250);v.box={x:0,y:0,w:300,h:250};project.copy={title:'清晰字体 ABC',subtitle:'',cta:''};v.text={x:2,y:5,w:290};v.fontSize=26;v.textColor='#cc0000';
  const out=document.createElement('canvas');render(out,project,v,{original:src},{pixelWidth:600,pixelHeight:500});
  const reference=document.createElement('canvas');reference.width=600;reference.height=500;const r=reference.getContext('2d');r.scale(2,2);r.fillStyle=v.color;r.fillRect(0,0,300,250);r.imageSmoothingEnabled=true;r.imageSmoothingQuality='high';r.drawImage(src,25,0,250,250);r.textBaseline='top';r.fillStyle='#cc0000';r.font='650 26px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';r.fillText('清晰字体 ABC',2,5);
  const actual=out.getContext('2d').getImageData(0,0,600,500).data,expected=r.getImageData(0,0,600,500).data;let changed=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])changed++;
  return{dimensions:[out.width,out.height],differentChannels:changed};
 });assert.deepEqual(compare.dimensions,[600,500]);assert.equal(compare.differentChannels,0,'high-DPI render should match direct high-resolution drawing');
 await p.locator('#feather').fill('0.2');await p.locator('#feather').dispatchEvent('input');await p.locator('[data-layer="title"]').click();const x=Number(await p.locator('#text-x').inputValue()),box=await p.locator('#preview').boundingBox();await p.mouse.move(box.x+60*box.width/300,box.y+165*box.height/250);await p.mouse.down();await p.mouse.move(box.x+60*box.width/300+30,box.y+165*box.height/250);await p.mouse.up();assert.ok(Math.abs(Number(await p.locator('#text-x').inputValue())-x-30*300/box.width)<.01,'drag stays in logical output coordinates');
 await p.locator('#preview-mode').selectOption('actual');const actualSize=await p.locator('#preview').evaluate(c=>({css:c.getBoundingClientRect().width,backing:c.width}));assert.equal(actualSize.css,300);assert.equal(actualSize.backing,600);
 await fs.writeFile('work/clarity-metrics.json',JSON.stringify({metrics,compare,actualSize},null,2));
 }finally{await p.close();}
});
test('cropped feather movement reuses backing store at unchanged raster dimensions',async()=>{
 const p=await browser.newPage();try{await p.goto('http://127.0.0.1:8765');const result=await p.evaluate(async()=>{
 const {drawFeathered}=await import('/feather.js');const image=document.createElement('canvas');image.width=image.height=100;image.getContext('2d').fillRect(0,0,100,100);const out=document.createElement('canvas');out.width=out.height=100;const c=out.getContext('2d');drawFeathered(c,image,{x:-50,y:-50,w:200,h:200},{x:0,y:0,w:100,h:100},.2);
 const descriptors={};let writes=0;for(const key of ['width','height']){descriptors[key]=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);const d=descriptors[key];Object.defineProperty(HTMLCanvasElement.prototype,key,{...d,set(value){writes++;d.set.call(this,value);}});}
 drawFeathered(c,image,{x:-49,y:-50,w:200,h:200},{x:0,y:0,w:100,h:100},.2);
 for(const key of ['width','height'])Object.defineProperty(HTMLCanvasElement.prototype,key,descriptors[key]);return writes;
 });assert.equal(result,0);}finally{await p.close();}
});
