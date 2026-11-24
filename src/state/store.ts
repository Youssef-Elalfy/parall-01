"use client";

import { create } from "zustand";
import type { FeatureId, FinishId, TintId } from "@/lib/i18n/dictionaries";
import type { MaterialId } from "@/lib/animation/shots";

interface ExperienceState {
  finish: FinishId;
  tint: TintId;
  feature: FeatureId;
  /** 0..100 PARALL view amount in the AR comparison */
  arValue: number;
  modelReady: boolean;
  loadProgress: number;
  loadActive: boolean;
  loaderDone: boolean;
  webglFailed: boolean;
  soundOn: boolean;
  /** Design & Materials: sample under inspection (camera + emphasis), null = scroll camera */
  matFocus: MaterialId | null;
  /** scroll position when the focus started (scrolling away releases it) */
  matFocusY: number;
  reducedMotion: boolean;
  setFinish: (f: FinishId) => void;
  setTint: (t: TintId) => void;
  setFeature: (f: FeatureId) => void;
  setArValue: (v: number) => void;
  setModelReady: (v: boolean) => void;
  setLoad: (progress: number, active: boolean) => void;
  setLoaderDone: (v: boolean) => void;
  setWebglFailed: (v: boolean) => void;
  setSoundOn: (v: boolean) => void;
  setMatFocus: (v: MaterialId | null) => void;
  setReducedMotion: (v: boolean) => void;
  resetConfig: () => void;
}

export const useExperience = create<ExperienceState>((set) => ({
  finish: "titanium",
  tint: "clear",
  feature: "context",
  arValue: 68,
  modelReady: false,
  loadProgress: 0,
  loadActive: true,
  loaderDone: false,
  webglFailed: false,
  soundOn: false,
  matFocus: null,
  matFocusY: 0,
  reducedMotion: false,
  setFinish: (finish) => set({ finish }),
  setTint: (tint) => set({ tint }),
  setFeature: (feature) => set({ feature }),
  setArValue: (arValue) => set({ arValue: Math.max(0, Math.min(100, Math.round(arValue))) }),
  setModelReady: (modelReady) => set({ modelReady }),
  setLoad: (loadProgress, loadActive) => set({ loadProgress, loadActive }),
  setLoaderDone: (loaderDone) => set({ loaderDone }),
  setWebglFailed: (webglFailed) => set({ webglFailed }),
  setSoundOn: (soundOn) => set({ soundOn }),
  setMatFocus: (matFocus) => set({ matFocus, matFocusY: typeof window === "undefined" ? 0 : window.scrollY }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  resetConfig: () => set({ finish: "titanium", tint: "clear" }),
}));
