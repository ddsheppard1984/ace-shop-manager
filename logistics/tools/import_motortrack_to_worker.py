#!/usr/bin/env python3
"""Guarded, repeat-safe MotorTrack snapshot import to private Lenovo ACE Logistics.

Must run as: sudo python3 tools/import_motortrack_to_worker.py
Reads only the verified snapshot, preserves all originals, backs up ACE first.
Transport uses existing pinned Tailscale SSH trust for the invoking sudo user.
"""
import getpass
import hashlib
import io
import json
import os
import shlex
import sqlite3
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ARCHIVE_ROOT = Path('/srv/squeak-server/backups/ace-logistics')
WORKER = 'dan@100.92.112.26'
IP = '100.92.112.26'
CONTAINER = 'ace-logistics'
MAX_ARCHIVE = 100 * 1024 * 1024

# Run in the already-deployed ACE container as its unprivileged ace user.
# Input is a ZIP containing JSON and flat slip-image files. No login tokens
# are printed or transported; SQLite writes use the application's schema.
CONTAINER_IMPORTER = r'''
import hashlib, io, json, os, re, secrets, sqlite3, sys, uuid, zipfile
from pathlib import Path
import server

raw=sys.stdin.buffer.read(100*1024*1024+1)
if len(raw)>100*1024*1024: raise RuntimeError('Import archive exceeds limit')
z=zipfile.ZipFile(io.BytesIO(raw))
names=z.namelist()
if names.count('records.json')!=1: raise RuntimeError('Missing records.json')
payload=json.loads(z.read('records.json'))
records=payload.get('records')
if not isinstance(records,list) or len(records)>10000: raise RuntimeError('Invalid record count')
expected=payload.get('source','')
if expected!='motortrack-sqlite-snapshot': raise RuntimeError('Unrecognized source')
images={}
for item in names:
    if not item.startswith('slips/'): continue
    name=item.split('/',1)[1]
    if not name or '/' in name or '\\' in name or name in ('.','..') or name in images:
        raise RuntimeError('Unsafe image name')
    binary=z.read(item)
    if len(binary)>6*1024*1024 or not binary: raise RuntimeError('Slip image too large or empty')
    if not (binary.startswith(b'\xff\xd8\xff') or binary.startswith(b'\x89PNG\r\n\x1a\n')):
        raise RuntimeError('Unrecognized image encoding')
    images[name]=binary
sourceids=set()
for row in records:
    if not isinstance(row,dict): raise RuntimeError('Invalid row')
    ref=str(row.get('id','')).strip()
    if not ref or len(ref)>75 or ref in sourceids: raise RuntimeError('Invalid or duplicate source reference')
    sourceids.add(ref)
    filename=str(row.get('source_image_name') or '')
    if filename and filename not in images: raise RuntimeError('Referenced image missing')
if not server.DB.is_file(): raise RuntimeError('ACE database missing')
server.initialize()
archive_dir=server.DATA/'motortrack-archive'/hashlib.sha256(raw).hexdigest()[:18]
archive_dir.mkdir(parents=True,exist_ok=True,mode=0o700)
archive_dir.chmod(0o700)
for name,blob in images.items():
    dest=archive_dir/name
    if dest.exists():
        if hashlib.sha256(dest.read_bytes()).digest()!=hashlib.sha256(blob).digest():
            raise RuntimeError('Existing image archive checksum mismatch')
    else:
        with dest.open('xb') as stream: stream.write(blob)
        dest.chmod(0o600)
inserted=skipped=proofs=0
with server.db() as c:
    for row in records:
        ref=str(row['id']).strip()
        ext='motortrack:'+ref
        existing=c.execute('SELECT id FROM shipments WHERE external_ref=?',(ext,)).fetchone()
        if existing:
            sid=existing['id']
            skipped+=1
        else:
            originalstage=str(row.get('status') or 'Scheduled')
            stage=originalstage if originalstage in server.STAGES else 'Scheduled'
            fields=(ext,'MT-'+ref,
                server.clean(row.get('job_number'),80),
                server.clean(row.get('customer'),180),
                server.clean(row.get('motor_description') or row.get('asset') or 'Motor/equipment',240),
                server.clean(row.get('serial_number'),120),
                server.clean(row.get('pickup_address'),500),
                server.clean(row.get('delivery_address'),500),
                server.clean(row.get('date'),32),
                server.clean(row.get('driver'),120),
                stage,server.clean(row.get('notes'),2000),server.utc(),server.utc())
            c.execute('INSERT INTO shipments(external_ref,reference,job_number,customer,'
                      'asset,serial_number,pickup_address,delivery_address,scheduled_date,driver,'
                      'stage,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',fields)
            sid=c.execute('SELECT last_insert_rowid()').fetchone()[0]
            c.execute('INSERT INTO events(shipment_id,stage,note,actor,created_at) VALUES(?,?,?,?,?)',
                (sid,stage,'Imported original MotorTrack record','migration',server.utc()))
            inserted+=1
        filename=str(row.get('source_image_name') or '')
        if filename:
            old=c.execute("SELECT 1 FROM proofs WHERE shipment_id=? AND note='Original MotorTrack slip'",(sid,)).fetchone()
            if not old:
                raw_image=images[filename]
                suffix='.png' if raw_image.startswith(b'\x89PNG') else '.jpg'
                uid=str(uuid.uuid4())
                dst=server.PROOFS/(uid+suffix)
                with dst.open('xb') as stream: stream.write(raw_image)
                dst.chmod(0o600)
                c.execute('INSERT INTO proofs(id,shipment_id,kind,filename,note,actor,created_at) VALUES(?,?,?,?,?,?,?)',
                    (uid,sid,'photo',uid+suffix,'Original MotorTrack slip','migration',server.utc()))
                proofs+=1
    server.audit(c,'import-motortrack-snapshot','MotorTrack','migration',
        'imported='+str(inserted)+' skipped='+str(skipped)+' image_proofs='+str(proofs))
with server.db() as c:
    confirmed=c.execute("SELECT COUNT(*) FROM shipments WHERE external_ref LIKE 'motortrack:%'").fetchone()[0]
    referenced=c.execute("SELECT COUNT(*) FROM proofs WHERE actor='migration' AND note='Original MotorTrack slip'").fetchone()[0]
    integrity=c.execute('PRAGMA integrity_check').fetchone()[0]
if integrity!='ok' or confirmed<len(sourceids): raise RuntimeError('Post-import database integrity/count failure')
print(json.dumps({'ok':True,'imported':inserted,'already_present':skipped,
    'source_records':len(records),'source_images_archived':len(images),
    'proofs_added':proofs,'migration_proofs_total':referenced,
    'matching_motortrack_records':confirmed,'db_integrity':integrity}))
'''

def verified_archive(folder):
    if not folder.is_dir() or folder.is_symlink() or folder.resolve().parent!=ARCHIVE_ROOT:
        raise ValueError('Snapshot directory must be under approved ACE backup root')
    report=json.loads((folder/'preflight-report.json').read_text())
    if report.get('snapshot_integrity')!='ok' or report.get('missing_image_refs')!=0:
        raise ValueError('Snapshot integrity preflight failed')
    if report.get('source_deliveries')!=report.get('exported_deliveries'):
        raise ValueError('Snapshot row counts disagree')
    for name in ('motortrack.db','motortrack-import.json','preflight-report.json'):
        expected=(folder/(name+'.sha256')).read_text().split()[0]
        actual=hashlib.sha256((folder/name).read_bytes()).hexdigest()
        if expected!=actual: raise ValueError('Snapshot checksum mismatch: '+name)
    con=sqlite3.connect('file:'+str((folder/'motortrack.db').resolve())+'?mode=ro&immutable=1',uri=True)
    try:
        integrity=con.execute('PRAGMA integrity_check').fetchone()[0]
        count=con.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0]
    finally: con.close()
    if integrity!='ok' or count!=report['source_deliveries']: raise ValueError('Snapshot changed')
    data=json.loads((folder/'motortrack-import.json').read_text())
    if data.get('source')!='motortrack-sqlite-snapshot' or len(data.get('records',[]))!=count:
        raise ValueError('Exported record count mismatch')
    slips=folder/'slips'
    if not slips.is_dir(): raise ValueError('Slip archive missing')
    image_paths={}
    for p in slips.iterdir():
        if not p.is_file() or p.is_symlink() or p.name in ('','.', '..'):
            raise ValueError('Unexpected slip path')
        if p.stat().st_size>6*1024*1024: raise ValueError('Oversized slip')
        image_paths[p.name]=p
    if len(image_paths)!=report['slip_images_copied']: raise ValueError('Image count changed')
    for record in data['records']:
        name=record.get('source_image_name')
        if name and name not in image_paths: raise ValueError('Missing referenced slip image')
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
        z.write(folder/'motortrack-import.json','records.json')
        for name,path in image_paths.items():z.write(path,'slips/'+name)
    if stream.tell()>MAX_ARCHIVE: raise ValueError('Transfer size exceeded')
    return stream.getvalue(),len(data['records']),len(image_paths)

def worker_command(command, data=None):
    ssh=['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
         '-o','ConnectTimeout=12',WORKER,shlex.join(command)]
    caller=os.environ.get('SUDO_USER')
    if os.geteuid()==0:
        if not caller or caller=='root': raise RuntimeError('Run with sudo from your Squeak user')
        ssh=['sudo','-n','-u',caller,'-H']+ssh
    result=subprocess.run(ssh,input=data,capture_output=True,timeout=90)
    if result.returncode:
        raise RuntimeError('Worker operation failed: '+result.stderr.decode(errors='replace')[-700:])
    return result.stdout.decode(errors='replace').strip()

def main():
    if os.geteuid()!=0: raise RuntimeError('Run with sudo for access to private backup')
    selected=Path(sys.argv[1]) if len(sys.argv)==2 else max(
        ARCHIVE_ROOT.glob('motortrack-*/'),key=lambda p:p.stat().st_mtime)
    packet,count,images=verified_archive(selected)
    print(json.dumps({'verified_source_records':count,'verified_slip_images':images,'worker':IP}))
    status=worker_command(['docker','inspect','--format','{{.State.Health.Status}}',CONTAINER])
    if status!='healthy': raise RuntimeError('ACE worker is not healthy')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup_name='motortrack-before-'+stamp+'.sqlite3'
    backupcode=("import sqlite3; a=sqlite3.connect('/app/data/logistics.sqlite3'); "
                f"b=sqlite3.connect('/app/data/{backup_name}'); a.backup(b); b.close(); a.close(); "
                f"assert sqlite3.connect('/app/data/{backup_name}').execute('PRAGMA integrity_check').fetchone()[0]=='ok'")
    worker_command(['docker','exec',CONTAINER,'python','-c',backupcode])
    host_backup='$HOME/apps/backups/ace-logistics/'+stamp+'/pre-import.sqlite3'
    validate='import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); assert c.execute("PRAGMA integrity_check").fetchone()[0]=="ok"; c.close()'
    backup_shell=('mkdir -p "$HOME/apps/backups/ace-logistics/'+stamp+'" && '
                  'docker cp '+shlex.quote(CONTAINER+':/app/data/'+backup_name)+' '
                  '"'+host_backup+'" && '
                  'python3 -c '+shlex.quote(validate)+' "'+host_backup+'"')
    worker_command(['bash','-c',backup_shell])
    print('Verified backup copied to Lenovo host before migration.')
    output=worker_command(['docker','exec','-i',CONTAINER,'python','-c',CONTAINER_IMPORTER],packet)
    report=json.loads(output.splitlines()[-1])
    if report.get('ok') is not True or report.get('source_records')!=count:
        raise RuntimeError('Unexpected worker import result')
    if report.get('imported',0)+report.get('already_present',0)!=count:
        raise RuntimeError('Worker import count mismatch')
    print(json.dumps(report,indent=2))
    print('Original MotorTrack database and slip images were not modified.')

if __name__=='__main__':
    try:main()
    except Exception as e:print('MIGRATION STOPPED SAFELY:',str(e),file=sys.stderr);sys.exit(1)
