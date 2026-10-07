import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Crosshair,
  Link2,
  Pause,
  Play,
  Route,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { DEMO_INCIDENT, EDGE_STYLE, NODE_STYLE, type IncidentEdge } from "../lib/incident";
import { CAMERAS } from "../lib/data";
import { useApp } from "../state/store";
import { Btn, Card, Label, Reveal, SevPill, ViewHead } from "../components/ui";

const cameraFor = (code: string) => CAMERAS.find((c) => code.includes(c.code.split(" / ")[1] ?? "___") && code.startsWith(c.code.split(" / ")[0])) ?? null;

const GRAPH_W = 1200;
const NODE_W = 144;
const NODE_H = 44;
const PAD_L = 155; // keep node bodies clear of lane names
const PAD_R = 36;
const ROW_STEP = 52;
const LANE_HEADER = 30;
const TOP = 28;

function graphLayout(incident: typeof DEMO_INCIDENT) {
  const positions = new Map<string, { x: number; y: number; row: number }>();
  const lanes: { top: number; height: number; mid: number }[] = [];
  const span = GRAPH_W - PAD_L - PAD_R - NODE_W;
  let top = TOP;

  incident.lanes.forEach((_, laneIndex) => {
    const occupiedUntil: number[] = [];
    const laneNodes = incident.nodes.filter((n) => n.lane === laneIndex).sort((a, b) => a.t - b.t);
    for (const node of laneNodes) {
      const x = PAD_L + (node.t / incident.durationSec) * span;
      let row = occupiedUntil.findIndex((right) => x >= right + 12);
      if (row === -1) row = occupiedUntil.length;
      occupiedUntil[row] = x + NODE_W;
      positions.set(node.id, { x, y: top + LANE_HEADER + row * ROW_STEP, row });
    }
    const height = LANE_HEADER + Math.max(1, occupiedUntil.length) * ROW_STEP + 13;
    lanes.push({ top, height, mid: top + height / 2 });
    top += height;
  });

  return { positions, lanes, height: top + 15, span };
}

function connectionPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  // Close events sit on different rows. Route those vertically, behind cards.
  if (to.x < from.x + NODE_W + 14) {
    const down = to.y > from.y;
    const x1 = from.x + NODE_W * 0.72;
    const x2 = to.x + NODE_W * 0.28;
    const y1 = down ? from.y + NODE_H : from.y;
    const y2 = down ? to.y : to.y + NODE_H;
    const bend = down ? 20 : -20;
    return `M${x1} ${y1} C${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
  }
  const x1 = from.x + NODE_W;
  const x2 = to.x;
  const y1 = from.y + NODE_H / 2;
  const y2 = to.y + NODE_H / 2;
  const bend = Math.max(28, (x2 - x1) * 0.46);
  return `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export function IncidentGraph() {
  const app = useApp();
  const inc = DEMO_INCIDENT;
  const [playhead, setPlayhead] = useState(inc.durationSec);
  const [playing, setPlaying] = useState(true);
  const [selected, setSelected] = useState<string | null>("n1");

  const visible = useMemo(() => inc.nodes.filter((n) => n.t <= playhead), [inc.nodes, playhead]);
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const nodeById = useMemo(() => Object.fromEntries(inc.nodes.map((n) => [n.id, n])), [inc.nodes]);

  const layout = useMemo(() => graphLayout(inc), [inc]);

  /* Autoplay: assemble the chain once on mount so the graph builds itself. */
  useEffect(() => {
    setPlayhead(0);
    setPlaying(true);
  }, []);

  /* One interval for the whole playback — recreating it per frame causes jitter. */
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setPlayhead((p) => {
        const next = p + 3.4;
        if (next >= inc.durationSec) {
          setPlaying(false);
          return inc.durationSec;
        }
        return next;
      });
    }, 22);
    return () => window.clearInterval(id);
  }, [playing, inc.durationSec]);

  const node = selected ? nodeById[selected] : null;
  const incoming = selected ? inc.edges.filter((e) => e.to === selected) : [];
  const outgoing = selected ? inc.edges.filter((e) => e.from === selected) : [];

  return (
    <>
      <ViewHead
        kicker="Intelligence · cross-camera assembly"
        title="One incident, not four alerts."
        desc="Separately-raised signals from five cameras resolved into a single causal chain: air release, ground recovery, object custody and a departing vehicle. Drag the timeline to see how the platform assembled it."
        right={
          <>
            <Btn
              variant={playing ? "primary" : "quiet"}
              icon={playing ? <Pause size={13} /> : <Play size={13} />}
              onClick={() => {
                if (playhead >= inc.durationSec) setPlayhead(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? "Pause assembly" : "Replay assembly"}
            </Btn>
            <Btn icon={<Route size={13} />} onClick={() => app.setView("response")}>
              Open Response Twin
            </Btn>
          </>
        }
      />

      {/* hero graph */}
      <Reveal>
        <div className="grain overflow-hidden rounded-[18px] border border-[#24272e] bg-[#15171c] shadow-[0_30px_80px_-50px_rgba(10,12,16,.9)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[.14em] text-white/40">Incident graph</span>
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-[3px] font-mono text-[9.5px] text-white/75">
                {inc.id}
              </span>
              <SevPill sev={inc.severity} />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-white/45">
                {visible.length} / {inc.nodes.length} nodes assembled
              </span>
              <span className="tnum font-mono text-[11px] text-white/80">
                T+{String(Math.floor(playhead / 60)).padStart(2, "0")}:{String(Math.round(playhead) % 60).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="relative overflow-x-auto">
            <svg viewBox={`0 0 ${GRAPH_W} ${layout.height}`} preserveAspectRatio="xMidYMid meet" className="block h-auto w-full min-w-[1120px]">
              {/* A true time axis stays fixed while close events use a second row. */}
              {[0, 60, 120, 180].map((sec) => {
                const x = PAD_L + (sec / inc.durationSec) * layout.span;
                return (
                  <g key={sec}>
                    <line x1={x} x2={x} y1={TOP + 5} y2={layout.height - 20} stroke="#ffffff" strokeOpacity=".055" strokeDasharray="3 7" />
                    <text x={x} y={TOP - 9} fill="#ffffff55" fontSize="9" fontFamily="IBM Plex Mono, monospace" textAnchor="middle">
                      {String(Math.floor(sec / 60)).padStart(2, "0")}:{String(sec % 60).padStart(2, "0")}
                    </text>
                  </g>
                );
              })}
              {/* lane rules */}
              {inc.lanes.map((l, i) => (
                <g key={l.key}>
                  {i % 2 === 0 && <rect x="0" y={layout.lanes[i].top} width={GRAPH_W} height={layout.lanes[i].height} fill="#ffffff" opacity=".012" />}
                  <line x1={0} x2={GRAPH_W} y1={layout.lanes[i].top + layout.lanes[i].height} y2={layout.lanes[i].top + layout.lanes[i].height} stroke="#ffffff0e" strokeWidth="1" />
                  <text x="19" y={layout.lanes[i].mid - 4} fill="#ffffff70" fontSize="10" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.2">
                    {l.label}
                  </text>
                  <text x="19" y={layout.lanes[i].mid + 12} fill="#ffffff34" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">
                    {l.camera}
                  </text>
                </g>
              ))}

              {/* causal edges */}
              {inc.edges.map((e) => {
                const a = layout.positions.get(e.from);
                const b = layout.positions.get(e.to);
                if (!a || !b) return null;
                const visibleEdge = visibleIds.has(e.from) && visibleIds.has(e.to);
                const style = EDGE_STYLE[e.kind];
                const path = connectionPath(a, b);
                const highlighted = selected === e.from || selected === e.to;
                return (
                  <g key={e.id} opacity={visibleEdge ? (highlighted ? 1 : 0.35) : 0.06} style={{ transition: "opacity .35s" }}>
                    <path
                      d={path}
                      fill="none"
                      stroke={style.color}
                      strokeWidth={highlighted ? 2 : 1.3}
                      strokeDasharray={style.dash}
                      className={visibleEdge && highlighted ? "dashmove" : undefined}
                    />
                    {visibleEdge && highlighted && (
                      <circle r="2.6" fill={style.color}>
                        <animateMotion dur="2.6s" repeatCount="indefinite" path={path} />
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* nodes */}
              {inc.nodes.map((n) => {
                const p = layout.positions.get(n.id)!;
                const shown = visibleIds.has(n.id);
                const s = NODE_STYLE[n.type];
                const on = selected === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x} ${p.y})`}
                    opacity={shown ? 1 : 0.14}
                    style={{ transition: "opacity .45s", cursor: "pointer" }}
                    onClick={() => setSelected(n.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${n.label}, ${n.cam}, T plus ${n.t} seconds`}
                  >
                    <title>{n.label} | {n.detail}</title>
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx="9"
                      fill={on ? "#2b3230" : "#20242a"}
                      stroke={on ? s.color : "#ffffff16"}
                      strokeWidth={on ? 1.6 : 1}
                    />
                    <rect width="3" height={NODE_H} rx="1.5" fill={s.color} />
                    <circle cx="14" cy="15" r="4" fill={s.color} />
                    <text x="25" y="18" fill="#ffffffd8" fontSize="9.5" fontFamily="IBM Plex Mono, monospace" letterSpacing="0.6">
                      {String(Math.floor(n.t / 60)).padStart(2, "0")}:{String(n.t % 60).padStart(2, "0")}
                    </text>
                    <text x="14" y="32" fill="#ffffffee" fontSize="10.2" fontWeight="600">
                      {n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label}
                    </text>
                    <rect x="14" y="38" width={NODE_W - 28} height="2" rx="1" fill="#ffffff14" />
                    <rect x="14" y="38" width={(NODE_W - 28) * n.conf} height="2" rx="1" fill={s.color} />
                  </g>
                );
              })}

              {/* playhead */}
              <g transform={`translate(${PAD_L + (playhead / inc.durationSec) * layout.span} 0)`} pointerEvents="none">
                <line y1={TOP + 5} y2={layout.height - 14} stroke="#47bea8" strokeWidth="1.15" opacity=".72" />
                <circle cy={TOP + 5} r="3.5" fill="#47bea8" />
              </g>
            </svg>
          </div>

          {/* timeline scrubber */}
          <div className="border-t border-white/8 bg-[#111318] px-5 py-3">
            <input
              type="range"
              min={0}
              max={inc.durationSec}
              step={1}
              value={playhead}
              onChange={(e) => {
                setPlaying(false);
                setPlayhead(Number(e.target.value));
              }}
              className="w-full"
              style={{ ["--rng-pct" as string]: `${(playhead / inc.durationSec) * 100}%`, ["--rng-accent" as string]: "#0e6d61" }}
            />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-white/35">
              <span>00:00 · UAS detected</span>
              <span>01:08 · custody transfer</span>
              <span>02:23 · plate read</span>
              <span>03:02 · intercept plan</span>
            </div>
          </div>
        </div>
      </Reveal>

      {/* custody chain — the story spine */}
      <Reveal delay={60}>
        <Card hover={false} className="mt-5 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-[#b58cf5]" />
                <span className="text-[14px] font-semibold tracking-tight">Object custody chain</span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink3">
                The platform tracked the payload through four handoffs. Without this, the drone drop and the departing pickup are two unrelated events.
              </p>
            </div>
            <span className="font-mono text-[10px] text-ink3">OBJ-118 · 4 transfers · 0 gaps</span>
          </div>

          <div className="relative flex flex-wrap items-stretch gap-px overflow-hidden bg-hairline">
            {inc.custody.map((c, i) => (
              <div key={c.id} className="relative min-w-[210px] flex-1 bg-surface px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="micro text-ink3">{c.action}</span>
                  <span className="tnum font-mono text-[9.5px] text-ink4">T+{c.t}s</span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 text-[11.5px]">
                  <span className="truncate text-ink2">{c.from}</span>
                  <ArrowRight size={12} className="shrink-0 text-ink4" />
                  <span className="truncate font-semibold text-ink">{c.to}</span>
                </div>
                <div className="mt-2.5"><Bar pct={c.conf * 100} color="#b58cf5" /></div>
                <div className="mt-2 font-mono text-[9px] text-ink4">
                  {c.cam} · conf {(c.conf * 100).toFixed(0)}%
                </div>
                <div className="mt-1 text-[10.5px] leading-[1.4] text-ink3">{c.evidence}</div>
                {i < inc.custody.length - 1 && (
                  <span className="absolute right-[-1px] top-1/2 hidden h-6 w-[2px] -translate-y-1/2 bg-[#b58cf5] opacity-30 sm:block" />
                )}
              </div>
            ))}
          </div>
        </Card>
      </Reveal>

      {/* selected node + topology + bridge */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Reveal delay={90}>
          <Card hover={false} className="h-full p-0">
            <div className="border-b border-hairline px-5 py-3.5">
              <Label>Selected observation</Label>
            </div>
            {node ? (
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full font-mono text-[9px] text-white"
                        style={{ background: NODE_STYLE[node.type].color }}
                      >
                        {NODE_STYLE[node.type].glyph}
                      </span>
                      <span className="micro text-ink3">{NODE_STYLE[node.type].label}</span>
                    </div>
                    <h3 className="mt-2 font-display text-[22px] font-semibold tracking-[-0.03em]">{node.label}</h3>
                    <p className="mt-2 max-w-[62ch] text-[12.5px] leading-[1.6] text-ink2">{node.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum font-display text-[26px] font-semibold tracking-[-0.04em]">{(node.conf * 100).toFixed(0)}%</div>
                    <div className="micro mt-1 text-ink3">confidence</div>
                  </div>
                </div>

                {cameraFor(node.cam) && (
                  <div className="mt-4 overflow-hidden rounded-[11px] border border-[#24272e]">
                    <div className="relative aspect-[16/6] w-full">
                      <img
                        src={cameraFor(node.cam)!.thumb}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ objectPosition: "50% 45%", filter: "saturate(.72) contrast(1.06) brightness(.86)" }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-black/18" />
                      <div className="absolute inset-x-3 bottom-2 flex items-center justify-between">
                        <span className="font-mono text-[9px] text-white/80">{node.cam}</span>
                        <span className="font-mono text-[9px] text-white/55">T+{node.t}s · {node.evidence}</span>
                      </div>
                      <div className="absolute left-3 top-2 flex items-center gap-1.5 rounded-[5px] bg-black/45 px-1.5 py-[2px] backdrop-blur-sm">
                        <span className="h-[5px] w-[5px] rounded-full bg-[#3ddc97] live-dot" />
                        <span className="font-mono text-[8.5px] text-white/75">source frame</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[11px] border border-hairline bg-hairline sm:grid-cols-4">
                  <div className="bg-surface px-3 py-2.5">
                    <Label>Camera</Label>
                    <div className="mt-1 text-[12px] font-medium tracking-tight">{node.cam}</div>
                  </div>
                  <div className="bg-surface px-3 py-2.5">
                    <Label>Time</Label>
                    <div className="mt-1 tnum text-[12px] font-medium tracking-tight">T+{node.t}s</div>
                  </div>
                  <div className="bg-surface px-3 py-2.5">
                    <Label>Evidence</Label>
                    <div className="mt-1 font-mono text-[11px] text-ink2">{node.evidence}</div>
                  </div>
                  <div className="bg-surface px-3 py-2.5">
                    <Label>Node</Label>
                    <div className="mt-1 font-mono text-[11px] text-ink2">{node.id.toUpperCase()}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <Label className="mb-2">Recorded attributes</Label>
                    <div className="overflow-hidden rounded-[10px] border border-hairline">
                      {node.meta.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between border-b border-hairline px-3 py-[7px] last:border-0">
                          <span className="text-[11.5px] text-ink3">{k}</span>
                          <span className="text-[11.5px] font-medium tracking-tight text-ink">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2">Relations in this incident</Label>
                    <div className="space-y-1.5">
                      {[...incoming, ...outgoing].map((e: IncidentEdge) => {
                        const other = e.from === node.id ? e.to : e.from;
                        const out = e.from === node.id;
                        return (
                          <button
                            key={e.id}
                            onClick={() => setSelected(other)}
                            className="flex w-full items-center gap-2 rounded-[9px] border border-hairline bg-paper/60 px-2.5 py-2 text-left transition-colors hover:border-[#d2cfc8] hover:bg-white"
                          >
                            <span
                              className="h-6 w-[3px] shrink-0 rounded-full"
                              style={{ background: EDGE_STYLE[e.kind].color }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11.5px] font-medium tracking-tight text-ink">
                                {out ? e.relation : `← ${e.relation}`}
                              </span>
                              <span className="block truncate font-mono text-[9.5px] text-ink3">
                                {nodeById[other]?.label ?? other}
                              </span>
                            </span>
                            <span className="tnum shrink-0 font-mono text-[9.5px] text-ink4">{(e.conf * 100).toFixed(0)}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-[12.5px] text-ink3">
                Select any node in the graph to inspect its evidence and relations.
              </div>
            )}
          </Card>
        </Reveal>

        <Reveal delay={120}>
          <div className="space-y-4">
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-4 py-3">
                <Label>Why this matters</Label>
              </div>
              <div className="space-y-2.5 p-4">
                {inc.summary.map((s) => (
                  <div key={s} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                    <p className="text-[11.5px] leading-[1.55] text-ink2">{s}</p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="rounded-[13px] border border-signal/25 bg-signal-soft/55 p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-signal" />
                <span className="text-[13px] font-semibold tracking-tight">Assembly quality</span>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ["Cameras correlated", "5 of 5"],
                  ["Orphan alerts remaining", "0"],
                  ["Custody gaps", "0"],
                  ["Identity anchors", "1 plate · 1 vehicle"],
                  ["Chain confidence", "0.87"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-signal/12 pb-1.5 last:border-0">
                    <span className="text-[11px] text-ink2">{k}</span>
                    <span className="tnum font-mono text-[10.5px] font-semibold text-ink">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-[1.5] text-ink3">
                A conventional platform would have produced separate alerts. The operator would have to assemble the story alone.
              </p>
            </div>

            <Card hover={false} className="p-4">
              <div className="flex items-center gap-2">
                <Crosshair size={14} className="text-ink3" />
                <span className="text-[13px] font-semibold tracking-tight">Camera topology</span>
              </div>
              <svg viewBox="0 0 280 132" className="mt-3 w-full">
                <path d="M22 92 C 82 84, 126 62, 172 58 S 236 50, 264 44" fill="none" stroke="#d6dad4" strokeWidth="8" strokeLinecap="round" />
                <path d="M22 92 C 82 84, 126 62, 172 58 S 236 50, 264 44" fill="none" stroke="#0e6d61" strokeWidth="1.6" strokeDasharray="5 4" className="dashmove" />
                {[
                  { x: 22, y: 92, label: "BOP-11", n: 2 },
                  { x: 126, y: 62, label: "BOP-07", n: 3 },
                  { x: 208, y: 52, label: "CHK-12", n: 2 },
                  { x: 264, y: 44, label: "Egress", n: 0 },
                ].map((s) => (
                  <g key={s.label}>
                    <circle cx={s.x} cy={s.y} r="7" fill="#fff" stroke="#0e6d61" strokeWidth="1.4" />
                    <circle cx={s.x} cy={s.y} r="2.6" fill="#0e6d61" />
                    <text x={s.x} y={s.y + 18} textAnchor="middle" fontSize="8" fill="#4b4e54" fontFamily="IBM Plex Mono, monospace">
                      {s.label}
                    </text>
                    {s.n > 0 && (
                      <text x={s.x} y={s.y - 11} textAnchor="middle" fontSize="8" fill="#0e6d61" fontFamily="IBM Plex Mono, monospace">
                        {s.n} nodes
                      </text>
                    )}
                  </g>
                ))}
              </svg>
              <p className="mt-2 text-[10.5px] leading-[1.5] text-ink3">
                Spatial progression of the incident across the sector, west to east along the feeder corridor.
              </p>
            </Card>

            <Card hover={false} className="p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={14} className="text-alert" />
                <span className="text-[13px] font-semibold tracking-tight">Response handoff</span>
              </div>
              <p className="mt-2 text-[11.5px] leading-[1.55] text-ink2">
                The assembled chain hands directly to the Response Twin, which solves an intercept against the projected vehicle path.
              </p>
              <Btn variant="primary" className="mt-3 w-full" icon={<Route size={13} />} onClick={() => app.setView("response")}>
                Open Response Twin
              </Btn>
            </Card>
          </div>
        </Reveal>
      </div>
    </>
  );
}

/* Local bar to avoid pulling the whole ui index for one atom. */
function Bar({ pct, color = "#0e6d61" }: { pct: number; color?: string }) {
  return (
    <div className="h-[4px] w-full overflow-hidden rounded-full bg-ink/[0.07]">
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}
