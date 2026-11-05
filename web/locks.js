import {PRESETS,sizeGroupName} from './state.js';
export const groupName=v=>sizeGroupName(v.width,v.height);
export function editDomainName(project,v){return (project.lockedGroups||[]).includes('自定义')&&!PRESETS.some(([w,h])=>v.width===w&&v.height===h)?'自定义':groupName(v);}
export const isGroupLocked=(project,v)=>(project.lockedGroups||[]).includes(editDomainName(project,v));
export function sameEditDomain(project,a,b){
 if(a.id===b.id)return true;
 if(a.locked||b.locked||groupName(a)!==groupName(b))return false;
 const ga=editDomainName(project,a),gb=editDomainName(project,b),locked=project.lockedGroups||[];
 if(ga==='自定义'||gb==='自定义')return ga===gb;
 return locked.includes(ga)||locked.includes(gb)?ga===gb:true;
}
export function setSizeLock(project,variant,locked){variant.locked=locked;}
export function setGroupLock(project,name,locked){project.lockedGroups=(project.lockedGroups||[]).filter(g=>g!==name);if(locked)project.lockedGroups.push(name);}
