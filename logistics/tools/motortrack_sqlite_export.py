#!/usr/bin/env python3
"""Read-only MotorTrack SQLite *snapshot* exporter for ACE Logistics.

Never point at an active MotorTrack database; create a consistent backup/snapshot first.
No changes are made to the source database or current motortrack service.
"""
import argparse
import json
import sqlite3
from pathlib import Path
from urllib.parse import quote

CANDIDATES = ('delivery_slips', 'motor_slips', 'pickup_slips', 'slips', 'deliveries', 'motortrack', 'shipments', 'motors', 'records', 'jobs')
ALIASES = {
    'id': ('id', 'slip_number', 'slip_no', 'ticket', 'ticket_number', 'reference', 'number', 'job_id'),
    'motor_description': ('motor_description', 'motor', 'description', 'equipment_description', 'asset', 'equipment', 'motor_type', 'item_description'),
    'job_number': ('job_number', 'job', 'job_no', 'work_order'),
    'customer': ('customer', 'customer_name', 'company', 'client'),
    'serial_number': ('serial_number', 'serial', 'serial_no'),
    'pickup_address': ('pickup_address', 'pickup_location', 'origin', 'pickup'),
    'delivery_address': ('delivery_address', 'delivery_location', 'destination', 'dropoff'),
    'date': ('date', 'pickup_date', 'delivery_date', 'created_at'),
    'driver': ('driver', 'driver_name'),
    'notes': ('notes', 'remarks', 'comments'),
}


def export(snapshot):
    if not snapshot.is_file() or snapshot.stat().st_size == 0:
        raise ValueError('Snapshot does not exist or is empty')
    conn = sqlite3.connect(f'file:{quote(str(snapshot.resolve()))}?mode=ro&immutable=1', uri=True)
    conn.row_factory = sqlite3.Row
    result = {'records': [], 'source': 'motortrack-sqlite-snapshot', 'tables': {}}
    seen=set()
    try:
        tables = {x[0] for x in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        for table in CANDIDATES:
            if table not in tables:
                continue
            cols={x[1] for x in conn.execute('PRAGMA table_info("'+table+'")')}
            if not cols:
                continue
            count=0
            for r in conn.execute('SELECT * FROM "'+table+'" LIMIT 100000'):
                raw=dict(r)
                mapped={}
                for output, keys in ALIASES.items():
                    for key in keys:
                        if key in raw and raw[key] not in (None,''):
                            mapped[output]=str(raw[key])[:2000]
                            break
                if not mapped.get('id'):
                    continue
                source_id=table+':'+mapped['id']
                if source_id in seen:
                    continue
                seen.add(source_id)
                mapped['id']=source_id
                mapped['motor_description']=mapped.get('motor_description') or 'Motor / equipment'
                result['records'].append(mapped)
                count+=1
            result['tables'][table]=count
    finally:
        conn.close()
    return result


if __name__=='__main__':
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('snapshot',type=Path,help='Readonly COPY of MotorTrack SQLite database, not the live file')
    cli.add_argument('--output',type=Path,required=True)
    a=cli.parse_args()
    data=export(a.snapshot)
    a.output.write_text(json.dumps(data,indent=2))
    print(f'Exported {len(data["records"])} MotorTrack records from {len(data["tables"])} candidate tables')
