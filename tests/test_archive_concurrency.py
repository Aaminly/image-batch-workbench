import io,unittest,tempfile,threading,time
from pathlib import Path
from unittest.mock import patch
import zipfile
from PIL import Image
from starlette.datastructures import FormData,UploadFile
from archive_sessions import ArchiveManager,HTTPException

def part():
 data=io.BytesIO();Image.new('RGB',(2,2),'red').save(data,format='PNG');blob=data.getvalue();return FormData([('files',UploadFile(io.BytesIO(blob),filename='a.png',size=len(blob)))])
class ConcurrentArchiveTests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.manager=ArchiveManager(self.temp.name,start_reaper=False)
 def tearDown(self):self.manager.close();self.temp.cleanup()
 def exercise(self,operation):
  job=self.manager.create(1);entered=threading.Event();resume=threading.Event();original=zipfile.ZipFile.open;errors=[]
  def delayed(archive,*args,**kwargs):entered.set();resume.wait(3);return original(archive,*args,**kwargs)
  def write():
   try:self.manager.append(job,0,part())
   except Exception as e:errors.append(e)
  with patch.object(zipfile.ZipFile,'open',delayed):
   writer=threading.Thread(target=write);writer.start();self.assertTrue(entered.wait(2));job.updated-=self.manager.ttl+1
   other=threading.Thread(target=lambda:operation(job));other.start();time.sleep(.03);self.assertTrue(job.folder.exists());resume.set();writer.join(3);other.join(3);self.assertFalse(writer.is_alive());self.assertFalse(other.is_alive());self.assertEqual(errors,[])
  return job
 def test_cancel_waits_for_current_append_then_removes_job(self):
  job=self.exercise(lambda job:self.manager.cancel(job.token));self.assertFalse(job.folder.exists())
 def test_finish_waits_for_commit_before_sealing(self):
  job=self.exercise(lambda job:self.manager.finish(job));self.assertEqual(job.state,'sealed');self.assertIsNone(zipfile.ZipFile(job.path).testzip())
 def test_ttl_cleanup_does_not_delete_a_successful_inflight_append(self):
  job=self.exercise(lambda job:self.manager.cleanup());self.assertTrue(job.path.exists());self.assertEqual(job.state,'open')
 def test_ttl_waits_for_download_lease(self):
  job=self.manager.create(1);self.manager.append(job,0,part());self.manager.finish(job);leased=self.manager.reserve_download(job.token);job.updated-=self.manager.ttl+1;self.manager.cleanup();self.assertTrue(job.path.exists());self.manager.release_download(leased);self.assertFalse(job.folder.exists())
 def test_cancelled_upload_releases_reservation_and_spooled_handles(self):
  import anyio,httpx,server,archive_sessions
  parsers=[];original=archive_sessions.MultiPartParser
  class CapturingParser(original):
   def __init__(self,*a,**k):super().__init__(*a,**k);parsers.append(self)
  async def verify():
   async with server.app.router.lifespan_context(server.app):
    manager=server.app.state.archives;job=manager.create(1);started=anyio.Event()
    async def body():
     yield b'--BOUNDARY\r\nContent-Disposition: form-data; name="files"; filename="a.png"\r\nContent-Type: image/png\r\n\r\npartial'
     started.set();await anyio.sleep_forever()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),base_url='http://127.0.0.1:8765') as client:
     async def send():await client.post(f'/api/archives/{job.token}/parts/0',content=body(),headers={'content-type':'multipart/form-data; boundary=BOUNDARY'})
     with patch.object(archive_sessions,'MultiPartParser',CapturingParser):
      async with anyio.create_task_group() as group:
       group.start_soon(send);await started.wait();group.cancel_scope.cancel()
     self.assertEqual(job.uploads,0);self.assertTrue(all(file.closed for parser in parsers for file in parser._files_to_close_on_error));manager.cancel(job.token);self.assertFalse(job.folder.exists())
  anyio.run(verify)
if __name__=='__main__':unittest.main()
