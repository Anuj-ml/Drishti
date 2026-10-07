export type CamClass = "person" | "vehicle" | "face" | "animal" | "uas" | "unknown";

export type Camera = {
  id: string;
  code: string;
  name: string;
  site: string;
  sector: string;
  url: string;
  thumb: string;
  videoUrl: string;
  useCase: string;
  kind: "Bullet 4K" | "Dome IR" | "Thermal" | "PTZ 25×" | "Box 1080p" | "Webcam";
  res: string;
  fps: number;
  bitrate: number;
  status: "live" | "degraded" | "offline";
  models: string[];
  note: string;
  objectPosition?: string;
  isWebcam?: boolean;
};

/** Local webcam virtual camera. Same-origin → canvas reads work → real inference. */
export const WEBCAM: Camera = {
  id: "c00",
  code: "LOCAL / WEBCAM",
  name: "Local Test Feed (your camera)",
  site: "LOCAL",
  sector: "Sector 0 · Bench Test",
  url: "",
  thumb: "",
  videoUrl: "",
  useCase: "Real Inference Pipeline Validation",
  kind: "Webcam",
  res: "1280×720",
  fps: 30,
  bitrate: 0,
  status: "live",
  models: ["detect-s", "track", "fence", "frs"],
  note: "Same-origin getUserMedia feed. Canvas reads permitted — full pipeline runs with real pixel data.",
  isWebcam: true,
};

const P = (id: number, size = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${size}&h=${Math.round(
    (size * 9) / 16,
  )}`;
const T = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=320`;

export const CAMERAS: Camera[] = [
  WEBCAM,
  {
    id: "c01",
    code: "BOP-07 / CAM-01",
    name: "Fence Line — North Reach",
    site: "BOP-07",
    sector: "Sector 4 · Punjab",
    url: P(11679655),
    thumb: T(11679655),
    videoUrl: "https://videos.pexels.com/video-files/3602486/3602486-hd_1920_1080_30fps.mp4",
    useCase: "Virtual Fence Intrusion Detection",
    kind: "Bullet 4K",
    res: "3840×2160",
    fps: 25,
    bitrate: 8.4,
    status: "live",
    models: ["detect-s", "track", "fence", "night", "terrain"],
    note: "Primary anti-intrusion axis. 1.2 km visible fence run.",
  },
  {
    id: "c02",
    code: "BOP-07 / CAM-02",
    name: "Track Road — Gate 3",
    site: "BOP-07",
    sector: "Sector 4 · Punjab",
    url: P(11679656),
    thumb: T(11679656),
    videoUrl: "https://videos.pexels.com/video-files/12201293/12201293-hd_1920_1080_24fps.mp4",
    useCase: "Rural Border Track Vehicle Monitoring",
    kind: "Dome IR",
    res: "1920×1080",
    fps: 30,
    bitrate: 4.1,
    status: "live",
    models: ["detect-s", "anpr", "fence"],
    note: "Covers the farm-track entry point used by local traffic.",
  },
  {
    id: "c03",
    code: "CHK-12 / CAM-04",
    name: "Highway Approach — East",
    site: "Check Post 12",
    sector: "Sector 7 · Circuit House",
    url: P(1225126),
    thumb: T(1225126),
    videoUrl: "https://videos.pexels.com/video-files/15510151/15510151-hd_1920_1080_30fps.mp4",
    useCase: "Vehicle Detection & Multi-Lane Classification",
    kind: "Bullet 4K",
    res: "3840×2160",
    fps: 25,
    bitrate: 9.2,
    status: "live",
    models: ["detect-m", "anpr", "class-veh", "behav"],
    note: "Three-lane approach. Night traffic heavy, headlight glare handled by HDR layer.",
  },
  {
    id: "c04",
    code: "CHK-12 / CAM-06",
    name: "Scan Lane — Freight",
    site: "Check Post 12",
    sector: "Sector 7 · Circuit House",
    url: P(5961982),
    thumb: T(5961982),
    videoUrl: "https://videos.pexels.com/video-files/31951421/13613133_1920_1080_30fps.mp4",
    useCase: "Automatic Number Plate Recognition (ANPR)",
    kind: "Box 1080p",
    res: "1920×1080",
    fps: 30,
    bitrate: 3.6,
    status: "live",
    models: ["anpr", "class-veh", "ocr"],
    note: "Dedicated ANPR lane camera, 1/400 s shutter, plate crop 220 px.",
  },
  {
    id: "c05",
    code: "BOP-03 / CAM-01",
    name: "Nullah Crossing — Culvert",
    site: "BOP-03",
    sector: "Sector 2 · Ampharia",
    url: P(10038889),
    thumb: T(10038889),
    videoUrl: "https://videos.pexels.com/video-files/29989415/12868220_3840_2160_50fps.mp4",
    useCase: "Low-Visibility / Fog Thermal Fallback",
    kind: "Thermal",
    res: "1280×1024",
    fps: 20,
    bitrate: 2.9,
    status: "degraded",
    models: ["detect-s", "thermal", "fence", "night", "guard"],
    note: "Known low-visibility gap during monsoon fog. Thermal fallback engaged.",
  },
  {
    id: "c06",
    code: "BOP-03 / CAM-05",
    name: "Treeline Infiltration Route",
    site: "BOP-03",
    sector: "Sector 2 · Ampharia",
    url: P(37210186),
    thumb: T(37210186),
    videoUrl: "https://videos.pexels.com/video-files/12123418/12123418-uhd_2560_1440_30fps.mp4",
    useCase: "Suspicious Activity & Perimeter Breach",
    kind: "Dome IR",
    res: "2560×1440",
    fps: 25,
    bitrate: 5.2,
    status: "live",
    models: ["detect-s", "track", "behav", "night"],
    note: "Highest event density on the sector. Foot-pattern classifier enabled.",
  },
  {
    id: "c07",
    code: "BOP-21 / CAM-02",
    name: "Outpost Gate — Vehicle Standby",
    site: "BOP-21",
    sector: "Sector 9 · Basantar",
    url: P(4858438),
    thumb: T(4858438),
    videoUrl: "https://videos.pexels.com/video-files/11837019/11837019-uhd_1920_1440_60fps.mp4",
    useCase: "Check-Post Gate FRS & Vehicle Screening",
    kind: "PTZ 25×",
    res: "1920×1080",
    fps: 30,
    bitrate: 4.4,
    status: "live",
    models: ["detect-s", "frs", "anpr", "track"],
    note: "PTZ auto-cued by tripwire events; patrol staging area in frame.",
  },
  {
    id: "c08",
    code: "BOP-21 / CAM-07",
    name: "Foot Path — West Embankment",
    site: "BOP-21",
    sector: "Sector 9 · Basantar",
    url: P(30248044),
    thumb: T(30248044),
    videoUrl: "https://videos.pexels.com/video-files/4698492/4698492-hd_1920_1080_30fps.mp4",
    useCase: "Human Detection, Gait & Multi-Object Tracking",
    kind: "Bullet 4K",
    res: "3840×2160",
    fps: 25,
    bitrate: 7.8,
    status: "live",
    models: ["detect-s", "track", "fence", "frs"],
    note: "Loitering analysis tuned for civilian herd movement windows 05:30–07:00.",
  },
  {
    id: "c09",
    code: "CHK-04 / CAM-01",
    name: "Village Market Fringe",
    site: "Check Post 04",
    sector: "Sector 4 · Punjab",
    url: P(5918916),
    thumb: T(5918916),
    videoUrl: "https://videos.pexels.com/video-files/853889/853889-hd_1920_1080_25fps.mp4",
    useCase: "Face Detection & Crowd Anomaly Analytics",
    kind: "Dome IR",
    res: "2560×1440",
    fps: 25,
    bitrate: 5.0,
    status: "live",
    models: ["detect-s", "crowd", "frs", "behav"],
    note: "Crowd-density baseline used for sudden-movement anomaly scoring.",
  },
  {
    id: "c10",
    code: "BOP-11 / CAM-03",
    name: "Road Cum bund — Sunset Reach",
    site: "BOP-11",
    sector: "Sector 2 · Ampharia",
    url: P(15829550),
    thumb: T(15829550),
    videoUrl: "https://videos.pexels.com/video-files/39102242/16636884_1920_1080_25fps.mp4",
    useCase: "Pedestrian Corridor & Loitering Detection",
    kind: "Bullet 4K",
    res: "3840×2160",
    fps: 25,
    bitrate: 8.1,
    status: "live",
    models: ["detect-s", "track", "anpr"],
    note: "Dusk-to-dark transition zone — IR cut filter scheduled at 18:40.",
  },
  {
    id: "c11",
    code: "BOP-11 / CAM-06",
    name: "Feeder Track — Aerial View",
    site: "BOP-11",
    sector: "Sector 2 · Ampharia",
    url: P(14240458),
    thumb: T(14240458),
    videoUrl: "https://videos.pexels.com/video-files/32368171/13808335_1920_1080_60fps.mp4",
    useCase: "Drone / UAS Airspace Detection & Tracking",
    kind: "PTZ 25×",
    res: "2560×1440",
    fps: 20,
    bitrate: 4.8,
    status: "live",
    models: ["sky", "track", "fence"],
    note: "Upward-canted PTZ preset watches the low-altitude approach corridor for UAS trajectory and payload-release events.",
  },
  {
    id: "c12",
    code: "BOP-05 / CAM-01",
    name: "Night Patrol Staging",
    site: "BOP-05",
    sector: "Sector 9 · Basantar",
    url: P(10649756),
    thumb: T(10649756),
    videoUrl: "https://videos.pexels.com/video-files/856148/856148-hd_1920_1080_25fps.mp4",
    useCase: "Night-Time Movement & Starlight Fusion",
    kind: "Thermal",
    res: "1280×1024",
    fps: 20,
    bitrate: 3.1,
    status: "live",
    models: ["detect-s", "thermal", "night", "behav"],
    note: "Starlight + thermal fusion feed used for night movement detection.",
  },
];

export type UseCaseReel = {
  id: string;
  tag: string;
  title: string;
  capability: string;
  camId: string;
  targetView: "live" | "faces" | "vehicles" | "fence" | "night" | "events" | "analytics" | "threats";
  videoUrl: string;
  thumb: string;
  duration: string;
  model: string;
  summary: string;
};

export const USE_CASE_REELS: UseCaseReel[] = [
  {
    id: "uc-fence",
    tag: "PS · 01",
    title: "Virtual Fence Intrusion",
    capability: "Tripwire & exclusion polygon breach on standard perimeter CCTV",
    camId: "c01",
    targetView: "fence",
    videoUrl: "https://videos.pexels.com/video-files/3602486/3602486-hd_1920_1080_30fps.mp4",
    thumb: T(11679655),
    duration: "00:15",
    model: "IBV-Fence + IBV-Det-s",
    summary: "Software-defined tripwire along 1.2 km border fence line triggers instant vector alerts without physical fence sensors.",
  },
  {
    id: "uc-human",
    tag: "PS · 02",
    title: "Human Detection & Tracking",
    capability: "Multi-object pedestrian tracking & 96-frame ReID across embankments",
    camId: "c08",
    targetView: "live",
    videoUrl: "https://videos.pexels.com/video-files/4698492/4698492-hd_1920_1080_30fps.mp4",
    thumb: T(30248044),
    duration: "00:11",
    model: "IBV-Det-s + ByteTrack",
    summary: "Continuous human bounding-box lock, velocity vectoring, and shadow-resilient silhouette tracking on patrol footpaths.",
  },
  {
    id: "uc-anpr",
    tag: "PS · 03",
    title: "Vehicle & ANPR Recognition",
    capability: "Software shutter-tuned plate crop, perspective warp & CRNN OCR",
    camId: "c04",
    targetView: "vehicles",
    videoUrl: "https://videos.pexels.com/video-files/31951421/13613133_1920_1080_30fps.mp4",
    thumb: T(5961982),
    duration: "00:09",
    model: "IBV-Plate + CRNN-BHARAT",
    summary: "Extracts license plates and vehicle classes from standard 1080p check-post lane cameras without dedicated ANPR hardware.",
  },
  {
    id: "uc-veh-hwy",
    tag: "PS · 04",
    title: "Check-Post Approach Traffic",
    capability: "High-density multi-lane vehicle classification & contraflow alert",
    camId: "c03",
    targetView: "vehicles",
    videoUrl: "https://videos.pexels.com/video-files/15510151/15510151-hd_1920_1080_30fps.mp4",
    thumb: T(1225126),
    duration: "00:13",
    model: "IBV-Det-m FP16",
    summary: "Classifies trucks, SUVs, two-wheelers, and convoys approaching Check Post 12 under heavy headlight glare.",
  },
  {
    id: "uc-frs",
    tag: "PS · 05",
    title: "Facial Recognition (FRS)",
    capability: "Pose-gated 512-d ArcFace embedding match against watchlist gallery",
    camId: "c09",
    targetView: "faces",
    videoUrl: "https://videos.pexels.com/video-files/853889/853889-hd_1920_1080_25fps.mp4",
    thumb: T(5918916),
    duration: "00:14",
    model: "IBV-Face 512-d",
    summary: "Performs high-angle monochrome pedestrian face detection, quality gating, and watchlist cosine matching in real time.",
  },
  {
    id: "uc-behav",
    tag: "PS · 06",
    title: "Suspicious Activity & Loitering",
    capability: "Treeline infiltration, dwell timer & barbed-wire proximity scoring",
    camId: "c06",
    targetView: "events",
    videoUrl: "https://videos.pexels.com/video-files/12123418/12123418-uhd_2560_1440_30fps.mp4",
    thumb: T(37210186),
    duration: "00:11",
    model: "IBV-Behav INT8",
    summary: "Flags loitering, crouch/crawl gait anomalies, and unauthorized dwell near wooded infiltration corridors.",
  },
  {
    id: "uc-night",
    tag: "PS · 07",
    title: "Night-Time Movement",
    capability: "Starlight gamma lift, temporal denoise & IR/thermal fusion",
    camId: "c12",
    targetView: "night",
    videoUrl: "https://videos.pexels.com/video-files/856148/856148-hd_1920_1080_25fps.mp4",
    thumb: T(10649756),
    duration: "00:40",
    model: "IBV-Star + Thermal Gate",
    summary: "Pre-enhances 0.08 lux nocturnal feeds ahead of the detector to boost night movement recall by +38%.",
  },
  {
    id: "uc-fog",
    tag: "PS · 08",
    title: "Rural Track & Fog Culvert",
    capability: "Monsoon fog culvert monitoring & rural freight track intercept",
    camId: "c02",
    targetView: "live",
    videoUrl: "https://videos.pexels.com/video-files/12201293/12201293-hd_1920_1080_24fps.mp4",
    thumb: T(11679656),
    duration: "01:00",
    model: "IBV-Det-s + ANPR",
    summary: "Tracks heavy vehicles and foot parties across unlit dirt feeder tracks and fog-prone nullah crossings.",
  },
  {
    id: "uc-uas",
    tag: "PS+ · 09",
    title: "Drone / UAS Detection",
    capability: "Air-object size, speed and trajectory-shape classification with payload-drop geofencing",
    camId: "c11",
    targetView: "threats",
    videoUrl: "https://videos.pexels.com/video-files/32368171/13808335_1920_1080_60fps.mp4",
    thumb: "https://images.pexels.com/videos/32368171/camera-carve-drone-filmer-32368171.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
    duration: "00:15",
    model: "IBV-Sky · trajectory transformer",
    summary: "Separates low-RCS UAS tracks from birds using apparent size, acceleration, hover dwell and trajectory curvature; payload release auto-marks a GPS drop zone.",
  },
  {
    id: "uc-ground",
    tag: "PS+ · 10",
    title: "Ground Disturbance Detection",
    capability: "Long-timescale terrain comparison for spoil piles, cleared vegetation and tunnel-dig precursors",
    camId: "c01",
    targetView: "threats",
    videoUrl: "https://videos.pexels.com/video-files/35223044/14922523_1920_1080_25fps.mp4",
    thumb: "https://images.pexels.com/videos/35223044/pexels-photo-35223044.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
    duration: "00:19",
    model: "IBV-Terrain · 14-day Siamese delta",
    summary: "Compares normalized dawn frames against a rolling terrain baseline and flags new spoil mass, exposed soil and vegetation removal near the fence.",
  },
  {
    id: "uc-tamper",
    tag: "PS+ · 11",
    title: "Camera Self-Tamper / Blind",
    capability: "Instant blank, lens-cover, defocus, signal-loss and physical re-aim detection",
    camId: "c05",
    targetView: "threats",
    videoUrl: "https://videos.pexels.com/video-files/14904107/14904107-hd_1920_1080_30fps.mp4",
    thumb: "https://images.pexels.com/videos/14904107/designed-glitching-analog-noise-14904107.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
    duration: "00:10",
    model: "IBV-Guard · scene integrity",
    summary: "Monitors luminance collapse, edge density, histogram divergence and scene homography so covered, blinded or re-aimed cameras alert without waiting for an operator.",
  },
];

export const ADVANCED_THREATS = [
  {
    id: "uas",
    title: "Drone / UAS detect",
    short: "Airspace",
    model: "IBV-Sky v2.3",
    camId: "c11",
    videoUrl: "https://videos.pexels.com/video-files/32368171/13808335_1920_1080_60fps.mp4",
    thumb: "https://images.pexels.com/videos/32368171/camera-carve-drone-filmer-32368171.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
    signal: "UAS-044 · quad-rotor",
    score: 0.93,
    latency: 34,
    description: "Size + trajectory-shape classifier separated from the ground detector. Hover, acceleration and turn-radius features suppress bird tracks.",
  },
  {
    id: "ground",
    title: "Ground-disturbance detect",
    short: "Terrain delta",
    model: "IBV-Terrain v1.8",
    camId: "c01",
    videoUrl: "https://videos.pexels.com/video-files/35223044/14922523_1920_1080_25fps.mp4",
    thumb: "https://images.pexels.com/videos/35223044/pexels-photo-35223044.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
    signal: "TD-018 · exposed spoil",
    score: 0.86,
    latency: 1180,
    description: "Long-timescale terrain compare near the fence detects spoil piles, cleared vegetation and tunnel-dig precursor change.",
  },
  {
    id: "tamper",
    title: "Camera self-tamper / blind",
    short: "Scene integrity",
    model: "IBV-Guard v3.1",
    camId: "c05",
    videoUrl: "https://videos.pexels.com/video-files/14904107/14904107-hd_1920_1080_30fps.mp4",
    thumb: "https://images.pexels.com/videos/14904107/designed-glitching-analog-noise-14904107.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
    signal: "TAMPER-07 · cover / blank",
    score: 0.98,
    latency: 420,
    description: "Detects sudden blank, lens cover, defocus, signal interference and camera re-aim through scene-integrity telemetry.",
  },
] as const;

export const CAM_BY_ID = Object.fromEntries(CAMERAS.map((c) => [c.id, c])) as Record<string, Camera>;

export type Site = {
  id: string;
  name: string;
  sector: string;
  lat: string;
  long: string;
  cams: number;
  online: number;
  uptime: number;
  bandwidth: number;
  gpu: string;
  coverage: number;
  mode: "Edge + Core" | "Core only" | "Edge only";
  events24: number;
  queue: number;
};

export const SITES: Site[] = [
  { id: "bop07", name: "BOP-07 · Harpal", sector: "Sector 4", lat: "31.7698° N", long: "74.9012° E", cams: 14, online: 13, uptime: 99.4, bandwidth: 62, gpu: "Jetson Orin NX ×2", coverage: 92, mode: "Edge + Core", events24: 218, queue: 0 },
  { id: "bop03", name: "BOP-03 · Ampharia", sector: "Sector 2", lat: "31.5421° N", long: "74.6612° E", cams: 11, online: 9, uptime: 97.1, bandwidth: 48, gpu: "Jetson Orin NX ×2", coverage: 78, mode: "Edge only", events24: 341, queue: 6 },
  { id: "chk12", name: "Check Post 12 · GT Reach", sector: "Sector 7", lat: "31.3120° N", long: "75.5740° E", cams: 8, online: 8, uptime: 99.9, bandwidth: 71, gpu: "A2 ×1 (core)", coverage: 96, mode: "Core only", events24: 1204, queue: 0 },
  { id: "bop21", name: "BOP-21 · Basantar", sector: "Sector 9", lat: "31.6180° N", long: "74.5290° E", cams: 12, online: 12, uptime: 98.8, bandwidth: 55, gpu: "Jetson AGC ×3", coverage: 88, mode: "Edge + Core", events24: 187, queue: 1 },
  { id: "bop11", name: "BOP-11 · Dhottra", sector: "Sector 2", lat: "31.4402° N", long: "74.4180° E", cams: 9, online: 7, uptime: 94.2, bandwidth: 39, gpu: "Jetson Orin Nano ×2", coverage: 71, mode: "Edge only", events24: 129, queue: 14 },
  { id: "bop05", name: "BOP-05 · Bargi", sector: "Sector 9", lat: "31.6905° N", long: "74.7511° E", cams: 7, online: 7, uptime: 99.1, bandwidth: 33, gpu: "Jetson Orin NX ×1", coverage: 84, mode: "Edge + Core", events24: 96, queue: 0 },
  { id: "chk04", name: "Check Post 04 · Zero Point", sector: "Sector 4", lat: "31.6024° N", long: "74.6501° E", cams: 6, online: 6, uptime: 99.7, bandwidth: 41, gpu: "A2 ×1 (core)", coverage: 90, mode: "Core only", events24: 733, queue: 0 },
];

export type EventType =
  | "Intrusion"
  | "Loitering"
  | "Fence crossing"
  | "ANPR watchlist"
  | "Face watchlist"
  | "Unattended object"
  | "Night movement"
  | "Crowd surge"
  | "Wrong direction"
  | "Tailgating"
  | "Drone / UAS"
  | "Payload drop"
  | "Ground disturbance"
  | "Camera tamper";

export type Severity = "critical" | "high" | "medium" | "low";

export type EventLog = {
  id: string;
  t: number;
  type: EventType;
  sev: Severity;
  cam: string;
  site: string;
  conf: number;
  status: "new" | "ack" | "dispatched" | "closed" | "false-positive";
  summary: string;
  track: string;
  evidence: string;
  zone?: string;
  subject?: string;
  x?: number;
  y?: number;
};

const now = Date.now();

export const SEED_EVENTS: EventLog[] = [
  { id: "E-84216", t: now - 1000 * 55, type: "Payload drop", sev: "critical", cam: "BOP-11 / CAM-06", site: "BOP-11", conf: 0.93, status: "new", summary: "Tracked quad-rotor released a 0.8-1.4 kg payload after 11 s hover. GPS drop ellipse auto-flagged at 31.4408 N, 74.4171 E; QRT route generated.", track: "#UAS-044", evidence: "MP4 · 00:15 + GEOJSON", zone: "DZ-04 · Fence km 13.2", subject: "Quad-rotor UAS · payload released", x: 63, y: 31 },
  { id: "E-84215", t: now - 1000 * 60 * 4, type: "Ground disturbance", sev: "high", cam: "BOP-07 / CAM-01", site: "BOP-07", conf: 0.86, status: "new", summary: "Fourteen-day terrain delta detected 7.8 m² of newly exposed soil and a 2.1 m³ spoil pile within 26 m of the fence. Pattern is consistent with tunnel-dig precursor activity.", track: "#TD-018", evidence: "DELTA · D-14/D-0", zone: "GD-02 · North Reach", subject: "Exposed spoil + cleared vegetation", x: 46, y: 67 },
  { id: "E-84214", t: now - 1000 * 60 * 6, type: "Camera tamper", sev: "critical", cam: "BOP-03 / CAM-01", site: "BOP-03", conf: 0.98, status: "ack", summary: "Scene luminance collapsed 91% in 240 ms while RTSP remained healthy. Edge density and homography checks classify a deliberate lens-cover event, not power loss.", track: "#TAMPER-07", evidence: "MP4 · PRE/POST 00:20", zone: "CAM-01 · Optical axis", subject: "Lens cover / camera blinded", x: 50, y: 50 },
  { id: "E-84213", t: now - 1000 * 60 * 2, type: "Fence crossing", sev: "critical", cam: "BOP-07 / CAM-01", site: "BOP-07", conf: 0.94, status: "new", summary: "Single human subject crossed virtual fence VF-02 moving north→south. Track handoff to CAM-02 pending.", track: "#T-1142", evidence: "MP4 · 00:24", zone: "VF-02 · Fence North", subject: "Person A", x: 62, y: 48 },
  { id: "E-84212", t: now - 1000 * 60 * 7, type: "ANPR watchlist", sev: "high", cam: "CHK-12 / CAM-06", site: "Check Post 12", conf: 0.91, status: "new", summary: "Plate PB08 CB 4417 matched LLOOK-2291 (vehicle reported in smuggling case 118/24). Two occupants detected.", track: "#V-0871", evidence: "MP4 · 00:11", subject: "Tata 407 · White", x: 44, y: 63 },
  { id: "E-84211", t: now - 1000 * 60 * 12, type: "Night movement", sev: "medium", cam: "BOP-05 / CAM-01", site: "BOP-05", conf: 0.78, status: "ack", summary: "Motion cluster of 3 subjects at 210 m from road edge, thermal signature consistent with human gait.", track: "#T-1139", evidence: "MP4 · 00:52", subject: "Party of 3", x: 71, y: 40 },
  { id: "E-84210", t: now - 1000 * 60 * 18, type: "Loitering", sev: "medium", cam: "BOP-21 / CAM-07", site: "BOP-21", conf: 0.83, status: "new", summary: "Subject stationary within 12 m of embankment for 6 min 40 s. Behaviour score 0.71.", track: "#T-1133", evidence: "MP4 · 06:40", zone: "VF-09 · Embankment", subject: "Person B", x: 30, y: 57 },
  { id: "E-84209", t: now - 1000 * 60 * 25, type: "Face watchlist", sev: "critical", cam: "BOP-21 / CAM-02", site: "BOP-21", conf: 0.87, status: "dispatched", summary: "FRS probe matched gallery entry G-4471 at 0.87 cosine similarity. Vehicle gated at standby bay.", track: "#F-0221", evidence: "IMG · 512×512", subject: "Probe 512 px · frontal 12°", x: 52, y: 35 },
  { id: "E-84208", t: now - 1000 * 60 * 31, type: "Unattended object", sev: "low", cam: "CHK-04 / CAM-01", site: "Check Post 04", conf: 0.66, status: "closed", summary: "Baggage object unattended 9 min in market fringe. Cleared by quick reaction team.", track: "#O-3310", evidence: "MP4 · 09:02", subject: "Object 84×112 px", x: 24, y: 70 },
  { id: "E-84207", t: now - 1000 * 60 * 38, type: "Wrong direction", sev: "high", cam: "CHK-12 / CAM-04", site: "Check Post 12", conf: 0.89, status: "false-positive", summary: "Convoy vehicle travelled contraflow on service lane. Auto-flagged, later confirmed as authorised U-turn by BSO.", track: "#V-0860", evidence: "MP4 · 00:33", subject: "Tata 407 · Green", x: 60, y: 68 },
  { id: "E-84206", t: now - 1000 * 60 * 46, type: "Crowd surge", sev: "medium", cam: "CHK-04 / CAM-01", site: "Check Post 04", conf: 0.74, status: "closed", summary: "Density crossed 1.4 subj/m² for 3 min near gate 2. Surge index peaked at 0.81.", track: "#C-0042", evidence: "MP4 · 03:00", subject: "≈ 46 subjects", x: 50, y: 62 },
  { id: "E-84205", t: now - 1000 * 60 * 55, type: "Intrusion", sev: "critical", cam: "BOP-03 / CAM-05", site: "BOP-03", conf: 0.96, status: "closed", summary: "Two subjects entered treeline exclusion polygon. Dropped to shadow at frame 1180; handoff to thermal failed.", track: "#T-1108", evidence: "MP4 · 01:07", zone: "VF-04 · Treeline", subject: "Person C, Person D", x: 66, y: 44 },
  { id: "E-84204", t: now - 1000 * 60 * 63, type: "Tailgating", sev: "medium", cam: "CHK-12 / CAM-06", site: "Check Post 12", conf: 0.81, status: "ack", summary: "Two vehicles entered scan lane with 3.1 m headway; second plate obscured by lead truck.", track: "#V-0868", evidence: "MP4 · 00:19", subject: "Bolero (unplate)", x: 38, y: 66 },
  { id: "E-84203", t: now - 1000 * 60 * 74, type: "ANPR watchlist", sev: "low", cam: "BOP-07 / CAM-02", site: "BOP-07", conf: 0.58, status: "false-positive", summary: "OCR confidence below threshold — plate partially occluded by mud. Operator verified as no-match.", track: "#V-0862", evidence: "IMG · plate crop", subject: "PB07 ·· 1?2?", x: 55, y: 71 },
  { id: "E-84202", t: now - 1000 * 60 * 88, type: "Night movement", sev: "high", cam: "BOP-03 / CAM-01", site: "BOP-03", conf: 0.85, status: "closed", summary: "Four heat signatures traversing nullah bed west→east. QRT patrol 4 logged at 02:41.", track: "#T-1094", evidence: "MP4 · 02:12", subject: "Party of 4", x: 43, y: 52 },
];

export const PLATES = [
  { plate: "PB08 CB 4417", cls: "Light goods truck", colour: "White", site: "Check Post 12", cam: "CHK-12 / CAM-06", dir: "Inbound", speed: 38, conf: 0.94, watch: "Lookout", t: "02:41:08", occ: 2, route: "GT Road → BOP-07", ocr: 0.97, state: "Punjab" },
  { plate: "HR26 DK 9031", cls: "Bolero / SUV", colour: "Silver", site: "BOP-07", cam: "BOP-07 / CAM-02", dir: "Outbound", speed: 22, conf: 0.91, watch: "None", t: "02:38:51", occ: 4, route: "Farm track 3", ocr: 0.95, state: "Haryana" },
  { plate: "PB14 E 7788", cls: "Motorcycle", colour: "Black", site: "BOP-21", cam: "BOP-21 / CAM-02", dir: "Inbound", speed: 44, conf: 0.88, watch: "Interest", t: "02:31:19", occ: 2, route: "Embarkment road", ocr: 0.9, state: "Punjab" },
  { plate: "RJ14 TC 2205", cls: "Passenger car", colour: "Blue", site: "Check Post 04", cam: "CHK-04 / CAM-01", dir: "Static", speed: 0, conf: 0.86, watch: "None", t: "02:24:02", occ: 1, route: "Standby bay 2", ocr: 0.92, state: "Rajasthan" },
  { plate: "PB70 A 0119", cls: "Bus (minibus)", colour: "Yellow", site: "Check Post 12", cam: "CHK-12 / CAM-04", dir: "Outbound", speed: 51, conf: 0.83, watch: "None", t: "02:16:44", occ: 14, route: "Bathinda convoy", ocr: 0.88, state: "Punjab" },
  { plate: "UP21 BG 5560", cls: "Tanker / tanker", colour: "Green", site: "BOP-11", cam: "BOP-11 / CAM-06", dir: "Inbound", speed: 29, conf: 0.79, watch: "Interest", t: "02:09:30", occ: 2, route: "Feeder track", ocr: 0.84, state: "Uttar Pradesh" },
  { plate: "PB01 CK 3312", cls: "Pickup / light", colour: "White", site: "BOP-05", cam: "BOP-05 / CAM-01", dir: "Inbound", speed: 18, conf: 0.74, watch: "Lookout", t: "01:57:12", occ: 3, route: "Night staging", ocr: 0.8, state: "Punjab" },
  { plate: "HR55 D 4402", cls: "Passenger car", colour: "Grey", site: "BOP-03", cam: "BOP-03 / CAM-05", dir: "Outbound", speed: 35, conf: 0.69, watch: "None", t: "01:44:57", occ: 2, route: "Treeline road", ocr: 0.76, state: "Haryana" },
] as const;

export const FACES = [
  { id: "G-4471", label: "Subject of interest", score: 0.87, cam: "BOP-21 / CAM-02", t: "02:26:11", status: "Watchlist match", angle: "Frontal · 12° yaw", quality: 0.81, obs: 7, img: P(34891807, 700) },
  { id: "G-4468", label: "Convoy driver (cleared)", score: 0.92, cam: "CHK-12 / CAM-04", t: "02:21:03", status: "Known · cleared", angle: "3/4 · 27° yaw", quality: 0.88, obs: 21, img: P(15829550, 700) },
  { id: "P-0", label: "Unenrolled probe", score: 0.41, cam: "BOP-07 / CAM-01", t: "02:14:44", status: "No gallery match", angle: "Profile · 62° yaw", quality: 0.52, obs: 2, img: P(30248044, 700) },
  { id: "G-2210", label: "Local resident (whitelist)", score: 0.89, cam: "CHK-04 / CAM-01", t: "02:03:20", status: "Whitelist · farmer", angle: "Frontal · 4° yaw", quality: 0.84, obs: 142, img: P(5918916, 700) },
  { id: "G-3096", label: "Porter, gate 3", score: 0.77, cam: "BOP-07 / CAM-02", t: "01:52:07", status: "Known · low interest", angle: "Frontal · 18° yaw", quality: 0.69, obs: 38, img: P(32712249, 700) },
  { id: "P-1", label: "Unenrolled probe", score: 0.38, cam: "BOP-03 / CAM-05", t: "01:41:55", status: "Quality reject", angle: "Occluded · mask", quality: 0.31, obs: 1, img: P(37210186, 700) },
] as const;

export const MODELS = [
  { id: "detect-s", name: "IBV-Det · small", task: "Person / vehicle detection", size: "12.4 MB", quant: "INT8 · TensorRT", fps: 84, acc: 0.921, device: "Edge (Orin NX)" },
  { id: "detect-m", name: "IBV-Det · medium", task: "Detection + fine classes", size: "41.2 MB", quant: "FP16 · TensorRT", fps: 38, acc: 0.954, device: "Core (A100 slice)" },
  { id: "track", name: "IBV-Track", task: "Multi-object tracking, 96-frame ReID", size: "8.9 MB", quant: "INT8", fps: 120, acc: 0.887, device: "Edge" },
  { id: "anpr", name: "IBV-Plate", task: "ANPR detect + OCR (BHARAT series)", size: "17.6 MB", quant: "FP16", fps: 62, acc: 0.938, device: "Core" },
  { id: "frs", name: "IBV-Face", task: "ArcFace-class embedding, 512-d", size: "64.1 MB", quant: "FP16", fps: 44, acc: 0.962, device: "Core" },
  { id: "fence", name: "IBV-Fence", task: "Tripwire / polygon intrusion logic", size: "—", quant: "CPU rule engine", fps: 240, acc: 0.99, device: "Edge" },
  { id: "night", name: "IBV-Star", task: "Low-light enhancement + gait gate", size: "22.0 MB", quant: "FP16", fps: 26, acc: 0.845, device: "Edge" },
  { id: "behav", name: "IBV-Behav", task: "Loitering, run, fall, unattended", size: "19.7 MB", quant: "INT8", fps: 55, acc: 0.872, device: "Edge + Core" },
  { id: "sky", name: "IBV-Sky", task: "UAS size + trajectory-shape classification / payload drop", size: "28.6 MB", quant: "FP16 + Kalman", fps: 48, acc: 0.931, device: "Edge + Core" },
  { id: "terrain", name: "IBV-Terrain", task: "Long-timescale spoil / vegetation / excavation delta", size: "34.8 MB", quant: "Siamese FP16", fps: 2, acc: 0.884, device: "Core scheduled" },
  { id: "guard", name: "IBV-Guard", task: "Blank, cover, defocus, signal and re-aim integrity", size: "4.2 MB", quant: "CPU + INT8", fps: 25, acc: 0.978, device: "Edge" },
] as const;

export const ENDPOINTS = [
  { name: "Alert stream (push)", proto: "HTTPS Webhook", path: "/api/v1/webhooks/alerts", status: "connected", latency: 42, rate: "1.2k/h", dir: "out" },
  { name: "Event ingest", proto: "gRPC", path: "/ibvap.ingest.v1/Events", status: "connected", latency: 18, rate: "9.4k/h", dir: "in" },
  { name: "C2 situation picture", proto: "MQTT", path: "ibvap/sensor/+/frame", status: "connected", latency: 26, rate: "31k/h", dir: "out" },
  { name: "Watchlist sync", proto: "REST", path: "/api/v1/watchlists", status: "stale", latency: 310, rate: "12/h", dir: "in" },
  { name: "Evidence vault", proto: "S3-compatible", path: "s3://ibvap-evidence/sectors", status: "connected", latency: 64, rate: "480/h", dir: "out" },
  { name: "Existing VMS bridge", proto: "ONVIF Profile S/T", path: "stream://vms-milt-cam-*", status: "connected", latency: 12, rate: "96 streams", dir: "in" },
] as const;

export const ZONE_TEMPLATES = [
  { id: "vf02", name: "VF-02 · Fence North", mode: "Tripwire (bi-directional)", sens: 72, minSize: 14, dwell: 0, enabled: true, hits: 24, cam: "c01" },
  { id: "vf04", name: "VF-04 · Treeline Exclusion", mode: "Intrusion polygon", sens: 84, minSize: 10, dwell: 8, enabled: true, hits: 41, cam: "c06" },
  { id: "vf09", name: "VF-09 · Embankment Loiter", mode: "Loitering", sens: 60, minSize: 18, dwell: 300, enabled: true, hits: 12, cam: "c08" },
  { id: "vf11", name: "VF-11 · Culvert Water Edge", mode: "Intrusion polygon", sens: 55, minSize: 22, dwell: 0, enabled: false, hits: 3, cam: "c05" },
] as const;

export const NIGHT_PRESETS = [
  { id: "starlight", name: "Starlight", bright: 1.55, contrast: 1.22, saturate: 0.35, blur: 0.5, gamma: 1.4, ir: 0.25 },
  { id: "ir", name: "IR monochrome", bright: 1.2, contrast: 1.45, saturate: 0, blur: 0.3, gamma: 1.15, ir: 0.55 },
  { id: "thermal", name: "Thermal fusion", bright: 1.1, contrast: 1.6, saturate: 1.5, blur: 0.8, gamma: 1.0, ir: 0.8 },
  { id: "raw", name: "Raw feed", bright: 1, contrast: 1, saturate: 1, blur: 0, gamma: 1, ir: 0 },
] as const;
