import {layoutBoards,miniProjection,projectRect,unprojectPoint,zoomAt,fitRect} from './workspace-geometry.js';
import {render,loadImage} from './render.js';
import {activeBackground} from './backgrounds.js';
import {sameEditDomain,groupName} from './locks.js';
const NS='http://www.w3.org/2000/svg';
export function createInfiniteCanvas(root,getState,onSelect,createGroupLock,createSizeLock){
 const $=id=>document.getElementById(id),world=$('canvas-world'),surface=$('preview-surface'),map=$('canvas-minimap');
 let layout={boards:[],groups:[],bounds:{x:0,y:0,w:1,h:1}},transform={x:0,y:0,zoom:1},key='',currentId=null,selectedBoardId=null,first=true,space=false,pan=null,mapDrag=null,projection=null,paintFrame=0,revision=0,viewFrame=0;
 let wheelFrame=0,wheelDelta=0,wheelAnchor=null;
 let zoomTimer=null,paintTimer=null,paintedRevision=-1,paintError=null;const paintWaiters=new Set();
 const restoring=()=>root.getAttribute('aria-busy')==='true'||root.dataset.canvasState==='error';
 const schedulePaint=()=>{revision++;if(!paintFrame)paintFrame=requestAnimationFrame(paint);};
 function selectBoard(id){selectedBoardId=id;for(const [key,card]of cards)card.box.classList.toggle('selected',key===id);}
 const cards=new Map(),decoded=new WeakMap(),touches=new Map();let pinch=null;
 const viewport=()=>({x:-transform.x/transform.zoom,y:-transform.y/transform.zoom,w:root.clientWidth/transform.zoom,h:root.clientHeight/transform.zoom});
 function save(){try{sessionStorage.setItem('ad-studio-canvas',JSON.stringify({...transform,batch:sessionStorage.getItem('ad-studio-batch')}));}catch{}}
 function apply(){clearTimeout(paintTimer);paintTimer=setTimeout(schedulePaint,120);world.style.transform=`translate(${transform.x}px,${transform.y}px) scale(${transform.zoom})`;$('canvas-zoom').textContent=`${Math.round(transform.zoom*100)}%`;root.dataset.zoom=String(transform.zoom);root.classList.toggle('zoomed-out',transform.zoom<.25);root.classList.toggle('compact-boards',transform.zoom<.6);root.style.setProperty('--canvas-zoom',transform.zoom);if(!viewFrame)viewFrame=requestAnimationFrame(()=>{viewFrame=0;minimap();save();});}
 function endNavigation(cancelWheel=true){
  root.dispatchEvent(new Event('canvas-pan-start'));const captures=[[root,pan?.id],[map,mapDrag?.id]];pan=pinch=mapDrag=null;touches.clear();root.classList.remove('panning');
  for(const [element,id]of captures)if(id!==undefined&&element.hasPointerCapture(id))element.releasePointerCapture(id);
  if(cancelWheel){cancelAnimationFrame(wheelFrame);wheelFrame=0;wheelDelta=0;wheelAnchor=null;}
 }
 function minimap(){projection=mapDrag?.projection||miniProjection(layout.bounds,viewport());const nodes=[];
  for(const board of layout.boards){const r=projectRect(board,projection),rect=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({x:r.x,y:r.y,width:r.w,height:r.h,rx:2}))rect.setAttribute(k,v);rect.setAttribute('class',board.id===currentId?'minimap-node current':'minimap-node');nodes.push(rect);}
  const view=projectRect(viewport(),projection),rect=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({x:view.x,y:view.y,width:view.w,height:view.h}))rect.setAttribute(k,v);rect.setAttribute('class','minimap-viewport');nodes.push(rect);map.replaceChildren(...nodes);
 }
 function settledZoom(){clearTimeout(zoomTimer);zoomTimer=setTimeout(()=>root.dispatchEvent(new Event('canvas-zoomed')),120);}
 function focus(rect){if(!rect)return;transform=fitRect(rect,root.clientWidth,root.clientHeight);apply();settledZoom();}
 const focusCurrent=()=>focus(layout.boards.find(b=>b.id===currentId));
 function zoom(factor,anchor={x:root.clientWidth/2,y:root.clientHeight/2}){transform=zoomAt(transform,anchor,transform.zoom*factor);apply();settledZoom();}
 $('fit-all').onclick=()=>focus(layout.bounds);$('fit-current').onclick=focusCurrent;$('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);
 const editable=e=>e.target.isContentEditable||e.target.closest?.('input,textarea,select,[contenteditable=true],[role=textbox]');
 const typing=e=>e.target.closest?.('input,textarea,select,button,a,summary,[contenteditable=true],dialog');
 window.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||restoring()||document.querySelector('dialog[open]'))return;
  if(e.key==='Escape'&&!editable(e)&&selectedBoardId!==null){e.preventDefault();root.dispatchEvent(new Event('canvas-blank-pointerdown'));return;}
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&!editable(e)){
   let factor;
   if(['+','='].includes(e.key)||['Equal','NumpadAdd'].includes(e.code))factor=1.2;
   else if(e.key==='-'||['Minus','NumpadSubtract'].includes(e.code))factor=1/1.2;
   else{const digit=/^(?:Digit|Numpad)([0-9])$/.exec(e.code)?.[1]??(/^[0-9]$/.test(e.key)?e.key:null);if(digit!==null)factor=(Number(digit)===0?1:Number(digit)/10)/transform.zoom;}
   if(factor!==undefined){
    e.preventDefault();endNavigation();
    zoom(factor);return;
   }
  }
  if(typing(e)&&!(root.contains(e.target)&&e.target.closest('.canvas-tools,.text-resize-handle')))return;if(e.code==='Space'){space=true;e.preventDefault();root.classList.add('panning-ready');}
 });
 window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;root.classList.remove('panning-ready');}});
 window.addEventListener('blur',()=>{space=false;endNavigation();root.classList.remove('panning-ready');});
 root.addEventListener('wheel',e=>{
  if(restoring()||document.querySelector('dialog[open]')){e.preventDefault();return;}if(e.target.closest('.canvas-tools,.canvas-minimap'))return;
  e.preventDefault();const b=root.getBoundingClientRect(),anchor={x:e.clientX-b.x,y:e.clientY-b.y};
  if(e.ctrlKey||e.metaKey){
   endNavigation(false);wheelDelta-=e.deltaY*(e.deltaMode===1?.05:e.deltaMode?1:.002)*(e.ctrlKey&&navigator.userAgent.includes('Mac')?10:1);wheelAnchor=anchor;
   if(!wheelFrame)wheelFrame=requestAnimationFrame(()=>{wheelFrame=0;const delta=Math.max(-.25,Math.min(.25,wheelDelta)),point=wheelAnchor;wheelDelta=0;wheelAnchor=null;if(!restoring()&&point&&delta)zoom(2**delta,point);});
  }else{endNavigation();if(e.shiftKey){transform.x-=e.deltaX||e.deltaY;apply();}else{transform.x-=e.deltaX;if(e.deltaY)zoom(Math.exp(-e.deltaY*.0018),anchor);else apply();}}
 },{passive:false});
 root.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
 root.addEventListener('pointerdown',e=>{
  if(restoring())return;
  if(e.target.closest('.canvas-tools,.canvas-minimap,input,select,textarea')||(e.target.closest('button')&&!(space&&e.button===0)&&e.button!==1))return;
  if(e.pointerType==='touch')touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  let board=e.target.closest('.canvas-board');
  if(board?.dataset.variant===currentId&&e.target.matches('.overflow-preview')&&!getState().hitLayer(e.clientX,e.clientY)){
   board=[...cards.values()].find(card=>{if(card.box.dataset.variant===currentId)return false;const b=card.box.getBoundingClientRect();return e.clientX>=b.x&&e.clientX<=b.right&&e.clientY>=b.y&&e.clientY<=b.bottom;})?.box||null;
  }
  const isCurrent=board?.dataset.variant===currentId;
  if(touches.size===2){root.dispatchEvent(new Event('canvas-pan-start'));const points=[...touches.values()];pinch={distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y)};pan=null;e.preventDefault();e.stopPropagation();return;}
  if((space&&e.button===0)||e.button===1){e.preventDefault();e.stopPropagation();root.dispatchEvent(new Event('canvas-pan-start'));root.focus({preventScroll:true});pan={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...transform}};root.setPointerCapture(e.pointerId);root.classList.add('panning');return;}
  if(!board){if(e.button===0){e.preventDefault();e.stopPropagation();root.dispatchEvent(new Event('canvas-blank-pointerdown'));root.focus({preventScroll:true});}return;}
  if(!isCurrent){e.preventDefault();e.stopPropagation();if(!getState().busy)onSelect(board.dataset.variant);}
 },true);
 root.addEventListener('pointermove',e=>{
  if(restoring())return;
  if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&touches.size===2){const points=[...touches.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),b=root.getBoundingClientRect();zoom(distance/pinch.distance,{x:(points[0].x+points[1].x)/2-b.x,y:(points[0].y+points[1].y)/2-b.y});pinch.distance=distance;e.stopPropagation();return;}
  if(!pan||pan.id!==e.pointerId)return;transform={...pan.start,x:pan.start.x+e.clientX-pan.x,y:pan.start.y+e.clientY-pan.y};apply();
 },true);
 const end=e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;if(pan?.id===e.pointerId){pan=null;root.classList.remove('panning');}};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(event,end,true);
 root.addEventListener('contextmenu',e=>{if(!typing(e))e.preventDefault();});
 function locate(e){const b=map.getBoundingClientRect(),p=unprojectPoint({x:(e.clientX-b.x)*170/b.width,y:(e.clientY-b.y)*110/b.height},mapDrag.projection);transform.x=root.clientWidth/2-p.x*transform.zoom;transform.y=root.clientHeight/2-p.y*transform.zoom;apply();}
 map.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();mapDrag={projection,id:e.pointerId};map.setPointerCapture(e.pointerId);locate(e);});map.addEventListener('pointermove',e=>{if(mapDrag)locate(e);});for(const event of ['pointerup','pointercancel','lostpointercapture'])map.addEventListener(event,()=>{mapDrag=null;minimap();});
 map.addEventListener('keydown',e=>{const delta={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]}[e.key];if(delta){e.preventDefault();transform.x+=delta[0];transform.y+=delta[1];apply();}if(e.key==='Home'){e.preventDefault();focus(layout.bounds);}});
 async function paint(){
  paintFrame=0;const version=revision;let failure=null;
  try{
   const {project,assets,busy}=getState(),view=viewport();
   for(const board of layout.boards){
    const card=cards.get(board.id);if(!card||board.id===currentId)continue;
    try{
     const variant=project.variants.find(v=>v.id===board.id),background=activeBackground(project,variant);let image=null;
     if(background){if(!decoded.has(background))decoded.set(background,loadImage(background.data));image=await decoded.get(background);}
     if(version!==revision)return;
     const visible=board.x<view.x+view.w&&board.x+board.w>view.x&&board.y<view.y+view.h&&board.y+board.h>view.y,density=Math.min((window.devicePixelRatio||1)*transform.zoom,visible?Math.sqrt(8000000/(board.w*board.h)):1);
     const result=render(card.canvas,project,variant,{...assets,background:image},{pixelWidth:Math.max(1,Math.round(board.w*density)),pixelHeight:Math.max(1,Math.round(board.h*density))});
     card.status.textContent=result.warnings.length?`${result.warnings.length} 项提示`:'';card.box.title=[variant.id.replace('x',' × '),...result.warnings].join('\n');card.button.disabled=busy;
    }catch(error){failure??=error;card.status.textContent='预览读取失败';card.button.title=error.message;}
   }
  }catch(error){failure=error;}
  if(version!==revision)return;
  paintedRevision=version;paintError=failure;
  for(const waiter of paintWaiters){if(failure)waiter.reject(failure);else waiter.resolve();}paintWaiters.clear();
 }
 function ready(){
  if(paintedRevision===revision)return paintError?Promise.reject(paintError):Promise.resolve();
  const done=new Promise((resolve,reject)=>paintWaiters.add({resolve,reject}));if(revision===0&&!paintFrame)schedulePaint();return done;
 }
 function update(paint=true){const {project,assets,busy,currentId:id,sync}=getState();const nextKey=project.variants.map(v=>v.id).join('|');
  if(nextKey!==key){key=nextKey;layout=layoutBoards(project.variants);const fragment=document.createDocumentFragment();cards.clear();
   for(const g of layout.groups){const group=document.createElement('section');group.className='canvas-group';group.dataset.group=g.name;Object.assign(group.style,{left:`${g.x}px`,top:`${g.y}px`,width:`${g.w}px`,height:`${g.h}px`});const title=document.createElement('button');title.className='canvas-group-title';title.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';title.append(`${g.name}　${g.ids.length} 个尺寸`);title.onclick=()=>focus(g);const header=document.createElement('div');header.className='canvas-group-header';header.append(title,createGroupLock(g.name));group.append(header);fragment.append(group);}
   for(const board of layout.boards){const box=document.createElement('div');box.className='canvas-board';box.dataset.variant=board.id;Object.assign(box.style,{left:`${board.x}px`,top:`${board.y}px`,width:`${board.w}px`,height:`${board.h}px`});const button=document.createElement('button');button.className='board-label';button.textContent=board.id.replace('x',' × ');button.onclick=()=>onSelect(board.id);const canvas=document.createElement('canvas');canvas.className='board-thumbnail';canvas.setAttribute('aria-hidden','true');const status=document.createElement('span');status.className='board-status';const header=document.createElement('div');header.className='board-header';const lock=createSizeLock(board.id);lock.dataset.lock='size';header.append(button,lock);box.append(header,canvas,status);fragment.append(box);cards.set(board.id,{box,canvas,button,status});}
   world.append(surface);world.replaceChildren(fragment,surface);
   const nav=$('group-nav');nav.replaceChildren(...layout.groups.map(g=>{const button=document.createElement('button');button.textContent=`${g.name} · ${g.ids.length}`;button.onclick=()=>focus(g);return button;}));
  }
  currentId=id;if(selectedBoardId!==null&&!cards.has(selectedBoardId))selectedBoardId=id;const board=layout.boards.find(b=>b.id===id);if(board){const card=cards.get(id);if(surface.parentElement!==card.box)card.box.append(surface);surface.style.width=`${board.w}px`;surface.style.height=`${board.h}px`;}
  for(const [id,card]of cards){card.button.disabled=busy;card.box.classList.toggle('current',id===currentId);card.box.classList.toggle('selected',id===selectedBoardId);card.canvas.hidden=id===currentId;card.box.classList.toggle('sync-target',sync&&id!==currentId&&sameEditDomain(project,project.variants.find(v=>v.id===currentId),project.variants.find(v=>v.id===id)));}
  world.querySelectorAll('.canvas-group').forEach(el=>el.classList.toggle('active',el.dataset.group===groupName(project.variants.find(v=>v.id===currentId))));
  if(first&&board){first=false;try{const stored=JSON.parse(sessionStorage.getItem('ad-studio-canvas'));if(stored&&stored.batch===sessionStorage.getItem('ad-studio-batch')&&[stored.x,stored.y,stored.zoom].every(Number.isFinite)&&stored.zoom>=.05&&stored.zoom<=64){transform=stored;apply();}else focusCurrent();}catch{focusCurrent();}}
  if(paint)schedulePaint();minimap();
 }
 new ResizeObserver(()=>apply()).observe(root);
 return {ready,update,focusCurrent,selectBoard,actual(){const board=layout.boards.find(b=>b.id===currentId);if(board){transform=zoomAt(transform,{x:root.clientWidth/2,y:root.clientHeight/2},1/board.scale);apply();settledZoom();}},reset(){first=true;key='';selectBoard(null);},get board(){return layout.boards.find(b=>b.id===currentId);}};
}
