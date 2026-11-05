import io,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from PIL import Image
import server

class DownloadAccessTests(unittest.TestCase):
 def test_native_download_retry_and_access_boundaries(self):
  with tempfile.TemporaryDirectory() as root,patch.object(server,'ROOT',Path(root)),TestClient(server.app,base_url='http://127.0.0.1:8765') as client:
   token=client.post('/api/archives',json={'expectedFiles':1}).json()['token'];base=f'/api/archives/{token}'
   native={'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'empty'}
   self.assertEqual(client.get(base+'/download',headers=native).status_code,409)
   data=io.BytesIO();Image.new('RGB',(1,1),'red').save(data,format='PNG');image=data.getvalue()
   client.post(base+'/parts/0',files=[('files',('test.png',image,'image/png'))]);url=client.post(base+'/finish').json()['downloadUrl']
   result=client.get(url,headers=native);self.assertEqual(result.status_code,200);self.assertEqual(result.headers['content-type'],'application/zip');self.assertEqual(zipfile.ZipFile(io.BytesIO(result.content)).read('test.png'),image)
   self.assertEqual(client.head(url,headers=native).status_code,200)
   self.assertEqual(client.get(url,headers={**native,'range':'bytes=0-19'}).status_code,206)
   for headers in [{**native,'origin':'https://evil.test'},{**native,'origin':'null'},{**native,'origin':''},{**native,'sec-fetch-mode':'cors'},{**native,'sec-fetch-dest':'document'},{'sec-fetch-site':'cross-site'}]:
    self.assertEqual(client.get(url,headers=headers).status_code,403,headers)
   for method,path in [('GET','/api/drafts'),('POST','/api/archives'),('DELETE',base),('POST',base+'/finish')]:
    self.assertEqual(client.request(method,path,headers=native).status_code,403)
   self.assertEqual(client.get('/api/archives/'+'A'*43+'/download',headers=native).status_code,404)
   for path in [url+'/',base+'/download-extra','/api/archives/short/download']:
    self.assertEqual(client.get(path,headers=native).status_code,403)
   self.assertEqual(client.get(url).status_code,200)
   job=server.app.state.archives.lookup(token);job.updated=0;server.app.state.archives.cleanup();self.assertEqual(client.get(url,headers=native).status_code,404)
   client.delete(base);self.assertEqual(client.get(url,headers=native).status_code,404)
if __name__=='__main__':unittest.main()
