import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true}),p=await b.newPage({viewport:{width:1440,height:1000}});
try{
 await p.goto('http://127.0.0.1:8765');await p.locator('#image-input').setInputFiles('tests/fixtures/layout.png');await p.locator('#notice').filter({hasText:'已导入'}).waitFor({state:'attached'});const before=await p.locator('#preview').evaluate(c=>c.toDataURL());
 let received;const pendingPart=new Promise(r=>received=r);await p.route('**/api/archives/*/parts/*',async route=>{received();await new Promise(r=>setTimeout(r,500));await route.continue().catch(()=>{});});
 const creation=p.waitForResponse(r=>r.url().endsWith('/api/archives')&&r.request().method()==='POST');await p.locator('#export-all').click();const token=(await(await creation).json()).token;await pendingPart;await p.locator('#cancel-export').click();await p.locator('#notice').filter({hasText:'已取消导出'}).waitFor({state:'attached'});
 assert.equal(await p.locator('#preview').evaluate(c=>c.toDataURL()),before);assert.equal(await p.locator('#export-download').isVisible(),false);assert.equal((await p.request.get(`http://127.0.0.1:8765/api/archives/${token}/download`)).status(),404);assert.equal(await p.locator('#export-all').isEnabled(),true);console.log('PASS UI cancellation stops transfer, deletes local job, and preserves working canvas');
}finally{await b.close();}
