"""Run configuration for the IBVAP GPU pipeline.

Values resolve in this order (later wins):
    dataclass defaults  <  JSON config file  <  environment variables  <  CLI flags
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


def _env(name: str, default: str) -> str:
    return os.environ.get(f"IBVAP_{name}", default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    return _env(name, "1" if default else "0").lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    # ── paths ────────────────────────────────────────────
    input_path: str = field(default_factory=lambda: _env("INPUT", "input_videos"))
    output_dir: str = field(default_factory=lambda: _env("OUTPUT", "runs"))
    models_dir: str = field(default_factory=lambda: _env("MODELS", "models"))

    # ── model selection ──────────────────────────────────
    detector_weights: str = field(default_factory=lambda: _env("DETECTOR", "yolo26n-seg.pt"))
    detector_imgsz: int = field(default_factory=lambda: _env_int("IMGSZ", 640))
    conf_threshold: float = field(default_factory=lambda: _env_float("CONF", 0.25))
    iou_threshold: float = field(default_factory=lambda: _env_float("IOU", 0.45))
    device: str = field(default_factory=lambda: _env("DEVICE", "auto"))  # auto | cpu | 0
    half: bool = field(default_factory=lambda: _env_bool("HALF", True))

    # tracking
    tracker_config: str = field(default_factory=lambda: _env("TRACKER", "bytetrack.yaml"))

    # ── video processing ─────────────────────────────────
    target_fps: float = field(default_factory=lambda: _env_float("TARGET_FPS", 0.0))  # 0 = native
    letterbox_size: int = field(default_factory=lambda: _env_int("LETTERBOX", 640))
    max_frames: int = field(default_factory=lambda: _env_int("MAX_FRAMES", 0))  # 0 = unlimited
    start_frame: int = field(default_factory=lambda: _env_int("START_FRAME", 0))
    write_video: bool = field(default_factory=lambda: _env_bool("WRITE_VIDEO", True))
    video_codec: str = field(default_factory=lambda: _env("CODEC", "auto"))  # auto | mp4v | avc1

    # ── stage toggles ────────────────────────────────────
    enable_motion_gate: bool = field(default_factory=lambda: _env_bool("MOTION_GATE", True))
    motion_threshold: float = field(default_factory=lambda: _env_float("MOTION_THRESHOLD", 0.008))
    max_idle_frames: int = field(default_factory=lambda: _env_int("MAX_IDLE", 30))

    enable_phash: bool = field(default_factory=lambda: _env_bool("PHASH", True))
    phash_size: int = field(default_factory=lambda: _env_int("PHASH_SIZE", 8))
    frozen_hamming: int = field(default_factory=lambda: _env_int("FROZEN_HAMMING", 3))

    enable_tamper: bool = field(default_factory=lambda: _env_bool("TAMPER", True))
    enable_fence: bool = field(default_factory=lambda: _env_bool("FENCE", True))
    enable_depth: bool = field(default_factory=lambda: _env_bool("DEPTH", True))
    enable_anpr: bool = field(default_factory=lambda: _env_bool("ANPR", False))
    enable_frs: bool = field(default_factory=lambda: _env_bool("FRS", False))
    enable_drone: bool = field(default_factory=lambda: _env_bool("DRONE", True))

    # ── telemetry ────────────────────────────────────────
    telemetry_interval: int = field(default_factory=lambda: _env_int("TELEMETRY_INTERVAL", 30))
    gpu_sampling: bool = field(default_factory=lambda: _env_bool("GPU_SAMPLING", True))
    gpu_sample_every: int = field(default_factory=lambda: _env_int("GPU_SAMPLE_EVERY", 10))
    write_stage_csv: bool = field(default_factory=lambda: _env_bool("STAGE_CSV", True))
    write_events_csv: bool = field(default_factory=lambda: _env_bool("EVENTS_CSV", True))

    # ── annotation rendering ─────────────────────────────
    draw_masks: bool = field(default_factory=lambda: _env_bool("DRAW_MASKS", True))
    draw_boxes: bool = field(default_factory=lambda: _env_bool("DRAW_BOXES", True))
    draw_labels: bool = field(default_factory=lambda: _env_bool("DRAW_LABELS", True))
    draw_trails: bool = field(default_factory=lambda: _env_bool("DRAW_TRAILS", True))
    draw_fence: bool = field(default_factory=lambda: _env_bool("DRAW_FENCE", True))
    draw_depth: bool = field(default_factory=lambda: _env_bool("DRAW_DEPTH", True))
    draw_hud: bool = field(default_factory=lambda: _env_bool("DRAW_HUD", True))
    mask_alpha: float = field(default_factory=lambda: _env_float("MASK_ALPHA", 0.35))

    # ── camera / scene calibration ───────────────────────
    # Applied per camera by matching the video filename stem.
    camera_calib: dict[str, dict[str, Any]] = field(default_factory=dict)

    # ── run metadata ─────────────────────────────────────
    run_name: str = field(default_factory=lambda: _env("RUN_NAME", ""))
    notes: str = field(default_factory=lambda: _env("NOTES", ""))

    # ── helpers ──────────────────────────────────────────
    def resolved_device(self) -> str:
        if self.device != "auto":
            return self.device
        try:
            import torch  # noqa: PLC0415

            return "cuda:0" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    def calib_for(self, stem: str) -> dict[str, Any]:
        """Calibration entry for a video filename stem, with sane defaults."""
        base = {
            "mode": "ground",           # ground | aerial | sky | fixed
            "horizon_y": 45.0,          # % of frame height
            "cam_height_m": 5.0,
            "focal_px": 1000.0,
            "rig_m": 1.0,               # stereo rig baseline, 0 = mono
            "fixed_depth_m": 30.0,
        }
        base.update(self.camera_calib.get(stem, {}))
        return base

    @classmethod
    def from_json(cls, path: str | Path) -> "Config":
        data = json.loads(Path(path).read_text())
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["device_resolved"] = self.resolved_device()
        return d

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2, default=str))
