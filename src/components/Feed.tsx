import { useEffect, useMemo, useRef, useState } from "react";
import type { Camera } from "../lib/data";
import { CAM_CALIB, DEPTH_BANDS, depthColor, fmtDepth, footYForDepth } from "../lib/sgm";
import { BONES, POSTURE_COLOR, POSTURE_NOTE, type Pose } from "../lib/inference/pose";
import { BAND_COLOR, type HeatBlob } from "../lib/inference/thermal";
import { fmtClock, type Tracked } from "../lib/sim";
import { cn } from "../utils/cn";
import { useApp } from "../state/store";
import { useNow } from "./ui";

export const CLS_COLOR: Record<string, string> = {
  person: "#ef6c33",
  vehicle: "#4d8dff",
  face: "#21b8a2",
  animal: "#b58cf5",
  uas: "#fb7185",
  unknown: "#8f959d",
};

export type NightFx = { bright: number; contrast: number; saturate: number; blur: number; ir: number; grain: number };

export function CameraFrame({
  cam,
  tracks,
  minConf,
  overlays,
  fx,
  hud = "full",
  zoneLines,
  pending,
  onPick,
  alerting,
  className,
  dim = false,
  mediaStream,
  poses,
  thermalBlobs,
}: {
  cam: Camera;
  tracks: Tracked[];
  minConf: number;
  overlays: { boxes: boolean; labels: boolean; trails: boolean; fence: boolean; plates: boolean; faces: boolean; heat: boolean; depth: boolean; pose: boolean; thermal: boolean };
  fx?: NightFx;
  hud?: "full" | "mini" | "none";
  zoneLines?: [number, number][];
  pending?: [number, number][];
  onPick?: (x: number, y: number) => void;
  alerting?: string | null;
  className?: string;
  dim?: boolean;
  mediaStream?: MediaStream | null;
  poses?: Pose[];
  thermalBlobs?: HeatBlob[];
}) {
  const { running, sgm } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const now = useNow(1000);
  const shown = tracks.filter((t) => t.conf >= minConf);
  const calib = CAM_CALIB[cam.id];
  const depthBands = useMemo(() => {
    if (!overlays.depth || !calib || calib.mode !== "ground") return [];
    return DEPTH_BANDS.map((d) => ({ d, y: footYForDepth(cam.id, d) })).filter(
      (b): b is { d: number; y: number } => b.y !== null && b.y > 8 && b.y < 96,
    );
  }, [overlays.depth, calib, cam.id]);
  const filter = fx
    ? `brightness(${fx.bright}) contrast(${fx.contrast}) saturate(${fx.saturate}) blur(${fx.blur}px)`
    : cam.status === "degraded"
      ? "contrast(1.06) saturate(.75) brightness(1.02)"
      : "saturate(.88) contrast(1.04) brightness(.96)";

  useEffect(() => {
    setVideoReady(false);
  }, [cam.id, cam.videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (running) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [running, cam.id, cam.videoUrl]);

  const heat = useMemo(
    () =>
      shown.map((t) => ({
        x: t.x + t.w / 2,
        y: t.y + t.h / 2,
        r: 12 + t.w * 1.6,
      })),
    [shown],
  );

  return (
    <div
      data-cam-stage={cam.id}
      className={cn(
        "group relative isolate aspect-[16/9] w-full overflow-hidden bg-stage select-none",
        onPick && "cursor-crosshair",
        className,
      )}
      onClick={(e) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPick(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
      }}
    >
      {cam.isWebcam && !mediaStream ? (
        <div className="absolute inset-0 grid place-items-center bg-[#0a0b0d]">
          <div className="max-w-sm px-6 text-center">
            <div className="micro mb-2 text-[#ff7a6d]">Camera permission required</div>
            <p className="text-[12px] leading-[1.55] text-white/55">
              Allow camera access to run the real inference pipeline on same-origin pixels. Remote Pexels feeds are
              CORS-blocked by their CDN, so this local feed is the only one where canvas reads work.
            </p>
          </div>
        </div>
      ) : cam.status === "offline" ? (
        <div className="absolute inset-0 grid place-items-center bg-[#0a0b0d]">
          <div className="text-center">
            <div className="micro mb-2 text-alert/80">Signal lost</div>
            <div className="font-mono text-[11px] text-white/35">{cam.note}</div>
            <div className="mx-auto mt-4 h-px w-40 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          </div>
        </div>
      ) : (
        <>
          {!cam.isWebcam && (
            <img
              src={cam.url}
              alt={cam.name}
              loading="lazy"
              className={cn("kb absolute inset-0 h-full w-full object-cover will-change-transform", dim && "opacity-60")}
              style={{ filter }}
            />
          )}
          {cam.isWebcam && mediaStream ? (
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && el.srcObject !== mediaStream) el.srcObject = mediaStream;
              }}
              autoPlay
              muted
              playsInline
              onLoadedData={() => setVideoReady(true)}
              onCanPlay={() => {
                videoRef.current?.play().catch(() => {});
                setVideoReady(true);
              }}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                videoReady ? (dim ? "opacity-60" : "opacity-100") : "opacity-0",
              )}
              style={{ filter, transform: "scaleX(-1)" }}
            />
          ) : cam.videoUrl && !cam.isWebcam ? (
            <video
              ref={videoRef}
              key={cam.videoUrl}
              src={cam.videoUrl}
              poster={cam.url}
              autoPlay
              muted
              loop
              playsInline
              crossOrigin="anonymous"
              onLoadedData={() => setVideoReady(true)}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                videoReady ? (dim ? "opacity-60" : "opacity-100") : "opacity-0",
              )}
              style={{ filter }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/62 via-black/6 to-black/28" />
          {fx && fx.ir > 0 && (
            <div
              className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-500"
              style={{
                opacity: fx.ir * 0.85,
                background:
                  "radial-gradient(120% 90% at 50% 60%, rgba(120,255,220,.20), rgba(6,20,18,.5) 78%)",
              }}
            />
          )}
          <div className="scanlines pointer-events-none absolute inset-0" />
          <div
            className="grain pointer-events-none absolute inset-0 transition-opacity duration-500"
            style={{ opacity: fx ? 0.14 + fx.grain * 0.5 : 0.16 }}
          />
        </>
      )}

      {/* analysis sweep */}
      {hud === "full" && cam.status !== "offline" && (
        <div className="pointer-events-none absolute inset-x-0 h-[2px] scan-v bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      )}

      {/* heat map */}
      {overlays.heat &&
        heat.map((h, i) => (
          <div
            key={i}
            className="pointer-events-none absolute rounded-full blur-2xl transition-all duration-[1000ms] ease-linear"
            style={{
              left: `${h.x}%`,
              top: `${h.y}%`,
              width: `${h.r * 2}%`,
              aspectRatio: "1",
              translate: "-50% -50%",
              background: "radial-gradient(circle, rgba(255,110,60,.6), rgba(255,200,60,.18) 60%, transparent 72%)",
            }}
          />
        ))}

      {/* fence + trails svg */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        {overlays.trails &&
          shown.map((t) => (
            <polyline
              key={`tr-${t.key}`}
              points={[...t.trail.map((p) => p.join(",")), `${t.x + t.w / 2},${t.y + t.h / 2}`].join(" ")}
              fill="none"
              stroke={CLS_COLOR[t.cls]}
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.5}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 4"
              className="dashmove"
            />
          ))}
        {overlays.fence && zoneLines && zoneLines.length > 1 && (
          <>
            <polyline
              points={zoneLines.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke="#f2c94c"
              strokeWidth={1.4}
              strokeDasharray="7 5"
              vectorEffect="non-scaling-stroke"
              opacity={0.92}
              className="dashmove"
            />
            {zoneLines.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={0.9} fill="#f2c94c" />
            ))}
          </>
        )}
        {pending?.map((p, i) => (
          <g key={`p-${i}`}>
            <circle cx={p[0]} cy={p[1]} r={1.1} fill="#fff" />
            {i > 0 && (
              <line
                x1={pending[i - 1][0]}
                y1={pending[i - 1][1]}
                x2={p[0]}
                y2={p[1]}
                stroke="#fff"
                strokeWidth={1.2}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        ))}
        {depthBands.map((b) => (
          <line
            key={`sgm-${b.d}`}
            x1={0}
            y1={b.y}
            x2={100}
            y2={b.y}
            stroke={depthColor(b.d)}
            strokeWidth={0.7}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
        ))}
      </svg>

      {/* SGM range-band labels */}
      {depthBands.map((b) => (
        <span
          key={`sgml-${b.d}`}
          className="pointer-events-none absolute right-2 rounded-[4px] bg-black/55 px-1.5 py-[2px] font-mono text-[8.5px] tnum backdrop-blur-sm"
          style={{ top: `calc(${b.y}% - 9px)`, color: depthColor(b.d), border: `1px solid ${depthColor(b.d)}44` }}
        >
          {fmtDepth(b.d)}
        </span>
      ))}
      {overlays.depth && calib && calib.mode !== "ground" && cam.status !== "offline" && (
        <span className="pointer-events-none absolute bottom-2.5 left-3 rounded-[6px] border border-white/15 bg-black/50 px-2 py-1 font-mono text-[9px] text-white/75 backdrop-blur-md">
          {calib.mode === "aerial" ? `SGM · ALT ${calib.fixedDepthM}m AGL` : calib.mode === "sky" ? "SGM · SLANT-RANGE (SIZE)" : `SGM · FIXED ${calib.fixedDepthM}m`}
        </span>
      )}

      {/* detection boxes */}
      {overlays.boxes &&
        shown.map((t) => {
          const col = CLS_COLOR[t.cls];
          const isAlert = alerting === t.id;
          return (
            <div
              key={t.key}
              className="pointer-events-none absolute transition-all duration-[1000ms] ease-linear"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.w}%`,
                height: `${t.h}%`,
              }}
            >
              <div
                className={cn("absolute inset-0 rounded-[3px] transition-colors", isAlert && "ping-ring")}
                style={{
                  border: `1.4px solid ${isAlert ? "#ff5a4d" : col}`,
                  boxShadow: `0 0 22px -8px ${col}, inset 0 0 30px -18px ${col}`,
                  background: `linear-gradient(180deg, ${col}14, transparent 40%)`,
                }}
              />
              {/* corner ticks */}
              {[
                "left-0 top-0 border-l border-t",
                "right-0 top-0 border-r border-t",
                "left-0 bottom-0 border-l border-b",
                "right-0 bottom-0 border-r border-b",
              ].map((c) => (
                <span key={c} className={cn("absolute h-1.5 w-1.5", c)} style={{ borderColor: col }} />
              ))}
              {overlays.labels && (
                <div
                  className="absolute -top-[17px] left-0 flex items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-[2px] font-mono text-[9px] tracking-tight text-white/95 backdrop-blur-sm"
                  style={{ background: `${col}e0` }}
                >
                  <span className="font-semibold">{t.cls.toUpperCase()}</span>
                  <span className="opacity-70">{t.id}</span>
                  <span className="tnum opacity-95">{(t.conf * 100).toFixed(0)}%</span>
                </div>
              )}
              {overlays.faces && t.faceScore && (
                <div
                  className="absolute left-[18%] top-[4%] h-[26%] w-[42%] rounded-[2px] border"
                  style={{ borderColor: CLS_COLOR.face }}
                >
                  <span
                    className="absolute -top-[13px] left-0 font-mono text-[8.5px] tracking-tight"
                    style={{ color: CLS_COLOR.face }}
                  >
                    FACE {t.faceScore.toFixed(2)}
                  </span>
                </div>
              )}
              {overlays.plates && t.plate && (
                <div className="absolute -bottom-[15px] left-1/2 -translate-x-1/2">
                  <span className="rounded-[3px] border border-white/25 bg-[#f7f6f2] px-1.5 py-[1px] font-mono text-[9px] font-medium tracking-[0.02em] text-[#16171a] shadow-[0_1px_4px_rgba(0,0,0,.5)]">
                    {t.plate}
                  </span>
                </div>
              )}
              {overlays.depth && t.depthM != null && (
                <div className="absolute -bottom-[15px] right-0">
                  <span
                    className="flex items-center gap-1 rounded-[3px] border bg-black/60 px-1.5 py-[1px] font-mono text-[8.5px] tnum text-white/90 backdrop-blur-sm"
                    style={{ borderColor: `${depthColor(t.depthM)}66` }}
                  >
                    <span className="h-[5px] w-[5px] rounded-full" style={{ background: depthColor(t.depthM) }} />
                    {fmtDepth(t.depthM)}
                  </span>
                </div>
              )}
            </div>
          );
        })}

      {/* HUD */}
      {hud !== "none" && cam.status !== "offline" && (
        <div className="pointer-events-none absolute inset-0 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-2 rounded-[7px] bg-black/45 px-2 py-1.5 backdrop-blur-md">
                <span className="h-[6px] w-[6px] rounded-full live-dot" style={{ background: runningDot(cam) }} />
                <span className="micro text-white/90">{cam.code}</span>
                {hud === "full" && <span className="micro text-white/45">{cam.kind}</span>}
              </div>
              {hud === "full" && cam.useCase && (
                <span className="hidden rounded-[7px] border border-white/15 bg-black/45 px-2 py-1 font-mono text-[9.5px] text-white/85 backdrop-blur-md sm:inline-flex">
                  {cam.useCase}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {overlays.depth && hud === "full" && (
                <span className="rounded-[6px] border border-white/20 bg-black/45 px-1.5 py-1 font-mono text-[9px] text-white/80 backdrop-blur-md tnum">
                  SGM·D{sgm.numDisparities}
                </span>
              )}
              {videoReady && (
                <span className="rounded-[6px] border border-[#3ddc97]/30 bg-black/45 px-1.5 py-1 font-mono text-[9px] text-[#6ce6b0] backdrop-blur-md">
                  RTSP · H.264
                </span>
              )}
              <span className="rounded-[6px] bg-black/40 px-1.5 py-1 font-mono text-[9.5px] text-white/70 backdrop-blur-md tnum">
                {cam.res}
              </span>
              <span className="rounded-[6px] bg-black/40 px-1.5 py-1 font-mono text-[9.5px] text-white/70 backdrop-blur-md tnum">
                {cam.fps}fps
              </span>
            </div>
          </div>
          {hud === "full" && (
            <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {shown.length > 0 && (
                  <span className="rounded-[6px] bg-black/45 px-2 py-1 font-mono text-[9.5px] text-white/80 backdrop-blur-md">
                    <span className="tnum text-person">{shown.filter((s) => s.cls === "person").length}</span> P ·{" "}
                    <span className="tnum text-vehicle">{shown.filter((s) => s.cls === "vehicle").length}</span> V
                    {shown.some((s) => s.cls === "uas") && (
                      <>
                        {" "}· <span className="tnum" style={{ color: CLS_COLOR.uas }}>{shown.filter((s) => s.cls === "uas").length}</span> U
                      </>
                    )}
                  </span>
                )}
                <span className="rounded-[6px] bg-black/45 px-2 py-1 font-mono text-[9.5px] text-white/60 backdrop-blur-md">
                  IBV-Det · INT8
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9.5px] tracking-tight text-white/55 tnum">
                  {cam.site.toUpperCase()} · {fmtClock(now)} IST
                </span>
                <span className="rounded-[6px] bg-alert/85 px-1.5 py-1 font-mono text-[9px] font-semibold tracking-wide text-white">
                  REC
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* thermal blobs — heat regions under the boxes */}
      {overlays.thermal &&
        cam.status !== "offline" &&
        thermalBlobs?.map((b, i) => {
          const col = BAND_COLOR[b.classification];
          const w = (b.box[2] - b.box[0]) * 100;
          const h = (b.box[3] - b.box[1]) * 100;
          return (
            <div
              key={`th-${i}`}
              className="pointer-events-none absolute rounded-[40%] blur-[3px] transition-all duration-700 ease-out"
              style={{
                left: `${b.box[0] * 100}%`,
                top: `${b.box[1] * 100}%`,
                width: `${w}%`,
                height: `${h}%`,
                background: `radial-gradient(circle at 50% 55%, ${col}cc, ${col}44 55%, transparent 78%)`,
                boxShadow: `0 0 26px -6px ${col}`,
              }}
            >
              <span className="absolute -top-[15px] left-0 whitespace-nowrap rounded-[3px] px-1 py-[1px] font-mono text-[8.5px] tracking-tight text-black/85" style={{ background: col }}>
                {b.classification.toUpperCase()} {Math.round(b.peakTemp * 100)}
              </span>
            </div>
          );
        })}

      {/* pose skeletons */}
      {overlays.pose &&
        poses?.map((p) => {
          const col = POSTURE_COLOR[p.posture];
          const w = (p.bbox[2] - p.bbox[0]) * 100;
          const h = (p.bbox[3] - p.bbox[1]) * 100;
          return (
            <div
              key={`pose-${p.trackId}`}
              className="pointer-events-none absolute transition-all duration-500 ease-out"
              style={{
                left: `${p.bbox[0] * 100}%`,
                top: `${p.bbox[1] * 100}%`,
                width: `${w}%`,
                height: `${h}%`,
              }}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {BONES.map(([a, b], i) => {
                  const ka = p.kp[a];
                  const kb = p.kp[b];
                  if (!ka || !kb) return null;
                  const strength = Math.min(ka.c, kb.c);
                  return (
                    <line
                      key={i}
                      x1={ka.x * 100}
                      y1={ka.y * 100}
                      x2={kb.x * 100}
                      y2={kb.y * 100}
                      stroke={col}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      opacity={0.35 + strength * 0.6}
                    />
                  );
                })}
                {p.kp.map((k, i) => (
                  <circle key={i} cx={k.x * 100} cy={k.y * 100} r={k.c > 0.5 ? 1.6 : 1.1} fill={k.c > 0.5 ? col : "#ffffff88"} />
                ))}
              </svg>
              <span
                className="absolute -top-[16px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[3px] px-1.5 py-[1px] font-mono text-[8.5px] tracking-tight text-white/95"
                style={{ background: `${col}e6` }}
              >
                {POSTURE_NOTE[p.posture]}
              </span>
            </div>
          );
        })}

      {/* corner brackets */}
      <div className="pointer-events-none absolute inset-2">
        {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map(
          (c) => (
            <span key={c} className={cn("absolute h-3.5 w-3.5 border-white/25", c)} />
          ),
        )}
      </div>
    </div>
  );
}

const runningDot = (cam: Camera) => (cam.status === "live" ? "#3ddc97" : cam.status === "degraded" ? "#f2c94c" : "#ff5a4d");

export function MiniFeed({
  cam,
  tracks,
  className,
  liveVideo = false,
}: {
  cam: Camera;
  tracks: Tracked[];
  className?: string;
  liveVideo?: boolean;
}) {
  const { minConf } = useApp();
  const shown = tracks.filter((t) => t.conf >= minConf).slice(0, 6);
  return (
    <div className={cn("relative aspect-[16/9] w-full overflow-hidden bg-stage", className)}>
      <img src={cam.thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-90" style={{ filter: "saturate(.8) contrast(1.05)" }} />
      {liveVideo && cam.status !== "offline" && cam.videoUrl && (
        <video
          src={cam.videoUrl}
          poster={cam.thumb}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-92"
          style={{ filter: "saturate(.82) contrast(1.05)" }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      {cam.status === "offline" ? (
        <div className="absolute inset-0 grid place-items-center bg-[#0a0b0d]">
          <span className="micro text-white/35">offline</span>
        </div>
      ) : (
        shown.map((t) => (
          <span
            key={t.key}
            className="absolute rounded-[2px] border transition-all duration-[1000ms] ease-linear"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: `${t.w}%`,
              height: `${t.h}%`,
              borderColor: CLS_COLOR[t.cls],
              boxShadow: `0 0 10px -4px ${CLS_COLOR[t.cls]}`,
            }}
          />
        ))
      )}
    </div>
  );
}
