import { useMemo, useState } from "react";
import {
  Camera,
  Download,
  Grid2x2,
  LayoutGrid,
  Maximize2,
  Boxes,
  Tag,
  Waypoints,
  Spline,
  ScanFace,
  Hash,
  Flame,
  Crosshair,
  ShieldAlert,
  FileText,
  Film,
  Play,
  Layers,
  Triangle,
  Video,
  Bone,
  Thermometer,
  GitBranch,
  MapPinned,
  Fingerprint,
} from "lucide-react";
import { CAMERAS, CAM_BY_ID, USE_CASE_REELS } from "../lib/data";
import { ANNOTATION_LOOP, ANNOTATION_META } from "../lib/annotations";
import { CAM_CALIB, depthColor, fmtDepth, pairForCam, penaltiesFor, sgmQuality } from "../lib/sgm";
import { downloadAnnotatedSnapshotPNG, downloadCameraVideoClip } from "../lib/downloads";
import { ago } from "../lib/sim";
import { useApp, type Overlays } from "../state/store";
import { cn } from "../utils/cn";
import { CameraFrame, CLS_COLOR, MiniFeed } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Segmented, Slider, Stat, ViewHead } from "../components/ui";

const TOGGLES: { k: keyof Overlays; label: string; icon: typeof Boxes }[] = [
  { k: "boxes", label: "Boxes", icon: LayoutGrid },
  { k: "labels", label: "Labels", icon: Tag },
  { k: "trails", label: "Trails", icon: Spline },
  { k: "fence", label: "Fence", icon: Waypoints },
  { k: "plates", label: "ANPR", icon: Hash },
  { k: "faces", label: "Face", icon: ScanFace },
  { k: "heat", label: "Heat", icon: Flame },
  { k: "depth", label: "Depth", icon: Layers },
  { k: "pose", label: "Pose", icon: Bone },
  { k: "thermal", label: "Thermal", icon: Thermometer },
];

export function LiveWall() {
  const app = useApp();
  const { camId, setCamId, layout, setLayout, overlays, minConf, world, events, zones, metrics, tier, setTier, poses, thermalBlobs } = app;
  const cam = CAM_BY_ID[camId];
  const [webcamBusy, setWebcamBusy] = useState(false);
  const tracks = world[camId] ?? [];
  const [focus, setFocus] = useState<string | null>(null);

  const zoneLine = useMemo(() => {
    const z = zones.find((x) => x.cam === camId && x.enabled);
    if (!z) return undefined;
    return z.points ?? DEFAULT_GEO[camId] ?? DEFAULT_LINE;
  }, [zones, camId]);

  const alertTrack = useMemo(() => {
    const e = events.find((x) => x.status === "new" && x.cam === cam.code);
    return e ? e.track.replace("#", "") : null;
  }, [events, cam.code]);

  const counts = useMemo(() => {
    const c = { person: 0, vehicle: 0, uas: 0, face: 0 };
    for (const t of tracks) {
      if (t.conf < minConf) continue;
      if (t.cls === "person") c.person++;
      if (t.cls === "vehicle") c.vehicle++;
      if (t.cls === "uas") c.uas++;
      if (t.faceScore) c.face++;
    }
    return c;
  }, [tracks, minConf]);

  const sgmInfo = useMemo(() => {
    const shown = tracks.filter((t) => t.conf >= minConf && t.depthM != null);
    const nearest = shown.length ? shown.reduce((a, b) => ((a.depthM ?? 1e9) < (b.depthM ?? 1e9) ? a : b)) : null;
    return { nearest, pair: pairForCam(camId), calib: CAM_CALIB[camId], q: sgmQuality(app.sgm), pen: penaltiesFor(app.sgm.smoothness) };
  }, [tracks, minConf, camId, app.sgm]);

  const annotMeta = ANNOTATION_META[camId];

  const grid = layout === 1 ? 1 : layout === 4 ? 2 : 3;

  const stageAlert = useMemo(
    () =>
      events.find(
        (e) => e.status === "new" && (e.sev === "critical" || e.sev === "high") && Date.now() - e.t < 75_000,
      ) ?? null,
    [events],
  );

  return (
    <>
      {/* Surface the new reasoning layer on the default console landing view. */}
      <div className="mb-4 grid gap-0 overflow-hidden rounded-[15px] border border-[#252b29] bg-[#171b19] shadow-[0_18px_48px_-34px_rgba(16,28,22,.55)] md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-start gap-3.5 px-4 py-4 sm:px-5">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#8ad4b4]/20 bg-[#0e6d61]/20 text-[#8ad4b4]">
            <GitBranch size={17} strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-display text-[14px] font-semibold tracking-tight text-white">From camera alerts to one response</span>
              <span className="micro rounded-full border border-[#8ad4b4]/20 bg-[#8ad4b4]/10 px-2 py-[3px] text-[#8ad4b4]">incident intelligence</span>
            </div>
            <p className="mt-1 max-w-[78ch] text-[11.5px] leading-[1.5] text-white/52">
              Five cameras connect a UAS payload drop, pickup, vehicle handoff and watchlist plate into one custody chain. The Response Twin then solves a QRT intercept.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-white/42">
              <span className="rounded-[5px] border border-white/10 bg-white/[.04] px-1.5 py-[3px]">5 source feeds</span>
              <span className="text-white/20">/</span>
              <span className="rounded-[5px] border border-white/10 bg-white/[.04] px-1.5 py-[3px]">4 object handoffs</span>
              <span className="text-white/20">/</span>
              <span className="rounded-[5px] border border-white/10 bg-white/[.04] px-1.5 py-[3px]">earliest-feasible intercept</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3 md:max-w-[430px] md:justify-end md:border-l md:border-t-0 sm:px-5">
          <button
            onClick={() => app.setView("incident")}
            className="flex h-8 items-center gap-1.5 rounded-[8px] border border-white/15 bg-white/[.06] px-2.5 text-[11px] font-medium text-white/85 transition-colors hover:border-[#8ad4b4]/40 hover:bg-[#0e6d61]/30 hover:text-white"
          >
            <GitBranch size={12} /> Open incident graph
          </button>
          <button
            onClick={() => app.setView("response")}
            className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#0e6d61] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#0b5d53]"
          >
            <MapPinned size={12} /> Plan response
          </button>
          <button
            onClick={() => app.setView("tactical")}
            className="flex h-8 items-center gap-1.5 rounded-[8px] border border-white/15 bg-white/[.06] px-2.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/[.12] hover:text-white"
          >
            <Crosshair size={12} /> 3D map
          </button>
          <button
            onClick={() => app.setView("evidence")}
            className="flex h-8 items-center gap-1.5 rounded-[8px] border border-white/15 bg-white/[.06] px-2.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/[.12] hover:text-white"
          >
            <Fingerprint size={12} /> Evidence ledger
          </button>
        </div>
      </div>

      {/* situation ribbon */}
      <div className="mb-4 flex flex-wrap items-stretch gap-px overflow-hidden rounded-[13px] border border-hairline bg-hairline">
        {[
          { k: "Sector picture", v: "Sector 4 · 7 sites", s: "normal · no mass movement" },
          { k: "Feeds analysed", v: "67 of 71", s: "4 awaiting fibre repair" },
          { k: "Armed zones", v: `${zones.filter((z) => z.enabled).length} tripwires`, s: `${zones.length - zones.filter((z) => z.enabled).length} disarmed` },
          { k: "Night window", v: "in 3 h 12 m", s: "IR cut scheduled 18:40" },
          { k: "Open events", v: `${events.filter((e) => e.status === "new").length}`, s: "SLA 90 s to acknowledge" },
        ].map((x) => (
          <div key={x.k} className="flex-1 bg-surface px-3.5 py-2.5 transition-colors hover:bg-paper/70">
            <Label>{x.k}</Label>
            <div className="mt-1 text-[13px] font-semibold tracking-tight text-ink tnum">{x.v}</div>
            <div className="mt-0.5 truncate text-[10.5px] text-ink3">{x.s}</div>
          </div>
        ))}
      </div>

      <ViewHead
        kicker="Operations · realtime"
        title="Live Wall"
        desc="Standard CCTV streams, decoded on the edge and analysed frame-by-frame. Everything below is software — no smart cameras, no proprietary boxes."
        right={
          <>
            <Segmented
              value={tier}
              onChange={(v) => setTier(v)}
              options={[
                { value: "edge", label: "Edge" },
                { value: "balanced", label: "Balanced" },
                { value: "core", label: "Core GPU" },
              ]}
            />
            <Segmented
              value={String(layout)}
              onChange={(v) => setLayout(Number(v) as 1 | 4 | 9)}
              options={[
                { value: "1", label: <Maximize2 size={12} /> },
                { value: "4", label: <Grid2x2 size={12} /> },
                { value: "9", label: <LayoutGrid size={12} /> },
              ]}
            />
            <Btn
              icon={<Camera size={13} />}
              onClick={() => {
                downloadAnnotatedSnapshotPNG(cam, tracks, minConf, zoneLine);
                app.say(`Annotated PNG snapshot downloaded · ${cam.code}`);
              }}
            >
              Capture PNG
            </Btn>
            <Btn
              variant="primary"
              icon={<FileText size={13} />}
              onClick={() => {
                const targetEv = events.find((e) => e.cam === cam.code) ?? events[0];
                if (targetEv) app.setDossierEventId(targetEv.id);
              }}
            >
              Incident Report
            </Btn>
            {cam.isWebcam && (
              <Btn
                variant="primary"
                icon={<Video size={13} />}
                disabled={webcamBusy}
                onClick={async () => {
                  setWebcamBusy(true);
                  app.say(await app.requestWebcam());
                  setWebcamBusy(false);
                }}
              >
                {app.webcamStream ? "Restart camera" : "Enable camera"}
              </Btn>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_326px]">
        <div className="min-w-0 space-y-4">
          {/* stage */}
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage shadow-[0_30px_80px_-50px_rgba(10,12,16,.9)]">
              {stageAlert && (
                <div className="slidein absolute left-1/2 top-11 z-20 w-[min(430px,88%)] -translate-x-1/2">
                  <div className="flex items-center gap-3 rounded-[12px] border border-alert/35 bg-[#1c1012]/90 px-3 py-2.5 shadow-float backdrop-blur-xl">
                    <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-alert/20">
                      <span className="absolute inset-0 rounded-full border border-alert/50 ping-ring" />
                      <ShieldAlert size={12} className="text-[#ff7a6d]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold tracking-tight text-white">
                        {stageAlert.type} · {stageAlert.zone ?? stageAlert.site}
                      </div>
                      <div className="tnum mt-0.5 font-mono text-[9.5px] text-white/55">
                        {stageAlert.cam} · {stageAlert.track} · conf {(stageAlert.conf * 100).toFixed(0)}% · {ago(stageAlert.t)} ago
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Btn variant="stage" onClick={() => app.act(stageAlert.id, "ack")}>
                        ack
                      </Btn>
                      <Btn variant="stage" onClick={() => app.setDossierEventId(stageAlert.id)}>
                        report
                      </Btn>
                      <Btn
                        variant="stage"
                        onClick={() => {
                          const target = CAMERAS.find((c) => c.code === stageAlert.cam);
                          if (target) setCamId(target.id);
                          app.setView("events");
                          app.setOpenEvent(stageAlert.id);
                        }}
                      >
                        open
                      </Btn>
                    </div>
                  </div>
                </div>
              )}
              {layout === 1 ? (
                <CameraFrame
                  cam={cam}
                  tracks={tracks}
                  minConf={minConf}
                  overlays={overlays}
                  zoneLines={overlays.fence ? zoneLine : undefined}
                  alerting={alertTrack}
                  mediaStream={cam.isWebcam ? app.webcamStream : null}
                  poses={poses[cam.id]}
                  thermalBlobs={thermalBlobs[cam.id]}
                />
              ) : (
                <div className="grid gap-[2px] bg-[#24272e] p-[2px]" style={{ gridTemplateColumns: `repeat(${grid},minmax(0,1fr))` }}>
                  {CAMERAS.slice(0, grid * grid).map((c) => {
                    const ts = (world[c.id] ?? []).filter((t) => t.conf >= minConf);
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCamId(c.id);
                          setLayout(1);
                        }}
                        className={cn(
                          "group relative overflow-hidden transition-transform duration-300 hover:z-10 hover:scale-[1.015]",
                          c.id === camId && "ring-2 ring-inset ring-signal",
                        )}
                      >
                        <MiniFeed cam={c} tracks={world[c.id] ?? []} liveVideo />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                          <span className="micro text-white/85">{c.code}</span>
                          <span className="tnum font-mono text-[9px] text-white/70">{ts.length} obj</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* stage controls */}
              <div className="on-stage relative z-10 border-t border-stagehair bg-[#111318]/95 px-3 py-3 backdrop-blur-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {TOGGLES.map((t) => {
                      const on = overlays[t.k];
                      const Ico = t.icon;
                      return (
                        <button
                          key={t.k}
                          onClick={() => app.toggleOverlay(t.k)}
                          className={cn(
                            "flex h-7 items-center gap-1.5 rounded-[8px] border px-2 text-[11.5px] font-medium tracking-tight transition-all duration-200 active:scale-95",
                            on
                              ? "border-white/20 bg-white/[0.14] text-white"
                              : "border-white/8 bg-white/[0.04] text-white/45 hover:bg-white/[0.09] hover:text-white/75",
                          )}
                        >
                          <Ico size={11.5} />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="ml-auto flex items-center gap-4">
                    <div className="hidden items-center gap-2.5 border-r border-white/10 pr-4 xl:flex">
                      {[
                        ["#ef6c33", "person"],
                        ["#4d8dff", "vehicle"],
                        ["#fb7185", "uas"],
                        ["#21b8a2", "face"],
                        ["#f2c94c", "zone"],
                      ].map(([c, l]) => (
                        <span key={l as string} className="flex items-center gap-1 font-mono text-[9.5px] text-white/45">
                          <span className="h-[6px] w-[6px] rounded-[2px]" style={{ background: c as string }} />
                          {l as string}
                        </span>
                      ))}
                    </div>
                    <div className="w-[168px]">
                      <Slider
                        dark
                        label="Min confidence"
                        value={minConf}
                        min={0.3}
                        max={0.95}
                        step={0.01}
                        onChange={app.setMinConf}
                        fmt={(v) => `${(v * 100).toFixed(0)}%`}
                        accent="#7fd6c8"
                      />
                    </div>
                    <span className="hidden items-center gap-1.5 font-mono text-[10px] text-white/45 md:flex">
                      <Crosshair size={11} /> {counts.person}p / {counts.vehicle}v{counts.uas > 0 && ` / ${counts.uas}u`}
                    </span>
                    <span className="hidden items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[9px] text-white/50 lg:flex" title={annotMeta?.note ?? "Manual annotations"}>
                      MANUAL·{ANNOTATION_LOOP}s
                    </span>
                    <Btn
                      variant="stage"
                      onClick={() => downloadCameraVideoClip(cam, app.say)}
                      icon={<Download size={12} />}
                    >
                      Download Clip (.mp4)
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* inference mode toggle */}
          <Reveal delay={40}>
            <Card hover={false} className="p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Triangle size={14} className={cn(app.useInference ? "text-[#ff7a6d]" : "text-ink4")} />
                  <span className="text-[13px] font-semibold tracking-tight">Inference mode</span>
                  <span className={cn("micro rounded-full px-2 py-[3px]", app.useInference ? "bg-[#ff7a6d]/10 text-[#ff7a6d]" : "bg-ink/[0.05] text-ink3")}>
                    {app.useInference ? "LIVE PIPELINE" : "manual annotations"}
                  </span>
                </div>
                <button
                  onClick={() => app.setUseInference(!app.useInference)}
                  className={cn(
                    "relative h-[24px] w-[44px] shrink-0 rounded-full transition-colors duration-300",
                    app.useInference ? "bg-[#ff7a6d]" : "bg-ink/[0.18]",
                  )}
                >
                  <span className={cn("absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.28)] transition-all duration-300", app.useInference ? "left-[22px]" : "left-[2px]")} />
                </button>
              </div>
              <p className="mt-2 text-[11.5px] leading-[1.5] text-ink3">
                {app.useInference
                  ? "Active pipeline: motion-gate → perceptual hash → YOLO-seg → ByteTrack interpolation → ANPR + FRS + UAS heuristic + tamper + virtual fence. Canvas reads may be blocked by CORS on remote feeds."
                  : "Boxes are hand-authored keyframes on a 20 s loop. No detector runs; event logs are independent. SGM depth uses manual ground-plane calibration."}
              </p>
              {app.useInference && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["Motion gate", "pHash spoof", "YOLO-seg", "ByteTrack", "ANPR", "FRS", "UAS heuristic", "Tamper (always-on)", "SGM depth"].map((s) => (
                      <span key={s} className="rounded-[6px] bg-ink/[0.04] px-2 py-[3px] font-mono text-[9.5px] text-ink2 ring-1 ring-ink/[0.06]">
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-[8px] bg-ink/[0.035] px-2.5 py-2">
                      <div className="font-mono text-[10px] text-ink3">frames processed</div>
                      <div className="tnum font-display text-[18px] font-semibold">{app.pipelineStats.framesProcessed}</div>
                    </div>
                    <div className="rounded-[8px] bg-ink/[0.035] px-2.5 py-2">
                      <div className="font-mono text-[10px] text-ink3">skipped (idle)</div>
                      <div className="tnum font-display text-[18px] font-semibold">{app.pipelineStats.framesSkipped}</div>
                    </div>
                    <div className="rounded-[8px] bg-ink/[0.035] px-2.5 py-2">
                      <div className="font-mono text-[10px] text-ink3">avg detections</div>
                      <div className="tnum font-display text-[18px] font-semibold">{app.pipelineStats.detectionsPerFrame.toFixed(1)}</div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-ink3">
                    <span>motion: {(app.pipelineStats.avgMotion * 1000).toFixed(1)}‰</span>
                    <span>tamper events: {app.pipelineStats.tamperEvents}</span>
                    <span>frozen: {app.pipelineStats.frozenFrames}</span>
                  </div>
                </>
              )}
            </Card>
          </Reveal>

          {/* filmstrip */}
          <Reveal delay={60}>
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex w-max gap-2.5">
                {CAMERAS.map((c) => {
                  const ts = (world[c.id] ?? []).filter((t) => t.conf >= minConf);
                  const on = c.id === camId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCamId(c.id)}
                      className={cn(
                        "group w-[186px] shrink-0 overflow-hidden rounded-[12px] border text-left transition-all duration-300 hover:-translate-y-[2px]",
                        on ? "border-signal/40 bg-signal-soft/40 shadow-lift" : "border-hairline bg-surface hover:border-[#d5d2cb] hover:shadow-lift",
                      )}
                    >
                      <div className="relative overflow-hidden">
                        <MiniFeed cam={c} tracks={ts} />
                        {c.status !== "offline" && (
                          <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-[2px] backdrop-blur-sm">
                            <span className="h-[4px] w-[4px] rounded-full bg-[#3ddc97] live-dot" />
                            <span className="micro text-white/85">{ts.length === 0 ? "0.0 idle" : `${(ts.length * 0.8 + 1.2).toFixed(1)} det/s`}</span>
                          </span>
                        )}
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="truncate text-[12px] font-medium tracking-tight text-ink">{c.name}</div>
                        <div className="mt-0.5 flex items-center justify-between font-mono text-[9.5px] text-ink3">
                          <span>{c.code}</span>
                          <span className="tnum">{ts.length} obj</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {/* Problem Statement Use-Case Video Reels */}
          <Reveal delay={90}>
            <Card hover={false} className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <Film size={13.5} className="text-signal" />
                  <span className="font-display text-[13.5px] font-semibold tracking-tight text-ink">
                    Surveillance Use-Case Video Feeds (Problem Statement Capabilities)
                  </span>
                </div>
                <span className="micro text-ink3">11 live H.264 scenarios · click to stream on wall or download MP4</span>
              </div>

              <div className="grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {USE_CASE_REELS.map((uc) => {
                  const isCurrent = camId === uc.camId;
                  const targetCam = CAM_BY_ID[uc.camId] ?? CAMERAS[0];
                  return (
                    <div
                      key={uc.id}
                      className={cn(
                        "group flex flex-col justify-between overflow-hidden rounded-[12px] border transition-all duration-200 hover:-translate-y-[2px] hover:shadow-lift",
                        isCurrent ? "border-signal/45 bg-signal-soft/35" : "border-hairline bg-paper/55 hover:bg-surface",
                      )}
                    >
                      <div>
                        <div
                          onClick={() => {
                            setCamId(uc.camId);
                            setLayout(1);
                            app.say(`Streaming "${uc.title}" on ${targetCam.code}`);
                          }}
                          className="relative aspect-[16/9] w-full cursor-pointer overflow-hidden bg-stage"
                        >
                          <video
                            src={uc.videoUrl}
                            poster={uc.thumb}
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/30" />
                          <div className="absolute left-2 top-2 flex items-center gap-1.5">
                            <span className="rounded-[5px] bg-black/55 px-1.5 py-[2px] font-mono text-[9px] text-white/90 backdrop-blur-sm">
                              {uc.tag}
                            </span>
                            {isCurrent && (
                              <span className="rounded-[5px] bg-signal px-1.5 py-[2px] font-mono text-[8.5px] font-semibold text-white">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <span className="tnum absolute right-2 top-2 rounded-[5px] bg-black/55 px-1.5 py-[2px] font-mono text-[9px] text-white/75 backdrop-blur-sm">
                            {uc.duration}
                          </span>
                          <div className="absolute inset-x-2 bottom-1.5 flex items-center justify-between">
                            <span className="font-mono text-[9px] text-[#7fd6c8]">{uc.model}</span>
                            <span className="font-mono text-[9px] text-white/70">{targetCam.code.split(" / ")[0]}</span>
                          </div>
                        </div>

                        <div className="p-2.5">
                          <div className="text-[12.5px] font-semibold tracking-tight text-ink">{uc.title}</div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-ink3">{uc.summary}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 border-t border-hairline/80 px-2.5 py-2">
                        <button
                          onClick={() => {
                            setCamId(uc.camId);
                            setLayout(1);
                            app.say(`Loaded use-case feed: ${uc.title}`);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-[7px] bg-ink px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-signal"
                        >
                          <Play size={10} /> Watch Feed
                        </button>
                        <button
                          onClick={() => {
                            setCamId(uc.camId);
                            app.setView(uc.targetView);
                          }}
                          className="rounded-[7px] border border-hairline bg-white px-2 py-1 font-mono text-[10px] text-ink2 transition-colors hover:border-ink/30 hover:text-ink"
                          title="Open dedicated analytics workspace"
                        >
                          {uc.targetView}
                        </button>
                        <button
                          onClick={() => downloadCameraVideoClip(targetCam, app.say)}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] border border-hairline bg-white text-ink2 transition-colors hover:border-signal/40 hover:text-signal"
                          title="Download use-case MP4 video clip"
                        >
                          <Download size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Reveal>
        </div>

        {/* telemetry column */}
        <div className="space-y-4">
          <Reveal delay={100}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>Frame telemetry</Label>
                <span className="micro text-signal">{app.running ? "streaming" : "frozen"}</span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-hairline">
                {[
                  { k: "Inference", v: metrics.fps, u: "fps" },
                  { k: "Glass-to-alert", v: metrics.lat, u: "ms" },
                  { k: "GPU util", v: metrics.gpu, u: "%" },
                  { k: "Dropped", v: metrics.drop, u: "%" },
                ].map((m) => (
                  <div key={m.k} className="px-3.5 py-3">
                    <Label>{m.k}</Label>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="tnum font-display text-[21px] font-semibold leading-none tracking-[-0.04em]">{m.v}</span>
                      <span className="font-mono text-[10px] text-ink3">{m.u}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={120}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>SGM stereo depth</Label>
                <button
                  onClick={() => app.toggleOverlay("depth")}
                  className={cn(
                    "micro rounded-full px-2 py-[3px] transition-colors",
                    overlays.depth ? "bg-signal-soft text-signal" : "bg-ink/[0.05] text-ink3 hover:text-ink",
                  )}
                >
                  {overlays.depth ? `D${app.sgm.numDisparities} · on` : "off"}
                </button>
              </div>
              <div className="space-y-3.5 px-3.5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium tracking-tight text-ink">
                      {sgmInfo.pair ? `${sgmInfo.pair.id} · ${sgmInfo.pair.name}` : "Mono fallback · no stereo pair"}
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-ink3">
                      rig {sgmInfo.calib?.rigM ?? 0}m · {sgmInfo.calib?.note ?? ""}
                      {sgmInfo.pair ? ` · ${sgmInfo.pair.id} ${sgmInfo.pair.baselineM}m span` : " · no joint-cal pair"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum font-mono text-[12px] font-semibold text-signal">{(sgmInfo.q.conf * 100).toFixed(0)}%</div>
                    <div className="micro text-ink4">sgm conf</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Slider label="Disparities" value={app.sgm.numDisparities} min={32} max={128} step={32} onChange={(v) => app.setSgm({ numDisparities: v })} fmt={(v) => `D${v}`} />
                  <Slider label="Block size" value={app.sgm.blockSize} min={3} max={11} step={2} onChange={(v) => app.setSgm({ blockSize: v })} fmt={(v) => `${v}×${v}`} />
                  <Slider label="Smoothness P1/P2" value={app.sgm.smoothness} min={0} max={100} step={1} onChange={(v) => app.setSgm({ smoothness: v })} fmt={() => `${sgmInfo.pen.p1}/${sgmInfo.pen.p2}`} />
                  <Slider label="Uniqueness" value={app.sgm.uniqueness} min={5} max={20} step={1} onChange={(v) => app.setSgm({ uniqueness: v })} fmt={(v) => `${v}%`} />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="micro text-ink3">Range legend</span>
                    <span className="tnum font-mono text-[9.5px] text-ink3">+{sgmInfo.q.extraMs}ms · {Math.round(sgmInfo.q.density * 100)}% dense</span>
                  </div>
                  <div
                    className="h-[7px] w-full rounded-full"
                    style={{ background: "linear-gradient(90deg,#ff5a4d,#ef6c33 22%,#f2c94c 45%,#21b8a2 70%,#4d8dff)" }}
                  />
                  <div className="mt-1 flex justify-between font-mono text-[8.5px] text-ink4 tnum">
                    <span>10m</span><span>25m</span><span>50m</span><span>100m+</span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-[9px] bg-ink/[0.035] px-2.5 py-2">
                  <span className="micro text-ink3">Nearest track</span>
                  <span className="tnum font-mono text-[11px] text-ink">
                    {sgmInfo.nearest ? (
                      <>
                        <span className="font-semibold">{sgmInfo.nearest.id}</span>
                        <span style={{ color: depthColor(sgmInfo.nearest.depthM ?? 50) }}> · {fmtDepth(sgmInfo.nearest.depthM ?? 0)}</span>
                        <span className="text-ink4"> · {(sgmInfo.nearest.disparityPx ?? 0) > 0 ? `d${Math.round(sgmInfo.nearest.disparityPx ?? 0)}px` : "mono"}</span>
                      </>
                    ) : (
                      <span className="text-ink4">— no boxes in frame</span>
                    )}
                  </span>
                </div>
                <p className="text-[10.5px] leading-[1.5] text-ink4">
                  Census cost + 8-path aggregation. Ranges use manual ground-plane calibration — no depth model is run.
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={140}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>Tracks in frame</Label>
                <span className="micro text-ink3">{tracks.length} ids · manual</span>
              </div>
              <div className="max-h-[248px] divide-y divide-hairline overflow-y-auto">
                {tracks.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setFocus(focus === t.id ? null : t.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
                      focus === t.id ? "bg-ink/[0.045]" : "hover:bg-ink/[0.025]",
                    )}
                  >
                    <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: CLS_COLOR[t.cls] }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-medium text-ink">{t.id}</span>
                        <span className="micro" style={{ color: CLS_COLOR[t.cls] }}>
                          {t.cls}
                        </span>
                      </span>
                      <span className="mt-1 block truncate font-mono text-[10px] text-ink3">
                        {t.plate ?? `${t.w.toFixed(0)}×${t.h.toFixed(0)} · ${(t.speed * 0.3).toFixed(1)} m/s`}
                        {t.depthM != null && (
                          <span style={{ color: depthColor(t.depthM) }}> · {fmtDepth(t.depthM)}</span>
                        )}
                      </span>
                    </span>
                    <span className="w-14 shrink-0 text-right">
                      <span className="tnum block font-mono text-[10.5px] text-ink2">{(t.conf * 100).toFixed(0)}%</span>
                      <span className="mt-1 block">
                        <Bar pct={t.conf * 100} color={CLS_COLOR[t.cls]} h={3} />
                      </span>
                    </span>
                    <span className="tnum w-11 shrink-0 text-right font-mono text-[9.5px] text-ink3">
                      {t.speed}
                      <span className="block text-[8.5px] text-ink4">km/h {t.heading}</span>
                    </span>
                  </button>
                ))}
                {tracks.length === 0 && <div className="px-3.5 py-6 text-center text-[12px] text-ink3">No track above threshold.</div>}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={180}>
            <Card className="p-0">
              <div className="px-1">
                <Stat
                  k="Events on this feed"
                  v={events.filter((e) => e.cam === cam.code).length}
                  sub={`last: ${events.find((e) => e.cam === cam.code) ? ago(events.find((e) => e.cam === cam.code)!.t) : "—"}`}
                  color="#ef6c33"
                  spark={[3, 6, 4, 9, 7, 12, 8, 14, 11, 17, 15, 21]}
                />
              </div>
              <div className="border-t border-hairline px-3.5 py-3">
                <Label className="mb-2">Zone pressure</Label>
                <div className="space-y-2.5">
                  {zones
                    .filter((z) => z.cam === camId || z.enabled)
                    .slice(0, 3)
                    .map((z) => (
                      <div key={z.id}>
                        <div className="mb-1 flex items-center justify-between text-[11.5px]">
                          <span className="truncate tracking-tight text-ink2">{z.name}</span>
                          <span className={cn("tnum font-mono text-[10px]", z.enabled ? "text-signal" : "text-ink4")}>
                            {z.enabled ? `${z.hits} hits` : "disarmed"}
                          </span>
                        </div>
                        <Bar pct={Math.min(100, z.hits * 2.2)} color={z.enabled ? "#0e6d61" : "#aaaeb4"} h={4} />
                      </div>
                    ))}
                </div>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={220}>
            <div className="rounded-[13px] border border-dashed border-[#d7d4cd] bg-paper/70 px-3.5 py-3">
              <Label className="mb-1.5">Annotation mode · manual</Label>
              <p className="text-[11.5px] leading-[1.5] text-ink2">
                Boxes on this feed are hand-annotated keyframes on a {ANNOTATION_LOOP}s loop ({annotMeta?.note ?? "no script"}). No detector is run; event logs are generated independently and left unchanged.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {["Manual-bbox", "SGM-depth", "ByteTrack-off"].map((m) => (
                  <span key={m} className="rounded-full bg-white px-2 py-[3px] font-mono text-[9.5px] text-ink3 ring-1 ring-hairline">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}

const DEFAULT_LINE: [number, number][] = [
  [4, 66],
  [34, 58],
  [66, 62],
  [96, 52],
];

const DEFAULT_GEO: Record<string, [number, number][]> = {
  c01: [
    [8, 72],
    [38, 61],
    [72, 66],
    [94, 55],
  ],
  c06: [
    [16, 40],
    [58, 32],
    [86, 58],
    [40, 74],
  ],
};
