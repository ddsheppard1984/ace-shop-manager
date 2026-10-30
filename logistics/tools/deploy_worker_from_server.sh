#!/usr/bin/env bash
# Guarded deployment: run on Squeak Server as an authorized user only.
# Does not modify the existing MotorTrack service or data volume.
set -Eeuo pipefail
HOST="${ACE_WORKER_SSH:-dan@100.92.112.26}"
TAILSCALE_IP="${ACE_WORKER_TS_IP:-100.92.112.26}"
BRANCH="feature/ace-logistics-worker-20261030"
REPOSITORY="https://github.com/ddsheppard1984/ace-shop-manager.git"
REMOTE_DIR='$HOME/apps/ace-logistics-source'
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=12 "$HOST")

printf '[1/5] Verifying remote host, Docker and required utilities...\n'
"${SSH[@]}" 'command -v git >/dev/null && command -v curl >/dev/null && docker compose version >/dev/null && docker info >/dev/null'
printf '[2/5] Checking target directory and worker network...\n'
"${SSH[@]}" "test ! -e \"$REMOTE_DIR\" && ip -o -4 addr show tailscale0 | grep -Fq '$TAILSCALE_IP'"
printf '[3/5] Cloning the feature branch to a NEW directory...\n'
"${SSH[@]}" "mkdir -p \"\${HOME}/apps\" && git clone --depth 1 --single-branch --branch '$BRANCH' '$REPOSITORY' \"$REMOTE_DIR\""
printf '[4/5] Validating private port binding, building and launching...\n'
"${SSH[@]}" "cd \"$REMOTE_DIR/logistics\" && printf 'ACE_BIND_HOST=$TAILSCALE_IP\\n' > .env && chmod 600 .env && docker compose config -q && docker compose up -d --build"
printf '[5/5] Waiting for health to report ready...\n'
"${SSH[@]}" "for i in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS --max-time 3 http://$TAILSCALE_IP:8086/healthz; then exit 0; fi; sleep 2; done; exit 1"
printf '\nACE Logistics is running on the worker (private Tailscale): http://%s:8086\n' "$TAILSCALE_IP"
printf 'Retrieve the initial admin password privately via the worker data volume, then change it after login.\n'
