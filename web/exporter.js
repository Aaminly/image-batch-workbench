import {compressedPng} from './compression.js';
import {render,loadImage} from './render.js';
import {buildAssignments,folderName} from './backgrounds.js';
import {createArchiveUpload} from './archive-client.js';
export async function exportArchive(project,assets,onProgress,{signal}={}){
 const plan=buildAssignments(project);if(plan.unmatched.length)throw Error(`这些尺寸没有匹配背景：${plan.unmatched.join('、')}。请补齐背景或主动切换背景应用方式`);
 const upload=await createArchiveUpload(plan.count,signal),warnings=[];let completed=0,warningCount=0;
 try{
  for(let groupIndex=0;groupIndex<plan.groups.length;groupIndex++){
   signal?.throwIfAborted();const {background,variants}=plan.groups[groupIndex];
   const image=background?(background.id===assets.backgroundId?assets.background:await loadImage(background.data)):null,groupAssets={...assets,background:image};
   const count=variants.length;
   for(let i=0;i<count;i++){
    signal?.throwIfAborted();const v=variants[i],canvas=document.createElement('canvas'),result=render(canvas,project,v,groupAssets);warningCount+=result.warnings.length;if(warnings.length<20)warnings.push(...result.warnings.slice(0,20-warnings.length));
    await upload.append(await compressedPng(canvas,signal),`${v.width}x${v.height}${plan.byVariant[v.id].length>1?'-'+folderName(background,groupIndex):''}.png`);
    canvas.width=1;canvas.height=1;completed++;onProgress(`正在合成 ${completed} / ${plan.count}…`);await new Promise(r=>setTimeout(r,0));
   }
  }
  onProgress('正在完成本机ZIP…');const result=await upload.finish();return {...result,count:completed,warningCount,warnings};
 }catch(error){await upload.cancel();throw error;}
}
