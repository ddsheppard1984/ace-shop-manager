import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE=Path(__file__).resolve().parent.parent/'tools'/'motortrack_sqlite_export.py'
spec=importlib.util.spec_from_file_location('mt_export',MODULE)
exporter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

class ExportTest(unittest.TestCase):
    def test_read_only_export(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'snapshot.db'
            with sqlite3.connect(p) as c:
                c.execute('CREATE TABLE delivery_slips(id INTEGER PRIMARY KEY,motor_description TEXT,customer TEXT,driver TEXT)')
                c.execute("INSERT INTO delivery_slips(motor_description,customer,driver) VALUES('High voltage motor','Industrial Co','Dan')")
                c.execute('CREATE TABLE api_tokens(id TEXT, token TEXT)')
                c.execute("INSERT INTO api_tokens VALUES('secret','do-not-export')")
            exported=exporter.export(p)
            self.assertEqual(len(exported['records']),1)
            self.assertEqual(exported['records'][0]['motor_description'],'High voltage motor')
            self.assertNotIn('do-not-export',json.dumps(exported))
            self.assertEqual(exported['tables']['delivery_slips'],1)

if __name__=='__main__':unittest.main()
