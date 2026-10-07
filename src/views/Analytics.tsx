import { useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { MODELS, SITES } from "../lib/data";
import { downloadSitrepPDF, runDownloadTask } from "../lib/downloads";
import { CLASS_MIX, CONF_HIST, SECTOR_LOAD, series } from "../lib/sim";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { Bar as MiniBar, Btn, Card, Label, Reveal, Ring, Segmented, Spark, Stat, Switch, ViewHead } from "../components/ui";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Filler, Tooltip, Legend);
ChartJS.defaults.font.family = "'Instrument Sans', sans-serif";
ChartJS.defaults.font.size = 10.5;
ChartJS.defaults.color = "#83878e";

const grid = { color: "rgba(20,22,26,.06)", drawTicks: false };
const tt = {
  backgroundColor: "rgba(19,21,25,.94)",
  padding: 10,
  cornerRadius: 8,
  titleFont: { family: "'Archivo', sans-serif", size: 11.5, weight: 600 as const },
  bodyFont: { family: "'IBM Plex Mono', monospace", size: 10.5 },
  displayColors: true,
  boxWidth: 6,
  boxHeight: 6,
  usePointStyle: true,
};

export function Analytics() {
  const { range, setRange, events, metrics, say } = useApp();
  const s = useMemo(() => series(range), [range]);
  const [behav, setBehav] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BEHAV.map((b) => [b.k, b.p > 78])),
  );

  const alertsByType = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1));
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { k: arr.map((x) => x[0]), v: arr.map((x) => x[1]) };
  }, [events]);

  const lineData = {
    labels: s.labels,
    datasets: [
      {
        label: "People",
        data: s.people,
        borderColor: "#ef6c33",
        backgroundColor: (c: { chart: { ctx: CanvasRenderingContext2D } }) => {
          const g = c.chart.ctx.createLinearGradient(0, 0, 0, 240);
          g.addColorStop(0, "rgba(239,108,51,.28)");
          g.addColorStop(1, "rgba(239,108,51,0)");
          return g;
        },
        fill: true,
        tension: 0.42,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: "#ef6c33",
      },
      {
        label: "Vehicles",
        data: s.vehicles,
        borderColor: "#4d8dff",
        backgroundColor: "rgba(77,141,255,.10)",
        fill: true,
        tension: 0.42,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: "#4d8dff",
      },
      {
        label: "Alerts raised",
        data: s.alerts,
        borderColor: "#0e6d61",
        backgroundColor: "transparent",
        borderWidth: 1.6,
        borderDash: [4, 3],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 3.5,
      },
    ],
  };

  return (
    <>
      <ViewHead
        kicker="Intelligence · trend"
        title="Analytics & model health"
        desc="What the platform saw, how sure it was, and how much of the line is actually covered — the numbers a commander asks for before reallocating a camera or a patrol."
        right={
          <>
            <Segmented
              value={range}
              onChange={(v) => setRange(v)}
              options={[
                { value: "6h", label: "6 h" },
                { value: "24h", label: "24 h" },
                { value: "7d", label: "7 d" },
                { value: "30d", label: "30 d" },
              ]}
            />
            <Btn
              variant="primary"
              icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              onClick={() => runDownloadTask(
                () => downloadSitrepPDF(range, s, events, metrics),
                say,
                `IBVAP-SITREP-${range}-${new Date().toISOString().slice(0, 10)}.pdf`,
              )}
            >
              Download SITREP (.PDF)
            </Btn>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {[
          { k: "Subjects detected", v: s.people.reduce((a, b) => a + b, 0).toLocaleString("en-IN"), sub: "unique tracks after ReID", spark: s.people, color: "#ef6c33" },
          { k: "Vehicle reads", v: s.vehicles.reduce((a, b) => a + b, 0).toLocaleString("en-IN"), sub: "incl. 1 284 plate matches", spark: s.vehicles, color: "#4d8dff" },
          { k: "Alerts raised", v: s.alerts.reduce((a, b) => a + b, 0), sub: `${Math.round((s.alerts.reduce((a, b) => a + b, 0) / Math.max(1, s.people.reduce((a, b) => a + b, 0))) * 100)}% of sightings`, spark: s.alerts, color: "#d92d20" },
          { k: "Mean glass-to-alert", v: `${metrics.lat} ms`, sub: "p95 74 ms on this tier", spark: [38, 34, 30, 33, 28, 27, 26], color: "#0e6d61" },
          { k: "Falses per 1k frames", v: "0.7", sub: "down from 2.1 after tuning", spark: [2.1, 1.8, 1.5, 1.3, 1.1, 0.9, 0.7], color: "#b7791f" },
        ].map((x, i) => (
          <Reveal key={x.k} delay={i * 45}>
            <Card hover={false} className="p-0">
              <Stat k={x.k} v={x.v} sub={x.sub} spark={x.spark} color={x.color} />
            </Card>
          </Reveal>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <Reveal>
            <Card hover={false} className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">Detection throughput</h3>
                  <p className="mt-0.5 text-[11.5px] text-ink3">Unique tracked objects per {range === "6h" ? "30 min" : range === "24h" ? "hour" : range === "7d" ? "day" : "day"}, all sites</p>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px]">
                  {[["#ef6c33", "People"], ["#4d8dff", "Vehicles"], ["#0e6d61", "Alerts"]].map(([c, l]) => (
                    <span key={l as string} className="flex items-center gap-1.5 text-ink3">
                      <span className="h-[6px] w-[6px] rounded-full" style={{ background: c as string }} /> {l as string}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-[268px] p-3">
                <Line
                  data={lineData}
                  options={{
                    maintainAspectRatio: false,
                    responsive: true,
                    interaction: { mode: "index", intersect: false },
                    plugins: { legend: { display: false }, tooltip: tt },
                    scales: {
                      x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 18 } },
                      y: { grid, border: { display: false }, ticks: { padding: 8 }, beginAtZero: true },
                    },
                  }}
                />
              </div>
            </Card>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-3">
            <Reveal delay={60}>
              <Card hover={false} className="flex h-full flex-col p-0">
                <div className="border-b border-hairline px-3.5 py-2.5"><Label>Vehicle class mix</Label></div>
                <div className="relative flex flex-1 items-center justify-center p-3">
                  <Doughnut
                    data={{
                      labels: CLASS_MIX.map((c) => c.k),
                      datasets: [
                        {
                          data: CLASS_MIX.map((c) => c.v),
                          backgroundColor: ["#4d8dff", "#0e6d61", "#ef6c33", "#b7791f", "#21b8a2", "#57606e"],
                          borderWidth: 2,
                          borderColor: "#fff",
                          hoverOffset: 6,
                        },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      cutout: "62%",
                      plugins: { legend: { display: false }, tooltip: tt },
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <div className="tnum font-display text-[19px] font-semibold leading-none tracking-tight">6 742</div>
                      <div className="micro mt-1">classified</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 px-3 pb-3">
                  {CLASS_MIX.slice(0, 6).map((c, i) => (
                    <span key={c.k} className="flex items-center gap-1.5 text-[10.5px] text-ink3">
                      <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: ["#4d8dff", "#0e6d61", "#ef6c33", "#b7791f", "#21b8a2", "#57606e"][i] }} />
                      <span className="truncate">{c.k}</span>
                    </span>
                  ))}
                </div>
              </Card>
            </Reveal>

            <Reveal delay={90}>
              <Card hover={false} className="flex h-full flex-col p-0">
                <div className="border-b border-hairline px-3.5 py-2.5"><Label>Events by type</Label></div>
                <div className="h-[214px] p-3">
                  <Bar
                    data={{
                      labels: alertsByType.k,
                      datasets: [{ data: alertsByType.v, backgroundColor: "#0e6d61", hoverBackgroundColor: "#ef6c33", borderRadius: 4, barThickness: 11 }],
                    }}
                    options={{
                      indexAxis: "y",
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: tt },
                      scales: { x: { grid, border: { display: false }, ticks: { precision: 0 } }, y: { grid: { display: false }, border: { display: false } } },
                    }}
                  />
                </div>
              </Card>
            </Reveal>

            <Reveal delay={120}>
              <Card hover={false} className="flex h-full flex-col p-0">
                <div className="border-b border-hairline px-3.5 py-2.5"><Label>Confidence histogram</Label></div>
                <div className="h-[214px] p-3">
                  <Bar
                    data={{
                      labels: CONF_HIST.map((_, i) => `${(0.3 + i * 0.055).toFixed(2)}`),
                      datasets: [
                        {
                          data: CONF_HIST,
                          backgroundColor: CONF_HIST.map((_, i) => (i > 5 ? "#0e6d61" : "rgba(20,22,26,.13)")),
                          borderRadius: 3,
                          barPercentage: 0.82,
                        },
                      ],
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: tt },
                      scales: { x: { grid: { display: false }, border: { display: false } }, y: { grid, border: { display: false }, ticks: { padding: 6 } } },
                    }}
                  />
                </div>
                <div className="border-t border-hairline px-3.5 py-2.5">
                  <p className="text-[11px] leading-[1.45] text-ink3">Bars right of 0.62 pass the gate; the tail is what threshold tuning reclaims each week.</p>
                </div>
              </Card>
            </Reveal>
          </div>

          <Reveal delay={140}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>Sector load &amp; coverage</Label>
                <span className="micro text-ink3">frames analysed per hour, per sector</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="border-b border-hairline bg-paper/40">
                      {["Sector / site", "Cameras", "Frames/h", "Coverage", "Median latency", "Trend"].map((h) => (
                        <th key={h} className="px-3.5 py-2"><Label>{h}</Label></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SITES.map((site, i) => (
                      <tr key={site.id} className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-ink/[0.018]">
                        <td className="px-3.5 py-2.5">
                          <div className="text-[12.5px] font-medium tracking-tight text-ink">{site.name}</div>
                          <div className="font-mono text-[10px] text-ink3">{site.sector} · {site.mode}</div>
                        </td>
                        <td className="tnum px-3.5 py-2.5 font-mono text-[11.5px] text-ink2">{site.online}/{site.cams}</td>
                        <td className="tnum px-3.5 py-2.5 font-mono text-[11.5px] text-ink">{(SECTOR_LOAD[i % SECTOR_LOAD.length].v * 96).toLocaleString("en-IN")}</td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-[64px]"><MiniBar pct={site.coverage} h={4} color={site.coverage > 85 ? "#0e6d61" : "#b7791f"} /></div>
                            <span className="tnum font-mono text-[10px] text-ink3">{site.coverage}%</span>
                          </div>
                        </td>
                        <td className="tnum px-3.5 py-2.5 font-mono text-[11.5px] text-ink2">{18 + i * 4} ms</td>
                        <td className="px-3.5 py-2.5">
                          <Spark data={series(i % 2 ? "7d" : "24h").people} w={70} h={22} color={site.coverage > 85 ? "#0e6d61" : "#b7791f"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="space-y-4">
          <Reveal delay={60}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-3.5 py-2.5"><Label>Model pack accuracy</Label></div>
              <div className="divide-y divide-hairline">
                {MODELS.map((m) => (
                  <div key={m.id} className="px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium tracking-tight text-ink">{m.name}</span>
                      <span className="tnum font-mono text-[10px] text-signal">{(m.acc * 100).toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5"><MiniBar pct={m.acc * 100} h={4} /></div>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-ink3">
                      <span className="truncate">{m.task}</span>
                      <span className="tnum shrink-0">{m.fps} fps</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-hairline px-3.5 py-2.5">
                <span className="text-[11.5px] text-ink2">Drift vs. baseline · 30 d</span>
                <span className="tnum font-mono text-[10.5px] text-signal">−0.4 %</span>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={90}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-3.5 py-2.5"><Label>Coverage gaps</Label></div>
              <div className="space-y-3 p-3.5">
                {[
                  ["Dark stretch, BOP-11 north", "camera offline 6 h", 0.31],
                  ["Nullah culvert fog", "thermal fallback only", 0.58],
                  ["Market fringe glare", "HDR re-tune scheduled", 0.74],
                  ["Fence km 12–14", "no optics in budget", 0.12],
                ].map(([k, s2, p]) => (
                  <div key={k as string} className="flex items-center gap-3">
                    <Ring pct={p as number} size={34} color={(p as number) > 0.6 ? "#0e6d61" : (p as number) > 0.4 ? "#b7791f" : "#d92d20"} label={<span className="text-[9px]">{Math.round((p as number) * 100)}</span>} />
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium tracking-tight text-ink">{k as string}</div>
                      <div className="truncate text-[11px] text-ink3">{s2 as string}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={120}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>Suspicious activity classifiers</Label>
                <span className="micro text-ink3">IBV-Behav</span>
              </div>
              <div className="divide-y divide-hairline">
                {BEHAV.map((b) => (
                  <div key={b.k} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", behav[b.k] ? "bg-signal" : "bg-ink4")} />
                        <span className="truncate text-[12px] font-medium tracking-tight text-ink">{b.k}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="tnum font-mono text-[9.5px] text-ink3">{b.n} triggers · 24 h</span>
                        <div className="w-[52px]"><MiniBar pct={b.p} h={3} color={b.p > 85 ? "#0e6d61" : "#b7791f"} /></div>
                        <span className="tnum font-mono text-[9.5px] text-ink3">{b.p}% prec</span>
                      </div>
                    </div>
                    <Switch
                      on={!!behav[b.k]}
                      onChange={() => {
                        const next = !behav[b.k];
                        setBehav((prev) => ({ ...prev, [b.k]: next }));
                        say(`${b.k} classifier ${next ? "armed" : "stood down"} on 4 edge nodes`);
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="border-t border-hairline px-3.5 py-2.5">
                <p className="text-[11px] leading-[1.5] text-ink3">
                  Behaviour runs on tracklets, not pixels — turning a classifier off frees edge headroom for the detector without touching the camera.
                </p>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </>
  );
}

const BEHAV = [
  { k: "Running / sprint", n: 14, p: 88 },
  { k: "Loitering near fence", n: 46, p: 91 },
  { k: "Unattended object", n: 9, p: 76 },
  { k: "Fall / downed person", n: 3, p: 71 },
  { k: "Group convergence", n: 21, p: 84 },
  { k: "Headlight off at gate", n: 7, p: 79 },
];
