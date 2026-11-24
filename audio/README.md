# PARALL / 01 — soundtrack

**Original work, written for this project.** No samples, loops, presets or third-party music are used. Harmony, voicing, sound design and every DSP block (band-limited wavetable saws, state-variable filters, FM glass, an 8-line feedback-delay-network reverb, mastering) are implemented from scratch in `compose.mjs` and rendered offline with Node. The script is deterministic (seeded), so it produces the same files every run. You may use, change and re-render it freely as part of PARALL / 01.

| File | What | Length |
|---|---|---|
| `public/audio/parall-swell.(webm\|m4a)` | Opening swell: a D-minor pad opening from dark to bright, an airy riser and a low bloom with a single glass strike at 6.1 s, where it hands over to the loop | 9 s |
| `public/audio/parall-loop.(webm\|m4a)` | Main bed: eight 12 s chords (Dm(add9) → Bbmaj7(#11) → Gm9 → A7sus4 → Dm9 → Bb6/9 → Gm(add11) → A(add9)). Detuned saw pads through a slowly breathing filter, a soft sub pulse every 4 s, sparse FM glass shimmers, band-passed air swells, long FDN reverb | 96 s |

**Seamless by construction.** Every sound is an event scheduled inside the loop. Every time-varying parameter is periodic in the loop length. All processing before the master is linear. The release and reverb tails rendered past 96 s are folded back onto the start, so the end flows into the beginning. The page plays it with `AudioBufferSourceNode.loop` (sample-accurate, no gap).

Measured (loop): **-17.2 LUFS** integrated, **-2.0 dBTP** true peak, LRA 2.1 LU.

## Re-render
```bash
node audio/compose.mjs                 # → audio/out/loop.wav, swell.wav (48 kHz / 16-bit)
ffmpeg -i audio/out/loop.wav  -c:a libopus -b:a 112k -vbr on -application audio public/audio/parall-loop.webm
ffmpeg -i audio/out/loop.wav  -c:a aac -b:a 144k -movflags +faststart     public/audio/parall-loop.m4a
ffmpeg -i audio/out/swell.wav -c:a libopus -b:a 112k -vbr on -application audio public/audio/parall-swell.webm
ffmpeg -i audio/out/swell.wav -c:a aac -b:a 144k -movflags +faststart     public/audio/parall-swell.m4a
```
WebM/Opus is primary. AAC (`.m4a`) is the fallback for browsers that don't report WebM/Opus support (Safari before 15); there the engine skips the encoder's start padding when looping.
