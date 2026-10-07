#!/usr/bin/env python3
"""IBVAP GPU pipeline runner.

Drop videos into the input folder and run:

    python run_ibvap.py                                  # uses ./input_videos
    python run_ibvap.py --input my_clips --output runs   # custom paths
    python run_ibvap.py --config run.json                # full config file

Every run writes a timestamped directory under --output containing the
annotated videos plus complete telemetry.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from ibvap.analytics import FenceZone
from ibvap.config import Config
from ibvap.pipeline import Pipeline, VideoJob
from ibvap.preprocess import GroundCalib
from ibvap.telemetry import Telemetry

VIDEO_EXT = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v", ".flv", ".wmv", ".ts"}


def collect_jobs(input_path: str, cfg: Config, zones_path: str | None) -> list[VideoJob]:
    p = Path(input_path)
    if p.is_file():
        files = [p]
    elif p.is_dir():
        files = sorted(f for f in p.rglob("*") if f.suffix.lower() in VIDEO_EXT)
    else:
        raise SystemExit(f"input path does not exist: {input_path}")

    if not files:
        raise SystemExit(f"no video files found in {input_path} (looked for {sorted(VIDEO_EXT)})")

    zones_by_cam: dict[str, list[FenceZone]] = {}
    if zones_path and Path(zones_path).exists():
        spec = json.loads(Path(zones_path).read_text())
        for cam, zlist in spec.items():
            zones_by_cam[cam] = [FenceZone.from_dict(z) for z in zlist]
        print(f"loaded fence zones for {len(zones_by_cam)} cameras")

    jobs = []
    for f in files:
        cam_id = f.stem
        calib = GroundCalib.from_dict(cfg.calib_for(f.stem))
        jobs.append(VideoJob(path=f, camera_id=cam_id, calib=calib, zones=zones_by_cam.get(f.stem, [])))
    return jobs


def main() -> int:
    ap = argparse.ArgumentParser(description="IBVAP GPU video analytics pipeline")
    ap.add_argument("--input", default=None, help="video file or directory (default: ./input_videos)")
    ap.add_argument("--output", default=None, help="run output directory (default: ./runs)")
    ap.add_argument("--config", default=None, help="JSON config file")
    ap.add_argument("--zones", default=None, help="JSON file of virtual fence zones")
    ap.add_argument("--weights", default=None, help="YOLO weights (e.g. yolo26n-seg.pt)")
    ap.add_argument("--device", default=None, help="auto | cpu | 0")
    ap.add_argument("--imgsz", type=int, default=None)
    ap.add_argument("--conf", type=float, default=None)
    ap.add_argument("--max-frames", type=int, default=None, help="limit frames per video (0 = all)")
    ap.add_argument("--no-video", action="store_true", help="skip writing annotated video")
    ap.add_argument("--anpr", action="store_true", help="enable ANPR stage")
    ap.add_argument("--frs", action="store_true", help="enable FRS stage")
    ap.add_argument("--half", action="store_true", help="force FP16 on")
    ap.add_argument("--no-half", action="store_true", help="force FP16 off")
    ap.add_argument("--run-name", default=None)
    ap.add_argument("--notes", default=None)
    args = ap.parse_args()

    cfg = Config.from_json(args.config) if args.config else Config()
    if args.input:
        cfg.input_path = args.input
    if args.output:
        cfg.output_dir = args.output
    if args.weights:
        cfg.detector_weights = args.weights
    if args.device:
        cfg.device = args.device
    if args.imgsz:
        cfg.detector_imgsz = args.imgsz
    if args.conf is not None:
        cfg.conf_threshold = args.conf
    if args.max_frames is not None:
        cfg.max_frames = args.max_frames
    if args.no_video:
        cfg.write_video = False
    if args.anpr:
        cfg.enable_anpr = True
    if args.frs:
        cfg.enable_frs = True
    if args.half:
        cfg.half = True
    if args.no_half:
        cfg.half = False
    if args.run_name:
        cfg.run_name = args.run_name
    if args.notes:
        cfg.notes = args.notes

    jobs = collect_jobs(cfg.input_path, cfg, args.zones)
    print(f"IBVAP run starting")
    print(f"  device   : {cfg.resolved_device()}")
    print(f"  weights  : {cfg.detector_weights}")
    print(f"  videos   : {len(jobs)}")
    for j in jobs:
        print(f"    - {j.path.name}  (calib={j.calib.mode}, zones={len(j.zones)})")

    with Telemetry(cfg.output_dir, cfg.run_name) as tel:
        cfg.save(tel.out_dir / "config.json")
        tel.log(kind="run_start", config=cfg.to_dict(), videos=[j.path.name for j in jobs])
        print(f"  run dir  : {tel.out_dir}")

        pipe = Pipeline(cfg, tel)
        try:
            pipe.detector.warmup(cfg.detector_imgsz)
        except Exception as exc:  # noqa: BLE001
            tel.error("warmup", exc)
            print(f"  warning: warmup failed: {exc}", file=sys.stderr)

        results = []
        for i, job in enumerate(jobs, 1):
            print(f"[{i}/{len(jobs)}] {job.path.name} ...", flush=True)
            t0 = time.perf_counter()
            try:
                r = pipe.run(job)
            except Exception as exc:  # noqa: BLE001
                tel.counter("errors")
                print(f"  FAILED: {exc}", file=sys.stderr)
                continue
            r["wall_s"] = round(time.perf_counter() - t0, 3)
            results.append(r)
            print(
                f"  done in {r['wall_s']}s | {r['frames_processed']} frames | "
                f"{r['processing_fps']} fps | RT×{r['realtime_factor']}"
            )

        summary = tel.finalize(cfg, {"videos": results})
        s = summary
        print("\n── RUN SUMMARY ─────────────────────────────")
        print(f"  wall clock : {s['wall_clock']['total_s']}s ({s['wall_clock']['total_min']} min)")
        print(f"  frames     : {s['frames']['total']} total / {s['frames']['inference']} inference")
        print(f"  throughput : {s['throughput']['frames_per_second']} fps")
        if s["gpu"]["samples"]:
            print(f"  GPU util   : mean {s['gpu']['utilisation_pct']['mean']}% p95 {s['gpu']['utilisation_pct']['p95']}%")
        print(f"  errors     : {s['errors']}")
        print(f"  report     : {tel.out_dir / 'summary.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
