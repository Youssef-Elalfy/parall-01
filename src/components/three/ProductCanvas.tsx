"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import {
  AgXToneMapping,
  Box3,
  CanvasTexture,
  DefaultLoadingManager,
  MathUtils,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PerspectiveCamera,
} from "three";
import { SmartGlasses } from "./SmartGlasses";
import { Atmosphere } from "./Atmosphere";
import { live } from "./live";
import { partLocal, productFrame } from "./anchors";
import { ensureMarks, scrollState } from "@/lib/animation/scrollState";
import { MATERIAL_PART, lerpPose, resolveFocusPose, resolvePose, samplePose, type MaterialId, type Pose } from "@/lib/animation/shots";
import { useExperience } from "@/state/store";
import { reportPhase } from "@/lib/readiness";

/** Light (ivory) scenes get a bright studio to reflect, dark scenes the dark one. */
function useLightTheme(): boolean {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setLight(root.dataset.theme === "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return light;
}

/** Studio: procedural light-former environment (no HDRI download) + a key and a cyan rim. */
function Studio() {
  const light = useLightTheme();
  return (
    <>
      <ambientLight intensity={0.18} />
      <directionalLight position={[3.5, 4, 5]} intensity={1.3} color="#ffffff" />
      <spotLight position={[-5, 2.5, -3]} angle={0.6} penumbra={0.9} intensity={60} color="#8FE7FF" distance={20} decay={2} />
      <pointLight position={[2.5, -2.5, 3]} intensity={6} color="#ffd9c7" distance={12} decay={2} />
      {/* keyed: re-baked once when the page theme flips (a single 512² cube render) */}
      <Environment key={light ? "light" : "dark"} frames={1} resolution={512}>
        {/* ivory scenes: a mid-grey room (titanium reads silver, not gunmetal) with dark flags
            below for shape definition; dark scenes keep the low-key studio */}
        <color attach="background" args={[light ? "#5f656d" : "#171a20"]} />
        {/* large overhead softbox */}
        <Lightformer form="rect" intensity={2.6} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 3, 1]} />
        {/* front strip catching the brow bevels */}
        <Lightformer form="rect" intensity={2.2} position={[0, 0.6, 6]} scale={[9, 0.6, 1]} />
        {/* soft frontal card for satin titanium */}
        <Lightformer form="rect" intensity={0.9} position={[2, -0.5, 5]} scale={[6, 3, 1]} />
        {/* side strips */}
        <Lightformer form="rect" intensity={2.2} position={[-6, 1, 1]} rotation-y={Math.PI / 2} scale={[6, 1, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[6, 0, -1]} rotation-y={-Math.PI / 2} scale={[6, 0.8, 1]} />
        {/* cyan optical rim */}
        <Lightformer form="rect" color="#8FE7FF" intensity={2.4} position={[-3, -1, -5]} scale={[8, 0.5, 1]} />
        {/* floor: neutral in the dark studio, a soft ivory bounce on light pages */}
        <Lightformer
          form="rect"
          color={light ? "#eceae4" : "#c9ced6"}
          intensity={light ? 0.9 : 0.35}
          position={[0, -5, 1]}
          rotation-x={-Math.PI / 2}
          scale={[10, 4, 1]}
        />
        {light && (
          <>
            <Lightformer form="rect" color="#0b0e14" intensity={1} position={[-5, -1.6, 3]} scale={[4, 2.4, 1]} />
            <Lightformer form="rect" color="#0b0e14" intensity={1} position={[5, -1.6, 3]} scale={[4, 2.4, 1]} />
          </>
        )}
      </Environment>
    </>
  );
}

/** Soft elliptical contact-shadow texture (radial alpha falloff), drawn once. */
function makeShadowTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(11,14,20,1)");
    g.addColorStop(0.35, "rgba(11,14,20,0.62)");
    g.addColorStop(0.7, "rgba(11,14,20,0.18)");
    g.addColorStop(1, "rgba(11,14,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(c);
}
const shadowBox = new Box3();

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const qaBox = new Box3();
const qaV = new Vector3();

/** Samples the shot list from scroll position, damps it and drives the product group. */
function Director({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const cur = useRef<Pose | null>(null);
  const focusId = useRef<MaterialId>("titanium");
  const focusW = useRef(0);
  const [shadowMap] = useState(makeShadowTexture);
  useEffect(() => () => shadowMap.dispose(), [shadowMap]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const reduced = useExperience.getState().reducedMotion;
    const aspect = state.size.width / Math.max(1, state.size.height);
    const rtl = document.documentElement.dir === "rtl";
    ensureMarks();
    // intro is a pure function of time since it started: it can't be left half-done
    // by a killed tween (Strict Mode, HMR, locale switch), which used to freeze a mixed pose.
    if (reduced) scrollState.intro = 1;
    else if (scrollState.introStart !== null) scrollState.intro = Math.min(1, (performance.now() - scrollState.introStart) / 2600);
    let target = samplePose(scrollState.marks, window.scrollY, aspect, rtl);
    if (scrollState.intro < 1) {
      target = lerpPose(resolvePose("intro", aspect, rtl), target, easeInOutCubic(scrollState.intro));
    }
    // Material exploration: blends the scroll pose toward the selected component's
    // framing. Only inside Design & Materials; scrolling away releases it, so the scroll
    // camera is always the source of truth again (blended back, never jumped).
    const st = useExperience.getState();
    const inDesign = document.documentElement.dataset.scene === "design";
    if (st.matFocus && (!inDesign || Math.abs(window.scrollY - st.matFocusY) > window.innerHeight * 0.2)) st.setMatFocus(null);
    if (st.matFocus) focusId.current = st.matFocus;
    focusW.current = MathUtils.damp(focusW.current, st.matFocus ? 1 : 0, reduced ? 30 : 3.2, Math.min(dt, 0.1));
    live.focus = focusW.current > 0.002 ? focusId.current : null;
    live.focusW = focusW.current;
    if (live.focus && focusW.current > 0.002) {
      const pt = partLocal.get(MATERIAL_PART[live.focus]);
      if (pt) target = lerpPose(target, resolveFocusPose(live.focus, pt, aspect, rtl), easeInOutCubic(focusW.current));
    }
    if (!cur.current) cur.current = target;
    const c = cur.current;
    const lambda = reduced ? 30 : 5;
    const d = (a: number, b: number) => MathUtils.damp(a, b, lambda, Math.min(dt, 0.1));
    c.pos = [d(c.pos[0], target.pos[0]), d(c.pos[1], target.pos[1]), d(c.pos[2], target.pos[2])];
    c.rot = [d(c.rot[0], target.rot[0]), d(c.rot[1], target.rot[1]), d(c.rot[2], target.rot[2])];
    c.scale = d(c.scale, target.scale);
    c.explode = d(c.explode, target.explode);
    c.fold = d(c.fold, target.fold);
    c.float = d(c.float, target.float);
    c.interactive = d(c.interactive, target.interactive);
    c.vis = d(c.vis, target.vis);
    c.glow = d(c.glow, target.glow);
    c.floor = d(c.floor, target.floor);

    // user orbit eases back to zero outside the configurator
    const u = scrollState.user;
    if (c.interactive < 0.5 && !scrollState.dragging) {
      u.yaw = MathUtils.damp(u.yaw, 0, 3, dt);
      u.pitch = MathUtils.damp(u.pitch, 0, 3, dt);
    }

    const time = state.clock.elapsedTime;
    const fl = reduced ? 0 : c.float;
    g.position.set(c.pos[0], c.pos[1] + Math.sin(time * 0.8) * 0.025 * fl, c.pos[2]);
    g.rotation.set(
      c.rot[0] + Math.sin(time * 0.6) * 0.02 * fl + u.pitch * c.interactive,
      c.rot[1] + Math.sin(time * 0.35) * 0.05 * fl + u.yaw * c.interactive,
      c.rot[2],
    );
    g.scale.setScalar(Math.max(0.0001, c.scale));
    // the product stays hidden behind the prologue until the visitor enters
    g.visible = c.vis > 0.03 && scrollState.introStart !== null;
    live.explode = c.explode;
    live.fold = c.fold;
    live.glow = c.glow;
    live.scale = c.scale;

    // Product world bounds (once per frame, for the ground shadow) and a TIGHT screen rect
    // for DOM overlays: union of every part's projected bounding sphere (projecting the
    // 3D box corners would overstate an exploded, rotated product by a wide margin).
    if (g.visible) {
      g.updateMatrixWorld(true);
      shadowBox.setFromObject(g);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const cam = state.camera as PerspectiveCamera;
      const f = state.size.height / 2 / Math.tan(((cam.fov ?? 30) * Math.PI) / 360);
      g.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || !m.visible || m.userData.isGloss) return;
        const gs = m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere);
        if (!gs) return;
        qaV.copy(gs.center).applyMatrix4(m.matrixWorld);
        const dist = cam.position.distanceTo(qaV);
        const rPx = (gs.radius * m.matrixWorld.getMaxScaleOnAxis() * f) / Math.max(0.01, dist) * 0.8;
        qaV.project(cam);
        const sx = (qaV.x * 0.5 + 0.5) * state.size.width;
        const sy = (-qaV.y * 0.5 + 0.5) * state.size.height;
        minX = Math.min(minX, sx - rPx); maxX = Math.max(maxX, sx + rPx); minY = Math.min(minY, sy - rPx); maxY = Math.max(maxY, sy + rPx);
      });
      productFrame.rect = Number.isFinite(minX) ? { left: minX, top: minY, right: maxX, bottom: maxY } : null;
    } else productFrame.rect = null;

    // Contact shadow: placed from the product's real world bounds every frame, so it is
    // always centred under the glasses (any shot, any aspect, during configurator orbit).
    const sh = shadow.current;
    if (sh) {
      const k = c.floor * c.vis * (1 - c.explode);
      sh.visible = k > 0.01 && g.visible;
      if (sh.visible) {
        const w = shadowBox.max.x - shadowBox.min.x;
        const h = shadowBox.max.y - shadowBox.min.y;
        const bob = Math.sin(time * 0.8) * 0.025 * fl; // the shadow does not bob with the idle float
        sh.position.set((shadowBox.min.x + shadowBox.max.x) / 2, shadowBox.min.y - bob - h * 0.26, (shadowBox.min.z + shadowBox.max.z) / 2);
        sh.scale.set(w * 0.92, w * 0.15, 1);
        (sh.material as MeshBasicMaterial).opacity = 0.27 * k;
      }
    }

    if (process.env.NODE_ENV !== "production") {
      // dev-only QA probes: live pose + product screen rectangle
      const w = window as unknown as Record<string, unknown>;
      w.__parallTarget = { pos: [...target.pos], rot: [...target.rot], scale: target.scale, vis: target.vis };
      w.__parallPose = { pos: [...g.position.toArray()], rot: [g.rotation.x, g.rotation.y, g.rotation.z], scale: g.scale.x, scrollY: window.scrollY, marks: scrollState.marks.map((m) => [m.name, Math.round(m.y)]) };
      // precise silhouette rect (projects mesh vertices; only when QA asks for it)
      w.__parallMeasureProduct = () => {
        if (!g.visible) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.updateWorldMatrix(true, true);
        g.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh || !m.visible) return;
          const pos = m.geometry.getAttribute("position");
          const step = Math.max(1, Math.floor(pos.count / 1500));
          for (let i = 0; i < pos.count; i += step) {
            qaV.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(state.camera);
            const sx = (qaV.x * 0.5 + 0.5) * state.size.width;
            const sy = (-qaV.y * 0.5 + 0.5) * state.size.height;
            minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
          }
        });
        return { left: minX, top: minY, right: maxX, bottom: maxY };
      };
      if (g.visible) {
        qaBox.setFromObject(g);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < 8; i++) {
          qaV.set(i & 1 ? qaBox.max.x : qaBox.min.x, i & 2 ? qaBox.max.y : qaBox.min.y, i & 4 ? qaBox.max.z : qaBox.min.z).project(state.camera);
          const sx = (qaV.x * 0.5 + 0.5) * state.size.width;
          const sy = (-qaV.y * 0.5 + 0.5) * state.size.height;
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
        }
        w.__parallProductRect = { left: minX, top: minY, right: maxX, bottom: maxY };
      } else {
        w.__parallProductRect = null;
      }
    }
  });

  return (
    <>
      <group ref={group}>{children}</group>
      <mesh ref={shadow} renderOrder={-1} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowMap} transparent depthWrite={false} toneMapped={false} opacity={0} />
      </mesh>
    </>
  );
}

class CanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * DPR policy: never render below the display's native ratio (sharp edges),
 * cap at 1.5 on integrated / touch devices and 2 elsewhere.
 */
function dprCap(): number {
  if (typeof window === "undefined") return 1.5;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return coarse || cores <= 4 ? 1.5 : 2;
}
function initialDpr(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), dprCap());
}

export default function ProductCanvas() {
  const setWebglFailed = useExperience((s) => s.setWebglFailed);
  const [dpr, setDpr] = useState(initialDpr);
  const [supported] = useState(() => {
    if (typeof document === "undefined") return true;
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!supported) setWebglFailed(true);
  }, [supported, setWebglFailed]);

  // real asset progress for the prologue loader (one phase of lib/readiness)
  useEffect(() => {
    const m = DefaultLoadingManager;
    m.onProgress = (_url, loaded, total) => reportPhase("assets", total ? loaded / total : 0);
    m.onLoad = () => reportPhase("assets", 1);
    m.onError = () => reportPhase("assets", 1);
    return () => {
      const noop = () => undefined;
      m.onProgress = noop;
      m.onLoad = noop;
      m.onError = noop;
    };
  }, []);

  if (!supported) return null;

  return (
    <CanvasBoundary onError={() => setWebglFailed(true)}>
      <Canvas
        className="product-canvas"
        dpr={dpr}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance", stencil: false }}
        camera={{ position: [0, 0, 5], fov: 30, near: 0.05, far: 60 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          // match the approved Blender look (AgX view transform) instead of ACES
          gl.toneMapping = AgXToneMapping;
          gl.toneMappingExposure = 1.12;
          gl.outputColorSpace = SRGBColorSpace;
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            // allow the browser to restore; R3F also triggers this on normal unmount
            e.preventDefault();
            window.setTimeout(() => {
              if (canvas.isConnected && gl.getContext().isContextLost()) setWebglFailed(true);
            }, 3000);
          });
        }}
        aria-hidden
      >
        <PerformanceMonitor
          onDecline={() => setDpr((v) => Math.max(1, +(v - 0.25).toFixed(2)))}
          onIncline={() => setDpr((v) => Math.min(dprCap(), +(v + 0.25).toFixed(2)))}
          flipflops={3}
        />
        <Studio />
        {/* intro atmosphere: renders while the product is still loading */}
        <Atmosphere />
        <Suspense fallback={null}>
          <Director>
            <SmartGlasses />
          </Director>
        </Suspense>
      </Canvas>
    </CanvasBoundary>
  );
}
