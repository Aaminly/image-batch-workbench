import io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from fastapi import HTTPException

class DraftTests(unittest.TestCase):
 def setUp(self):
  import drafts
  self.module=drafts;self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.store=drafts.DraftStore(Path(self.tmp.name))
  b=io.BytesIO();Image.new('RGBA',(24,24),(50,90,120,128)).save(b,format='PNG');self.png=b.getvalue()
 def payload(self,ref):return {'project':{'version':1,'name':'测试','assets':{'original':ref,'cutout':None,'logo':None},'backgrounds':[],'variants':[{'id':'300x250','width':300,'height':250}],'copy':{'title':'第一批'}},'ui':{'currentId':'300x250','excludedExportSizes':[]}}
 def test_extra_logo_assets_survive_collection_and_restart(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);extra=self.store.asset(d['id'],self.png+b'original')
  payload=self.payload(ref);payload['project']['assets'].update(logo=ref,logoOriginal=extra,logoCutout=ref)
  self.store.save(d['id'],0,payload)
  self.assertEqual(self.store.get(d['id'])['pending'],[])
  again=self.module.DraftStore(Path(self.tmp.name));self.assertEqual(again.read_asset(d['id'],extra),self.png+b'original')
  bad=self.payload(ref);bad['project']['assets']['logoCutout']='missing'
  with self.assertRaises(HTTPException):again.save(d['id'],1,bad)
 def test_assets_reused_and_revision_survives_restart(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);self.store.asset(d['id'],self.png)
  saved=self.store.save(d['id'],0,self.payload(ref));self.assertEqual(saved['revision'],1)
  self.assertEqual(len(list((Path(self.tmp.name)/'assets').glob('*'))),1)
  again=self.module.DraftStore(Path(self.tmp.name));self.assertEqual(again.get(d['id'])['project']['assets']['original'],ref);self.assertEqual(len(again.list()),1)
 def test_conflict_and_late_write_cannot_resurrect_deleted(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);self.store.save(d['id'],0,self.payload(ref))
  with self.assertRaises(HTTPException) as e:self.store.save(d['id'],0,self.payload(ref))
  self.assertEqual(e.exception.status_code,409);self.store.delete([d['id']])
  with self.assertRaises(HTTPException) as e:self.store.save(d['id'],1,self.payload(ref))
  self.assertEqual(e.exception.status_code,404);self.assertEqual(self.store.list(),[])
 def test_deletion_preserves_other_drafts_and_pending_assets(self):
  a=self.store.create();ref=self.store.asset(a['id'],self.png);other=self.store.asset(a['id'],self.png+b'other');self.store.save(a['id'],0,self.payload(ref));self.assertEqual(self.store.read_asset(a['id'],other),self.png+b'other');self.store.delete([a['id']]);self.assertEqual(list((Path(self.tmp.name)/'assets').glob('*')),[])
 def test_bad_input_and_disk_failure_preserve_last_version(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);self.store.save(d['id'],0,self.payload(ref))
  with self.assertRaises(HTTPException):self.store.asset(d['id'],b'bad')
  with self.assertRaises(HTTPException):self.store.get('../x')
  bad=self.payload('a'*64)
  with self.assertRaises(HTTPException):self.store.save(d['id'],1,bad)
  changed=self.payload(ref);changed['project']['copy']['title']='未落盘'
  with patch.object(self.module,'atomic_json',side_effect=OSError('disk full')):
   with self.assertRaises(HTTPException):self.store.save(d['id'],1,changed)
  self.assertEqual(self.store.get(d['id'])['project']['copy']['title'],'第一批')
 def test_blank_records_not_listed(self):self.store.create();self.assertEqual(self.store.list(),[])
 def test_thumbnails_are_small_and_long_names_cannot_create_unreadable_draft(self):
  d=self.store.create();b=io.BytesIO();Image.new('RGB',(1200,900),'navy').save(b,format='PNG');ref=self.store.asset(d['id'],b.getvalue())
  preview=self.store.read_asset(d['id'],ref,preview=True);im=Image.open(io.BytesIO(preview));self.assertLessEqual(max(im.size),160);self.assertLess(len(preview),len(b.getvalue()))
  payload=self.payload(ref);payload['project']['name']='长'*101
  with self.assertRaises(HTTPException):self.store.save(d['id'],0,payload)
 def test_project_capacity_enforces_120mb_without_resending_images(self):
  d=self.store.create();refs=[]
  for byte in range(1,5):refs.append(self.store.asset(d['id'],self.png.ljust(22*1024*1024,bytes([byte]))))
  payload=self.payload(refs[0]);payload['project']['assets'].update(cutout=refs[1],logo=refs[2]);payload['project']['backgrounds']=[{'id':'bg','name':'背景','data':refs[3]}]
  self.store.save(d['id'],0,payload);self.assertLess(len(json.dumps(payload)),2000)
  extra=self.store.asset(d['id'],self.png.ljust(3*1024*1024,b'X'));payload['project']['backgrounds'].append({'id':'bg2','name':'过大','data':extra})
  with self.assertRaises(HTTPException) as e:self.store.save(d['id'],1,payload)
  self.assertEqual(e.exception.status_code,413);self.assertEqual(self.store.get(d['id'])['revision'],1)
 def test_replace_failure_keeps_valid_json_and_cleans_temporary_file(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);self.store.save(d['id'],0,self.payload(ref))
  with patch('os.replace',side_effect=OSError('disk full')):
   with self.assertRaises(HTTPException):self.store.save(d['id'],1,self.payload(ref))
  self.assertEqual(self.store.get(d['id'])['revision'],1);self.assertEqual(len(list(self.store.records.iterdir())),1)
 def test_http_size_validation_same_origin_and_private_storage(self):
  from fastapi.testclient import TestClient
  import server
  with patch.object(server,'ROOT',Path(self.tmp.name)),TestClient(server.app,base_url='http://127.0.0.1:8765') as client:
   server.app.state.drafts=self.store
   self.assertEqual(client.post('/api/drafts',headers={'origin':'https://evil.test'}).status_code,403)
   d=client.post('/api/drafts').json();self.assertEqual(client.put('/api/drafts/'+d['id'],content=b'invalid').status_code,400)
   self.assertEqual(client.put('/api/drafts/'+d['id'],json=[]).status_code,400)
   self.assertEqual(client.post('/api/drafts/delete',json={'ids':['../bad']}).status_code,404)
   self.assertEqual(client.get('/.local/drafts/records/'+d['id']+'.json').status_code,404)
   with patch.object(self.module,'MAX_META',128):self.assertEqual(client.put('/api/drafts/'+d['id'],content=b'x'*129).status_code,413)
 def test_large_lightweight_metadata_keeps_existing_project_capacity(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload=self.payload(ref)
  payload['project']['backgrounds']=[{'id':f'bg-{i}','name':'背'*150,'data':ref,'width':24,'height':24} for i in range(4000)]
  self.assertGreater(len(json.dumps(payload,ensure_ascii=False).encode()),2*1024*1024)
  self.assertEqual(self.store.save(d['id'],0,payload)['revision'],1)
 def test_capacity_counts_utf8_project_without_ui_or_envelope(self):
  import base64,copy
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload=self.payload(ref);project=copy.deepcopy(payload['project']);project['assets']['original']='data:image/png;base64,'+base64.b64encode(self.png).decode()
  exact=len(json.dumps(project,ensure_ascii=False,separators=(',',':')).encode())
  with patch.object(self.module,'MAX_PROJECT',exact):self.assertEqual(self.store.save(d['id'],0,payload)['revision'],1)
 def test_locked_media_roundtrips_and_rejects_unowned_or_dangling_refs(self):
  d=self.store.create();ref=self.store.asset(d['id'],self.png);payload=self.payload(ref)
  payload['project']['media']={'m1':ref};payload['project']['variants'][0]['content']={'logo':'m1'}
  self.store.save(d['id'],0,payload)
  self.assertEqual(self.store.get(d['id'])['project']['media']['m1'],ref)
  payload['project']['media']['m1']='a'*64
  with self.assertRaises(HTTPException):self.store.save(d['id'],1,payload)
  payload['project']['media']['m1']=ref;payload['project']['variants'][0]['content']['logo']='m2'
  with self.assertRaises(HTTPException):self.store.save(d['id'],1,payload)
  self.assertEqual(self.store.get(d['id'])['revision'],1)
