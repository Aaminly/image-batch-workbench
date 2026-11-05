import {loadImage} from './render.js';
import {contentFor} from './shared-content.js';
export function buildAssignments(project){
 const byVariant={},groups=[],unmatched=[],used=new Set(),groupMap=new Map();let count=0;
 for(const variant of project.variants){
  const effective=contentFor(project,variant),mode=effective.backgroundMode??(effective.exportAllBackgrounds?'all':'current');
  let chosen;
  if(!effective.backgrounds.length)chosen=[null];
  else if(mode==='all')chosen=effective.backgrounds;
  else if(mode==='current')chosen=[effective.backgrounds.find(b=>b.id===effective.activeBackgroundId)||null];
  else{chosen=effective.backgrounds.filter(b=>b.width===variant.width&&b.height===variant.height);if(!chosen.length)chosen=effective.backgrounds.filter(b=>Number.isSafeInteger(b.width)&&Number.isSafeInteger(b.height)&&b.width*variant.height===b.height*variant.width);if(!chosen.length)unmatched.push(variant.id);}
  byVariant[variant.id]=chosen.map(b=>b?.id??null);count+=chosen.length;
  for(const background of chosen){const id=background?.id??null;used.add(id);if(!groupMap.has(id)){const group={background,variants:[]};groupMap.set(id,group);groups.push(group);}groupMap.get(id).variants.push(variant);}
 }
 return {byVariant,groups,unmatched,unusedBackgrounds:project.backgrounds.filter(b=>!used.has(b.id)).map(b=>b.id),count};
}
export function activeBackground(project,variant=project.variants[0],plan=buildAssignments(project)){
 project=contentFor(project,variant);
 if(project.backgroundMode!=='matched')return project.backgrounds.find(b=>b.id===project.activeBackgroundId)||null;
 const ids=plan.byVariant[variant?.id]||[];const id=ids.includes(variant?.backgroundPreference)?variant.backgroundPreference:ids[0];return project.backgrounds.find(b=>b.id===id)||null;
}
export async function decodeBackgrounds(project,variant=project.variants[0]){
 for(const background of project.backgrounds){const image=await loadImage(background.data);background.width=image.naturalWidth;background.height=image.naturalHeight;}
 const active=activeBackground(project,variant);return active?loadImage(active.data):null;
}
export function exportGroups(project){return buildAssignments(project).groups.map(g=>g.background);}
export function folderName(background,index){return `${String(index+1).padStart(2,'0')}_${background.name.replace(/\.[^.]+$/,'').normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,60)||'背景'}`;}

export function applyImportedBackgrounds(project,incoming){
 const plan=buildAssignments(project);
 for(const variant of project.variants){
  const preferred=incoming.find(background=>(plan.byVariant[variant.id]||[]).includes(background.id));
  if(preferred)variant.backgroundPreference=preferred.id;
 }
 return plan;
}
