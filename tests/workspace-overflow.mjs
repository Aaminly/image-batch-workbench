import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
 await page.goto('http://127.0.0.1:8765');
 const result=await page.evaluate(async()=>{
  const {createProject,addVariant}=await import('/state.js'),{drawPreview}=await import('/preview.js'),{render}=await import('/render.js'),{createCanvasEditor}=await import('/canvas-editor.js');
  const p=createProject(),v=addVariant(p,300,250);p.copy={title:'外部文字',subtitle:'',cta:''};v.text={x:-160,y:-70,w:180};v.fontSize=24;
  const stage=document.createElement('div');stage.className='stage';stage.style.cssText='width:600px;height:500px';const surface=document.createElement('div');surface.className='preview-surface';const canvas=document.createElement('canvas'),selection=document.createElement('div');surface.append(canvas,selection);stage.append(surface);document.body.prepend(stage);
  const logo=document.createElement('canvas');logo.width=40;logo.height=40;logo.getContext('2d').fillStyle='#ff0000';logo.getContext('2d').fillRect(0,0,40,40);v.logoX=340;v.logoY=30;v.logoWidth=40;
  let selected;const editor=createCanvasEditor(canvas,selection,{getVariant:()=>v,isBusy:()=>false,onChange:()=>{},onSelect:id=>selected=id});
  const r=drawPreview(canvas,p,v,{logo},stage);editor.update(r.regions);
  stage.scrollLeft=stage.scrollWidth-stage.clientWidth;
  const b=canvas.getBoundingClientRect(),zoom=b.width/300,x=b.x+360*zoom,y=b.y+50*zoom,target=document.elementFromPoint(x,y);target?.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,bubbles:true,pointerId:1}));
  const overflow=surface.querySelector('.overflow-preview'),ob=overflow?.getBoundingClientRect();
  const pixel=overflow?[...overflow.getContext('2d').getImageData(Math.floor((x-ob.x)*overflow.width/ob.width),Math.floor((y-ob.y)*overflow.height/ob.height),1,1).data]:[];
  const exportCanvas=document.createElement('canvas');render(exportCanvas,p,v,{logo});
  const nativePixel=[...exportCanvas.getContext('2d').getImageData(299,50,1,1).data];
  const subject=structuredClone(v);subject.dx=-400;subject.feather=.2;const subjectResult=render(document.createElement('canvas'),p,subject,{original:logo});
  return {pixel,nativePixel,subjectX:subjectResult.regions.image.x,selected,width:exportCanvas.width,height:exportCanvas.height,region:r.regions.logo,surfaceWidth:surface.getBoundingClientRect().width,artboardWidth:b.width};
 });
 assert.deepEqual(result.pixel,[255,0,0,255],'offboard logo is actually painted');assert.ok(result.subjectX<0,'subject retains offboard position');assert.notDeepEqual(result.nativePixel,[255,0,0,255]);
 assert.equal(result.selected,'logo','fully off-artboard logo must be selectable');
 assert.ok(result.surfaceWidth>result.artboardWidth,'workspace includes off-artboard content');assert.equal(result.width,300);assert.equal(result.height,250);
 console.log('PASS off-artboard selection, workspace bounds, native export dimensions',result);
}finally{await browser.close();}
const browser2=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser2.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2});await page.route('**/app.js',route=>route.fulfill({body:'',contentType:'text/javascript'}));await page.goto('http://127.0.0.1:8765');await page.setContent('<link rel="stylesheet" href="/style.css"><div id="stage" class="stage" style="width:650px;height:550px"><div id="surface" class="preview-surface"><canvas id="preview" tabindex="0"></canvas><div id="selection-box"></div></div></div>');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const timings=[];
 for(const kind of ['title','logo','image'])for(const side of ['left','top','right','bottom']){
  await page.evaluate(async({kind,side})=>{
   const {createProject,addVariant}=await import('/state.js'),{drawPreview}=await import('/preview.js'),{createCanvasEditor}=await import('/canvas-editor.js'),{mediaRect}=await import('/layer-geometry.js');
   const stage=document.querySelector('#stage');stage.innerHTML='<div class="preview-surface"><canvas id="preview" tabindex="0"></canvas><div id="selection-box"></div></div>';const canvas=stage.querySelector('canvas'),selection=stage.querySelector('#selection-box');
   const p=createProject(),v=addVariant(p,300,250);p.copy={title:kind==='title'?'外部文字':'',subtitle:'',cta:''};v.background='transparent';v.fontSize=20;v.text={x:30,y:40,w:150};
   const source=document.createElement('canvas');source.width=80;source.height=80;source.getContext('2d').fillStyle='#ff0000';source.getContext('2d').fillRect(0,0,80,80);const assets=kind==='image'?{original:source}:kind==='logo'?{logo:source}:{};v.logoWidth=50;v.feather=kind==='image'?.2:0;
   const at={left:[-240,60],top:[50,-200],right:[380,60],bottom:[50,330]}[side];
   if(kind==='title'){v.text.x=at[0];v.text.y=at[1];}else if(kind==='logo'){v.logoX=at[0];v.logoY=at[1];}else{const r=mediaRect(v,'image',source);v.dx=at[0]-r.x;v.dy=at[1]-r.y;}
   let result,selected;const draw=()=>{const t=performance.now();result=drawPreview(canvas,p,v,assets,stage,side==='top'||side==='bottom'?'actual':'fit');editor.update(result.regions);window.lastDuration=performance.now()-t;};const editor=createCanvasEditor(canvas,selection,{getVariant:()=>v,getAssets:()=>assets,isBusy:()=>false,onChange:draw,onSelect:id=>selected=id});draw();
   window.sample=()=>{const layer=result.regions.layers?.[kind],r=layer?.hitRects[0]||result.regions[kind],b=canvas.getBoundingClientRect(),z=b.width/v.width;stage.scrollLeft=canvas.offsetLeft+(r.x+r.w/2)*z-stage.clientWidth/2;stage.scrollTop=canvas.offsetTop+(r.y+r.h/2)*z-stage.clientHeight/2;const b2=canvas.getBoundingClientRect();return{x:b2.x+(r.x+r.w/2)*z,y:b2.y+(r.y+r.h/2)*z,bx:b2.x,by:b2.y,z,selected,dx:kind==='title'?v.textLayers.title.dx:kind==='logo'?v.logoX:v.dx,dy:kind==='title'?v.textLayers.title.dy:kind==='logo'?v.logoY:v.dy};};
   window.inspect=()=>({stage:stage.getBoundingClientRect().toJSON(),selected,b:canvas.getBoundingClientRect().toJSON(),v:structuredClone(v),pixels:canvas.width*canvas.height+stage.querySelector('.overflow-preview').width*stage.querySelector('.overflow-preview').height,duration:window.lastDuration});
  },{kind,side});
  const centered=await page.evaluate(()=>inspect());assert.ok(Math.abs(centered.b.x+centered.b.width/2-centered.stage.x-centered.stage.width/2)<2,'main artboard horizontally centered');assert.ok(Math.abs(centered.b.y+centered.b.height/2-centered.stage.y-centered.stage.height/2)<2,'main artboard vertically centered');
  const start=await page.evaluate(()=>sample());await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+12,start.y+8,{steps:4});await page.mouse.up();const end=await page.evaluate(()=>inspect());assert.equal(end.selected,kind,`${kind}/${side} selectable`);const dx=kind==='title'?end.v.textLayers.title.dx:kind==='logo'?end.v.logoX:end.v.dx;assert.ok(Math.abs(dx-start.dx-12/start.z)<.1,`${kind}/${side} drag logical delta`);assert.ok(Math.abs(end.b.x-start.bx)<1,`${kind}/${side} artboard horizontal origin stable`);assert.ok(Math.abs(end.b.y-start.by)<1,`${kind}/${side} artboard vertical origin stable`);assert.ok(end.pixels<=16020000);timings.push(end.duration);
 }
 await page.screenshot({path:'work/workspace-overflow-desktop.png'});await page.setViewportSize({width:390,height:844});await page.locator('#stage').evaluate(s=>s.style.width='100%');await page.screenshot({path:'work/workspace-overflow-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS 12 four-side text/logo/feathered-subject drags, DPR2, stable origin, mobile overflow, pixel budget; draw milliseconds',timings);
}finally{await browser2.close();}
const browser3=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser3.newPage();await page.route('**/app.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.goto('http://127.0.0.1:8765');
 const pixels=await page.evaluate(async()=>{
  const {render}=await import('/render.js'),{createProject,addVariant}=await import('/state.js');const p=createProject(),v=addVariant(p,300,250);p.copy={title:'',subtitle:'',cta:''};v.background='transparent';v.box={x:0,y:0,w:80,h:80};v.dx=-40;v.dy=-40;v.feather=.2;
  const source=document.createElement('canvas');source.width=80;source.height=80;source.getContext('2d').fillStyle='#ff000080';source.getContext('2d').fillRect(0,0,80,80);
  const c=document.createElement('canvas'),opts={viewport:{x:-100,y:-100,w:500,h:450},pixelWidth:500,pixelHeight:450,outsideOnly:true};render(c,p,v,{original:source},opts);const at=(x,y)=>[...c.getContext('2d').getImageData(x+100,y+100,1,1).data];const feather=at(-15,-15),center=at(15,15);v.crop=true;render(c,p,v,{original:source},opts);const cropped=at(-15,-15);render(c,p,v,{background:source},opts);const background=at(-15,-15);
  return {feather,center,cropped,background};
 });assert.ok(pixels.feather[3]>0,'negative-coordinate feather visible');assert.equal(pixels.center[3],0,'overflow center empty to avoid double alpha');assert.equal(pixels.cropped[3],0,'explicit crop respected');assert.equal(pixels.background[3],0,'background cover confined to artboard');console.log('PASS feather negative origin, transparent center, explicit crop, background clip',pixels);
}finally{await browser3.close();}
