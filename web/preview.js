import {render} from './render.js';
import {unionRects} from './text-layout.js';
export function drawPreview(canvas,project,variant,assets,stage,mode='fit'){
 const style=getComputedStyle(stage),surface=canvas.parentElement;
 if(mode==='world'){
  const zoom=parseFloat(surface.style.width)/variant.width,cssWidth=variant.width*zoom,cssHeight=variant.height*zoom,density=Math.min((window.devicePixelRatio||1)*Number(stage.dataset.zoom||1),Math.sqrt(8000000/(cssWidth*cssHeight)));
  canvas.style.width=`${cssWidth}px`;canvas.style.height=`${cssHeight}px`;
  const result=render(canvas,project,variant,assets,{pixelWidth:Math.max(1,Math.round(cssWidth*density)),pixelHeight:Math.max(1,Math.round(cssHeight*density))});
  const bounds=unionRects([{x:0,y:0,w:variant.width,h:variant.height},result.regions.image,result.regions.logo,...(result.regions.added||[]).map(l=>l.rect),...Object.values(result.regions.layers).flatMap(l=>[l.rect,l.frameRect])].filter(Boolean));
  const viewport={x:Math.floor(Math.min(0,bounds.x)-20/zoom),y:Math.floor(Math.min(0,bounds.y)-20/zoom)};viewport.w=Math.ceil(Math.max(variant.width,bounds.x+bounds.w)+20/zoom)-viewport.x;viewport.h=Math.ceil(Math.max(variant.height,bounds.y+bounds.h)+20/zoom)-viewport.y;
  let overflow=surface.querySelector('.overflow-preview');if(!overflow){overflow=document.createElement('canvas');overflow.className='overflow-preview';overflow.setAttribute('aria-hidden','true');surface.prepend(overflow);}
  Object.assign(overflow.style,{left:`${viewport.x*zoom}px`,top:`${viewport.y*zoom}px`,width:`${viewport.w*zoom}px`,height:`${viewport.h*zoom}px`});
  const outerDensity=Math.min(density,Math.sqrt(8000000/(viewport.w*viewport.h*zoom*zoom)));render(overflow,project,variant,assets,{viewport,outsideOnly:true,pixelWidth:Math.max(1,Math.round(viewport.w*zoom*outerDensity)),pixelHeight:Math.max(1,Math.round(viewport.h*zoom*outerDensity))});
  return {...result,zoom,limited:density<(window.devicePixelRatio||1)*Number(stage.dataset.zoom||1)};
 }

 const width=Math.max(1,stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
 const height=Math.max(1,stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
 const zoom=mode==='actual'?1:Math.min(width/variant.width,height/variant.height);
 const cssWidth=variant.width*zoom,cssHeight=variant.height*zoom;
 canvas.style.width=`${cssWidth}px`;canvas.style.height=`${cssHeight}px`;
 const dpr=window.devicePixelRatio||1;
 // Share the existing pixel budget between the artboard and editing overflow.
 const density=Math.min(dpr,Math.sqrt(8000000/(cssWidth*cssHeight)));
 const result=render(canvas,project,variant,assets,{pixelWidth:Math.max(1,Math.round(cssWidth*density)),pixelHeight:Math.max(1,Math.round(cssHeight*density))});
 let image=result.regions.image;
 if(image&&variant.crop){const b=variant.box,x=Math.max(image.x,b.x),y=Math.max(image.y,b.y);image={x,y,w:Math.max(0,Math.min(image.x+image.w,b.x+b.w)-x),h:Math.max(0,Math.min(image.y+image.h,b.y+b.h)-y)};}
 const bounds=unionRects([{x:0,y:0,w:variant.width,h:variant.height},image,result.regions.logo,...(result.regions.added||[]).map(l=>l.rect),...Object.values(result.regions.layers).flatMap(l=>[l.rect,l.frameRect])].filter(Boolean));
 const viewport={x:Math.floor(Math.min(0,bounds.x)-28/zoom),y:Math.floor(Math.min(0,bounds.y)-28/zoom)};
 viewport.w=Math.ceil(Math.max(variant.width,bounds.x+bounds.w)+28/zoom)-viewport.x;
 viewport.h=Math.ceil(Math.max(variant.height,bounds.y+bounds.h)+28/zoom)-viewport.y;
 let overflow=surface.querySelector('.overflow-preview');
 if(!overflow){overflow=document.createElement('canvas');overflow.className='overflow-preview';overflow.setAttribute('aria-hidden','true');surface.prepend(overflow);}
 const oldLeft=canvas.offsetLeft,oldTop=canvas.offsetTop;
 const key=`${variant.id}:${zoom}:${width}:${height}`,reset=surface.dataset.workspace!==key;
 if(!surface.dataset.editing){
  const previous=reset?[0,0,0,0]:surface.workspacePadding||[0,0,0,0];
  const padding=[-viewport.y*zoom,(viewport.x+viewport.w-variant.width)*zoom,(viewport.y+viewport.h-variant.height)*zoom,-viewport.x*zoom].map((n,i)=>Math.max(n,previous[i],i%2?(width-cssWidth)/2:(height-cssHeight)/2));
  surface.style.padding=padding.map(n=>`${n}px`).join(' ');surface.workspacePadding=padding;surface.dataset.workspace=key;
 }
 stage.classList.add('editing-workspace');
 Object.assign(overflow.style,{left:`${canvas.offsetLeft+viewport.x*zoom}px`,top:`${canvas.offsetTop+viewport.y*zoom}px`,width:`${viewport.w*zoom}px`,height:`${viewport.h*zoom}px`});
 const outerDensity=Math.min(dpr,Math.sqrt(8000000/(viewport.w*viewport.h*zoom*zoom)));
 render(overflow,project,variant,assets,{viewport,outsideOnly:true,pixelWidth:Math.max(1,Math.round(viewport.w*zoom*outerDensity)),pixelHeight:Math.max(1,Math.round(viewport.h*zoom*outerDensity))});
 if(reset){stage.scrollLeft=canvas.offsetLeft+(cssWidth-width)/2;stage.scrollTop=canvas.offsetTop+(cssHeight-height)/2;}
 else{stage.scrollLeft+=canvas.offsetLeft-oldLeft;stage.scrollTop+=canvas.offsetTop-oldTop;}
 return {...result,zoom,limited:density<dpr||outerDensity<dpr};
}
