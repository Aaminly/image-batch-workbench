import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
await fs.mkdir('work',{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
p.on('dialog',d=>d.accept());
try{
 await p.goto('http://127.0.0.1:8765');await p.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await p.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});
 const before=await p.locator('#preview').evaluate(c=>c.toDataURL());
 const dl=p.waitForEvent('download');await p.locator('#export-png').click();const file=await(await dl).path();const downloaded=await fs.readFile(file);assert.equal(downloaded.readUInt32BE(16),300);assert.equal(downloaded.readUInt32BE(20),250);
 await p.locator('#logo-input').setInputFiles('tests/fixtures/layout.png');await p.locator('#notice').filter({hasText:'Logo已导入'}).waitFor({state:'attached'});
 const box=await p.locator('#preview').boundingBox();await p.locator('[data-layer="title"]').click();const x=Number(await p.locator('#text-x').inputValue());
 await p.mouse.move(box.x+60*box.width/300,box.y+165*box.height/250);await p.mouse.down();await p.mouse.move(box.x+60*box.width/300+20,box.y+165*box.height/250+10);await p.mouse.up();assert.ok(Number(await p.locator('#text-x').inputValue())>x);
 await p.locator('#crop').check();await p.locator('#scale').fill('2');await p.locator('#scale').dispatchEvent('input');await p.locator('#warnings').filter({hasText:'裁切'}).waitFor();
 await p.locator('#reset-layout').evaluate(el=>{for(let x=el.parentElement;x;x=x.parentElement)if(x.tagName==='DETAILS')x.open=true;});await p.locator('#reset-layout').click();assert.equal(await p.locator('#crop').isChecked(),false);assert.equal(await p.locator('#scale').inputValue(),'1');
 await p.locator('#background').selectOption('gradient');assert.notEqual(await p.locator('#preview').evaluate(c=>c.toDataURL()),before);
 await p.locator('summary').filter({hasText:'添加自定义尺寸'}).click();await p.locator('#custom-w').fill('800');await p.locator('#custom-h').fill('600');await p.locator('#add-size').click();assert.equal(await p.locator('#variant-select').inputValue(),'800x600');await p.getByRole('button',{name:'移除 800 × 600',exact:true}).click();assert.equal(await p.locator('#variant-select').inputValue(),'300x250');
 await p.locator('#remove-logo').click();assert.equal(await p.locator('#remove-logo').isDisabled(),true);
 await p.route('**/api/cutout',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'本地模型缺失，请运行 setup.sh'})}));await p.locator('#cutout').click();await p.locator('#notice').filter({hasText:'本地模型缺失'}).waitFor({state:'attached'});assert.equal(await p.locator('#use-cutout').isDisabled(),true);assert.equal(await p.locator('#title').isDisabled(),false);
 const timing=await p.evaluate(async()=>{const {createProject,addVariant}=await import('/state.js');const {render}=await import('/render.js');const a=createProject(),canvas=document.createElement('canvas'),result={};for(const [w,h]of [[300,250],[1080,1920],[4000,4000]]){const v=addVariant(a,w,h),t=performance.now();for(let i=0;i<3;i++)render(canvas,a,v,{});result[`${w}x${h}`]=Math.round((performance.now()-t)/3*100)/100;}return result;});
 console.log(JSON.stringify({native_png_dimensions:true,drag:true,logo:true,crop:true,reset:true,custom_size:true,model_error_ui:true,render_ms:timing},null,2));
}finally{await b.close();}
