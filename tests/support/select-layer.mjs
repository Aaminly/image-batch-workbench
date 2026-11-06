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

// Legacy-layout fixtures explicitly replace image 1; the material importer now adds images.
export async function importLegacyImage(page,file){
 await selectLayer(page,'image');
 const chooser=page.waitForEvent('filechooser');await page.locator('#replace-image').click();await(await chooser).setFiles(file);
 await page.waitForFunction(()=>!document.getElementById('project-input').disabled);
}
