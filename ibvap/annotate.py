"""Frame annotation — masks, boxes, fence, depth bands, telemetry HUD."""

from __future__ import annotations

import cv2
import numpy as np

from .analytics import FenceZone
from .detect import Detection
from .preprocess import GroundCalib

PALETTE = {
    "person": (239, 108, 51),
    "car": (77, 141, 255),
    "truck": (77, 141, 255),
    "bus": (77, 141, 255),
    "motorcycle": (77, 141, 255),
    "vehicle": (77, 141, 255),
    "dog": (181, 140, 245),
    "bird": (181, 140, 245),
    "uas": (251, 113, 133),
    "drone": (251, 113, 133),
}

DEPTH_COLORS = [(12, (90, 90, 244)), (25, (51, 140, 239)), (50, (201, 242, 242)), (100, (162, 184, 33)), (1e9, (255, 141, 77))]


def depth_color(d: float) -> tuple[int, int, int]:
    for limit, c in DEPTH_COLORS:
        if d < limit:
            return c
    return DEPTH_COLORS[-1][1]


def fmt_depth(d: float) -> str:
    return f"{d:.0f}m" if d >= 100 else f"{d:.1f}m"


class Annotator:
    def __init__(self, cfg) -> None:
        self.cfg = cfg

    def draw(
        self,
        frame: np.ndarray,
        dets: list[Detection],
        zones: list[FenceZone],
        calib: GroundCalib,
        plates: dict[str, str] | None = None,
        faces: dict[str, tuple[float, str | None]] | None = None,
        drones: set[str] | None = None,
        tamper=None,
        hud: dict | None = None,
    ) -> np.ndarray:
        cfg = self.cfg
        out = frame.copy()
        h, w = out.shape[:2]

        # depth bands (ground plane)
        if cfg.draw_depth and calib.mode == "ground":
            for d in (12, 25, 50, 100):
                y = calib.depth_band_y(d, h)
                if y is None:
                    continue
                c = depth_color(d)
                cv2.line(out, (0, int(y)), (w, int(y)), c, 1, cv2.LINE_AA)
                label = fmt_depth(d)
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
                cv2.rectangle(out, (w - tw - 10, int(y) - th - 7), (w - 4, int(y) - 2), (0, 0, 0), -1)
                cv2.putText(out, label, (w - tw - 7, int(y) - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, c, 1, cv2.LINE_AA)

        # virtual fence zones
        if cfg.draw_fence:
            for z in zones:
                if not z.enabled or not z.points:
                    continue
                col = (0, 220, 255) if z.enabled else (110, 110, 110)
                pts = [(int(x * w), int(y * h)) for x, y in z.points]
                if z.kind in ("tripwire", "direction") and len(pts) >= 2:
                    cv2.line(out, pts[0], pts[1], col, 2, cv2.LINE_AA)
                elif z.kind == "polygon" and len(pts) >= 3:
                    cv2.polylines(out, [np.array(pts, np.int32)], True, col, 2, cv2.LINE_AA)
                elif z.kind == "loiter" and len(pts) >= 3:
                    ov = out.copy()
                    cv2.fillPoly(ov, [np.array(pts, np.int32)], col)
                    cv2.addWeighted(ov, 0.16, out, 0.84, 0, out)
                    cv2.polylines(out, [np.array(pts, np.int32)], True, col, 2, cv2.LINE_AA)
                for p in pts:
                    cv2.circle(out, p, 4, col, -1)

        # detections
        for d in dets:
            col = PALETTE.get(d.cls, (160, 160, 160))
            if drones and d.track_id in drones:
                col = PALETTE["uas"]

            if cfg.draw_masks and d.mask is not None:
                overlay = out.copy()
                overlay[d.mask] = col
                cv2.addWeighted(overlay, cfg.mask_alpha, out, 1 - cfg.mask_alpha, 0, out)

            if cfg.draw_boxes:
                x1, y1, x2, y2 = d.box
                cv2.rectangle(out, (x1, y1), (x2, y2), col, 2, cv2.LINE_AA)

            if d.poly is not None and len(d.poly) > 2:
                cv2.polylines(out, [d.poly], True, col, 1, cv2.LINE_AA)

            if cfg.draw_labels:
                parts = [d.cls, d.track_id, f"{d.conf * 100:.0f}%"]
                if d.depth_m is not None and cfg.draw_depth:
                    parts.append(fmt_depth(d.depth_m))
                if plates and d.track_id in plates:
                    parts.append(plates[d.track_id])
                if faces and d.track_id in faces:
                    s, gid = faces[d.track_id]
                    parts.append(f"F:{s:.2f}" + (f"→{gid}" if gid else ""))
                if drones and d.track_id in drones:
                    parts.append("UAS")
                label = "  ".join(parts)
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                lx, ly = d.box[0], max(th + 6, d.box[1] - 6)
                cv2.rectangle(out, (lx, ly - th - 6), (lx + tw + 8, ly), col, -1)
                cv2.putText(out, label, (lx + 4, ly - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (20, 20, 20), 1, cv2.LINE_AA)

            # foot marker (mask bottom-centre) — the fence reference point
            if cfg.draw_fence:
                cv2.drawMarker(out, d.foot, col, cv2.MARKER_TILTED_CROSS, 9, 1, cv2.LINE_AA)

        if tamper is not None and tamper.state != "normal":
            c = (0, 0, 255)
            cv2.rectangle(out, (0, 0), (w - 1, h - 1), c, 6)
            txt = f"CAMERA INTEGRITY: {tamper.state.upper()} {tamper.confidence * 100:.0f}%"
            cv2.rectangle(out, (10, 10), (10 + cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0][0] + 16, 46), (20, 12, 18), -1)
            cv2.putText(out, txt, (18, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (120, 130, 255), 2, cv2.LINE_AA)

        if cfg.draw_hud and hud:
            self._hud(out, hud)
        return out

    @staticmethod
    def _hud(out: np.ndarray, hud: dict) -> None:
        h, w = out.shape[:2]
        lines = []
        for k, v in hud.items():
            lines.append(f"{k}: {v}")
        pad, lh = 8, 17
        bw = max(cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)[0][0] for t in lines) + pad * 2
        bh = lh * len(lines) + pad * 2
        ov = out.copy()
        cv2.rectangle(ov, (w - bw - 8, 8), (w - 8, 8 + bh), (12, 14, 17), -1)
        cv2.addWeighted(ov, 0.72, out, 0.28, 0, out)
        for i, t in enumerate(lines):
            cv2.putText(out, t, (w - bw - 8 + pad, 8 + pad + lh * (i + 1) - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (206, 232, 226), 1, cv2.LINE_AA)
