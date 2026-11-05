import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/app.js',route=>route.fulfill({body:'',contentType:'text/javascript'}));
 await page.goto('http://127.0.0.1:8765');
 const margins=await page.evaluate(async()=>{
  const {createProject,addVariant}=await import('/state.js'),{drawPreview}=await import('/preview.js');
  const project=createProject(),variant=addVariant(project,200,600);variant.textLayers.title.dx=-1000;
  const stage=document.createElement('div');stage.className='stage';stage.style.cssText='width:600px;height:500px';
  const surface=document.createElement('div');surface.className='preview-surface';const canvas=document.createElement('canvas');surface.append(canvas);stage.append(surface);document.body.prepend(stage);
  const results=[];
  for(const width of [600,800,450]){
   stage.style.width=`${width}px`;drawPreview(canvas,project,variant,{},stage);
   const c=canvas.getBoundingClientRect(),s=stage.getBoundingClientRect();results.push({width,left:c.left-s.left,right:s.left+stage.clientWidth-c.right});
  }
  return results;
 });
 for(const {width,left,right} of margins)assert.ok(Math.abs(left-right)<=1,`${width}px workspace: left ${left}, right ${right}`);
 console.log('PASS artboard stays horizontally centered after workspace resizing',margins);
}finally{await browser.close();}
