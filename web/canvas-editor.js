import {clampPosition} from './state.js';
import {resizeLayer,TEXT_IDS} from './layer-geometry.js';
function contains(r,x,y){return r&&x>=r.x&&y>=r.y&&x<=r.x+r.w&&y<=r.y+r.h;}
function intersect(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,w:Math.min(a.x+a.w,b.x+b.w)-x,h:Math.min(a.y+a.h,b.y+b.h)-y};}
export function hitTest(regions,v,x,y){
 for(const id of ['cta','subtitle','title'])if(regions.layers?.[id]?.hitRects.some(rect=>contains(rect,x,y)))return id;
 if(contains(regions.logo,x,y))return'logo';
 let image=regions.image;if(image&&v.crop)image=intersect(image,v.box);if(contains(image,x,y))return'image';return null;
}
export function moveLayer(variant,id,start,dx,dy){
 if(TEXT_IDS.includes(id)){variant.textLayers[id].dx=clampPosition(start.textLayers[id].dx+dx);variant.textLayers[id].dy=clampPosition(start.textLayers[id].dy+dy);}
 else if(id==='image'){variant.dx=clampPosition(start.dx+dx);variant.dy=clampPosition(start.dy+dy);}
 else if(id==='logo'){variant.logoX=clampPosition(start.logoX+dx,-6000);variant.logoY=clampPosition(start.logoY+dy,-6000);}
}
export function createCanvasEditor(canvas,selectionBox,{getVariant,getAssets=()=>({}),isBusy,onChange,onSelect,onEnd=()=>{}}){
 let selected=null,regions={},drag=null;const surface=canvas.parentElement;
 const frameFor=id=>regions.layers?.[id]?.frameRect||regions[id],stop=()=>{if(!drag)return;drag=null;delete surface.dataset.editing;onChange();onEnd();};
 function resize(start,frame,side,dx,dy){const v=getVariant();const next=resizeLayer(v,selected,start,frame,side,dx,dy,getAssets());onChange(start,{resize:side,layerId:selected,startFrame:frame,frame:next});}
 const directions={nw:'左上',n:'上',ne:'右上',e:'右',se:'右下',s:'下',sw:'左下',w:'左'};
 const handles=Object.entries(directions).map(([side,label])=>{
  const handle=document.createElement('button');handle.type='button';handle.className='text-resize-handle';handle.dataset.resize=side;handle.setAttribute('aria-label',`调整图层${label}边界`);
  handle.addEventListener('pointerdown',e=>{const frame=frameFor(selected);if(isBusy()||!frame)return;e.preventDefault();e.stopPropagation();const nearest=handles.reduce((best,item)=>{const r=item.getBoundingClientRect(),distance=(e.clientX-r.x-r.width/2)**2+(e.clientY-r.y-r.height/2)**2;return !best||distance<best.distance?{side:item.dataset.resize,distance}:best;},null);const v=getVariant(),b=canvas.getBoundingClientRect();surface.dataset.editing='true';drag={resize:nearest.side,id:selected,variantId:v.id,x:e.clientX,y:e.clientY,sx:v.width/b.width,sy:v.height/b.height,start:structuredClone(v),frame:{...frame}};handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(!drag?.resize)return;if(isBusy()||getVariant().id!==drag.variantId||selected!==drag.id){stop();return;}resize(drag.start,drag.frame,drag.resize,(e.clientX-drag.x)*drag.sx,(e.clientY-drag.y)*drag.sy);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,stop);
  handle.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();select(null);canvas.focus();return;}if(isBusy()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const frame=frameFor(selected);if(!frame)return;const step=e.shiftKey?10:1;resize(structuredClone(getVariant()),frame,side,e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);onEnd();});
  selectionBox.append(handle);return handle;
 });
 function outline(){const v=getVariant(),rect=frameFor(selected);for(const handle of handles){handle.hidden=!rect;handle.disabled=isBusy();}selectionBox.hidden=!rect||!v;if(!rect||!v)return;const b={width:canvas.clientWidth,height:canvas.clientHeight};Object.assign(selectionBox.style,{left:`${canvas.offsetLeft+rect.x*b.width/v.width}px`,top:`${canvas.offsetTop+rect.y*b.height/v.height}px`,width:`${Math.max(1,rect.w*b.width/v.width)}px`,height:`${Math.max(1,rect.h*b.height/v.height)}px`});}
 function select(id){stop();selected=id;onSelect(id);outline();}
 surface.addEventListener('pointerdown',e=>{if(isBusy()||e.button!==0||e.defaultPrevented)return;const v=getVariant();if(!v)return;const b=canvas.getBoundingClientRect(),x=(e.clientX-b.x)*v.width/b.width,y=(e.clientY-b.y)*v.height/b.height;const id=hitTest(regions,v,x,y);select(id);canvas.focus({preventScroll:true});if(!id)return;e.preventDefault();surface.dataset.editing='true';drag={id,variantId:v.id,x:e.clientX,y:e.clientY,sx:v.width/b.width,sy:v.height/b.height,start:structuredClone(v)};surface.setPointerCapture(e.pointerId);});
 surface.addEventListener('pointermove',e=>{if(!drag||drag.resize)return;if(isBusy()||getVariant().id!==drag.variantId){stop();return;}moveLayer(getVariant(),drag.id,drag.start,(e.clientX-drag.x)*drag.sx,(e.clientY-drag.y)*drag.sy);onChange(drag.start,{layerId:drag.id});});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(event,stop);
 canvas.addEventListener('keydown',e=>{if(isBusy())return;if(e.key==='Escape'){select(null);return;}if(!selected||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const v=getVariant(),before=structuredClone(v),step=e.shiftKey?10:1;moveLayer(v,selected,before,e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);onChange(before,{layerId:selected});onEnd();});
 return{hitAt(clientX,clientY){const v=getVariant(),b=canvas.getBoundingClientRect();return hitTest(regions,v,(clientX-b.x)*v.width/b.width,(clientY-b.y)*v.height/b.height);},update(next){regions=next;if(isBusy()||!frameFor(selected))stop();outline();},select,getSelection:()=>selected,cancel:stop,refresh:outline};
}
