"""Stage 1: detection + segmentation + tracking via Ultralytics YOLO.

One model gives person/vehicle boxes AND instance masks. Ultralytics'
built-in ``track()`` runs ByteTrack with persistent IDs, so no separate
tracker wiring is required.

Swap the weights to go from detection-only to segmentation:
    yolo26n.pt       -> boxes only
    yolo26n-seg.pt   -> boxes + instance masks
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .preprocess import unletterbox_box, unletterbox_mask


@dataclass
class Detection:
    track_id: str
    cls: str
    conf: float
    box: tuple[int, int, int, int]            # x1,y1,x2,y2 in original pixels
    mask: np.ndarray | None = None            # full-frame bool mask
    poly: np.ndarray | None = None            # Nx2 int32 polygon in original pixels
    foot: tuple[int, int] = (0, 0)            # bottom-centre of the mask/box
    depth_m: float | None = None
    disparity_px: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class Detector:
    """Thin wrapper so the pipeline does not care which backend runs."""

    def __init__(self, cfg: Any) -> None:
        from ultralytics import YOLO

        self.cfg = cfg
        self.model = YOLO(cfg.detector_weights)
        self.names: dict[int, str] = self.model.names
        self._warm = False

    def warmup(self, imgsz: int) -> None:
        """One dummy inference so the first real frame is not the slowest."""
        if self._warm:
            return
        dummy = np.zeros((imgsz, imgsz, 3), dtype=np.uint8)
        try:
            self.model.predict(dummy, imgsz=imgsz, verbose=False)
        except Exception:
            pass
        self._warm = True

    def infer(
        self,
        model_input: np.ndarray,
        frame_idx: int,
        calib: Any,
        telemetry: Any = None,
        video: str = "",
        transform: dict[str, float] | None = None,
    ) -> list[Detection]:
        """Run detect+track on one frame and return detections in frame space.

        ``model_input`` is the letterboxed image when ``transform`` is given,
        otherwise the raw frame. Coordinates are mapped back to frame space
        either way, so downstream stages never see model-space values.
        """
        cfg = self.cfg
        h, w = frame.shape[:2] if transform is None else (int(transform["orig_h"]), int(transform["orig_w"]))

        results = self.model.track(
            model_input,
            imgsz=cfg.detector_imgsz,
            conf=cfg.conf_threshold,
            iou=cfg.iou_threshold,
            device=cfg.resolved_device(),
            half=cfg.half,
            tracker=cfg.tracker_config,
            persist=True,
            verbose=False,
        )
        r = results[0]

        dets: list[Detection] = []
        if r.boxes is None or len(r.boxes) == 0:
            return dets

        boxes = r.boxes
        masks = getattr(r, "masks", None)
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clss = boxes.cls.cpu().numpy().astype(int)
        ids = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else np.arange(len(xyxy))

        for i in range(len(xyxy)):
            x1, y1, x2, y2 = (int(v) for v in xyxy[i])
            cls = self.names.get(int(clss[i]), str(clss[i]))
            conf = float(confs[i])
            tid = f"#{int(ids[i])}"

            mask = None
            poly = None
            if masks is not None and i < len(masks):
                m = masks[i].data.cpu().numpy()[0].astype(bool)
                mask = cv2_resize_mask(m, w, h)
                poly = mask_to_poly(mask)

            if poly is not None and len(poly) > 0:
                foot = (int(poly[:, 0].mean()), int(poly[:, 1].max()))
            else:
                foot = ((x1 + x2) // 2, y2)

            box_w_pct = (x2 - x1) / max(1, w) * 100.0
            depth, disparity = calib.depth(foot[1], h, box_w_pct)

            dets.append(
                Detection(
                    track_id=tid,
                    cls=cls,
                    conf=conf,
                    box=(x1, y1, x2, y2),
                    mask=mask,
                    poly=poly,
                    foot=foot,
                    depth_m=round(depth, 1),
                    disparity_px=round(disparity, 1),
                )
            )

            if telemetry is not None:
                telemetry.event(
                    kind="detection",
                    stage="detect",
                    video=video,
                    frame_idx=frame_idx,
                    track_id=tid,
                    cls=cls,
                    conf=conf,
                    x=x1, y=y1, w=x2 - x1, h=y2 - y1,
                    extra={"depth_m": dets[-1].depth_m, "has_mask": mask is not None},
                )
        return dets


def cv2_resize_mask(mask: np.ndarray, w: int, h: int) -> np.ndarray:
    import cv2

    return cv2.resize(mask.astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST).astype(bool)


def mask_to_poly(mask: np.ndarray) -> np.ndarray | None:
    """Largest contour of a boolean mask as an Nx2 int32 polygon."""
    import cv2

    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea).reshape(-1, 2).astype(np.int32)
