export async function selectLayer(page,id){
 const target=page.locator(`[data-layer="${id}"]`);
 if(id==='cta'&&!await target.count()){
  await page.locator('[data-element-type="button"]').click();
  return;
 }
 if(!await target.isVisible()){
  const type=['title','subtitle'].includes(id)?'text':id==='cta'?'button':'image';
  await page.locator(`[data-element-type="${type}"]`).click();
  if(await target.getAttribute('aria-pressed')==='true')return;
 }
 await target.click();
}
