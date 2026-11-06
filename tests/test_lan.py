import os
import subprocess
import sys
import unittest


class LanTests(unittest.TestCase):
 def test_lan_host_and_origin_boundaries(self):
  code = '''from fastapi.testclient import TestClient
import server
with TestClient(server.app,base_url='http://192.168.1.3:8765') as c:
 assert c.get('/api/status').status_code==200
 assert c.get('/').status_code==200
 assert c.get('/api/status',headers={'host':'evil.test'}).status_code==400
 assert c.get('/api/status',headers={'host':'192.168.1.4'}).status_code==400
 assert c.post('/api/cutout',content=b'bad',headers={'origin':'https://evil.test'}).status_code==403
 assert c.post('/api/cutout',content=b'bad',headers={'origin':'http://192.168.1.3:8765'}).status_code==400
'''
  result=subprocess.run([sys.executable,'-c',code],env={**os.environ,'STUDIO_LAN_IP':'192.168.1.3'},capture_output=True,text=True)
  self.assertEqual(result.returncode,0,result.stderr)

 def test_launcher_loopback_and_lan_modes(self):
  import launcher
  self.assertEqual(launcher.configuration(False),('127.0.0.1','127.0.0.1'))
  self.assertEqual(launcher.configuration(True,'192.168.1.3'),('0.0.0.0','192.168.1.3'))
  for address in ['8.8.8.8','127.0.0.1','0.0.0.0','169.254.1.1','evil.test','::1']:
   with self.subTest(address=address),self.assertRaises(ValueError):launcher.configuration(True,address)

if __name__=='__main__':unittest.main()
