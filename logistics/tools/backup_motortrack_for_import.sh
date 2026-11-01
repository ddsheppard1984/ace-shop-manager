#!/usr/bin/env bash
# Non-destructive MotorTrack migration preflight: consistent SQLite snapshot,
# full slip-image copy, integrity checks and redacted count report.
# Does not stop, alter or delete the live MotorTrack service or import into ACE.
set -Eeuo pipefail
umask 077
ROOT=/srv/squeak-server/workspace/ace-logistics-20261030
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/srv/squeak-server/backups/ace-logistics/motortrack-$STAMP"
install -d -m 700 "$(dirname "$OUT")"
mkdir -m 700 "$OUT"
printf 'Backup directory: %s\n' "$OUT"
test -f "$ROOT/tools/motortrack_sqlite_export.py" || { echo 'Exporter unavailable'; exit 1; }
test "$(docker inspect --format '{{.State.Running}}' motortrack)" = true || { echo 'Original MotorTrack not running'; exit 1; }
docker exec motortrack python -c 'from pathlib import Path; assert Path("/app/data/motortrack.db").is_file()'
echo 'Creating consistent read-only snapshot (MotorTrack stays online)...'
docker exec -i motortrack python - > "$OUT/motortrack.db" <<'PY'
import os, shutil, sqlite3, sys, tempfile
source = sqlite3.connect('file:/app/data/motortrack.db?mode=ro',uri=True,timeout=30)
fd, path = tempfile.mkstemp(prefix='ace-snapshot-',suffix='.sqlite3')
os.close(fd)
try:
    dest = sqlite3.connect(path)
    source.backup(dest)
    dest.close()
    source.close()
    with open(path,'rb') as stream:
        shutil.copyfileobj(stream,sys.stdout.buffer,1024*1024)
finally:
    if os.path.exists(path): os.unlink(path)
PY
test -s "$OUT/motortrack.db"
echo 'Copying original delivery-slip images (no originals removed)...'
docker cp motortrack:/app/data/slips "$OUT/slips"
python3 "$ROOT/tools/motortrack_sqlite_export.py" "$OUT/motortrack.db" --output "$OUT/motortrack-import.json"
python3 - "$OUT" <<'PY'
import hashlib,json,sqlite3,sys
from pathlib import Path
folder=Path(sys.argv[1])
with sqlite3.connect(folder/'motortrack.db') as c:
    integrity=c.execute('PRAGMA integrity_check').fetchone()[0]
    if integrity != 'ok': raise RuntimeError('Snapshot database integrity FAILED')
    source_count=c.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0]
data=json.loads((folder/'motortrack-import.json').read_text())
mapped=data['tables'].get('deliveries',0)
if source_count != mapped: raise RuntimeError(f'Source count mismatch: source={source_count} mapped={mapped}')
slips=folder/'slips'
images=list(slips.iterdir()) if slips.exists() else []
images=[p for p in images if p.is_file() and not p.is_symlink()]
expected=[r.get('source_image_name') for r in data['records'] if r.get('source_image_name')]
missing=[name for name in expected if not (slips/name).is_file()]
report={'snapshot_integrity':integrity,'source_deliveries':source_count,
        'exported_deliveries':mapped,'total_exported_records':len(data['records']),
        'slip_images_copied':len(images),'expected_image_refs':len(expected),
        'missing_image_refs':len(missing),'migration_applied':False}
(folder/'preflight-report.json').write_text(json.dumps(report,indent=2)+'\n')
for filename in ('motortrack.db','motortrack-import.json','preflight-report.json'):
    p=folder/filename
    (folder/(filename+'.sha256')).write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+filename+'\n')
print(json.dumps(report,indent=2))
if missing: raise RuntimeError('Some referenced slip images are missing: DO NOT CUT OVER')
PY
find "$OUT" -type f -exec chmod 600 {} +
install -m 644 "$OUT/preflight-report.json" "$ROOT/MOTORTRACK_PREFLIGHT_LATEST.json"
echo 'SAFE SNAPSHOT VERIFIED. No production records have been imported or modified.'
echo "Results: $OUT/preflight-report.json"
