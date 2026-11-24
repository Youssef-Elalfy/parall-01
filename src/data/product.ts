import type { FeatureId, FinishId, TintId } from "@/lib/i18n/dictionaries";

export interface FinishSpec {
  id: FinishId;
  swatch: string;
  /** Main brow / temple-front metal */
  frame: { color: string; metalness: number; roughness: number; clearcoat: number; anisotropy: number };
  /** Secondary temple arm metal */
  arm: { color: string; metalness: number; roughness: number };
  /** Soft-touch temple tips */
  tip: string;
  /** Configurator backdrop tone (subtle) */
  stage: string;
}

export interface TintSpec {
  id: TintId;
  swatch: string;
  color: string;
  opacity: number;
  edge: string;
  iridescence: number;
}

export const FINISHES: Record<FinishId, FinishSpec> = {
  titanium: {
    id: "titanium",
    swatch: "linear-gradient(135deg,#f3f4f6 0%,#aeb5bf 45%,#7d848e 100%)",
    frame: { color: "#a3a9b1", metalness: 1, roughness: 0.31, clearcoat: 0, anisotropy: 0.18 },
    arm: { color: "#5c6169", metalness: 1, roughness: 0.4 },
    tip: "#111317",
    stage: "#dfe2e6",
  },
  onyx: {
    id: "onyx",
    swatch: "linear-gradient(135deg,#4a4d54 0%,#1b1d21 55%,#0b0c0e 100%)",
    frame: { color: "#2b2d32", metalness: 0.9, roughness: 0.36, clearcoat: 0.35, anisotropy: 0.15 },
    arm: { color: "#17181b", metalness: 0.9, roughness: 0.4 },
    tip: "#08090b",
    stage: "#c9ccd1",
  },
  frost: {
    id: "frost",
    swatch: "linear-gradient(135deg,#ffffff 0%,#e3e8ee 50%,#b9c3ce 100%)",
    frame: { color: "#e6eaef", metalness: 0.35, roughness: 0.46, clearcoat: 0.3, anisotropy: 0.1 },
    arm: { color: "#c3cbd4", metalness: 0.5, roughness: 0.45 },
    tip: "#9aa3ad",
    stage: "#e9ecef",
  },
};

export const TINTS: Record<TintId, TintSpec> = {
  clear: { id: "clear", swatch: "linear-gradient(135deg,#ffffff,#e8f4f7)", color: "#d7e6ee", opacity: 0.2, edge: "#8FE7FF", iridescence: 0.55 },
  ocean: { id: "ocean", swatch: "linear-gradient(135deg,#bff1ff,#3a8fb3)", color: "#3f9cc4", opacity: 0.42, edge: "#8FE7FF", iridescence: 0.9 },
  ember: { id: "ember", swatch: "linear-gradient(135deg,#ffd0b8,#ff5b43)", color: "#ff7a52", opacity: 0.36, edge: "#FFB199", iridescence: 0.6 },
};

export const FINISH_ORDER: FinishId[] = ["titanium", "onyx", "frost"];
export const TINT_ORDER: TintId[] = ["clear", "ocean", "ember"];
export const FEATURE_ORDER: FeatureId[] = ["context", "translate", "assist", "gesture"];

/** Versioned so the immutable cache header can never serve a stale model. Bump with each export. */
export const MODEL_URL = "/models/parall-01.glb?v=1f2be5df9e";
export const DRACO_PATH = "/draco/";
