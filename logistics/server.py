#!/usr/bin/env python3
"""ACE Logistics: private, SQLite-backed motor movement and dispatch console."""
import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

BASE = Path(__file__).resolve().parent
DATA = Path(os.environ.get('ACE_DATA_DIR', str(BASE / 'data')))
STATIC = BASE / 'static'
DB = DATA / 'logistics.sqlite3'
PROOFS = DATA / 'proof'
MAX_BODY = 9 * 1024 * 1024
STAGES = ('Scheduled', 'Dispatched', 'En Route Pickup', 'Picked Up', 'At Shop', 'Ready for Delivery', 'Out for Delivery', 'Delivered', 'Exception')
ROLES = ('admin', 'dispatcher', 'driver', 'viewer')
WRITE_ROLES = ('admin', 'dispatcher')
_LOCK = threading.Lock()


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


@contextmanager
def db():
    conn = sqlite3.connect(DB, timeout=15)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA busy_timeout=15000')
        conn.execute('PRAGMA foreign_keys=ON')
        with conn:
            yield conn
    finally:
        conn.close()


def passhash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 390000).hex()
    return salt + ':' + digest


def verify(password, encoded):
    try:
        salt, digest = encoded.split(':', 1)
        return hmac.compare_digest(passhash(password, salt).split(':')[1], digest)
    except (ValueError, TypeError):
        return False


def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    PROOFS.mkdir(parents=True, exist_ok=True)
    os.chmod(DATA, 0o700)
    os.chmod(PROOFS, 0o700)
    with db() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS shipments (
          id INTEGER PRIMARY KEY, reference TEXT NOT NULL UNIQUE, external_ref TEXT UNIQUE,
          job_number TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '',
          asset TEXT NOT NULL, serial_number TEXT NOT NULL DEFAULT '', weight_lbs REAL,
          pickup_address TEXT NOT NULL DEFAULT '', delivery_address TEXT NOT NULL DEFAULT '',
          scheduled_date TEXT NOT NULL DEFAULT '', driver TEXT NOT NULL DEFAULT '', truck TEXT NOT NULL DEFAULT '',
          stage TEXT NOT NULL DEFAULT 'Scheduled', priority TEXT NOT NULL DEFAULT 'Normal',
          damaged INTEGER NOT NULL DEFAULT 0, damage_description TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, shipment_id INTEGER NOT NULL REFERENCES shipments(id), stage TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS proofs (id TEXT PRIMARY KEY, shipment_id INTEGER NOT NULL REFERENCES shipments(id), kind TEXT NOT NULL, filename TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS customers (name TEXT PRIMARY KEY, contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ifta (id INTEGER PRIMARY KEY, driver TEXT NOT NULL, date TEXT NOT NULL, truck TEXT NOT NULL, start_odometer REAL NOT NULL, end_odometer REAL NOT NULL, total_miles REAL NOT NULL, state_miles TEXT NOT NULL, state_gallons TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, action TEXT NOT NULL, entity TEXT NOT NULL, actor TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_shipments_stage ON shipments(stage,scheduled_date);
        CREATE INDEX IF NOT EXISTS idx_events_shipment ON events(shipment_id,created_at);
        ''')
        if not c.execute('SELECT 1 FROM users LIMIT 1').fetchone():
            pw = os.environ.get('ACE_BOOTSTRAP_PASSWORD', '')
            if len(pw) < 12:
                pw = secrets.token_urlsafe(24)
                p = DATA / 'initial-admin-password'
                p.write_text(pw + '\n')
                p.chmod(0o600)
                print('Initial admin password stored at ' + str(p), flush=True)
            c.execute('INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)', ('admin', passhash(pw), 'admin', utc()))
        c.execute('DELETE FROM sessions WHERE expires_at < ?', (utc(),))


def asdict(row):
    return dict(row) if row is not None else None


def audit(c, action, entity, actor, details=''):
    c.execute('INSERT INTO audit(action,entity,actor,details,created_at) VALUES(?,?,?,?,?)', (action, entity, actor, details[:500], utc()))


def clean(value, n=250):
    return str(value if value is not None else '').strip()[:n]


def shipping_payload(data, original=None):
    old = dict(original or {})
    editable = {'job_number': 80, 'customer': 180, 'asset': 240, 'serial_number': 120,
                'pickup_address': 500, 'delivery_address': 500, 'scheduled_date': 32,
                'driver': 120, 'truck': 120, 'priority': 20, 'stage': 40,
                'damage_description': 1200, 'notes': 2000}
    for field, limit in editable.items():
        if field in data:
            old[field] = clean(data[field], limit)
    for key in ('damaged', 'archived'):
        if key in data:
            old[key] = int(data[key] is True or str(data[key]).lower() in ('1', 'true', 'yes'))
    if 'weight_lbs' in data:
        old['weight_lbs'] = None if data['weight_lbs'] in (None, '') else float(data['weight_lbs'])
        if old['weight_lbs'] is not None and not 0 <= old['weight_lbs'] <= 1000000:
            raise ValueError('Weight out of range')
    if not old.get('asset'):
        raise ValueError('Motor/equipment description is required')
    if old.get('stage', 'Scheduled') not in STAGES:
        raise ValueError('Invalid stage')
    if old.get('damaged') and not old.get('damage_description'):
        raise ValueError('Describe damage when marking an item damaged')
    return old


def json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'), default=str).encode('utf-8')


class Handler(BaseHTTPRequestHandler):
    server_version = 'ACELogistics/1.0'

    def respond(self, obj, status=200, headers=None):
        payload = json_bytes(obj)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def body(self):
        ct = self.headers.get('Content-Type', '')
        if not ct.startswith('application/json'):
            raise ValueError('JSON Content-Type required')
        try:
            n = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ValueError('Invalid Content-Length')
        if n <= 0 or n > MAX_BODY:
            raise ValueError('Invalid request size')
        data = json.loads(self.rfile.read(n))
        if not isinstance(data, dict):
            raise ValueError('Expected JSON object')
        return data

    def user(self):
        cookie = cookies.SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie['ace_session'].value if 'ace_session' in cookie else ''
        except cookies.CookieError:
            token = ''
        if not token or len(token) > 200:
            return None
        with db() as c:
            row = c.execute('SELECT users.id,users.username,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?', (hashlib.sha256(token.encode()).hexdigest(), utc())).fetchone()
            return asdict(row)

    def require(self, roles=None):
        u = self.user()
        if not u:
            self.respond({'error':'Sign in required'}, 401)
            return None
        if roles and u['role'] not in roles:
            self.respond({'error':'Insufficient permissions'}, 403)
            return None
        return u

    def origin_ok(self):
        origin = self.headers.get('Origin', '')
        if not origin:
            return True
        parsed = urlsplit(origin)
        return parsed.scheme in ('http', 'https') and parsed.netloc == self.headers.get('Host', '')

    def error(self, ex):
        if isinstance(ex, (ValueError, TypeError, KeyError, sqlite3.IntegrityError, binascii.Error)):
            self.respond({'error':str(ex)[:250]}, 400)
        else:
            print('Unexpected server error', type(ex).__name__, str(ex), flush=True)
            self.respond({'error':'Internal server error'}, 500)

    def do_GET(self):
        try:
            self.get_route()
        except (Exception,) as e:
            self.error(e)

    def do_POST(self):
        if not self.origin_ok():
            self.respond({'error':'Invalid Origin'}, 403)
            return
        try:
            self.post_route()
        except (Exception,) as e:
            self.error(e)

    def do_PATCH(self):
        if not self.origin_ok():
            self.respond({'error':'Invalid Origin'}, 403)
            return
        try:
            self.patch_route()
        except (Exception,) as e:
            self.error(e)

    def route_path(self):
        return urlsplit(self.path).path

    def send_static(self, p):
        requested = 'index.html' if p == '/' else unquote(p).lstrip('/')
        file = (STATIC / requested).resolve()
        if not file.is_file() or not file.is_relative_to(STATIC.resolve()):
            self.respond({'error':'Not found'}, 404)
            return
        mime = 'text/plain'
        if file.suffix == '.html': mime = 'text/html'
        elif file.suffix == '.js': mime = 'text/javascript'
        elif file.suffix == '.css': mime = 'text/css'
        elif file.suffix == '.json': mime = 'application/manifest+json'
        elif file.suffix == '.svg': mime = 'image/svg+xml'
        raw = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(raw)

    def get_route(self):
        p = self.route_path()
        if p == '/healthz':
            with db() as c:
                c.execute('SELECT 1').fetchone()
            return self.respond({'ok':True,'service':'ace-logistics','timestamp':utc()})
        if not p.startswith('/api/'):
            return self.send_static(p)
        u = self.require()
        if not u: return
        with db() as c:
            if p == '/api/me':
                return self.respond({'user':u})
            if p == '/api/dashboard':
                rows = [asdict(x) for x in c.execute('SELECT * FROM shipments WHERE archived=0 ORDER BY CASE priority WHEN "Urgent" THEN 0 WHEN "High" THEN 1 ELSE 2 END, scheduled_date, id DESC LIMIT 300')]
                return self.respond({'shipments':rows,'counts':{'active':sum(x['stage'] not in ('Delivered','Exception') for x in rows),'scheduled':sum(x['stage']=='Scheduled' for x in rows),'in_transit':sum(x['stage'] in ('Dispatched','En Route Pickup','Picked Up','Out for Delivery') for x in rows),'delivered':sum(x['stage']=='Delivered' for x in rows),'exceptions':sum(x['stage']=='Exception' for x in rows)}})
            if p == '/api/shipments':
                return self.respond({'shipments':[asdict(x) for x in c.execute('SELECT * FROM shipments WHERE archived=0 ORDER BY id DESC LIMIT 1000')]})
            if p == '/api/customers':
                return self.respond({'customers':[asdict(x) for x in c.execute('SELECT * FROM customers ORDER BY name')]})
            if p == '/api/ifta':
                return self.respond({'entries':[dict(x, state_miles=json.loads(x['state_miles']),state_gallons=json.loads(x['state_gallons'])) for row in c.execute('SELECT * FROM ifta ORDER BY date DESC,id DESC LIMIT 500') for x in [dict(row)]]})
            if p == '/api/audit':
                if u['role'] != 'admin': return self.respond({'error':'Admin only'},403)
                return self.respond({'events':[asdict(x) for x in c.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 200')]})
            if p == '/api/export':
                if u['role'] != 'admin': return self.respond({'error':'Admin only'},403)
                return self.respond({'version':1,'exported_at':utc(),'customers':[asdict(x) for x in c.execute('SELECT * FROM customers')],'shipments':[asdict(x) for x in c.execute('SELECT * FROM shipments')],'events':[asdict(x) for x in c.execute('SELECT * FROM events')],'proofs':[asdict(x) for x in c.execute('SELECT * FROM proofs')],'ifta':[asdict(x) for x in c.execute('SELECT * FROM ifta')]})
            m = re.fullmatch(r'/api/shipments/(\d+)/events', p)
            if m:
                return self.respond({'events':[asdict(x) for x in c.execute('SELECT * FROM events WHERE shipment_id=? ORDER BY id DESC',(int(m[1]),))]})
            m = re.fullmatch(r'/api/shipments/(\d+)/proofs', p)
            if m:
                return self.respond({'proofs':[asdict(x) for x in c.execute('SELECT id,kind,note,actor,created_at FROM proofs WHERE shipment_id=? ORDER BY created_at DESC',(int(m[1]),))]})
            m = re.fullmatch(r'/api/proofs/([a-f0-9-]{36})', p)
            if m:
                entry = c.execute('SELECT * FROM proofs WHERE id=?',(m[1],)).fetchone()
                if not entry: return self.respond({'error':'Not found'},404)
                file = PROOFS / entry['filename']
                if not file.is_file(): return self.respond({'error':'Missing attachment'},404)
                raw = file.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type','image/png' if file.suffix == '.png' else 'image/jpeg')
                self.send_header('Content-Length',str(len(raw)))
                self.send_header('Cache-Control','private, no-store')
                self.send_header('X-Content-Type-Options','nosniff')
                self.end_headers()
                return self.wfile.write(raw)
        return self.respond({'error':'Not found'},404)

    def post_route(self):
        p = self.route_path()
        if p == '/api/login':
            data = self.body()
            name = clean(data.get('username'), 80)
            with _LOCK, db() as c:
                row = c.execute('SELECT * FROM users WHERE username=?', (name,)).fetchone()
                if not row or not verify(str(data.get('password','')),row['password_hash']):
                    return self.respond({'error':'Invalid credentials'},401)
                token = secrets.token_urlsafe(36)
                expiry = (datetime.now(timezone.utc)+timedelta(hours=12)).isoformat(timespec='seconds')
                c.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),row['id'],expiry))
                audit(c,'login',name,name)
            cookie = 'ace_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'
            if os.environ.get('ACE_COOKIE_SECURE')=='1': cookie += '; Secure'
            return self.respond({'ok':True,'user':{'username':name,'role':row['role']}},headers={'Set-Cookie':cookie})
        u=self.require()
        if not u:return
        actor=u['username']
        if p=='/api/logout':
            cookie=cookies.SimpleCookie()
            cookie.load(self.headers.get('Cookie',''))
            if 'ace_session' in cookie:
                with db() as c: c.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(cookie['ace_session'].value.encode()).hexdigest(),))
            return self.respond({'ok':True}, headers={'Set-Cookie':'ace_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
        if p=='/api/change-password':
            data=self.body()
            if len(str(data.get('new_password',''))) < 12: raise ValueError('Password must be at least 12 characters')
            with db() as c:
                row=c.execute('SELECT password_hash FROM users WHERE id=?',(u['id'],)).fetchone()
                if not verify(str(data.get('current_password','')),row['password_hash']): return self.respond({'error':'Incorrect current password'},403)
                c.execute('UPDATE users SET password_hash=? WHERE id=?',(passhash(data['new_password']),u['id']))
                audit(c,'password-change',actor,actor)
            return self.respond({'ok':True})
        if p=='/api/users':
            if u['role']!='admin':return self.respond({'error':'Admin only'},403)
            data=self.body(); name=clean(data.get('username'),80); role=clean(data.get('role'),20)
            if not re.fullmatch('[a-zA-Z0-9_.-]{3,80}',name):raise ValueError('Invalid username')
            if role not in ROLES:raise ValueError('Invalid role')
            if len(str(data.get('password','')))<12:raise ValueError('Password must be at least 12 characters')
            with db() as c:
                c.execute('INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)',(name,passhash(data['password']),role,utc()))
                audit(c,'create-user',name,actor,'role='+role)
            return self.respond({'ok':True},201)
        if p=='/api/shipments':
            if u['role'] not in WRITE_ROLES:return self.respond({'error':'Dispatch permission required'},403)
            data=shipping_payload(self.body());
            if data.get('damaged') or data.get('stage', 'Scheduled') != 'Scheduled':
                raise ValueError('New movements start Scheduled; use the proof/status workflow for updates')
            ref='MOV-'+datetime.now(timezone.utc).strftime('%y%m%d')+'-'+secrets.token_hex(3).upper()
            with db() as c:
                keys=('reference','job_number','customer','asset','serial_number','weight_lbs','pickup_address','delivery_address','scheduled_date','driver','truck','stage','priority','damaged','damage_description','notes','created_at','updated_at')
                fields=[ref]+[data.get(k,0 if k=='damaged' else 'Scheduled' if k=='stage' else 'Normal' if k=='priority' else None if k=='weight_lbs' else '') for k in keys[1:-2]]+[utc(),utc()]
                c.execute(f'INSERT INTO shipments({",".join(keys)}) VALUES({",".join("?" for _ in keys)})',fields)
                sid=c.execute('SELECT last_insert_rowid()').fetchone()[0]
                c.execute('INSERT INTO events(shipment_id,stage,note,actor,created_at) VALUES(?,?,?,?,?)',(sid, data.get('stage','Scheduled'),'Created',actor,utc()))
                audit(c,'create',str(sid),actor,ref)
            return self.respond({'id':sid,'reference':ref},201)
        m=re.fullmatch(r'/api/shipments/(\d+)/events',p)
        if m:
            if u['role']=='viewer':return self.respond({'error':'Read only'},403)
            data=self.body(); stage=clean(data.get('stage'),40); note=clean(data.get('note'),1600); sid=int(m[1])
            if stage not in STAGES:raise ValueError('Invalid stage')
            with db() as c:
                ship=c.execute('SELECT * FROM shipments WHERE id=? AND archived=0',(sid,)).fetchone()
                if not ship:return self.respond({'error':'Shipment not found'},404)
                if stage=='Exception' and data.get('damaged'):
                    description=clean(data.get('damage_description'),1200)
                    if not description:raise ValueError('Damage description required')
                    count=c.execute("SELECT COUNT(*) FROM proofs WHERE shipment_id=? AND kind='photo'",(sid,)).fetchone()[0]
                    if not count:raise ValueError('Upload damage photo before reporting damage')
                    c.execute('UPDATE shipments SET damaged=1,damage_description=? WHERE id=?',(description,sid))
                c.execute('UPDATE shipments SET stage=?, updated_at=? WHERE id=?',(stage,utc(),sid))
                c.execute('INSERT INTO events(shipment_id,stage,note,actor,created_at) VALUES(?,?,?,?,?)',(sid,stage,note,actor,utc()))
                audit(c,'stage',str(sid),actor,stage)
            return self.respond({'ok':True})
        m=re.fullmatch(r'/api/shipments/(\d+)/proofs',p)
        if m:
            if u['role']=='viewer':return self.respond({'error':'Read only'},403)
            data=self.body(); kind=clean(data.get('kind'),20)
            if kind not in ('photo','signature'):raise ValueError('Invalid proof type')
            raw_string=str(data.get('base64',''))
            if len(raw_string)>8*1024*1024:raise ValueError('Attachment too large')
            raw=base64.b64decode(raw_string,validate=True)
            if not raw or len(raw)>6*1024*1024:raise ValueError('Attachment must be at most 6 MB')
            png=raw.startswith(b'\x89PNG\r\n\x1a\n')
            jpg=raw.startswith(b'\xff\xd8\xff')
            if not (png or jpg):raise ValueError('Only real PNG or JPEG data allowed')
            if kind=='signature' and not png:raise ValueError('Signature must be PNG')
            sid=int(m[1]); uid=str(uuid.uuid4()); filename=uid+('.png' if png else '.jpg')
            with db() as c:
                if not c.execute('SELECT 1 FROM shipments WHERE id=?',(sid,)).fetchone():return self.respond({'error':'Shipment not found'},404)
                out=PROOFS/filename
                with out.open('xb') as f:f.write(raw)
                out.chmod(0o600)
                c.execute('INSERT INTO proofs(id,shipment_id,kind,filename,note,actor,created_at) VALUES(?,?,?,?,?,?,?)',(uid,sid,kind,filename,clean(data.get('note'),400),actor,utc()))
                audit(c,'proof',str(sid),actor,kind)
            return self.respond({'id':uid},201)
        if p=='/api/ifta':
            if u['role']=='viewer':return self.respond({'error':'Read only'},403)
            data=self.body(); start=float(data['start_odometer']); end=float(data['end_odometer'])
            if not 0<=start<=end<=99999999:raise ValueError('Invalid odometer readings')
            miles={clean(k,3).upper():float(v) for k,v in data.get('state_miles',{}).items()}
            gallons={clean(k,3).upper():float(v) for k,v in data.get('state_gallons',{}).items()}
            if any(v<0 for v in list(miles.values())+list(gallons.values())):raise ValueError('Negative values not allowed')
            if abs(sum(miles.values())-(end-start))>0.2:raise ValueError('State miles must equal odometer miles')
            with db() as c:
                c.execute('INSERT INTO ifta(driver,date,truck,start_odometer,end_odometer,total_miles,state_miles,state_gallons,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(clean(data.get('driver'),120),clean(data.get('date'),20),clean(data.get('truck'),120),start,end,end-start,json.dumps(miles),json.dumps(gallons),actor,utc()))
                audit(c,'ifta',clean(data.get('truck'),120),actor)
            return self.respond({'ok':True},201)
        if p=='/api/import/ace':
            if u['role']!='admin':return self.respond({'error':'Admin only'},403)
            payload=self.body(); source=payload.get('data',payload)
            if not isinstance(source,dict):raise ValueError('Invalid ACE export')
            counts={'customers':0,'deliveries':0,'jobs':0,'skipped':0}
            with db() as c:
                for row in source.get('customers',[])[:10000]:
                    if not isinstance(row,dict):continue
                    name=clean(row.get('name'),180)
                    if not name:continue
                    c.execute('INSERT INTO customers(name,contact,phone,email,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET contact=excluded.contact,phone=excluded.phone,email=excluded.email,updated_at=excluded.updated_at',(name,clean(row.get('contact')),clean(row.get('phone'),40),clean(row.get('email'),180),utc()))
                    counts['customers']+=1
                for label,items in (('deliveries',source.get('deliveries',[])),('jobs',source.get('jobs',[]))):
                    for row in items[:20000]:
                        if not isinstance(row,dict) or row.get('id') is None:continue
                        ext='ace:'+label+':'+clean(row['id'],100)
                        asset=clean(row.get('asset') or row.get('motorDescription') or row.get('description') or row.get('type') or 'Unspecified equipment')
                        stage=clean(row.get('stage') if label=='jobs' else row.get('status'),40)
                        if stage not in STAGES:stage='At Shop' if label=='jobs' else 'Scheduled'
                        fields=(ext,'ACE-'+clean(row['id'],50),clean(row.get('id') if label=='jobs' else row.get('job')),clean(row.get('customer')),asset,clean(row.get('serial')),
                                clean(row.get('pickup_address') or row.get('pickupAddress')),clean(row.get('delivery_address') or row.get('deliveryAddress')),
                                clean(row.get('date'),32),clean(row.get('driver')),stage,clean(row.get('notes'),2000),utc(),utc())
                        cur=c.execute('INSERT OR IGNORE INTO shipments(external_ref,reference,job_number,customer,asset,serial_number,pickup_address,delivery_address,scheduled_date,driver,stage,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',fields)
                        counts[label]+=cur.rowcount
                        counts['skipped']+=int(cur.rowcount==0)
                audit(c,'import-ace','ace_shop_prototype_v01',actor,json.dumps(counts))
            return self.respond({'ok':True,'imported':counts})
        if p=='/api/import/motortrack':
            if u['role']!='admin':return self.respond({'error':'Admin only'},403)
            source=self.body(); records=source.get('records',source.get('shipments',[]))
            if not isinstance(records,list):raise ValueError('Expected records array')
            counts={'imported':0,'skipped':0}
            with db() as c:
                for row in records[:20000]:
                    if not isinstance(row,dict):continue
                    ref=clean(row.get('id') or row.get('slip_number') or row.get('ticket') or row.get('reference'),80)
                    if not ref:continue
                    ext='motortrack:'+ref
                    asset=clean(row.get('motor_description') or row.get('description') or row.get('asset') or 'Motor/equipment')
                    fields=(ext,'MT-'+ref,clean(row.get('job_number')),clean(row.get('customer')),asset,clean(row.get('serial_number')),clean(row.get('pickup_address')),clean(row.get('delivery_address')),clean(row.get('date'),32),clean(row.get('driver')),clean(row.get('notes'),2000),utc(),utc())
                    cur=c.execute('INSERT OR IGNORE INTO shipments(external_ref,reference,job_number,customer,asset,serial_number,pickup_address,delivery_address,scheduled_date,driver,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',fields)
                    counts['imported']+=cur.rowcount;counts['skipped']+=int(cur.rowcount==0)
                audit(c,'import-motortrack','records',actor,json.dumps(counts))
            return self.respond({'ok':True,**counts})
        return self.respond({'error':'Not found'},404)

    def patch_route(self):
        m=re.fullmatch(r'/api/shipments/(\d+)',self.route_path())
        if not m:return self.respond({'error':'Not found'},404)
        u=self.require(WRITE_ROLES)
        if not u:return
        data=self.body(); sid=int(m[1])
        with db() as c:
            old=c.execute('SELECT * FROM shipments WHERE id=?',(sid,)).fetchone()
            if not old:return self.respond({'error':'Shipment not found'},404)
            if 'stage' in data or 'damaged' in data:
                raise ValueError('Use stage events and proof workflow for status/damage')
            updates=shipping_payload(data,old)
            fields=['job_number','customer','asset','serial_number','weight_lbs','pickup_address','delivery_address','scheduled_date','driver','truck','priority','notes','archived']
            vals=[updates.get(k) for k in fields]
            c.execute('UPDATE shipments SET '+','.join(k+'=?' for k in fields)+',updated_at=? WHERE id=?',vals+[utc(),sid])
            audit(c,'update',str(sid),u['username'])
        return self.respond({'ok':True})


def serve(host=None,port=None):
    initialize()
    host=host or os.environ.get('ACE_HOST','0.0.0.0')
    port=int(port or os.environ.get('ACE_PORT','8086'))
    print('ACE Logistics listening on '+host+':'+str(port),flush=True)
    ThreadingHTTPServer((host,port),Handler).serve_forever()


if __name__=='__main__':
    serve()
