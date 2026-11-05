import {previewGroup} from './preview-groups.js';
import {render,loadImage} from './render.js';
import {activeBackground} from './backgrounds.js';
export function createSizePreviews(root,getState,onSelect){
 let frame=0,revision=0,listKey='',cards=[];
 const decoded=new WeakMap();
 const schedule=()=>{revision++;if(!frame)frame=requestAnimationFrame(paint);};
 async function paint(){
  frame=0;const version=revision,{project,assets,currentId,busy}=getState();
  const key=project.variants.map(v=>v.id).join('|')+':'+currentId;
  if(key!==listKey){
   const group=previewGroup(project,currentId);root.setAttribute('aria-label',`${group.name} · 其他尺寸预览`);
   listKey=key;cards=group.variants.map(v=>{
    const button=document.createElement('button');button.type='button';button.className='size-preview';button.dataset.variant=v.id;button.setAttribute('aria-label',`切换到 ${v.width} × ${v.height}`);
    const canvas=document.createElement('canvas'),label=document.createElement('span'),warning=document.createElement('span');
    canvas.width=1;canvas.height=1;label.textContent=`${v.width} × ${v.height}`;warning.className='preview-warning';button.append(canvas,label,warning);button.onclick=()=>onSelect(v.id);return{button,canvas,warning,id:v.id};
   });
   const heading=document.createElement('h3');heading.className='preview-group-heading';heading.textContent=`${group.name} · ${cards.length} 个其他尺寸`;root.replaceChildren(heading,...cards.map(c=>c.button));
   if(!cards.length){const hint=document.createElement('p');hint.className='help';hint.textContent='当前分组暂无其他尺寸。';root.append(hint);}
  }
  const bounds=root.getBoundingClientRect();
  for(const card of cards){
   card.button.disabled=busy;const box=card.button.getBoundingClientRect();
   if(box.bottom<bounds.top||box.top>bounds.bottom)continue;
   const variant=project.variants.find(v=>v.id===card.id),background=activeBackground(project,variant);let image=null;
   try{
    if(background){if(!decoded.has(background))decoded.set(background,loadImage(background.data));image=await decoded.get(background);}
    if(version!==revision){schedule();return;}
    const width=Math.max(1,Math.min(240,box.width-18)),height=140,scale=Math.min(width/variant.width,height/variant.height),density=Math.min(window.devicePixelRatio||1,2);
    card.canvas.style.width=`${variant.width*scale}px`;card.canvas.style.height=`${variant.height*scale}px`;
    const result=render(card.canvas,project,variant,{...assets,background:image},{pixelWidth:Math.max(1,Math.round(variant.width*scale*density)),pixelHeight:Math.max(1,Math.round(variant.height*scale*density))});
    const missing=project.backgrounds.length&&project.backgroundMode==='matched'&&!background;
    card.warning.textContent=missing?'背景未匹配':result.warnings.length?`${result.warnings.length} 项版面提示`:'';
    card.button.title=[`${variant.width} × ${variant.height}`,missing?'背景未匹配':'',...result.warnings].filter(Boolean).join('\n');
   }catch(error){if(version!==revision)return;card.warning.textContent='预览读取失败';card.button.title=error.message;}
  }
 }
 root.addEventListener('scroll',schedule,{passive:true});new ResizeObserver(schedule).observe(root);
 return{update:schedule};
}
