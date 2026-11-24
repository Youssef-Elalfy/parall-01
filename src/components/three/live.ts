/** Damped pose values written by the Director and read by the model rig each frame. */
export const live = {
  explode: 0,
  fold: 0,
  glow: 0.5,
  feature: 0,
  scale: 1.8,
  /** 0 = dark scene, 1 = ivory scene (damped) */
  light: 0,
  /** material exploration: which sample is emphasised, and how much (0..1, damped) */
  focus: null as null | "titanium" | "composite" | "glass" | "light",
  focusW: 0,
};
