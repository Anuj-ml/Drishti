import { useState } from "react";
import { Download, Link2, Radio, Satellite, Wrench, Zap } from "lucide-react";
import { CAMERAS, SITES, type Site } from "../lib/data";
import { downloadCameraVideoClip, downloadMaintenanceTicketPDF, downloadSiteHealthCSV, runDownloadTask } from "../lib/downloads";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { MiniFeed } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Ring, Segmented, Stat, ViewHead } from "../components/ui";

const POS: Record<string, [number, number]> = {
  bop07: [16, 30],
  bop03: [34, 62],
  chk12: [52, 26],
  bop21: [68, 58],
  bop11: [82, 34],
  bop05: [46, 82],
  chk04: [26, 46],
};

export function Sites() {
  const { world, setCamId, setView, say } = useApp();
  const [site, setSite] = useState<Site | null>(SITES[0]);
  const [view, setViewMode] = useState<"grid" | "list">("grid");
  const [hover, setHover] = useState<string | null>(null);

  const cams = CAMERAS.filter((c) => !site || c.site === site.name.split(" · ")[0] || c.site.includes(site.name.split(" ")[0]));

  return (
    <>
      <ViewHead
        kicker="Infrastructure · registry"
        title="Sites, streams & edge boxes"
        desc="Every registered camera, what it can see, and what the platform can extract from it. Coverage gaps are explicit — the system tells you where the picture, not the algorithm, is the limit."
        right={
          <>
            <Segmented value={view} onChange={setViewMode} options={[{ value: "grid", label: "Feeds" }, { value: "list", label: "Registry" }]} />
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadSiteHealthCSV();
                say("Downloaded Sector Site & Camera Health Audit (.csv)");
              }}
            >
              Export Audit (.CSV)
            </Btn>
            <Btn
              variant="primary"
              icon={<Zap size={13} />}
              onClick={() => {
                downloadSiteHealthCSV();
                say("Health sweep completed · Audit report downloaded");
              }}
            >
              Run Health Sweep
            </Btn>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_356px]">
        <div className="space-y-4">
          {/* schematic sector map */}
          <Reveal>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <Satellite size={13} className="text-signal" />
                  <Label>Sector schematic · working boundary, not to scale</Label>
                </div>
                <span className="micro text-ink3">{SITES.length} sites · 67 streams</span>
              </div>
              <div className="relative overflow-hidden bg-[linear-gradient(180deg,#f7f6f3,#efeeea)]">
                <svg viewBox="0 0 100 62" className="block h-[300px] w-full">
                  <defs>
                    <pattern id="tint" width="4" height="4" patternUnits="userSpaceOnUse">
                      <circle cx="0.6" cy="0.6" r="0.28" fill="rgba(20,22,26,.09)" />
                    </pattern>
                  </defs>
                  <rect width="100" height="62" fill="url(#tint)" />
                  {/* contours */}
                  {[0, 1, 2, 3].map((i) => (
                    <path
                      key={i}
                      d={`M-2 ${16 + i * 11} C 18 ${8 + i * 12}, 34 ${28 + i * 8}, 52 ${18 + i * 11} S 84 ${6 + i * 13}, 102 ${20 + i * 10}`}
                      fill="none"
                      stroke="rgba(20,22,26,.07)"
                      strokeWidth="0.5"
                    />
                  ))}
                  {/* river */}
                  <path d="M6 -2 C 20 14, 22 30, 40 40 S 62 52, 74 64" fill="none" stroke="#bcd6dd" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
                  {/* boundary */}
                  <path
                    d="M2 44 C 22 30, 30 46, 48 34 S 74 44, 98 22"
                    fill="none"
                    stroke="#16171a"
                    strokeWidth="0.9"
                    strokeDasharray="3 2.2"
                  />
                  <path d="M2 46.4 C 22 32.4, 30 48.4, 48 36.4 S 74 46.4, 98 24.4" fill="none" stroke="#0e6d61" strokeWidth="0.5" opacity=".45" />
                  {/* roads */}
                  <path d="M12 62 L 30 40 L 56 34 L 78 12" fill="none" stroke="rgba(20,22,26,.16)" strokeWidth="0.7" strokeLinecap="round" />
                  {SITES.map((s) => {
                    const [x, y] = POS[s.id];
                    const on = site?.id === s.id;
                    const r = 1 + s.cams * 0.16;
                    return (
                      <g key={s.id} transform={`translate(${x} ${y})`} className="cursor-pointer" onClick={() => setSite(s)} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
                        <circle r={r * 3.4} fill={on ? "rgba(14,109,97,.13)" : "rgba(14,109,97,.06)"} className="transition-all duration-500" />
                        <circle r={r} fill={on ? "#0e6d61" : "#fff"} stroke={on ? "#0e6d61" : "#8b8f96"} strokeWidth="0.6" />
                        {s.uptime < 96 && <circle r={r + 1.6} fill="none" stroke="#d92d20" strokeWidth="0.5" strokeDasharray="1.4 1.4" />}
                        <text x={0} y={-r - 2.6} textAnchor="middle" className="font-mono" fontSize="2.5" fill={on ? "#0e6d61" : "#4b4e54"}>
                          {s.name.split(" · ")[0]}
                        </text>
                        <text x={0} y={r + 4.2} textAnchor="middle" className="font-mono" fontSize="2" fill="#83878e">
                          {s.online}/{s.cams} online
                        </text>
                      </g>
                    );
                  })}
                </svg>
                {hover && (
                  <div className="slidein pointer-events-none absolute bottom-3 left-3 rounded-[10px] border border-hairline bg-white/92 px-2.5 py-2 shadow-lift backdrop-blur">
                    {(() => {
                      const s = SITES.find((x) => x.id === hover)!;
                      return (
                        <>
                          <div className="text-[12px] font-semibold tracking-tight">{s.name}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-ink3">{s.lat} · {s.long}</div>
                          <div className="mt-1 font-mono text-[10px] text-ink2">{s.gpu} · {s.bandwidth} Mbps uplink</div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </Card>
          </Reveal>

          {/* registry / feeds */}
          {view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cams.map((c, i) => (
                <Reveal key={c.id} delay={i * 40}>
                  <Card className="group overflow-hidden p-0">
                    <MiniFeed cam={c} tracks={world[c.id] ?? []} />
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-medium tracking-tight text-ink">{c.name}</div>
                          <div className="mt-0.5 font-mono text-[9.5px] text-ink3">{c.code} · {c.kind}</div>
                        </div>
                        <span
                          className={cn(
                            "micro shrink-0 rounded-full px-1.5 py-[3px]",
                            c.status === "live" ? "bg-signal-soft text-signal" : c.status === "degraded" ? "bg-[#fdf5e2] text-warn" : "bg-alert-soft text-[#a92318]",
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[9.5px] text-ink3">
                        <span className="tnum">{c.res.split("×")[0]}p</span>
                        <span className="tnum">{c.fps} fps</span>
                        <span className="tnum">{c.bitrate} Mbps</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.models.map((m) => (
                          <span key={m} className="rounded-[5px] bg-ink/[0.045] px-1.5 py-[2px] font-mono text-[9px] text-ink2">
                            {m}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.45] text-ink3">{c.note}</p>
                      <div className="mt-2.5 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <Btn
                          size="sm"
                          variant="primary"
                          icon={<Link2 size={11} />}
                          onClick={() => {
                            setCamId(c.id);
                            setView("live");
                          }}
                        >
                          Open on wall
                        </Btn>
                        <Btn
                          size="sm"
                          icon={<Download size={11} />}
                          onClick={() => downloadCameraVideoClip(c, say)}
                        >
                          Clip (.mp4)
                        </Btn>
                      </div>
                    </div>
                  </Card>
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal>
              <Card hover={false} className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left">
                    <thead>
                      <tr className="border-b border-hairline bg-paper/50">
                        {["Camera", "Site", "Optics", "Stream", "Analytics bound", "Health"].map((h) => (
                          <th key={h} className="px-3.5 py-2"><Label>{h}</Label></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CAMERAS.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setCamId(c.id);
                            setView("live");
                          }}
                          className="cursor-pointer border-b border-hairline/60 transition-colors last:border-0 hover:bg-ink/[0.018]"
                        >
                          <td className="px-3.5 py-2.5">
                            <div className="font-mono text-[11px] text-ink">{c.code}</div>
                            <div className="truncate text-[11.5px] text-ink3">{c.name}</div>
                          </td>
                          <td className="px-3.5 py-2.5 text-[12px] tracking-tight text-ink2">{c.site}</td>
                          <td className="px-3.5 py-2.5 text-[12px] tracking-tight text-ink2">{c.kind}</td>
                          <td className="tnum px-3.5 py-2.5 font-mono text-[10.5px] text-ink3">{c.res} · {c.fps} fps</td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {c.models.map((m) => (
                                <span key={m} className="rounded-[5px] bg-ink/[0.045] px-1.5 py-[2px] font-mono text-[9px] text-ink2">{m}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <Ring pct={c.status === "live" ? 0.97 : c.status === "degraded" ? 0.62 : 0.12} size={26} color={c.status === "live" ? "#0e6d61" : c.status === "degraded" ? "#b7791f" : "#d92d20"} label={<span className="text-[8px]">{c.status === "offline" ? "!" : ""}</span>} />
                              <div className="w-[56px]"><Bar pct={c.bitrate * 10} h={3} color="#16171a" /></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Reveal>
          )}
        </div>

        {/* site rail */}
        <div className="space-y-4">
          <Reveal delay={60}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-3.5 py-2.5"><Label>Sites</Label></div>
              <div className="divide-y divide-hairline">
                {SITES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSite(s)}
                    className={cn("flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors", site?.id === s.id ? "bg-signal-soft/45" : "hover:bg-ink/[0.02]")}
                  >
                    <Ring pct={s.uptime / 100} size={34} color={s.uptime > 98 ? "#0e6d61" : s.uptime > 95 ? "#b7791f" : "#d92d20"} label={<span className="text-[8.5px]">{s.uptime.toFixed(0)}</span>} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium tracking-tight text-ink">{s.name}</span>
                      <span className="mt-0.5 block font-mono text-[9.5px] text-ink3">{s.online}/{s.cams} cams · {s.bandwidth} Mbps</span>
                      <span className="mt-1 block"><Bar pct={s.coverage} h={3} color={s.coverage > 85 ? "#0e6d61" : "#b7791f"} /></span>
                    </span>
                    {s.queue > 0 && (
                      <span className="tnum shrink-0 rounded-full bg-[#fdf5e2] px-1.5 py-[2px] font-mono text-[9px] text-warn">{s.queue} q</span>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          </Reveal>

          {site && (
            <Reveal delay={100}>
              <Card hover={false} className="p-0">
                <div className="grid grid-cols-2 gap-px bg-hairline">
                  <div className="bg-surface"><Stat k="Events 24 h" v={site.events24} sub={site.sector} /></div>
                  <div className="bg-surface"><Stat k="Uptime" v={`${site.uptime}%`} sub="rolling 30 days" color="#0e6d61" tone="signal" /></div>
                </div>
                <div className="space-y-2.5 border-t border-hairline p-3.5">
                  <Label className="mb-0">Edge compute</Label>
                  <div className="flex items-center gap-2 rounded-[9px] bg-ink/[0.035] px-2.5 py-2">
                    <Radio size={12} className="text-signal" />
                    <span className="font-mono text-[11px] text-ink2">{site.gpu}</span>
                    <span className="ml-auto tnum font-mono text-[10px] text-ink3">{site.mode}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] text-ink2">
                    <span>Analytics coverage of visible line</span>
                    <span className="tnum font-mono text-ink">{site.coverage}%</span>
                  </div>
                  <Bar pct={site.coverage} h={5} />
                  <div className="flex items-center justify-between text-[11.5px] text-ink2">
                    <span>Ingest backlog</span>
                    <span className={cn("tnum font-mono", site.queue > 0 ? "text-warn" : "text-signal")}>{site.queue} frames</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <Btn
                      size="sm"
                      icon={<Wrench size={11} />}
                       onClick={() => runDownloadTask(
                         () => downloadMaintenanceTicketPDF(site),
                         say,
                         `IBVAP-WorkOrder-${site.id}.pdf`,
                       )}
                    >
                      Work Order (.PDF)
                    </Btn>
                    <Btn size="sm" onClick={() => say(`Reconnect attempt sent to ${site.online} streams at ${site.name}`)}>
                      Reconnect
                    </Btn>
                  </div>
                </div>
              </Card>
            </Reveal>
          )}
        </div>
      </div>
    </>
  );
}
