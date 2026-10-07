"""IBVAP pipeline orchestrator.

Stage order per frame:
  0. motion gate          — skip heavy work when the scene is unchanged
  1. perceptual hash      — frozen-feed + replay-spoof detection
  2. letterbox            — 640x640, aspect-preserving, pad not stretch
  3. detect + seg + track — YOLO26n-seg with built-in ByteTrack
  4. ANPR                 — plate crop from the vehicle region
  5. FRS                  — face crop from the person region
  6. drone heuristic      — size + band + velocity + orbit
  7. tamper               — always-on scene integrity (not motion gated)
  8. fence                — geometry on mask foot positions
  9. SGM depth            — ground-plane range per detection
 10. annotate + write

Every stage is timed. Every decision is logged.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .analytics import Anpr, DroneHeuristic, FenceEngine, FenceZone, Frs, TamperDetector, TamperResult
from .annotate import Annotator
from .config import Config
from .detect import Detector
from .preprocess import FrameHasher, GroundCalib, MotionGate, letterbox


@dataclass
class VideoJob:
    path: Path
    camera_id: str = ""
    calib: GroundCalib = field(default_factory=GroundCalib)
    zones: list[FenceZone] = field(default_factory=list)


class Pipeline:
    def __init__(self, cfg: Config, telemetry) -> None:
        self.cfg = cfg
        self.tel = telemetry
        self.detector = Detector(cfg)
        self.anpr = Anpr(cfg.models_dir) if cfg.enable_anpr else None
        self.frs = Frs(cfg.models_dir) if cfg.enable_frs else None
        self.drone = DroneHeuristic() if cfg.enable_drone else None
        self.tamper = TamperDetector() if cfg.enable_tamper else None
        self.fence = FenceEngine() if cfg.enable_fence else None
        self.annotator = Annotator(cfg)
        self._last_dets: list[Detection] = []
        self._last_dets_key: dict[str, tuple[float, float]] = {}

    # ── per-video state ───────────────────────────────────
    def _reset_state(self) -> None:
        self._last_dets = []
        self._last_dets_key = {}

    # ── main entry ────────────────────────────────────────
    def run(self, job: VideoJob) -> dict[str, Any]:
        cfg, tel = self.cfg, self.tel
        cap = cv2.VideoCapture(str(job.path))
        if not cap.isOpened():
            raise RuntimeError(f"cannot open video: {job.path}")

        src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_in = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        out_fps = cfg.target_fps or src_fps

        tel.begin_video(job.path.name, {
            "camera_id": job.camera_id, "source_fps": round(src_fps, 3),
            "source_frames": total_in, "source_resolution": f"{w}x{h}",
            "out_fps": round(out_fps, 3), "calib": vars(job.calib),
            "zones": [vars(z) for z in job.zones],
        })

        stem = job.path.stem
        out_path = tel.video_dir / f"{stem}_annotated.mp4"
        writer = self._make_writer(out_path, w, h, out_fps) if cfg.write_video else None

        gate = MotionGate(threshold=cfg.motion_threshold, max_idle=cfg.max_idle_frames)
        hasher = FrameHasher(size=cfg.phash_size)

        frame_idx = 0
        processed = 0
        inference_frames = 0
        t_video0 = time.perf_counter()
        err = ""

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_idx < cfg.start_frame:
                    frame_idx += 1
                    continue
                if cfg.max_frames and processed >= cfg.max_frames:
                    break

                tel.counter("frames_total")

                # ── 0. motion gate ────────────────────────
                motion = 1.0
                if cfg.enable_motion_gate:
                    with tel.stage("00_motion_gate", job.path.name, frame_idx):
                        motion = gate.update(frame)
                    run_inf, why = gate.should_run()
                else:
                    run_inf, why = True, "gate_off"

                # ── 1. perceptual hash ────────────────────
                phash = ""
                frozen = False
                replay = False
                if cfg.enable_phash:
                    with tel.stage("01_phash", job.path.name, frame_idx):
                        phash = hasher.hash(frame)
                    frozen = hasher.is_frozen(phash, cfg.frozen_hamming)
                    # Replay check is O(history) — throttle it, it only needs
                    # to catch a looping source, not frame-by-frame drift.
                    replay = frame_idx % 25 == 0 and hasher.is_replay(phash)
                    if frozen:
                        tel.counter("frames_frozen")
                    if replay:
                        tel.counter("frames_replay")
                        tel.event(kind="spoof_replay", stage="phash", video=job.path.name,
                                  frame_idx=frame_idx, extra={"hash": phash})

                # ── 2. letterbox ──────────────────────────
                lb, transform = None, None
                if run_inf:
                    with tel.stage("02_letterbox", job.path.name, frame_idx):
                        lb, transform = letterbox(frame, cfg.letterbox_size)

                # ── 3. detect + seg + track ───────────────
                if run_inf:
                    with tel.stage("03_detect_track", job.path.name, frame_idx):
                        self._last_dets = self.detector.infer(
                            lb if transform is not None else frame,
                            frame_idx,
                            job.calib,
                            tel,
                            job.path.name,
                            transform,
                        )
                    inference_frames += 1
                    tel.counter("frames_inference")
                else:
                    tel.counter("frames_skipped_motion")
                    with tel.stage("03_detect_track", job.path.name, frame_idx, skip=True, note=why):
                        pass

                dets = self._last_dets

                # ── 4. ANPR ───────────────────────────────
                plates: dict[str, str] = {}
                if self.anpr and self.anpr.ready and run_inf:
                    with tel.stage("04_anpr", job.path.name, frame_idx):
                        for d in dets:
                            r = self.anpr.read(frame, d)
                            if r:
                                plates[d.track_id] = r.text
                                tel.counter("anpr_reads")
                                tel.counter("anpr_valid" if r.valid_format else "anpr_invalid")
                                tel.event(kind="plate_read", stage="anpr", video=job.path.name,
                                          frame_idx=frame_idx, track_id=d.track_id, cls=d.cls, conf=r.conf,
                                          x=r.box[0], y=r.box[1], w=r.box[2] - r.box[0], h=r.box[3] - r.box[1],
                                          extra={"text": r.text, "valid_format": r.valid_format})

                # ── 5. FRS ────────────────────────────────
                faces: dict[str, tuple[float, str | None]] = {}
                if self.frs and self.frs.ready and run_inf:
                    with tel.stage("05_frs", job.path.name, frame_idx):
                        for d in dets:
                            m = self.frs.match(frame, d)
                            if m:
                                faces[d.track_id] = (m.score, m.gallery_id)
                                tel.counter("face_probes")
                                if m.gallery_id:
                                    tel.counter("face_matches")
                                tel.event(kind="face_match", stage="frs", video=job.path.name,
                                          frame_idx=frame_idx, track_id=d.track_id, conf=m.score,
                                          x=m.box[0], y=m.box[1], w=m.box[2] - m.box[0], h=m.box[3] - m.box[1],
                                          extra={"gallery_id": m.gallery_id, "yaw": m.angle_yaw, "quality": m.quality})

                # ── 6. drone heuristic ────────────────────
                drones: set[str] = set()
                if self.drone and run_inf:
                    with tel.stage("06_drone_heuristic", job.path.name, frame_idx):
                        for d in dets:
                            v = self.drone.evaluate(d, frame.shape[:2])
                            if v.is_drone:
                                drones.add(d.track_id)
                                tel.counter("drone_flags")
                                tel.event(kind="uas_flag", stage="drone", video=job.path.name,
                                          frame_idx=frame_idx, track_id=d.track_id, cls=d.cls, conf=v.confidence,
                                          x=d.box[0], y=d.box[1], w=d.box[2] - d.box[0], h=d.box[3] - d.box[1],
                                          extra={"reasons": v.reasons, "size": v.size_score,
                                                 "position": v.position_score, "velocity": v.velocity_score,
                                                 "pattern": v.pattern_score})

                # ── 7. tamper (always-on) ─────────────────
                tamper_res: TamperResult | None = None
                if self.tamper:
                    with tel.stage("07_tamper", job.path.name, frame_idx):
                        tamper_res = self.tamper.analyze(frame, hasher, phash)
                    if tamper_res.state != "normal":
                        tel.counter("frames_tamper")
                        tel.event(kind="camera_tamper", stage="tamper", video=job.path.name,
                                  frame_idx=frame_idx, conf=tamper_res.confidence,
                                  extra={"state": tamper_res.state, "detail": tamper_res.detail,
                                         "lum_drop": tamper_res.luminance_drop, "edge_loss": tamper_res.edge_loss})

                # ── 8. virtual fence ──────────────────────
                if self.fence:
                    with tel.stage("08_fence", job.path.name, frame_idx):
                        self.fence.check(job.zones, dets, frame.shape[:2], frame_idx, tel, job.path.name)

                # ── 9. SGM depth is computed inside detect ──
                if cfg.enable_depth:
                    tel.counter("depth_readings", len([d for d in dets if d.depth_m is not None]))

                # ── 10. annotate + write ──────────────────
                with tel.stage("10_annotate", job.path.name, frame_idx):
                    hud = {
                        "frame": frame_idx,
                        "fps": f"{src_fps:.1f}",
                        "objs": len(dets),
                        "mode": "inf" if run_inf else why,
                        "motion": f"{motion * 1000:.1f}",
                    }
                    if frozen:
                        hud["frozen"] = "YES"
                    if tamper_res and tamper_res.state != "normal":
                        hud["tamper"] = tamper_res.state
                    annotated = self.annotator.draw(frame, dets, job.zones, job.calib, plates, faces, drones, tamper_res, hud)

                if writer is not None:
                    writer.write(annotated)
                    tel.counter("frames_written")

                processed += 1
                tel.counter("frames_processed")
                tel.set_counter(f"frames::{stem}", processed)

                if cfg.gpu_sampling and frame_idx % max(1, cfg.gpu_sample_every) == 0:
                    with tel.stage("tel_gpu_sample", job.path.name, frame_idx):
                        tel.sample_hw(job.path.name, frame_idx)

                if cfg.telemetry_interval and frame_idx % cfg.telemetry_interval == 0:
                    tel.log(kind="progress", video=job.path.name, frame_idx=frame_idx,
                            processed=processed, elapsed_s=round(tel.elapsed, 3),
                            fps=round(processed / max(1e-9, tel.elapsed), 2))

                frame_idx += 1
        except Exception as exc:  # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
            tel.error("pipeline", exc, job.path.name, frame_idx)
            tel.counter("errors")
            raise
        finally:
            cap.release()
            if writer is not None:
                writer.release()

        dur = time.perf_counter() - t_video0
        result = {
            "video": job.path.name,
            "camera_id": job.camera_id,
            "frames_in": total_in,
            "frames_processed": processed,
            "frames_inference": inference_frames,
            "duration_s": round(dur, 3),
            "processing_fps": round(processed / dur, 3) if dur else 0.0,
            "realtime_factor": round((processed / dur) / max(1e-6, src_fps), 4) if dur else 0.0,
            "output": str(out_path) if cfg.write_video else None,
            "status": "ok" if not err else err,
        }
        tel.end_video(job.path.name, "ok" if not err else "error", err)
        tel.log(kind="video_result", **result)
        self._reset_state()
        return result

    def _make_writer(self, path: Path, w: int, h: int, fps: float):
        cfg = self.cfg
        codecs = ["avc1", "mp4v", "XVID"] if cfg.video_codec == "auto" else [cfg.video_codec, "mp4v"]
        for c in codecs:
            wr = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*c), fps, (w, h))
            if wr.isOpened():
                return wr
        raise RuntimeError(f"no usable video codec (tried {codecs})")
