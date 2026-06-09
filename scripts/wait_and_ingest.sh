#!/usr/bin/env bash
# Watch for the YouTube IP block to lift, then run the full ingest automatically.
# Probes a couple of un-fetched videos every few minutes (gentle, to allow the
# block to cool). Once one succeeds, kicks off `npm run ingest`.
set -u
cd "$(dirname "$0")/.."

PY=.venv/bin/python
PROBE_IDS=("saoNnt79NNk" "Y-Krc5ioGb8" "YqQf3JwErdg")
INTERVAL="${PROBE_INTERVAL:-210}"   # seconds between probes
MAX_WAIT="${MAX_WAIT:-3600}"        # give up after 1h
waited=0

probe() {
  for id in "${PROBE_IDS[@]}"; do
    if "$PY" - "$id" <<'PYEOF' 2>/dev/null
import sys
from youtube_transcript_api import YouTubeTranscriptApi as A
try:
    A().fetch(sys.argv[1], languages=['en'])
    sys.exit(0)
except Exception as e:
    sys.exit(1 if type(e).__name__ == "IpBlocked" else 0)  # non-block error = reachable
PYEOF
    then return 0; fi
  done
  return 1
}

echo "[watcher] waiting for IP block to clear (probe every ${INTERVAL}s, max ${MAX_WAIT}s)…"
while ! probe; do
  sleep "$INTERVAL"
  waited=$((waited + INTERVAL))
  echo "[watcher] still blocked after ${waited}s…"
  if [ "$waited" -ge "$MAX_WAIT" ]; then
    echo "[watcher] gave up after ${MAX_WAIT}s — IP still blocked. Try later or a different network/proxy."
    exit 2
  fi
done

echo "[watcher] ✅ unblocked after ${waited}s — starting full ingest"
FETCH_DELAY="${FETCH_DELAY:-3.5}" npm run ingest
