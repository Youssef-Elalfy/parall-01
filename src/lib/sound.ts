/**
 * PARALL / 01 audio engine.
 *
 * Music: an original soundtrack rendered offline (audio/compose.mjs → public/audio):
 *  - `parall-swell` — 9 s opening swell, played once on Enter;
 *  - `parall-loop`  — 96 s loop, built to repeat with no seam; played by an
 *    AudioBufferSourceNode with `loop = true`, which is sample-accurate (no gap,
 *    unlike <audio loop>).
 * Files are fetched in the background from page load and decoded with an
 * OfflineAudioContext, so no AudioContext exists — and nothing can sound — until
 * the visitor's own click (`startSoundtrack`). If decoding is still running at that
 * moment, playback begins as soon as it finishes.
 *
 * One graph, one loop source for the whole visit: muting fades out and suspends the
 * context (time freezes), unmuting resumes and fades back in. Sections, locale
 * switches and scrolling never touch the sources, so the music never restarts.
 * Hidden tabs fade out and suspend; returning resumes only if sound was on.
 */
type Listener = (on: boolean) => void;

const MUSIC_LEVEL = 0.72;
const FADE_IN = 3.2;
const FADE_OUT = 0.6;
const SWELL_ARRIVAL = 6.1; // s into the swell where it lands on the loop's first chord

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: GainNode | null = null;
let fx: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let loopSrc: AudioBufferSourceNode | null = null;
let started = false; // music sources created (once per visit)
let wantOn = false; // the visitor's choice
let running = false; // audible right now
let hiddenPaused = false;
let suspendTimer = 0;
const listeners = new Set<Listener>();

let buffers: Promise<{ loop: AudioBuffer; swell: AudioBuffer } | null> | null = null;

function pickFormat(): "webm" | "m4a" {
  const a = document.createElement("audio");
  return a.canPlayType('audio/webm; codecs="opus"') ? "webm" : "m4a";
}

/** background fetch + off-main-thread decode; safe to call many times */
export function prefetchSoundtrack(): void {
  if (typeof window === "undefined" || buffers) return;
  const ext = pickFormat();
  const decoder = new OfflineAudioContext(2, 1, 48000);
  const load = (name: string) =>
    fetch(`/audio/parall-${name}.${ext}`, { priority: "low" } as RequestInit)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => decoder.decodeAudioData(b));
  buffers = Promise.all([load("loop"), load("swell")])
    .then(([loop, swell]) => ({ loop, swell }))
    .catch(() => null);
}

function emit() {
  listeners.forEach((l) => l(running));
}

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: "playback" });
  master = ctx.createGain();
  master.gain.value = 0;
  music = ctx.createGain();
  music.gain.value = MUSIC_LEVEL;
  fx = ctx.createGain();
  fx.gain.value = 0.5;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  music.connect(master);
  fx.connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);
  return ctx;
}

function ramp(param: AudioParam, to: number, seconds: number) {
  const c = ctx;
  if (!c) return;
  const now = c.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(to, now + seconds);
}

async function beginMusic(c: AudioContext) {
  if (started || !music) return;
  started = true;
  prefetchSoundtrack();
  const b = await buffers;
  if (!b || !music || !ctx) return;
  const t = c.currentTime + 0.05;
  // swell, then the loop entering under its arrival, softly crossfaded
  const swell = c.createBufferSource();
  swell.buffer = b.swell;
  swell.connect(music);
  swell.start(t);
  const loopGain = c.createGain();
  loopGain.gain.setValueAtTime(0, t + SWELL_ARRIVAL - 0.6);
  loopGain.gain.linearRampToValueAtTime(1, t + SWELL_ARRIVAL + 2.2);
  loopGain.connect(music);
  const loop = c.createBufferSource();
  loop.buffer = b.loop;
  loop.loop = true;
  // AAC carries encoder priming at the start; Opus pre-skip is removed by the decoder
  const extra = b.loop.duration - 96;
  if (extra > 0.001 && extra < 0.2) {
    loop.loopStart = extra;
    loop.loopEnd = b.loop.duration;
  }
  loop.connect(loopGain);
  loop.start(t + SWELL_ARRIVAL - 0.6, loop.loopStart || 0);
  loopSrc = loop;
}

/**
 * Turn sound on. MUST be called from a user gesture (click / key).
 * Resolves true when the context is running; the page works the same either way.
 */
export async function startSoundtrack(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  wantOn = true;
  const c = getContext();
  if (!c || !master) return false;
  window.clearTimeout(suspendTimer);
  try {
    if (c.state !== "running") await c.resume();
  } catch {
    return false;
  }
  void beginMusic(c);
  ramp(master.gain, 1, started && loopSrc ? 1.2 : FADE_IN);
  running = c.state === "running";
  emit();
  return running;
}

/** Mute: fade out, then suspend (keeps the position; nothing restarts on unmute). */
export function stopSoundtrack(): void {
  wantOn = false;
  fadeAndSuspend();
}

function fadeAndSuspend() {
  const c = ctx;
  running = false;
  emit();
  if (!c || !master) return;
  ramp(master.gain, 0, FADE_OUT);
  window.clearTimeout(suspendTimer);
  suspendTimer = window.setTimeout(() => {
    if (!running && c.state === "running") void c.suspend();
  }, FADE_OUT * 1000 + 80);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (running) {
        hiddenPaused = true;
        fadeAndSuspend();
      }
    } else if (hiddenPaused && wantOn) {
      hiddenPaused = false;
      void startSoundtrack();
    }
  });
  window.addEventListener("pagehide", () => {
    if (running) fadeAndSuspend();
  });
}

export const startAmbient = startSoundtrack;
export const stopAmbient = stopSoundtrack;

export function isSoundOn(): boolean {
  return running;
}

export function onSoundChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Short glassy UI tick, only while sound is on; quiet, through the fx bus. */
export function tick(pitch = 1): void {
  const c = ctx;
  if (!c || !fx || !running) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const m = c.createOscillator();
  const mg = c.createGain();
  const g = c.createGain();
  const f = 1318.5 * pitch;
  o.frequency.value = f;
  m.frequency.value = f * 3.5;
  mg.gain.setValueAtTime(f * 1.2, t);
  mg.gain.exponentialRampToValueAtTime(1, t + 0.25);
  m.connect(mg).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g).connect(fx);
  o.start(t);
  m.start(t);
  o.stop(t + 0.5);
  m.stop(t + 0.5);
}

/** Dev/QA probe: output peak (0..1) after the master gain. */
export function measureLevel(): number {
  if (!analyser) return 0;
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  return peak;
}

declare global {
  interface Window {
    /** dev-only QA probe for the audio engine */
    __parallSound?: {
      measureLevel: () => number;
      isSoundOn: () => boolean;
      state: () => string;
      info: () => { started: boolean; loop: boolean; loopDuration: number | null; contexts: number };
    };
  }
}
if (typeof window !== "undefined") {
  prefetchSoundtrack();
  if (process.env.NODE_ENV !== "production") {
    window.__parallSound = {
      measureLevel,
      isSoundOn,
      state: () => ctx?.state ?? "none",
      info: () => ({ started, loop: !!loopSrc, loopDuration: loopSrc?.buffer?.duration ?? null, contexts: ctx ? 1 : 0 }),
    };
  }
}
