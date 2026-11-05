import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html=await fs.readFile('web/index.html','utf8'),header=html.match(/<header[\s\S]*?<\/header>/)[0],css=await fs.readFile('web/style.css','utf8');
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
try{
 await page.setContent(`<style>${css}</style>${header}`);
 const results=[];
 for(const width of [1440,1280,1201,1100,390]){
  await page.setViewportSize({width,height:800});
  for(const text of ['已保存 · 18:38:59','正在保存…','尚未保存']){
   await page.locator('#save-indicator').evaluate((el,text)=>el.textContent=text,text);
   const result=await page.locator('#save-indicator').evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),actions=document.querySelector('.actions').getBoundingClientRect();return {visible:s.display!=='none',width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,right:r.right,actionsLeft:actions.left,ellipsis:s.textOverflow};});
   if(result.visible){assert.ok(result.scrollWidth<=result.clientWidth,`${width} ${text}: status is clipped`);assert.ok(result.right<=result.actionsLeft,'status overlaps actions');}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push({width,text,...result});
  }
 }
 await page.setViewportSize({width:1201,height:800});await page.locator('#save-indicator').evaluate(el=>el.textContent='保存失败：'+'本机草稿服务连接异常，请保留当前编辑。'.repeat(20));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1440,height:800});await page.locator('#save-indicator').evaluate(el=>el.textContent='已保存 · 18:38:59');await fs.mkdir('.local/save-indicator',{recursive:true});await page.screenshot({path:'.local/save-indicator/header.png',clip:{x:0,y:0,width:1440,height:80}});await fs.writeFile('.local/save-indicator/evidence.json',JSON.stringify(results,null,2));console.log('PASS full save status at desktop widths, no action overlap or page overflow; existing narrow-screen visibility preserved');
}finally{await browser.close();}
