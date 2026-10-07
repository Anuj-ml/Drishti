import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CameraOff,
  Crosshair,
  Download,
  FileText,
  LocateFixed,
  Plane,
  Radar,
  ScanLine,
  ShieldAlert,
  Shovel,
  Sparkles,
  Target,
} from "lucide-react";
import { ADVANCED_THREATS, CAM_BY_ID, type EventLog } from "../lib/data";
import { downloadJSONFile } from "../lib/downloads";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Bar, Btn, Card, Label, Reveal, Segmented, Slider, Switch, ViewHead } from "../components/ui";

type ThreatId = (typeof ADVANCED_THREATS)[number]["id"];

const THREAT_ICONS = { uas: Plane, ground: Shovel, tamper: CameraOff } as const;

export function AdvancedThreats() {
  const { tick, addEvent, events, say, setDossierEventId } = useApp();
  const [mode, setMode] = useState<ThreatId>("uas");
  const [dropArmed, setDropArmed] = useState(true);
  const [dropDetected, setDropDetected] = useState(false);
  const [baselineDays, setBaselineDays] = useState(14);
  const [deltaSensitivity, setDeltaSensitivity] = useState(68);
  const [compareSplit, setCompareSplit] = useState(54);
  const [tamperType, setTamperType] = useState<"cover" | "reaim" | "signal">("cover");
  const [tamperActive, setTamperActive] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const threat = ADVANCED_THREATS.find((x) => x.id === mode) ?? ADVANCED_THREATS[0];
  const cam = CAM_BY_ID[threat.camId];

  const uas = useMemo(() => {
    const phase = tick * 0.19;
    return {
      x: 18 + ((Math.sin(phase * 0.72) + 1) / 2) * 57,
      y: 20 + ((Math.cos(phase * 0.55) + 1) / 2) * 20,
      vx: 6.8 + Math.sin(phase) * 1.7,
      alt: 94 + Math.round(Math.cos(phase * 0.4) * 11),
      turn: 21 + Math.round(Math.sin(phase * 0.68) * 8),
    };
  }, [tick]);

  const emit = (event: EventLog) => {
    addEvent(event);
    setLastEventId(event.id);
    say(`${event.type} incident ${event.id} written to the Event Ledger`);
  };

  const detectDrop = () => {
    const id = `E-UAS-${String(Date.now()).slice(-5)}`;
    setDropDetected(true);
    emit({
      id,
      t: Date.now(),
      type: "Payload drop",
      sev: "critical",
      cam: "BOP-11 / CAM-06",
      site: "BOP-11",
      conf: 0.93,
      status: "new",
      summary:
        "Quad-rotor released a compact payload after 11 seconds of hover. Ballistic projection auto-flagged GPS drop ellipse 31.4408 N, 74.4171 E (CEP 7.4 m); QRT access route generated.",
      track: "#UAS-044",
      evidence: "MP4 · 00:15 + GEOJSON",
      zone: "DZ-04 · Fence km 13.2",
      subject: "Quad-rotor UAS · payload released",
      x: Math.round(uas.x),
      y: Math.round(uas.y + 28),
    });
  };

  const flagGround = () => {
    const id = `E-GD-${String(Date.now()).slice(-5)}`;
    emit({
      id,
      t: Date.now(),
      type: "Ground disturbance",
      sev: "high",
      cam: "BOP-07 / CAM-01",
      site: "BOP-07",
      conf: 0.86,
      status: "new",
      summary: `${baselineDays}-day terrain compare detected 7.8 m² exposed soil, 2.1 m³ new spoil and 18% vegetation clearance inside the fence-proximity mask. Pattern is consistent with tunnel-dig precursor activity.`,
      track: "#TD-018",
      evidence: `DELTA · D-${baselineDays}/D-0`,
      zone: "GD-02 · North Reach",
      subject: "Exposed spoil + cleared vegetation",
      x: 46,
      y: 67,
    });
  };

  const triggerTamper = () => {
    const id = `E-TM-${String(Date.now()).slice(-5)}`;
    setTamperActive(true);
    const wording =
      tamperType === "cover"
        ? "Scene luminance collapsed 91% in 240 ms while RTSP transport remained healthy; classified as deliberate lens cover."
        : tamperType === "reaim"
          ? "Scene homography diverged 38° from commissioned optical axis in 420 ms; physical camera re-aim detected."
          : "Frame entropy and edge density collapsed while bitrate jitter increased 6.4×; signal injection / interference suspected.";
    emit({
      id,
      t: Date.now(),
      type: "Camera tamper",
      sev: "critical",
      cam: "BOP-03 / CAM-01",
      site: "BOP-03",
      conf: 0.98,
      status: "new",
      summary: wording,
      track: "#TAMPER-07",
      evidence: "MP4 · PRE/POST 00:20",
      zone: "CAM-01 · Optical axis",
      subject: tamperType === "cover" ? "Lens cover / camera blinded" : tamperType === "reaim" ? "Physical camera re-aim" : "Signal interference",
      x: 50,
      y: 50,
    });
  };

  const latestAdvanced = events.find((e) =>
    ["Drone / UAS", "Payload drop", "Ground disturbance", "Camera tamper"].includes(e.type),
  );

  return (
    <>
      <ViewHead
        kicker="Intelligence · advanced detection"
        title="Airspace, terrain & camera integrity"
        desc="Three detectors that should not share the ground-object model: UAS trajectory classification, long-timescale terrain change, and independent camera self-tamper telemetry."
        right={
          <>
            <Segmented
              value={mode}
              onChange={setMode}
              options={ADVANCED_THREATS.map((x) => {
                const Icon = THREAT_ICONS[x.id];
                return { value: x.id, label: <span className="flex items-center gap-1.5"><Icon size={11.5} />{x.short}</span> };
              })}
            />
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadJSONFile("IBVAP-Advanced-Detection-Policy.json", {
                  exported_at: new Date().toISOString(),
                  pipelines: ADVANCED_THREATS,
                  policy: { payload_drop_auto_geofence: dropArmed, terrain_baseline_days: baselineDays, terrain_sensitivity: deltaSensitivity },
                });
                say("Downloaded advanced detection policy (.json)");
              }}
            >
              Export Policy
            </Btn>
            {(lastEventId || latestAdvanced) && (
              <Btn
                variant="primary"
                icon={<FileText size={13} />}
                onClick={() => setDossierEventId(lastEventId ?? latestAdvanced!.id)}
              >
                Incident Dossier
              </Btn>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-hairline bg-hairline">
        {ADVANCED_THREATS.map((x) => {
          const Icon = THREAT_ICONS[x.id];
          const on = mode === x.id;
          return (
            <button
              key={x.id}
              onClick={() => setMode(x.id)}
              className={cn("bg-surface px-4 py-3 text-left transition-colors", on ? "bg-signal-soft" : "hover:bg-paper")}
            >
              <div className="flex items-center justify-between">
                <Icon size={14} className={on ? "text-signal" : "text-ink4"} />
                <span className={cn("micro", on ? "text-signal" : "text-ink3")}>{x.model}</span>
              </div>
              <div className="mt-3 text-[14px] font-semibold tracking-tight text-ink">{x.title}</div>
              <div className="mt-1 line-clamp-2 text-[11.5px] leading-[1.45] text-ink3">{x.description}</div>
            </button>
          );
        })}
      </div>

      {mode === "uas" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <div className="relative aspect-[16/9] overflow-hidden">
                <video src={threat.videoUrl} poster={threat.thumb} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/35" />
                <div className="scanlines pointer-events-none absolute inset-0" />
                <svg viewBox="0 0 100 56.25" className="pointer-events-none absolute inset-0 h-full w-full">
                  <path
                    d={`M 7 31 Q 22 ${24 + Math.sin(tick * 0.2) * 5} 38 24 T ${uas.x + 3} ${uas.y + 2}`}
                    fill="none"
                    stroke="#f2c94c"
                    strokeWidth="0.45"
                    strokeDasharray="1.6 1.2"
                    opacity=".75"
                    className="dashmove"
                  />
                  {dropDetected && (
                    <>
                      <line x1={uas.x + 2} y1={uas.y + 4} x2="63" y2="45" stroke="#ff6b5c" strokeWidth="0.45" strokeDasharray="1 1" />
                      <ellipse cx="63" cy="45" rx="5" ry="2.4" fill="rgba(217,45,32,.18)" stroke="#ff6b5c" strokeWidth="0.5" strokeDasharray="1 1" />
                    </>
                  )}
                </svg>
                <div
                  className="absolute h-[15%] w-[10%] rounded-[3px] border-[1.5px] border-fence transition-all duration-1000 ease-linear"
                  style={{ left: `${uas.x}%`, top: `${uas.y}%`, boxShadow: "0 0 22px -5px #f2c94c" }}
                >
                  <span className="absolute -top-[18px] left-0 whitespace-nowrap rounded-[4px] bg-fence px-1.5 py-[2px] font-mono text-[9px] font-semibold text-stage">
                    UAS-044 · 93%
                  </span>
                  <span className="absolute -bottom-[16px] left-0 whitespace-nowrap font-mono text-[8.5px] text-fence">
                    QUAD · {uas.alt}m AGL · {uas.vx.toFixed(1)}m/s
                  </span>
                </div>
                {dropDetected && (
                  <div className="absolute bottom-[15%] left-[58%] rounded-[9px] border border-alert/60 bg-[#220e11]/85 px-2.5 py-2 backdrop-blur-md">
                    <div className="micro text-[#ff8175]">GPS drop zone · auto-flagged</div>
                    <div className="mt-1 font-mono text-[10px] text-white">31.4408 N, 74.4171 E · CEP 7.4 m</div>
                  </div>
                )}
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-[7px] bg-black/45 px-2 py-1.5 backdrop-blur-md">
                  <Radar size={12} className="text-fence live-dot" />
                  <span className="micro text-white/90">Airspace classifier · independent of ground detector</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-stagehair bg-[#111318] px-3 py-2.5">
                {["apparent size 32 px", `turn radius ${uas.turn} m`, "hover dwell 11.2 s", "bird reject 0.97"].map((x) => (
                  <span key={x} className="rounded-[6px] bg-white/[0.07] px-2 py-1 font-mono text-[9.5px] text-white/55">{x}</span>
                ))}
                <Btn variant="stage" className="ml-auto" icon={<Target size={12} />} onClick={detectDrop}>
                  Simulate payload drop
                </Btn>
              </div>
            </div>
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={70}>
              <Card hover={false} className="p-0">
                <div className="border-b border-hairline px-3.5 py-2.5"><Label>UAS classification vector</Label></div>
                <div className="space-y-3 p-3.5">
                  {[["Trajectory-shape score", 93], ["Size / aspect consistency", 88], ["Hover signature", 96], ["Bird rejection", 97], ["Payload separation", dropDetected ? 91 : 14]].map(([k, v]) => (
                    <div key={k as string}>
                      <div className="mb-1 flex justify-between text-[11.5px]"><span className="text-ink2">{k as string}</span><span className="tnum font-mono text-ink">{v as number}%</span></div>
                      <Bar pct={v as number} h={4} color={(v as number) > 85 ? "#0e6d61" : "#b7791f"} />
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>
            <Reveal delay={110}>
              <Card hover={false} className={cn("p-3.5", dropDetected && "border-alert/30 bg-alert-soft/45") }>
                <div className="flex items-start gap-3">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", dropDetected ? "bg-alert text-white" : "bg-ink/[0.05] text-ink3") }>
                    <LocateFixed size={16} />
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold tracking-tight">Payload-drop geo rule</div>
                    <p className="mt-1 text-[11.5px] leading-[1.5] text-ink3">Release separation creates a ballistic ground-intercept ellipse, stores GeoJSON, and tasks the nearest QRT route automatically.</p>
                    <div className="mt-3 flex items-center justify-between"><Label>Auto-arm drop zone</Label><Switch on={dropArmed} onChange={setDropArmed} tone="alert" /></div>
                  </div>
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      )}

      {mode === "ground" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <div className="relative aspect-[16/9] overflow-hidden">
                <video src={threat.videoUrl} poster={threat.thumb} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover saturate-[.72] contrast-[1.08]" />
                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - compareSplit}% 0 0)` }}>
                  <img src={cam.url} alt="Terrain baseline" className="h-full w-full object-cover grayscale contrast-[.92] brightness-[.92]" />
                  <div className="absolute left-3 top-3 rounded-[6px] bg-black/55 px-2 py-1 font-mono text-[9px] text-white">BASELINE · D-{baselineDays}</div>
                </div>
                <div className="absolute right-3 top-3 rounded-[6px] bg-black/55 px-2 py-1 font-mono text-[9px] text-white">CURRENT · D-0</div>
                <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${compareSplit}%` }} />
                <div className="absolute left-[35%] top-[46%] h-[27%] w-[26%] rounded-[45%] border-2 border-alert bg-alert/15 shadow-[0_0_32px_-8px_#d92d20]">
                  <span className="absolute -top-5 left-0 rounded-[4px] bg-alert px-1.5 py-[2px] font-mono text-[9px] text-white">TD-018 · DELTA 86%</span>
                </div>
                <svg viewBox="0 0 100 56.25" className="pointer-events-none absolute inset-0 h-full w-full">
                  <path d="M35 42 Q44 30 61 41" fill="none" stroke="#ff7266" strokeWidth=".5" strokeDasharray="1.5 1" />
                  <path d="M8 45 L94 38" fill="none" stroke="#f2c94c" strokeWidth=".45" strokeDasharray="2 1.5" />
                </svg>
                <div className="absolute bottom-3 left-3 flex gap-1.5">
                  {[["spoils", "2.1 m³"], ["bare soil", "7.8 m²"], ["veg loss", "18%"]].map(([k, v]) => (
                    <span key={k} className="rounded-[6px] bg-black/55 px-2 py-1 font-mono text-[9px] text-white/75 backdrop-blur"><b className="text-[#ff8175]">{v}</b> {k}</span>
                  ))}
                </div>
              </div>
              <div className="bg-[#111318] px-3 py-3">
                <Slider dark label={`Baseline D-${baselineDays} ↔ Current D-0`} value={compareSplit} min={4} max={96} step={1} onChange={setCompareSplit} fmt={(v) => `${v}%`} accent="#ff8175" />
              </div>
            </div>
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={70}>
              <Card hover={false} className="p-3.5">
                <Label className="mb-3">Temporal compare policy</Label>
                <div className="space-y-4">
                  <Slider label="Baseline window" value={baselineDays} min={3} max={30} step={1} onChange={setBaselineDays} fmt={(v) => `${v} days`} />
                  <Slider label="Delta sensitivity" value={deltaSensitivity} min={30} max={95} step={1} onChange={setDeltaSensitivity} fmt={(v) => `${v} / 100`} accent="#d92d20" />
                </div>
                <div className="mt-4 border-t border-hairline pt-3">
                  <Btn variant="primary" className="w-full" icon={<ShieldAlert size={13} />} onClick={flagGround}>Flag tunnel-dig precursor</Btn>
                </div>
              </Card>
            </Reveal>
            <Reveal delay={110}>
              <Card hover={false} className="p-3.5">
                <Label className="mb-2">Change attribution</Label>
                <p className="text-[12px] leading-[1.55] text-ink2">Normalized dawn frames remove shadow and seasonal illumination before the Siamese encoder compares terrain texture inside the 35 m fence buffer.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[["86%", "spoil"], ["79%", "clearing"], ["68%", "excavation"]].map(([v, k]) => (
                    <div key={k} className="rounded-[9px] bg-paper p-2 text-center"><div className="tnum font-display text-[18px] font-semibold">{v}</div><div className="micro mt-1 text-ink3">{k}</div></div>
                  ))}
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      )}

      {mode === "tamper" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <div className="relative aspect-[16/9] overflow-hidden">
                <video
                  key={`${tamperActive}-${tamperType}`}
                  src={tamperActive ? threat.videoUrl : cam.videoUrl}
                  poster={tamperActive ? threat.thumb : cam.thumb}
                  autoPlay muted loop playsInline
                  className={cn("absolute inset-0 h-full w-full object-cover transition-all duration-300", tamperActive && tamperType === "reaim" && "scale-125 rotate-3", tamperActive && tamperType === "cover" && "brightness-[.18] blur-sm")}
                />
                <div className="scanlines pointer-events-none absolute inset-0" />
                {tamperActive && (
                  <div className="absolute inset-0 grid place-items-center bg-alert/8">
                    <div className="rounded-[12px] border border-alert/50 bg-[#1c0d10]/88 px-4 py-3 text-center shadow-float backdrop-blur-md">
                      <AlertTriangle size={20} className="mx-auto text-[#ff776b] live-dot" />
                      <div className="micro mt-2 text-[#ff8175]">Camera integrity violation</div>
                      <div className="mt-1 font-mono text-[11px] text-white">{tamperType.toUpperCase()} · CONF 0.98 · 420 ms</div>
                    </div>
                  </div>
                )}
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-[7px] bg-black/50 px-2 py-1.5 backdrop-blur">
                  <ScanLine size={12} className={tamperActive ? "text-alert" : "text-[#3ddc97]"} />
                  <span className="micro text-white/90">IBV-Guard · independent scene integrity</span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 grid grid-cols-4 gap-1.5">
                  {[["luma", tamperActive ? "-91%" : "stable"], ["edge", tamperActive ? "-88%" : "0.72"], ["homography", tamperActive && tamperType === "reaim" ? "38°" : "1.2°"], ["RTSP", "healthy"]].map(([k, v]) => (
                    <div key={k} className="rounded-[6px] bg-black/55 px-2 py-1.5 backdrop-blur"><div className="micro text-white/35">{k}</div><div className={cn("tnum mt-1 font-mono text-[10px]", tamperActive && k !== "RTSP" ? "text-[#ff8175]" : "text-[#7fd6c8]")}>{v}</div></div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={70}>
              <Card hover={false} className="p-3.5">
                <Label className="mb-3">Tamper test vector</Label>
                <Segmented
                  value={tamperType}
                  onChange={(v) => { setTamperType(v); setTamperActive(false); }}
                  options={[{ value: "cover", label: "Cover / blind" }, { value: "reaim", label: "Re-aim" }, { value: "signal", label: "Signal" }]}
                  className="w-full"
                />
                <p className="mt-3 text-[11.5px] leading-[1.5] text-ink3">
                  {tamperType === "cover" ? "Luminance and edge density collapse while network transport stays healthy." : tamperType === "reaim" ? "Commissioned scene homography shifts beyond the 7° physical-axis tolerance." : "Frame entropy, scanline signature and bitrate jitter indicate signal injection or interference."}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Btn variant="primary" icon={<Sparkles size={13} />} onClick={triggerTamper}>Simulate tamper</Btn>
                  <Btn onClick={() => { setTamperActive(false); say("Camera integrity baseline restored"); }}>Restore feed</Btn>
                </div>
              </Card>
            </Reveal>
            <Reveal delay={110}>
              <Card hover={false} className="p-3.5">
                <div className="flex items-center gap-2"><Crosshair size={13} className="text-signal" /><span className="text-[13px] font-semibold">Self-monitoring, no operator required</span></div>
                <p className="mt-2 text-[11.5px] leading-[1.55] text-ink3">IBV-Guard sits beside the decoder and still fires when every object detector is blind. It distinguishes physical cover from camera power loss using RTSP heartbeat and bitrate continuity.</p>
              </Card>
            </Reveal>
          </div>
        </div>
      )}
    </>
  );
}