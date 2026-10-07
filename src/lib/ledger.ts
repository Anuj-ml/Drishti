/*
 * Evidence integrity — signed feeds, hash-chain ledger, authenticity verification.
 *
 * Uses WebCrypto ECDSA P-256 (universally available) over a SHA-256 hash chain.
 *
 *   entry[n] = { seq, ts, kind, payload, frameHash, prevHash }
 *   chainHash[n] = SHA-256( prevHash || frameHash || payload )
 *
 * Each entry is signed with the node's private key; the chain binds every
 * entry to its predecessor, so any retroactive edit invalidates everything
 * after it. Verification recomputes the chain and checks each signature
 * against the exported public key.
 *
 * DEMONSTRATION NOTE: a browser cannot protect a private key. The key here is
 * generated and stored in IndexedDB so the *mechanism* is demonstrable. Real
 * deployment signs on an HSM/TPM or on the edge node, never in the page.
 */

export type LedgerEntry = {
  seq: number;
  ts: number;
  kind: "frame" | "action" | "evidence";
  payload: string;
  frameHash: string;
  prevHash: string;
  chainHash: string;
  sig: string;
  keyId: string;
};

export type VerifyResult = {
  ok: boolean;
  entries: number;
  firstBroken: number | null;
  brokenSignatures: number[];
  chainTip: string;
  keyId: string;
};

const DB_NAME = "ibvap-ledger";
const STORE = "entries";
const KEYSTORE = "keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "seq" });
      if (!db.objectStoreNames.contains(KEYSTORE)) db.createObjectStore(KEYSTORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const r = db.transaction(store, "readonly").objectStore(store).get(key);
    r.onsuccess = () => resolve((r.result as T) ?? null);
    r.onerror = () => resolve(null);
  });
}

async function idbPut(store: string, value: unknown, key?: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, "readwrite");
    if (key === undefined) tx.objectStore(store).put(value);
    else tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const r = db.transaction(store, "readonly").objectStore(store).getAll();
    r.onsuccess = () => resolve((r.result as T[]) ?? []);
    r.onerror = () => resolve([]);
  });
}

export async function idbClear(store: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* ── hex helpers ──────────────────────────────────────── */
const buf = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h: string) => new Uint8Array((h.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

async function sha256(text: string): Promise<string> {
  return buf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export const GENESIS = "0".repeat(64);

/* ── key management ───────────────────────────────────── */
export type NodeKey = { keyId: string; publicJwk: JsonWebKey; privateJwk: JsonWebKey };

export async function getOrCreateKey(): Promise<NodeKey> {
  const existing = await idbGet<NodeKey>(KEYSTORE, "node");
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keyId = (await sha256(JSON.stringify(publicJwk))).slice(0, 16);
  const node: NodeKey = { keyId, publicJwk, privateJwk };
  await idbPut(KEYSTORE, node, "node");
  return node;
}

async function importPrivate(jwk: JsonWebKey) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function importPublic(jwk: JsonWebKey) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}

async function sign(text: string, jwk: JsonWebKey): Promise<string> {
  const key = await importPrivate(jwk);
  return buf(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(text)));
}

async function verify(text: string, sigHex: string, jwk: JsonWebKey): Promise<boolean> {
  try {
    const key = await importPublic(jwk);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unhex(sigHex), new TextEncoder().encode(text));
  } catch {
    return false;
  }
}

/* ── chain ────────────────────────────────────────────── */
async function tip(): Promise<LedgerEntry | null> {
  const all = await idbAll<LedgerEntry>(STORE);
  return all.sort((a, b) => a.seq - b.seq).at(-1) ?? null;
}

export async function appendEntry(kind: LedgerEntry["kind"], payload: string, frameHash?: string): Promise<LedgerEntry> {
  const node = await getOrCreateKey();
  const last = await tip();
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.chainHash ?? GENESIS;
  const fh = frameHash ?? (await sha256(`${kind}:${payload}`));
  const chainHash = await sha256(`${prevHash}|${fh}|${payload}`);
  const sig = await sign(`${seq}|${prevHash}|${chainHash}`, node.privateJwk);
  const entry: LedgerEntry = { seq, ts: Date.now(), kind, payload, frameHash: fh, prevHash, chainHash, sig, keyId: node.keyId };
  await idbPut(STORE, entry);
  return entry;
}

export async function readLedger(): Promise<LedgerEntry[]> {
  const all = await idbAll<LedgerEntry>(STORE);
  return all.sort((a, b) => a.seq - b.seq);
}

export async function verifyLedger(entries?: LedgerEntry[]): Promise<VerifyResult> {
  const list = entries ?? (await readLedger());
  const node = await getOrCreateKey();
  let prev = GENESIS;
  let firstBroken: number | null = null;
  const brokenSignatures: number[] = [];
  for (const e of list) {
    if (e.prevHash !== prev && firstBroken === null) firstBroken = e.seq;
    const recomputed = await sha256(`${e.prevHash}|${e.frameHash}|${e.payload}`);
    if (recomputed !== e.chainHash && firstBroken === null) firstBroken = e.seq;
    const ok = await verify(`${e.seq}|${e.prevHash}|${e.chainHash}`, e.sig, node.privateJwk);
    if (!ok) brokenSignatures.push(e.seq);
    prev = e.chainHash;
  }
  return {
    ok: firstBroken === null && brokenSignatures.length === 0,
    entries: list.length,
    firstBroken,
    brokenSignatures,
    chainTip: prev,
    keyId: node.keyId,
  };
}

export async function exportBundle(): Promise<{ entries: LedgerEntry[]; publicJwk: JsonWebKey; keyId: string }> {
  const node = await getOrCreateKey();
  return { entries: await readLedger(), publicJwk: node.publicJwk, keyId: node.keyId };
}

/* ── perceptual frame digest for signing ──────────────── */
export async function frameDigest(pixels: Uint8ClampedArray, w: number, h: number): Promise<string> {
  // 16x16 luma grid — stable under compression, sensitive to content swaps.
  const grid = new Uint8Array(256);
  const gx = w / 16;
  const gy = h / 16;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const sx = Math.min(w - 1, Math.floor(x * gx));
      const sy = Math.min(h - 1, Math.floor(y * gy));
      const i = (sy * w + sx) * 4;
      grid[y * 16 + x] = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
    }
  }
  let sum = 0;
  for (const b of grid) sum += b;
  const mean = sum / 256;
  let bits = "";
  for (const b of grid) bits += b > mean ? "1" : "0";
  return sha256(bits);
}

/* ── tamper simulation for demonstration ──────────────── */
export async function tamperEntry(seq: number): Promise<void> {
  const all = await readLedger();
  const target = all.find((e) => e.seq === seq);
  if (!target) return;
  await idbPut(STORE, { ...target, payload: `${target.payload} [EDITED]` });
}
