#!/usr/bin/env bash
# Run on the server from /opt/media after new code is in place.
set -euo pipefail
cd /opt/media
docker compose -p media up -d --build
docker image prune -f >/dev/null
docker compose -p media ps
