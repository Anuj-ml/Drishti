import type { GenericReportSpec } from "../components/ReportDocument";
import { MODELS, SITES, type Camera, type EventLog, type Site } from "./data";
import { hash, type Range } from "./sim";
import type { Metrics, Zone } from "../state/store";

const issued = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()) + " IST";

const ref = (prefix: string, key: string) => `DEMO-${prefix}-${hash(key).toString(16).toUpperCase().padStart(8, "0")}`;

export function sectorReportSpec(events: EventLog[], metrics: Metrics): GenericReportSpec {
  const critical = events.filter((e) => e.sev === "critical").length;
  const open = events.filter((e) => e.status === "new" || e.status === "ack").length;
  const dispatched = events.filter((e) => e.status === "dispatched").length;
  const top = events[0];
  return {
    id: `SECTOR-${new Date().toISOString().slice(0, 10)}`,
    category: "Operations / incident ledger",
    title: "Sector incident.\nClear priorities.",
    subtitle: "A concise command view of the current event queue, response state and the surveillance capacity behind it.",
    issued: issued(),
    coverMeta: [
      { label: "Window", value: "Current ledger" },
      { label: "Events", value: String(events.length) },
      { label: "Open", value: String(open) },
      { label: "Critical", value: String(critical) },
    ],
    overviewTitle: "Where pressure\nis building.",
    overviewIntro: "The signal mix is useful only when it changes which event is reviewed first.",
    overviewBody: `${events.length} recorded events are in scope. ${critical} are critical and ${open} remain new or acknowledged. ${dispatched} have been dispatched. The most recent signal is ${top ? `${top.type} at ${top.cam}` : "not yet available"}.`,
    metrics: [
      { value: String(events.length), label: "Events logged" },
      { value: String(open), label: "Open queue" },
      { value: String(critical), label: "Critical" },
      { value: `${metrics.lat} ms`, label: "Alert latency" },
    ],
    context: [
      { label: "Most recent", value: top ? `${top.id} / ${top.type}` : "No event" },
      { label: "Duty posture", value: `${dispatched} dispatched / ${open} awaiting disposition` },
      { label: "Inference tier", value: `${metrics.fps} fps per stream / ${metrics.gpu}% GPU` },
      { label: "Stream availability", value: `${metrics.streams} streams on current inference tier` },
    ],
    findingsTitle: "Which events\nneed a decision.",
    findingsIntro: "A summarized register for prioritization. Open the individual incident dossier to see source and model context.",
    factors: [
      { label: "Critical share", value: Math.round((critical / Math.max(1, events.length)) * 100), detail: "Immediate-review portion" },
      { label: "Open queue", value: Math.round((open / Math.max(1, events.length)) * 100), detail: "New + acknowledged" },
      { label: "Dispatch progress", value: Math.round((dispatched / Math.max(1, events.length)) * 100), detail: "Response in progress" },
      { label: "Current GPU utilization", value: metrics.gpu, detail: "System headroom indicator" },
    ],
    details: events.slice(0, 6).map((e) => ({ label: e.id, value: `${e.type} / ${e.sev}`, detail: `${e.cam} / ${e.status} / ${Math.round(e.conf * 100)}%` })),
    actionsTitle: "Triage. Verify.\nRecord.",
    actions: [
      { label: "Acknowledge", value: "Assign each new critical signal to a named duty officer before the response timer expires." },
      { label: "Corroborate", value: "Review adjacent cameras and authorized-movement logs before inferring intent." },
      { label: "Dispatch", value: "Task the nearest response unit with a site reference and safe intercept route." },
      { label: "Close", value: "Record the disposition, supporting source media and operator rationale." },
    ],
    caveat: "This is a demo ledger. Media references and track scores are simulated; no certified evidence hash or signature is included.",
    reference: ref("SECTOR", String(events.length) + (top?.id ?? "")),
  };
}

export function sitrepReportSpec(
  range: Range,
  series: { labels: string[]; people: number[]; vehicles: number[]; alerts: number[] },
  events: EventLog[],
  metrics: Metrics,
): GenericReportSpec {
  const people = series.people.reduce((a, b) => a + b, 0);
  const vehicles = series.vehicles.reduce((a, b) => a + b, 0);
  const alerts = series.alerts.reduce((a, b) => a + b, 0);
  return {
    id: `SITREP-${range.toUpperCase()}`,
    category: "Intelligence / situation report",
    title: "What the sector\nsaw.",
    subtitle: "A measured account of detections, response pressure and coverage for the selected reporting window.",
    issued: issued(),
    coverMeta: [
      { label: "Window", value: range.toUpperCase() },
      { label: "People", value: people.toLocaleString("en-IN") },
      { label: "Vehicles", value: vehicles.toLocaleString("en-IN") },
      { label: "Alerts", value: String(alerts) },
    ],
    overviewTitle: "The picture,\nin four numbers.",
    overviewIntro: "What changed across the camera network, and whether the inference layer kept up.",
    overviewBody: `Across ${range}, the platform tracked ${people.toLocaleString("en-IN")} people and ${vehicles.toLocaleString("en-IN")} vehicles, and raised ${alerts} alerts. Median glass-to-alert latency is ${metrics.lat} ms at ${metrics.fps} fps per stream.`,
    metrics: [
      { value: people.toLocaleString("en-IN"), label: "People tracked" },
      { value: vehicles.toLocaleString("en-IN"), label: "Vehicles read" },
      { value: String(alerts), label: "Alerts raised" },
      { value: `${metrics.lat} ms`, label: "Alert latency" },
    ],
    context: [
      { label: "Camera estate", value: `${SITES.reduce((n, s) => n + s.online, 0)} online of ${SITES.reduce((n, s) => n + s.cams, 0)} registered` },
      { label: "Coverage", value: `${Math.round(SITES.reduce((n, s) => n + s.coverage, 0) / SITES.length)}% average visible-line coverage` },
      { label: "Severity 1", value: `${events.filter((e) => e.sev === "critical").length} critical events in current ledger` },
      { label: "GPU pressure", value: `${metrics.gpu}% utilization / ${metrics.vram} GB VRAM` },
    ],
    findingsTitle: "Coverage is\na system property.",
    findingsIntro: "Site-level availability and model quality explain the gaps behind aggregate numbers.",
    factors: MODELS.slice(0, 5).map((m) => ({ label: m.name, value: Math.round(m.acc * 100), detail: m.device })),
    details: SITES.slice(0, 6).map((s) => ({ label: s.name, value: `${s.online}/${s.cams} cameras / ${s.coverage}% coverage`, detail: `${s.uptime}% uptime / ${s.mode}` })),
    actionsTitle: "Retask where\nit matters.",
    actions: [
      { label: "Validate", value: "Review severity-one events against full source video and adjacent camera context." },
      { label: "Reallocate", value: "Prioritize sectors with offline feeds or visible-line coverage below 80%." },
      { label: "Tune", value: "Adjust model gates where false positives rise without suppressing valid alerts." },
      { label: "Review", value: "Compare the next reporting window against the current detection baseline." },
    ],
    caveat: "Illustrative analytics from simulated streams. Values must be validated with production ingest before operational planning.",
    reference: ref("SITREP", range + people + vehicles),
  };
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

export function anprReportSpec(p: PlateRecord): GenericReportSpec {
  return {
    id: p.plate,
    category: "Vehicle intelligence / ANPR",
    title: "A plate read.\nA route to verify.",
    subtitle: "A software-defined vehicle intercept record combining OCR confidence, movement context and watchlist disposition.",
    issued: issued(),
    coverMeta: [
      { label: "Plate", value: p.plate },
      { label: "State", value: p.state },
      { label: "Watchlist", value: p.watch },
      { label: "Read time", value: `${p.t} IST` },
    ],
    overviewTitle: "Identity needs\ncorroboration.",
    overviewIntro: "A plate alone is not a vehicle. Class, colour, route and occupancy provide supporting context.",
    overviewBody: `${p.plate} was read ${p.dir.toLowerCase()} at ${p.site}, travelling ${p.speed} km/h. The vehicle is classified as a ${p.colour.toLowerCase()} ${p.cls.toLowerCase()} with ${p.occ} visible occupant(s).`,
    metrics: [
      { value: `${Math.round(p.conf * 100)}%`, label: "Plate detection" },
      { value: `${Math.round(p.ocr * 100)}%`, label: "OCR confidence" },
      { value: `${p.speed}`, label: "km / hour" },
      { value: `${p.occ}`, label: "Occupants" },
    ],
    context: [
      { label: "Camera", value: p.cam },
      { label: "Movement", value: `${p.dir} / ${p.route}` },
      { label: "Vehicle", value: `${p.colour} / ${p.cls}` },
      { label: "Watchlist", value: p.watch === "None" ? "No current match" : `${p.watch} / verify with registry` },
    ],
    findingsTitle: "How the read\nwas formed.",
    findingsIntro: "Detector, crop, OCR and registry match each contribute a separate quality signal.",
    factors: [
      { label: "Plate localization", value: Math.round(p.conf * 100), detail: "Perspective rectified crop" },
      { label: "OCR character score", value: Math.round(p.ocr * 100), detail: "CRNN-BHARAT read" },
      { label: "Vehicle class match", value: 89, detail: `${p.cls} / ${p.colour}` },
      { label: "Direction continuity", value: 94, detail: `${p.dir} vector` },
    ],
    details: [
      { label: "Registration", value: p.plate, detail: p.state },
      { label: "Camera and site", value: `${p.cam} / ${p.site}` },
      { label: "Route", value: p.route },
      { label: "Speed", value: `${p.speed} km/h` },
      { label: "Read confidence", value: `${Math.round(p.ocr * 100)}% OCR / ${Math.round(p.conf * 100)}% detection` },
    ],
    actionsTitle: "Verify before\nintercept.",
    actions: [
      { label: "Check", value: "Review the original frame for glare, dirt or plate occlusion." },
      { label: "Match", value: "Cross-check registration data against the authoritative vehicle registry." },
      { label: "Correlate", value: "Compare colour and class on the next camera in the route." },
      { label: "Record", value: "Log operator verification and any lawful stop decision." },
    ],
    caveat: "Demonstration ANPR data. A registry match and vehicle identity require human verification.",
    reference: ref("ANPR", p.plate),
  };
}

export function frsReportSpec(
  candidate: { id: string; label: string; score: number; cam: string; t: string; status: string; angle: string; obs: number },
  gallery: string,
  threshold: number,
): GenericReportSpec {
  const passed = candidate.score >= threshold;
  return {
    id: candidate.id,
    category: "Biometric intelligence / FRS",
    title: "A face candidate.\nNot a verdict.",
    subtitle: "A pose-gated biometric comparison record designed for operator review, not automated identity decisions.",
    issued: issued(),
    coverMeta: [
      { label: "Gallery ID", value: candidate.id },
      { label: "Gallery", value: gallery },
      { label: "Similarity", value: candidate.score.toFixed(3) },
      { label: "Gate", value: passed ? "Above threshold" : "Below threshold" },
    ],
    overviewTitle: "Similarity is\nnot identity.",
    overviewIntro: "Pose, crop quality and liveness matter as much as the cosine score.",
    overviewBody: `${candidate.label} was compared against ${gallery}. The 512-dimensional similarity score is ${candidate.score.toFixed(3)} against a configured threshold of ${threshold.toFixed(3)}. This ${passed ? "requires confirmation" : "does not pass the match gate"}.`,
    metrics: [
      { value: candidate.score.toFixed(3), label: "Cosine score" },
      { value: threshold.toFixed(3), label: "Decision gate" },
      { value: String(candidate.obs), label: "Prior sightings" },
      { value: passed ? "Review" : "Reject", label: "Disposition" },
    ],
    context: [
      { label: "Source", value: `${candidate.cam} / ${candidate.t} IST` },
      { label: "Pose", value: candidate.angle },
      { label: "Gallery status", value: candidate.status },
      { label: "Candidate", value: candidate.label },
    ],
    findingsTitle: "What the model\ncompared.",
    findingsIntro: "A matching score is presented with its capture and quality context.",
    factors: [
      { label: "Cosine similarity", value: Math.round(candidate.score * 100), detail: "512-dimensional embedding" },
      { label: "Illustrative crop quality", value: Math.round(Math.max(.3, candidate.score - .06) * 100), detail: candidate.angle },
      { label: "Illustrative liveness gate", value: 94, detail: "Visual spoof check" },
      { label: "Threshold coverage", value: Math.round(threshold * 100), detail: "Configured decision boundary" },
    ],
    details: [
      { label: "Gallery identity", value: candidate.id },
      { label: "Subject label", value: candidate.label },
      { label: "Last camera", value: candidate.cam },
      { label: "Pose / angle", value: candidate.angle },
      { label: "Past observations", value: String(candidate.obs) },
    ],
    actionsTitle: "Keep a person\nin the loop.",
    actions: [
      { label: "Inspect", value: "Review the face crop and the source frame for occlusion or motion blur." },
      { label: "Compare", value: "Corroborate against independent identifiers rather than similarity alone." },
      { label: "Protect", value: "Restrict gallery access and retain only necessary personal data." },
      { label: "Decide", value: "Have an authorized operator confirm or dismiss the candidate." },
    ],
    caveat: "Illustrative biometric data. A face match is probabilistic and cannot establish identity on its own.",
    reference: ref("FRS", candidate.id + gallery),
  };
}

export function patrolReportSpec(zones: Zone[], camera: Camera): GenericReportSpec {
  const armed = zones.filter((z) => z.enabled);
  const hits = zones.reduce((n, z) => n + z.hits, 0);
  return {
    id: `PATROL-${camera.id.toUpperCase()}`,
    category: "Perimeter operations / patrol briefing",
    title: "The software\ndraws the line.",
    subtitle: "A field brief for the virtual boundaries, response gates and patrol priorities on an existing CCTV feed.",
    issued: issued(),
    coverMeta: [
      { label: "Site", value: camera.site },
      { label: "Source", value: camera.code },
      { label: "Zones armed", value: `${armed.length}/${zones.length}` },
      { label: "Sector", value: camera.sector },
    ],
    overviewTitle: "A boundary can\nbe re-tasked.",
    overviewIntro: "The zone logic is software-defined; no physical tripwire is required.",
    overviewBody: `${armed.length} of ${zones.length} virtual zones are armed. The active camera is ${camera.code}. Zones include crossing, exclusion and loitering rules, all tied to an operator-reviewed alert workflow.`,
    metrics: [
      { value: String(armed.length), label: "Armed zones" },
      { value: String(zones.length), label: "Total zones" },
      { value: String(hits), label: "Recorded hits" },
      { value: String(camera.fps), label: "Source fps" },
    ],
    context: zones.slice(0, 5).map((z) => ({ label: z.id, value: `${z.name} / ${z.enabled ? "Armed" : "Disarmed"}`, detail: `${z.mode} / ${z.cam}` })),
    findingsTitle: "Rules, not\nextra hardware.",
    findingsIntro: "Sensitivity and minimum object size determine which tracks can trigger each zone.",
    factors: zones.slice(0, 5).map((z) => ({ label: z.name, value: z.sens, detail: `${z.mode} / min ${z.minSize}px` })),
    details: zones.slice(0, 6).map((z) => ({ label: z.id, value: `${z.mode} / ${z.enabled ? "armed" : "disarmed"}`, detail: `${z.hits} hits / ${z.dwell}s dwell` })),
    actionsTitle: "A trigger needs\na response.",
    actions: [
      { label: "Acknowledge", value: "Assign the alert to the on-watch officer and confirm its camera source." },
      { label: "Verify", value: "Review the crossing vector and adjacent camera context." },
      { label: "Dispatch", value: "Send the nearest QRT to a safe route if the event is confirmed." },
      { label: "Retune", value: "Log false positives and adjust geometry or sensitivity after review." },
    ],
    caveat: "Illustrative zone configuration. Calibrate each scene and validate the fence geometry before live operation.",
    reference: ref("PATROL", camera.id + zones.length),
  };
}

export function maintenanceReportSpec(site: Site): GenericReportSpec {
  return {
    id: `WORK-${site.id.toUpperCase()}`,
    category: "Field maintenance / work order",
    title: "Restore the\nsurveillance line.",
    subtitle: "A technician-ready work order that separates optical, transport and edge-compute faults before hardware is replaced.",
    issued: issued(),
    coverMeta: [
      { label: "Site", value: site.name },
      { label: "Cameras", value: `${site.online}/${site.cams} online` },
      { label: "Uptime", value: `${site.uptime}%` },
      { label: "Sector", value: site.sector },
    ],
    overviewTitle: "Diagnose the cause,\nnot the symptom.",
    overviewIntro: "The health picture shows where to start on site.",
    overviewBody: `${site.name} has ${site.online} of ${site.cams} cameras online, ${site.uptime}% uptime and ${site.coverage}% visible-line coverage. The ${site.gpu} node is running in ${site.mode} with a ${site.bandwidth} Mbps uplink.`,
    metrics: [
      { value: `${site.online}/${site.cams}`, label: "Streams online" },
      { value: `${site.uptime}%`, label: "Uptime" },
      { value: `${site.coverage}%`, label: "Coverage" },
      { value: `${site.queue}`, label: "Queued frames" },
    ],
    context: [
      { label: "Coordinates", value: `${site.lat} / ${site.long}` },
      { label: "Edge compute", value: site.gpu },
      { label: "Transport", value: `${site.bandwidth} Mbps / ${site.mode}` },
      { label: "24-hour events", value: String(site.events24) },
    ],
    findingsTitle: "Four layers to\nverify.",
    findingsIntro: "Optics, network, edge health and end-to-end alert delivery are investigated separately.",
    factors: [
      { label: "Camera availability", value: Math.round((site.online / site.cams) * 100), detail: "Connected / registered" },
      { label: "Rolling uptime", value: Math.round(site.uptime), detail: "Site transport" },
      { label: "Visible line coverage", value: site.coverage, detail: "Optical footprint" },
      { label: "Queue clearance", value: Math.max(0, 100 - site.queue * 3), detail: "Edge buffer pressure" },
    ],
    details: [
      { label: "Optical checks", value: "Lens cleanliness, IR cut-on and physical aim" },
      { label: "Stream checks", value: "ONVIF discovery, RTSP heartbeat and packet loss" },
      { label: "Edge checks", value: "GPU temperature, model load and ring buffer" },
      { label: "Acceptance", value: "Restore scene and verify test-alert delivery" },
    ],
    actionsTitle: "Repair, then\nprove coverage.",
    actions: [
      { label: "Inspect", value: "Photograph the camera position and check power, lens and weatherproofing." },
      { label: "Restore", value: "Repair the transport path or restart the edge decoder as required." },
      { label: "Test", value: "Run a controlled scene-integrity and alert-delivery test." },
      { label: "Close", value: "Record before/after fps, coverage and maintenance sign-off." },
    ],
    caveat: "Illustrative work order. Physical maintenance must follow site safety and authorization procedures.",
    reference: ref("WORK", site.id),
  };
}