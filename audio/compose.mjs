/**
 * PARALL / 01 — original soundtrack, composed and rendered offline.
 *
 *   node audio/compose.mjs            → audio/out/{loop,swell}.wav
 *   (then audio/master.ps1 / the ffmpeg lines in README encode to Opus + AAC in public/audio)
 *
 * Everything here is original: harmony, voicing, sound design and DSP are written
 * from scratch (no samples, no third-party music). Deterministic (seeded PRNG), so
 * the same files are produced every run.
 *
 * Seamless loop by construction:
 *  - every sound is an EVENT scheduled inside [0, L) (chords, pulses, bells, air swells);
 *  - every time-varying parameter is periodic in L;
 *  - all processing before the master stage is linear (filters, FDN reverb);
 *  therefore the signal rendered past L (release + reverb tails) is exactly what the
 *  loop's start is missing, and is folded back onto it. The master (soft saturation,
 *  gain) is applied after folding.
 */
import fs from "node:fs";
import path from "node:path";

const SR = 48000;
const L = 96; // loop length (s): 8 chords × 12 s
const TAIL = 14; // s rendered past L and folded back
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "out");
fs.mkdirSync(OUT, { recursive: true });

// ---------- utilities ----------
let seed = 20261124;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** band-limited saw wavetables (one per octave band) */
const TBL = 4096;
const sawTables = [];
for (let band = 0; band < 10; band++) {
  const fBase = 27.5 * Math.pow(2, band); // lowest note this table serves
  const nH = Math.max(1, Math.floor(9000 / (fBase * 2)));
  const tbl = new Float32Array(TBL + 1);
  for (let h = 1; h <= nH; h++) {
    const amp = 1 / h; // saw
    for (let i = 0; i <= TBL; i++) tbl[i] += (amp * Math.sin((TAU * h * i) / TBL)) * 0.55;
  }
  sawTables.push(tbl);
}
const tableFor = (f) => sawTables[Math.max(0, Math.min(9, Math.floor(Math.log2(f / 27.5))))];
const SINE = new Float32Array(TBL + 1).map((_, i) => Math.sin((TAU * i) / TBL));
const look = (t, ph) => {
  const x = ph * TBL;
  const i = x | 0;
  return t[i] + (t[i + 1] - t[i]) * (x - i);
};

// buses (stereo), length L + TAIL
const N = Math.ceil((L + TAIL) * SR);
const bus = () => [new Float32Array(N), new Float32Array(N)];
const pads = bus();
const sub = bus();
const bells = bus();
const air = bus();

const panLR = (p) => [Math.cos((p + 1) * Math.PI * 0.25), Math.sin((p + 1) * Math.PI * 0.25)];

// ---------- harmony ----------
// D minor colour. MIDI voicings, low → high.
const CHORDS = [
  [38, 45, 53, 57, 64], // Dm(add9)      D2 A2 F3 A3 E4
  [34, 41, 50, 57, 64], // Bbmaj7(#11)   Bb1 F2 D3 A3 E4
  [31, 38, 46, 53, 57], // Gm9           G1 D2 Bb2 F3 A3
  [33, 40, 50, 55, 59], // A7sus4        A1 E2 D3 G3 B3
  [38, 45, 52, 57, 65], // Dm9 (var.)    D2 A2 E3 A3 F4
  [34, 41, 50, 55, 64], // Bb6/9-ish     Bb1 F2 D3 G3 E4
  [31, 38, 50, 53, 58], // Gm(add11)     G1 D2 D3 F3 Bb3
  [33, 40, 49, 52, 57], // A(add9)/maj   A1 E2 C#3 E3 A3  (lift into the next cycle)
];
const CH = L / CHORDS.length; // 12 s

// ---------- 1. pads: detuned saw stacks, slow attack/release crossfades ----------
for (let c = 0; c < CHORDS.length; c++) {
  const t0 = c * CH;
  const att = 4.5;
  const rel = 7;
  const len = CH + rel;
  CHORDS[c].forEach((m, vi) => {
    const f0 = hz(m);
    const voices = vi === 0 ? 2 : 3;
    for (let v = 0; v < voices; v++) {
      const det = (v - (voices - 1) / 2) * 0.0045 + (rnd() - 0.5) * 0.002;
      const f = f0 * (1 + det);
      const tbl = tableFor(f);
      const pan = (vi / 4 - 0.5) * 1.1 + (v - 1) * 0.35;
      const [gl, gr] = panLR(Math.max(-1, Math.min(1, pan)));
      const level = (vi === 0 ? 0.11 : 0.06 - vi * 0.005) / voices;
      let ph = rnd();
      const inc = f / SR;
      const s0 = Math.floor(t0 * SR);
      const n = Math.floor(len * SR);
      // slow per-voice tremolo (keeps the chord breathing)
      const tremF = 0.05 + rnd() * 0.07;
      const tremPh = rnd() * TAU;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = t < att ? Math.sin((t / att) * Math.PI * 0.5) ** 2 : t < CH ? 1 : Math.cos(((t - CH) / rel) * Math.PI * 0.5) ** 2;
        const trem = 1 - 0.18 * (0.5 + 0.5 * Math.sin(TAU * tremF * t + tremPh));
        const s = look(tbl, ph) * env * trem * level;
        ph += inc;
        if (ph >= 1) ph -= 1;
        const k = s0 + i;
        if (k >= N) break;
        pads[0][k] += s * gl;
        pads[1][k] += s * gr;
      }
    }
  });
}

// ---------- 2. sub pulses: soft heartbeat on the chord root (every 4 s) ----------
for (let t0 = 0; t0 < L; t0 += 4) {
  const c = Math.floor(t0 / CH);
  const f = hz(CHORDS[c][0] - 12 < 28 ? CHORDS[c][0] : CHORDS[c][0] - 12);
  const s0 = Math.floor(t0 * SR);
  const dur = 3.6;
  let ph = 0;
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR;
    const env = (1 - Math.exp(-t / 0.06)) * Math.exp(-t / 0.9);
    // fundamental + a soft 2nd harmonic so small speakers can imply it
    const s = (look(SINE, ph) + 0.35 * look(SINE, (ph * 2) % 1)) * env * 0.075;
    ph += f / SR;
    if (ph >= 1) ph -= 1;
    const k = s0 + i;
    sub[0][k] += s;
    sub[1][k] += s;
  }
}

// ---------- 3. glass shimmer: sparse FM bells from the chord tones ----------
{
  let t = 1.3;
  while (t < L - 0.5) {
    const c = Math.floor(t / CH);
    const tones = CHORDS[c].slice(2);
    const m = tones[Math.floor(rnd() * tones.length)] + (rnd() < 0.55 ? 24 : 36);
    const f = hz(m);
    const s0 = Math.floor(t * SR);
    const dur = 4 + rnd() * 3;
    const [gl, gr] = panLR(rnd() * 1.6 - 0.8);
    const level = 0.032 + rnd() * 0.02;
    let pc = 0;
    let pm = 0;
    for (let i = 0; i < dur * SR; i++) {
      const tt = i / SR;
      const env = (1 - Math.exp(-tt / 0.004)) * Math.exp(-tt / (dur * 0.28));
      const idx = 2.2 * Math.exp(-tt / 0.35); // bright strike, glassy decay
      const s = Math.sin(TAU * pc + idx * Math.sin(TAU * pm)) * env * level;
      pc += f / SR;
      pm += (f * 3.5) / SR;
      const k = s0 + i;
      if (k >= N) break;
      bells[0][k] += s * gl;
      bells[1][k] += s * gr;
    }
    t += 1.6 + rnd() * 3.2;
  }
}

// ---------- 4. air: band-passed noise swells (events, so they loop exactly) ----------
for (let t0 = 0; t0 < L; t0 += 8) {
  const dur = 11;
  const s0 = Math.floor(t0 * SR);
  const centre = 1800 + rnd() * 2600;
  const g = 0.05 + rnd() * 0.025;
  // two independent noise streams → stereo width
  for (let ch = 0; ch < 2; ch++) {
    let low = 0;
    let band = 0;
    const fc = 2 * Math.sin((Math.PI * centre * (ch ? 1.08 : 0.94)) / SR);
    const q = 0.7;
    for (let i = 0; i < dur * SR; i++) {
      const t = i / SR;
      const env = Math.sin((t / dur) * Math.PI) ** 2;
      const x = rnd() * 2 - 1;
      // Chamberlin state-variable band-pass
      low += fc * band;
      const high = x - low - q * band;
      band += fc * high;
      const k = s0 + i;
      if (k >= N) break;
      air[ch][k] += band * env * g;
    }
  }
}

// ---------- pad filter: 2-pole SVF low-pass, cutoff periodic in L ----------
function svfLowpass(buf, cutoffAt, res = 0.55) {
  for (const ch of buf) {
    let low = 0;
    let band = 0;
    for (let i = 0; i < N; i++) {
      const fc = 2 * Math.sin((Math.PI * Math.min(8000, cutoffAt(i / SR))) / SR);
      low += fc * band;
      const high = ch[i] - low - res * band;
      band += fc * high;
      ch[i] = low;
    }
  }
}
// breathes over 24 s and swells on each chord change (period L for every term)
svfLowpass(pads, (t) => {
  const breath = 0.5 + 0.5 * Math.sin((TAU * t) / (L / 4) - 1.2);
  const chordSwell = 0.5 - 0.5 * Math.cos((TAU * ((t % CH) / CH)) * 1);
  return 520 + 900 * breath + 380 * chordSwell;
});

// ---------- FDN reverb (8 lines, Householder feedback, damped) ----------
function fdnReverb(inL, inR, rt60 = 6.5, damp = 0.32) {
  const D = [1559, 1931, 2311, 2713, 3083, 3511, 3907, 4441].map((d) => Math.round(d * (SR / 44100) * 1.25));
  const lines = D.map((d) => ({ buf: new Float32Array(d), i: 0, lp: 0 }));
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  const g = D.map((d) => Math.pow(10, (-3 * d) / (rt60 * SR)));
  const y = new Float32Array(8);
  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let j = 0; j < 8; j++) {
      const ln = lines[j];
      let v = ln.buf[ln.i];
      ln.lp += (v - ln.lp) * (1 - damp); // high-frequency damping
      v = ln.lp * g[j];
      y[j] = v;
      sum += v;
    }
    const h = (2 / 8) * sum;
    const xl = inL[n];
    const xr = inR[n];
    for (let j = 0; j < 8; j++) {
      const ln = lines[j];
      ln.buf[ln.i] = y[j] - h + (j % 2 ? xr : xl) * 0.5;
      ln.i = (ln.i + 1) % ln.buf.length;
    }
    outL[n] = y[0] - y[2] + y[4] - y[6] + 0.5 * (y[1] - y[5]);
    outR[n] = y[1] - y[3] + y[5] - y[7] + 0.5 * (y[2] - y[6]);
  }
  return [outL, outR];
}

const send = [new Float32Array(N), new Float32Array(N)];
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) send[c][i] = pads[c][i] * 0.32 + bells[c][i] * 0.95 + air[c][i] * 0.55;
const [wl, wr] = fdnReverb(send[0], send[1]);

// ---------- mix + fold the tail onto the start ----------
const mix = [new Float32Array(N), new Float32Array(N)];
for (let i = 0; i < N; i++) {
  mix[0][i] = pads[0][i] * 1.15 + sub[0][i] + bells[0][i] * 0.45 + air[0][i] * 0.5 + wl[i] * 0.42;
  mix[1][i] = pads[1][i] * 1.15 + sub[1][i] + bells[1][i] * 0.45 + air[1][i] * 0.5 + wr[i] * 0.42;
}
const LN = Math.round(L * SR);
const loop = [new Float32Array(LN), new Float32Array(LN)];
for (let c = 0; c < 2; c++) {
  for (let i = 0; i < LN; i++) loop[c][i] = mix[c][i];
  for (let i = LN; i < N; i++) loop[c][i - LN] += mix[c][i];
}

// ---------- master: DC/rumble high-pass, gentle tanh glue, normalise ----------
function master(buf, peakDb = -2) {
  for (const ch of buf) {
    // 1-pole high-pass ~ 28 Hz, run twice over the loop so its state is cyclic too
    const a = Math.exp((-TAU * 28) / SR);
    let x1 = 0;
    let y1 = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ch.length; i++) {
        const x = ch[i];
        const y = a * (y1 + x - x1);
        x1 = x;
        y1 = y;
        if (pass === 1) ch[i] = y;
      }
    }
    for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh(ch[i] * 1.6) / 1.6;
  }
  let peak = 0;
  for (const ch of buf) for (const v of ch) peak = Math.max(peak, Math.abs(v));
  const g = Math.pow(10, peakDb / 20) / peak;
  for (const ch of buf) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return g;
}
master(loop);

// ---------- opening swell (one-shot, 9 s): rises into the loop's first chord ----------
const SW = Math.round(9 * SR);
const swell = [new Float32Array(SW), new Float32Array(SW)];
{
  // a) pad on chord 0 opening from dark to bright
  CHORDS[0].forEach((m, vi) => {
    for (let v = 0; v < 3; v++) {
      const f = hz(m) * (1 + (v - 1) * 0.004);
      const tbl = tableFor(f);
      const [gl, gr] = panLR((vi / 4 - 0.5) + (v - 1) * 0.3);
      let ph = rnd();
      for (let i = 0; i < SW; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 6) ** 2 * (t > 7.5 ? Math.cos(((t - 7.5) / 1.5) * Math.PI * 0.5) ** 2 : 1);
        const s = look(tbl, ph) * env * (vi === 0 ? 0.05 : 0.025);
        ph += f / SR;
        if (ph >= 1) ph -= 1;
        swell[0][i] += s * gl;
        swell[1][i] += s * gr;
      }
    }
  });
  // opening filter sweep 250 Hz → 3.2 kHz
  for (const ch of swell) {
    let low = 0;
    let band = 0;
    for (let i = 0; i < SW; i++) {
      const t = i / SR;
      const fc = 2 * Math.sin((Math.PI * (250 + 2950 * Math.min(1, t / 6.2) ** 2)) / SR);
      low += fc * band;
      const high = ch[i] - low - 0.4 * band;
      band += fc * high;
      ch[i] = low;
    }
  }
  // b) airy riser (noise through a rising band-pass)
  for (let c = 0; c < 2; c++) {
    let low = 0;
    let band = 0;
    for (let i = 0; i < SW; i++) {
      const t = i / SR;
      const fc = 2 * Math.sin((Math.PI * (600 + 5400 * Math.min(1, t / 6))) / SR);
      low += fc * band;
      const high = rnd() * 2 - 1 - low - 0.6 * band;
      band += fc * high;
      const env = Math.min(1, t / 6) ** 3 * Math.exp(-Math.max(0, t - 6.1) / 0.35);
      swell[c][i] += band * env * 0.11;
    }
  }
  // c) soft low "bloom" + a single glass strike at the arrival (6.1 s)
  const t0 = Math.round(6.1 * SR);
  let ph = 0;
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < SW - t0; i++) {
    const t = i / SR;
    const envB = (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 1.4);
    const b = (look(SINE, ph) + 0.3 * look(SINE, (ph * 2) % 1)) * envB * 0.2;
    ph += hz(26) / SR;
    if (ph >= 1) ph -= 1;
    const envG = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 1.1);
    const g = Math.sin(TAU * pc + 2 * Math.exp(-t / 0.3) * Math.sin(TAU * pm)) * envG * 0.05;
    pc += hz(88) / SR;
    pm += (hz(88) * 3.5) / SR;
    swell[0][t0 + i] += b + g * 0.8;
    swell[1][t0 + i] += b + g;
  }
  // its own space
  const big = [new Float32Array(N), new Float32Array(N)];
  for (let c = 0; c < 2; c++) big[c].set(swell[c].map((v) => v * 0.6));
  const [rl, rr] = fdnReverb(big[0], big[1], 4.5, 0.28);
  for (let i = 0; i < SW; i++) {
    swell[0][i] += rl[i] * 0.4;
    swell[1][i] += rr[i] * 0.4;
  }
  master(swell, -2.5);
}

// ---------- WAV writer (16-bit PCM) ----------
function wav(file, buf) {
  const n = buf[0].length;
  const b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      // TPDF dither
      const d = (rnd() - rnd()) / 32768;
      b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((buf[c][i] + d) * 32767))), 44 + i * 4 + c * 2);
    }
  }
  fs.writeFileSync(file, b);
}
wav(path.join(OUT, "loop.wav"), loop);
wav(path.join(OUT, "swell.wav"), swell);

// loop-point continuity report (last → first sample, both channels)
const jump = Math.max(Math.abs(loop[0][LN - 1] - loop[0][0]), Math.abs(loop[1][LN - 1] - loop[1][0]));
const typical = (() => {
  let m = 0;
  for (let i = 1000; i < 50000; i++) m = Math.max(m, Math.abs(loop[0][i] - loop[0][i - 1]));
  return m;
})();
console.log(`loop ${L}s, swell 9s @ ${SR} Hz — loop-point step ${jump.toFixed(5)} (largest step in a normal stretch: ${typical.toFixed(5)})`);
