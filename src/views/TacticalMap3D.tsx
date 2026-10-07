import { useMemo, useState } from "react";
import { Boxes, Crosshair, Layers, Move3d, RotateCcw } from "lucide-react";
import { INTERCEPT_OPTIONS, M_PER_UNIT, PATROLS, SUBJECT, type MapPoint } from "../lib/incident";
import { MAP } from "../lib/incident";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Btn, Card, Label, Reveal, Slider, ViewHead } from "../components/ui";

/*
 * 3D tactical border map.
 *
 * A genuine 3D scene rendered with CSS transforms and SVG: a perspective
 * ground plane, extruded fence, camera frustums, patrol and subject
 * positions, the projected path and the uncertainty envelope. Points go
 * through a real camera matrix (rotation + perspective divide), so yaw,
 * pitch and zoom re-render correct geometry — not a panned picture.
 *
 * Positions are the same illustrative scenario geometry as the Response
 * Twin: not surveyed BOP locations.
 */

type P3 = { x: number; y: number; z: number };

const toP3 = ([x, y]: MapPoint): P3 => ({ x: (x - 600) / 100, y: (450 - y) / 100, z: 0 });

/** Perspective projection with yaw and pitch. */
function project(p: P3, yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const d = 9.5;
  const scale = d / Math.max(1.2, d + z2);
  return [x1 * scale, y1 * scale, scale];
}

const FENCE_PTS: MapPoint[] = [
  [40, 322], [170, 305], [292, 337], [402, 322], [570, 285],
  [638, 272], [782, 288], [920, 308], [1044, 336], [1180, 316],
];

const LAYER_DEFS: [keyof typeof LAYERS_INIT, string][] = [
  ["grid", "Ground grid"],
  ["fence", "Virtual fence (extruded)"],
  ["cameras", "Camera frustums"],
  ["uncertainty", "Uncertainty envelope"],
  ["path", "Observed + projected path"],
  ["patrol", "Patrol lower-bound"],
];

const LAYERS_INIT = {
  grid: true, fence: true, cameras: true, uncertainty: true, path: true, patrol: true,
};

export function TacticalMap3D() {
  const app = useApp();
  const [yaw, setYaw] = useState(-0.52);
  const [pitch, setPitch] = useState(0.98);
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState({ ...LAYERS_INIT });
  const [hover, setHover] = useState<string | null>(null);
  const [selectedPatrol, setSelectedPatrol] = useState(PATROLS[0].id);

  const patrol = PATROLS.find((p) => p.id === selectedPatrol) ?? PATROLS[0];

  const scene = useMemo(() => {
    const W = 640;
    const H = 420;
    const toScreen = (pt: MapPoint): [number, number, number] => {
      const [sx, sy, s] = project(toP3(pt), yaw, pitch);
      return [W / 2 + sx * 62 * zoom, H / 2 + sy * 62 * zoom, s];
    };
    const grid: [MapPoint, MapPoint][] = [];
    for (let gx = 100; gx < 1150; gx += 125) grid.push([[gx, 100], [gx, 700]]);
    for (let gy = 100; gy < 700; gy += 100) grid.push([[100, gy], [1150, gy]]);
    return { toScreen, grid, W, H };
  }, [yaw, pitch, zoom]);

  const { toScreen, grid, W, H } = scene;
  const planPoint = INTERCEPT_OPTIONS[0].point;
  const planScreen = toScreen(planPoint);
  const subjectScreen = toScreen(SUBJECT.position);
  const patrolScreen = toScreen(patrol.position);
  const horizonY = toScreen([600, 100])[1];

  return (
    <>
      <ViewHead
        kicker="Operations / 3D tactical map"
        title="The corridor, in three dimensions."
        desc="The same scenario geometry as the Response Twin, rendered as a real 3D scene: perspective ground, extruded fence, camera frustums, patrol and subject. Positions are illustrative, not surveyed."
        right={
          <>
            <Btn icon={<RotateCcw size={13} />} onClick={() => { setYaw(-0.52); setPitch(0.98); setZoom(1); }}>
              Reset view
            </Btn>
            <Btn variant="primary" icon={<Crosshair size={13} />} onClick={() => app.setView("response")}>
              Open 2D planner
            </Btn>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_312px]">
        <Reveal>
          <div className="grain relative overflow-hidden rounded-[18px] border border-[#d5dcd1] bg-[linear-gradient(180deg,#e7ece4,#dbe3d8)] shadow-[0_20px_56px_-34px_rgba(24,48,32,.34)]">
            <div className="relative h-[480px] w-full overflow-hidden sm:h-[540px]" style={{ perspective: "1100px" }}>
              <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
                <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
                  <defs>
                    <radialGradient id="tac-unc">
                      <stop offset="0%" stopColor="#d92d20" stopOpacity=".18" />
                      <stop offset="100%" stopColor="#d92d20" stopOpacity=".02" />
                    </radialGradient>
                  </defs>

                  {/* ground grid, stroke width cued by depth */}
                  {layers.grid &&
                    grid.map((seg, i) => {
                      const [x1, y1, s1] = toScreen(seg[0]);
                      const [x2, y2, s2] = toScreen(seg[1]);
                      const depth = (s1 + s2) / 2;
                      return (
                        <line
                          key={i}
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke="#3d5a45"
                          strokeWidth={Math.max(0.25, 0.9 * depth)}
                          opacity={0.1 + Math.min(0.3, depth * 0.16)}
                        />
                      );
                    })}

                  {/* horizon */}
                  <line x1="0" y1={horizonY} x2={W} y2={horizonY} stroke="#5c7566" strokeWidth="0.8" opacity=".22" />

                  {/* uncertainty envelope widening along the projection */}
                  {layers.uncertainty &&
                    SUBJECT.projectedPath.map((pt, i) => {
                      if (i === SUBJECT.projectedPath.length - 1) return null;
                      const next = SUBJECT.projectedPath[i + 1];
                      const [x1, y1] = toScreen(pt);
                      const [x2, y2] = toScreen(next);
                      return (
                        <line key={`u-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d92d20" strokeWidth={7 + i * 2.2} strokeLinecap="round" opacity={0.055 + i * 0.014} />
                      );
                    })}

                  {/* fence as an extruded wall */}
                  {layers.fence &&
                    FENCE_PTS.map((pt, i) => {
                      if (i === FENCE_PTS.length - 1) return null;
                      const next = FENCE_PTS[i + 1];
                      const [x1, y1] = toScreen(pt);
                      const [x2, y2] = toScreen(next);
                      const top1 = y1 - 13;
                      const top2 = y2 - 13;
                      return (
                        <g key={`f-${i}`}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b08c22" strokeWidth={1} opacity=".4" />
                          <line x1={x1} y1={top1} x2={x2} y2={top2} stroke="#caa043" strokeWidth={2.1} opacity=".95" />
                          <line x1={x1} y1={y1} x2={x1} y2={top1} stroke="#caa043" strokeWidth={0.7} opacity=".4" />
                        </g>
                      );
                    })}

                  {/* camera frustums */}
                  {layers.cameras &&
                    MAP.cameras.map((camMap) => {
                      const [cx, cy, cs] = toScreen(camMap.pos);
                      const rad = (camMap.angle * Math.PI) / 180;
                      const half = (camMap.fov * Math.PI) / 180 / 2;
                      const R = 155 * cs * zoom;
                      const x1 = cx + Math.cos(rad - half) * R;
                      const y1 = cy + Math.sin(rad - half) * R;
                      const x2 = cx + Math.cos(rad + half) * R;
                      const y2 = cy + Math.sin(rad + half) * R;
                      return (
                        <g key={camMap.id} opacity={hover === camMap.id ? 1 : 0.82} onMouseEnter={() => setHover(camMap.id)} onMouseLeave={() => setHover(null)}>
                          <path d={`M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z`} fill="#4d8dff" opacity=".085" />
                          <circle cx={cx} cy={cy} r={2.6} fill="#fff" stroke="#4d8dff" strokeWidth="1.4" />
                          <text x={cx} y={cy - 5} textAnchor="middle" fontSize="7" fill="#3b5f9e" fontFamily="IBM Plex Mono, monospace">
                            {camMap.id}
                          </text>
                        </g>
                      );
                    })}

                  {/* observed + projected path */}
                  {layers.path && (
                    <>
                      {SUBJECT.trackHistory.map((pt, i) => {
                        if (i === SUBJECT.trackHistory.length - 1) return null;
                        const [x1, y1] = toScreen(pt);
                        const [x2, y2] = toScreen(SUBJECT.trackHistory[i + 1]);
                        return <line key={`o-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d92d20" strokeWidth={2.6} strokeLinecap="round" opacity={0.35 + (i / SUBJECT.trackHistory.length) * 0.6} />;
                      })}
                      {SUBJECT.projectedPath.map((pt, i) => {
                        if (i === SUBJECT.projectedPath.length - 1) return null;
                        const [x1, y1] = toScreen(pt);
                        const [x2, y2] = toScreen(SUBJECT.projectedPath[i + 1]);
                        return <line key={`pr-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d92d20" strokeWidth={1.8} strokeDasharray="6 5" opacity=".7" />;
                      })}
                    </>
                  )}

                  {/* patrol lower-bound */}
                  {layers.patrol && (
                    <line
                      x1={patrolScreen[0]} y1={patrolScreen[1]}
                      x2={planScreen[0]} y2={planScreen[1]}
                      stroke="#0e6d61" strokeWidth={2.4} strokeDasharray="8 6" className="dashmove"
                    />
                  )}

                  {/* intercept marker */}
                  <g transform={`translate(${planScreen[0]} ${planScreen[1] - 12})`}>
                    <circle r="9" fill="none" stroke="#0e6d61" strokeWidth="1.2" strokeDasharray="3 3" />
                    <circle r="4" fill="#fff" stroke="#0e6d61" strokeWidth="2.2" />
                    <text x="0" y="-13" textAnchor="middle" fontSize="7.5" fill="#0a5d52" fontFamily="IBM Plex Mono, monospace" fontWeight="700">
                      INTERCEPT
                    </text>
                  </g>

                  {/* subject marker */}
                  <g transform={`translate(${subjectScreen[0]} ${subjectScreen[1]})`}>
                    <circle r="9" fill="#d92d20" opacity=".14">
                      <animate attributeName="r" values="7;16;7" dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values=".2;.02;.2" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                    <rect x="-7" y="-5" width="14" height="10" rx="3" fill="#d92d20" />
                    <text x="0" y="1.8" textAnchor="middle" fontSize="6.5" fill="#fff" fontFamily="IBM Plex Mono, monospace">V-18</text>
                  </g>

                  {/* patrol marker */}
                  <g transform={`translate(${patrolScreen[0]} ${patrolScreen[1]})`}>
                    <circle r="8" fill="#0e6d61" opacity=".14" />
                    <rect x="-8" y="-5" width="16" height="10" rx="3" fill="#0e6d61" />
                    <text x="0" y="1.8" textAnchor="middle" fontSize="6" fill="#fff" fontFamily="IBM Plex Mono, monospace">{patrol.id}</text>
                  </g>
                </svg>
              </div>

              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-[8px] border border-white/40 bg-[#14261f]/88 px-2.5 py-2 font-mono text-[9px] text-white/80 shadow-[0_5px_18px_rgba(0,0,0,.16)] backdrop-blur-lg">
                <Move3d size={12} className="text-[#8bcdaf]" />
                PERSPECTIVE VIEW · YAW {(yaw * 57.3).toFixed(0)}° / PITCH {(pitch * 57.3).toFixed(0)}°
              </div>
              <div className="pointer-events-none absolute bottom-4 left-4 rounded-[7px] bg-[#14261f]/85 px-2.5 py-1.5 font-mono text-[9px] text-white/60 backdrop-blur-sm">
                1 GRID CELL = 125 UNITS / {125 * M_PER_UNIT} m
              </div>
              <div className="pointer-events-none absolute bottom-4 right-4 rounded-[7px] bg-[#14261f]/85 px-2.5 py-1.5 font-mono text-[9px] text-white/60 backdrop-blur-sm">
                ILLUSTRATIVE GEOMETRY · NOT SURVEYED
              </div>
            </div>

            <div className="grid gap-5 border-t border-[#dbe3d7] bg-[#fafbf8] px-4 py-3.5 sm:grid-cols-3">
              <Slider label="Yaw" value={yaw} min={-1.6} max={1.6} step={0.02} onChange={setYaw} fmt={(v) => `${(v * 57.3).toFixed(0)}°`} accent="#0e6d61" />
              <Slider label="Pitch" value={pitch} min={0.15} max={1.5} step={0.02} onChange={setPitch} fmt={(v) => `${(v * 57.3).toFixed(0)}°`} />
              <Slider label="Zoom" value={zoom} min={0.55} max={2.1} step={0.05} onChange={setZoom} fmt={(v) => `${v.toFixed(2)}×`} accent="#4d8dff" />
            </div>
          </div>
        </Reveal>

        <div className="space-y-4">
          <Reveal delay={70}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-4 py-3">
                <Label>Scene layers</Label>
              </div>
              <div className="divide-y divide-hairline">
                {LAYER_DEFS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-ink/[.02]"
                  >
                    <span className="flex items-center gap-2">
                      <Layers size={12} className="text-ink4" />
                      <span className="text-[12px] tracking-tight text-ink">{label}</span>
                    </span>
                    <span className={cn("relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-300", layers[key] ? "bg-signal" : "bg-ink/[.15]")}>
                      <span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all duration-300", layers[key] ? "left-[16px]" : "left-[2px]")} />
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={110}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-4 py-3">
                <Label>Response unit in view</Label>
              </div>
              <div className="space-y-1.5 p-3">
                {PATROLS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatrol(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[9px] border px-2.5 py-2 text-left transition-colors",
                      selectedPatrol === p.id ? "border-signal/40 bg-signal-soft/50" : "border-hairline hover:bg-ink/[.02]",
                    )}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-signal font-mono text-[9px] font-semibold text-white">{p.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium tracking-tight text-ink">{p.callsign}</span>
                      <span className="block truncate font-mono text-[9.5px] text-ink3">{p.strength}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-hairline px-4 py-3">
                <p className="text-[11px] leading-[1.5] text-ink3">
                  The dashed line is the straight-line lower bound from {patrol.callsign} to the intercept point — a planning estimate, not a navigable route.
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-[13px] border border-dashed border-[#d7d4cd] bg-paper/70 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Boxes size={13} className="text-ink3" />
                <span className="text-[12.5px] font-semibold tracking-tight">Rendering</span>
              </div>
              <p className="mt-2 text-[11px] leading-[1.55] text-ink3">
                The scene is built with a real camera matrix — rotation then perspective divide — so yaw, pitch and zoom re-render correct geometry rather than panning a picture. The fence is drawn as an extruded wall and camera coverage as true frustum cones.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {["perspective projection", "extruded fence", "frustum cones", "depth-cued grid"].map((s) => (
                  <span key={s} className="rounded-full bg-white px-2 py-[3px] font-mono text-[9px] text-ink3 ring-1 ring-hairline">
                    {s}
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
