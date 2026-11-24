import { useExperience } from "@/state/store";

/**
 * Honest loading progress. Each phase reports its own real completion and
 * carries a weight; the displayed percentage is the weighted sum. Nothing is
 * faked or eased past work that has not happened: 100 % means the model is
 * decoded, materials are built, fonts are ready AND every shader program the
 * first product frame needs has finished compiling (so the first frame does
 * not stall the main thread).
 */
export type Phase = "assets" | "fonts" | "materials" | "shaders";

const WEIGHTS: Record<Phase, number> = {
  assets: 0.62, // GLB + Draco decoder + textures (loading-manager items)
  fonts: 0.06,
  materials: 0.07, // live materials + tangent frames
  shaders: 0.25, // async (non-blocking) program compile + link
};

const done: Record<Phase, number> = { assets: 0, fonts: 0, materials: 0, shaders: 0 };

export function reportPhase(phase: Phase, fraction: number): void {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= done[phase]) return; // monotonic per phase
  done[phase] = f;
  const total = (Object.keys(WEIGHTS) as Phase[]).reduce((s, k) => s + WEIGHTS[k] * done[k], 0);
  const pct = Math.round(total * 1000) / 10;
  useExperience.getState().setLoad(pct, pct < 100);
  if (done.assets >= 1 && done.fonts >= 1 && done.materials >= 1 && done.shaders >= 1) {
    useExperience.getState().setModelReady(true);
  }
}

if (typeof document !== "undefined") {
  document.fonts?.ready.then(() => reportPhase("fonts", 1));
}
