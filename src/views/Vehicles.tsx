import { Fragment, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CarFront, Download, FileText, Flag, Minus, Search, X } from "lucide-react";
import { CAM_BY_ID, CAMERAS, MODELS, PLATES } from "../lib/data";
import { downloadAnprCSV, downloadAnprDossierPDF, runDownloadTask } from "../lib/downloads";
import { hash, rng } from "../lib/sim";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { CameraFrame } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Segmented, Spark, Stat, ViewHead } from "../components/ui";

export function PlateChip({ v, small }: { v: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center overflow-hidden rounded-[4px] border border-[#c9c6bf] bg-[#f8f7f4] shadow-[0_1px_1.5px_rgba(20,22,26,.12)]",
        small ? "px-1.5 py-[1px]" : "px-2 py-[3px]",
      )}
    >
      <span className={cn("mr-1.5 shrink-0 rounded-[2px] bg-ink px-1 font-mono text-white", small ? "text-[7px]" : "text-[8px]")}>IND</span>
      <span className={cn("font-mono font-medium tracking-[0.04em] text-ink", small ? "text-[10px]" : "text-[12.5px]")}>{v}</span>
    </span>
  );
}

const STAGES = [
  { k: "Plate detect", ms: 4.1, m: `${MODELS[3].name} · INT8` },
  { k: "Crop + rectify", ms: 1.6, m: "GPU warp" },
  { k: "Perspective fix", ms: 2.4, m: "CUDA kernel" },
  { k: "OCR read", ms: 6.8, m: "CRNN-BHARAT" },
  { k: "Registry match", ms: 1.9, m: "edge cache" },
];

export function Vehicles() {
  const { camId, setCamId, world, overlays, minConf, say } = useApp();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "watch" | "inbound">("all");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const cam = CAM_BY_ID[camId];

  const rows = useMemo(
    () =>
      PLATES.filter(
        (p) =>
          (only === "all" || (only === "watch" ? p.watch !== "None" : p.dir === "Inbound")) &&
          (!q.trim() || `${p.plate} ${p.cls} ${p.site} ${p.route}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, only],
  );

  const vehTracks = useMemo(() => (world[camId] ?? []).filter((t) => t.cls === "vehicle"), [world, camId]);
  const total = STAGES.reduce((s, x) => s + x.ms, 0);

  const hourSeries = useMemo(() => {
    const r = rng(hash(camId));
    return Array.from({ length: 16 }, () => 12 + Math.round(r() * 34));
  }, [camId]);

  return (
    <>
      <ViewHead
        kicker="Intelligence · ANPR"
        title="Vehicle detection & plate recognition"
        desc="Classify, read and match from ordinary lane cameras. Shutter, gain and crop geometry are tuned in software, so existing check-post CCTV reaches usable plate accuracy at highway speed."
        right={
          <>
            <Segmented
              value={only}
              onChange={setOnly}
              options={[
                { value: "all", label: "All reads" },
                { value: "watch", label: "Watchlist" },
                { value: "inbound", label: "Inbound" },
              ]}
            />
            <div className="flex h-8 items-center gap-2 rounded-[9px] border border-hairline bg-white px-2.5 focus-within:border-signal/40 focus-within:ring-2 focus-within:ring-signal/12">
              <Search size={12.5} className="text-ink4" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Plate, class, route"
                className="w-[150px] bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:font-sans placeholder:text-ink4"
              />
              {q && (
                <button onClick={() => setQ("")}>
                  <X size={11} className="text-ink4" />
                </button>
              )}
            </div>
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadAnprCSV(rows);
                say(`Downloaded IBVAP-ANPR-Ledger.csv (${rows.length} reads)`);
              }}
            >
              Export ANPR (.CSV)
            </Btn>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Reads this hour", v: "1 284", s: "peak 41/min at 02:10", spark: hourSeries, color: "#16171a" },
          { k: "Mean OCR confidence", v: "0.938", s: "gate 0.72 · 4.1% rejected", spark: [88, 90, 92, 91, 94, 93, 95, 94], color: "#0e6d61" },
          { k: "Watchlist hits", v: "3", s: "2 confirmed · 1 in review", spark: [0, 1, 0, 2, 1, 0, 3, 1], color: "#d92d20" },
          { k: "Unread / avoided", v: "27", s: "plate obscured or lane cut", spark: [18, 22, 15, 26, 31, 24, 27, 21], color: "#b7791f" },
        ].map((s, i) => (
          <Reveal key={s.k} delay={i * 50}>
            <Card hover={false} className="p-0">
              <Stat k={s.k} v={s.v} sub={s.s} spark={s.spark} color={s.color} />
            </Card>
          </Reveal>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-[18px] border border-[#24272e] bg-stage">
              <CameraFrame
                cam={cam}
                tracks={world[camId] ?? []}
                minConf={minConf}
                overlays={{ ...overlays, plates: true, boxes: true, faces: false, heat: false }}
              />
              <div className="on-stage flex flex-wrap items-center gap-3 border-t border-stagehair bg-[#111318]/95 px-3 py-2.5">
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-white/70">
                  <CarFront size={12} className="text-vehicle" /> {vehTracks.length} vehicles tracked
                </span>
                <span className="hidden max-w-[38ch] truncate font-mono text-[10.5px] text-white/40 lg:block">{cam.note}</span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {CAMERAS.filter((c) => c.models.includes("anpr")).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCamId(c.id)}
                      className={cn(
                        "rounded-[7px] border px-2 py-1 font-mono text-[10px] transition-colors",
                        c.id === camId ? "border-white bg-white text-ink" : "border-white/12 bg-white/[0.05] text-white/60 hover:bg-white/10",
                      )}
                    >
                      {c.code}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={70}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>ANPR ledger</Label>
                <span className="micro text-ink3">
                  {rows.length} of {PLATES.length} records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-hairline bg-paper/50">
                      {["Plate read", "Class · colour", "Site", "Vector", "Speed", "Conf", "Status"].map((h) => (
                        <th key={h} className="px-3.5 py-2">
                          <Label>{h}</Label>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const on = openRow === p.plate;
                      return (
                        <Fragment key={p.plate}>
                          <tr
                            onClick={() => setOpenRow(on ? null : p.plate)}
                            className={cn("cursor-pointer border-b border-hairline/70 transition-colors", on ? "bg-signal-soft/45" : "hover:bg-ink/[0.02]")}
                          >
                            <td className="px-3.5 py-2.5">
                              <PlateChip v={p.plate} />
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="text-[12.5px] tracking-tight text-ink">{p.cls}</div>
                              <div className="text-[11px] text-ink3">
                                {p.colour} · {p.occ} occupants
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="font-mono text-[11px] text-ink2">{p.site}</div>
                              <div className="font-mono text-[10px] text-ink4">{p.t}</div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-[11.5px] font-medium",
                                  p.dir === "Inbound" ? "text-signal" : p.dir === "Outbound" ? "text-person" : "text-ink3",
                                )}
                              >
                                {p.dir === "Inbound" ? <ArrowDownLeft size={12} /> : p.dir === "Outbound" ? <ArrowUpRight size={12} /> : <Minus size={12} />}
                                {p.dir.toLowerCase()}
                              </span>
                            </td>
                            <td className="tnum px-3.5 py-2.5 font-mono text-[11.5px] text-ink2">{p.speed} km/h</td>
                            <td className="px-3.5 py-2.5">
                              <div className="tnum font-mono text-[11px] text-ink">{p.conf.toFixed(2)}</div>
                              <div className="mt-1 w-[54px]">
                                <Bar pct={p.conf * 100} h={3} color={p.conf > 0.85 ? "#0e6d61" : "#b7791f"} />
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5">
                              <span
                                className={cn(
                                  "micro rounded-full px-2 py-[5px]",
                                  p.watch === "Lookout"
                                    ? "bg-alert-soft text-[#a92318]"
                                    : p.watch === "Interest"
                                      ? "bg-[#fdf1e4] text-[#9a4a12]"
                                      : "bg-ink/[0.05] text-ink3",
                                )}
                              >
                                {p.watch === "None" ? "no match" : p.watch.toLowerCase()}
                              </span>
                            </td>
                          </tr>
                          {on && (
                            <tr>
                              <td colSpan={7} className="border-b border-hairline bg-paper/60 px-3.5 py-4">
                                <div className="rise grid gap-4 md:grid-cols-[minmax(0,1fr)_210px_170px]">
                                  <div>
                                    <Label className="mb-2">Sighting chain</Label>
                                    <ol className="space-y-2">
                                      {[
                                        [p.t, `${p.site} · ${p.route}`, "primary read"],
                                        ["01:12:44", "BOP-07 / CAM-02 · farm track", "class + colour match"],
                                        ["prev 22:04", "Check Post 04 · gate 2", "registry lookup ok"],
                                      ].map(([t, s, d], i) => (
                                        <li key={i} className="flex flex-wrap items-center gap-2">
                                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", i === 0 ? "bg-signal" : "bg-ink4")} />
                                          <span className="font-mono text-[10.5px] text-ink3">{t}</span>
                                          <span className="text-[12px] tracking-tight text-ink">{s}</span>
                                          <span className="micro text-ink4">{d}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  </div>
                                  <div>
                                    <Label className="mb-2">Read quality</Label>
                                    <div className="space-y-1.5">
                                      {[
                                        ["Character confidence", p.ocr],
                                        ["Plate detection", p.conf],
                                        ["Tilt correction", 0.88],
                                      ].map(([k, v]) => (
                                        <div key={k as string}>
                                          <div className="mb-1 flex justify-between font-mono text-[10px] text-ink3">
                                            <span>{k as string}</span>
                                            <span className="tnum text-ink">{(v as number).toFixed(2)}</span>
                                          </div>
                                          <Bar pct={(v as number) * 100} h={3.5} color="#0e6d61" />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex flex-col justify-between gap-2">
                                    <div className="rounded-[10px] border border-hairline bg-surface p-2.5">
                                      <Label>Daily transits</Label>
                                      <div className="mt-1.5">
                                        <Spark data={hourSeries} w={140} h={30} fill color={p.watch === "None" ? "#16171a" : "#d92d20"} />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Btn size="sm" onClick={() => say(`${p.plate} flagged for inspection at next halt`)} icon={<Flag size={11} />}>
                                        Flag
                                      </Btn>
                                      <Btn
                                        size="sm"
                                        variant="primary"
                                        icon={<FileText size={11} />}
                                         onClick={() => runDownloadTask(
                                           () => downloadAnprDossierPDF(p),
                                           say,
                                           `IBVAP-ANPR-${p.plate.replace(/\s+/g, "-")}.pdf`,
                                         )}
                                      >
                                        Intercept PDF
                                      </Btn>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="px-4 py-14 text-center">
                    <Label>No plate match</Label>
                    <p className="mt-2 text-[12.5px] text-ink2">
                      Nothing in the ledger for “{q}”. Cross-post lookups query the 90-day read archive instead.
                    </p>
                    <div className="mt-3 flex justify-center">
                      <Btn
                        size="sm"
                        icon={<Download size={11} />}
                        onClick={() => {
                          downloadAnprCSV(PLATES);
                          say(`Downloaded 90-day ANPR archive CSV`);
                        }}
                      >
                        Download 90-day archive (.CSV)
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="space-y-4">
          <Reveal delay={100}>
            <Card hover={false} className="p-0">
              <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                <Label>Read pipeline</Label>
                <span className="tnum micro text-signal">{total.toFixed(1)} ms / frame</span>
              </div>
              <div className="space-y-3 p-3.5">
                {STAGES.map((s, i) => (
                  <div key={s.k}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="flex items-baseline gap-1.5 text-[12px] tracking-tight text-ink">
                        <span className="tnum font-mono text-[9.5px] text-ink4">{String(i + 1).padStart(2, "0")}</span>
                        {s.k}
                      </span>
                      <span className="tnum font-mono text-[10.5px] text-ink2">{s.ms.toFixed(1)} ms</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-signal to-[#3fb59f] transition-[width] duration-700"
                          style={{ width: `${(s.ms / total) * 210}%` }}
                        />
                      </div>
                      <span className="micro w-[86px] shrink-0 text-right text-ink4">{s.m}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-hairline px-3.5 py-2.5">
                <p className="text-[11.5px] leading-[1.5] text-ink3">
                  Lane trigger is generated by the detector, not a loop coil — the existing camera at {cam.code.split(" / ")[0]} is enough.
                </p>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={140}>
            <Card hover={false} className="p-0">
              <div className="border-b border-hairline px-3.5 py-2.5">
                <Label>Class mix · rolling 24 h</Label>
              </div>
              <div className="space-y-2.5 p-3.5">
                {[
                  ["Two-wheeler", 24, "#4d8dff"],
                  ["Passenger car", 21, "#0e6d61"],
                  ["Light goods", 18, "#ef6c33"],
                  ["Tractor / farm", 15, "#b7791f"],
                  ["Bus / van", 12, "#21b8a2"],
                  ["Heavy goods", 10, "#16171a"],
                ].map(([k, v, c]) => (
                  <div key={k as string} className="flex items-center gap-3">
                    <span className="w-[92px] shrink-0 text-[11.5px] tracking-tight text-ink2">{k as string}</span>
                    <div className="flex-1">
                      <Bar pct={(v as number) * 3.6} h={7} color={c as string} />
                    </div>
                    <span className="tnum w-8 shrink-0 text-right font-mono text-[10.5px] text-ink3">{v as number}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </>
  );
}
