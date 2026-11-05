import {PRESET_GROUPS,sizeGroupName} from './state.js';
const groupFor=v=>PRESET_GROUPS.find(group=>group.name===sizeGroupName(v.width,v.height));
export function previewGroup(project,currentId){
 const current=project.variants.find(v=>v.id===currentId);if(!current)return{name:'',variants:[]};
 const group=groupFor(current),variants=project.variants.filter(v=>v.id!==currentId&&groupFor(v)===group);
 if(group){const order=v=>{const i=group.sizes.findIndex(([w,h])=>w===v.width&&h===v.height);return i<0?group.sizes.length:i;};variants.sort((a,b)=>order(a)-order(b)||a.width-b.width||a.height-b.height);}
 return{name:group?.name||'自定义',variants};
}
