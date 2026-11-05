import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.route('**/app.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));await page.goto('http://127.0.0.1:8765');
 const results=await page.evaluate(async()=>{
  const {createProject,addVariant}=await import('/state.js'),{drawPreview}=await import('/preview.js');const results=[];
  for(const size of [[1200,628],[200,600]]){
   const project=createProject(),v=addVariant(project,...size),stage=document.createElement('div');stage.className='stage';stage.style.cssText='width:888.664px;height:544.664px;min-height:0;padding:18px;border:0 solid transparent';
   const surface=document.createElement('div');surface.className='preview-surface';const canvas=document.createElement('canvas');surface.append(canvas);stage.append(surface);document.body.prepend(stage);
   let draws=0;const states=[];
   const observer=new ResizeObserver(()=>{
    draws++;drawPreview(canvas,project,v,{},stage);
    // Model classic scrollbars' occupied space on hosts that use overlay scrollbars.
    const style=getComputedStyle(stage);stage.style.borderRightWidth=style.overflowY==='scroll'||stage.scrollHeight>stage.clientHeight?'11px':'0px';stage.style.borderBottomWidth=style.overflowX==='scroll'||stage.scrollWidth>stage.clientWidth?'11px':'0px';
    states.push([stage.clientWidth,stage.clientHeight,canvas.style.width,canvas.style.height]);
   });observer.observe(stage);
   for(let i=0;i<60;i++)await new Promise(requestAnimationFrame);
   const settled=draws,tail=[];for(let i=0;i<15;i++){await new Promise(requestAnimationFrame);const r=canvas.getBoundingClientRect();tail.push([r.x,r.y,r.width,r.height]);}
   results.push({size,draws,settled,states:[...new Set(states.map(JSON.stringify))],positions:[...new Set(tail.map(JSON.stringify))]});observer.disconnect();stage.remove();
  }
  return results;
 });
 for(const r of results){assert.ok(r.settled<=4,`render loop for ${r.size}: ${JSON.stringify(r)}`);assert.equal(r.draws,r.settled);assert.equal(r.positions.length,1);}
 console.log('PASS stable landscape/portrait canvases with occupied scrollbar space',results);
}finally{await browser.close();}
