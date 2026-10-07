"""Stages 2-5: ANPR, FRS, drone heuristic, tamper and virtual fence.

Each stage is independent and degrades gracefully when its optional
weights are absent, so a partial setup still produces a full run.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from .detect import Detection
from .preprocess import GroundCalib


# ── 2. ANPR: plate detect + OCR ──────────────────────────
@dataclass
class PlateRead:
    text: str
    conf: float
    box: tuple[int, int, int, int]
    valid_format: bool
    ocr_conf: float = 0.0


INDIAN_PLATE = re.compile(r"^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{1,4}$")


class Anpr:
    """Plate detector + OCR. Weights optional; regex validation always runs."""

    def __init__(self, models_dir: str = "models") -> None:
        from pathlib import Path

        self.detector = None
        self.reader = None
        p = Path(models_dir)
        det = p / "plate_detect.onnx"
        if det.exists():
            try:
                import onnxruntime as ort

                so = ort.SessionOptions()
                so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                self.detector = ort.InferenceSession(str(det), so, providers=["CPUExecutionProvider"])
            except Exception:
                self.detector = None
        try:
            from paddleocr import PaddleOCR

            self.reader = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        except Exception:
            self.reader = None

    @property
    def ready(self) -> bool:
        return self.detector is not None or self.reader is not None

    def read(self, frame: np.ndarray, det: Detection) -> PlateRead | None:
        """Read a plate from a vehicle crop. Returns None when unavailable."""
        if not self.ready or det.cls not in ("car", "truck", "bus", "motorcycle", "vehicle"):
            return None
        x1, y1, x2, y2 = det.box
        crop = frame[max(0, y1):max(1, y2), max(0, x1):max(1, x2)]
        if crop.size == 0:
            return None
        # Plate region search area is the crop, not the full frame.
        try:
            if self.reader is not None:
                res = self.reader.ocr(crop, cls=True)
                if not res or not res[0]:
                    return None
                best = max(res[0], key=lambda r: r[1][1])
                text = "".join(ch for ch in best[1][0] if ch.isalnum()).upper()
                conf = float(best[1][1])
                box = tuple(int(v) for v in best[0][0]) + (0, 0)
                return PlateRead(
                    text=text,
                    conf=conf,
                    box=(x1 + box[0], y1 + box[1], x1 + box[2], y1 + box[3]),
                    valid_format=bool(INDIAN_PLATE.match(text)),
                    ocr_conf=conf,
                )
        except Exception:
            return None
        return None


# ── 3. FRS: face detect + embed ──────────────────────────
@dataclass
class FaceMatch:
    track_id: str
    score: float
    box: tuple[int, int, int, int]
    gallery_id: str | None
    angle_yaw: float
    quality: float


class Frs:
    """InsightFace wrapper. Enrolled gallery is optional."""

    def __init__(self, models_dir: str = "models") -> None:
        self.app = None
        self.gallery: dict[str, np.ndarray] = {}
        try:
            from insightface.app import FaceAnalysis

            self.app = FaceAnalysis(name="buffalo_l", root=models_dir, providers=["CPUExecutionProvider"])
            self.app.prepare(ctx_id=-1, det_size=(640, 640))
        except Exception:
            self.app = None

    @property
    def ready(self) -> bool:
        return self.app is not None

    def match(self, frame: np.ndarray, det: Detection, threshold: float = 0.62) -> FaceMatch | None:
        if not self.ready or det.cls != "person":
            return None
        try:
            faces = self.app.get(frame)
        except Exception:
            return None
        if not faces:
            return None
        fx1, fy1, fx2, fy2 = det.box
        cx, cy = (fx1 + fx2) // 2, (fy1 + fy2) // 2
        best = min(faces, key=lambda f: abs((f.bbox[0] + f.bbox[2]) / 2 - cx) + abs((f.bbox[1] + f.bbox[3]) / 2 - cy))
        emb = getattr(best, "normed_embedding", None)
        if emb is None:
            return None
        gid, score = None, 0.0
        for k, v in self.gallery.items():
            s = float(np.dot(emb, v))
            if s > score:
                gid, score = k, s
        yaw = float(getattr(best, "pose", [0, 0, 0])[1]) if getattr(best, "pose", None) is not None else 0.0
        quality = float(min(1.0, ((best.bbox[2] - best.bbox[0]) * (best.bbox[3] - best.bbox[1])) / 40000.0))
        return FaceMatch(
            track_id=det.track_id,
            score=round(score, 4),
            box=tuple(int(v) for v in best.bbox),
            gallery_id=gid if score >= threshold else None,
            angle_yaw=round(yaw, 1),
            quality=round(quality, 3),
        )


# ── 5. Drone / UAS heuristic ─────────────────────────────
@dataclass
class DroneVerdict:
    is_drone: bool
    confidence: float
    reasons: list[str] = field(default_factory=list)
    size_score: float = 0.0
    position_score: float = 0.0
    velocity_score: float = 0.0
    pattern_score: float = 0.0


class DroneHeuristic:
    """Size + upper-band + velocity + orbit heuristic. Always runs."""

    def __init__(self, size_max_pct: float = 8.0, upper_band: float = 50.0, min_conf: float = 0.45) -> None:
        self.size_max = size_max_pct
        self.upper_band = upper_band
        self.min_conf = min_conf
        self.hist: dict[str, list[tuple[float, float]]] = {}

    def evaluate(self, det: Detection, frame_shape: tuple[int, int]) -> DroneVerdict:
        h, w = frame_shape
        x1, y1, x2, y2 = det.box
        w_pct = (x2 - x1) / max(1, w) * 100.0
        cy = ((y1 + y2) / 2) / max(1, h) * 100.0
        vx = (det.extra.get("vx", 0.0)) if det.extra else 0.0
        vy = (det.extra.get("vy", 0.0)) if det.extra else 0.0
        speed = float(np.hypot(vx, vy))

        reasons: list[str] = []
        if 1.0 <= w_pct <= self.size_max:
            size = 0.85 + (1 - w_pct / self.size_max) * 0.15
            reasons.append(f"small bbox {w_pct:.1f}%w")
        elif w_pct <= 15:
            size = 0.4
            reasons.append(f"medium bbox {w_pct:.1f}%w")
        else:
            size = 0.15

        if cy < self.upper_band:
            pos = 0.9 - (cy / self.upper_band) * 0.4
            reasons.append(f"upper band y={cy:.0f}%")
        elif cy < 65:
            pos = 0.35
        else:
            pos = 0.1

        if speed < 0.004:
            vel = 0.8
            reasons.append("hover dwell")
        elif speed > 0.012:
            vel = 0.75
            reasons.append("high velocity")
        else:
            vel = 0.2

        trail = self.hist.setdefault(det.track_id, [])
        trail.append((det.foot[0] / max(1, w), det.foot[1] / max(1, h)))
        if len(trail) > 40:
            trail.pop(0)
        pattern = 0.3
        if len(trail) > 16:
            xs = np.array([p[0] for p in trail])
            ys = np.array([p[1] for p in trail])
            if xs.std() > 0.01 and ys.std() > 0.01:
                pattern = 0.65 + min(0.2, len(trail) / 200.0)
                reasons.append("orbit-like trajectory")

        conf = min(0.96, size * 0.3 + pos * 0.25 + vel * 0.2 + pattern * 0.25)
        return DroneVerdict(
            is_drone=conf >= self.min_conf and size > 0.5,
            confidence=round(conf, 3),
            reasons=reasons,
            size_score=round(size, 3),
            position_score=round(pos, 3),
            velocity_score=round(vel, 3),
            pattern_score=round(pattern, 3),
        )


# ── 4. Camera self-tamper / blind ────────────────────────
@dataclass
class TamperResult:
    state: str          # normal | blank | reaim | frozen | signal
    confidence: float
    luminance_drop: float
    edge_loss: float
    frozen: bool
    sustained: int
    detail: str


class TamperDetector:
    """Scene-integrity monitor. Always-on, never motion-gated.

    'Covered = no motion' is exactly the case that must be caught, so this
    stage deliberately runs on every frame.
    """

    def __init__(self, lum_thresh: float = 0.28, edge_thresh: float = 0.35, sustain: int = 4) -> None:
        self.lum_thresh = lum_thresh
        self.edge_thresh = edge_thresh
        self.sustain = sustain
        self.bg_lum = 0.0
        self.bg_edge = 0.0
        self.anomaly = 0

    def analyze(self, frame: np.ndarray, hasher: Any, current_hash: str) -> TamperResult:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        lum = float(gray.mean())
        edge = float(cv2.Canny(gray, 60, 160).mean())

        lum_drop = (self.bg_lum - lum) / self.bg_lum if self.bg_lum > 0 else 0.0
        edge_drop = (self.bg_edge - edge) / self.bg_edge if self.bg_edge > 0 else 0.0
        frozen = hasher.is_frozen(current_hash)

        state, conf, detail = "normal", 0.0, ""
        if frozen:
            state, conf = "frozen", 0.94
            detail = "perceptual hash repeated - feed frozen"
        elif lum_drop > self.lum_thresh and edge_drop > self.edge_thresh:
            # Settled low-variance scene = covered; noisy scene = re-aimed
            if self.anomaly >= 2:
                state = "blank"
                conf = min(0.97, 0.7 + lum_drop * 0.3 + edge_drop * 0.2)
                detail = f"lens cover / blank: lum -{lum_drop * 100:.0f}%, edge -{edge_drop * 100:.0f}%"
            else:
                state = "reaim"
                conf = min(0.95, 0.6 + lum_drop * 0.25 + edge_drop * 0.2)
                detail = f"re-aim / defocus: scene changed {lum_drop * 100:.0f}%"

        if state != "normal":
            self.anomaly += 1
            if self.anomaly < self.sustain:
                state, conf, detail = "normal", 0.0, ""
        else:
            self.anomaly = 0

        # Slow background adaptation while healthy
        self.bg_lum = self.bg_lum * 0.92 + lum * 0.08 if self.bg_lum else lum
        self.bg_edge = self.bg_edge * 0.92 + edge * 0.08 if self.bg_edge else edge

        return TamperResult(state, round(conf, 3), round(lum_drop, 3), round(edge_drop, 3), frozen, self.anomaly, detail)


# ── 6. Virtual fence ─────────────────────────────────────
@dataclass
class FenceZone:
    id: str
    name: str
    kind: str                       # tripwire | polygon | loiter | direction
    points: list[tuple[float, float]]
    enabled: bool = True
    hits: int = 0
    direction: str = "both"
    dwell_s: float = 5.0
    min_size_pct: float = 3.0

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "FenceZone":
        pts = [tuple(p) for p in d.get("points", [])]
        return cls(
            id=d.get("id", "ZF"),
            name=d.get("name", d.get("id", "zone")),
            kind=d.get("kind", "tripwire"),
            points=pts,
            enabled=d.get("enabled", True),
            hits=d.get("hits", 0),
            direction=d.get("direction", "both"),
            dwell_s=float(d.get("dwell_s", 5.0)),
            min_size_pct=float(d.get("min_size_pct", 3.0)),
        )


@dataclass
class FenceCrossing:
    zone_id: str
    track_id: str
    cls: str
    side: str
    foot: tuple[int, int]
    confidence: float


class FenceEngine:
    """Pure geometry on mask foot positions. No model required."""

    def __init__(self) -> None:
        self.state: dict[str, dict[str, Any]] = {}

    def _st(self, zone_id: str, tid: str) -> dict[str, Any]:
        k = f"{zone_id}:{tid}"
        if k not in self.state:
            self.state[k] = {"last": None, "enter": None}
        return self.state[k]

    @staticmethod
    def _side(px: float, py: float, a: tuple[float, float], b: tuple[float, float]) -> str:
        return "A" if (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) > 0 else "B"

    @staticmethod
    def _in_poly(px: float, py: float, pts: list[tuple[float, float]]) -> bool:
        inside = False
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        return inside

    def check(
        self,
        zones: list[FenceZone],
        dets: list[Detection],
        frame_shape: tuple[int, int],
        frame_idx: int,
        telemetry: Any,
        video: str,
    ) -> list[FenceCrossing]:
        h, w = frame_shape
        out: list[FenceCrossing] = []
        for z in zones:
            if not z.enabled or len(z.points) < 2:
                continue
            for d in dets:
                fx, fy = d.foot
                nfx, nfy = fx / max(1, w), fy / max(1, h)
                w_pct = (d.box[2] - d.box[0]) / max(1, w) * 100.0
                if w_pct < z.min_size_pct:
                    continue
                st = self._st(z.id, d.track_id)
                hit: FenceCrossing | None = None

                if z.kind in ("tripwire", "direction"):
                    a, b = z.points[0], z.points[1]
                    side = self._side(nfx, nfy, a, b)
                    prev = st["last"]
                    st["last"] = side
                    if prev and prev != side and prev != "inside":
                        z.hits += 1
                        if z.direction == "entering" and side != "B":
                            continue
                        if z.direction == "exiting" and side != "A":
                            continue
                        hit = FenceCrossing(z.id, d.track_id, d.cls, "entering" if side == "B" else "exiting", d.foot, 0.88)
                else:
                    inside = self._in_poly(nfx, nfy, z.points)
                    if z.kind == "loiter":
                        if inside:
                            if st["enter"] is None:
                                st["enter"] = frame_idx
                            if (frame_idx - st["enter"]) / 25.0 >= z.dwell_s:
                                z.hits += 1
                                hit = FenceCrossing(z.id, d.track_id, d.cls, "inside", d.foot, 0.84)
                        else:
                            st["enter"] = None
                    else:
                        if inside and not st["last"]:
                            st["last"] = "inside"
                            z.hits += 1
                            hit = FenceCrossing(z.id, d.track_id, d.cls, "inside", d.foot, 0.87)

                if hit:
                    out.append(hit)
                    telemetry.event(
                        kind="fence_crossing", stage="fence", video=video, frame_idx=frame_idx,
                        track_id=hit.track_id, cls=hit.cls, conf=hit.confidence,
                        x=hit.foot[0], y=hit.foot[1],
                        extra={"zone": z.id, "side": hit.side, "zone_name": z.name},
                    )
        return out
