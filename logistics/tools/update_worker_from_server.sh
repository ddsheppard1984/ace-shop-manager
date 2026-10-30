#!/usr/bin/env bash
# ACE Logistics guarded code-only upgrade from Squeak Server to Lenovo.
# Preserves the existing ACE data volume and the separate MotorTrack service.
set -Eeuo pipefail
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=12 dan@100.92.112.26 'bash -se' <<'WORKER'
set -Eeuo pipefail
umask 077
BRANCH=feature/ace-logistics-worker-20261030
IP=100.92.112.26
ROOT="$HOME/apps/ace-logistics-source"
test -d "$ROOT/.git" || { echo 'ERROR: ACE source checkout missing'; exit 1; }
cd "$ROOT"
test "$(git branch --show-current)" = "$BRANCH" || { echo 'ERROR: unexpected Git branch'; exit 1; }
test -z "$(git status --porcelain)" || { echo 'ERROR: checkout has uncommitted changes'; exit 1; }
test "$(docker inspect --format '{{.State.Running}}' ace-logistics)" = true || { echo 'ERROR: ACE container not running'; exit 1; }
grep -Fxq "ACE_BIND_HOST=$IP" logistics/.env || { echo 'ERROR: private Tailscale binding missing'; exit 1; }
VOLUME=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' ace-logistics)
test -n "$VOLUME" || { echo 'ERROR: ACE data volume not found'; exit 1; }
OLD=$(git rev-parse HEAD)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$HOME/apps/backups/ace-logistics/$STAMP"
mkdir -p "$BACKUP"
printf '%s\n' "$OLD" > "$BACKUP/previous-git-sha"
printf '%s\n' "$VOLUME" > "$BACKUP/data-volume-name"
echo 'Backing up live ACE database consistently and copying original data volume...'
docker exec -e "ACE_SNAPSHOT_NAME=recovery-$STAMP.sqlite3" ace-logistics python -c 'import os,sqlite3; a=sqlite3.connect("/app/data/logistics.sqlite3"); b=sqlite3.connect("/app/data/"+os.environ["ACE_SNAPSHOT_NAME"]); a.backup(b); b.close(); a.close()'
docker cp ace-logistics:/app/data "$BACKUP/"
python3 - "$BACKUP/data/recovery-$STAMP.sqlite3" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as c:
    assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('ACE database backup integrity: PASS')
PY
echo "Backup captured: $BACKUP"
git fetch origin "$BRANCH"
git merge-base --is-ancestor "$OLD" FETCH_HEAD || { echo 'ERROR: non-fast-forward update'; exit 1; }
NEW=$(git rev-parse FETCH_HEAD)
if test "$OLD" = "$NEW"; then echo 'Already on newest ACE version'; exit 0; fi
FAILED=1
rollback() {
  status=$?
  trap - ERR
  if [ "$FAILED" = 1 ]; then
    echo 'ACE upgrade failed; restoring previous code/image only (data untouched)...'
    cd "$ROOT"
    git checkout --detach "$OLD" || :
    (cd logistics && docker compose up -d --build --no-deps ace-logistics) || :
  fi
  exit "$status"
}
trap rollback ERR
git merge --ff-only FETCH_HEAD
(cd logistics && docker compose config -q && docker compose up -d --build --no-deps ace-logistics)
ready=0
for i in $(seq 1 15); do
    if curl -fsS --max-time 3 "http://$IP:8086/healthz" >/dev/null && 
       test "$(docker inspect --format '{{.State.Health.Status}}' ace-logistics)" = healthy; then ready=1; break; fi
    sleep 2
done
test "$ready" = 1
docker exec ace-logistics grep -Fq 'Password must be at least 8 characters' /app/server.py
curl -fsS --max-time 5 "http://$IP:8086/" | grep -Fq 'New password (8+ characters)'
FAILED=0
trap - ERR
echo "ACE LOGISTICS UPGRADE VERIFIED: $OLD -> $NEW"
echo "Private app: http://$IP:8086"
echo 'Original MotorTrack service and ACE data volume were not changed.'
WORKER

