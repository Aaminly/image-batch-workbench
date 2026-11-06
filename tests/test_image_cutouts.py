import copy
import unittest
from fastapi import HTTPException
import tests.test_drafts as legacy


class ImageCutoutTests(unittest.TestCase):
 setUp=legacy.DraftTests.setUp
 payload=legacy.DraftTests.payload

 def test_image_sources_survive_save_and_reject_dangling_refs(self):
  d=self.store.create();original=self.store.asset(d['id'],self.png);result=self.store.asset(d['id'],self.png+b'cutout')
  payload=self.payload(original);p=payload['project'];p['assets']['original']=None;p['media']={'m1':original,'m2':result};p['variants'][0]['elements']=[{'id':'element-a','type':'image','media':'m2','originalMedia':'m1','cutoutMedia':'m2'}]
  self.store.save(d['id'],0,payload);again=self.module.DraftStore(self.tmp.name)
  self.assertEqual(again.list()[0]['thumbnail'],result)
  self.assertEqual(again.get(d['id'])['project']['variants'][0]['elements'][0]['originalMedia'],'m1')
  for key in ['media','originalMedia','cutoutMedia']:
   bad=copy.deepcopy(payload);bad['project']['variants'][0]['elements'][0][key]='m999'
   with self.subTest(key=key),self.assertRaises(HTTPException):again.save(d['id'],1,bad)
  self.assertEqual(again.get(d['id'])['revision'],1)

 def test_thumbnail_finds_current_or_nonfirst_size_image(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload=self.payload(ref);p=payload['project'];p['assets']['original']=None;p['media']={'m1':ref}
  p['variants'].append({'id':'600x500','width':600,'height':500,'elements':[{'id':'element-a','type':'image','media':'m1'}]})
  self.store.save(d['id'],0,payload);self.assertEqual(self.store.list()[0]['thumbnail'],ref)

 def test_invalid_source_does_not_crash_list_or_replace_valid_save(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload=self.payload(ref);self.store.save(d['id'],0,payload)
  bad=copy.deepcopy(payload);bad['project']['source']=[]
  with self.assertRaises(HTTPException):self.store.save(d['id'],1,bad)
  record=self.store.get(d['id']);record['project']['source']=[];self.module.atomic_json(self.store.path(d['id']),record)
  self.assertEqual(self.store.list()[0]['thumbnail'],ref)

 def test_thumbnail_skips_legacy_nonlist_elements(self):
  p={'assets':{},'media':{'m1':'image-ref'},'variants':[{'id':'300x250','elements':None},{'id':'600x500','elements':[{'type':'image','media':'m1'}]}]}
  self.assertEqual(self.module.thumbnail(p,'300x250'),'image-ref')

if __name__=='__main__':unittest.main()
