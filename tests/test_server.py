import importlib.util, io, unittest, zipfile
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
spec=importlib.util.find_spec('server')
server=__import__('server') if spec else None
class ServiceTests(unittest.TestCase):
 def setUp(self):
  self.assertIsNotNone(server,'local image service is not implemented')
  self.client=TestClient(server.app,base_url='http://127.0.0.1:8765')
 def png(self):
  b=io.BytesIO();Image.new('RGBA',(24,24),(200,30,40,128)).save(b,format='PNG');return b.getvalue()
 def test_rejects_invalid_image(self):
  r=self.client.post('/api/cutout',content=b'not an image');self.assertEqual(r.status_code,400)
 def test_missing_model_is_explicit(self):
  with patch.object(server,'MODEL_FILE',server.ROOT/'work'/'missing.onnx'):
   r=self.client.post('/api/cutout',content=self.png());self.assertEqual(r.status_code,503);self.assertIn('模型',r.json()['detail'])
 def test_blocks_foreign_origin_and_dns_rebinding(self):
  r=self.client.post('/api/cutout',content=self.png(),headers={'origin':'https://evil.test'});self.assertEqual(r.status_code,403)
  r=self.client.get('/api/status',headers={'host':'evil.test'});self.assertEqual(r.status_code,400)
 def test_archives_only_valid_png_with_safe_names(self):
  import base64
  r=self.client.post('/api/archive',json={'items':[{'name':'24x24.png','data':base64.b64encode(self.png()).decode()}]});self.assertEqual(r.status_code,200)
  z=zipfile.ZipFile(io.BytesIO(r.content));self.assertEqual(z.namelist(),['24x24.png'])
  r=self.client.post('/api/archive',json={'items':[{'name':'../bad.png','data':base64.b64encode(self.png()).decode()}]});self.assertEqual(r.status_code,400)
 def test_static_does_not_expose_project_files(self):
  self.assertEqual(self.client.get('/server.py').status_code,404)
 def test_high_detail_model_is_reported(self):
  r=self.client.get('/api/status');self.assertEqual(r.json()['model'],'birefnet-general');self.assertEqual(r.json()['input_resolution'],1024)
 def test_model_integrity_check_is_bounded_and_detects_replacement(self):
  import hashlib,tempfile,tracemalloc
  from pathlib import Path
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'model.onnx';data=b'x'*(2*1024*1024);path.write_bytes(data)
   with patch.object(server,'MODEL_FILE',path),patch.object(server,'MODEL_MD5',hashlib.md5(data).hexdigest()):
    tracemalloc.start();self.assertTrue(server.model_ready());_,peak=tracemalloc.get_traced_memory();tracemalloc.stop();self.assertLess(peak,512*1024)
    path.write_bytes(b'bad');self.assertFalse(server.model_ready())
 def test_multipart_export_supports_two_backgrounds_times_all_presets(self):
  files=[('files',(f'背景{i+1}/size{j+1}.png',self.png(),'image/png')) for i in range(2) for j in range(38)]
  files += [('files',(f'背景{i+1}/overview.png',self.png(),'image/png')) for i in range(2)]
  r=self.client.post('/api/archive',files=files);self.assertEqual(r.status_code,200,r.text[:100] if r.status_code!=200 else '')
  with zipfile.ZipFile(io.BytesIO(r.content)) as z:self.assertEqual(len(z.namelist()),78);self.assertIn('背景2/size38.png',z.namelist())
 def test_multipart_export_rejects_paths_duplicates_and_corrupt_files(self):
  for files in [[('files',('../bad.png',self.png(),'image/png'))],[('files',('ok.png',self.png(),'image/png'))]*2,[('files',('bad.png',b'bad','image/png'))]]:
   r=self.client.post('/api/archive',files=files);self.assertEqual(r.status_code,400)
if __name__=='__main__':unittest.main()
