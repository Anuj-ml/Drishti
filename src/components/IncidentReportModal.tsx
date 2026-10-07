import { useEffect, useRef, useState } from "react";
import { Archive, Download, FileCode2, FileText, Loader2, Maximize2, Printer, X } from "lucide-react";
import { CAMERAS } from "../lib/data";
import {
  downloadEvidenceBundleFromData,
  downloadIncidentHTMLFromData,
  downloadIncidentReportFromData,
} from "../lib/downloads";
import { makeIncidentReportData, IncidentReportDocument } from "./ReportDocument";
import { renderIncidentHTML } from "../lib/reportRenderer";
import type { Tracked } from "../lib/sim";
import { useApp } from "../state/store";
import { Btn } from "./ui";

export function IncidentReportModal() {
  const { dossierEventId, setDossierEventId, events, world, reportNotes, setReportNote, say } = useApp();
  const [busy, setBusy] = useState<"pdf" | "zip" | null>(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);
  const snapshot = useRef<{ eventId: string; tracks: Tracked[]; capturedAt: number } | null>(null);
  const event = events.find((e) => e.id === dossierEventId) ?? (dossierEventId === "latest" ? events[0] : null);
  const camera = CAMERAS.find((c) => c.code === event?.cam) ?? CAMERAS[0];
  const note = event ? reportNotes[event.id] ?? "" : "";

  // Keep the preview and export on the same frame instead of following the 1 Hz simulation loop.
  if (event && snapshot.current?.eventId !== event.id) {
    snapshot.current = {
      eventId: event.id,
      tracks: (world[camera.id] ?? []).map((t) => ({ ...t, trail: [...t.trail] })),
      capturedAt: Date.now(),
    };
  }

  useEffect(() => {
    setError("");
  }, [event?.id]);

  if (!dossierEventId || !event) return null;
  const tracks = snapshot.current?.tracks ?? [];
  const data = makeIncidentReportData(event, camera, tracks, note, snapshot.current?.capturedAt);

  const downloadPDF = async () => {
    if (busy) return;
    setBusy("pdf");
    setError("");
    try {
      // These are the exact four DOM pages displayed below, not a separately drawn PDF.
      await downloadIncidentReportFromData(data, documentRef.current ?? undefined);
      say(`Downloaded ${event.id}: four pages matching the preview`);
    } catch (err) {
      setError("Could not render the PDF. Please retry or use Print.");
      console.error("Incident report export failed", err);
    } finally {
      setBusy(null);
    }
  };

  const downloadBundle = async () => {
    if (busy) return;
    setBusy("zip");
    setError("");
    try {
      await downloadEvidenceBundleFromData(data);
      say(`Downloaded ${event.id} report, HTML and manifest bundle`);
    } catch (err) {
      setError("Could not create the evidence bundle. Please retry.");
      console.error("Incident bundle export failed", err);
    } finally {
      setBusy(null);
    }
  };

  const print = () => {
    const view = window.open("", "_blank", "width=960,height=820");
    if (!view) {
      setError("Allow popups to open the print view.");
      return;
    }
    view.document.open();
    view.document.write(renderIncidentHTML(data));
    view.document.close();
    view.focus();
    window.setTimeout(() => view.print(), 500);
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-[#111714]/60 p-2 backdrop-blur-[6px] sm:p-5"
      onClick={() => !busy && setDossierEventId(null)}
    >
      <div
        className="rise flex max-h-[95vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[17px] border border-white/25 bg-[#e5e9e3] shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d5dcd3] bg-[#f9faf7] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white"><FileText size={14} /></span>
            <div>
              <div className="font-display text-[14px] font-semibold tracking-tight text-ink">Incident dossier</div>
              <div className="font-mono text-[10px] text-ink3">FOUR-PAGE A4 DOCUMENT / {event.id}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Choose incident"
              value={event.id}
              disabled={!!busy}
              onChange={(e) => setDossierEventId(e.target.value)}
              className="h-8 max-w-[178px] rounded-[8px] border border-hairline bg-white px-2 font-mono text-[10px] text-ink outline-none focus:border-signal"
            >
              {events.slice(0, 25).map((item) => <option key={item.id} value={item.id}>{item.id} / {item.type}</option>)}
            </select>
            <Btn variant="primary" icon={busy === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} onClick={downloadPDF}>
              {busy === "pdf" ? "Rendering 4 pages..." : "Download PDF"}
            </Btn>
            <Btn icon={busy === "zip" ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} onClick={downloadBundle}>
              {busy === "zip" ? "Building ZIP..." : "ZIP Bundle"}
            </Btn>
            <Btn icon={<FileCode2 size={13} />} onClick={() => { downloadIncidentHTMLFromData(data); say(`Downloaded ${event.id} HTML dossier`); }}>HTML</Btn>
            <Btn icon={<Printer size={13} />} onClick={print}>Print</Btn>
            <Btn icon={<Maximize2 size={12} />} onClick={() => setFocus((current) => !current)}>
              {focus ? "Four-up" : "Read size"}
            </Btn>
            <button type="button" aria-label="Close dossier" onClick={() => !busy && setDossierEventId(null)} className="grid h-8 w-8 place-items-center rounded-[8px] text-ink3 transition-colors hover:bg-ink/[0.06] hover:text-ink"><X size={15} /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d5dcd3] bg-[#eef1ec] px-5 py-2.5">
          <div className="flex flex-1 items-center gap-2">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.08em] text-ink3">Officer remark</span>
            <input
              value={note}
              disabled={!!busy}
              onChange={(e) => setReportNote(event.id, e.target.value)}
              maxLength={160}
              placeholder="Optional observation; appears on page 4 and in every export"
              className="h-8 min-w-[190px] flex-1 rounded-[7px] border border-[#d5dcd3] bg-white px-2.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink4 focus:border-signal/40"
            />
          </div>
          <span className="font-mono text-[9px] text-ink3">PREVIEW = DOWNLOADED PDF / 01-04</span>
        </div>

        {error && <div role="alert" className="border-b border-alert/20 bg-alert-soft px-5 py-2 text-[11px] text-alert">{error}</div>}

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-7">
          <div ref={documentRef}>
            <IncidentReportDocument data={data} preview focus={focus} />
          </div>
        </div>
      </div>
    </div>
  );
}