import {sameEditDomain,groupName} from './locks.js';
export function createInspector({getState,selectLayer}){
 const $=id=>document.getElementById(id);let activeTab='properties',lastSelection='',paletteOpen=false;
 const typeOf=id=>id==='cta'?'button':['title','subtitle'].includes(id)?'text':['image','logo'].includes(id)?'image':null;
 function palette(show,focus=false){paletteOpen=show;$('text-style-palette').hidden=!show;$('open-text-style').setAttribute('aria-expanded',String(show));if(focus)(show?$('close-text-style'):$('open-text-style')).focus({preventScroll:true});}
 $('open-text-style').onclick=()=>palette(!paletteOpen,true);$('close-text-style').onclick=()=>palette(false,true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&paletteOpen){e.preventDefault();e.stopImmediatePropagation();palette(false,true);}},true);
 document.querySelectorAll('[data-element-type]').forEach(button=>button.onclick=()=>{const {selected}=getState(),type=button.dataset.elementType;tab('properties');selectLayer(typeOf(selected)===type?selected:{text:'title',image:'image',button:'cta'}[type]);});
 $('replace-image').onclick=()=>$('image-input').click();
 function tab(name){activeTab=name;for(const key of ['properties','background']){$(key+'-panel').hidden=key!==name;$('tab-'+key).setAttribute('aria-selected',String(key===name));}update();}
 for(const name of ['properties','background']){$('tab-'+name).onclick=()=>tab(name);$('tab-'+name).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'properties':e.key==='End'?'background':name==='properties'?'background':'properties';tab(next);$('tab-'+next).focus();}};}
 document.querySelectorAll('[data-layer]').forEach(button=>button.onclick=()=>{tab('properties');selectLayer(button.dataset.layer);});
 document.querySelectorAll('[data-fill]').forEach(button=>button.onclick=()=>{$('background').value=button.dataset.fill;$('background').dispatchEvent(new Event('change',{bubbles:true}));});
 document.addEventListener('pointerdown',e=>{if(!$('scope-details').contains(e.target))$('scope-details').open=false;});
 $('scope-details').addEventListener('keydown',e=>{if(e.key==='Escape'){$('scope-details').open=false;$('scope-summary').focus();e.preventDefault();e.stopPropagation();}});
 $('open-export').onclick=()=>$('export-dialog').showModal();$('close-export').onclick=()=>$('export-dialog').close();
 function update(){const {project,current,selected,busy,sync,style,content,background}=getState(),text=['title','subtitle','cta'].includes(selected);
  $('inspector-current').textContent=activeTab==='background'?'背景':{title:'文字',subtitle:'文字',cta:'按钮',image:'图片',logo:'图片'}[selected]||'选择元素';$('inspector-size').textContent=`${current.width} × ${current.height} · ${groupName(current)}编组`;
  const type=typeOf(selected),selection=current.id+':'+selected;
  if(selection!==lastSelection){lastSelection=selection;paletteOpen=text;}
  palette(paletteOpen&&text&&activeTab==='properties');
  $('open-text-style').disabled=busy;$('close-text-style').disabled=busy;
  $('palette-object').textContent=(content.copy[selected]||'空白文字').replace(/\s+/g,' ').slice(0,36);
  document.querySelectorAll('[data-element-type]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.elementType===type));button.disabled=busy;});
  $('element-objects').hidden=!type||type==='button';
  document.querySelectorAll('[data-layer]').forEach(button=>{button.hidden=typeOf(button.dataset.layer)!==type;const id=button.dataset.layer,copy=button.querySelector('.object-copy');if(copy)copy.textContent=`文字 ${id==='title'?1:2} · ${(content.copy[id]||'空白文字').replace(/\s+/g,' ').slice(0,50)}`;const image=button.querySelector('img');if(image){const data=id==='logo'?content.assets.logo:content.assets[content.source];image.hidden=!data;if(data&&image.getAttribute('src')!==data)image.src=data;if(!data)image.removeAttribute('src');}});
  $('image-tools').hidden=type!=='image';$('main-image-tools').hidden=selected!=='image';$('logo-image-tools').hidden=selected!=='logo';$('replace-image').disabled=busy;
  $('image-tools-title').textContent=selected==='logo'?'标识图片':'主图片';
  $('selection-hint').hidden=!!selected;$('text-properties').hidden=!text;$('image-properties').hidden=selected!=='image';$('logo-properties').hidden=selected!=='logo';$('transform-properties').hidden=!selected;
  document.querySelectorAll('[data-copy]').forEach(item=>item.hidden=item.dataset.copy!==selected);$('accent').closest('label').hidden=selected!=='cta';
  document.querySelectorAll('[data-layer]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.layer===selected));button.disabled=busy;});
  $('underline-parameters').hidden=style.underline==='none';$('stroke-parameters').hidden=style.strokeWidth===0;$('shadow-parameters').hidden=!style.shadowEnabled;$('separator-parameters').hidden=!style.separatorEnabled;
  $('separator-copy-hint').textContent=/[|｜]/.test(content.copy[selected]||'')?'文案中的 | / ｜ 会绘制成分隔线。':'当前文案未包含 | / ｜，输入后显示分隔线。';
  const auto=style.height===null;$('text-height-mode').value=auto?'auto':'fixed';$('text-height-value').hidden=auto;$('text-height-mode').disabled=busy||!text;
  const destination=$((text?'text':selected==='image'?'image':'logo')+'-position-actions'),centers=$('center-actions');centers.hidden=!selected;if(selected&&centers.parentElement!==destination)destination.append(centers);
  for(const id of ['center-horizontal','center-vertical','layer-scale'])$(id).disabled=busy||!selected;
  $('scale-percent').disabled=busy;$('reset-background-framing').disabled=busy||!background;$('background-framing').hidden=!background;
  $('background-colors').hidden=current.background==='transparent';$('color2').closest('label').hidden=current.background!=='gradient';document.querySelectorAll('[data-fill]').forEach(button=>{button.disabled=busy;button.setAttribute('aria-pressed',String(button.dataset.fill===current.background));});
  const targets=project.variants.filter(v=>v.id===current.id||(sync&&sameEditDomain(project,current,v))),key=current.id+':'+targets.map(v=>v.id).join('|');
  $('scope-summary').textContent=`影响 ${targets.length} 个 ›`;$('background-scope').textContent=$('fill-scope').textContent=`影响 ${targets.length} 个尺寸`;
  if($('scope-list').dataset.key!==key){$('scope-list').dataset.key=key;$('scope-list').replaceChildren(...targets.map(v=>{const li=document.createElement('li');li.textContent=`${v.width} × ${v.height}${v.id===current.id?'（当前）':''}`;return li;}));}
  document.querySelectorAll('[data-color-value]').forEach(output=>output.textContent=$(output.dataset.colorValue).value.toUpperCase());
  document.querySelectorAll('#background-list button,#background-management-list button,#background-clear').forEach(button=>button.disabled=busy);$('batch-select').disabled=busy;
 }
 return {update};
}
