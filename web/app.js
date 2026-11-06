import {imageSources,applyImageSource,applyTextCutout,validateTextCutoutResult,MAX_IMAGE_BYTES} from './image-content.js';
import {randomUUID} from './uuid.js';
import {elementFor,elementType,isTextLayer,addElement,editElement,removeElement,internElementMedia} from './elements.js';
import {MEDIA_KEYS,contentFor,editShared,pruneMedia,SHARED_KEYS} from './shared-content.js';
import {sameEditDomain,groupName,editDomainName,setSizeLock,setGroupLock} from './locks.js';
import {createNotifications} from './notifications.js';
import {createDrafts,draftSnapshot} from './drafts.js';
import {setupDraftUI} from './drafts-ui.js';
import {syncVariantChanges,groupSyncTargets,syncGroupFromVariant} from './size-sync.js';
import {createInfiniteCanvas} from './infinite-canvas.js';
import {createInspector} from './inspector.js';
import {centerSelection} from './inspector-actions.js';
import {compressedPng} from './compression.js';
import {PRESET_GROUPS,addAllPresets,createProject,addVariant,defaultVariant,validateProject,validateBackgroundBatch,clampPosition} from './state.js';
import {loadImage,loadAssets,render,variantAssets} from './render.js';
import {drawPreview} from './preview.js';
import {decodeBackgrounds,activeBackground,buildAssignments,applyImportedBackgrounds} from './backgrounds.js';
import {exportArchive} from './exporter.js';
import {mediaRect,resizeLayer,preserveTextPositions,TEXT_IDS} from './layer-geometry.js';
import {layoutText,resolvedTextStyle} from './text-layout.js';
import {createCanvasEditor} from './canvas-editor.js';
const $=id=>document.getElementById(id),textIds=['title','subtitle','cta'];
let restoredView=null;try{restoredView=JSON.parse(sessionStorage.getItem('ad-studio-view')||'null');}catch{}
let project=createProject(),assets={original:null,cutout:null,logo:null,background:null,backgroundId:null},currentId='300x250',busy=true,booting=true,dirty=false,modelReady=false,switching=false,loadVersion=0,editor=null,exportAbort=null;
addVariant(project,300,250);let plan=buildAssignments(project);
const excludedExportSizes=new Set();
const exportProject=()=>({...project,variants:project.variants.filter(v=>!excludedExportSizes.has(v.id))});
const current=()=>project.variants.find(v=>v.id===currentId);
let editSnapshot=structuredClone(current()),gesture=null,switchAnimation=null,canvasPreviewError=null;
const measurement=document.createElement('canvas').getContext('2d');
const effective=()=>contentFor(project,current());
const resizeAssets=(v=current())=>{const own=variantAssets(project,v,assets);return {...own,image:own[contentFor(project,v).source],logo:own.logo,layout:variant=>layoutText(measurement,project,variant)};};
const sharedPatch=(p,patch)=>editShared(p,p.variants.find(v=>v.id===currentId),patch,$('sync-sizes').checked);
async function refreshAssets(){Object.assign(assets,await loadAssets(project));}
function refreshCopy(){for(const key of textIds)$(key).value=effective().copy[key];}
function resizeFrames(variants,id){return Object.fromEntries(variants.map(v=>[v.id,isTextLayer(v,id)?layoutText(measurement,project,v).find(l=>l.id===id)?.frameRect:resizeAssets(v)[id]?mediaRect(v,id,resizeAssets(v)[id]):null]));}
const previews=createInfiniteCanvas($('stage'),()=>({project,assets,currentId,busy:busy&&!switching,sync:$('sync-sizes').checked,hitLayer:(x,y)=>editor?.hitAt(x,y)}),setVariant,createGroupLock,createSizeLock);
let inspector=null,lastImageSyncLimit='';
function refreshEditSnapshot(){editSnapshot=structuredClone(current());gesture=null;}
function commitVariantEdit(start,edit){
 const v=current();let limited=[];
 if($('sync-sizes').checked){
  if(start){
   if(gesture?.start!==start)gesture={start,targets:structuredClone(project.variants),frames:edit?.resize?resizeFrames(project.variants,edit.layerId):null};
   const targets=structuredClone(gesture.targets);limited=syncVariantChanges({...project,variants:targets},start,v,{...edit,frames:gesture.frames,targetAssets:Object.fromEntries(project.variants.map(v=>[v.id,resizeAssets(v)]))},resizeAssets());
   for(const target of targets)if(target.id!==v.id)Object.assign(project.variants.find(item=>item.id===target.id),target);
  }else limited=syncVariantChanges(project,editSnapshot,v,{...edit,targetAssets:Object.fromEntries(project.variants.map(v=>[v.id,resizeAssets(v)]))},resizeAssets());
 }
 const limitMessage=limited.length?`以下尺寸已到图片大小或位置边界，无法继续按比例同步：${limited.join('、')}`:'';
 if(limitMessage&&limitMessage!==lastImageSyncLimit)notice(limitMessage);lastImageSyncLimit=limitMessage;
 editSnapshot=structuredClone(v);changed(start?'canvas-gesture':undefined);syncProperties();draw();
}
$('sync-sizes').onchange=()=>{refreshEditSnapshot();saveView();draw();};
$('sync-group').onclick=()=>{
 if(busy)return;
 editor?.cancel();
 try{
  const source=current(),next=structuredClone(project),targets=syncGroupFromVariant(next,source.id);
  if(!targets.length)return;
  const checked=validateProject(next);
  drafts.end();project=checked;refreshEditSnapshot();rebuild();changed();syncProperties();draw();
  notice(`已同步 ${source.width} × ${source.height} 到${groupName(source)}组内 ${targets.length} 个尺寸，可撤销。`);
 }catch(e){notice(`组内同步出现错误：${e.message}。`,true);}
};
const basicControls=['bg-zoom','bg-x','bg-y','feather','scale','dx','dy','crop','accent','background','color','color2','logo-x','logo-y','logo-width'];
const effectControls=['text-w','text-h','separator-enabled','font-weight','font-italic','underline-style','underline-color','separator-color','separator-width','separator-height','text-x','text-y','font-size','text-color','stroke-width','stroke-color','shadow-enabled','shadow-color','shadow-opacity','shadow-blur','shadow-x','shadow-y'];
const effectFields={'text-w':'width','text-h':'height','separator-enabled':'separatorEnabled','font-weight':'fontWeight','font-italic':'italic','underline-style':'underline','underline-color':'underlineColor','separator-color':'separatorColor','separator-width':'separatorWidth','separator-height':'separatorHeight','text-x':'dx','text-y':'dy','font-size':'fontSize','text-color':'color','stroke-width':'strokeWidth','stroke-color':'strokeColor','shadow-enabled':'shadowEnabled','shadow-color':'shadowColor','shadow-opacity':'shadowOpacity','shadow-blur':'shadowBlur','shadow-x':'shadowX','shadow-y':'shadowY'};
const notifications=createNotifications($('notifications'),$('toast-message'),$('toast-close'),$('notice'),$('draft-status'));
function notice(text,error=false){notifications.notice(text,error);}
function changed(group){const active=document.activeElement,key=group??(active?.matches('input:not([type=file]),textarea')?active.id:null);if(drafts.mark(key)){dirty=true;document.title='● 图片批处理工作台';}}
const drafts=createDrafts({snapshot:()=>draftSnapshot(project,{currentId,syncSizes:$('sync-sizes').checked,excludedExportSizes:[...excludedExportSizes].filter(id=>project.variants.some(v=>v.id===id)),previewMode:$('preview-mode').value}),isBusy:()=>busy||document.querySelector('[data-editing]'),historyChanged:()=>{if($('undo')){$('undo').disabled=busy||!drafts.canUndo;$('redo').disabled=busy||!drafts.canRedo;}},status:(text,error=false)=>notifications.draft(text,error),saved:()=>{dirty=false;document.title='图片批处理工作台';$('save-indicator').textContent=$('draft-status').textContent;window.dispatchEvent(new Event('batch-saved'));}});
function saveView(){try{sessionStorage.setItem('ad-studio-view',JSON.stringify({currentId,selectedLayer:editor?.getSelection()||null,syncSizes:$('sync-sizes').checked,previewMode:$('preview-mode').value}));}catch{}}
document.addEventListener('focusout',()=>drafts.end());
document.addEventListener('pointerdown',()=>drafts.end(),true);
window.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||booting||document.querySelector('dialog[open]')||!(e.metaKey||e.ctrlKey)||e.altKey||e.target.isContentEditable||e.target.closest?.('input,textarea,select,[role=textbox]'))return;const key=e.key.toLowerCase();if(key==='z'||key==='y'){e.preventDefault();requestTravel(key==='y'||e.shiftKey?1:-1,e.repeat);}});
function blankProject(){const next=createProject();addVariant(next,300,250);return next;}
async function installProject(input,ui={},preserveSelection=false,history=false){
 const selectedLayer=preserveSelection?editor?.getSelection():null;
 const copy=draftSnapshot(input,ui);for(const image of copy.images)image.target[image.key]=image.data;const next=validateProject(copy.project);if(!next.variants.length)throw Error('项目没有尺寸');
 const selected=next.variants.find(v=>v.id===ui.currentId)||next.variants[0],decoded=await loadAssets(next);decoded.background=await decodeBackgrounds(next,selected);validateProject(next);decoded.backgroundId=activeBackground(next,selected)?.id||null;
 if(!history){editor?.cancel();editor?.select(null);previews.reset();}project=next;assets=decoded;currentId=selected.id;$('sync-sizes').checked=ui.syncSizes!==false;refreshEditSnapshot();switchAnimation?.cancel();excludedExportSizes.clear();
 for(const id of ui.excludedExportSizes||[])if(project.variants.some(v=>v.id===id))excludedExportSizes.add(id);
 $('preview-mode').value=ui.previewMode==='actual'?'actual':'fit';rebuild();refreshCopy();$('image-name').textContent='导入图片';dirty=false;document.title='图片批处理工作台';refreshList();syncProperties();syncBackgrounds();draw();if(selectedLayer&&elementType(current(),selectedLayer))editor?.select(selectedLayer);else if(!elementType(current(),editor?.getSelection()))editor?.select(null);saveView();
 if(!booting){try{await previews.ready();canvasPreviewError=null;$('stage').dataset.canvasState='ready';$('canvas-loading').hidden=true;$('canvas-world').inert=false;}catch(error){canvasPreviewError=error.message;$('stage').dataset.canvasState='error';$('canvas-loading').hidden=false;$('canvas-loading-label').textContent='画布加载失败';$('canvas-loading-detail').textContent='批次已保留，请刷新重试';$('canvas-loading-retry').hidden=false;$('canvas-world').inert=true;notice(`画布预览加载失败：${error.message}`,true);}}
}
function rebuild(){plan=buildAssignments(project);}
function displayWarnings(items){$('warnings').replaceChildren(...(items.length?items:['当前版面未检测到越界。仍请以实际尺寸检查主体与文字。']).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));$('warnings').classList.toggle('clear',!items.length);$('warnings-summary').textContent=`版面检查 · ${items.length?items.length+' 项':'无异常'}`;}
function updateExportCount(){
 const selected=exportProject(),exportPlan=buildAssignments(selected);
 const missing=exportPlan.unmatched.length?`；未匹配：${exportPlan.unmatched.join('、')}。请补齐背景或切换应用方式`:'';
 $('export-count').textContent=`${selected.variants.length} 个已选尺寸 · ${exportPlan.count} 张成品${missing}`;$('export-count').classList.toggle('export-summary-error',!!exportPlan.unmatched.length);
}
function draw(paint=true){
 for(const id of ['draft-new','cache-reload'])$(id).disabled=busy||booting;
 $('undo').disabled=busy||!drafts.canUndo;$('redo').disabled=busy||!drafts.canRedo;previews.update(paint);$('sync-sizes').disabled=busy;
 const own=variantAssets(project,current(),assets),v=current();
 const groupTargets=groupSyncTargets(project,v);
 $('sync-group').disabled=busy||!groupTargets.length;
 $('sync-group').title=busy?'请等待当前操作完成':v?.locked?'当前尺寸已单独锁定，解锁后可同步':!groupTargets.length?'同组没有可同步的未锁定尺寸':'以当前尺寸覆盖同组未锁定尺寸的排版、样式、图片和文案；保留背景匹配与焦点';
 $('sync-group-source').textContent=v?`以 ${v.width} × ${v.height} 为源 → ${groupName(v)}组 · ${groupTargets.length} 个可同步`:'';
 $('legacy-custom-lock').hidden=!(project.lockedGroups||[]).includes('自定义');
 document.querySelectorAll('[data-lock-size]').forEach(button=>{const v=project.variants.find(v=>v.id===button.dataset.lockSize);if(v)updateLockIcon(button,!!v.locked,`${v.width} × ${v.height} 尺寸`);});
 document.querySelectorAll('[data-lock-group]').forEach(button=>updateLockIcon(button,(project.lockedGroups||[]).includes(button.dataset.lockGroup),`${button.dataset.lockGroup}编组`));
 document.querySelectorAll('[data-lock]').forEach(b=>b.disabled=busy);$('preview').hidden=!v;$('preview-surface').hidden=!v;$('empty-state').hidden=!!v;$('stage').classList.toggle('loading',switching);
 $('export-png').disabled=busy||!v;$('export-all').disabled=busy||!exportProject().variants.length||!!buildAssignments(exportProject()).unmatched.length;
 const selectedImage=imageSources(project,v,editor?.getSelection()),imageOriginal=selectedImage?.original,imageCutout=selectedImage?.cutout,usingCutout=selectedImage?.usingCutout;
 $('cutout').disabled=busy||!imageOriginal||!modelReady;$('use-cutout').disabled=busy||!imageCutout;$('use-original').disabled=busy||!imageOriginal;$('remove-logo').disabled=busy||!own.logo;
 $('keep-text').disabled=busy||!imageOriginal||!modelReady;$('split-text').disabled=$('keep-text').disabled||!$('keep-text').checked||!!elementFor(v,editor?.getSelection())?.cutoutParent;
 $('use-original').classList.toggle('active',!usingCutout);$('use-cutout').classList.toggle('active',usingCutout);
 if(paint&&v&&!switching){const result=drawPreview($('preview'),project,v,assets,$('stage'),'world');displayWarnings(result.warnings);editor?.update(result.regions);$('preview-scale').textContent=`显示 ${Math.round(result.zoom*Number($('stage').dataset.zoom||1)*100)}% · 导出 ${v.width} × ${v.height} px${result.limited?' · 预览像素已限额':''}`;}
 if(!paint)editor?.refresh();
 if(!v){$('preview-scale').textContent='请选择尺寸';editor?.update({});}
 $('export-png').title=v?'':'请选择尺寸后导出';$('export-all').title=exportProject().variants.length?'':'请选择导出尺寸';
 $('layer-scale').disabled=busy||!v||!editor?.getSelection();
 basicControls.forEach(id=>$(id).disabled=busy||!v);effectControls.forEach(id=>$(id).disabled=busy||!v||!isTextLayer(v,editor?.getSelection()));
 for(const id of ['title','subtitle','cta','image-input','empty-input','logo-input','project-input','reset-layout','background-files','background-mode','all-sizes'])$(id).disabled=busy;
 document.querySelectorAll('#export-sizes input,#export-select-all,#export-none').forEach(control=>control.disabled=busy);
 $('variant-select').disabled=busy&&!switching;updateExportCount();inspector?.update();$('save-indicator').textContent=$('draft-status').textContent||'自动保存';
}
function syncProperties(){
 const v=current();if(!v)return;
 for(const [id,key]of [['bg-zoom','bgZoom'],['bg-x','bgX'],['bg-y','bgY'],['feather','feather'],['scale','scale'],['dx','dx'],['dy','dy'],['accent','accent'],['background','background'],['color','color'],['color2','color2'],['logo-x','logoX'],['logo-y','logoY'],['logo-width','logoWidth']])$(id).value=v[key];
 const selected=editor?.getSelection(),style=resolvedTextStyle(v,isTextLayer(v,selected)?selected:'title');
 for(const [id,key]of Object.entries(effectFields)){if(['shadow-enabled','font-italic','separator-enabled'].includes(id))$(id).checked=style[key];else $(id).value=style[key];}
 const added=elementFor(v,selected),transform=isTextLayer(v,selected)?style:added||v,prefix=isTextLayer(v,selected)||added?'scale':selected==='logo'?'logoScale':'imageScale';
 if(added?.type==='button')$('accent').value=added.accent;
 $('layer-scale').value=Number(transform[prefix+'X'].toFixed(6));$('layer-scale-summary').textContent=`当前横向 ${Number(transform[prefix+'X'].toFixed(6))} × · 纵向 ${Number(transform[prefix+'Y'].toFixed(6))} ×`;$('scale-percent').value=Number((v.scale*100).toFixed(2));
 $('text-w').value=style.width;$('feather-value').textContent=`${Math.round(v.feather*100)}%`;$('crop').checked=v.crop;$('scale-value').textContent=`${Math.round(v.scale*100)}%`;
}
function refreshList(){
 for(const id of excludedExportSizes)if(!project.variants.some(v=>v.id===id))excludedExportSizes.delete(id);
 $('export-sizes').replaceChildren(...project.variants.map(v=>{const label=document.createElement('label');label.className='check-label';const input=document.createElement('input');input.type='checkbox';input.value=v.id;input.checked=!excludedExportSizes.has(v.id);input.onchange=()=>{if(input.checked)excludedExportSizes.delete(v.id);else excludedExportSizes.add(v.id);changed();draw();};label.append(input,`${v.width} × ${v.height}`);return label;}));
 $('variant-select').replaceChildren(...project.variants.map(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=`${v.width} × ${v.height}`;return option;}));$('variant-select').value=currentId;$('size-count').textContent=`${project.variants.length} 个`;
 $('variant-list').replaceChildren(...project.variants.map(v=>{const row=document.createElement('div');row.className=`variant-row ${v.id===currentId?'selected':''}`;const select=document.createElement('button');select.className='size-choice';select.textContent=`${v.width} × ${v.height}`;select.onclick=()=>setVariant(v.id);const remove=document.createElement('button');remove.textContent='×';remove.className='remove-size';remove.setAttribute('aria-label',`移除 ${v.width} × ${v.height}`);remove.disabled=project.variants.length<=1;remove.onclick=()=>{if(busy)return;editor?.cancel();project.variants=project.variants.filter(a=>a.id!==v.id);if(currentId===v.id)currentId=project.variants[0].id;pruneMedia(project);rebuild();changed();setVariant(currentId);};if(editDomainName(project,v)==='自定义')select.title='旧自定义隔离仍生效，解锁后按当前形状编组同步';const lock=createSizeLock(v.id);row.append(select,lock,remove);return row;}));
 document.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(project.variants.some(v=>v.id===b.dataset.size))));updateExportCount();
}
function syncBackgrounds(){
 const content=effective(),selected=activeBackground(project,current(),plan),ids=plan.byVariant[currentId]||[],available=content.backgroundMode==='matched'?content.backgrounds.filter(b=>ids.includes(b.id)):content.backgrounds;
 $('background-mode').value=content.backgroundMode;$('background-options-title').textContent=`当前可用 · ${available.length} 张${selected?' · 已选 '+selected.name:''}`;
 $('background-list').replaceChildren(...available.map(b=>{const button=document.createElement('button');button.type='button';button.className='background-choice';button.dataset.background=b.id;button.textContent=`${b.name} · ${b.width} × ${b.height}`;button.title=button.textContent;button.setAttribute('aria-pressed',String(b.id===selected?.id));button.onclick=()=>selectBackground(b.id);return button;}));
 $('background-clear').hidden=content.backgroundMode==='matched';$('background-clear').textContent=content.backgroundMode==='all'?'不预览图片背景':'不使用图片背景';$('background-clear').setAttribute('aria-pressed',String(!selected));
 $('background-empty').hidden=available.length>0;$('background-empty').textContent=content.backgrounds.length?'没有匹配当前尺寸的背景。请导入匹配图片，或修改上方应用方式。':'尚未导入背景。可使用下方画布底色，或导入图片背景。';
 $('background-management-summary').textContent=`管理全部背景 · ${content.backgrounds.length} 张`;
 $('background-management-list').replaceChildren(...content.backgrounds.map(b=>{const row=document.createElement('div');row.className='background-row';const name=document.createElement('span');name.textContent=`${b.name} · ${b.width} × ${b.height}${content.backgroundMode==='matched'&&!ids.includes(b.id)?' · 不匹配当前尺寸':''}`;name.title=name.textContent;const remove=document.createElement('button');remove.type='button';remove.textContent='移除';remove.setAttribute('aria-label',`移除背景 ${b.name}`);remove.onclick=()=>removeBackground(b.id);row.append(name,remove);return row;}));updateExportCount();
}
async function setVariant(id,selectBoard=true){
 if((busy&&!switching)||!project.variants.some(v=>v.id===id))return;
 const version=++loadVersion,targetVariant=project.variants.find(v=>v.id===id);switching=true;busy=true;editor?.cancel();rebuild();draw();
 const target=activeBackground(project,targetVariant,plan);
 try{const image=target?(target.id===assets.backgroundId?assets.background:await loadImage(target.data)):null;if(version!==loadVersion)return;const switched=currentId!==id;currentId=id;if(selectBoard)previews.selectBoard(id);saveView();assets.background=image;assets.backgroundId=target?.id||null;refreshEditSnapshot();switchAnimation?.cancel();if(switched&&!matchMedia('(prefers-reduced-motion: reduce)').matches)switchAnimation=$('preview-surface').animate([{opacity:.5},{opacity:1}],{duration:180,easing:'ease-out'});}
 catch(e){if(version===loadVersion)notice(`背景读取失败：${e.message}；保留原尺寸与背景，请重试。`,true);}
 finally{if(version===loadVersion){switching=false;busy=false;refreshList();refreshCopy();syncProperties();syncBackgrounds();draw();}}
}
function addSize(w,h){if(busy)return;try{const v=addVariant(project,w,h);changed();setVariant(v.id);}catch(e){notice(e.message,true);}}
function updateLockIcon(button,locked,label){
 button.classList.add('lock-icon');button.setAttribute('aria-pressed',String(locked));
 const hint=`${locked?'解锁':'锁定'}${label} · ${locked?'已隔离其他尺寸修改':'接收同步修改'}`;button.title=hint;button.setAttribute('aria-label',hint);
 button.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="${locked?'M8 10V6a4 4 0 0 1 8 0v4':'M16 10V6a4 4 0 0 0-8 0'}"/><path d="M12 14v3"/></svg>`;
}
function createSizeLock(id){
 const lock=document.createElement('button');lock.type='button';lock.className='size-lock';lock.dataset.lock=id;lock.dataset.lockSize=id;
 lock.onclick=()=>{const v=project.variants.find(v=>v.id===id);if(busy||!v)return;editor?.cancel();setSizeLock(project,v,!v.locked);refreshEditSnapshot();refreshList();changed();draw();};
 const v=project.variants.find(v=>v.id===id);updateLockIcon(lock,!!v?.locked,`${v?.width} × ${v?.height} 尺寸`);return lock;
}
function createGroupLock(name){
 const lock=document.createElement('button');lock.type='button';lock.dataset.lock='group';lock.dataset.lockGroup=name;updateLockIcon(lock,false,`${name}编组`);
 lock.onclick=()=>{if(busy)return;editor?.cancel();setGroupLock(project,name,!(project.lockedGroups||[]).includes(name));refreshEditSnapshot();refreshList();changed();draw();};return lock;
}
for(const group of PRESET_GROUPS){const section=document.createElement('div');section.className='preset-group';const heading=document.createElement('h3');heading.textContent=group.name;const lock=createGroupLock(group.name);heading.append(lock);const list=document.createElement('div');list.className='presets';for(const [w,h]of group.sizes){const b=document.createElement('button');b.dataset.size=`${w}x${h}`;b.textContent=`${w} × ${h}`;b.setAttribute('aria-pressed','false');b.onclick=()=>{const id=b.dataset.size;if(project.variants.some(v=>v.id===id))setVariant(id);else addSize(w,h);};list.append(b);}section.append(heading,list);$('presets').append(section);}
const legacyCustom=document.createElement('div');legacyCustom.id='legacy-custom-lock';legacyCustom.hidden=true;const legacyHelp=document.createElement('p');legacyHelp.className='help';legacyHelp.textContent='旧自定义隔离仍生效：非预设尺寸（包括新增尺寸）暂沿用旧隔离规则，解锁后按当前形状编组同步。';const legacyUnlock=document.createElement('button');legacyUnlock.dataset.lock='legacy';legacyUnlock.textContent='解除旧自定义隔离';legacyUnlock.onclick=()=>{if(busy)return;editor?.cancel();setGroupLock(project,'自定义',false);refreshEditSnapshot();refreshList();changed();draw();};legacyCustom.append(legacyHelp,legacyUnlock);$('presets').append(legacyCustom);
$('all-sizes').onclick=()=>{if(busy)return;try{addAllPresets(project);changed();setVariant(currentId);notice('已加入全部38个预设，保留已有自定义尺寸。');}catch(e){notice(e.message,true);}};
$('add-size').onclick=()=>addSize(Number($('custom-w').value),Number($('custom-h').value));$('preview-mode').onchange=()=>{saveView();if($('preview-mode').value==='actual')previews.actual();else previews.focusCurrent();draw();};window.addEventListener('resize',draw);$('stage').addEventListener('canvas-zoomed',()=>{if(!busy&&current()){const result=drawPreview($('preview'),project,current(),assets,$('stage'),'world');editor?.update(result.regions);$('preview-scale').textContent=`显示 ${Math.round(result.zoom*Number($('stage').dataset.zoom||1)*100)}% · 导出 ${current().width} × ${current().height} px`;}});$('stage').addEventListener('canvas-pan-start',()=>editor?.cancel());$('stage').addEventListener('canvas-blank-pointerdown',()=>{if(!busy)editor?.select(null);});$('variant-select').onchange=()=>setVariant($('variant-select').value);
for(const key of textIds)$(key).oninput=()=>{if(busy)return;sharedPatch(project,{[key]:$(key).value});changed();draw();};
for(const id of basicControls)$(id).addEventListener(['background','crop'].includes(id)?'change':'input',()=>{
 if(busy)return;const v=current(),number=Number($(id).value);if(!v)return;
 const numeric={'bg-zoom':['bgZoom',1,5],'bg-x':['bgX',0,1],'bg-y':['bgY',0,1],feather:['feather',0,.5],scale:['scale',.1,5],dx:['dx',-12000,12000],dy:['dy',-12000,12000],'logo-x':['logoX',-6000,12000],'logo-y':['logoY',-6000,12000],'logo-width':['logoWidth',1,6000]};
 if(id==='accent'&&elementFor(v,editor?.getSelection())?.type==='button'){elementFor(v,editor.getSelection()).accent=$(id).value;}
 else if(numeric[id]){const [key,min,max]=numeric[id];if(Number.isFinite(number))v[key]=Math.max(min,Math.min(max,number));}
 else if(id==='text-w'){if(Number.isFinite(number))v.text.w=Math.max(1,Math.min(12000,number));}
 else if(id==='crop')v.crop=$('crop').checked;else v[id]=$(id).value;
 commitVariantEdit(undefined,['dx','dy','scale'].includes(id)?{layerId:'image',imageResize:id==='scale'}:{});
});
for(const id of effectControls)$(id).addEventListener(['shadow-enabled','font-italic','separator-enabled'].includes(id)?'change':'input',()=>{
 const selected=editor.getSelection();if(busy||!isTextLayer(current(),selected))return;const added=elementFor(current(),selected),layer=added?.style||current().textLayers[selected],key=effectFields[id];
 const limits={height:[1,12000],width:[1,12000],fontWeight:[100,900],separatorWidth:[.1,30],separatorHeight:[.1,1.5],dx:[-12000,12000],dy:[-12000,12000],fontSize:[4,1000],strokeWidth:[0,30],shadowOpacity:[0,1],shadowBlur:[0,100],shadowX:[-1000,1000],shadowY:[-1000,1000]};
 const before=structuredClone(current());
 if(added&&['dx','dy'].includes(key)){if(Number.isFinite(Number($(id).value)))added[key==='dx'?'x':'y']=clampPosition(Number($(id).value));}
 else if(key==='height'&&$(id).value==='')layer.height=null;else if(['shadowEnabled','italic','separatorEnabled'].includes(key))layer[key]=$(id).checked;else if(limits[key]){const n=Number($(id).value);if(Number.isFinite(n))layer[key]=Math.max(limits[key][0],Math.min(limits[key][1],n));}else layer[key]=$(id).value;if(['width','height'].includes(key)&&!preserveTextPositions(current(),before,selected,resizeAssets().layout))current().textLayers=before.textLayers;commitVariantEdit(undefined,{layerId:selected,frameEdit:['width','height'].includes(key)});
});
$('layer-scale').oninput=()=>{
 const selected=editor.getSelection(),n=Number($('layer-scale').value);if(busy||!selected||!Number.isFinite(n)||n<.01||n>100)return;
 const v=current(),before=structuredClone(v),frame=resizeFrames([v],selected)[v.id];if(!frame)return;
 const added=elementFor(v,selected),target=added?(added.style||added):TEXT_IDS.includes(selected)?v.textLayers[selected]:v,key=added||TEXT_IDS.includes(selected)?'scaleX':(selected==='logo'?'logo':'image')+'ScaleX',factor=n/target[key];
 const next=resizeLayer(v,selected,before,frame,'se',frame.w*(factor-1),frame.h*(factor-1),resizeAssets());commitVariantEdit(before,{resize:'se',layerId:selected,startFrame:frame,frame:next});
};
$('layer-scale').onblur=()=>syncProperties();
$('scale-percent').onblur=()=>syncProperties();
$('scale-percent').oninput=()=>{const n=Number($('scale-percent').value);if(busy||!Number.isFinite(n)||n<10||n>500)return;$('scale').value=n/100;$('scale').dispatchEvent(new Event('input',{bubbles:true}));};
$('text-height-mode').onchange=()=>{
 const id=editor?.getSelection();if(busy||!isTextLayer(current(),id))return;
 const style=resolvedTextStyle(current(),id),frame=resizeFrames([current()],id)[currentId];if(!frame){syncProperties();draw();return;}
 $('text-h').value=$('text-height-mode').value==='auto'?'':Math.max(1,Math.min(12000,frame.h/style.scaleY));$('text-h').dispatchEvent(new Event('input',{bubbles:true}));
};
for(const [id,axis]of [['center-horizontal','x'],['center-vertical','y']])$(id).onclick=()=>{
 if(busy||!editor?.getSelection())return;editor.cancel();
 try{const selected=editor.getSelection(),next=structuredClone(project),targets=centerSelection(next,currentId,selected,axis,$('sync-sizes').checked,v=>isTextLayer(v,selected)?layoutText(measurement,next,v).find(l=>l.id===selected)?.frameRect:resizeAssets(v)[selected]?mediaRect(v,selected,resizeAssets(v)[selected]):null);const checked=validateProject(next);drafts.end();project=checked;refreshEditSnapshot();changed();syncProperties();draw();notice(`已将 ${targets.length} 个尺寸分别${axis==='x'?'水平':'垂直'}居中，可一步撤销。`);}
 catch(error){notice(error.message,true);}
};
$('reset-background-framing').onclick=()=>{if(busy)return;editor?.cancel();drafts.end();Object.assign(current(),{bgZoom:1,bgX:.5,bgY:.5});refreshEditSnapshot();changed();syncProperties();draw();};
$('reset-layout').onclick=()=>{if(busy)return;const v=current(),{backgroundPreference,locked,content,elements}=v;Object.assign(v,defaultVariant(v.width,v.height),{backgroundPreference,locked,content,elements});refreshEditSnapshot();changed();syncProperties();draw();};
let replacingElement=null;
function addObject(type){
 if(busy||!current())return;
 if(type==='image'){replacingElement=null;$('element-image-input').click();return;}
 try{editor?.cancel();drafts.end();const id=addElement(project,currentId,type,{},$('sync-sizes').checked);refreshEditSnapshot();changed();editor.select(id);draw();}catch(error){notice(error.message,true);}
}
$('delete-element').onclick=()=>{
 const id=editor?.getSelection(),selected=elementFor(current(),id);if(busy||!selected)return;
 try{editor.cancel();drafts.end();const targets=removeElement(project,currentId,id,$('sync-sizes').checked);refreshEditSnapshot();changed();editor.select(null);document.querySelector(`[data-element-type="${selected.type}"]`).focus({preventScroll:true});notice(`已删除 ${targets.length} 个尺寸中的${{text:'文字',image:'图片',button:'按钮'}[selected.type]}，可撤销。`);}
 catch(error){notice(error.message,true);}
};
$('element-copy').oninput=()=>{if(busy)return;try{editElement(project,currentId,editor.getSelection(),{text:$('element-copy').value},$('sync-sizes').checked);changed();draw();}catch(error){notice(error.message,true);}};
$('replace-element-image').onclick=()=>{if(busy)return;replacingElement=editor.getSelection();$('element-image-input').click();};
$('element-image-input').onchange=e=>{const file=e.target.files[0],replaceId=replacingElement;e.target.value='';replacingElement=null;importElementImage(file,replaceId);};
async function importElementImage(file,replaceId=null){
 if(!file||busy)return;
 if(replaceId==='image'||replaceId==='logo')return importImage(file,replaceId==='logo');
 if(!['image/png','image/jpeg'].includes(file.type)||file.size<=0||file.size>32*1024*1024){notice('请使用32 MB以内的PNG/JPEG图片',true);return;}
 busy=true;draw();
 try{
  const data=await readData(file),image=await loadImage(data),candidate=structuredClone(project);let id=replaceId;
  if(id){const media=internElementMedia(candidate,data);editElement(candidate,currentId,id,{media},$('sync-sizes').checked);pruneMedia(candidate);validateProject(candidate);}
  else id=addElement(candidate,currentId,'image',{data,width:image.width,height:image.height},$('sync-sizes').checked);
  const decoded=await loadAssets(candidate);editor?.cancel();drafts.end();project=candidate;Object.assign(assets,decoded);refreshEditSnapshot();changed();editor.select(id);$('image-name').textContent=file.name;notice(replaceId?'图片已替换，布局已保留。':'已导入图片，可独立编辑。');
 }catch(error){notice(`导入失败：${error.message}`,true);}finally{busy=false;syncProperties();draw();}
}
for(const key of ['x','y','width','height'])$('element-'+key).oninput=()=>{
 const e=elementFor(current(),editor?.getSelection()),n=Number($('element-'+key).value);if(busy||e?.type!=='image'||!Number.isFinite(n))return;
 e[key]=Math.max(['width','height'].includes(key)?1:-12000,Math.min(12000,n));commitVariantEdit(undefined,{layerId:e.id});
};
function readData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(file);});}
async function importImage(file,logo=false){
 if(!file||busy)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>32*1024*1024){notice('请使用32 MB以内的PNG/JPEG图片',true);return;}
 busy=true;draw();notice('正在读取本地图片…');
 try{const data=await readData(file),image=await loadImage(data),candidate=structuredClone(project);sharedPatch(candidate,logo?{logo:data,logoOriginal:data,logoCutout:null}:{original:data,cutout:null,source:'original'});validateProject(candidate);
  if(logo){sharedPatch(project,{logo:data,logoOriginal:data,logoCutout:null});notice('图片已导入，可直接点选拖动');}else{if(project.name==='未命名广告')project.name=file.name.replace(/\.[^.]+$/,'').slice(0,100).replace(/[\uD800-\uDBFF]$/, '');sharedPatch(project,{original:data,cutout:null,source:'original'});$('image-name').textContent=file.name;notice('已导入原图，应用于当前同步范围，各尺寸布局已保留。');}await refreshAssets();editor?.select(logo?'logo':'image');changed();
 }catch(e){notice(`导入失败：${e.message}`,true);}finally{busy=false;draw();}
}
for(const id of ['image-input','empty-input'])$(id).onchange=e=>{importElementImage(e.target.files[0]);e.target.value='';};$('logo-input').onchange=e=>{importImage(e.target.files[0],true);e.target.value='';};
window.addEventListener('paste',e=>{const target=e.target;if(e.defaultPrevented||busy||booting||document.querySelector('dialog[open]')||target.isContentEditable||target.closest?.('input,textarea,select,[role=textbox]'))return;const files=Array.from(e.clipboardData?.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;e.preventDefault();if(files.length!==1){notice('一次请粘贴一张图片。',true);return;}const id=editor?.getSelection();if(elementType(current(),id)==='image'){if(elementFor(current(),id))importElementImage(files[0],id);else importImage(files[0],id==='logo');}else importElementImage(files[0]);});
$('remove-logo').onclick=async()=>{if(busy)return;sharedPatch(project,{logo:null,logoOriginal:null,logoCutout:null});await refreshAssets();changed();draw();};
async function commitImageSource(sourceId,id,sources,sync,textResult=null){
 const candidate=structuredClone(project);if(textResult)applyTextCutout(candidate,sourceId,id,textResult,sync);else applyImageSource(candidate,sourceId,id,sources,sync);validateProject(candidate);
 const decoded=await loadAssets(candidate);editor?.cancel();drafts.end();project=candidate;Object.assign(assets,decoded);refreshEditSnapshot();changed();editor.select(id);
}
async function useImageSource(cutout){
 if(busy)return;const sourceId=currentId,id=editor?.getSelection(),sources=imageSources(project,current(),id),sync=$('sync-sizes').checked;
 if(!sources||!(cutout?sources.cutout:sources.original))return;busy=true;draw();
 try{await commitImageSource(sourceId,id,{...sources,usingCutout:cutout},sync);notice(cutout?'已使用抠图结果，请检查图片边缘。':'已切回原图，包含原背景。');}
 catch(e){notice(e.message,true);}finally{busy=false;draw();}
}
$('use-original').onclick=()=>useImageSource(false);$('use-cutout').onclick=()=>useImageSource(true);
$('keep-text').onchange=()=>{if(!$('keep-text').checked)$('split-text').checked=false;draw(false);};
$('cutout').onclick=async()=>{
 const sourceId=currentId,id=editor?.getSelection(),sources=imageSources(project,current(),id),original=sources?.original,sync=$('sync-sizes').checked,before=project;
 const mode=$('keep-text').checked?$('split-text').checked&&!elementFor(current(),id)?.cutoutParent?'split':'keep':'plain';
 if(busy||!original||!modelReady)return;busy=true;draw();notice('正在本机高清抠图，请稍等…');$('cutout').textContent='正在抠图…';
 try{const raw=original.split(','),bytes=Uint8Array.from(atob(raw[1]),c=>c.charCodeAt(0)),input=new Blob([bytes],{type:raw[0].includes('jpeg')?'image/jpeg':'image/png'});const response=await fetch('/api/cutout'+(mode==='plain'?'':`?mode=${mode}`),{method:'POST',headers:{'Content-Type':input.type},body:input});if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.detail||`服务错误 ${response.status}`);}const blob=await response.blob(),limit=mode==='split'?Math.ceil(MAX_IMAGE_BYTES/3)*8+1024:MAX_IMAGE_BYTES;if(blob.size>limit)throw Error(mode==='split'?'文字分层响应过大，原图已保留，请缩小图片后重试':'抠图结果超过32 MB，原图已保留，请缩小图片后重试');const result=mode==='split'?JSON.parse(await blob.text()):null;if(mode==='split')validateTextCutoutResult(result);const data=result?.subject??await readData(blob);if(result){const image=await loadImage(data),textImage=await loadImage(result.text);if(image.width!==result.width||image.height!==result.height||textImage.width!==result.bounds?.[2]-result.bounds?.[0]||textImage.height!==result.bounds?.[3]-result.bounds?.[1])throw Error('文字分层结果尺寸不匹配');}if(project!==before||currentId!==sourceId)throw Error('当前批次或尺寸已改变，未应用抠图结果');await commitImageSource(sourceId,id,{original,cutout:data,usingCutout:true,reprocess:true},sync,result);notice(mode==='split'?'抠图完成，已生成可单独移动的文字图片层。':'抠图完成，请切换原图对照图片边缘。');}
 catch(e){notice(e.message,true);}finally{busy=false;$('cutout').textContent='高清本地抠图';draw();}
};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('save-project').onclick=()=>{if(busy)return;try{validateProject(project);download(new Blob([JSON.stringify(project)],{type:'application/json'}),'广告项目.adproject.json');drafts.backedUp();notice('项目文件已生成，包含所有素材、文字效果与尺寸布局。');}catch(e){notice(e.message,true);}};
$('project-input').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file||busy)return;if(file.size>120*1024*1024){notice('项目文件超过120 MB',true);return;}busy=true;draw();
 try{const next=validateProject(JSON.parse(await file.text()));await drafts.flush();drafts.end();await installProject(next,{},true);changed();await drafts.flush();notice('项目已打开并更新当前缓存，可撤销。');}
 catch(e){notice(`打开项目失败：${e.message}；已有草稿已保留。`,true);}finally{busy=false;draw();}
};
$('export-png').onclick=async()=>{if(busy)return;busy=true;draw();notice('正在本机压缩PNG…');try{validateProject(project);const canvas=document.createElement('canvas'),result=render(canvas,project,current(),assets);download(await compressedPng(canvas),`${current().width}x${current().height}.png`);notice(result.warnings.length?`已导出；请注意：${result.warnings.join('；')}`:'已导出当前PNG');}catch(e){notice(e.message,true);}finally{busy=false;draw();}};
$('export-select-all').onclick=()=>{excludedExportSizes.clear();changed();refreshList();draw();};
$('export-none').onclick=()=>{project.variants.forEach(v=>excludedExportSizes.add(v.id));changed();refreshList();draw();};
$('cancel-export').onclick=()=>exportAbort?.abort();
$('export-all').onclick=async()=>{
 if(busy)return;busy=true;exportAbort=new AbortController();draw();$('cancel-export').hidden=false;$('export-download').hidden=true;$('export-all').textContent='正在合成…';
 try{validateProject(project);const result=await exportArchive(exportProject(),assets,notice,{signal:exportAbort.signal});const link=$('export-download');link.href=result.downloadUrl;link.hidden=false;link.click();notice(`已生成 ${result.count} 张广告，已开始下载${result.warningCount?`；${result.warningCount} 项版面提示，请检查各尺寸预览`:''}。导出包保留20分钟用于重新下载。`);}
 catch(e){notice(exportAbort.signal.aborted?'已取消导出，当前项目保持不变。':e.message,!exportAbort.signal.aborted);}finally{exportAbort=null;busy=false;$('cancel-export').hidden=true;$('export-all').textContent='批量导出 ZIP';draw();}
};
async function selectBackground(id){
 if(busy)return;if(effective().backgroundMode==='matched'&&!(plan.byVariant[currentId]||[]).includes(id)){notice('该背景不匹配当前尺寸。请选择对应尺寸，或主动切换背景应用方式。',true);syncBackgrounds();return;}
 await changeBackground(next=>{if(next.backgroundMode==='matched')next.variants.find(v=>v.id===currentId).backgroundPreference=id;next.activeBackgroundId=id;});
}
async function removeBackground(id){
 await changeBackground(next=>{next.backgrounds=next.backgrounds.filter(b=>b.id!==id);for(const v of next.variants)if(v.backgroundPreference===id)v.backgroundPreference=null;if(next.activeBackgroundId===id)next.activeBackgroundId=next.backgrounds[0]?.id||null;});
}
$('background-clear').onclick=()=>selectBackground(null);
function applySharedProject(next,working){
 const old=effective(),read=(p,k)=>MEDIA_KEYS.includes(k)?p.assets[k]:textIds.includes(k)?p.copy[k]:p[k],patch={};
 for(const key of SHARED_KEYS)if(JSON.stringify(read(old,key))!==JSON.stringify(read(working,key)))patch[key]=read(working,key);
 sharedPatch(next,patch);
 for(const v of next.variants)if(v.id===currentId||($('sync-sizes').checked&&sameEditDomain(next,current(),v))){const preference=working.variants.find(w=>w.id===v.id)?.backgroundPreference;v.backgroundPreference=contentFor(next,v).backgrounds.some(b=>b.id===preference)?preference:null;}
}
async function changeBackground(update){
 if(busy)return;busy=true;editor?.cancel();draw();
 try{const next=structuredClone(project),working=structuredClone(effective());working.variants.forEach(v=>delete v.content);update(working);applySharedProject(next,working);const target=activeBackground(next,next.variants.find(v=>v.id===currentId)),image=target?(target.id===assets.backgroundId?assets.background:await loadImage(target.data)):null;project=next;assets.background=image;assets.backgroundId=target?.id||null;rebuild();changed();}
 catch(e){notice(`背景读取失败：${e.message}；保留原背景与应用方式，请重试。`,true);}
 finally{busy=false;syncBackgrounds();draw();}
}
$('background-mode').onchange=()=>changeBackground(next=>{next.backgroundMode=$('background-mode').value;next.exportAllBackgrounds=next.backgroundMode==='all';});
$('background-files').onchange=async e=>{
 const files=Array.from(e.target.files);e.target.value='';if(!files.length||busy)return;busy=true;draw();
 try{validateBackgroundBatch(project,files);const incoming=[];
  for(let i=0;i<files.length;i++){notice(`正在读取背景 ${i+1} / ${files.length}…`);const file=files[i],data=await readData(file),image=await loadImage(data);incoming.push({id:`bg-${randomUUID()}`,name:file.name.slice(0,150),data,width:image.naturalWidth,height:image.naturalHeight});}
  const next=structuredClone(project),working=structuredClone(effective());working.variants.forEach(v=>delete v.content);working.backgrounds.push(...incoming);working.backgroundMode='matched';working.exportAllBackgrounds=false;const nextPlan=applyImportedBackgrounds(working,incoming),v=working.variants.find(v=>v.id===currentId);delete v.content;const target=activeBackground(working,v,nextPlan),image=target?await loadImage(target.data):null;working.activeBackgroundId=target?.id||null;applySharedProject(next,working);validateProject(next);project=next;assets.background=image;assets.backgroundId=target?.id||null;rebuild();changed();syncBackgrounds();notice(`已导入 ${incoming.length} 张背景，已按全部尺寸自动匹配${plan.unmatched.length?`；${plan.unmatched.length} 个尺寸未匹配，请查看背景区`:''}。`);
 }catch(e){notice(`${e.message}；原背景与项目已保留。`,true);}finally{busy=false;draw();}
};
editor=createCanvasEditor($('preview'),$('selection-box'),{getVariant:current,getAssets:resizeAssets,isBusy:()=>busy,onChange:(start,edit)=>commitVariantEdit(start,edit),onEnd:()=>drafts.end(),onSelect:id=>{previews.selectBoard(id?currentId:null);syncProperties();draw();saveView();}});
window.addEventListener('beforeunload',e=>{if(dirty||drafts.pending){e.preventDefault();e.returnValue='';}});window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!booting)$('save-project').click();}});new ResizeObserver(()=>{if(current())draw();}).observe($('stage'));
inspector=createInspector({getState:()=>({project,current:current(),selected:editor?.getSelection(),busy,sync:$('sync-sizes').checked,style:resolvedTextStyle(current(),isTextLayer(current(),editor?.getSelection())?editor.getSelection():'title'),content:effective(),background:activeBackground(project,current(),plan)}),selectLayer:id=>editor.select(id),addElement:addObject,replaceImage:()=>{if(busy)return;replacingElement='image';$('element-image-input').click();}});
refreshList();syncProperties();syncBackgrounds();draw();
const {restore:restoreDrafts,requestTravel}=setupDraftUI({drafts,viewError:()=>$('stage').dataset.canvasState==='error'?(canvasPreviewError||'画布未就绪'):null,endEdit:()=>editor?.cancel(),isBusy:()=>busy,setBusy:value=>{busy=value||booting;draw(false);$('draft-new').disabled=busy;$('cache-reload').disabled=busy;$('batch-select').disabled=busy;},install:installProject,blank:blankProject,changed,notice,draftStatus:(text,error)=>notifications.draft(text,error)});
$('canvas-loading-retry').onclick=()=>location.reload();
const restored=await restoreDrafts();
try{
 if(!restored)throw Error('批次或素材恢复失败');
 busy=false;
 const view=restoredView;if(view){$('sync-sizes').checked=view.syncSizes!==false;$('preview-mode').value=view.previewMode==='actual'?'actual':'fit';if(project.variants.some(v=>v.id===view.currentId))await setVariant(view.currentId,false);if(elementType(current(),view.selectedLayer))editor.select(view.selectedLayer);saveView();}
 busy=false;draw();await previews.ready();
 $('canvas-loading').hidden=true;$('stage').dataset.canvasState='ready';
}catch(error){
 $('stage').dataset.canvasState='error';$('canvas-loading-label').textContent='画布加载失败';$('canvas-loading-detail').textContent='请检查错误提示，然后刷新重试';$('canvas-loading-retry').hidden=false;
 if(restored)notice(`画布预览加载失败：${error.message}`,true);
}finally{
 booting=false;busy=false;$('stage').setAttribute('aria-busy','false');for(const id of ['draft-new','cache-reload','batch-select'])$(id).disabled=false;
 document.querySelectorAll('[data-boot-lock]').forEach(node=>{node.inert=node.id==='canvas-world'&&$('stage').dataset.canvasState!=='ready';});
 if($('stage').dataset.canvasState==='error')draw();
}
try{const status=await(await fetch('/api/status')).json();modelReady=status.ready;$('model-status').textContent=status.ready?'高清抠图已就绪 · 图片不上传':'本地模型未准备，请运行 setup.sh';draw();}catch{$('model-status').textContent='无法连接本机服务，请使用 run.sh 启动';}
