import {elementFor,elementType,isTextLayer} from './elements.js';
import {sameEditDomain,groupName} from './locks.js';
import {cutoutTextVisible} from './image-content.js';
export function createInspector({getState,selectLayer,addElement,replaceImage}){
 const $=id=>document.getElementById(id);let activeTab='properties',lastSelection='',paletteOpen=false;
 const typeOf=id=>elementType(getState().current,id);
 $('add-element').onclick=()=>addElement(typeOf(getState().selected)||'text');
 const cta=document.createElement('button');cta.type='button';cta.dataset.layer='cta';const ctaCopy=document.createElement('span');ctaCopy.className='object-copy';cta.append(ctaCopy);$('element-objects').append(cta);
 $('element-objects').onclick=e=>{const button=e.target.closest('[data-layer]');if(button){tab('properties');selectLayer(button.dataset.layer);}};
 function palette(show,focus=false){paletteOpen=show;$('text-style-palette').hidden=!show;$('open-text-style').setAttribute('aria-expanded',String(show));if(focus)(show?$('close-text-style'):$('open-text-style')).focus({preventScroll:true});}
 $('open-text-style').onclick=()=>palette(!paletteOpen,true);$('close-text-style').onclick=()=>palette(false,true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&paletteOpen){e.preventDefault();e.stopImmediatePropagation();palette(false,true);}},true);
 document.querySelectorAll('[data-element-type]').forEach(button=>button.onclick=()=>{const {selected}=getState(),type=button.dataset.elementType;tab('properties');selectLayer(typeOf(selected)===type?selected:{text:'title',image:'image',button:'cta'}[type]);});
 $('replace-image').onclick=replaceImage;
 function tab(name){activeTab=name;for(const key of ['properties','background']){$(key+'-panel').hidden=key!==name;$('tab-'+key).setAttribute('aria-selected',String(key===name));}update();}
 for(const name of ['properties','background']){$('tab-'+name).onclick=()=>tab(name);$('tab-'+name).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'properties':e.key==='End'?'background':name==='properties'?'background':'properties';tab(next);$('tab-'+next).focus();}};}

 document.querySelectorAll('[data-fill]').forEach(button=>button.onclick=()=>{$('background').value=button.dataset.fill;$('background').dispatchEvent(new Event('change',{bubbles:true}));});
 document.addEventListener('pointerdown',e=>{if(!$('scope-details').contains(e.target))$('scope-details').open=false;});
 $('scope-details').addEventListener('keydown',e=>{if(e.key==='Escape'){$('scope-details').open=false;$('scope-summary').focus();e.preventDefault();e.stopPropagation();}});
 $('open-export').onclick=()=>$('export-dialog').showModal();$('close-export').onclick=()=>$('export-dialog').close();
 function update(){const {project,current,selected,busy,sync,style,content,background}=getState(),text=isTextLayer(current,selected),added=elementFor(current,selected);
  $('inspector-current').textContent=activeTab==='background'?'背景':{text:'文字',button:'按钮',image:'图片'}[typeOf(selected)]||'选择元素';$('inspector-size').textContent=`${current.width} × ${current.height} · ${groupName(current)}编组`;
  const type=typeOf(selected),selection=current.id+':'+selected;
  if(selection!==lastSelection){lastSelection=selection;paletteOpen=text;}
  palette(paletteOpen&&text&&activeTab==='properties');
  $('open-text-style').disabled=busy;$('close-text-style').disabled=busy;
  $('palette-object').textContent=(added?.text??content.copy[selected]??'空白文字').replace(/\s+/g,' ').slice(0,36);
  document.querySelectorAll('[data-element-type]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.elementType===type));button.disabled=busy;});
  $('add-element').textContent='＋ 新增'+({text:'文字',image:'图片',button:'按钮'}[type]||'文字');$('add-element').disabled=busy;$('add-element').hidden=!type;
  $('element-objects').hidden=!type;
  const ids=new Set((current.elements||[]).map(e=>e.id));
  for(const row of $('element-objects').querySelectorAll('[data-layer^="element-"]'))if(!ids.has(row.dataset.layer))row.remove();
  for(const e of current.elements||[])if(!$('element-objects').querySelector(`[data-layer="${e.id}"]`)){const row=document.createElement('button');row.type='button';row.dataset.layer=e.id;const img=document.createElement('img');img.alt='';img.hidden=true;const copy=document.createElement('span');copy.className='object-copy';row.append(img,copy);$('element-objects').append(row);}
  const rows=[...$('element-objects').querySelectorAll('[data-layer^="element-"]')],byId=new Map(rows.map(row=>[row.dataset.layer,row]));
  if((current.elements||[]).some((e,i)=>rows[i]?.dataset.layer!==e.id))$('element-objects').append(...current.elements.map(e=>byId.get(e.id)));
  $('delete-element').hidden=!added;$('delete-element').disabled=busy;$('delete-element').textContent='删除'+({text:'文字',image:'图片',button:'按钮'}[added?.type]||'元素');
  $('element-copy-field').hidden=!added||!text;$('element-copy').disabled=busy;
  if(added&&text&&$('element-copy').value!==added.text)$('element-copy').value=added.text;
  $('added-image-properties').hidden=added?.type!=='image';
  for(const key of ['x','y','width','height']){const input=$('element-'+key);input.disabled=busy;if(added?.type==='image')input.value=added[key];}
  $('replace-element-image').disabled=busy;

  document.querySelectorAll('[data-layer]').forEach(button=>{const id=button.dataset.layer,e=elementFor(current,id),kind=typeOf(id);button.hidden=kind!==type;const copy=button.querySelector('.object-copy'),same=(current.elements||[]).filter(item=>item.type===kind),number=e?same.findIndex(item=>item.id===id)+(kind==='text'?3:kind==='image'?3:2):id==='title'?1:id==='subtitle'||id==='logo'?2:1;
   if(e?.cutoutParent)button.hidden=kind!==type||!cutoutTextVisible(project,current,e);
   if(copy)copy.textContent=e?.cutoutParent?'图片 · 原图文字':`${kind==='button'?'按钮':kind==='image'?'图片':'文字'} ${number} · ${(e?.text??content.copy[id]??'图片').replace(/\s+/g,' ').slice(0,50)}`;
   const image=button.querySelector('img');if(image){const data=e?.type==='image'?project.media[e.media]:id==='logo'?content.assets.logo:id==='image'?content.assets[content.source]:null;image.hidden=!data;if(data&&image.getAttribute('src')!==data)image.src=data;if(!data)image.removeAttribute('src');}
  });
  $('image-tools').hidden=type!=='image';$('main-image-tools').hidden=selected!=='image';$('logo-image-tools').hidden=selected!=='logo';$('replace-image').disabled=busy;
  $('image-tools-title').textContent='图片';
  $('selection-hint').hidden=!!selected;$('text-properties').hidden=!text;$('image-properties').hidden=selected!=='image';$('logo-properties').hidden=selected!=='logo';$('transform-properties').hidden=!selected;
  document.querySelectorAll('[data-copy]').forEach(item=>item.hidden=item.dataset.copy!==selected);$('accent').closest('label').hidden=type!=='button';
  document.querySelectorAll('[data-layer]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.layer===selected));button.disabled=busy;});
  $('underline-parameters').hidden=style.underline==='none';$('stroke-parameters').hidden=style.strokeWidth===0;$('shadow-parameters').hidden=!style.shadowEnabled;$('separator-parameters').hidden=!style.separatorEnabled;
  $('separator-copy-hint').textContent=/[|｜]/.test(added?.text??content.copy[selected]??'')?'文案中的 | / ｜ 会绘制成分隔线。':'当前文案未包含 | / ｜，输入后显示分隔线。';
  const auto=style.height===null;$('text-height-mode').value=auto?'auto':'fixed';$('text-height-value').hidden=auto;$('text-height-mode').disabled=busy||!text;
  const destination=$((text?'text':added?'element':selected==='image'?'image':'logo')+'-position-actions'),centers=$('center-actions');centers.hidden=!selected;if(selected&&centers.parentElement!==destination)destination.append(centers);
  for(const id of ['center-horizontal','center-vertical','layer-scale'])$(id).disabled=busy||!selected;
  $('scale-percent').disabled=busy;$('reset-background-framing').disabled=busy||!background;$('background-framing').hidden=!background;
  $('background-colors').hidden=current.background==='transparent';$('color2').closest('label').hidden=current.background!=='gradient';document.querySelectorAll('[data-fill]').forEach(button=>{button.disabled=busy;button.setAttribute('aria-pressed',String(button.dataset.fill===current.background));});
  const domainTargets=project.variants.filter(v=>v.id===current.id||(sync&&sameEditDomain(project,current,v))),targets=added?domainTargets.filter(v=>elementFor(v,selected)):domainTargets,key=current.id+':'+targets.map(v=>v.id).join('|');
  $('scope-summary').textContent=`影响 ${targets.length} 个 ›`;$('background-scope').textContent=$('fill-scope').textContent=`影响 ${domainTargets.length} 个尺寸`;$('add-element').title=`新增将影响 ${domainTargets.length} 个尺寸`;$('delete-element').title=`删除将影响 ${targets.length} 个尺寸，可撤销`;
  if($('scope-list').dataset.key!==key){$('scope-list').dataset.key=key;$('scope-list').replaceChildren(...targets.map(v=>{const li=document.createElement('li');li.textContent=`${v.width} × ${v.height}${v.id===current.id?'（当前）':''}`;return li;}));}
  document.querySelectorAll('[data-color-value]').forEach(output=>output.textContent=$(output.dataset.colorValue).value.toUpperCase());
  document.querySelectorAll('#background-list button,#background-management-list button,#background-clear').forEach(button=>button.disabled=busy);$('batch-select').disabled=busy;
 }
 return {update};
}
