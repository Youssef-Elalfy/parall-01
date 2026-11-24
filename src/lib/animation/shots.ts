/**
 * Shot list for the persistent product camera.
 *
 * Shots are authored as *screen compositions*, not world coordinates:
 *  - `at`    where the shot's focus point sits on screen (x, y in −1…1, y up)
 *  - `w`     product width as a fraction of the viewport WIDTH …
 *  - `hMax`  … capped as a fraction of the viewport HEIGHT
 * so the same composition holds on 16:9, ultra-wide 2.3:1 and 9:19.5 phones.
 * A camera-relative solve turns a composition into a Pose for the current
 * aspect. Zero-height `[data-shot]` markers in the DOM say where in the scroll
 * each composition is reached; between markers poses interpolate, so scrolling
 * up replays the film in reverse. One source of truth, no per-frame React state.
 */

export type Vec3 = [number, number, number];

export interface Pose {
  pos: Vec3;
  rot: Vec3;
  scale: number;
  /** 0 = assembled, 1 = exploded view */
  explode: number;
  /** 0 = temples open, 1 = folded */
  fold: number;
  /** idle float amount */
  float: number;
  /** 1 = configurator orbit active */
  interactive: number;
  /** 0 = model hidden (covered by full-bleed scenes) */
  vis: number;
  /** emissive boost for lens edge / LEDs */
  glow: number;
  /** 0..1 contact shadow on the ground beneath the product (ivory studio shots) */
  floor: number;
}

export type ShotName =
  | "intro"
  | "hero"
  | "reveal-front"
  | "reveal-explode"
  | "reveal-macro"
  | "intel-a"
  | "intel-b"
  | "portal"
  | "ar"
  | "shift"
  | "materials-side"
  | "materials-hinge"
  | "materials-front"
  | "config"
  | "finale";

export interface Composition {
  at: [number, number];
  w: number;
  hMax: number;
  rot: Vec3;
  /** model-local point (glTF: +X right, +Y up, +Z front) placed at `at` */
  focus?: Vec3;
  /** depth of the focus point in world units (camera at z = 5) */
  z?: number;
  explode?: number;
  fold?: number;
  float?: number;
  interactive?: number;
  vis?: number;
  glow?: number;
  floor?: number;
  /** mirror the yaw in RTL (default true). Off for detail shots that must show one specific side. */
  rtlRot?: boolean;
}

interface ShotDef {
  desktop: Composition;
  /** portrait phones / tablets (aspect < 0.95) */
  mobile?: Partial<Composition>;
}

/** Camera constants (must match ProductCanvas) */
export const CAMERA_Z = 5;
export const CAMERA_FOV = 30;
/** Model width in world units at scale 1 (141.4 mm × 0.01) */
const MODEL_W = 1.414;

// Useful model-local points (glTF space)
const FRONT_C: Vec3 = [0, 0.03, -0.3]; // a little behind the lenses: balances 3/4 views with temples
const LENS_L: Vec3 = [-0.365, 0.0, 0.02];
const CAMERA: Vec3 = [-0.663, 0.189, -0.095];
const SIDE_C: Vec3 = [0, 0, -0.6]; // middle of the side profile (lenses → temple tips)
const MID_C: Vec3 = [0, 0.02, -0.5]; // middle of the whole frame incl. temples: centres 3/4 views as one object

export const SHOTS: Record<ShotName, ShotDef> = {
  // Desktop text lives in the inline-start column (≤ ~46 % of the width); the
  // product owns the other side. RTL mirrors `at` (and the yaw, see resolvePose).
  intro: { desktop: { at: [0.2, 0.34], w: 0.28, hMax: 0.5, z: -3, rot: [0.55, 2.2, -0.25], fold: 1, glow: 1.4, focus: FRONT_C }, mobile: { at: [0, 0.4], w: 0.6, hMax: 0.34 } },
  // hero: product above the full-width title, never crossing it
  hero: { desktop: { at: [0.2, 0.3], w: 0.42, hMax: 0.7, rot: [0.14, 0.62, -0.03], float: 1, glow: 0.9, focus: FRONT_C }, mobile: { at: [0.12, 0.44], w: 0.72, hMax: 0.36 } },
  "reveal-front": { desktop: { at: [0.36, -0.12], w: 0.46, hMax: 0.94, rot: [0.04, 0, 0], glow: 0.3, focus: [0, 0.03, 0] }, mobile: { at: [0, -0.22], w: 0.86, hMax: 0.5 } },
  "reveal-explode": { desktop: { at: [0, 0.04], w: 0.25, hMax: 0.48, rot: [0.42, 0.7, 0.02], explode: 1, glow: 0.6, focus: [0, 0.0, -0.55] }, mobile: { at: [-0.04, 0.08], w: 0.38, hMax: 0.26 } },
  // macro: the camera module as the hero detail, framed, not a wall of metal
  "reveal-macro": { desktop: { at: [0.36, 0.12], w: 0.7, hMax: 1.24, rot: [0.16, 0.86, 0], glow: 0.8, focus: CAMERA, rtlRot: false }, mobile: { at: [0.02, 0.3], w: 0.98, hMax: 0.62 } },
  "intel-a": { desktop: { at: [0.46, -0.02], w: 0.4, hMax: 0.78, rot: [0.08, -0.32, 0], glow: 1.2, focus: FRONT_C }, mobile: { at: [0, 0.16], w: 0.84, hMax: 0.38, rot: [0.06, -0.3, 0] } },
  "intel-b": { desktop: { at: [0.45, 0.0], w: 0.42, hMax: 0.82, rot: [0.12, -0.12, 0], glow: 1.2, focus: FRONT_C }, mobile: { at: [0, 0.16], w: 0.86, hMax: 0.4, rot: [0.1, -0.12, 0] } },
  portal: { desktop: { at: [0, 0], w: 99, hMax: 3.4, z: 1.2, rot: [0, 0, 0], glow: 1.8, focus: LENS_L, rtlRot: false }, mobile: { at: [0, 0.05], hMax: 3.0 } },
  ar: { desktop: { at: [0, 0], w: 99, hMax: 4.6, z: 1.6, rot: [0, 0, 0], vis: 0, glow: 1.8, focus: LENS_L, rtlRot: false } },
  shift: { desktop: { at: [0, 0], w: 0.3, hMax: 0.5, z: -6, rot: [0.3, 2.4, 0], vis: 0, focus: FRONT_C } },
  "materials-side": { desktop: { at: [0.42, 0.06], w: 0.36, hMax: 0.62, rot: [0.06, 1.5708, 0], glow: 0.4, focus: SIDE_C, floor: 1 }, mobile: { at: [0.12, 0.0], w: 0.5, hMax: 0.28 } },
  "materials-hinge": { desktop: { at: [-0.32, 0.08], w: 0.34, hMax: 0.58, rot: [0.2, 0.78, 0.02], glow: 0.7, focus: MID_C, floor: 1 }, mobile: { at: [0, 0.24], w: 0.46, hMax: 0.28 } },
  "materials-front": { desktop: { at: [-0.38, 0.08], w: 0.34, hMax: 0.58, rot: [0.14, 0.52, 0], glow: 0.4, focus: MID_C, floor: 1 }, mobile: { at: [0, 0.24], w: 0.54, hMax: 0.3 } },
  config: { desktop: { at: [0.32, 0.06], w: 0.34, hMax: 0.6, rot: [0.18, -0.62, 0], interactive: 1, glow: 0.8, focus: FRONT_C, floor: 1 }, mobile: { at: [0, 0.4], w: 0.5, hMax: 0.26, focus: MID_C } },
  // finale: product above the closing line, centred
  finale: { desktop: { at: [0, 0.22], w: 0.36, hMax: 0.64, rot: [0.12, 0.5, -0.02], float: 1, glow: 1, focus: FRONT_C }, mobile: { at: [0.06, 0.34], w: 0.74, hMax: 0.38 } },
};

/** v' = Rx · Ry · Rz · v (three.js Euler order "XYZ") */
function rotateXYZ(v: Vec3, r: Vec3): Vec3 {
  const [x, y, z] = v;
  const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z;
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
  const x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
  return [x2, y2 * cx - z2 * sx, y2 * sx + z2 * cx];
}

const poseCache = new Map<string, Pose>();

/** Solve a composition into a world pose for the current viewport aspect. */
export function solveComposition(c: Composition, aspect: number, rtl = false): Pose {
  // RTL: text columns flip to the other side, so the product does too.
  const at: [number, number] = rtl ? [-c.at[0], c.at[1]] : c.at;
  const rot: Vec3 = rtl && c.rtlRot !== false ? [c.rot[0], -c.rot[1], -c.rot[2]] : c.rot;
  const focus: Vec3 = c.focus ?? [0, 0, 0];
  const fLocal: Vec3 = rtl && c.rtlRot !== false ? [-focus[0], focus[1], focus[2]] : focus;
  const z = c.z ?? 0;
  const halfH = (CAMERA_Z - z) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
  const halfW = halfH * aspect;
  const width = Math.min(c.w * 2 * halfW, c.hMax * 2 * halfH);
  const scale = width / MODEL_W;
  const f = rotateXYZ(fLocal, rot);
  return {
    pos: [at[0] * halfW - f[0] * scale, at[1] * halfH - f[1] * scale, z - f[2] * scale],
    rot,
    scale,
    explode: c.explode ?? 0,
    fold: c.fold ?? 0,
    float: c.float ?? 0,
    interactive: c.interactive ?? 0,
    vis: c.vis ?? 1,
    glow: c.glow ?? 0.5,
    floor: c.floor ?? 0,
  };
}

export function resolvePose(name: ShotName, aspect: number, rtl = false): Pose {
  const key = `${name}|${aspect.toFixed(3)}|${rtl ? 1 : 0}`;
  const hit = poseCache.get(key);
  if (hit) return hit;
  const def = SHOTS[name];
  const c: Composition = aspect < 0.95 ? { ...def.desktop, ...(def.mobile ?? {}) } : def.desktop;
  const pose = solveComposition(c, aspect, rtl);
  if (poseCache.size > 256) poseCache.clear();
  poseCache.set(key, pose);
  return pose;
}

/* ---- material exploration (Design & Materials) ----
 * Each sample frames its real component. The focus point is the component's measured
 * position in the model (published by the rig), so the camera lands on the actual part.
 * Desktop: the component sits in the product zone (inline-start), the text keeps its column. */
export type MaterialId = "titanium" | "composite" | "glass" | "light";
export const MATERIAL_PART = { titanium: "frame", composite: "tip", glass: "lensHud", light: "led" } as const;
/** the part the camera actually frames in RTL (the composition mirrors the model) */
export const MATERIAL_PART_RTL = { titanium: "frameR", composite: "tipR", glass: "lensHudR", light: "ledR" } as const;
type FocusDef = { desktop: Omit<Composition, "focus">; mobile: Partial<Composition> };
export const MATERIAL_FOCUS: Record<MaterialId, FocusDef> = {
  titanium: { desktop: { at: [-0.42, 0.1], w: 0.56, hMax: 0.95, rot: [0.24, 0.5, 0.02], glow: 0.5, floor: 0.6 }, mobile: { at: [0, 0.3], w: 1.1, hMax: 0.55 } },
  composite: { desktop: { at: [-0.12, 0.04], w: 0.95, hMax: 1.6, rot: [0.14, -1.22, 0], glow: 0.4 }, mobile: { at: [0.25, 0.34], w: 1.5, hMax: 0.8 } },
  glass: { desktop: { at: [-0.5, 0.04], w: 0.46, hMax: 0.8, rot: [0.08, 0.36, 0], glow: 0.9, floor: 0.5 }, mobile: { at: [-0.1, 0.3], w: 1.05, hMax: 0.5 } },
  light: { desktop: { at: [-0.68, 0.08], w: 0.3, hMax: 0.52, rot: [0.14, -1.22, 0], glow: 1.6, floor: 0.5 }, mobile: { at: [-0.3, 0.38], w: 0.9, hMax: 0.46, rot: [0.12, -1.22, 0] } },
};

export function resolveFocusPose(id: MaterialId, focus: Vec3, aspect: number, rtl: boolean): Pose {
  const d = MATERIAL_FOCUS[id];
  const c: Composition = { ...d.desktop, ...(aspect < 0.95 ? d.mobile : {}), focus };
  return solveComposition(c, aspect, rtl);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    pos: [lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t)],
    rot: [lerp(a.rot[0], b.rot[0], t), lerp(a.rot[1], b.rot[1], t), lerp(a.rot[2], b.rot[2], t)],
    scale: lerp(a.scale, b.scale, t),
    explode: lerp(a.explode, b.explode, t),
    fold: lerp(a.fold, b.fold, t),
    float: lerp(a.float, b.float, t),
    interactive: lerp(a.interactive, b.interactive, t),
    vis: lerp(a.vis, b.vis, t),
    glow: lerp(a.glow, b.glow, t),
    floor: lerp(a.floor, b.floor, t),
  };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface ShotMark {
  y: number;
  name: ShotName;
}

/**
 * Pose at a document scroll position. Pure function of (marks, scrollY,
 * aspect): the same scroll position always yields the same pose, whichever
 * direction or route led there.
 */
export function samplePose(marks: ShotMark[], scrollY: number, aspect: number, rtl = false): Pose {
  if (marks.length === 0) return resolvePose("hero", aspect, rtl);
  const y = Math.max(0, scrollY);
  if (y <= marks[0].y) return resolvePose(marks[0].name, aspect, rtl);
  for (let i = 0; i < marks.length - 1; i++) {
    const a = marks[i];
    const b = marks[i + 1];
    if (y >= a.y && y < b.y) {
      const t = (y - a.y) / Math.max(1, b.y - a.y);
      return lerpPose(resolvePose(a.name, aspect, rtl), resolvePose(b.name, aspect, rtl), easeInOut(t));
    }
  }
  return resolvePose(marks[marks.length - 1].name, aspect, rtl);
}
