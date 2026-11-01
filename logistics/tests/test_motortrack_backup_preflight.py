import subprocess
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parent.parent/'tools'/'backup_motortrack_for_import.sh'

class MigrationPreflightScriptTest(unittest.TestCase):
    def test_shell_syntax(self):
        result=subprocess.run(['bash','-n',str(SCRIPT)],capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_preserves_origins_and_reports_redacted_counts(self):
        text=SCRIPT.read_text()
        self.assertIn('source.backup(dest)',text)
        self.assertIn('docker cp motortrack:/app/data/slips',text)
        self.assertIn('PRAGMA integrity_check',text)
        self.assertIn('migration_applied\':False',text)
        self.assertIn('MOTORTRACK_PREFLIGHT_LATEST.json',text)

if __name__=='__main__': unittest.main()
