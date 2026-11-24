"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Mesh, type Points, type ShaderMaterial } from "three";
import { scrollState } from "@/lib/animation/scrollState";
import { useExperience } from "@/state/store";

/**
 * Intro atmosphere — drawn inside the existing canvas (no second WebGL context),
 * before the product and independently of its loading:
 *  - one full-screen pass: obsidian depth, slow fbm haze, soft light shafts, three
 *    translucent silk ribbons at different depths with a folding metallic sheen;
 *  - ~240 dust motes in 3D (real depth parallax), additive and tiny.
 * Motion is time-driven (no pointer needed); camera drift is two incommensurate
 * slow sines so it never visibly loops. After Enter it eases down to a quiet
 * level that lives behind the hero and dissolves as you scroll out of it.
 */
const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAmount;
uniform vec2 uRes;
uniform vec2 uPointer;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
// translucent ribbon: soft body + a sharp sheen where the silk folds toward the light
float ribbon(vec2 q, float seed, float t, out float sheen) {
  float x = q.x;
  float y0 = 0.5 + 0.17 * sin(x * 1.5 + t * 0.07 + seed * 3.0) + 0.08 * sin(x * 3.4 - t * 0.11 + seed * 7.0);
  y0 += (fbm(vec2(x * 0.7 + seed * 10.0, t * 0.025)) - 0.5) * 0.24;
  float width = 0.03 + 0.055 * (0.5 + 0.5 * sin(x * 2.1 + t * 0.05 + seed * 5.0));
  float d = (q.y - y0) / width;
  float body = exp(-d * d);
  float twist = sin(x * 3.6 + t * 0.085 + seed * 11.0);
  sheen = body * pow(max(0.0, twist), 8.0) * exp(-d * d * 3.0);
  return body * (0.45 + 0.55 * abs(twist));
}
void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = uTime;
  vec2 drift = vec2(sin(t * 0.031) + 0.5 * sin(t * 0.0173), cos(t * 0.023) + 0.5 * cos(t * 0.0127)) * 0.03 + uPointer * 0.012;

  vec3 col = vec3(0.040, 0.050, 0.072);
  // atmospheric haze
  float h = fbm(p * 1.25 + drift * 2.0 + vec2(t * 0.011, -t * 0.007));
  col += vec3(0.060, 0.080, 0.100) * h * h * 1.6;
  // light shafts from the upper right
  vec2 dir = p - vec2(0.62 * aspect, 0.66);
  float ang = atan(dir.y, dir.x);
  float rays = fbm(vec2(ang * 5.5, t * 0.018));
  rays = pow(rays, 3.2);
  col += vec3(0.50, 0.72, 0.82) * rays * smoothstep(1.9, 0.0, length(dir)) * 0.24;
  // silk ribbons, three depths
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float depth = 0.6 + fi * 0.35;
    vec2 q = vec2(uv.x * aspect * 0.55 + drift.x * depth + fi * 0.37, uv.y + drift.y * depth + (fi - 1.0) * 0.13);
    q.y = (q.y - 0.5) * (0.85 + fi * 0.12) + 0.5 + (q.x - 0.8) * (0.16 - fi * 0.13);
    float sh;
    float r = ribbon(q, fi * 1.37, t * (0.8 + fi * 0.25), sh);
    vec3 tint = mix(vec3(0.74, 0.78, 0.82), vec3(0.56, 0.90, 1.0), 0.3 + 0.2 * fi);
    col += tint * r * (0.095 - fi * 0.022);
    col += vec3(0.86, 0.96, 1.0) * sh * (0.22 - fi * 0.055);
  }
  // obsidian vignette + fine grain
  float vig = smoothstep(1.3, 0.2, length(p * vec2(0.85, 1.15)));
  col *= mix(0.5, 1.0, vig);
  col += (hash(uv * uRes + fract(t) * 91.0) - 0.5) * 0.010;
  gl_FragColor = vec4(col * uAmount, uAmount);
}
`;
const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`;

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmount;
uniform float uPx;
attribute float aSeed;
varying float vA;
void main() {
  vec3 p = position;
  // slow 3D drift; each mote on its own phase
  p.x += sin(uTime * 0.05 + aSeed * 6.28) * 0.35;
  p.y += mod(uTime * (0.015 + aSeed * 0.02) + aSeed * 7.0, 4.0) - 2.0;
  p.z += cos(uTime * 0.04 + aSeed * 3.1) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.9 + aSeed * 1.8) * uPx;
  gl_PointSize = size * (5.0 / -mv.z);
  vA = uAmount * (0.25 + 0.55 * fract(aSeed * 13.7)) * smoothstep(9.0, 3.0, -mv.z);
}
`;
const DUST_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(vec3(0.78, 0.9, 1.0) * a * vA, 0.0);
}
`;

/** quiet level kept behind the hero after Enter */
const HERO_LEVEL = 0.42;

export function Atmosphere() {
  const quad = useRef<Mesh>(null);
  const dust = useRef<Points>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const pointer = useRef({ x: 0, y: 0 });
  const level = useRef({ amount: 0, born: -1 });

  const quadUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uAmount: { value: 0 }, uRes: { value: [1, 1] as [number, number] }, uPointer: { value: [0, 0] as [number, number] } }),
    [],
  );
  const dustUniforms = useMemo(() => ({ uTime: { value: 0 }, uAmount: { value: 0 }, uPx: { value: 1 } }), []);
  const dustGeo = useMemo(() => {
    const n = 240;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; // deterministic
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 9;
      pos[i * 3 + 1] = (rnd() - 0.5) * 5;
      pos[i * 3 + 2] = -4 + rnd() * 7.5;
      seed[i] = rnd();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    return g;
  }, []);
  useEffect(() => () => dustGeo.dispose(), [dustGeo]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, dt) => {
    const q = quad.current;
    const d = dust.current;
    if (!q || !d) return;
    const st = useExperience.getState();
    const reduced = st.reducedMotion;
    const now = state.clock.elapsedTime;
    if (level.current.born < 0) level.current.born = now;

    // target level: full while the prologue/Enter screen is up, then the quiet
    // hero level fading out over the first ~90 % of a viewport of scroll
    let target = 1;
    if (st.loaderDone) {
      const fade = 1 - Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.9)));
      target = HERO_LEVEL * fade * fade;
    }
    if (st.webglFailed) target = 0;
    // fade in once on birth (no pop when the shader first compiles), then follow the target
    const born = Math.min(1, (now - level.current.born) / 1.4);
    const k = 1 - Math.exp(-dt * (st.loaderDone ? 1.6 : 3));
    level.current.amount += (target * born - level.current.amount) * k;
    const a = level.current.amount;

    const visible = a > 0.004;
    q.visible = visible;
    d.visible = visible;
    if (!visible) return;
    const time = reduced ? 12 : now; // reduced motion: a still, composed frame
    const qm = q.material as ShaderMaterial;
    qm.uniforms.uTime.value = time;
    qm.uniforms.uAmount.value = a;
    qm.uniforms.uRes.value = [size.width * dpr, size.height * dpr];
    const pk = 1 - Math.exp(-dt * 2);
    const pu = qm.uniforms.uPointer.value as [number, number];
    pu[0] += ((reduced ? 0 : pointer.current.x) - pu[0]) * pk;
    pu[1] += ((reduced ? 0 : pointer.current.y) - pu[1]) * pk;
    const dm = d.material as ShaderMaterial;
    dm.uniforms.uTime.value = time;
    dm.uniforms.uAmount.value = a * (scrollState.introStart === null ? 1 : 0.7);
    dm.uniforms.uPx.value = dpr;
    // restrained camera-like drift of the dust volume
    d.position.set(Math.sin(time * 0.021) * 0.25 + pu[0] * 0.18, Math.cos(time * 0.017) * 0.15 + pu[1] * 0.1, 0);
  });

  return (
    <>
      <mesh ref={quad} frustumCulled={false} renderOrder={-100} visible={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={quadUniforms}
          transparent
          premultipliedAlpha
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <points ref={dust} geometry={dustGeo} frustumCulled={false} renderOrder={-99} visible={false}>
        <shaderMaterial
          vertexShader={DUST_VERT}
          fragmentShader={DUST_FRAG}
          uniforms={dustUniforms}
          transparent
          premultipliedAlpha
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </>
  );
}
