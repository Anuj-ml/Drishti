import { useMemo, useState } from "react";
import { Bell, Download, Eraser, FlipHorizontal2, Ruler, Save, Trash2, Undo2, Zap } from "lucide-react";
import { CAMERAS, CAM_BY_ID } from "../lib/data";
import { downloadJSONFile, downloadPatrolBriefingPDF, runDownloadTask } from "../lib/downloads";
import { useApp, type Zone } from "../state/store";
import { cn } from "../utils/cn";
import { CameraFrame } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Segmented, Slider, Switch, ViewHead } from "../components/ui";

const MODES = [
  { v: "Tripwire (bi-directional)", label: "Tripwire" },
  { v: "Intrusion polygon", label: "Polygon" },
  { v: "Loitering", label: "Loiter" },
  { v: "Direction crossing", label: "Direction" },
] as const;

const M_PER_PX = 0.62; // calibrated footprint per % of frame width

export function Fence() {
  const { camId, setCamId, zones, saveZone, toggleZone, deleteZone, world, overlays, minConf, say, addEvent } = useApp();
  const [pts, setPts] = useState<[number, number][]>([]);
  const [mode, setMode] = useState<(typeof MODES)[number]["v"]>("Tripwire (bi-directional)");
  const [sens, setSens] = useState(72);
  const [minSize, setMinSize] = useState(16);
  const [dwell, setDwell] = useState(20);
  const [dir, setDir] = useState<"both" | "in" | "out">("both");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const cam = CAM_BY_ID[camId];
  const closed = mode === "Intrusion polygon" || mode === "Loitering";

  const geo = useMemo(() => {
    const list = pts.length > 1 ? pts : zones.find((z) => z.cam === camId)?.points ?? [];
    const perim = list.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - list[i - 1][0], p[1] - list[i - 1][1]) : 0), 0);
    let area = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i], b = list[(i + 1) % list.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    return { len: Math.round(perim * M_PER_PX * 10) / 10, area: Math.abs(area / 2) * (M_PER_PX * M_PER_PX) * 100 };
  }, [pts, zones, camId]);

  const ready = pts.length >= 2 && (!closed || pts.length >= 3);

  const reset = () => {
    setPts([]);
    setName("");
    setEditing(null);
  };

  const commit = () => {
    if (!ready) return;
    const id = editing ?? `VF-${String(10 + zones.length).padStart(2, "0")}`;
    saveZone({
      id,
      name: name.trim() || `${id} · ${cam.code.split(" / ")[0]} ${mode.split(" ")[0]}`,
      mode,
      sens,
      minSize,
      dwell: mode === "Loitering" ? dwell * 60 : 0,
      enabled: true,
      hits: 0,
      cam: camId,
      points: pts,
    });
    say(`${id} saved to rule engine · active on ${cam.code}`);
    reset();
  };

  const simulate = () => {
    const t = (world[camId] ?? [])[0];
    addEvent({
      id: `E-${90000 + Math.floor(Math.random() * 900)}`,
      t: Date.now(),
      type: mode === "Loitering" ? "Loitering" : "Intrusion",
      sev: "high",
      cam: cam.code,
      site: cam.site,
      conf: t ? t.conf : 0.81,
      status: "new",
      summary: `Test injection — ${mode.toLowerCase()} ${editing ?? "new zone"} tripped by synthetic track. Verify alert path to C2 before live use.`,
      track: t ? `#${t.id}` : "#T-TEST",
      evidence: "SYNTHETIC · no clip",
      zone: name || mode,
      subject: "Test subject 1.74 m",
      x: Math.round(t?.x ?? 48),
      y: Math.round(t?.y ?? 56),
    });
    say("Test injection dispatched to alert stream");
  };

  return (
    <>
      <ViewHead
        kicker="Intelligence · zones"
        title="Virtual Fence"
        desc="Draw the boundary on the picture itself. Tripwires, exclusion polygons, loiter regions and direction gates are software objects — retasking a sector never means going on site to move hardware."
        right={
          <>
            <Segmented value={mode} onChange={(v) => setMode(v)} options={MODES.map((m) => ({ value: m.v, label: m.label }))} />
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadJSONFile(`IBVAP-Virtual-Fence-Zones-${cam.id}.json`, zones);
                say("Downloaded Virtual Fence zone ruleset (.json)");
              }}
            >
              Export Zones (.JSON)
            </Btn>
            <Btn
              variant="primary"
              icon={<Bell size={13} />}
               onClick={() => runDownloadTask(
                 () => downloadPatrolBriefingPDF(zones, cam),
                 say,
                 `IBVAP-Patrol-Briefing-${cam.id}.pdf`,
               )}
            >
              Brief Troops (.PDF)
            </Btn>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="space-y-4">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <CameraFrame
                cam={cam}
                tracks={world[camId] ?? []}
                minConf={minConf}
                overlays={{ ...overlays, fence: true, trails: true, heat: false }}
                pending={pts.length ? pts : undefined}
                zoneLines={pts.length ? pts : zones.find((z) => z.cam === camId)?.points}
                onPick={(x, y) => setPts((p) => [...p, [+x.toFixed(1), +y.toFixed(1)]])}
              />
              <div className="on-stage flex flex-wrap items-center gap-2.5 border-t border-stagehair bg-[#111318]/95 px-3 py-2.5">
                <span className="font-mono text-[10.5px] text-white/70">
                  {pts.length ? `${pts.length} waypoint${pts.length > 1 ? "s" : ""} placed` : "Click the picture to place waypoints"}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Btn variant="stage" icon={<Undo2 size={12} />} onClick={() => setPts((p) => p.slice(0, -1))} title="Remove last waypoint">
                    Undo
                  </Btn>
                  <Btn variant="stage" icon={<Eraser size={12} />} onClick={() => setPts([])} title="Clear points">
                    Clear
                  </Btn>
                  {closed && pts.length > 2 && (
                    <Btn variant="stage" onClick={() => setPts((p) => p)} title="Polygon will auto-close">
                      {pts.length} pts · closed
                    </Btn>
                  )}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <Card hover={false} className="p-3.5">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5">Zone name</Label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`${cam.site} · ${mode.split(" (")[0].toLowerCase()}`}
                      className="h-9 w-full rounded-[9px] border border-hairline bg-paper/60 px-3 text-[13px] tracking-tight text-ink outline-none transition-all placeholder:text-ink4 focus:border-signal/35 focus:bg-white focus:ring-2 focus:ring-signal/12"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Slider label="Sensitivity" value={sens} min={20} max={99} step={1} onChange={setSens} fmt={(v) => `${v}`} />
                    <Slider label="Min object size" value={minSize} min={6} max={60} step={1} onChange={setMinSize} fmt={(v) => `${v} px`} />
                    <Slider label="Dwell before alert" value={dwell} min={0} max={120} step={5} onChange={setDwell} fmt={(v) => (mode === "Loitering" ? `${v} s` : "n/a")} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented
                      value={dir}
                      onChange={setDir}
                      options={[
                        { value: "both", label: <span className="flex items-center gap-1"><FlipHorizontal2 size={11} /> Both ways</span> },
                        { value: "in", label: "Entering only" },
                        { value: "out", label: "Exiting only" },
                      ]}
                    />
                    <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink3">
                      <Ruler size={11} /> {geo.len ? `${geo.len} m boundary` : "—"}
                      {closed && geo.area > 0 && <span className="text-ink4">· {Math.round(geo.area)} m² area</span>}
                    </span>
                    <span className="micro text-ink4">calibration 1 % ≡ {M_PER_PX.toFixed(2)} m</span>
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-2 rounded-[12px] border border-hairline bg-paper/60 p-3">
                  <div>
                    <Label>Commit</Label>
                    <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink2">
                      {ready ? "Geometry valid for the fence rule engine." : `Place ${closed ? "3" : "2"}+ waypoints to arm this zone.`}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Btn variant="primary" icon={<Save size={13} />} onClick={commit} className={cn(!ready && "pointer-events-none opacity-40")}>
                      {editing ? "Update zone" : "Save & arm zone"}
                    </Btn>
                    <Btn size="sm" icon={<Zap size={12} />} onClick={simulate}>
                      Test injection
                    </Btn>
                  </div>
                </div>
              </div>
            </Card>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <Card hover={false} className="p-0">
            <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
              <Label>Zones on this sector</Label>
              <span className="micro text-signal">{zones.filter((z) => z.enabled).length}/{zones.length} armed</span>
            </div>
            <div className="divide-y divide-hairline">
              {zones.map((z) => {
                const onCam = z.cam === camId;
                return (
                  <div
                    key={z.id}
                    className={cn("group px-3.5 py-3 transition-colors", onCam && "bg-signal-soft/35", editing === z.id && "bg-[#fdf7e6]")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full", z.enabled ? "bg-signal" : "bg-ink4")} />
                          <span className="truncate text-[12.5px] font-medium tracking-tight text-ink">{z.name}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-[9.5px] text-ink3">
                          {z.mode} · {CAM_BY_ID[z.cam]?.code ?? "unassigned"}
                        </div>
                      </div>
                      <Switch on={z.enabled} onChange={() => toggleZone(z.id)} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="tnum w-14 shrink-0 font-mono text-[9.5px] text-ink3">sens {z.sens}</span>
                      <div className="flex-1">
                        <Bar pct={z.sens} h={4} color={z.enabled ? "#0e6d61" : "#c9c6bf"} />
                      </div>
                      <span className="tnum shrink-0 font-mono text-[9.5px] text-ink3">{z.hits} hits</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Btn
                        size="sm"
                        onClick={() => {
                          setCamId(z.cam);
                          setPts(z.points ?? []);
                          setEditing(z.id);
                          setMode(z.mode as (typeof MODES)[number]["v"]);
                          setSens(z.sens);
                          setName(z.name);
                        }}
                      >
                        Edit geometry
                      </Btn>
                      <Btn size="sm" onClick={() => saveZone({ ...z, enabled: true, hits: z.hits })} title="Force re-evaluate from current frame">
                        Re-eval
                      </Btn>
                      <button
                        onClick={() => {
                          deleteZone(z.id);
                          say(`${z.id} removed from rule engine`);
                        }}
                        className="ml-auto grid h-6 w-6 place-items-center rounded-[6px] text-ink4 transition-colors hover:bg-alert-soft hover:text-alert"
                      >
                        <Trash2 size={11.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-hairline p-3.5">
              <Label className="mb-2">Attach zone to camera</Label>
              <div className="grid max-h-[152px] grid-cols-2 gap-1 overflow-y-auto pr-1">
                {CAMERAS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCamId(c.id)}
                    className={cn(
                      "truncate rounded-[7px] border px-2 py-1 text-left font-mono text-[9.5px] transition-colors",
                      c.id === camId ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink3 hover:border-[#cfccc5] hover:text-ink",
                    )}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </>
  );
}

export type { Zone };
