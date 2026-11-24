/**
 * Bridge between the WebGL product and DOM overlays.
 *  - registry: DOM elements that follow one projected 3D point (CSS vars --ax / --ay)
 *  - projected: latest screen position of every anchor point (written each frame)
 *  - productRect: the product's projected screen bounds (written each frame)
 *  - explode: damped exploded-view amount (0..1)
 * Overlays that need layout (exploded-view callouts, material focus) read these in
 * their own rAF loop — no React state per frame.
 */
export type AnchorKey =
  | "frame"
  | "lens"
  | "hinge"
  | "camera"
  | "module"
  | "lensHud"
  | "tip"
  | "led"
  // mirrored counterparts (RTL frames the other side of the symmetric product)
  | "frameR"
  | "lensHudR"
  | "tipR"
  | "ledR";

const registry = new Map<AnchorKey, Set<HTMLElement>>();

export const projected = new Map<AnchorKey, { x: number; y: number }>();
/** anchor points in the model's own (glTF root) space, assembled state — measured once */
export const partLocal = new Map<AnchorKey, [number, number, number]>();
export const productFrame: {
  rect: { left: number; top: number; right: number; bottom: number } | null;
  explode: number;
  /** css-pixel size of the canvas */
  w: number;
  h: number;
} = { rect: null, explode: 0, w: 0, h: 0 };

export function registerAnchor(key: AnchorKey, el: HTMLElement): () => void {
  let set = registry.get(key);
  if (!set) {
    set = new Set();
    registry.set(key, set);
  }
  set.add(el);
  return () => {
    set?.delete(el);
  };
}

export function anchorTargets(): Map<AnchorKey, Set<HTMLElement>> {
  return registry;
}
