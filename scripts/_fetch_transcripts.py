#!/usr/bin/env python3
"""
Fetch English transcripts (with per-segment timestamps) for a list of YouTube
video IDs, using youtube-transcript-api's InnerTube path — which survives the
rate-limiting that blocks yt-dlp's timedtext endpoint.

Usage:
    python _fetch_transcripts.py <ids_json_path> <out_json_path>

  ids_json_path : JSON array of video IDs, e.g. ["abc123", "def456"]
  out_json_path : where to write { videoId: [ {text, start, duration}, ... ] }

Progress is printed to stderr so the caller (ingest.ts) can stream it.
Paces requests and backs off on throttling so a full channel pull succeeds.
"""
import json
import os
import sys
import time

import requests
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)
from youtube_transcript_api.proxies import WebshareProxyConfig, GenericProxyConfig


REQUEST_TIMEOUT = float(os.environ.get("FETCH_TIMEOUT", "20"))  # seconds per HTTP call


class TimeoutSession(requests.Session):
    """A Session that enforces a default timeout so a stalled connection
    raises requests.Timeout (→ retried with backoff) instead of hanging forever.
    youtube-transcript-api itself sets no timeout, which wedges on flaky links."""

    def request(self, *args, **kwargs):
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        return super().request(*args, **kwargs)


def build_api() -> YouTubeTranscriptApi:
    """Construct the API, routing through a proxy if one is configured.

    - WEBSHARE_PROXY_USERNAME + WEBSHARE_PROXY_PASSWORD → Webshare residential
      (the rotating-residential path youtube-transcript-api recommends for
      bypassing YouTube IP blocks).
    - PROXY_URL (e.g. http://user:pass@host:port) → any generic HTTP/HTTPS proxy.
    - neither → direct connection.
    """
    ws_user = os.environ.get("WEBSHARE_PROXY_USERNAME")
    ws_pass = os.environ.get("WEBSHARE_PROXY_PASSWORD")
    if ws_user and ws_pass:
        log("  (using Webshare residential proxy)")
        return YouTubeTranscriptApi(
            proxy_config=WebshareProxyConfig(
                proxy_username=ws_user,
                proxy_password=ws_pass,
            )
        )
    proxy_url = os.environ.get("PROXY_URL")
    if proxy_url:
        log("  (using generic proxy)")
        session = TimeoutSession()
        session.proxies = {"http": proxy_url, "https": proxy_url}
        return YouTubeTranscriptApi(http_client=session)
    return YouTubeTranscriptApi(http_client=TimeoutSession())

# Pacing: a gap between videos keeps us under YouTube's throttle radar.
# Gentler pacing lowers the chance of a mid-run IP block. Tunable via env.
import os as _os
BASE_DELAY = float(_os.environ.get("FETCH_DELAY", "3.0"))
MAX_RETRIES = 3           # per video, on transient/throttle errors
BACKOFF_START = 4.0       # first backoff, doubles each retry (4, 8, 16, ...)
# Once the IP is blocked, retries are futile — bail after this many videos
# fail in a row so we don't churn for 45 minutes. Partial progress is saved.
MAX_CONSECUTIVE_FAILS = 4

# Preference order: real English, then any English variant, then en-translated.
PREFERRED = ["en", "en-US", "en-GB"]


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def fetch_one(api: YouTubeTranscriptApi, vid: str):
    """Return list of {text,start,duration} for a video, or None if no English."""
    transcript_list = api.list(vid)

    # 1) Prefer a manually-created English track, else auto English.
    transcript = None
    try:
        transcript = transcript_list.find_transcript(PREFERRED)
    except NoTranscriptFound:
        # 2) Fall back to translating any available track into English.
        for t in transcript_list:
            if t.is_translatable:
                try:
                    transcript = t.translate("en")
                    break
                except Exception:
                    continue
    if transcript is None:
        return None

    return [
        {"text": s["text"], "start": round(float(s["start"]), 2),
         "duration": round(float(s.get("duration", 0.0)), 2)}
        for s in transcript.fetch().to_raw_data()
    ]


def main() -> int:
    ids_path, out_path = sys.argv[1], sys.argv[2]
    with open(ids_path) as f:
        ids = json.load(f)

    api = build_api()
    out = {}
    ok = skipped = 0
    consecutive_fails = 0

    def checkpoint():
        # Write after every video so a kill/early-exit never loses progress.
        with open(out_path, "w") as f:
            json.dump(out, f)

    for i, vid in enumerate(ids, 1):
        attempt = 0
        got = False
        while True:
            try:
                segs = fetch_one(api, vid)
                if segs and len(segs) > 0:
                    out[vid] = segs
                    ok += 1
                    got = True
                    log(f"  [{i}/{len(ids)}] {vid}  ✓ {len(segs)} segments")
                else:
                    skipped += 1
                    log(f"  [{i}/{len(ids)}] {vid}  — no English transcript, skipped")
                time.sleep(BASE_DELAY)
                break
            except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
                skipped += 1
                log(f"  [{i}/{len(ids)}] {vid}  — {type(e).__name__}, skipped")
                break
            except Exception as e:
                attempt += 1
                if attempt > MAX_RETRIES:
                    skipped += 1
                    log(f"  [{i}/{len(ids)}] {vid}  ✗ gave up after {MAX_RETRIES}: {type(e).__name__}")
                    break
                wait = BACKOFF_START * (2 ** (attempt - 1))
                log(f"  [{i}/{len(ids)}] {vid}  … {type(e).__name__}, backoff {wait:.0f}s (retry {attempt}/{MAX_RETRIES})")
                time.sleep(wait)

        checkpoint()
        # Detect a sustained IP block and stop wasting time.
        consecutive_fails = 0 if got else consecutive_fails + 1
        if consecutive_fails >= MAX_CONSECUTIVE_FAILS:
            log(f"\n⚠ {consecutive_fails} videos failed in a row — likely IP-blocked. "
                f"Stopping early; {ok} transcripts saved. Rerun later to resume.")
            break

    log(f"\nTranscripts: {ok} fetched, {skipped} skipped, {len(out)} written → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
