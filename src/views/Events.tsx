import { useMemo, useState } from "react";
import { AlertTriangle, Archive, Check, Copy, Download, Eye, FileText, Flag, ShieldX, Timer, X } from "lucide-react";
import { CAMERAS } from "../lib/data";
import {
  downloadEventLedgerCSV,
  downloadEvidenceBundleZip,
  downloadIncidentReportPDF,
  downloadSectorIncidentSummaryPDF,
  runDownloadTask,
} from "../lib/downloads";
import { makeIncidentReportData } from "../components/ReportDocument";
import { ago, fmtClock } from "../lib/sim";
import { useApp } from "../state/store";
import { cn } from "../utils/cn";
import { CameraFrame } from "../components/Feed";
import { Bar, Btn, Card, Label, Reveal, Ring, Segmented, SevPill, Stat, StatusPill, ViewHead } from "../components/ui";

const SEVS = ["critical", "high", "medium", "low"] as const;

export function Events() {
  const { events, act, openEvent, setOpenEvent, setDossierEventId, reportNotes, setReportNote, world, overlays, metrics, say, clearUnread } = useApp();
  const [sev, setSev] = useState<"all" | (typeof SEVS)[number]>("all");
  const [sta, setSta] = useState<"all" | "new" | "ack" | "dispatched" | "closed">("all");
  const [q, setQ] = useState("");

  const list = useMemo(
    () =>
      events.filter(
        (e) =>
          (sev === "all" || e.sev === sev) &&
          (sta === "all" || e.status === sta || (sta === "closed" && (e.status === "closed" || e.status === "false-positive"))) &&
          (!q.trim() || `${e.id} ${e.type} ${e.cam} ${e.site} ${e.subject ?? ""} ${e.summary}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [events, sev, sta, q],
  );

  const open = events.find((e) => e.id === openEvent) ?? null;
  const openCam = CAMERAS.find((c) => c.code === open?.cam) ?? CAMERAS[0];
  const note = open ? reportNotes[open.id] ?? "" : "";
  const recordReference = open ? makeIncidentReportData(open, openCam, world[openCam.id] ?? [], note).reference : "";
  const stats = useMemo(() => {
    const open0 = events.filter((e) => e.status === "new" || e.status === "ack").length;
    const crit = events.filter((e) => e.sev === "critical" && e.status !== "closed").length;
    const fp = events.filter((e) => e.status === "false-positive").length;
    return { open0, crit, fp: fp / Math.max(1, events.length) };
  }, [events]);

  return (
    <>
      <ViewHead
        kicker="Operations · triage"
        title="Event Ledger"
        desc="Every rule-engine hit lands here with source context, model confidence and operator disposition. Reports in this demo are illustrative; production custody requires authenticated video and a verified media hash."
        right={
          <>
            <Segmented
              value={sta}
              onChange={setSta}
              options={[
                { value: "all", label: "All" },
                { value: "new", label: "Unacked" },
                { value: "ack", label: "Acked" },
                { value: "dispatched", label: "Dispatched" },
                { value: "closed", label: "Closed" },
              ]}
            />
            <Btn
              icon={<Download size={13} />}
              onClick={() => {
                downloadEventLedgerCSV(list);
                say(`Downloaded IBVAP-Event-Ledger.csv (${list.length} records)`);
              }}
            >
              Export CSV
            </Btn>
            <Btn
              icon={<FileText size={13} />}
              onClick={() => runDownloadTask(
                () => downloadSectorIncidentSummaryPDF(list, metrics),
                say,
                `IBVAP-Sector-Incident-Report-${new Date().toISOString().slice(0, 10)}.pdf`,
              )}
            >
              Sector Summary (.PDF)
            </Btn>
            <Btn
              variant="primary"
              icon={<FileText size={13} />}
              onClick={() => {
                const target = open ?? list[0] ?? events[0];
                if (target) setDossierEventId(target.id);
              }}
            >
              Incident Report (BSIR)
            </Btn>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-hairline bg-hairline lg:grid-cols-4">
        {[
          <Stat key="a" k="Open events" v={stats.open0} sub="unacked + acknowledged" tone="alert" />,
          <Stat
            key="b"
            k="Severity 1 backlog"
            v={stats.crit}
            sub="SLA 90 s to acknowledge"
            spark={[2, 3, 1, 4, 6, 3, 5, 2, 4, 3, 6, 4]}
            color="#d92d20"
          />,
          <Stat key="c" k="Median ack time" v="41s" sub="MTTA rolling 24 h" spark={[70, 55, 62, 44, 48, 39, 41]} color="#0e6d61" tone="signal" />,
          <Stat key="d" k="False-positive rate" v={`${(stats.fp * 100).toFixed(1)}%`} sub="feeds threshold tuning back" spark={[9, 7, 8, 6, 5, 6, 4]} />,
        ].map((s, i) => (
          <div key={i} className="bg-surface">
            {s}
          </div>
        ))}
      </div>

      <Reveal>
        <Card hover={false} className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-3.5 py-2.5">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[9px] border border-hairline bg-paper/70 px-2.5 focus-within:border-signal/40 focus-within:bg-white focus-within:ring-2 focus-within:ring-signal/12">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink4">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by plate, subject, camera, track id…"
                className="h-8 w-full bg-transparent text-[12.5px] tracking-tight text-ink outline-none placeholder:text-ink4"
              />
              {q && <button onClick={() => setQ("")} className="text-ink4 hover:text-ink"><X size={12} /></button>}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSev("all")}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11.5px] tracking-tight transition-colors",
                  sev === "all" ? "bg-ink text-white" : "bg-ink/[0.045] text-ink2 hover:bg-ink/[0.08]",
                )}
              >
                All sev
              </button>
              {SEVS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSev(sev === s ? "all" : s)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] tracking-tight capitalize transition-colors",
                    sev === s ? "bg-ink text-white" : "bg-ink/[0.045] text-ink2 hover:bg-ink/[0.08]",
                  )}
                >
                  <span
                    className={cn("h-[5px] w-[5px] rounded-full", s === "critical" ? "bg-alert" : s === "high" ? "bg-person" : s === "medium" ? "bg-warn" : "bg-ink4")}
                  />
                  {s}
                </button>
              ))}
            </div>
            <span className="micro text-ink3">{list.length} shown</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-paper/50">
                  {["Event", "Classification", "Source", "Confidence", "Age", "State", ""].map((h) => (
                    <th key={h} className="px-3.5 py-2">
                      <Label>{h}</Label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => {
                      setOpenEvent(e.id);
                      clearUnread();
                    }}
                    className={cn(
                      "group cursor-pointer border-b border-hairline/70 transition-colors last:border-0",
                      openEvent === e.id ? "bg-signal-soft/50" : "hover:bg-ink/[0.02]",
                    )}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-7 w-[3px] shrink-0 rounded-full",
                            e.sev === "critical" ? "bg-alert" : e.sev === "high" ? "bg-person" : e.sev === "medium" ? "bg-warn" : "bg-ink4",
                            e.status === "new" && e.sev === "critical" && "live-dot",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-[11px] text-ink3">{e.id}</span>
                          <span className="mt-[2px] block text-[12.5px] font-medium tracking-tight text-ink">{e.track}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <SevPill sev={e.sev} />
                        <span className="text-[12.5px] tracking-tight text-ink">{e.type}</span>
                      </div>
                      <p className="mt-1 max-w-[46ch] truncate text-[11.5px] text-ink3">{e.summary}</p>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono text-[11px] text-ink2">{e.cam}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink3">{e.site}{e.zone ? ` · ${e.zone.split(" · ")[0]}` : ""}</div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="tnum font-mono text-[12px] text-ink">{(e.conf * 100).toFixed(0)}%</div>
                      <div className="mt-1 w-[62px]">
                        <Bar pct={e.conf * 100} h={3} color={e.conf > 0.85 ? "#0e6d61" : e.conf > 0.7 ? "#b7791f" : "#aaaeb4"} />
                      </div>
                    </td>
                    <td className="tnum px-3.5 py-2.5 font-mono text-[11px] text-ink2">{ago(e.t)}</td>
                    <td className="px-3.5 py-2.5">
                      <StatusPill status={e.status} />
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        {e.status === "new" && (
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              act(e.id, "ack");
                              say(`${e.id} acknowledged`);
                            }}
                            className="flex items-center gap-1 rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] font-mono text-[9.5px] text-ink2 transition-colors hover:border-signal/35 hover:bg-signal-soft hover:text-signal"
                          >
                            <Check size={9} /> ack
                          </button>
                        )}
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            const c = CAMERAS.find((x) => x.code === e.cam) ?? CAMERAS[0];
                            runDownloadTask(
                              () => downloadIncidentReportPDF(e, c, world[c.id] ?? [], reportNotes[e.id] ?? ""),
                              say,
                              `IBVAP-Incident-Report-${e.id}.pdf`,
                            );
                          }}
                          className="flex items-center gap-1 rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] font-mono text-[9.5px] text-signal transition-colors hover:border-signal/40 hover:bg-signal-soft"
                          title="Download formal BSIR Incident Report PDF"
                        >
                          <Download size={9} /> report.pdf
                        </button>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDossierEventId(e.id);
                          }}
                          className="rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] font-mono text-[9.5px] text-ink2 transition-colors hover:border-ink/25 hover:text-ink"
                          title="Open formatted Incident Report Dossier"
                        >
                          dossier
                        </button>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setOpenEvent(e.id);
                          }}
                          className="rounded-[6px] border border-hairline bg-white px-1.5 py-[3px] font-mono text-[9.5px] text-ink2 transition-colors hover:border-ink/25 hover:text-ink"
                        >
                          evidence
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && (
              <div className="px-4 py-16 text-center">
                <Label>Ledger empty for this filter</Label>
                <p className="mt-2 text-[13px] text-ink2">Loosen the severity or status filter — the rule engine is still writing.</p>
              </div>
            )}
          </div>
        </Card>
      </Reveal>

      {/* sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#101114]/25 backdrop-blur-[2px]" onClick={() => setOpenEvent(null)}>
          <div
            className="slidein h-full w-full max-w-[470px] overflow-y-auto border-l border-hairline bg-canvas shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-canvas/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150">
              <div className="flex items-center gap-2">
                <SevPill sev={open.sev} />
                <span className="font-mono text-[11.5px] text-ink3">{open.id}</span>
              </div>
              <button onClick={() => setOpenEvent(null)} className="grid h-7 w-7 place-items-center rounded-[8px] text-ink3 transition-colors hover:bg-ink/[0.06] hover:text-ink">
                <X size={14} />
              </button>
            </div>

            <div className="p-4">
              <h2 className="text-[24px] leading-tight font-semibold tracking-[-0.035em]">{open.type}</h2>
              <p className="mt-2 text-[13px] leading-[1.6] text-ink2">{open.summary}</p>

              <div className="mt-4 overflow-hidden rounded-[13px] border border-[#24272e]">
                <CameraFrame
                  cam={openCam}
                  tracks={(world[openCam.id] ?? []).map((t) => (t.id === open.track.replace("#", "") ? { ...t, x: open.x ?? t.x, y: open.y ?? t.y } : t))}
                  minConf={0}
                  overlays={{ ...overlays, fence: true, heat: false }}
                  alerting={open.track.replace("#", "")}
                  hud="mini"
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <Label>Evidence frame · {open.evidence}</Label>
                <span className="micro text-ink3">annotated overlay</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-hairline bg-hairline">
                {[
                  ["Source camera", open.cam],
                  ["Sector site", open.site],
                  ["Track id", open.track],
                  ["Subject", open.subject ?? "—"],
                  ["Zone", open.zone ?? "unzoned"],
                  ["Detected at", `${fmtClock(new Date(open.t))} IST`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface px-3 py-2.5">
                    <Label>{k}</Label>
                    <div className="mt-1 text-[12.5px] font-medium tracking-tight text-ink">{v}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[12px] border border-hairline bg-surface p-3.5">
                <Label className="mb-2.5">Model reasoning</Label>
                <div className="space-y-2.5">
                  {[
                    ["Detection confidence", open.conf],
                    ["Track continuity (96 f)", Math.min(0.99, open.conf + 0.04)],
                    ["Crossing geometry", open.type === "Fence crossing" || open.type === "Intrusion" ? 0.93 : 0.41],
                    ["Behaviour score", Math.max(0.22, open.conf - 0.18)],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="tracking-tight text-ink2">{k as string}</span>
                        <span className="tnum font-mono text-[11px] text-ink">{((v as number) * 100).toFixed(0)}%</span>
                      </div>
                      <Bar pct={(v as number) * 100} color={(v as number) > 0.8 ? "#0e6d61" : "#b7791f"} h={4} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[12px] border border-hairline bg-surface p-3.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Timer size={11} /> Disposition timeline
                  </Label>
                  <span className="micro text-signal">immutable log</span>
                </div>
                <ol className="mt-3 space-y-3">
                  {[
                    ["Frame analysed", "rule engine IBV-Fence matched polygon VF", true],
                    ["Event created", `model confidence ${(open.conf * 100).toFixed(0)}% over threshold`, true],
                    ["Clip + still written", `${open.evidence} sealed to evidence vault`, true],
                    ["Operator action", open.status === "new" ? "awaiting acknowledgement" : `status → ${open.status}`, open.status !== "new"],
                  ].map(([t, d, done], i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-[3px] flex flex-col items-center">
                        <span className={cn("grid h-4 w-4 place-items-center rounded-full", done ? "bg-signal text-white" : "border border-dashed border-ink4")}
                          onClick={() => !done && act(open.id, "ack")}
                        >
                          {done ? <Check size={9} /> : null}
                        </span>
                        {i < 3 && <span className="mt-1 h-full w-px flex-1 bg-hairline" />}
                      </span>
                      <span className="-mt-0.5 pb-1">
                        <span className="block text-[12px] font-medium tracking-tight text-ink">{t as string}</span>
                        <span className="block text-[11.5px] text-ink3">{d as string}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-4 rounded-[12px] border border-hairline bg-surface p-3.5">
                <Label className="mb-2">Operator note / included in report (160 chars)</Label>
                <textarea
                  value={note}
                  onChange={(e) => setReportNote(open.id, e.target.value)}
                  maxLength={160}
                  rows={3}
                  placeholder="Observation, action taken, patrolling unit…"
                  className="w-full resize-none rounded-[9px] border border-hairline bg-paper/60 px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none transition-all placeholder:text-ink4 focus:border-signal/35 focus:bg-white focus:ring-2 focus:ring-signal/12"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(recordReference);
                      say("Demo record reference copied");
                    }}
                    className="flex min-w-0 items-center gap-1.5 rounded-[8px] border border-hairline bg-white px-2 py-1.5 font-mono text-[10px] text-ink3 transition-colors hover:text-ink"
                  >
                    <Copy size={10} className="shrink-0" />
                    <span className="truncate">{recordReference}</span>
                  </button>
                  <Btn size="sm" onClick={() => say("Note retained in this report draft")}>
                    Keep note
                  </Btn>
                </div>
              </div>

              {/* Primary Incident Report Download Card */}
              <div className="mt-4 rounded-[12px] border border-signal/30 bg-signal-soft/55 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="micro text-signal">Four-page training dossier</div>
                    <div className="mt-0.5 text-[12.5px] font-semibold tracking-tight text-ink">
                      Border Surveillance Incident Report (BSIR)
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-signal">PDF · ZIP · HTML</span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <Btn
                    variant="primary"
                    icon={<Download size={13} />}
                    onClick={() => runDownloadTask(
                      () => downloadIncidentReportPDF(open, openCam, world[openCam.id] ?? [], note),
                      say,
                      `IBVAP-Incident-Report-${open.id}.pdf`,
                    )}
                  >
                    Download Incident Report (.PDF)
                  </Btn>
                  <Btn
                    icon={<Eye size={13} />}
                    onClick={() => setDossierEventId(open.id)}
                  >
                    Preview Full Dossier
                  </Btn>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Btn icon={<Check size={13} />} onClick={() => { act(open.id, "ack"); say(`${open.id} acknowledged — SLA timer stopped`); }}>
                  Acknowledge
                </Btn>
                <Btn icon={<Flag size={13} />} onClick={() => { act(open.id, "dispatched"); say("QRT tasking sent to BSO duty officer"); }}>
                  Dispatch QRT
                </Btn>
                <Btn icon={<ShieldX size={13} />} onClick={() => { act(open.id, "false-positive"); say("Marked false positive — threshold feedback logged"); }}>
                  False positive
                </Btn>
                <Btn
                  icon={<Archive size={13} />}
                  onClick={() => runDownloadTask(
                    () => downloadEvidenceBundleZip(open, openCam, world[openCam.id] ?? [], note),
                    say,
                    `IBVAP-Evidence-Bundle-${open.id}.zip`,
                  )}
                >
                  Export Bundle (.ZIP)
                </Btn>
              </div>

              {open.sev === "critical" && (
                <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-alert/25 bg-alert-soft px-3.5 py-3">
                  <Ring pct={0.94} size={38} color="#d92d20" label={<AlertTriangle size={13} />} track="rgba(217,45,32,.14)" />
                  <div>
                    <div className="text-[12.5px] font-semibold tracking-tight text-[#a92318]">Immediate action advised</div>
                    <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[#a92318]/80">
                      Cross-border pattern detected within 240 m of the physical fence. Auto-tasked adjacent PTZ cued to track.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
