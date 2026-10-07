import { CAMERAS, SITES, type Camera, type EventLog, type Site } from "./data";
import { hash, type Range, type Tracked } from "./sim";
import type { Metrics, Zone } from "../state/store";
import { makeIncidentReportData, type IncidentReportData } from "../components/ReportDocument";
import { renderGenericPDF, renderIncidentHTML, renderIncidentPDF } from "./reportRenderer";
import {
  anprReportSpec,
  frsReportSpec,
  maintenanceReportSpec,
  patrolReportSpec,
  sectorReportSpec,
  sitrepReportSpec,
} from "./reportSpecs";

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function runDownloadTask(task: () => Promise<void>, say: (message: string) => void, filename: string) {
  say("Rendering four-page report...");
  void task()
    .then(() => say(`Downloaded ${filename}`))
    .catch((error) => {
      console.error(`Export failed: ${filename}`, error);
      say(`Could not export ${filename}. Please retry.`);
    });
}

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
const zipBlob = (bytes: Uint8Array) => new Blob([bytes as unknown as BlobPart], { type: "application/zip" });
const dateStamp = () => new Date().toISOString().slice(0, 10);

export async function generateIncidentReportPDFBytes(event: EventLog, cam: Camera, tracks: Tracked[], note = "") {
  return renderIncidentPDF(makeIncidentReportData(event, cam, tracks, note));
}

export async function downloadIncidentReportFromData(data: IncidentReportData, visibleRoot?: HTMLElement) {
  const bytes = await renderIncidentPDF(data, visibleRoot);
  triggerDownload(pdfBlob(bytes), `IBVAP-Incident-Report-${data.event.id}.pdf`);
}

export async function downloadIncidentReportPDF(event: EventLog, cam: Camera, tracks: Tracked[], note = "") {
  await downloadIncidentReportFromData(makeIncidentReportData(event, cam, tracks, note));
}

export function buildIncidentDossierHTML(event: EventLog, cam: Camera, tracks: Tracked[], note = "") {
  return renderIncidentHTML(makeIncidentReportData(event, cam, tracks, note));
}

export function downloadIncidentHTMLFromData(data: IncidentReportData) {
  triggerDownload(
    new Blob([renderIncidentHTML(data)], { type: "text/html;charset=utf-8" }),
    `IBVAP-Incident-Dossier-${data.event.id}.html`,
  );
}

export function downloadIncidentDossierHTML(event: EventLog, cam: Camera, tracks: Tracked[], note = "") {
  downloadIncidentHTMLFromData(makeIncidentReportData(event, cam, tracks, note));
}

export async function downloadSectorIncidentSummaryPDF(events: EventLog[], metrics: Metrics) {
  const bytes = await renderGenericPDF(sectorReportSpec(events, metrics));
  triggerDownload(pdfBlob(bytes), `IBVAP-Sector-Incident-Report-${dateStamp()}.pdf`);
}

export async function downloadSitrepPDF(
  range: Range,
  series: { labels: string[]; people: number[]; vehicles: number[]; alerts: number[] },
  events: EventLog[],
  metrics: Metrics,
) {
  const bytes = await renderGenericPDF(sitrepReportSpec(range, series, events, metrics));
  triggerDownload(pdfBlob(bytes), `IBVAP-SITREP-${range}-${dateStamp()}.pdf`);
}

type PlateRecord = {
  plate: string;
  cls: string;
  colour: string;
  site: string;
  cam: string;
  dir: string;
  speed: number;
  conf: number;
  watch: string;
  t: string;
  occ: number;
  route: string;
  ocr: number;
  state: string;
};

export async function downloadAnprDossierPDF(record: PlateRecord) {
  const bytes = await renderGenericPDF(anprReportSpec(record));
  triggerDownload(pdfBlob(bytes), `IBVAP-ANPR-${record.plate.replace(/\s+/g, "-")}.pdf`);
}

export async function downloadFrsMatchPDF(
  candidate: { id: string; label: string; score: number; cam: string; t: string; status: string; angle: string; obs: number },
  gallery: string,
  threshold: number,
) {
  const bytes = await renderGenericPDF(frsReportSpec(candidate, gallery, threshold));
  triggerDownload(pdfBlob(bytes), `IBVAP-FRS-Match-${candidate.id}.pdf`);
}

export async function downloadPatrolBriefingPDF(zones: Zone[], cam: Camera) {
  const bytes = await renderGenericPDF(patrolReportSpec(zones, cam));
  triggerDownload(pdfBlob(bytes), `IBVAP-Patrol-Briefing-${cam.id}.pdf`);
}

export async function downloadMaintenanceTicketPDF(site: Site) {
  const bytes = await renderGenericPDF(maintenanceReportSpec(site));
  triggerDownload(pdfBlob(bytes), `IBVAP-WorkOrder-${site.id}.pdf`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZipArchive(files: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    local.push(lh, file.data);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);
    offset += lh.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const footer = new Uint8Array(22);
  const fv = new DataView(footer.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, files.length, true);
  fv.setUint16(10, files.length, true);
  fv.setUint32(12, centralSize, true);
  fv.setUint32(16, offset, true);

  const output = new Uint8Array(offset + centralSize + footer.length);
  let pos = 0;
  for (const part of [...local, ...central, footer]) {
    output.set(part, pos);
    pos += part.length;
  }
  return output;
}

export async function downloadEvidenceBundleFromData(data: IncidentReportData) {
  const { event, camera: cam, tracks, note } = data;
  const pdfBytes = await renderIncidentPDF(data);
  const enc = new TextEncoder();
  const manifest = {
    schema: "ibvap.demo.evidence.v2",
    demo: true,
    disclaimer: "The original CCTV recording and a certified evidence hash are not included in this demonstration.",
    reference: data.reference,
    event_id: event.id,
    event_time_utc: new Date(event.t).toISOString(),
    type: event.type,
    severity: event.sev,
    status: event.status,
    camera: { code: cam.code, name: cam.name, site: cam.site, resolution: cam.res, fps: cam.fps },
    zone: event.zone ?? null,
    subject: event.subject ?? null,
    track: event.track,
    frame_location_pct: { x: event.x ?? 50, y: event.y ?? 50 },
    media_reference: event.evidence,
    operator_note: note || null,
  };
  const trackRows = [
    "track_id,class,confidence,x_pct,y_pct,speed_kmh,heading,plate",
    ...tracks.map((t) => [t.id, t.cls, t.conf.toFixed(3), t.x.toFixed(1), t.y.toFixed(1), t.speed, t.heading, t.plate ?? ""].join(",")),
  ].join("\n");
  const archive = buildZipArchive([
    { name: `Incident-Report-${event.id}.pdf`, data: pdfBytes },
    { name: `Incident-Report-${event.id}.html`, data: enc.encode(renderIncidentHTML(data)) },
    { name: `Evidence-Manifest-${event.id}.json`, data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: `Context-Tracks-${event.id}.csv`, data: enc.encode(trackRows) },
  ]);
  triggerDownload(zipBlob(archive), `IBVAP-Evidence-Bundle-${event.id}.zip`);
}

export async function downloadEvidenceBundleZip(event: EventLog, cam: Camera, tracks: Tracked[], note = "") {
  return downloadEvidenceBundleFromData(makeIncidentReportData(event, cam, tracks, note));
}

export async function downloadAnnotatedSnapshotPNG(cam: Camera, tracks: Tracked[], minConf: number, fence?: [number, number][]) {
  const width = 1600;
  const height = 900;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");

  ctx.fillStyle = "#141a1d";
  ctx.fillRect(0, 0, width, height);
  const stage = document.querySelector(`[data-cam-stage="${cam.id}"]`);
  const video = stage?.querySelector("video");
  const image = stage?.querySelector("img");
  try {
    if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, width, height);
    else if (image && image.complete) ctx.drawImage(image, 0, 0, width, height);
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    // Cross-origin demo media may taint canvas. Render a local annotated schematic instead.
    canvas.width = width;
    ctx.fillStyle = "#141a1d";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#2a3435";
    for (let x = 0; x < width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  }

  if (fence && fence.length > 1) {
    ctx.strokeStyle = "#f2c94c";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    fence.forEach(([x, y], i) => i === 0 ? ctx.moveTo((x / 100) * width, (y / 100) * height) : ctx.lineTo((x / 100) * width, (y / 100) * height));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const shown = tracks.filter((t) => t.conf >= minConf);
  shown.forEach((t) => {
    const x = (t.x / 100) * width;
    const y = (t.y / 100) * height;
    const w = (t.w / 100) * width;
    const h = (t.h / 100) * height;
    const color = t.cls === "person" ? "#ef6c33" : t.cls === "vehicle" ? "#4d8dff" : "#f2c94c";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(51, y - 21), Math.max(130, w), 21);
    ctx.fillStyle = "#111414";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`${t.cls.toUpperCase()} ${t.id} ${Math.round(t.conf * 100)}%`, x + 5, Math.max(66, y - 6));
  });

  ctx.fillStyle = "rgba(13,17,19,.85)";
  ctx.fillRect(0, 0, width, 48);
  ctx.fillRect(0, height - 44, width, 44);
  ctx.fillStyle = "#e4eae4";
  ctx.font = "bold 16px monospace";
  ctx.fillText(`${cam.code} / ${cam.name}`, 22, 30);
  ctx.font = "12px monospace";
  ctx.fillText(`IBVAP DEMO FRAME / ${shown.length} tracks / ${new Date().toISOString()}`, 22, height - 18);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the snapshot image");
  triggerDownload(blob, `IBVAP-Snapshot-${cam.id}-${Date.now()}.png`);
}

export async function downloadCameraVideoClip(cam: Camera, onProgress?: (message: string) => void) {
  const filename = `IBVAP-Clip-${cam.id}-${cam.code.replace(/[^a-zA-Z0-9]/g, "-")}.mp4`;
  try {
    onProgress?.(`Fetching video clip for ${cam.code}...`);
    const response = await fetch(cam.videoUrl, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    triggerDownload(blob, filename);
    onProgress?.(`Downloaded ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch {
    window.open(cam.videoUrl, "_blank", "noopener,noreferrer");
    onProgress?.("Direct download was blocked by the video host. Source opened in a new tab.");
  }
}

const csv = (value: string | number | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function downloadEventLedgerCSV(events: EventLog[]) {
  const headers = ["event_id", "timestamp_utc", "classification", "severity", "status", "camera", "site", "zone", "track_id", "subject", "confidence_pct", "media_reference", "demo_record_reference", "summary"];
  const rows = events.map((e) => [
    e.id, new Date(e.t).toISOString(), e.type, e.sev, e.status, e.cam, e.site, e.zone ?? "", e.track,
    e.subject ?? "", (e.conf * 100).toFixed(1), e.evidence, `DEMO-${e.id}-${hash(e.id).toString(16).toUpperCase()}`, e.summary,
  ].map(csv).join(","));
  triggerDownload(new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" }), `IBVAP-Event-Ledger-${dateStamp()}.csv`);
}

export function downloadAnprCSV(rows: readonly PlateRecord[]) {
  const headers = ["plate", "class", "colour", "occupants", "site", "camera", "direction", "speed_kmh", "detect_conf", "ocr_conf", "watchlist", "time_ist", "route", "state"];
  const lines = rows.map((p) => [p.plate, p.cls, p.colour, p.occ, p.site, p.cam, p.dir, p.speed, p.conf, p.ocr, p.watch, p.t, p.route, p.state].map(csv).join(","));
  triggerDownload(new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }), `IBVAP-ANPR-Ledger-${dateStamp()}.csv`);
}

export function downloadSiteHealthCSV() {
  const headers = ["site_id", "name", "sector", "latitude", "longitude", "cameras_total", "cameras_online", "uptime_pct", "bandwidth_mbps", "edge_gpu", "coverage_pct", "mode", "events_24h"];
  const sites = SITES.map((s) => [s.id, s.name, s.sector, s.lat, s.long, s.cams, s.online, s.uptime, s.bandwidth, s.gpu, s.coverage, s.mode, s.events24].map(csv).join(","));
  const cameras = CAMERAS.map((c) => [c.id, c.code, c.name, c.site, c.sector, c.useCase, c.kind, c.res, c.fps, c.bitrate, c.status, c.videoUrl].map(csv).join(","));
  const content = [headers.join(","), ...sites, "", ["camera_id", "code", "name", "site", "sector", "use_case", "optics", "resolution", "fps", "bitrate_mbps", "status", "video_stream"].join(","), ...cameras].join("\n");
  triggerDownload(new Blob([content], { type: "text/csv;charset=utf-8" }), `IBVAP-Site-Camera-Health-Audit-${dateStamp()}.csv`);
}

export function downloadJSONFile(filename: string, data: unknown) {
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), filename);
}