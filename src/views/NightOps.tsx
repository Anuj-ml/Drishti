import { useMemo, useState } from "react";
import { Contrast, Download, Flame, Moon, Sun, Thermometer, Eye } from "lucide-react";
import { CAMERAS, CAM_BY_ID, NIGHT_PRESETS } from "../lib/data";
import { downloadJSONFile } from "../lib/downloads";
import { hash, rng } from "../lib/sim";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { CameraFrame } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Segmented, Slider, Stat, ViewHead } from "../components/ui";

export function NightOps() {
  const { camId, setCamId, world, overlays, minConf, setMinConf, night, setNight, say, events } = useApp();
  const [split, setSplit] = useState(58);
  const [fusion, setFusion] = useState(true);
  const cam = CAM_BY_ID[camId];

  const fx = { bright: night.bright, contrast: night.contrast, saturate: night.saturate, blur: night.blur, ir: night.ir, grain: night.grain };
  const raw = { bright: 0.72, contrast: 0.9, saturate: 0.25, blur: 0, ir: 0, grain: 0.9 };

  const nightEvents = useMemo(() => events.filter((e) => e.type === "Night movement" || e.sev === "critical"), [events]);
  const readiness = useMemo(() => {
    const r = rng(hash(camId + "ir"));
    return CAMERAS.slice(0, 7).map((c) => ({
      ...c,
      ir: Math.round(58 + r() * 42),
      lux: +(r() * 0.4).toFixed(2),
      temp: Math.round(9 + r() * 7),
    }));
  }, [camId]);

  return (
    <>
      <ViewHead
        kicker="Operations · low light"
        title="Night Ops"
        desc="The hours that matter most are the hardest to see. A lightweight enhancement stage runs ahead of the detector — denoise, gamma and thermal fusion — so night detection stays usable on stock low-light sensors."
        right={
          <>
            <Segmented
              value={night.preset}
              onChange={(p) => {
                const pr = NIGHT_PRESETS.find((x) => x.id === p)!;
                setNight({ preset: pr.id, bright: pr.bright, contrast: pr.contrast, saturate: pr.saturate, blur: pr.blur, ir: pr.ir });
                say(`${pr.name} profile applied to ${cam.code}`);
              }}
              options={NIGHT_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Btn icon={<Eye size={13} />} onClick={() => setFusion(!fusion)}>
              {fusion ? "Fusion on" : "Fusion off"}
            </Btn>
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadJSONFile(`IBVAP-NightOps-Profile-${cam.id}.json`, {
                  camera: cam.code,
                  site: cam.site,
                  fusion_enabled: fusion,
                  profile: night,
                  exported_at: new Date().toISOString(),
                });
                say(`Downloaded Night Ops calibration profile for ${cam.code}`);
              }}
            >
              Export Profile (.JSON)
            </Btn>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <div className="relative">
                <CameraFrame
                  cam={cam}
                  tracks={world[camId] ?? []}
                  minConf={minConf}
                  overlays={{ ...overlays, heat: false, labels: true }}
                  fx={fusion ? fx : raw}
                  className="brightness-[1]"
                />
                {/* raw comparison half */}
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                  <div className="h-full w-full" style={{ filter: `contrast(${raw.contrast}) brightness(${raw.bright}) saturate(${raw.saturate})` }}>
                    <CameraFrame
                      cam={cam}
                      tracks={world[camId] ?? []}
                      minConf={0.99}
                      overlays={{ boxes: false, labels: false, trails: false, fence: false, plates: false, faces: false, heat: false, depth: false, pose: false, thermal: false }}
                      hud="none"
                    />
                  </div>
                  <div className="pointer-events-none absolute left-3 top-3 rounded-[6px] bg-black/55 px-2 py-1 backdrop-blur-sm">
                    <span className="micro text-white/75">sensor raw · 0.08 lux</span>
                  </div>
                </div>
                <div className="pointer-events-none absolute right-3 top-3 rounded-[6px] bg-black/45 px-2 py-1 backdrop-blur-sm">
                  <span className="micro text-white/85">after enhancement · +IBV-Star</span>
                </div>
                <div className="pointer-events-none absolute inset-y-0" style={{ left: `${split}%` }}>
                  <div className="h-full w-px bg-white/45" />
                  <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-black/45 px-1.5 py-1 backdrop-blur-sm">
                    <Contrast size={12} className="text-white/85" />
                  </div>
                </div>
              </div>
              <div className="on-stage border-t border-stagehair bg-[#111318]/95 px-3 py-3">
                <Slider dark label="Compare raw ↔ enhanced" value={split} min={0} max={100} step={1} onChange={setSplit} fmt={(v) => `${v.toFixed(0)}%`} accent="#7aa6ff" />
              </div>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <Card hover={false} className="p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <Label>Enhancement stage</Label>
                <div className="flex items-center gap-1.5">
                  <Sun size={12} className="text-ink4" />
                  <span className="micro text-ink3">manual override active</span>
                </div>
              </div>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <Slider label="Gain / brightness" value={night.bright} min={0.6} max={2.4} step={0.01} onChange={(v) => setNight({ bright: v })} fmt={(v) => `${v.toFixed(2)}×`} />
                <Slider label="Gamma lift" value={night.contrast} min={0.6} max={2.2} step={0.01} onChange={(v) => setNight({ contrast: v })} fmt={(v) => `${v.toFixed(2)}×`} />
                <Slider label="Saturation" value={night.saturate} min={0} max={2} step={0.01} onChange={(v) => setNight({ saturate: v })} fmt={(v) => (v < 0.05 ? "mono" : `${v.toFixed(2)}×`)} />
                <Slider label="Temporal denoise" value={night.blur} min={0} max={3} step={0.05} onChange={(v) => setNight({ blur: v })} fmt={(v) => `${(v * 3.3).toFixed(1)} px`} />
                <Slider label="IR / thermal mix" value={night.ir} min={0} max={1} step={0.01} onChange={(v) => setNight({ ir: v })} fmt={(v) => `${(v * 100).toFixed(0)}%`} accent="#ef6c33" />
                <Slider label="Sensor grain" value={night.grain} min={0} max={1} step={0.01} onChange={(v) => setNight({ grain: v })} fmt={(v) => `${(v * 100).toFixed(0)}%`} accent="#7aa6ff" />
                <Slider label="Motion gate" value={night.motion} min={10} max={99} step={1} onChange={(v) => setNight({ motion: v })} fmt={(v) => `${v} / 100`} />
                <Slider label="Min detection conf" value={minConf} min={0.3} max={0.95} step={0.01} onChange={setMinConf} fmt={(v) => `${(v * 100).toFixed(0)}%`} accent="#21b8a2" />
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink3">
                  <Flame size={11} className="text-person" /> thermal fusion {fusion ? "enabled" : "disabled"} · frame budget {(6 + night.blur * 2.4).toFixed(1)} ms
                </span>
                <Btn
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setNight({ preset: "starlight", bright: 1.55, contrast: 1.22, saturate: 0.35, blur: 0.5, ir: 0.25, grain: 0.2 });
                    say("Recalibrated for current scene luminance");
                  }}
                >
                  Auto-tune to scene
                </Btn>
                <Btn size="sm" onClick={() => say(`Night profile pushed to ${cam.code} · 3 cameras in sector`)}>
                  Push to sector
                </Btn>
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="space-y-4">
          <Reveal delay={90}>
            <Card hover={false} className="grid grid-cols-2 gap-px bg-hairline">
              <div className="bg-surface">
                <Stat k="Night events · 6 h" v={nightEvents.length} sub="beyond illuminated perimeter" color="#7aa6ff" tone="ink" />
              </div>
              <div className="bg-surface">
                <Stat k="Detection delta" v="+38%" sub="vs raw feed baseline" color="#0e6d61" tone="signal" />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={120}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>IR &amp; thermal readiness</Label>
                <span className="micro text-ink3">18:40 – 05:20 window</span>
              </div>
              <div className="divide-y divide-hairline">
                {readiness.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCamId(c.id)}
                    className={cn("flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-ink/[0.02]", c.id === camId && "bg-signal-soft/40")}
                  >
                    <Moon size={12} className={cn("shrink-0", c.ir > 80 ? "text-signal" : c.ir > 62 ? "text-warn" : "text-alert")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[10.5px] text-ink2">{c.code}</span>
                      <span className="mt-1 block"><Bar pct={c.ir} h={3.5} color={c.ir > 80 ? "#0e6d61" : c.ir > 62 ? "#b7791f" : "#d92d20"} /></span>
                    </span>
                    <span className="tnum w-16 shrink-0 text-right">
                      <span className="block font-mono text-[10.5px] text-ink">{c.lux.toFixed(2)} lux</span>
                      <span className="mt-0.5 flex items-center justify-end gap-0.5 font-mono text-[9px] text-ink3">
                        <Thermometer size={9} /> Δ{c.temp}°
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-hairline px-3.5 py-2.5">
                <p className="text-[11.5px] leading-[1.5] text-ink3">
                  Feeds below 62 % IR margin are queued for lens cleaning or illuminator swap — the platform keeps analysing them, just with a wider alert gate.
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={150}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-3.5 py-2.5"><Label>Night cameras in scope</Label></div>
              <div className="grid grid-cols-2 gap-1 p-2.5">
                {CAMERAS.filter((c) => c.models.includes("night") || c.models.includes("thermal")).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCamId(c.id)}
                    className={cn(
                      "overflow-hidden rounded-[9px] border transition-all hover:-translate-y-[1px]",
                      c.id === camId ? "border-signal/40 ring-1 ring-signal/20" : "border-hairline",
                    )}
                  >
                    <img src={c.thumb} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" style={{ filter: "brightness(1.4) contrast(1.3) saturate(.2)" }} />
                    <span className="block px-1.5 py-1 text-left font-mono text-[9px] text-ink3">{c.code.split(" / ")[1] ?? c.code}</span>
                  </button>
                ))}
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </>
  );
}


