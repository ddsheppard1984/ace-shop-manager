import base64
import http.cookiejar
import importlib.util
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

class APITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        os.environ['ACE_DATA_DIR'] = cls.tmp.name
        os.environ['ACE_BOOTSTRAP_PASSWORD'] = 'test-admin-password-1234'
        spec = importlib.util.spec_from_file_location('ace_server',Path(__file__).resolve().parent.parent/'server.py')
        cls.app=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.app)
        cls.app.initialize()
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),cls.app.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()

    def setUp(self):
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def req(self,path,method='GET',obj=None,expect=200):
        data=json.dumps(obj).encode() if obj is not None else None
        r=urllib.request.Request(self.base+path,data=data,headers={'Content-Type':'application/json'} if data else {},method=method)
        try:
            with self.opener.open(r,timeout=5) as f: status=f.status;out=json.loads(f.read())
        except urllib.error.HTTPError as e:status=e.code;out=json.loads(e.read())
        self.assertEqual(status,expect,(path,out))
        return out

    def login(self):
        self.req('/api/login','POST',{'username':'admin','password':'test-admin-password-1234'})

    def test_01_health_and_auth(self):
        self.assertTrue(self.req('/healthz')['ok'])
        self.req('/api/shipments',expect=401)
        self.req('/api/login','POST',{'username':'admin','password':'bad'},expect=401)
        self.login();self.assertEqual(self.req('/api/me')['user']['role'],'admin')

    def test_02_dispatch_proof_damage_and_export(self):
        self.login()
        self.req('/api/shipments','POST',{'asset':''},expect=400)
        self.req('/api/shipments','POST',{'asset':'Motor','stage':'Delivered'},expect=400)
        self.req('/api/shipments','POST',{'asset':'Motor','damaged':True,'damage_description':'Damaged'},expect=400)
        created=self.req('/api/shipments','POST',{'asset':'700 lb electric motor','customer':'Acme','driver':'Driver 1'},expect=201)
        sid=created['id']
        self.req('/api/shipments/'+str(sid)+'/events','POST',{'stage':'Exception','damaged':True,'damage_description':'Cracked casing'},expect=400)
        png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/M6kAAAAASUVORK5CYII=')
        proof=self.req('/api/shipments/'+str(sid)+'/proofs','POST',{'kind':'photo','base64':base64.b64encode(png).decode()},expect=201)
        self.assertTrue(proof['id'])
        self.req('/api/shipments/'+str(sid)+'/events','POST',{'stage':'Exception','damaged':True,'damage_description':'Cracked casing'})
        self.assertTrue(self.req('/api/shipments')['shipments'][0]['damaged'])
        self.assertTrue(self.req('/api/export')['shipments'])
        self.req('/api/shipments/'+str(sid),'PATCH',{'stage':'Delivered'},expect=400)
        self.req('/api/shipments/'+str(sid),'PATCH',{'asset':'Rebuilt electric motor'})
        self.assertEqual(self.req('/api/shipments')['shipments'][0]['asset'],'Rebuilt electric motor')

    def test_03_import_idempotency_ifta(self):
        self.login()
        imp={'customers':[{'name':'Mill'}],'jobs':[{'id':'J10','customer':'Mill','type':'Motor'}],'deliveries':[{'id':'D10','customer':'Mill','description':'Motor pickup'}]}
        r=self.req('/api/import/ace','POST',{'data':imp});self.assertEqual(r['imported']['jobs'],1)
        r=self.req('/api/import/ace','POST',{'data':imp});self.assertEqual(r['imported']['jobs'],0)
        motor={'records':[{'id':'T-1','motor_description':'Pump motor'}]}
        self.assertEqual(self.req('/api/import/motortrack','POST',motor)['imported'],1)
        self.assertEqual(self.req('/api/import/motortrack','POST',motor)['skipped'],1)
        entry={'driver':'Dan','date':'2026-10-30','truck':'T1','start_odometer':100,'end_odometer':140,'state_miles':{'ME':30,'NH':10},'state_gallons':{'ME':5,'NH':2}}
        self.req('/api/ifta','POST',entry,expect=201)
        self.assertEqual(self.req('/api/ifta')['entries'][0]['total_miles'],40)
        entry['state_miles']['ME']=31
        self.req('/api/ifta','POST',entry,expect=400)

    def test_04_driver_permissions(self):
        self.login()
        self.req('/api/users','POST',{'username':'driver-test','role':'driver','password':'driver-password-1234'},expect=201)
        self.req('/api/logout','POST',{})
        self.req('/api/login','POST',{'username':'driver-test','password':'driver-password-1234'})
        self.req('/api/shipments','POST',{'asset':'Motor'},expect=403)
        self.req('/api/import/ace','POST',{'data':{}},expect=403)
        self.req('/api/export',expect=403)

if __name__=='__main__':unittest.main()
