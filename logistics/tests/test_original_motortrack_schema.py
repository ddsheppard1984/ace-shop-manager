import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent / 'tools' / 'motortrack_sqlite_export.py'
spec = importlib.util.spec_from_file_location('mt_export_actual', MODULE)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

class ActualMotorTrackSchemaTest(unittest.TestCase):
    def test_original_deliveries_table_preserves_logistics_fields(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'motortrack-backup.db'
            with sqlite3.connect(p) as c:
                c.execute("""CREATE TABLE deliveries (
                  id INTEGER PRIMARY KEY, created_at TEXT, delivery_date TEXT,
                  customer TEXT, po_number TEXT, manufacturer TEXT, model TEXT,
                  serial_number TEXT, horsepower TEXT, rpm TEXT, voltage TEXT,
                  frame_size TEXT, quantity INTEGER, receiver TEXT, status TEXT,
                  notes TEXT, ocr_text TEXT, image_name TEXT)""")
                c.execute("""INSERT INTO deliveries VALUES
                  (7,'2026-10-30','2026-10-29','Example Motor Co','PO-123',
                   'Baldor','A500','SN-123','50','1750','460','324T',
                   2,'Dock Manager','Delivered','No issues','SENSITIVE OCR',
                   'original-slip.jpg')""")
            got = exporter.export(p)
            self.assertEqual(got['tables']['deliveries'], 1)
            row = got['records'][0]
            self.assertEqual(row['id'], 'deliveries:7')
            self.assertEqual(row['job_number'], 'PO-123')
            self.assertEqual(row['date'], '2026-10-29')
            self.assertEqual(row['status'], 'Delivered')
            self.assertEqual(row['motor_description'], 'Baldor A500')
            self.assertIn('HP: 50', row['notes'])
            self.assertIn('Receiver: Dock Manager', row['notes'])
            self.assertEqual(row['source_image_name'], 'original-slip.jpg')
            self.assertNotIn('SENSITIVE OCR', str(got))
            self.assertNotIn('image/jpeg', str(got))

if __name__ == '__main__':
    unittest.main()
