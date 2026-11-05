import io, unittest
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient
import server

class CompressionTests(unittest.TestCase):
 def setUp(self):self.client=TestClient(server.app,base_url='http://127.0.0.1:8765')
 def png(self):
  im=Image.new('RGBA',(256,128));im.putdata([(x%256,y%256,(x+y)%256,0 if x<10 else 128) for y in range(128) for x in range(256)])
  out=io.BytesIO();im.save(out,format='PNG',compress_level=0);return out.getvalue()
 def test_compresses_preserving_size_and_transparency(self):
  source=self.png();r=self.client.post('/api/compress-png',content=source);self.assertEqual(r.status_code,200,r.text[:100] if r.status_code!=200 else '')
  self.assertLess(len(r.content),len(source));im=Image.open(io.BytesIO(r.content)).convert('RGBA');self.assertEqual(im.size,(256,128));self.assertEqual(im.getpixel((0,0))[3],0);self.assertAlmostEqual(im.getpixel((120,60))[3],128,delta=8)
 def test_rejects_invalid_image_and_jpeg(self):
  out=io.BytesIO();Image.new('RGB',(24,24)).save(out,format='JPEG')
  for data in (b'bad',out.getvalue()):self.assertEqual(self.client.post('/api/compress-png',content=data).status_code,400)
 def test_missing_tool_is_explicit(self):
  with patch('shutil.which',return_value=None):self.assertEqual(self.client.post('/api/compress-png',content=self.png()).status_code,503)

 def test_tool_failures_never_return_uncompressed_success(self):
  import subprocess
  for code,status in ((99,422),(1,500)):
   with patch('subprocess.run',return_value=subprocess.CompletedProcess([],code,b'',b'failed')):
    self.assertEqual(self.client.post('/api/compress-png',content=self.png()).status_code,status)
  with patch('subprocess.run',side_effect=subprocess.TimeoutExpired('pngquant',60)):
   self.assertEqual(self.client.post('/api/compress-png',content=self.png()).status_code,504)

 def test_already_small_gradient_never_grows(self):
  im=Image.new('RGBA',(256,128));im.putdata([(x,y,(x+y)%256,x) for y in range(128) for x in range(256)])
  out=io.BytesIO();im.save(out,format='PNG');source=out.getvalue()
  r=self.client.post('/api/compress-png',content=source);self.assertEqual(r.status_code,200);self.assertEqual(r.content,source)
