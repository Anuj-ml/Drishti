# IBVAP — Intelligent Border Video Analytics Platform

Software-defined video analytics for border surveillance, built to run on **existing CCTV infrastructure** — no smart cameras, no proprietary appliances, no per-channel hardware licences.

The project has two halves that share one design language and one vocabulary:

| Half | What it is | Where it runs |
|---|---|---|
| **Operator console** | A React application: live wall, event ledger, FRS/ANPR workspaces, virtual fence editor, analytics, incident reporting | Browser |
| **GPU pipeline** | A Python package that processes real video files through a 10-stage analytics pipeline and records exhaustive telemetry | Colab / Kaggle / local GPU |

---

## Quick start

### GPU pipeline (processes real video)

```bash
pip install -r requirements.txt
mkdir -p input_videos && cp /path/to/clips/*.mp4 input_videos/
python run_ibvap.py --max-frames 300 --no-video   # smoke test first
python run_ibvap.py                               # full run
```

Output lands in `runs/<timestamp>/` — annotated videos plus seven telemetry files.

On Colab or Kaggle, open the matching notebook in [`notebooks/`](notebooks/) and run the cells top to bottom. Both notebooks include an upload cell, so no local setup is required.

### Operator console

```bash
npm install
npm run dev
```

The console opens on the Live Wall. It runs standalone with no backend.

---

## What the platform does

Eleven analytics capabilities, all implemented in software over ordinary IP camera streams:

- **Human detection and tracking** — instance segmentation with persistent IDs across frames
- **Vehicle detection and classification** — COCO classes, with a zero-shot path for fine sub-types
- **Face detection and recognition** — pose-gated embedding match against an enrolled gallery
- **Automatic number plate recognition** — plate crop from the vehicle region, OCR, format validation
- **Virtual fence intrusion** — tripwire, exclusion polygon, loiter region, direction gate
- **Suspicious activity** — loitering, dwell, unattended object, crowd surge
- **Night-time movement** — low-light enhancement ahead of the detector
- **Drone / UAS detection** — trajectory-shape classifier independent of the ground detector
- **Ground-disturbance detection** — long-timescale terrain comparison for tunnel-dig precursors
- **Camera self-tamper** — cover, re-aim, defocus and frozen-feed detection
- **Stereo depth (SGM)** — per-detection range from ground-plane calibration

---

## Repository map

```
ibvap/                  GPU pipeline package
  config.py             Settings: defaults < JSON < env < CLI
  telemetry.py          Timing, counters, events, GPU sampling, reports
  preprocess.py         Motion gate, perceptual hash, letterbox, depth calibration
  detect.py             YOLO segmentation + ByteTrack
  analytics.py          ANPR, FRS, drone, tamper, fence
  annotate.py           Mask/box/fence/depth/HUD rendering
  pipeline.py           Ten-stage orchestrator
run_ibvap.py            CLI entry point
notebooks/              Colab and Kaggle notebooks

src/                    Operator console (React + Vite + Tailwind v4)
  views/                Nine workspaces
  components/           Feed, chrome, alert rail, palette, report document
  lib/                  Domain data, annotations, SGM, reports, browser pipeline
  state/store.tsx       Single application context

docs/                   Full documentation — start at docs/README.md
```

---

## Documentation

| Document | Read it when you want to |
|---|---|
| [Project context](docs/PROJECT_CONTEXT.md) | Understand the whole system before changing anything |
| [Architecture](docs/ARCHITECTURE.md) | See how the halves fit together and how data flows |
| [Pipeline reference](docs/PIPELINE.md) | Work on a specific analytics stage |
| [Telemetry reference](docs/TELEMETRY.md) | Read, parse or extend the run output |
| [Frontend reference](docs/FRONTEND.md) | Work on the operator console |
| [Configuration](docs/CONFIGURATION.md) | Set calibration, fence zones or runtime flags |
| [Models](docs/MODELS.md) | Obtain, swap or evaluate model weights |
| [Runbook](docs/RUNBOOK.md) | Run on Colab/Kaggle, or diagnose a failure |
| [Decisions](docs/DECISIONS.md) | Understand why something is built the way it is |
| [Glossary](docs/GLOSSARY.md) | Decode a domain term or abbreviation |

---

## Project status

This is a **working demonstration system**, not certified operational software. The distinction matters, so it is stated precisely:

**Real and functional**
- The GPU pipeline runs genuine Ultralytics YOLO inference with real segmentation masks and ByteTrack IDs
- Motion gating, perceptual hashing, tamper detection and fence geometry are real algorithms on real pixels
- Telemetry measures actual wall-clock time, real GPU counters and true frame accounting
- Every export button produces a real file

**Demonstration only**
- The console's in-browser detector is synthetic; browsers cannot read cross-origin video pixels, so hosted demo feeds cannot be analysed client-side (see [Decisions](docs/DECISIONS.md#d4))
- Camera feeds, sites, plates and gallery entries in the console are fictional
- Incident reports are training artifacts. They carry a demo reference, not a cryptographic evidence seal
- SGM depth uses manual per-camera ground-plane calibration, not live stereo matching

**Not yet verified**
- The Python pipeline has not been executed end-to-end in the authoring environment. It was reviewed statically and several bugs were fixed that way, but static review is not execution. **Run the smoke test before trusting a full pass.**

---

## Requirements

**Pipeline:** Python 3.10+, `ultralytics`, `opencv-python`, `numpy`, `pynvml`, `psutil`. Optional: `paddleocr` (ANPR), `insightface` (FRS).

**Console:** Node 18+. Built with React 19, Vite 7, Tailwind 4.

Model weights download automatically on first use — nothing to fetch manually.

---

## Licence and attribution

Ultralytics YOLO is **AGPL-3.0**. Commercial deployment requires either an Ultralytics commercial licence or a differently-licensed detector. See [Models](docs/MODELS.md#licensing) before shipping.
