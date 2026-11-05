// Recorded takes for table reads: one audio clip per line, stored on this device (IndexedDB).
export interface Take { key: string; project: string; block: string; text: string; type: string; blob: Blob; at: number }

const DB = 'scriptz-takes';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('takes', { keyPath: 'key' }); s.createIndex('project', 'project'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function takesFor(project: string): Promise<Map<string, Take>> {
  try {
    const d = await db();
    const list = await req(d.transaction('takes').objectStore('takes').index('project').getAll(project) as IDBRequest<Take[]>);
    return new Map(list.map((x) => [x.block, x]));
  } catch { return new Map(); }
}

export async function saveTake(t: Omit<Take, 'key' | 'at'>): Promise<Take> {
  const take: Take = { ...t, key: `${t.project}:${t.block}`, at: Date.now() };
  const d = await db();
  await req(d.transaction('takes', 'readwrite').objectStore('takes').put(take));
  return take;
}

export async function deleteTake(project: string, block: string): Promise<void> {
  const d = await db();
  await req(d.transaction('takes', 'readwrite').objectStore('takes').delete(`${project}:${block}`));
}

/** The best format this browser can record. */
export function recordingMime(): string {
  const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
  if (!MR) return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MR.isTypeSupported?.(m)) return m;
  return '';
}

/** Records from the microphone until stop() is called. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; cancel: () => void; level: () => number }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = recordingMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  // Input level for the meter.
  const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!;
  const ac = new AC();
  const an = ac.createAnalyser();
  an.fftSize = 512;
  ac.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  let ended = false;
  const end = () => { if (ended) return; ended = true; stream.getTracks().forEach((tr) => tr.stop()); void ac.close().catch(() => {}); };
  rec.start();
  return {
    level: () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); return m / 128; },
    cancel: () => { if (ended) return; try { if (rec.state !== 'inactive') rec.stop(); } catch { /* already stopped */ } end(); },
    stop: () => new Promise<Blob>((res) => { rec.onstop = () => { end(); res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); }; rec.stop(); }),
  };
}
