#!/usr/bin/env python3
"""Read-only exporter of a consistent MotorTrack SQLite SNAPSHOT.

Use sqlite3.Connection.backup() or an offline copy to make the snapshot first.
The live MotorTrack service and database must never be modified by this tool.
This intentionally exports no image bytes, OCR text, tokens or credentials.
"""
import argparse
import json
import sqlite3
from pathlib import Path
from urllib.parse import quote

CANDIDATES = (
    'deliveries', 'delivery_slips', 'motor_slips', 'pickup_slips', 'slips',
    'motortrack', 'shipments', 'motors', 'records', 'jobs'
)
ALIASES = {
    'id': ('id', 'slip_number', 'slip_no', 'ticket', 'ticket_number', 'reference', 'number', 'job_id'),
    'motor_description': ('motor_description', 'motor', 'description', 'equipment_description', 'asset', 'equipment', 'motor_type', 'item_description'),
    'job_number': ('job_number', 'po_number', 'job', 'job_no', 'work_order'),
    'customer': ('customer', 'customer_name', 'company', 'client'),
    'serial_number': ('serial_number', 'serial', 'serial_no'),
    'pickup_address': ('pickup_address', 'pickup_location', 'origin', 'pickup'),
    'delivery_address': ('delivery_address', 'delivery_location', 'destination', 'dropoff'),
    'date': ('date', 'delivery_date', 'pickup_date', 'created_at'),
    'driver': ('driver', 'driver_name'),
    'notes': ('notes', 'remarks', 'comments'),
    'status': ('status', 'stage'),
}
DETAIL_KEYS = (
    ('Manufacturer', 'manufacturer'), ('Model', 'model'),
    ('HP', 'horsepower'), ('RPM', 'rpm'), ('Voltage', 'voltage'),
    ('Frame', 'frame_size'), ('Quantity', 'quantity'),
    ('Receiver', 'receiver')
)
STATUS_MAP = {
    'delivered': 'Delivered', 'picked up': 'Picked Up',
    'in shop': 'At Shop', 'returned': 'Delivered',
    'completed': 'Delivered', 'scheduled': 'Scheduled',
    'dispatched': 'Dispatched'
}

def export(snapshot):
    if not snapshot.is_file() or snapshot.stat().st_size == 0:
        raise ValueError('Snapshot does not exist or is empty')
    conn = sqlite3.connect(f'file:{quote(str(snapshot.resolve()))}?mode=ro&immutable=1', uri=True)
    conn.row_factory = sqlite3.Row
    result = {'records': [], 'source': 'motortrack-sqlite-snapshot', 'tables': {}}
    seen = set()
    try:
        tables = {x[0] for x in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )}
        for table in CANDIDATES:
            if table not in tables:
                continue
            cols = {x[1] for x in conn.execute('PRAGMA table_info("'+table+'")')}
            if not cols:
                continue
            count = 0
            for r in conn.execute('SELECT * FROM "'+table+'" LIMIT 100000'):
                raw = dict(r)
                mapped = {}
                for output, keys in ALIASES.items():
                    for key in keys:
                        if key in raw and raw[key] not in (None, ''):
                            mapped[output] = str(raw[key])[:2000]
                            break
                if not mapped.get('id'):
                    continue
                source_id = table + ':' + mapped['id']
                if source_id in seen:
                    continue
                seen.add(source_id)
                mapped['id'] = source_id
                if not mapped.get('motor_description'):
                    parts = [str(raw.get(k) or '').strip() for k in ('manufacturer','model')]
                    name = ' '.join(p for p in parts if p)
                    mapped['motor_description'] = name or 'Motor / equipment'
                details = ['{}: {}'.format(label, str(raw[key])[:120]) for label,key in DETAIL_KEYS
                           if raw.get(key) not in (None, '')]
                prior_notes = mapped.get('notes','')
                if details:
                    mapped['notes'] = (prior_notes + (' | ' if prior_notes else '') +
                                       ' | '.join(details))[:2000]
                raw_status = mapped.get('status','').strip().lower()
                mapped['status'] = STATUS_MAP.get(raw_status, 'Scheduled')
                if raw.get('image_name'):
                    # A relative image reference only. Images stay safely in MotorTrack.
                    mapped['source_image_name'] = Path(str(raw['image_name'])).name[:200]
                result['records'].append(mapped)
                count += 1
            result['tables'][table] = count
    finally:
        conn.close()
    return result

if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('snapshot', type=Path, help='Offline consistent COPY of MotorTrack SQLite DB')
    cli.add_argument('--output', type=Path, required=True)
    args = cli.parse_args()
    data = export(args.snapshot)
    args.output.write_text(json.dumps(data, indent=2))
    print(f"Exported {len(data['records'])} MotorTrack records from {len(data['tables'])} candidate tables")
