# ACE Logistics integration handoff — 2026-10-30 (UTC)

## Sources
- Original ACE Shop Manager GitHub main remains unchanged.
- Original Squeak Server motortrack container remains running and healthy; data volume motortrack_motortrack-data preserved.
- New source: dd shepherd GitHub ACE Shop Manager branch feature/ace-logistics-worker-20261030
- Draft review: https://github.com/ddsheppard1984/ace-shop-manager/pull/1
- Staged on Squeak: /srv/squeak-server/workspace/ace-logistics-20261030

## Verification at 2026-10-30 13:05 UTC
- 5/5 Python API and migration tests PASS on Squeak Server.
- Python source compiles.
- Lenovo worker reachable, Docker running, ample RAM and storage.
- motortrack running, healthy, restart_count=0.
- No existing MotorTrack service or data has been modified, stopped, or migrated.

## UX and safeguards
- Separate SQLite WAL database, private proof photo storage, private bind and roles.
- Dispatch, driver workflow, photo proof, optional signature.
- Damage requires description plus photo; normal pickup requires only equipment description.
- Repeat-safe ACE and MotorTrack JSON imports, read-only MotorTrack SQLite snapshot exporter.
- IFTA simplified fields per prior requirements.

## Pending work
- Squeak deployment approval #91 pending; #89 is earlier guarded deployment consumer request.
- Direct compose_deploy actions rejected by current worker_manage and autonomous_execute policy.
- Guarded Lenovo install script staged: tools/deploy_worker_from_server.sh; authorized operator can invoke it.
- Need deploy and health-check on worker, backup and inspect MotorTrack database, read-only export/import with row count verification, ACE browser JSON import, then configure HTTPS/private access and production monitoring.
- Do not merge or cut over until data migration and worker verification pass.
