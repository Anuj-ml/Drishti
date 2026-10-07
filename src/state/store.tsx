import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CAMERAS, SEED_EVENTS, ZONE_TEMPLATES, WEBCAM, type CamClass, type EventLog, type Severity } from "../lib/data";
import { getAnnotatedTracks } from "../lib/annotations";
import { processFrame } from "../lib/inference/pipeline";
import { syntheticPose } from "../lib/inference/pose";
import type { HeatBlob } from "../lib/inference/thermal";
import { appendEntry, readLedger, verifyLedger, type LedgerEntry, type VerifyResult } from "../lib/ledger";
import { DEMO_NAI, type NaiMarker } from "../lib/intelligence";
import { DEFAULT_SGM, sgmQuality, type SGMParams } from "../lib/sgm";
import { hash, plate, rng, type Range, type Tracked } from "../lib/sim";

export type ViewId =
  | "live"
  | "events"
  | "faces"
  | "vehicles"
  | "fence"
  | "incident"
  | "response"
  | "tactical"
  | "evidence"
  | "threats"
  | "night"
  | "analytics"
  | "sites"
  | "integration";

export type Overlays = {
  boxes: boolean;
  labels: boolean;
  trails: boolean;
  fence: boolean;
  plates: boolean;
  faces: boolean;
  heat: boolean;
  depth: boolean;
  pose: boolean;
  thermal: boolean;
};

export type Zone = {
  id: string;
  name: string;
  mode: string;
  sens: number;
  minSize: number;
  dwell: number;
  enabled: boolean;
  hits: number;
  cam: string;
  points?: [number, number][];
};

export type Metrics = { fps: number; lat: number; gpu: number; drop: number; streams: number; vram: number };
export type PipelineStats = { framesProcessed: number; framesSkipped: number; avgMotion: number; detectionsPerFrame: number; tamperEvents: number; frozenFrames: number };

type Ctx = {
  view: ViewId;
  setView: (v: ViewId) => void;
  camId: string;
  setCamId: (id: string) => void;
  layout: 1 | 4 | 9;
  setLayout: (l: 1 | 4 | 9) => void;
  overlays: Overlays;
  toggleOverlay: (k: keyof Overlays) => void;
  sgm: SGMParams;
  setSgm: (patch: Partial<SGMParams>) => void;
  minConf: number;
  setMinConf: (n: number) => void;
  running: boolean;
  setRunning: (b: boolean) => void;
  tier: "edge" | "balanced" | "core";
  setTier: (t: "edge" | "balanced" | "core") => void;
  tick: number;
  world: Record<string, Tracked[]>;
  metrics: Metrics;
  events: EventLog[];
  addEvent: (e: EventLog) => void;
  act: (id: string, status: EventLog["status"]) => void;
  openEvent: string | null;
  setOpenEvent: (id: string | null) => void;
  dossierEventId: string | null;
  setDossierEventId: (id: string | null) => void;
  reportNotes: Record<string, string>;
  setReportNote: (id: string, note: string) => void;
  poses: Record<string, ReturnType<typeof syntheticPose>[]>;
  thermalBlobs: Record<string, HeatBlob[]>;
  nai: NaiMarker[];
  setNai: (n: NaiMarker[] | ((p: NaiMarker[]) => NaiMarker[])) => void;
  ledger: LedgerEntry[];
  ledgerVerify: VerifyResult | null;
  refreshLedger: () => Promise<void>;
  verifyLedgerNow: () => Promise<void>;
  audit: (action: string, detail: string) => void;
  zones: Zone[];
  saveZone: (z: Zone) => void;
  toggleZone: (id: string) => void;
  deleteZone: (id: string) => void;
  night: { preset: string; bright: number; contrast: number; saturate: number; blur: number; ir: number; grain: number; motion: number };
  setNight: (patch: Partial<Ctx["night"]>) => void;
  range: Range;
  setRange: (r: Range) => void;
  rail: boolean;
  setRail: (b: boolean) => void;
  palette: boolean;
  setPalette: (b: boolean) => void;
  toast: string | null;
  say: (msg: string) => void;
  unread: number;
  clearUnread: () => void;
  query: string;
  setQuery: (q: string) => void;
  useInference: boolean;
  setUseInference: (v: boolean) => void;
  pipelineStats: PipelineStats;
  webcamStream: MediaStream | null;
  requestWebcam: () => Promise<string>;
  stopWebcam: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(AppCtx);
  if (!v) throw new Error("AppCtx missing");
  return v;
};

const TIERS = {
  edge: { fps: 24, lat: 41, gpu: 68, streams: 24, vram: 5.1 },
  balanced: { fps: 46, lat: 27, gpu: 81, streams: 64, vram: 12.4 },
  core: { fps: 88, lat: 16, gpu: 93, streams: 96, vram: 34.8 },
} as const;

const TYPES: { type: EventLog["type"]; sev: Severity; text: string }[] = [
  { type: "Drone / UAS", sev: "high", text: "Low-altitude air track classified as UAS from size, hover dwell and trajectory curvature." },
  { type: "Payload drop", sev: "critical", text: "UAS track released payload; GPS drop ellipse auto-flagged and QRT route generated." },
  { type: "Ground disturbance", sev: "high", text: "Long-timescale terrain delta found exposed spoil and vegetation clearance near fence." },
  { type: "Camera tamper", sev: "critical", text: "Scene integrity collapsed while stream remained healthy; lens cover or re-aim suspected." },
  { type: "Fence crossing", sev: "critical", text: "Subject breached active virtual fence; vector toward interior track." },
  { type: "Night movement", sev: "high", text: "Movement detected beyond illuminated perimeter during low-light window." },
  { type: "ANPR watchlist", sev: "high", text: "Plate read matched lookout register. Verify at next halt." },
  { type: "Loitering", sev: "medium", text: "Dwell time exceeded zone threshold without productive movement." },
  { type: "Face watchlist", sev: "critical", text: "FRS probe exceeded 0.82 similarity against watchlist gallery." },
  { type: "Intrusion", sev: "critical", text: "Polygon intrusion with confirmed human gait signature." },
  { type: "Tailgating", sev: "medium", text: "Headway below threshold in scan lane; second plate obscured." },
  { type: "Unattended object", sev: "low", text: "Static object left within exclusion buffer for over 6 minutes." },
  { type: "Crowd surge", sev: "medium", text: "Density crossed baseline; surge index trending upward." },
];

let seq = 84217;

export function AppProvider({ children }: { children: ReactNode }) {
  // Lead with the new cross-camera reasoning workflow; Live Wall remains one click away.
  const [view, setView] = useState<ViewId>("live");
  const [camId, setCamId] = useState("c01");
  const [layout, setLayout] = useState<1 | 4 | 9>(1);
  const [overlays, setOverlays] = useState<Overlays>({
    boxes: true,
    labels: true,
    trails: true,
    fence: true,
    plates: true,
    faces: true,
    heat: false,
    depth: false,
    pose: false,
    thermal: false,
  });
  const [sgm, setSgmState] = useState<SGMParams>(DEFAULT_SGM);
  const [minConf, setMinConf] = useState(0.55);
  const [running, setRunning] = useState(true);
  const [tier, setTier] = useState<Ctx["tier"]>("balanced");
  const [tick, setTick] = useState(0);
  const [events, setEvents] = useState<EventLog[]>(SEED_EVENTS);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [dossierEventId, setDossierEventId] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("ibvap-report-notes") ?? "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  });
  const [zones, setZones] = useState<Zone[]>(ZONE_TEMPLATES.map((z) => ({ ...z })));
  const [night, setNightState] = useState({
    preset: "starlight",
    bright: 1.55,
    contrast: 1.22,
    saturate: 0.35,
    blur: 0.5,
    ir: 0.25,
    grain: 0.35,
    motion: 62,
  });
  const [range, setRange] = useState<Range>("24h");
  const [rail, setRail] = useState(true);
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState("");
  const [useInference, setUseInference] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);

  /* ── Webcam lifecycle ───────────────────────────────────
     Same-origin MediaStream → canvas getImageData is permitted →
     the real pipeline runs on actual pixels, no CORS taint. */
  const requestWebcam = useCallback(async (): Promise<string> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setWebcamStream(stream);
      setCamId(WEBCAM.id);
      return "Webcam active — real pipeline running on live pixels";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      return `Camera denied or unavailable: ${msg}`;
    }
  }, []);

  const stopWebcam = useCallback(() => {
    setWebcamStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);
  const [pipelineStats, setPipelineStats] = useState<PipelineStats>({
    framesProcessed: 0, framesSkipped: 0, avgMotion: 0, detectionsPerFrame: 0, tamperEvents: 0, frozenFrames: 0,
  });
  const [poses, setPoses] = useState<Record<string, ReturnType<typeof syntheticPose>[]>>({});
  const [thermalBlobs, setThermalBlobs] = useState<Record<string, HeatBlob[]>>({});
  const [nai, setNai] = useState<NaiMarker[]>(() => DEMO_NAI.map((n) => ({ ...n })));
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerVerify, setLedgerVerify] = useState<VerifyResult | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ fps: 46, lat: 27, gpu: 81, drop: 0.2, streams: 64, vram: 12.4 });

  useEffect(() => {
    try {
      window.localStorage.setItem("ibvap-report-notes", JSON.stringify(reportNotes));
    } catch {
      // The in-memory draft remains usable when browser storage is unavailable.
    }
  }, [reportNotes]);

  const worlds = useMemo(() => {
    const o: Record<string, Tracked[]> = {};
    for (const c of CAMERAS) o[c.id] = getAnnotatedTracks(c.id, 0);
    return o;
  }, []);
  const [world, setWorld] = useState<Record<string, Tracked[]>>(worlds);
  const toastTimer = useRef<number | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const addEvent = useCallback((e: EventLog) => {
    setEvents((prev) => [e, ...prev].slice(0, 60));
    setUnread((u) => u + 1);
  }, []);

  const act = useCallback((id: string, status: EventLog["status"]) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  }, []);

  /* ── annotation playback + independent log generator ─────────
     Tracks come from hand-authored per-feed annotations (no detector).
     Event logs are generated independently and intentionally NOT derived
     from annotation positions (frozen demo behavior). */
  useEffect(() => {
    if (!running) return;
    const step = window.setInterval(() => {
      const at = tick + 1;
      const next: Record<string, Tracked[]> = {};

      if (!useInference) {
        // Manual annotation mode — author-specified bounding boxes
        for (const c of CAMERAS) next[c.id] = getAnnotatedTracks(c.id, at);
      } else {
        // Inference mode — full pipeline on every live feed
        for (const c of CAMERAS) {
          const stageEl = document.querySelector(`[data-cam-stage="${c.id}"]`);
          const video = stageEl?.querySelector("video") as HTMLVideoElement | null;
          const hasVideo = video && video.readyState >= 2 && !video.paused && video.videoWidth > 0;

          if (hasVideo && video!) {
            try {
              const cv = document.createElement("canvas");
              cv.width = video!.videoWidth;
              cv.height = video!.videoHeight;
              const ctx = cv.getContext("2d");
              // Canvas drawImage can throw on some CORS setups; handle gracefully
              ctx!.drawImage(video!, 0, 0);
              const result = processFrame(c.id, cv, Date.now(), []);
              const detConfs = new Map<number, number>();
              for (const d of result.detections) {
                const closest = result.tracks.reduce(
                  (best, tt) => {
                    const dist = Math.abs(tt.box[0] - d.box[0]) + Math.abs(tt.box[2] - d.box[2]);
                    return dist < best.dist ? { dist, id: tt.id } : best;
                  },
                  { dist: Infinity, id: -1 },
                );
                if (closest.dist < 0.15) detConfs.set(closest.id, d.conf);
              }
              next[c.id] = result.tracks.map((t) => ({
                key: `pipe-${c.id}-${t.id}-${at}`,
                id: `${t.cls === "vehicle" ? "V" : t.cls === "uas" ? "U" : "P"}-${String(t.id).padStart(4, "0")}`,
                cls: t.cls as CamClass,
                x: +(t.box[0] * 100).toFixed(2),
                y: +(t.box[1] * 100).toFixed(2),
                w: +((t.box[2] - t.box[0]) * 100).toFixed(2),
                h: +((t.box[3] - t.box[1]) * 100).toFixed(2),
                vx: t.velocity[0] * 100,
                vy: t.velocity[1] * 100,
                conf: +(detConfs.get(t.id) ?? (0.72 + t.hits * 0.025)).toFixed(3),
                age: t.age,
                life: 999,
                state: "track" as const,
                trail: [[t.box[0] * 100 + (t.box[2] - t.box[0]) * 50, t.box[3] * 100]],
                plate: t.cls === "vehicle" ? `PB${10 + Math.floor(Math.random() * 80)} ${String.fromCharCode(65 + Math.floor(Math.random() * 22))}${String.fromCharCode(65 + Math.floor(Math.random() * 22))} ${1000 + Math.floor(Math.random() * 9000)}` : undefined,
                faceScore: t.cls === "person" && (t.box[2] - t.box[0]) > 0.035 ? +(0.62 + Math.random() * 0.3).toFixed(2) : undefined,
                speed: Math.round(Math.hypot(t.velocity[0], t.velocity[1]) * 80),
                heading: t.velocity[0] > 0.04 ? "E" : t.velocity[0] < -0.04 ? "W" : t.velocity[1] > 0.04 ? "S" : t.velocity[1] < -0.04 ? "N" : "—",
                depthM: t.depthM,
                manual: false,
              }));
              setPipelineStats((prev) => ({
                framesProcessed: prev.framesProcessed + 1,
                framesSkipped: prev.framesSkipped,
                avgMotion: +(prev.avgMotion * 0.95 + Math.random() * 0.01).toFixed(4),
                detectionsPerFrame: +(prev.detectionsPerFrame * 0.9 + result.tracks.length * 0.1).toFixed(1),
                tamperEvents: prev.tamperEvents + (result.tamper ? 1 : 0),
                frozenFrames: prev.frozenFrames + (result.isFrozen ? 1 : 0),
              }));
            } catch {
              setPipelineStats((prev) => ({ ...prev, framesSkipped: prev.framesSkipped + 1 }));
              next[c.id] = getAnnotatedTracks(c.id, at);
            }
          } else {
            setPipelineStats((prev) => ({ ...prev, framesSkipped: prev.framesSkipped + 1 }));
            next[c.id] = getAnnotatedTracks(c.id, at);
          }
        }
      }

      setWorld(next);
      setTick((t) => t + 1);

      const t = TIERS[tier];
      const r = rng(hash(String(tick + 7)));
      const sgmCost = overlays.depth ? sgmQuality(sgm).extraMs : 0;
      setMetrics({
        fps: Math.round(t.fps + (r() - 0.5) * 6),
        lat: Math.round(t.lat + sgmCost + (r() - 0.5) * 8),
        gpu: Math.round(t.gpu + (r() - 0.5) * 9),
        drop: Math.max(0, +(r() * 0.7).toFixed(2)),
        streams: t.streams - (r() > 0.85 ? 1 : 0),
        vram: +(t.vram + (r() - 0.5) * 1.4).toFixed(1),
      });

      // rule engine — possible new alert (independent of annotations)
      const live = CAMERAS.filter((c) => c.status === "live");
      if (r() > 0.68) {
        const cam = live[Math.floor(r() * live.length)];
        const pick = TYPES[Math.floor(r() * TYPES.length)];
        const conf = 0.62 + r() * 0.33;
        if (conf > 0.6) {
          const isAir = pick.type === "Drone / UAS" || pick.type === "Payload drop";
          const isVeh = pick.type === "ANPR watchlist" || pick.type === "Tailgating" || pick.type === "Wrong direction";
          const trackId = pick.type === "Face watchlist"
            ? `#F-0${200 + Math.floor(r() * 60)}`
            : pick.type === "Ground disturbance"
              ? `#TD-0${10 + Math.floor(r() * 20)}`
              : pick.type === "Camera tamper"
                ? `#TAMPER-0${1 + Math.floor(r() * 9)}`
                : isAir
                  ? `#UAS-0${40 + Math.floor(r() * 20)}`
                  : isVeh
                    ? `#V-0${800 + Math.floor(r() * 150)}`
                    : `#T-${1100 + Math.floor(r() * 150)}`;
          addEvent({
            id: `E-${seq++}`,
            t: Date.now(),
            type: pick.type,
            sev: pick.sev,
            cam: cam.code,
            site: cam.site,
            conf: +conf.toFixed(2),
            status: "new",
            summary: pick.text,
            track: trackId,
            evidence: `MP4 · 00:${10 + Math.floor(r() * 49)}`,
            zone: r() > 0.5 ? ZONE_TEMPLATES[Math.floor(r() * ZONE_TEMPLATES.length)].name : undefined,
            subject: pick.type === "ANPR watchlist"
              ? plate(r)
              : pick.type === "Ground disturbance"
                ? "Exposed spoil + cleared vegetation"
                : pick.type === "Camera tamper"
                  ? "Lens cover / camera blinded"
                  : isAir
                    ? "Unidentified aerial system"
                    : isVeh
                      ? "Vehicle, unclassified"
                      : "Person, single subject",
            x: Math.round(15 + r() * 70),
            y: Math.round(20 + r() * 60),
          });
        }
      }
    }, 1000);
    return () => window.clearInterval(step);
  }, [running, tier, tick, addEvent, overlays.depth, sgm, useInference]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setOpenEvent(null);
      }
      if (e.key === " " && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        setRunning((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleOverlay = useCallback((k: keyof Overlays) => {
    setOverlays((o) => ({ ...o, [k]: !o[k] }));
  }, []);
  const setSgm = useCallback((patch: Partial<SGMParams>) => setSgmState((s) => ({ ...s, ...patch })), []);
  const setNight = useCallback((patch: Partial<Ctx["night"]>) => setNightState((n) => ({ ...n, ...patch })), []);
  const saveZone = useCallback((z: Zone) => {
    setZones((prev) => {
      const i = prev.findIndex((p) => p.id === z.id);
      if (i === -1) return [...prev, z];
      const cp = [...prev];
      cp[i] = z;
      return cp;
    });
  }, []);
  const toggleZone = useCallback((id: string) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, enabled: !z.enabled } : z)));
  }, []);
  const deleteZone = useCallback((id: string) => setZones((prev) => prev.filter((z) => z.id !== id)), []);
  const setReportNote = useCallback((id: string, note: string) => {
    setReportNotes((current) => ({ ...current, [id]: note }));
  }, []);

  /* ── pose and thermal are derived per frame from the track set ── */
  useEffect(() => {
    if (!running) return;
    const nextPoses: Record<string, ReturnType<typeof syntheticPose>[]> = {};
    const nextBlobs: Record<string, HeatBlob[]> = {};
    for (const c of CAMERAS) {
      const tracks = world[c.id] ?? [];
      const people = tracks.filter((t) => t.cls === "person");
      if (people.length && overlays.pose) {
        nextPoses[c.id] = people.map((t, i) =>
          syntheticPose(t.id, [t.x / 100, t.y / 100, (t.x + t.w) / 100, (t.y + t.h) / 100], tick * 0.05, i * 1.9),
        );
      }
      if (overlays.thermal && c.status !== "offline") {
        const r = rng(hash(c.id) + tick * 131);
        const blobs = people.slice(0, 3).map((t, i) => ({
          box: [t.x / 100, t.y / 100, (t.x + t.w) / 100, (t.y + t.h) / 100] as [number, number, number, number],
          centroid: { x: (t.x + t.w / 2) / 100, y: (t.y + t.h / 2) / 100 },
          areaPx: Math.round(140 + r() * 900),
          peakTemp: +(0.44 + r() * 0.32).toFixed(3),
          meanTemp: +(0.32 + r() * 0.2).toFixed(3),
          persistence: i + 1,
          classification: "human" as const,
          conf: +(0.7 + r() * 0.27).toFixed(3),
        }));
        nextBlobs[c.id] = blobs;
      }
    }
    setPoses(nextPoses);
    setThermalBlobs(nextBlobs);
  }, [running, world, overlays.pose, overlays.thermal, tick]);

  /* ── evidence ledger ─────────────────────────────── */
  const refreshLedger = useCallback(async () => {
    const entries = await readLedger();
    setLedger(entries);
  }, []);

  const verifyLedgerNow = useCallback(async () => {
    const result = await verifyLedger();
    setLedgerVerify(result);
    say(result.ok ? `Ledger verified · ${result.entries} entries intact` : `Ledger integrity failure at entry ${result.firstBroken}`);
  }, [say]);

  const audit = useCallback((action: string, detail: string) => {
    void appendEntry("action", `${action}|${detail}|${Date.now()}`);
  }, []);

  useEffect(() => {
    void refreshLedger();
  }, [refreshLedger, events.length]);

  const value: Ctx = {
    view,
    setView,
    camId,
    setCamId,
    layout,
    setLayout,
    overlays,
    toggleOverlay,
    sgm,
    setSgm,
    minConf,
    setMinConf,
    running,
    setRunning,
    tier,
    setTier,
    tick,
    world,
    metrics,
    events,
    addEvent,
    act,
    openEvent,
    setOpenEvent,
    dossierEventId,
    setDossierEventId,
    reportNotes,
    setReportNote,
    zones,
    saveZone,
    toggleZone,
    deleteZone,
    night,
    setNight,
    range,
    setRange,
    rail,
    setRail,
    palette,
    setPalette,
    toast,
    say,
    unread,
    clearUnread: () => setUnread(0),
    query,
    setQuery,
    useInference,
    setUseInference,
    pipelineStats,
    poses,
    thermalBlobs,
    nai,
    setNai,
    ledger,
    ledgerVerify,
    refreshLedger,
    verifyLedgerNow,
    audit,
    webcamStream,
    requestWebcam,
    stopWebcam,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
