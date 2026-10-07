import type { ReactNode } from "react";
import { SITES, type Camera, type EventLog, type Site } from "../lib/data";
import { hash, type Tracked } from "../lib/sim";

export const REPORT_WIDTH = 794;
export const REPORT_HEIGHT = 1123;

export type ReportMetric = { value: string; label: string; detail?: string };
export type ReportFactor = { label: string; value: number; detail?: string };
export type ReportRow = { label: string; value: string; detail?: string };

export type GenericReportSpec = {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  issued: string;
  coverMeta: ReportRow[];
  overviewTitle: string;
  overviewIntro: string;
  overviewBody: string;
  metrics: ReportMetric[];
  context: ReportRow[];
  findingsTitle: string;
  findingsIntro: string;
  factors: ReportFactor[];
  details: ReportRow[];
  actionsTitle: string;
  actions: ReportRow[];
  caveat: string;
  reference: string;
};

export type IncidentReportData = {
  event: EventLog;
  camera: Camera;
  site: Site;
  tracks: Tracked[];
  note: string;
  reference: string;
  ist: string;
  utc: string;
  issued: string;
  snapshotTime: string;
  location: string;
  analysis: {
    headline: string;
    subtitle: string;
    why: string;
    alternative: string;
    action: string;
    factors: ReportFactor[];
    model: string;
    classification: string;
  };
};

function indianTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(timestamp))
    .replace(",", "");
}

function findLocation(event: EventLog, site: Site) {
  const match = event.summary.match(/(\d{1,2}\.\d+)\s*N,?\s*(\d{1,3}\.\d+)\s*E/i);
  return match ? `${match[1]} N / ${match[2]} E (projected drop)` : `${site.lat} / ${site.long} (site reference)`;
}

function analysisFor(event: EventLog, camera: Camera): IncidentReportData["analysis"] {
  const conf = Math.round(event.conf * 100);
  if (event.type === "Payload drop" || event.type === "Drone / UAS") {
    return {
      headline: "Airspace track. Ground consequence.",
      subtitle: "A separate air-object classifier produced this alert; it did not use the ground-person model.",
      why: "A small airborne track held position, changed direction and separated from a second descending object. Size consistency, hover dwell and trajectory shape raised the UAS score.",
      alternative: "Bird and windblown debris remain visual confounders. The projected drop position is an estimate and must be verified on the ground.",
      action: "Isolate the projected drop ellipse, cue adjacent cameras and dispatch QRT. Do not approach an unknown payload without the appropriate safety team.",
      factors: [
        { label: "UAS trajectory shape", value: conf, detail: "Hover + turning geometry" },
        { label: "Apparent size consistency", value: 88, detail: "Small aerial silhouette" },
        { label: "Hover persistence", value: 91, detail: "11 s observation window" },
        { label: "Payload separation", value: event.type === "Payload drop" ? 92 : 54, detail: "Descending secondary track" },
      ],
      model: "IBV-Sky / aerial track classifier",
      classification: "Aerial object / payload projection",
    };
  }
  if (event.type === "Ground disturbance") {
    return {
      headline: "Terrain change before a breach.",
      subtitle: "A long-timescale scene comparison flagged ground alteration near the fence.",
      why: "The normalized baseline shows new exposed soil, spoil accumulation and vegetation clearance inside the fence-proximity mask.",
      alternative: "Agricultural activity, drainage work and seasonal vegetation shifts can resemble excavation. Correlate with patrol logs before escalation.",
      action: "Preserve baseline and current frames, request a daylight ground check, and avoid disturbing the area until the scene is photographed.",
      factors: [
        { label: "Terrain change", value: conf, detail: "14-day normalized baseline" },
        { label: "Spoil morphology", value: 86, detail: "Localized soil mass" },
        { label: "Vegetation removal", value: 79, detail: "Fence buffer comparison" },
        { label: "Temporal persistence", value: 92, detail: "Repeated observation" },
      ],
      model: "IBV-Terrain / temporal delta",
      classification: "Tunnel-dig precursor / verification required",
    };
  }
  if (event.type === "Camera tamper") {
    return {
      headline: "The camera became the target.",
      subtitle: "Scene integrity failed while the stream transport remained available.",
      why: "Frame luminance and edge density fell abruptly without a matching RTSP heartbeat failure. Optical cover, defocus or physical re-aim is more likely than a power outage.",
      alternative: "Weather, a close vehicle or a lighting failure can also darken the scene. Check adjacent feeds and compare the commissioned optical axis.",
      action: "Switch to the adjacent camera, alert the BOP duty officer and send a two-person inspection. Preserve pre- and post-change frames.",
      factors: [
        { label: "Scene-integrity anomaly", value: conf, detail: "Independent of object detection" },
        { label: "Luminance collapse", value: 91, detail: "240 ms scene change" },
        { label: "Edge-density loss", value: 88, detail: "Optical obstruction cue" },
        { label: "RTSP continuity", value: 98, detail: "Transport still healthy" },
      ],
      model: "IBV-Guard / scene integrity",
      classification: "Camera self-tamper / optical verification",
    };
  }
  return {
    headline: "A track crossed the decision gate.",
    subtitle: `The ${camera.useCase.toLowerCase()} pipeline produced an operator-reviewable event.`,
    why: `${event.summary} The track remained available for cross-camera review after the alert was raised.`,
    alternative: "Shadows, animals and authorized patrol movement can create visually similar tracks. Confirm against the adjacent feed and duty roster.",
    action: event.sev === "critical"
      ? "Acknowledge, cue the adjacent PTZ and dispatch the nearest QRT to a safe intercept point. Verify the track before classifying intent."
      : "Review the supporting frames, cross-check authorized movement and assign a disposition in the event ledger.",
    factors: [
      { label: "Primary detection", value: conf, detail: "Object confidence" },
      { label: "Track continuity", value: Math.min(99, conf + 4), detail: "Temporal association" },
      { label: "Spatial rule match", value: event.type.includes("Fence") || event.type === "Intrusion" ? 94 : 78, detail: "Zone or direction gate" },
      { label: "Behavior context", value: Math.max(58, conf - 8), detail: "Motion + dwell window" },
    ],
    model: camera.models.join(" / "),
    classification: `${event.type} / operator verification`,
  };
}

export function makeIncidentReportData(event: EventLog, camera: Camera, tracks: Tracked[], note = "", generatedAt = Date.now()): IncidentReportData {
  const site = SITES.find((s) => s.name.startsWith(event.site)) ?? SITES[0];
  const ref = hash(`${event.id}:${event.t}:${camera.code}`).toString(16).toUpperCase().padStart(8, "0");
  return {
    event,
    camera,
    site,
    tracks: tracks.map((t) => ({ ...t, trail: [...t.trail] })),
    note,
    reference: `DEMO-${event.id}-${ref}`,
    ist: `${indianTime(event.t)} IST`,
    utc: `${new Date(event.t).toISOString().replace("T", " ").slice(0, 19)} UTC`,
    issued: `${indianTime(generatedAt)} IST`,
    snapshotTime: `${indianTime(generatedAt)} IST`,
    location: findLocation(event, site),
    analysis: analysisFor(event, camera),
  };
}

export const reportStyles = `
.ir-report{font-family:Arial,Helvetica,sans-serif;color:#1a1c1b}
.ir-report *{box-sizing:border-box}
.ir-print-pages{display:flex;flex-direction:column;gap:24px;width:794px}
.ir-page{position:relative;width:794px;height:1123px;overflow:hidden;background:#f8f9f6;padding:58px 56px 52px;color:#1a1c1b;flex:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45}
.ir-page-dark{background:#181a1a;color:#f8f9f6}
.ir-page-soft{background:#eff1ed}
.ir-page::selection{background:#cadbd4}
.ir-mono{font-family:Consolas,"Courier New",monospace}
.ir-top{display:flex;justify-content:space-between;align-items:center;gap:24px;height:35px}
.ir-brand{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;letter-spacing:-.02em}
.ir-brand-symbol{width:19px;height:19px;border:2px solid currentColor;border-radius:50%;position:relative;display:inline-block}
.ir-brand-symbol:after{content:"";width:5px;height:5px;border-radius:50%;background:#0d695b;position:absolute;top:5px;left:5px}
.ir-issue{font:10px Consolas,"Courier New",monospace;letter-spacing:.08em;color:#8b908c;text-align:right}
.ir-page-dark .ir-issue{color:#949a97}
.ir-rule{height:1px;background:#d6dad5;margin:16px 0 0}
.ir-page-dark .ir-rule{background:#3b3f3d}
.ir-chip{display:inline-flex;align-items:center;gap:8px;border-radius:100px;padding:7px 11px;border:1px solid #d4d9d4;background:#fff;font:10px Consolas,"Courier New",monospace;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap}
.ir-page-dark .ir-chip{border-color:#424745;background:#262a28;color:#dce1dc}
.ir-dot{width:6px;height:6px;display:inline-block;border-radius:50%;background:#0d695b;flex:none}
.ir-dot-red{background:#de5848}
.ir-eyebrow{font:10px Consolas,"Courier New",monospace;text-transform:uppercase;letter-spacing:.13em;color:#69736d}
.ir-page-dark .ir-eyebrow{color:#a7aeaa}
.ir-h2{font-size:57px;font-weight:400;line-height:.98;letter-spacing:-.065em;margin:15px 0 0;max-width:625px;white-space:pre-line}
.ir-muted{color:#a8aea8}
.ir-page-dark .ir-muted{color:#7f8983}
.ir-lead{font-size:14px;line-height:1.5;color:#68716b;margin:14px 0 0;max-width:570px}
.ir-page-dark .ir-lead{color:#b4bab5}
.ir-label{font:10px Consolas,"Courier New",monospace;letter-spacing:.1em;text-transform:uppercase;color:#7b857e;margin:0 0 8px}
.ir-page-dark .ir-label{color:#9ba49e}
.ir-value{font-size:14px;font-weight:600;letter-spacing:-.025em;line-height:1.35}
.ir-body{font-size:14px;line-height:1.6;color:#48524c;margin:0}
.ir-page-dark .ir-body{color:#bdc5be}
.ir-foot{position:absolute;bottom:32px;left:56px;right:56px;border-top:1px solid #d9dcd7;padding-top:12px;display:flex;align-items:center;justify-content:space-between;color:#858e86;font:10px Consolas,"Courier New",monospace;letter-spacing:.03em}
.ir-page-dark .ir-foot{border-color:#383d3a;color:#87918a}
.ir-foot strong{color:#303633;font-weight:700}
.ir-page-dark .ir-foot strong{color:#d8dfd9}
.ir-cover-index{font-size:158px;font-weight:300;line-height:1;letter-spacing:-.1em;position:absolute;right:66px;top:100px;color:#e0e5df}
.ir-cover-mark{position:absolute;left:58px;top:127px;width:66px;height:66px;border-radius:50%;border:1px solid #58605a;display:grid;place-items:center;color:#d5ddd5;font-size:29px;font-weight:200}
.ir-cover-content{position:absolute;left:56px;right:56px;bottom:274px}
.ir-cover-title{font-size:78px;line-height:.92;letter-spacing:-.07em;font-weight:400;margin:24px 0 0;max-width:660px;white-space:pre-line}
.ir-cover-desc{color:#b1b9b3;font-size:15px;line-height:1.55;max-width:470px;margin:26px 0 0}
.ir-cover-meta{position:absolute;left:56px;right:56px;bottom:80px;border-top:1px solid #505852;padding-top:24px;display:grid;grid-template-columns:1fr 1.1fr 1fr 1fr;gap:20px}
.ir-cover-meta .ir-label{color:#8c978e}
.ir-cover-meta .ir-value{font-size:12px;color:#eef3ee;word-break:break-word}
.ir-page-title{margin-top:40px}
.ir-page-title .ir-chip{margin-bottom:18px}
.ir-scene{height:176px;background:#202521;border-radius:15px;position:relative;overflow:hidden;margin-top:26px;color:#f2f4f0}
.ir-scene svg{position:absolute;inset:0;width:100%;height:100%}
.ir-scene-top{position:absolute;top:16px;left:20px;right:20px;display:flex;justify-content:space-between;font:10px Consolas,"Courier New",monospace;color:#d4ddd4;letter-spacing:.05em}
.ir-scene-bottom{position:absolute;bottom:16px;left:20px;right:20px;display:flex;justify-content:space-between;gap:12px;font:10px Consolas,"Courier New",monospace;color:#bfc9bf}
.ir-reading{display:grid;grid-template-columns:1.12fr .88fr;gap:30px;margin-top:20px}
.ir-reading .ir-body{font-size:14px}
.ir-fact-list{border-top:1px solid #d4d9d3}
.ir-fact{border-bottom:1px solid #d4d9d3;padding:8px 0;display:flex;justify-content:space-between;gap:10px;font-size:11px;line-height:1.3}
.ir-fact span:first-child{color:#68736a}
.ir-fact span:last-child{text-align:right;font-weight:600;max-width:63%;word-break:break-word}
.ir-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:22px}
.ir-metric{height:85px;background:#e2e7e1;border-radius:12px;padding:12px}
.ir-metric strong{display:block;font-size:27px;line-height:1.1;font-weight:400;letter-spacing:-.055em}
.ir-metric span{display:block;font:9px Consolas,"Courier New",monospace;text-transform:uppercase;letter-spacing:.08em;color:#677169;margin-top:8px}
.ir-command{margin-top:18px;background:#202522;border-radius:12px;padding:15px 18px;display:flex;align-items:start;gap:20px;color:#eef4ed}
.ir-command .ir-label{color:#8cae9a;width:135px;flex:none;margin-top:2px}
.ir-command p{margin:0;font-size:12px;line-height:1.55}
.ir-analysis-grid{display:grid;grid-template-columns:1fr 260px;gap:16px;margin-top:35px}
.ir-panel{border:1px solid #d5dad3;background:#fff;border-radius:13px;padding:21px}
.ir-panel-dark{border-color:#303a33;background:#263029;color:#eff4ee}
.ir-factor{margin-top:19px}
.ir-factor:first-of-type{margin-top:8px}
.ir-factor-top{display:flex;justify-content:space-between;gap:12px;font-size:12px;line-height:1.3}
.ir-factor-top strong{font:11px Consolas,"Courier New",monospace}
.ir-factor-track{height:5px;border-radius:8px;background:#e8ece7;margin-top:8px;overflow:hidden}
.ir-factor-track div{height:100%;background:#0d695b;border-radius:8px}
.ir-factor small{display:block;font-size:10px;color:#869087;margin-top:5px}
.ir-analysis-index{font-size:35px;font-weight:400;line-height:1;letter-spacing:-.045em;margin:15px 0 8px}
.ir-analysis-note{color:#c0cbc1;font-size:12px;line-height:1.55;margin:0}
.ir-analysis-mini{margin-top:24px;border-top:1px solid #4b564b;padding-top:15px;font:11px Consolas,"Courier New",monospace;color:#a8bea9}
.ir-evidence-table{margin-top:30px}
.ir-evidence-table table{width:100%;border-collapse:collapse;text-align:left;font-size:11px;table-layout:fixed}
.ir-evidence-table thead{background:#202522;color:#e6eee6}
.ir-evidence-table th{font:9px Consolas,"Courier New",monospace;text-transform:uppercase;letter-spacing:.05em;padding:11px 10px}
.ir-evidence-table td{padding:11px 10px;border-bottom:1px solid #d5dad3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ir-evidence-table tbody tr:nth-child(even){background:#e8ece7}
.ir-evidence-table td:first-child{font-family:Consolas,"Courier New",monospace;font-weight:700}
.ir-caveat{border-top:1px solid #cdd5cc;margin-top:25px;padding-top:18px;display:grid;grid-template-columns:138px 1fr;gap:18px}
.ir-caveat p{font-size:11px;line-height:1.55;color:#68716a;margin:0}
.ir-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:45px;position:relative}
.ir-flow:before{content:"";position:absolute;left:8%;right:8%;top:5px;height:1px;background:#65736a}
.ir-step{position:relative;padding-top:35px}
.ir-step-dot{position:absolute;top:0;left:0;width:11px;height:11px;border-radius:50%;background:#c8d2c8;border:3px solid #181a1a;outline:1px solid #b8c5b9}
.ir-step:first-child .ir-step-dot{background:#4ba786;outline-color:#4ba786}
.ir-step-id{font:10px Consolas,"Courier New",monospace;color:#9eb0a0}
.ir-step-title{font-size:17px;margin-top:10px;letter-spacing:-.03em}
.ir-step-desc{color:#a8b5a8;font-size:11px;line-height:1.5;margin-top:8px;max-width:140px}
.ir-response-columns{display:grid;grid-template-columns:1.2fr .8fr;gap:28px;margin-top:32px}
.ir-response-list{border-top:1px solid #526057}
.ir-response-item{border-bottom:1px solid #526057;padding:10px 0;display:flex;align-items:baseline;gap:14px}
.ir-response-item b{font:10px Consolas,"Courier New",monospace;color:#74b797}
.ir-response-item span{font-size:12px;line-height:1.45;color:#e1e9e1}
.ir-record-box{border:1px solid #58645b;border-radius:13px;background:#242c26;padding:20px}
.ir-record-box strong{display:block;font:12px Consolas,"Courier New",monospace;color:#e1eee1;word-break:break-all;margin:14px 0}
.ir-record-box p{font-size:11px;line-height:1.55;color:#a8b5a8;margin:0}
.ir-signoff{margin-top:27px;border-top:1px solid #526057;padding-top:15px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.ir-signoff .ir-value{font-size:12px;color:#e7eee6;margin-top:7px}
.ir-signoff .ir-note{font-size:10px;color:#a1aea2;margin-top:7px;line-height:1.4}
.ir-demo-note{position:absolute;left:56px;right:56px;bottom:81px;color:#8c9b8d;font-size:10px;line-height:1.45;border-top:1px solid #39463c;padding-top:12px}
.ir-generic-rows{margin-top:32px;border-top:1px solid #d1d9d0}
.ir-generic-row{display:grid;grid-template-columns:170px 1fr;border-bottom:1px solid #d1d9d0;padding:10px 0;gap:16px;font-size:12px}
.ir-generic-row span{color:#677469}
.ir-generic-row strong{font-weight:600;word-break:break-word}
.ir-generic-row small{display:block;color:#8b958d;font-size:10px;margin-top:4px}
.ir-generic-narrative{font-size:17px;line-height:1.65;color:#414c43;max-width:560px;margin:37px 0 0}
.ir-report-preview{display:grid;grid-template-columns:repeat(2,max-content);gap:22px;justify-content:center;width:100%;--ir-scale:.56}
.ir-report-preview.ir-report-focus{grid-template-columns:max-content;--ir-scale:.90}
.ir-page-holder{width:calc(794px * var(--ir-scale));height:calc(1123px * var(--ir-scale));position:relative;box-shadow:0 18px 42px rgba(20,30,21,.14)}
.ir-page-scale{transform:scale(var(--ir-scale));transform-origin:top left;width:794px;height:1123px}
@media(max-width:1040px){.ir-report-preview{--ir-scale:.48}}
@media(max-width:760px){.ir-report-preview{grid-template-columns:max-content;--ir-scale:.65}}
@media(max-width:570px){.ir-report-preview{--ir-scale:.46}}
@media(max-width:1040px){.ir-report-preview.ir-report-focus{--ir-scale:.75}}
@media(max-width:760px){.ir-report-preview.ir-report-focus{--ir-scale:.65}}
@media(max-width:570px){.ir-report-preview.ir-report-focus{--ir-scale:.46}}
@media(max-width:420px){.ir-report-preview,.ir-report-preview.ir-report-focus{--ir-scale:.38}}
@media print{.ir-report{width:210mm}.ir-print-pages{gap:0}.ir-page{width:210mm;height:297mm;page-break-after:always;border-radius:0;box-shadow:none}.ir-page:last-child{page-break-after:auto}}
`;

function ReportFooter({ page, dark = false, reference }: { page: number; dark?: boolean; reference: string }) {
  return (
    <div className="ir-foot">
      <span><strong>IBVAP</strong> / INTELLIGENT BORDER VIDEO ANALYTICS</span>
      <span>{dark ? "TRAINING ENVIRONMENT" : reference}</span>
      <span>{String(page).padStart(2, "0")} / 04</span>
    </div>
  );
}

function ReportTop({ id, issued }: { id: string; issued: string }) {
  return (
    <>
      <div className="ir-top">
        <div className="ir-brand"><span className="ir-brand-symbol" />IBVAP <span style={{ fontWeight: 400, opacity: .46 }}>/ FIELD INTELLIGENCE</span></div>
        <div className="ir-issue">{id} / {issued}</div>
      </div>
      <div className="ir-rule" />
    </>
  );
}

function ReportPage({ children, className = "", page, reference }: { children: ReactNode; className?: string; page: number; reference: string }) {
  const dark = className.includes("dark");
  return (
    <section data-report-page={page} className={`ir-page ${className}`}>
      {children}
      <ReportFooter page={page} dark={dark} reference={reference} />
    </section>
  );
}

function ReportPages({ children, preview = false, focus = false }: { children: ReactNode[]; preview?: boolean; focus?: boolean }) {
  return (
    <div className={`ir-report ${preview ? `ir-report-preview${focus ? " ir-report-focus" : ""}` : "ir-print-pages"}`}>
      <style>{reportStyles}</style>
      {preview ? children.map((child, i) => <div className="ir-page-holder" key={i}><div className="ir-page-scale">{child}</div></div>) : children}
    </div>
  );
}

function SceneDiagram({ data }: { data: IncidentReportData }) {
  const { event } = data;
  const x = Math.max(20, Math.min(84, event.x ?? 58));
  const y = Math.max(23, Math.min(75, event.y ?? 52));
  return (
    <div className="ir-scene">
      <svg viewBox="0 0 680 215" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="ir-grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#445147" strokeWidth=".65" /></pattern>
        </defs>
        <rect width="680" height="215" fill="#202721" />
        <rect width="680" height="215" fill="url(#ir-grid)" opacity=".72" />
        <path d="M0 173 C112 137 178 186 286 157 S467 167 680 114" fill="none" stroke="#5a6b5d" strokeWidth="2" />
        <path d="M0 154 C112 118 178 168 286 139 S467 149 680 97" fill="none" stroke="#d7ba73" strokeDasharray="8 6" strokeWidth="1.7" />
        <path d="M0 70 C125 100 157 71 300 92 S529 91 680 60" fill="none" stroke="#35443a" strokeWidth="1" />
        <circle cx={(x / 100) * 680} cy={(y / 100) * 215} r="19" fill="#d55342" opacity=".17" />
        <circle cx={(x / 100) * 680} cy={(y / 100) * 215} r="7" fill="#e47361" />
        <circle cx={(x / 100) * 680} cy={(y / 100) * 215} r="26" fill="none" stroke="#e47361" strokeDasharray="3 4" />
        <path d={`M${(x / 100) * 680 - 74} ${(y / 100) * 215 + 33}L${(x / 100) * 680 - 10} ${(y / 100) * 215 + 3}`} fill="none" stroke="#e47361" strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
      <div className="ir-scene-top"><span>SCENE RECONSTRUCTION / {event.zone ?? "UNZONED"}</span><span>{data.camera.code}</span></div>
      <div className="ir-scene-bottom"><span>{event.track} / {data.analysis.classification.toUpperCase()}</span><span>FRAME X {x}% / Y {y}%</span></div>
    </div>
  );
}

export function IncidentReportDocument({ data, preview = false, focus = false }: { data: IncidentReportData; preview?: boolean; focus?: boolean }) {
  const { event, camera, site, tracks, note, analysis } = data;
  const pages = [
    <ReportPage key="cover" page={1} reference={data.reference} className="ir-page-dark">
      <ReportTop id={event.id} issued={data.issued} />
      <div className="ir-cover-mark">+</div>
      <div className="ir-cover-index">01</div>
      <div className="ir-cover-content">
        <div className="ir-chip"><span className="ir-dot ir-dot-red" /> BORDER SURVEILLANCE / INCIDENT REPORT</div>
        <h1 className="ir-cover-title">{event.type}.<br />{event.site}.</h1>
        <p className="ir-cover-desc">An operational record of the signal, its context and the next response. Built for a clear decision, not a wall of telemetry.</p>
      </div>
      <div className="ir-cover-meta">
        {[
          ["Incident ID", event.id],
          ["Detected / IST", data.ist],
          ["Priority", `${event.sev.toUpperCase()} / ${event.status.toUpperCase()}`],
          ["Source", camera.code],
        ].map(([k, v]) => <div key={k}><div className="ir-label">{k}</div><div className="ir-value ir-mono">{v}</div></div>)}
      </div>
    </ReportPage>,
    <ReportPage key="overview" page={2} reference={data.reference}>
      <ReportTop id={event.id} issued={data.issued} />
      <div className="ir-page-title">
        <div className="ir-chip"><span className="ir-dot" /> 02 / SITUATION BRIEF</div>
        <h2 className="ir-h2">What happened.<br /><span className="ir-muted">Where it happened.</span></h2>
        <p className="ir-lead">{analysis.subtitle}</p>
      </div>
      <SceneDiagram data={data} />
      <div className="ir-reading">
        <div>
          <div className="ir-label">Incident narrative</div>
          <p className="ir-body">{event.summary}</p>
        </div>
        <div className="ir-fact-list">
          {[
            ["Location", data.location],
            ["Source / status", `${camera.code} / ${camera.status}`],
            ["Detection / UTC", data.utc],
            ["Zone", event.zone ?? "Not assigned"],
            ["Subject", event.subject ?? "Unverified track"],
          ].map(([k, v]) => <div className="ir-fact" key={k}><span>{k}</span><span>{v}</span></div>)}
        </div>
      </div>
      <div className="ir-metrics">
        {[
          [`${Math.round(event.conf * 100)}%`, "Model confidence"],
          [camera.fps.toString(), "Source fps"],
          [`${site.coverage}%`, "Site coverage"],
          [`${tracks.length}`, "Context tracks"],
        ].map(([v, k]) => <div className="ir-metric" key={k}><strong>{v}</strong><span>{k}</span></div>)}
      </div>
      <div className="ir-command"><div className="ir-label">Recommended action</div><p>{analysis.action}</p></div>
    </ReportPage>,
    <ReportPage key="reasoning" page={3} reference={data.reference} className="ir-page-soft">
      <ReportTop id={event.id} issued={data.issued} />
      <div className="ir-page-title">
        <div className="ir-chip"><span className="ir-dot" /> 03 / MODEL EVIDENCE</div>
        <h2 className="ir-h2">The reason this<br /><span className="ir-muted">alert was raised.</span></h2>
        <p className="ir-lead">{analysis.headline} The readout below shows the signals available for operator review.</p>
      </div>
      <div className="ir-analysis-grid">
        <div className="ir-panel">
          <div className="ir-label">Decision factors / demonstration scores</div>
          {analysis.factors.map((factor) => <div className="ir-factor" key={factor.label}>
            <div className="ir-factor-top"><span>{factor.label}</span><strong>{factor.value}%</strong></div>
            <div className="ir-factor-track"><div style={{ width: `${factor.value}%` }} /></div>
            <small>{factor.detail}</small>
          </div>)}
        </div>
        <div className="ir-panel ir-panel-dark">
          <div className="ir-label">Primary analytic</div>
          <div className="ir-analysis-index">{event.track}</div>
          <p className="ir-analysis-note">{analysis.why}</p>
          <div className="ir-analysis-mini">{analysis.model}<br />{camera.res} / {camera.bitrate} Mbps</div>
        </div>
      </div>
      <div className="ir-evidence-table">
        <div className="ir-label">Incident track and context snapshot</div>
        <table>
          <colgroup><col style={{ width: "22%" }} /><col style={{ width: "21%" }} /><col style={{ width: "14%" }} /><col style={{ width: "20%" }} /><col style={{ width: "23%" }} /></colgroup>
          <thead><tr><th>Track</th><th>Class</th><th>Score</th><th>Frame x / y</th><th>Identity / note</th></tr></thead>
          <tbody>
            <tr><td>{event.track}</td><td>{event.type === "Payload drop" || event.type === "Drone / UAS" ? "UAS" : event.type === "Camera tamper" ? "Sensor" : "Primary"}</td><td>{Math.round(event.conf * 100)}%</td><td>{event.x ?? 50}% / {event.y ?? 50}%</td><td>{event.subject ?? "Unverified"}</td></tr>
            {tracks.slice(0, 4).map((t) => <tr key={t.key}><td>{t.id}</td><td>{t.cls}</td><td>{Math.round(t.conf * 100)}%</td><td>{Math.round(t.x)}% / {Math.round(t.y)}%</td><td>{t.plate ?? `${t.speed} km/h ${t.heading}`}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="ir-caveat">
        <div className="ir-label">What to verify</div><p>{analysis.alternative} Context tracks are a current demo frame, not historical event evidence.</p>
      </div>
    </ReportPage>,
    <ReportPage key="response" page={4} reference={data.reference} className="ir-page-dark">
      <ReportTop id={event.id} issued={data.issued} />
      <div className="ir-page-title">
        <div className="ir-chip"><span className="ir-dot" /> 04 / RESPONSE & PROVENANCE</div>
        <h2 className="ir-h2">From signal<br /><span className="ir-muted">to decision.</span></h2>
        <p className="ir-lead">A short operational handoff. Every action below requires operator confirmation in this demonstration environment.</p>
      </div>
      <div className="ir-flow">
        {[
          ["01 / DETECT", "Signal raised", `${analysis.model} / ${Math.round(event.conf * 100)}%`],
          ["02 / CHECK", "Verify source", `Review ${camera.code} and adjacent coverage`],
          ["03 / RESPOND", "Task the unit", event.sev === "critical" ? "Priority QRT handoff" : "Duty officer review"],
          ["04 / RECORD", "Close the loop", "Disposition, note and media reference"],
        ].map(([id, title, desc]) => <div className="ir-step" key={id}><span className="ir-step-dot" /><div className="ir-step-id">{id}</div><div className="ir-step-title">{title}</div><div className="ir-step-desc">{desc}</div></div>)}
      </div>
      <div className="ir-response-columns">
        <div>
          <div className="ir-label">Response checklist</div>
          <div className="ir-response-list">
            {[
              "Acknowledge the event and preserve its original time and source camera.",
              analysis.action,
              "Verify scene context and record whether the alert is confirmed or a false positive.",
              note.trim() ? `Duty officer remark: ${note.trim()}` : "Add the duty officer's observation before formal handoff.",
            ].map((item, i) => <div className="ir-response-item" key={i}><b>{String(i + 1).padStart(2, "0")}</b><span>{item}</span></div>)}
          </div>
        </div>
        <div className="ir-record-box">
          <div className="ir-label">Evidence record / demonstration</div>
          <strong>{data.reference}</strong>
          <p>Media reference: {event.evidence}. Source: {camera.code}. Status: {event.status}. Report snapshot: {data.snapshotTime}. No certified original recording or signed evidence bundle is attached to this frontend demonstration.</p>
          <div className="ir-rule" />
          <div className="ir-label" style={{ marginTop: 15 }}>Custody requirement</div>
          <p>For operational use, retrieve the original timestamped CCTV clip from the authenticated VMS and calculate a cryptographic digest at ingest.</p>
        </div>
      </div>
      <div className="ir-signoff">
        {[
          ["Duty officer", "Review pending", "Name, callsign and time to be recorded"],
          ["Sector command", "Handoff pending", "Acknowledge receipt in C2"],
          ["Data retention", "Policy: 30 days", "Subject to operational approval"],
        ].map(([k, v, detail]) => <div key={k}><div className="ir-label">{k}</div><div className="ir-value">{v}</div><div className="ir-note">{detail}</div></div>)}
      </div>
      <div className="ir-demo-note">TRAINING DATA / NOT AN OFFICIAL INCIDENT CERTIFICATION. Video, event scores and track context in this report are simulated examples.</div>
    </ReportPage>,
  ];
  return <ReportPages preview={preview} focus={focus}>{pages}</ReportPages>;
}

export function GenericReportDocument({ spec }: { spec: GenericReportSpec }) {
  const pages = [
    <ReportPage key="cover" page={1} className="ir-page-dark" reference={spec.reference}>
      <ReportTop id={spec.id} issued={spec.issued} />
      <div className="ir-cover-mark">+</div><div className="ir-cover-index">01</div>
      <div className="ir-cover-content"><div className="ir-chip"><span className="ir-dot" />{spec.category}</div><h1 className="ir-cover-title">{spec.title}</h1><p className="ir-cover-desc">{spec.subtitle}</p></div>
      <div className="ir-cover-meta">{spec.coverMeta.slice(0, 4).map((m) => <div key={m.label}><div className="ir-label">{m.label}</div><div className="ir-value ir-mono">{m.value}</div></div>)}</div>
    </ReportPage>,
    <ReportPage key="overview" page={2} reference={spec.reference}>
      <ReportTop id={spec.id} issued={spec.issued} />
      <div className="ir-page-title"><div className="ir-chip"><span className="ir-dot" /> 02 / EXECUTIVE OVERVIEW</div><h2 className="ir-h2">{spec.overviewTitle}</h2><p className="ir-lead">{spec.overviewIntro}</p></div>
      <div className="ir-metrics" style={{ marginTop: 55 }}>{spec.metrics.slice(0, 4).map((m) => <div className="ir-metric" key={m.label}><strong>{m.value}</strong><span>{m.label}</span></div>)}</div>
      <p className="ir-generic-narrative">{spec.overviewBody}</p>
      <div className="ir-label" style={{ marginTop: 44 }}>Operational context</div>
      <div className="ir-generic-rows">{spec.context.slice(0, 5).map((row) => <div className="ir-generic-row" key={row.label}><span>{row.label}</span><div><strong>{row.value}</strong>{row.detail && <small>{row.detail}</small>}</div></div>)}</div>
    </ReportPage>,
    <ReportPage key="findings" page={3} className="ir-page-soft" reference={spec.reference}>
      <ReportTop id={spec.id} issued={spec.issued} />
      <div className="ir-page-title"><div className="ir-chip"><span className="ir-dot" /> 03 / ANALYSIS & DETAIL</div><h2 className="ir-h2">{spec.findingsTitle}</h2><p className="ir-lead">{spec.findingsIntro}</p></div>
      <div className="ir-analysis-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 44 }}>
        <div className="ir-panel"><div className="ir-label">Readout</div>{spec.factors.slice(0, 4).map((f) => <div className="ir-factor" key={f.label}><div className="ir-factor-top"><span>{f.label}</span><strong>{f.value}%</strong></div><div className="ir-factor-track"><div style={{ width: `${f.value}%` }} /></div><small>{f.detail}</small></div>)}</div>
        <div className="ir-panel ir-panel-dark"><div className="ir-label">Decision context</div><div className="ir-analysis-index" style={{ fontSize: 26, overflowWrap: "anywhere" }}>{spec.id}</div><p className="ir-analysis-note">{spec.overviewBody}</p><div className="ir-analysis-mini">RECORD / {spec.reference}</div></div>
      </div>
      <div className="ir-label" style={{ marginTop: 35 }}>Detailed register</div>
      <div className="ir-generic-rows" style={{ marginTop: 10 }}>{spec.details.slice(0, 5).map((row) => <div className="ir-generic-row" key={row.label}><span>{row.label}</span><div><strong>{row.value}</strong>{row.detail && <small>{row.detail}</small>}</div></div>)}</div>
    </ReportPage>,
    <ReportPage key="response" page={4} className="ir-page-dark" reference={spec.reference}>
      <ReportTop id={spec.id} issued={spec.issued} />
      <div className="ir-page-title"><div className="ir-chip"><span className="ir-dot" /> 04 / NEXT ACTIONS</div><h2 className="ir-h2">{spec.actionsTitle}</h2><p className="ir-lead">A concise handoff for the person accountable for the next decision.</p></div>
      <div className="ir-flow">{spec.actions.slice(0, 4).map((step, i) => <div className="ir-step" key={step.label}><span className="ir-step-dot" /><div className="ir-step-id">{String(i + 1).padStart(2, "0")}</div><div className="ir-step-title">{step.label}</div><div className="ir-step-desc">{step.value}</div></div>)}</div>
      <div className="ir-response-columns" style={{ marginTop: 60 }}><div><div className="ir-label">Operational considerations</div><div className="ir-response-list">{spec.actions.map((step, i) => <div className="ir-response-item" key={step.label}><b>{String(i + 1).padStart(2, "0")}</b><span>{step.value}</span></div>)}</div></div><div className="ir-record-box"><div className="ir-label">Report reference</div><strong>{spec.reference}</strong><p>{spec.caveat}</p><div className="ir-rule" /><div className="ir-label" style={{ marginTop: 15 }}>Distribution</div><p>Sector command / duty officer / operational archive.</p></div></div>
      <div className="ir-demo-note">DEMONSTRATION REPORT. Verify all values, source media and operational approvals before field use.</div>
    </ReportPage>,
  ];
  return <ReportPages>{pages}</ReportPages>;
}