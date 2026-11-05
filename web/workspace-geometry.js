import {PRESET_GROUPS,sizeGroupName} from './state.js';
export function layoutBoards(variants){
 const groups=[],boards=[];
 PRESET_GROUPS.forEach(({name},index)=>{
  const own=variants.filter(v=>sizeGroupName(v.width,v.height)===name);if(!own.length)return;
  const group={name,x:index*1240,y:0,w:1160,h:100+Math.ceil(own.length/3)*440,ids:own.map(v=>v.id)};groups.push(group);
  own.forEach((v,i)=>{const scale=Math.min(320/v.width,360/v.height);boards.push({id:v.id,group:name,x:group.x+40+(i%3)*360,y:80+Math.floor(i/3)*440,w:v.width*scale,h:v.height*scale,scale});});
 });
 return {groups,boards,bounds:rectBounds(groups)};
}
export function rectBounds(rects){if(!rects.length)return{x:0,y:0,w:1,h:1};const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));return{x,y,w:Math.max(...rects.map(r=>r.x+r.w))-x,h:Math.max(...rects.map(r=>r.y+r.h))-y};}
export function miniProjection(nodes,view){const bounds=rectBounds([nodes,view]),scale=Math.min(146/Math.max(1,bounds.w),86/Math.max(1,bounds.h));return {scale,x:(170-bounds.w*scale)/2-bounds.x*scale,y:(110-bounds.h*scale)/2-bounds.y*scale};}
export const projectRect=(r,p)=>({x:r.x*p.scale+p.x,y:r.y*p.scale+p.y,w:r.w*p.scale,h:r.h*p.scale});
export const unprojectPoint=(q,p)=>({x:(q.x-p.x)/p.scale,y:(q.y-p.y)/p.scale});
export function zoomAt(t,anchor,zoom){zoom=Math.max(.05,Math.min(64,zoom));return {x:anchor.x-(anchor.x-t.x)*zoom/t.zoom,y:anchor.y-(anchor.y-t.y)*zoom/t.zoom,zoom};}
export function fitRect(rect,width,height){const zoom=Math.max(.05,Math.min(3,(width-120)/rect.w,(height-120)/rect.h));return{x:width/2-(rect.x+rect.w/2)*zoom,y:height/2-(rect.y+rect.h/2)*zoom,zoom};}
