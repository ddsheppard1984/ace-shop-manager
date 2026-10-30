# ACE Logistics — private motor dispatch and movement tracking

Non-destructive integration of the original [ACE Shop Manager](https://github.com/ddsheppard1984/ace-shop-manager) and the existing MotorTrack service. This is a new centralized operations app; neither source app is overwritten.

## Included
- Mobile dispatch board: pickup → transit → shop → return delivery, customer, truck, driver, equipment and job links.
- Chain of custody events with UTC timestamps; private photos and optional signatures.
- **Damage reports require both a description and at least one uploaded photo**; ordinary pickup only needs a motor/equipment description. HP, voltage, phase and photos are optional for undamaged items.
- IFTA driver/date/truck/start and end odometer, calculated miles, state miles and state gallons (no receipt or job number).
- Central SQLite WAL database, multiuser roles, login sessions, audit log, JSON export and repeat-safe ACE/MotorTrack import.
- Dashboard, mobile-friendly driver forms, minimal offline status queue. Offline photographs/damage claims are intentionally not queued.

## Runtime
`docker compose up -d --build` (Docker Compose v2). Check `docker compose ps` and `curl -fsS http://127.0.0.1:8086/healthz`.

The app binds **localhost only** by default. Expose through authenticated private Tailscale / reverse proxy, not an unauthenticated public port. For worker-only access, use a private SSH / Tailscale tunnel to `127.0.0.1:8086`. If a vetted HTTPS reverse proxy terminates TLS, set `ACE_COOKIE_SECURE=1`.

Initial admin is `admin` with a generated strong password saved to `/app/data/initial-admin-password` (read privately using Docker as an administrator). Alternatively set `ACE_BOOTSTRAP_PASSWORD` only on initial setup, using a secret injection mechanism instead of committing it. Change the password via **Shop integration → Change your password**. Provision separate accounts for drivers.

Persistent volume `ace-logistics-data` contains the SQLite DB, SQLite WAL, private attachments and initial credential. Back up **the whole volume** consistently and verify restore. Do not mount MotorTrack's live data read-write in this container.

## Import safely
- ACE: in original ACE Shop Manager, export a JSON backup of local data; log in as admin in ACE Logistics and import it in **Shop integration**. Import merges customers, jobs, and deliveries by stable source reference; it never deletes rows.
- MotorTrack: export JSON with `records` or `shipments` array; each record should carry `id` or `slip_number` or `ticket` or `reference`. Mapped fields: `motor_description`/`description`/`asset`, `job_number`, `customer`, `serial_number`, pickup/delivery addresses, date, driver, notes. Import is repeat-safe.
- For a live MotorTrack SQLite migration, first inspect its tables, back up the DB, export compatible JSON from a read-only snapshot, and verify row counts before cutover. No automatic live migration or production cutover is implied by the code alone.

## Development & tests
`python -m unittest discover -s tests -v` (stdlib only). Set `ACE_DATA_DIR` for local testing. Database remains isolated from MotorTrack.

## Current limits
No automatic real-time bidirectional sync with ACE/MotorTrack; import is one-way snapshots until their respective schemas and migration are verified. No route optimization/GPS, invoice integration or offline photograph upload. Avoid publicly exposing the app until private networking and backups are verified.
