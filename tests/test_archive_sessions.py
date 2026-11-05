import importlib.util,io,unittest,tempfile,zipfile,hashlib,threading,time
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from starlette.datastructures import UploadFile,FormData
spec=importlib.util.find_spec('archive_sessions');module=__import__('archive_sessions') if spec else None

def png(color='red',size=(1,1)):
 stream=io.BytesIO();Image.new('RGB',size,color).save(stream,format='PNG');return stream.getvalue()
def form(items):return FormData([('files',UploadFile(io.BytesIO(data),filename=name,size=len(data))) for name,data in items])
class SessionTests(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(module,'archive session support is missing');self.temp=tempfile.TemporaryDirectory();self.manager=module.ArchiveManager(Path(self.temp.name),start_reaper=False)
 def tearDown(self):
  if hasattr(self,'manager'):self.manager.close();self.temp.cleanup()
 def test_over_850_entries_are_complete_and_crc_correct(self):
  job=self.manager.create(901);data=png()
  for seq,start in enumerate(range(0,901,300)):self.manager.append(job,seq,form([(f'{i}.png',data) for i in range(start,min(start+300,901))]))
  self.manager.finish(job)
  with zipfile.ZipFile(job.path) as z:self.assertEqual(len(z.namelist()),901);self.assertIsNone(z.testzip());self.assertEqual(z.read('900.png'),data)
 def test_retries_are_exact_and_out_of_order_does_not_commit(self):
  job=self.manager.create(3);part=[('a.png',png()),('b.png',png('blue'))];first=self.manager.append(job,0,form(part));self.assertEqual(self.manager.append(job,0,form(part)),first)
  for changed in [[('a.png',png('green')),part[1]],[('renamed.png',png()),part[1]],list(reversed(part)),part[:1]]:
   with self.assertRaises(module.HTTPException) as e:self.manager.append(job,0,form(changed))
   self.assertEqual(e.exception.status_code,409)
  with self.assertRaises(module.HTTPException):self.manager.append(job,2,form([('c.png',png())]))
  with self.assertRaises(module.HTTPException):self.manager.finish(job)
  self.manager.append(job,1,form([('c.png',png())]));self.assertEqual(self.manager.finish(job),self.manager.finish(job))
  with self.assertRaises(module.HTTPException):self.manager.append(job,2,form([('d.png',png())]))
 def test_bad_parts_paths_duplicates_and_empty_are_rejected_without_partial_zip(self):
  job=self.manager.create(2)
  for items in [[('../bad.png',png())],[('bad.png',b'bad')],[],[('a.png',png()),('a.png',png())]]:
   with self.assertRaises(module.HTTPException):self.manager.append(job,0,form(items))
  self.manager.append(job,0,form([('a.png',png())]));
  with self.assertRaises(module.HTTPException):self.manager.append(job,1,form([('a.png',png())]))
  self.manager.append(job,1,form([('b.png',png())]));self.manager.finish(job)
 def test_write_failure_invalidates_entire_job(self):
  job=self.manager.create(2);original=zipfile.ZipFile.open;calls=0
  def fail(z,*args,**kwargs):
   nonlocal calls
   calls+=1
   if calls==2:raise OSError('injected disk full')
   return original(z,*args,**kwargs)
  with patch.object(zipfile.ZipFile,'open',fail):
   with self.assertRaises(module.HTTPException):self.manager.append(job,0,form([('a.png',png()),('b.png',png())]))
  self.assertFalse(job.folder.exists())
  with self.assertRaises(module.HTTPException):self.manager.lookup(job.token)
 def test_cancel_and_expiry_wait_for_download_lease(self):
  job=self.manager.create(1);self.manager.append(job,0,form([('a.png',png())]));self.manager.finish(job)
  leased=self.manager.reserve_download(job.token);self.manager.cancel(job.token);self.assertTrue(job.path.exists());self.manager.release_download(leased);self.assertFalse(job.folder.exists())
  other=self.manager.create(1);other.updated-=self.manager.ttl+1;self.manager.cleanup();self.assertFalse(other.folder.exists())
 def test_foreign_token_is_not_a_filesystem_path(self):
  for token in ['../server.py','', 'not-a-token']:
   with self.assertRaises(module.HTTPException) as e:self.manager.lookup(token)
   self.assertEqual(e.exception.status_code,404)
 def test_failed_delete_is_retried_and_token_stays_inaccessible(self):
  job=self.manager.create(1);original=module.shutil.rmtree;calls=0
  def fail_once(path,*args,**kwargs):
   nonlocal calls
   calls+=1
   if calls==1:raise OSError('busy file')
   return original(path,*args,**kwargs)
  with patch.object(module.shutil,'rmtree',fail_once):
   self.manager.cancel(job.token)
   with self.assertRaises(module.HTTPException):self.manager.lookup(job.token)
   self.manager.cleanup()
  self.assertFalse(job.folder.exists())
 def test_malformed_orphan_markers_do_not_break_startup(self):
  for i,marker in enumerate(['null','[]','{"signature":"local-ad-studio/archive-job/v1","pid":-1}','{"signature":"local-ad-studio/archive-job/v1","pid":999999999999999999999999999}']):
   folder=Path(self.temp.name)/f'archive-job-bad{i}';folder.mkdir();(folder/'.owner').write_text(marker)
  other=module.ArchiveManager(Path(self.temp.name),start_reaper=False);other.close();self.assertTrue((Path(self.temp.name)/'archive-job-bad0').exists())
 def test_owner_write_failure_does_not_leave_an_orphan(self):
  with patch.object(Path,'write_text',side_effect=OSError('disk full')):
   with self.assertRaises(Exception):self.manager.create(1)
  self.assertEqual(list(Path(self.temp.name).glob('archive-job-*')),[])
 def test_zip_close_failure_invalidates_job(self):
  job=self.manager.create(1);original=zipfile.ZipFile.close;failed=False
  def fail_once(archive):
   nonlocal failed
   if not failed:
    failed=True;original(archive);raise OSError('injected close failure')
   return original(archive)
  with patch.object(zipfile.ZipFile,'close',fail_once):
   with self.assertRaises(module.HTTPException):self.manager.append(job,0,form([('a.png',png())]))
  self.assertFalse(job.folder.exists())

class SessionAPITests(unittest.TestCase):
 def setUp(self):self.assertIsNotNone(module)
 def test_creation_body_limit_and_range_download(self):
  import server
  from fastapi.testclient import TestClient
  with TestClient(server.app,base_url='http://127.0.0.1:8765') as client:
   response=client.post('/api/archives',content=b'{"expectedFiles":1,"padding":"'+b'x'*5000+b'"}',headers={'content-type':'application/json'});self.assertEqual(response.status_code,413)
   token=client.post('/api/archives',json={'expectedFiles':1}).json()['token'];client.post(f'/api/archives/{token}/parts/0',files=[('files',('a.png',png(),'image/png'))]);url=client.post(f'/api/archives/{token}/finish').json()['downloadUrl'];self.assertEqual(client.head(url).status_code,200);self.assertEqual(client.get(url,headers={'range':'bytes=0-19'}).status_code,206)
   response=client.get(url);self.assertEqual(response.status_code,200);self.assertEqual(zipfile.ZipFile(io.BytesIO(response.content)).read('a.png'),png());client.delete(f'/api/archives/{token}')
 def test_waiting_cancel_does_not_block_other_http_requests(self):
  import server
  from fastapi.testclient import TestClient
  with TestClient(server.app,base_url='http://127.0.0.1:8765') as client:
   client.get('/api/status');job=server.app.state.archives.create(1);job.lock.acquire();results={}
   cancel=threading.Thread(target=lambda:client.delete(f'/api/archives/{job.token}'));probe=threading.Thread(target=lambda:results.update(status=client.get('/api/status').status_code))
   try:
    cancel.start();time.sleep(.05);probe.start();probe.join(.4);responsive=not probe.is_alive()
   finally:job.lock.release();cancel.join(3);probe.join(3)
   self.assertTrue(responsive,'cancelling must wait outside the ASGI event loop');self.assertEqual(results.get('status'),200)
 def test_form_close_failure_still_releases_upload_reservation(self):
  import server
  from fastapi.testclient import TestClient
  async def fail_close(form):raise OSError('close failed')
  with TestClient(server.app,base_url='http://127.0.0.1:8765',raise_server_exceptions=False) as client:
   token=client.post('/api/archives',json={'expectedFiles':1}).json()['token'];job=server.app.state.archives.lookup(token)
   captured=[];original_parse=module.MultiPartParser.parse
   async def capture(parser):
    parsed=await original_parse(parser);captured.append(parsed);return parsed
   with patch.object(FormData,'close',fail_close),patch.object(module.MultiPartParser,'parse',capture):client.post(f'/api/archives/{token}/parts/0',files=[('files',('a.png',png(),'image/png'))])
   self.assertTrue(all(file.file.closed for form in captured for _,file in form.multi_items()),'spool handles must close even when FormData.close fails')
   self.assertEqual(job.uploads,0);client.delete(f'/api/archives/{token}');self.assertFalse(job.folder.exists())
if __name__=='__main__':unittest.main()
