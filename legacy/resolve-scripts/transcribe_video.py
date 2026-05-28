#!/usr/bin/env python3
"""
Extract audio from a video, send it to AssemblyAI with speaker diarization +
word-level timestamps, and save a JSON file ready to load in dither-studio's
Captions panel.

Usage:
    python3 transcribe_video.py "/path/to/video.mp4" [-o /path/to/out.json]

Reads the API key from ./.assemblyai_key (same dir as this script).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
import urllib.request

ROOT = Path(__file__).parent.resolve()
API_KEY_FILE = ROOT / ".assemblyai_key"

API_BASE = "https://api.assemblyai.com/v2"


def load_key() -> str:
    if not API_KEY_FILE.exists():
        sys.exit(f"missing api key file: {API_KEY_FILE}")
    return API_KEY_FILE.read_text().strip()


def extract_audio(video: Path, audio: Path) -> None:
    print(f"[1/4] extracting audio  {video.name}  ->  {audio.name}")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-stats",
        "-i", str(video), "-vn", "-c:a", "aac", "-b:a", "128k", str(audio),
    ]
    subprocess.run(cmd, check=True)


def http_json(req: urllib.request.Request) -> dict:
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def upload(key: str, audio: Path) -> str:
    size_mb = audio.stat().st_size / 1e6
    print(f"[2/4] uploading audio   ({size_mb:.1f} MB)")
    with open(audio, "rb") as f:
        data = f.read()
    req = urllib.request.Request(
        f"{API_BASE}/upload",
        method="POST",
        data=data,
        headers={"authorization": key},
    )
    return http_json(req)["upload_url"]


def submit(key: str, audio_url: str) -> str:
    print("[3/4] submitting job    (speaker_labels=true, punctuate=true, format_text=true)")
    body = json.dumps({
        "audio_url": audio_url,
        "speaker_labels": True,
        "punctuate": True,
        "format_text": True,
    }).encode()
    req = urllib.request.Request(
        f"{API_BASE}/transcript",
        method="POST",
        data=body,
        headers={"authorization": key, "content-type": "application/json"},
    )
    return http_json(req)["id"]


def poll(key: str, tid: str) -> dict:
    print(f"[4/4] polling           id={tid}")
    headers = {"authorization": key}
    last_status = None
    while True:
        req = urllib.request.Request(f"{API_BASE}/transcript/{tid}", headers=headers)
        data = http_json(req)
        status = data["status"]
        if status != last_status:
            print(f"        status={status}")
            last_status = status
        if status == "completed":
            return data
        if status == "error":
            raise RuntimeError(data.get("error", "unknown error"))
        time.sleep(3)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("video", help="input video file")
    ap.add_argument("-o", "--out", help="output JSON path (default: <video>.transcript.json)")
    ap.add_argument("--keep-audio", action="store_true", help="don't delete the extracted .m4a")
    args = ap.parse_args()

    video = Path(args.video).expanduser().resolve()
    if not video.exists():
        sys.exit(f"not found: {video}")

    out = Path(args.out).expanduser().resolve() if args.out else video.with_suffix(".transcript.json")
    audio = video.with_suffix(".m4a")

    key = load_key()
    extract_audio(video, audio)
    audio_url = upload(key, audio)
    tid = submit(key, audio_url)
    data = poll(key, tid)

    # Shape to match dither-studio's parseTranscript loader:
    #   { speakers: [...], utterances: [{ speaker, start, end, text, words: [{text,start,end}] }] }
    utterances = data.get("utterances") or []
    speakers = sorted({u["speaker"] for u in utterances if u.get("speaker")})
    out_data = {
        "speakers": speakers,
        "utterances": [
            {
                "speaker": u.get("speaker"),
                "start": u.get("start", 0),
                "end": u.get("end", 0),
                "text": u.get("text", ""),
                "words": [
                    {"text": w.get("text", ""), "start": w.get("start", 0), "end": w.get("end", 0)}
                    for w in (u.get("words") or [])
                ],
            }
            for u in utterances
        ],
    }
    out.write_text(json.dumps(out_data, indent=2))
    print(f"      saved -> {out}")
    print(f"      utterances: {len(out_data['utterances'])}, speakers: {speakers}")

    if not args.keep_audio:
        try:
            audio.unlink()
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
