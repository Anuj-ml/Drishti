"""Telemetry — everything needed to debug, diagnose and improve the pipeline.

Writes a timestamped run directory:

    runs/<timestamp>_<runid>/
        config.json        exact configuration (reproducibility)
        summary.json       aggregated final report
        telemetry.jsonl    streaming event log (one JSON per line)
        stage_latency.csv  per-frame, per-stage timing
        events.csv         detections / alerts
        gpu_timeline.csv   GPU + system utilisation samples
        errors.jsonl       exceptions with stack traces
        videos/*.mp4       annotated output

Design notes:
  * Every write is append + flush, so a crashed run still leaves usable data.
  * Stage timers use a context manager so they cannot be forgotten.
  * Latency aggregation computes mean/p50/p95/p99/min/max/sum/count.
"""

from __future__ import annotations

import csv
import json
import platform
import statistics
import sys
import time
import traceback
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator


def _pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


@dataclass
class StageStats:
    name: str
    samples_ms: list[float] = field(default_factory=list)
    calls: int = 0
    skips: int = 0

    def add(self, ms: float) -> None:
        self.samples_ms.append(ms)
        self.calls += 1

    @property
    def total_ms(self) -> float:
        return sum(self.samples_ms)

    def summary(self) -> dict[str, Any]:
        s = self.samples_ms
        return {
            "calls": self.calls,
            "skips": self.skips,
            "total_ms": round(self.total_ms, 3),
            "total_s": round(self.total_ms / 1000.0, 4),
            "mean_ms": round(statistics.fmean(s), 4) if s else 0.0,
            "p50_ms": round(_pct(s, 0.50), 4),
            "p95_ms": round(_pct(s, 0.95), 4),
            "p99_ms": round(_pct(s, 0.99), 4),
            "min_ms": round(min(s), 4) if s else 0.0,
            "max_ms": round(max(s), 4) if s else 0.0,
        }


class Telemetry:
    """Collects and persists every measurement taken during a run."""

    def __init__(self, output_dir: str | Path, run_name: str = "") -> None:
        self.started_at = datetime.now()
        self.run_id = self.started_at.strftime("%Y-%m-%d_%H-%M-%S")
        if run_name:
            self.run_id += f"_{run_name}"

        self.out_dir = Path(output_dir) / self.run_id
        self.video_dir = self.out_dir / "videos"
        self.video_dir.mkdir(parents=True, exist_ok=True)

        self.stages: dict[str, StageStats] = {}
        self.counters: dict[str, int] = {}
        self.gpu_samples: list[dict[str, Any]] = []
        self.sys_samples: list[dict[str, Any]] = []
        self.per_video: dict[str, dict[str, Any]] = {}

        self._t0 = time.perf_counter()
        self._stage_stack: list[tuple[str, float]] = []

        self._jsonl = (self.out_dir / "telemetry.jsonl").open("a", buffering=1)
        self._errl = (self.out_dir / "errors.jsonl").open("a", buffering=1)
        self._stage_csv = (self.out_dir / "stage_latency.csv").open("w", newline="", buffering=1)
        self._stage_writer = csv.writer(self._stage_csv)
        self._stage_writer.writerow(
            ["frame_idx", "video", "wall_s", "stage", "duration_ms", "ran", "note"],
        )
        self._events_csv = (self.out_dir / "events.csv").open("w", newline="", buffering=1)
        self._events_writer = csv.writer(self._events_csv)
        self._events_writer.writerow(
            ["frame_idx", "video", "wall_s", "kind", "stage", "track_id", "cls", "conf", "x", "y", "w", "h", "extra"],
        )
        self._gpu_csv = (self.out_dir / "gpu_timeline.csv").open("w", newline="", buffering=1)
        self._gpu_writer = csv.writer(self._gpu_csv)
        self._gpu_writer.writerow(
            ["wall_s", "video", "frame_idx", "gpu_util_pct", "gpu_mem_used_mb", "gpu_mem_total_mb",
             "gpu_temp_c", "cpu_pct", "ram_used_mb", "ram_total_mb"],
        )

        self._nvml = None
        self._nvml_handle = None
        self._psutil = None
        self._init_hw()

    # ── hardware probing ──────────────────────────────────
    def _init_hw(self) -> None:
        try:
            import pynvml

            pynvml.nvmlInit()
            if pynvml.nvmlDeviceGetCount() > 0:
                self._nvml = pynvml
                self._nvml_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        except Exception:
            self._nvml = None
        try:
            import psutil

            self._psutil = psutil
        except Exception:
            self._psutil = None

    def hw_report(self) -> dict[str, Any]:
        rep: dict[str, Any] = {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "processor": platform.processor(),
            "cpu_count": None,
            "ram_total_mb": None,
            "gpus": [],
        }
        if self._psutil:
            rep["cpu_count"] = self._psutil.cpu_count(logical=True)
            rep["ram_total_mb"] = round(self._psutil.virtual_memory().total / 1024 / 1024, 1)
            # Prime the sampler: the first cpu_percent(None) call always returns 0.0
            try:
                self._psutil.cpu_percent(interval=None)
            except Exception:
                pass
        if self._nvml and self._nvml_handle:
            try:
                n, h = self._nvml, self._nvml_handle
                entry: dict[str, Any] = {
                    "name": n.nvmlDeviceGetName(h),
                    "driver": n.nvmlSystemGetDriverVersion(),
                    "memory_total_mb": round(n.nvmlDeviceGetMemoryInfo(h).total / 1024 / 1024, 1),
                }
                # nvmlDeviceGetCudaComputeCapability is deprecated in newer pynvml
                for fn in ("nvmlDeviceGetArchitecture", "nvmlDeviceGetCudaComputeCapability"):
                    try:
                        entry["architecture"] = str(getattr(n, fn)(h))
                        break
                    except Exception:
                        continue
                rep["gpus"].append(entry)
            except Exception:
                pass
        try:
            import torch

            rep["torch"] = {
                "version": torch.__version__,
                "cuda_available": torch.cuda.is_available(),
                "cuda_version": torch.version.cuda,
                "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            }
        except Exception:
            rep["torch"] = None
        try:
            import cv2

            rep["opencv"] = cv2.__version__
        except Exception:
            rep["opencv"] = None
        try:
            import ultralytics

            rep["ultralytics"] = ultralytics.__version__
        except Exception:
            rep["ultralytics"] = None
        return rep

    def sample_hw(self, video: str, frame_idx: int) -> None:
        gpu: dict[str, Any] = {"wall_s": round(self.elapsed, 4), "video": video, "frame_idx": frame_idx}
        if self._nvml and self._nvml_handle:
            try:
                n, h = self._nvml, self._nvml_handle
                u = n.nvmlDeviceGetUtilizationRates(h)
                m = n.nvmlDeviceGetMemoryInfo(h)
                gpu.update(
                    gpu_util_pct=u.gpu,
                    gpu_mem_used_mb=round(m.used / 1024 / 1024, 1),
                    gpu_mem_total_mb=round(m.total / 1024 / 1024, 1),
                    gpu_temp_c=n.nvmlDeviceGetTemperature(h, n.NVML_TEMPERATURE_GPU),
                )
            except Exception:
                gpu.update(gpu_util_pct="", gpu_mem_used_mb="", gpu_mem_total_mb="", gpu_temp_c="")
        else:
            gpu.update(gpu_util_pct="", gpu_mem_used_mb="", gpu_mem_total_mb="", gpu_temp_c="")
        if self._psutil:
            try:
                vm = self._psutil.virtual_memory()
                gpu.update(
                    cpu_pct=self._psutil.cpu_percent(interval=None),
                    ram_used_mb=round(vm.used / 1024 / 1024, 1),
                    ram_total_mb=round(vm.total / 1024 / 1024, 1),
                )
            except Exception:
                gpu.update(cpu_pct="", ram_used_mb="", ram_total_mb="")
        self.gpu_samples.append(gpu)
        self._gpu_writer.writerow([gpu.get(k, "") for k in (
            "wall_s", "video", "frame_idx", "gpu_util_pct", "gpu_mem_used_mb", "gpu_mem_total_mb",
            "gpu_temp_c", "cpu_pct", "ram_used_mb", "ram_total_mb")])

    # ── stage timing ──────────────────────────────────────
    @contextmanager
    def stage(
        self,
        name: str,
        video: str = "",
        frame_idx: int = 0,
        note: str = "",
        skip: bool = False,
    ) -> Iterator[None]:
        st = self.stages.setdefault(name, StageStats(name))
        if skip:
            st.skips += 1
            self._stage_writer.writerow([frame_idx, video, round(self.elapsed, 4), name, 0.0, 0, note or "skipped"])
            yield
            return
        t = time.perf_counter()
        try:
            yield
        finally:
            ms = (time.perf_counter() - t) * 1000.0
            st.add(ms)
            self._stage_writer.writerow([frame_idx, video, round(self.elapsed, 4), name, round(ms, 4), 1, note])

    # ── counters / events / errors ────────────────────────
    def counter(self, name: str, n: int = 1) -> None:
        self.counters[name] = self.counters.get(name, 0) + n

    def set_counter(self, name: str, value: int) -> None:
        self.counters[name] = value

    def event(
        self,
        kind: str,
        stage: str,
        video: str,
        frame_idx: int,
        track_id: str = "",
        cls: str = "",
        conf: float = 0.0,
        x: float = 0.0,
        y: float = 0.0,
        w: float = 0.0,
        h: float = 0.0,
        extra: dict[str, Any] | None = None,
    ) -> None:
        row = {
            "wall_s": round(self.elapsed, 4),
            "video": video,
            "frame_idx": frame_idx,
            "kind": kind,
            "stage": stage,
            "track_id": track_id,
            "cls": cls,
            "conf": round(conf, 4),
            "x": round(x, 2),
            "y": round(y, 2),
            "w": round(w, 2),
            "h": round(h, 2),
            "extra": extra or {},
        }
        self._events_writer.writerow(
            [row["frame_idx"], video, row["wall_s"], kind, stage, track_id, cls, row["conf"],
             row["x"], row["y"], row["w"], row["h"], json.dumps(row["extra"], default=str)],
        )
        self._jsonl.write(json.dumps({"type": "event", **row}, default=str) + "\n")

    def error(self, stage: str, exc: BaseException, video: str = "", frame_idx: int = 0) -> None:
        rec = {
            "wall_s": round(self.elapsed, 4),
            "video": video,
            "frame_idx": frame_idx,
            "stage": stage,
            "error_type": type(exc).__name__,
            "message": str(exc),
            "traceback": traceback.format_exc(),
        }
        self._errl.write(json.dumps(rec, default=str) + "\n")
        self._jsonl.write(json.dumps({"type": "error", **rec}, default=str) + "\n")

    def log(self, **kw: Any) -> None:
        self._jsonl.write(json.dumps({"type": "log", "wall_s": round(self.elapsed, 4), **kw}, default=str) + "\n")

    # ── properties ────────────────────────────────────────
    @property
    def elapsed(self) -> float:
        return time.perf_counter() - self._t0

    # ── finalisation ──────────────────────────────────────
    def begin_video(self, video: str, meta: dict[str, Any]) -> None:
        self.per_video[video] = {
            "started_wall_s": round(self.elapsed, 4),
            "meta": meta,
            "frames": 0,
            "status": "running",
        }
        self.log(kind="video_start", video=video, **meta)

    def end_video(self, video: str, status: str = "ok", error: str = "") -> None:
        rec = self.per_video.setdefault(video, {})
        rec["status"] = status
        rec["ended_wall_s"] = round(self.elapsed, 4)
        rec["duration_s"] = round(rec["ended_wall_s"] - rec.get("started_wall_s", 0.0), 4)
        if error:
            rec["error"] = error
        self.log(kind="video_end", video=video, status=status, duration_s=rec.get("duration_s"))

    def finalize(self, config: Any, summary_extra: dict[str, Any] | None = None) -> dict[str, Any]:
        total_s = self.elapsed
        gpu_utils = [g["gpu_util_pct"] for g in self.gpu_samples if isinstance(g.get("gpu_util_pct"), (int, float))]
        gpu_mem = [g["gpu_mem_used_mb"] for g in self.gpu_samples if isinstance(g.get("gpu_mem_used_mb"), (int, float))]
        cpu_utils = [g["cpu_pct"] for g in self.gpu_samples if isinstance(g.get("cpu_pct"), (int, float))]

        def agg(vals: list[float]) -> dict[str, float]:
            if not vals:
                return {"mean": 0.0, "p50": 0.0, "p95": 0.0, "p99": 0.0, "min": 0.0, "max": 0.0}
            return {
                "mean": round(statistics.fmean(vals), 2),
                "p50": round(_pct(vals, 0.50), 2),
                "p95": round(_pct(vals, 0.95), 2),
                "p99": round(_pct(vals, 0.99), 2),
                "min": round(min(vals), 2),
                "max": round(max(vals), 2),
            }

        total_frames = self.counters.get("frames_total", 0)
        stage_summaries = {name: st.summary() for name, st in sorted(self.stages.items())}
        accounted = sum(s["total_ms"] for s in stage_summaries.values())

        summary: dict[str, Any] = {
            "run_id": self.run_id,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "wall_clock": {
                "total_s": round(total_s, 4),
                "total_min": round(total_s / 60, 3),
            },
            "frames": {
                "total": total_frames,
                "processed": self.counters.get("frames_processed", 0),
                "inference": self.counters.get("frames_inference", 0),
                "skipped_motion": self.counters.get("frames_skipped_motion", 0),
                "skipped_other": self.counters.get("frames_skipped_other", 0),
                "frozen": self.counters.get("frames_frozen", 0),
                "tamper_frames": self.counters.get("frames_tamper", 0),
                "written": self.counters.get("frames_written", 0),
            },
            "throughput": {
                "frames_per_second": round(total_frames / total_s, 3) if total_s else 0.0,
                "inference_fps": round(self.counters.get("frames_inference", 0) / total_s, 3) if total_s else 0.0,
                "realtime_factor": round((total_frames / total_s) / 25.0, 4) if total_s else 0.0,
            },
            "stages": stage_summaries,
            "stage_share_pct": {
                k: round(v["total_ms"] / accounted * 100, 2) if accounted else 0.0
                for k, v in stage_summaries.items()
            },
            "unaccounted_pct": round(max(0.0, (total_s * 1000 - accounted) / max(1e-9, total_s * 1000)) * 100, 2),
            "counters": dict(sorted(self.counters.items())),
            "gpu": {
                "samples": len(self.gpu_samples),
                "utilisation_pct": agg(gpu_utils),
                "memory_used_mb": agg(gpu_mem),
            },
            "system": {
                "samples": len(self.gpu_samples),
                "cpu_pct": agg(cpu_utils),
            },
            "hardware": self.hw_report(),
            "per_video": self.per_video,
            "errors": self.counters.get("errors", 0),
        }
        if summary_extra:
            summary.update(summary_extra)

        (self.out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
        self.log(kind="run_end", wall_s=round(total_s, 4))
        self.close()
        return summary

    def close(self) -> None:
        for fh in (self._jsonl, self._errl, self._stage_csv, self._events_csv, self._gpu_csv):
            try:
                fh.close()
            except Exception:
                pass
        if self._nvml:
            try:
                self._nvml.nvmlShutdown()
            except Exception:
                pass

    def __enter__(self) -> "Telemetry":
        return self

    def __exit__(self, *exc: object) -> None:
        if not self._jsonl.closed:
            self.close()
