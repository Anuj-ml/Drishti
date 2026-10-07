"""Video-processing fundamentals: motion gate, perceptual hash, letterbox.

These run before any heavy model. The motion gate is the single biggest
optimisation in the pipeline — heavy detectors only fire when the scene
actually changed. The perceptual hash is built once and reused for two
different features: frozen-feed detection (self-tamper) and replayed-loop
detection (cyber spoof).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np


# ── 1. Frame sampling: motion gate ───────────────────────
@dataclass
class MotionGate:
    """Frame-difference gate deciding whether heavy inference should run."""

    threshold: float = 0.008
    max_idle: int = 30
    pixel_step: int = 16

    prev_gray: np.ndarray | None = None
    prev_small: np.ndarray | None = None
    idle_frames: int = 0
    last_score: float = 1.0

    def update(self, frame: np.ndarray) -> float:
        """Feed a BGR frame; returns a 0-1 normalised motion score."""
        small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        if self.prev_small is None:
            self.prev_small = gray
            self.last_score = 1.0
            return 1.0
        diff = cv2.absdiff(gray, self.prev_small)
        score = float(diff.mean()) / 255.0
        self.prev_small = gray
        self.last_score = score
        return score

    def should_run(self) -> tuple[bool, str]:
        if self.last_score > self.threshold:
            self.idle_frames = 0
            return True, "motion"
        self.idle_frames += 1
        if self.idle_frames >= self.max_idle:
            self.idle_frames = 0
            return True, "recheck"
        return False, "idle"


# ── 2. Perceptual hash (pHash) ───────────────────────────
@dataclass
class FrameHasher:
    """64-bit perceptual hash.

    Dual use:
      * frozen feed  — consecutive hashes nearly identical
      * spoof replay — hash recurs far earlier in history with different neighbours
    """

    size: int = 8
    history: list[str] = field(default_factory=list)
    max_history: int = 900

    def hash(self, frame: np.ndarray) -> str:
        small = cv2.resize(frame, (self.size, self.size), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        dct = cv2.dct(gray)
        flat = dct.flatten()
        mean = flat[1:].mean()
        bits = (flat[1:] > mean).astype(np.uint8)
        h = "".join(str(b) for b in bits)
        self.history.append(h)
        if len(self.history) > self.max_history:
            self.history.pop(0)
        return h

    @staticmethod
    def hamming(a: str, b: str) -> int:
        return sum(1 for x, y in zip(a, b) if x != y)

    def is_frozen(self, current: str, max_hamming: int = 3, window: int = 3) -> bool:
        if len(self.history) < window + 1:
            return False
        recent = self.history[-(window + 1):-1]
        return all(self.hamming(current, h) <= max_hamming for h in recent)

    def is_replay(self, current: str, window: int = 600, tol: int = 2) -> bool:
        if len(self.history) < 40:
            return False
        start = max(0, len(self.history) - window)
        for i in range(start, len(self.history) - 12):
            if self.hamming(current, self.history[i]) <= tol:
                return True
        return False


# ── 3. Letterbox resize (YOLO standard) ──────────────────
def letterbox(
    frame: np.ndarray,
    size: int = 640,
    pad_value: int = 114,
) -> tuple[np.ndarray, dict[str, float]]:
    """Resize keeping aspect ratio and pad to a square.

    Returns (letterboxed_image, transform) where transform can map
    model-space coordinates back to original frame coordinates.
    """
    h, w = frame.shape[:2]
    scale = min(size / w, size / h)
    nw, nh = round(w * scale), round(h * scale)
    resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)
    top = (size - nh) // 2
    left = (size - nw) // 2
    out = np.full((size, size, 3), pad_value, dtype=np.uint8)
    out[top:top + nh, left:left + nw] = resized
    transform = {
        "scale": scale,
        "pad_left": left,
        "pad_top": top,
        "orig_w": w,
        "orig_h": h,
        "size": size,
    }
    return out, transform


def unletterbox_box(
    box: tuple[float, float, float, float],
    t: dict[str, float],
) -> tuple[int, int, int, int]:
    """Map [x1,y1,x2,y2] from letterbox space back to original pixels."""
    x1 = (box[0] - t["pad_left"]) / t["scale"]
    y1 = (box[1] - t["pad_top"]) / t["scale"]
    x2 = (box[2] - t["pad_left"]) / t["scale"]
    y2 = (box[3] - t["pad_top"]) / t["scale"]
    return (
        max(0, min(t["orig_w"], int(round(x1)))),
        max(0, min(t["orig_h"], int(round(y1)))),
        max(0, min(t["orig_w"], int(round(x2)))),
        max(0, min(t["orig_h"], int(round(y2)))),
    )


def unletterbox_mask(
    mask: np.ndarray,
    t: dict[str, float],
) -> np.ndarray:
    """Warp a model-space mask back to original frame size.

    The letterbox is a pure scale + translate, so a single affine undo is
    exact and far cheaper than re-running the model on the original frame.
    """
    import cv2

    size = int(t["size"])
    inv = np.array(
        [[1.0 / t["scale"], 0.0, -t["pad_left"] / t["scale"]],
         [0.0, 1.0 / t["scale"], -t["pad_top"] / t["scale"]]],
        dtype=np.float32,
    )
    src = mask.astype(np.uint8)
    if src.shape[0] != size or src.shape[1] != size:
        src = cv2.resize(src, (size, size), interpolation=cv2.INTER_NEAREST)
    warped = cv2.warpAffine(
        src, inv, (int(t["orig_w"]), int(t["orig_h"])),
        flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0,
    )
    return warped.astype(bool)


def unletterbox_poly(
    poly: np.ndarray,
    t: dict[str, float],
) -> np.ndarray:
    """Map an Nx2 polygon from letterbox space back to original pixels."""
    pts = poly.astype(np.float32).copy()
    pts[:, 0] = (pts[:, 0] - t["pad_left"]) / t["scale"]
    pts[:, 1] = (pts[:, 1] - t["pad_top"]) / t["scale"]
    pts[:, 0] = np.clip(pts[:, 0], 0, t["orig_w"])
    pts[:, 1] = np.clip(pts[:, 1], 0, t["orig_h"])
    return pts.astype(np.int32)


# ── 4. Scene-integrity primitives for the tamper stage ──
def luminance(frame: np.ndarray) -> float:
    return float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean())


def edge_density(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    return float(edges.mean())


def frame_digest(frame: np.ndarray) -> str:
    """Cheap content digest (md5 of a 32x32 thumbnail)."""
    small = cv2.resize(frame, (32, 32), interpolation=cv2.INTER_AREA)
    return hashlib.md5(small.tobytes()).hexdigest()


# ── 5. Ground-plane depth from foot position ─────────────
@dataclass
class GroundCalib:
    """Pinhole ground-plane calibration for a single camera."""

    mode: str = "ground"            # ground | aerial | sky | fixed
    horizon_y: float = 45.0         # % of frame height
    cam_height_m: float = 5.0
    focal_px: float = 1000.0
    rig_m: float = 1.0              # stereo rig baseline, 0 = mono
    fixed_depth_m: float = 30.0

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "GroundCalib":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in known})

    def depth(self, foot_y_px: float, frame_h: float, box_w_pct: float = 8.0) -> tuple[float, float]:
        """Return (depth_m, disparity_px) for a foot pixel row."""
        foot_pct = (foot_y_px / max(1.0, frame_h)) * 100.0
        if self.mode in ("aerial", "fixed"):
            d = self.fixed_depth_m
        elif self.mode == "sky":
            # Slant range from apparent wingspan
            d = 420.0 / max(2.5, box_w_pct)
        else:
            denom = max(2.5, foot_pct - self.horizon_y)
            d = (self.cam_height_m * 250.0) / denom
        d = float(np.clip(d, 3.0, 260.0))
        disparity = (self.rig_m * self.focal_px) / max(4.0, d) if self.rig_m > 0 else 0.0
        return d, disparity

    def depth_band_y(self, depth_m: float, frame_h: float) -> float | None:
        """Frame row (pixels) where a given range crosses the ground plane."""
        if self.mode != "ground":
            return None
        pct = self.horizon_y + (self.cam_height_m * 250.0) / max(4.0, depth_m)
        if not (8 < pct < 96):
            return None
        return pct / 100.0 * frame_h
