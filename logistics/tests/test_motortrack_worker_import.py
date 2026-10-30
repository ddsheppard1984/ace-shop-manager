import base64
import hashlib
import importlib.util
import io
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
SPEC=importlib.util.spec_from_file_location('motortrack_worker_migrate',ROOT/'tools'/'import_motortrack_to_worker.py')
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

def sample_packet():
    records={'source':'motortrack-sqlite-snapshot','records':[
        {'id':'deliveries:1','motor_description':'Baldor motor','job_number':'PO-100','customer':'Example Co','status':'Delivered','source_image_name':'a.jpg'},
        {'id':'deliveries:2','motor_description':'GE motor','status':'Picked Up','source_image_name':'b.jpg'}
    ]}
    image=b'\xff\xd8\xff'+b'fake-jpeg-bytes'
    b=io.BytesIO()
    with zipfile.ZipFile(b,'w') as z:
        z.writestr('records.json',json.dumps(records))
        for name in ('a.jpg','b.jpg','other1.jpg','other2.jpg'):
            z.writestr('slips/'+name,image)
    return b.getvalue()

class SafeMigrationTest(unittest.TestCase):
    def test_additive_and_repeat_safe_import_with_all_images(self):
        with tempfile.TemporaryDirectory() as d:
            env=os.environ.copy()
            env['ACE_DATA_DIR']=d
            subprocess.run([sys.executable,'-c','import server;server.initialize()'],cwd=ROOT,env=env,check=True,capture_output=True)
            for run in range(2):
                res=subprocess.run([sys.executable,'-c',M.CONTAINER_IMPORTER],
                    input=sample_packet(),capture_output=True,cwd=ROOT,env=env,timeout=15)
                self.assertEqual(res.returncode,0,res.stderr.decode(errors='replace'))
                outcome=json.loads(res.stdout.decode().strip().splitlines()[-1])
                self.assertEqual(outcome['source_records'],2)
                self.assertEqual(outcome['source_images_archived'],4)
                self.assertEqual(outcome['imported'],2 if run==0 else 0)
                self.assertEqual(outcome['already_present'],0 if run==0 else 2)
                self.assertEqual(outcome['proofs_added'],2 if run==0 else 0)
            with sqlite3.connect(Path(d)/'logistics.sqlite3') as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM shipments").fetchone()[0],2)
                self.assertEqual(c.execute("SELECT COUNT(*) FROM proofs").fetchone()[0],2)
                self.assertEqual(c.execute("SELECT stage FROM shipments WHERE external_ref='motortrack:deliveries:2'").fetchone()[0],'Picked Up')
            self.assertEqual(len(list((Path(d)/'motortrack-archive').rglob('*.jpg'))),4)

    def test_reject_missing_slip_before_db_change(self):
        p=sample_packet()
        source=io.BytesIO(p)
        altered=io.BytesIO()
        with zipfile.ZipFile(source) as old,zipfile.ZipFile(altered,'w') as z:
            for name in old.namelist():
                if name!='slips/b.jpg':z.writestr(name,old.read(name))
        with tempfile.TemporaryDirectory() as d:
            env=os.environ.copy();env['ACE_DATA_DIR']=d
            subprocess.run([sys.executable,'-c','import server;server.initialize()'],cwd=ROOT,env=env,check=True,capture_output=True)
            res=subprocess.run([sys.executable,'-c',M.CONTAINER_IMPORTER],
                input=altered.getvalue(),capture_output=True,cwd=ROOT,env=env,timeout=15)
            self.assertNotEqual(res.returncode,0)
            with sqlite3.connect(Path(d)/'logistics.sqlite3') as c:
                self.assertEqual(c.execute('SELECT COUNT(*) FROM shipments').fetchone()[0],0)

if __name__=='__main__': unittest.main()
