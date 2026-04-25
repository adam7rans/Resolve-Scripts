#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Caption Creator — Step 1: Transcription
Starts a local web UI. Choose a voice memo → it transcribes via AssemblyAI
and saves a JSON file ready for Resolve. Then run 'Place Captions' from
Resolve's Workspace → Scripts menu to place the captions on your timeline.
"""

import sys
import os
import json
import threading
import queue
import tempfile
import webbrowser

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_KEY_FILE = os.path.join(_SCRIPT_DIR, ".assemblyai_key")
_PORT = 5055

# Where to save the ready-to-use transcript (Resolve script reads from here)
TRANSCRIPT_READY_PATH = os.path.expanduser("~/Desktop/captions_ready.json")


# ---------------------------------------------------------------------------
# API key helper
# ---------------------------------------------------------------------------

def load_api_key():
    env = os.environ.get("ASSEMBLYAI_API_KEY")
    if env:
        return env
    if os.path.isfile(_KEY_FILE):
        key = open(_KEY_FILE).read().strip()
        if key:
            return key
    return None


# ---------------------------------------------------------------------------
# AssemblyAI transcription
# ---------------------------------------------------------------------------

def transcribe_audio(audio_path, api_key, log):
    try:
        import assemblyai as aai
    except ImportError:
        log("ERROR: assemblyai not installed. Run: pip install assemblyai")
        return None

    aai.settings.api_key = api_key
    log(f"Uploading: {os.path.basename(audio_path)}")
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_path)

    if transcript.status.value == "error":
        log(f"ERROR: Transcription failed — {transcript.error}")
        return None

    return transcript


def words_to_sentences(words):
    """Group word dicts into sentence dicts based on terminal punctuation."""
    sentences = []
    current = []
    for w in words:
        current.append(w)
        if w["text"].rstrip().endswith((".", "?", "!", "...",)):
            sentences.append({
                "text": " ".join(x["text"] for x in current),
                "start": current[0]["start"],
                "end": current[-1]["end"],
            })
            current = []
    if current:  # trailing words with no terminal punctuation
        sentences.append({
            "text": " ".join(x["text"] for x in current),
            "start": current[0]["start"],
            "end": current[-1]["end"],
        })
    return sentences


def run_transcription_job(audio_path, mode, log):
    try:
        api_key = load_api_key()
        if not api_key:
            log(f"ERROR: No AssemblyAI API key found.\n  Save your key to: {_KEY_FILE}")
            log("__FAIL__")
            return

        transcript = transcribe_audio(audio_path, api_key, log)
        if not transcript:
            log("__FAIL__")
            return

        words = [
            {"text": w.text, "start": w.start, "end": w.end, "confidence": w.confidence}
            for w in (transcript.words or [])
        ]
        log(f"Transcribed {len(words)} words.")

        data = {
            "text": transcript.text,
            "mode": mode,
            "word_count": len(words),
            "words": words,
        }
        with open(TRANSCRIPT_READY_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        log(f"Mode: {mode}")
        log(f"Saved: {TRANSCRIPT_READY_PATH}")
        log("__DONE__")

    except Exception as e:
        log(f"ERROR: {e}")
        log("__FAIL__")


# ---------------------------------------------------------------------------
# Web UI HTML
# ---------------------------------------------------------------------------

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Caption Creator</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #141414;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 24px;
  }
  .card {
    width: 100%;
    max-width: 600px;
    background: #1e1e1e;
    border-radius: 16px;
    border: 1px solid #2e2e2e;
    overflow: hidden;
  }
  .header { padding: 28px 32px 20px; border-bottom: 1px solid #2a2a2a; }
  .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .header p  { font-size: 13px; color: #777; margin-top: 4px; }
  .body { padding: 28px 32px; }

  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 14px;
  }
  .step-num {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #2a2a2a;
    color: #888;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .step-num.active { background: #d97706; color: white; }
  .step-num.done   { background: #10b981; color: white; }

  .drop-zone {
    border: 2px dashed #333;
    border-radius: 12px;
    padding: 36px 24px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    position: relative;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: #d97706;
    background: rgba(217,119,6,0.05);
  }
  .drop-zone input[type=file] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }
  .drop-icon { font-size: 32px; margin-bottom: 10px; }
  .drop-title { font-size: 15px; font-weight: 600; }
  .drop-sub   { font-size: 12px; color: #666; margin-top: 4px; }
  .file-name  { font-size: 13px; color: #d97706; margin-top: 8px; font-weight: 500; }

  .btn {
    display: block; width: 100%; margin-top: 16px; padding: 13px;
    background: #d97706; color: white; border: none; border-radius: 10px;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.15s;
  }
  .btn:hover:not(:disabled) { background: #b45309; }
  .btn:disabled { background: #2a2a2a; color: #444; cursor: not-allowed; }

  .divider { border: none; border-top: 1px solid #2a2a2a; margin: 24px 0; }

  .next-step {
    background: #111;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 18px 20px;
    display: none;
  }
  .next-step h3 { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #10b981; }
  .next-step p  { font-size: 13px; color: #aaa; line-height: 1.6; }
  .next-step code {
    background: #1e1e1e; border: 1px solid #333; border-radius: 4px;
    padding: 1px 6px; font-family: "SF Mono", monospace; font-size: 12px; color: #d97706;
  }

  .mode-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 16px;
  }
  .mode-label { font-size: 13px; color: #666; }
  .toggle-group {
    display: flex; background: #111; border-radius: 8px;
    padding: 3px; gap: 2px; border: 1px solid #2a2a2a;
  }
  .toggle-btn {
    padding: 6px 14px; font-size: 12px; font-weight: 600;
    border: none; border-radius: 6px; cursor: pointer;
    background: transparent; color: #555; transition: all 0.15s;
  }
  .toggle-btn.active { background: #d97706; color: white; }

  .log-wrap {
    margin-top: 20px; background: #111; border-radius: 10px;
    border: 1px solid #222; overflow: hidden; display: none;
  }
  .log-header {
    padding: 8px 16px; font-size: 11px; font-weight: 600;
    letter-spacing: 0.8px; text-transform: uppercase; color: #555;
    border-bottom: 1px solid #1a1a1a;
  }
  .status-bar { height: 3px; background: #d97706; width: 0%; transition: width 0.4s; }
  .log-body {
    padding: 12px 16px;
    font-family: "SF Mono", "Menlo", monospace; font-size: 12px;
    color: #aaa; line-height: 1.7; max-height: 220px; overflow-y: auto;
    white-space: pre-wrap; word-break: break-all;
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Caption Creator</h1>
    <p>Two steps: transcribe here, then place captions from inside Resolve</p>
  </div>
  <div class="body">

    <div class="step">
      <div class="step-num active" id="step1num">1</div>
      Transcribe audio file
    </div>

    <div class="drop-zone" id="dropZone">
      <input type="file" id="fileInput" accept="audio/*,video/*,.m4a,.mp3,.wav,.aiff,.aac,.mp4,.mov">
      <div class="drop-icon">🎤</div>
      <div class="drop-title">Choose audio file</div>
      <div class="drop-sub">or drag &amp; drop — m4a, mp3, wav, aiff…</div>
      <div class="file-name" id="fileName"></div>
    </div>

    <div class="mode-row">
      <span class="mode-label">Caption mode</span>
      <div class="toggle-group" id="modeToggle">
        <button class="toggle-btn active" data-mode="word">Word by word</button>
        <button class="toggle-btn" data-mode="sentence">Sentences</button>
      </div>
    </div>

    <button class="btn" id="startBtn" disabled>Transcribe with AssemblyAI</button>

    <div class="log-wrap" id="logWrap">
      <div class="status-bar" id="statusBar"></div>
      <div class="log-header">Progress</div>
      <div class="log-body" id="logBody"></div>
    </div>

    <hr class="divider">

    <div class="step">
      <div class="step-num" id="step2num">2</div>
      Place captions in Resolve
    </div>

    <div class="next-step" id="nextStep">
      <h3>Transcript ready — go to Resolve now</h3>
      <p>
        In DaVinci Resolve, open the menu:<br>
        <code>Workspace</code> → <code>Scripts</code> → <code>Place Captions</code>
      </p>
      <p style="margin-top:8px; color:#666; font-size:12px;">
        The script will read the saved transcript and place one caption per word on your timeline.
      </p>
    </div>
    <div id="step2placeholder" style="background:#111;border:1px dashed #2a2a2a;border-radius:12px;padding:18px 20px;color:#444;font-size:13px;text-align:center;">
      Complete Step 1 first
    </div>

  </div>
</div>

<script>
let selectedFile = null;
let running = false;
let selectedMode = 'word';

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

const fileInput  = document.getElementById('fileInput');
const fileName   = document.getElementById('fileName');
const startBtn   = document.getElementById('startBtn');
const logWrap    = document.getElementById('logWrap');
const logBody    = document.getElementById('logBody');
const statusBar  = document.getElementById('statusBar');
const nextStep   = document.getElementById('nextStep');
const step2ph    = document.getElementById('step2placeholder');
const step1num   = document.getElementById('step1num');
const step2num   = document.getElementById('step2num');
const dropZone   = document.getElementById('dropZone');

fileInput.addEventListener('change', () => { if (fileInput.files[0]) selectFile(fileInput.files[0]); });
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});

function selectFile(f) {
  selectedFile = f;
  fileName.textContent = f.name;
  startBtn.disabled = false;
}

startBtn.addEventListener('click', async () => {
  if (!selectedFile || running) return;
  running = true;
  startBtn.disabled = true;
  startBtn.textContent = 'Transcribing...';
  logWrap.style.display = 'block';
  logBody.textContent = '';
  statusBar.style.width = '5%';
  nextStep.style.display = 'none';
  step2ph.style.display = 'block';

  const form = new FormData();
  form.append('file', selectedFile);
  form.append('mode', selectedMode);
  const resp = await fetch('/upload', { method: 'POST', body: form });
  const { job_id } = await resp.json();

  const es = new EventSource('/stream/' + job_id);
  es.onmessage = e => {
    const msg = e.data;
    if (msg === '__DONE__') { es.close(); finish(true); }
    else if (msg === '__FAIL__') { es.close(); finish(false); }
    else {
      logBody.textContent += msg + '\\n';
      logBody.scrollTop = logBody.scrollHeight;
      statusBar.style.width = '60%';
    }
  };
  es.onerror = () => { es.close(); finish(false); };
});

function finish(ok) {
  running = false;
  statusBar.style.width = ok ? '100%' : '0%';
  startBtn.disabled = false;
  startBtn.textContent = 'Transcribe with AssemblyAI';
  if (ok) {
    step1num.className = 'step-num done';
    step1num.textContent = '✓';
    step2num.className = 'step-num active';
    nextStep.style.display = 'block';
    step2ph.style.display = 'none';
  }
}
</script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

def create_app(log_queues):
    from flask import Flask, request, jsonify, Response
    import uuid

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

    @app.route("/")
    def index():
        return HTML

    @app.route("/upload", methods=["POST"])
    def upload():
        f = request.files.get("file")
        if not f:
            return jsonify({"error": "no file"}), 400
        mode = request.form.get("mode", "word")
        suffix = os.path.splitext(f.filename)[1] or ".audio"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix="caption_input_")
        f.save(tmp.name)
        tmp.close()
        job_id = str(uuid.uuid4())
        q = queue.Queue()
        log_queues[job_id] = q
        threading.Thread(target=run_transcription_job, args=(tmp.name, mode, q.put), daemon=True).start()
        return jsonify({"job_id": job_id})

    @app.route("/stream/<job_id>")
    def stream(job_id):
        q = log_queues.get(job_id)
        if not q:
            return Response("data: __FAIL__\n\n", mimetype="text/event-stream")
        def generate():
            while True:
                try:
                    msg = q.get(timeout=120)
                    yield f"data: {msg}\n\n"
                    if msg in ("__DONE__", "__FAIL__"):
                        log_queues.pop(job_id, None)
                        break
                except Exception:
                    yield "data: __FAIL__\n\n"
                    break
        return Response(generate(), mimetype="text/event-stream",
                        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return app


def main():
    log_queues = {}
    app = create_app(log_queues)
    url = f"http://localhost:{_PORT}"
    print(f"Caption Creator running at {url}")
    print("Press Ctrl+C to quit.\n")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    import logging
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    app.run(port=_PORT, debug=False, threaded=True)


if __name__ == "__main__":
    main()
