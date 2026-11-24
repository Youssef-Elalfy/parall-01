"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  AddEquation,
  Box3,
  CustomBlending,
  OneFactor,
  SrcAlphaFactor,
  ZeroFactor,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector3,
  type Texture,
  type Material,
  type Object3D,
} from "three";
import { DRACO_PATH, FINISHES, MODEL_URL, TINTS } from "@/data/product";
import { useExperience } from "@/state/store";
import { getBrushedTexture, getKnurlTexture } from "./textures";
import { live } from "./live";
import { anchorTargets, partLocal, productFrame, projected, type AnchorKey } from "./anchors";
import { reportPhase } from "@/lib/readiness";

type V3 = [number, number, number];

/** Exploded-view offsets (model units, glTF space: +Z front, +Y up, temples run to -Z). */
const EXPLODE: Record<string, V3> = {
  Frame: [0, 0.07, 0],
  Lens_Left: [-0.05, -0.04, 0.46],
  Lens_Right: [0.05, -0.04, 0.46],
  Camera_Ring: [-0.06, 0.08, 0.26],
  Camera_Glass: [-0.06, 0.08, 0.34],
  Camera_Iris: [-0.06, 0.08, 0.4],
  Module_Camera: [-0.06, 0.08, 0.12],
  Sensor_Pinhole: [0.05, 0.08, 0.2],
  NosePads: [0, -0.2, -0.2],
  NosePad_Arms: [0, -0.1, -0.1],
  Temple_Left: [-0.34, 0, -0.12],
  Temple_Right: [0.34, 0, -0.12],
  TempleArm_Left: [0, 0, -0.1],
  TempleArm_Right: [0, 0, -0.1],
  Engraving_Left: [0, 0, -0.1],
  Engraving_Right: [0, 0, -0.1],
  Speaker_Left: [0, 0, -0.1],
  Speaker_Right: [0, 0, -0.1],
  TempleTip_Left: [0, 0, -0.22],
  TempleTip_Right: [0, 0, -0.22],
  Accent_Left: [0, 0, -0.22],
  Accent_Right: [0, 0, -0.22],
  Hinge_Left: [0, 0.14, 0.03],
  Hinge_Right: [0, 0.14, 0.03],
  Module_Compute_Left: [0.26, 0.02, 0],
  Module_Compute_Right: [-0.26, 0.02, 0],
  Module_Battery_Left: [0.22, -0.02, -0.12],
  Module_Battery_Right: [-0.22, -0.02, -0.12],
};

/** `abs` = explicit point in the node's local space (glTF: +Y up, +Z front); otherwise bbox centre + offset. */
const ANCHOR_NODES: Record<AnchorKey, { node: string; offset: V3; abs?: V3 }> = {
  frame: { node: "Frame", offset: [0, 0, 0], abs: [-0.12, 0.252, 0.0] },
  lens: { node: "Lens_Right", offset: [0.06, -0.06, 0] },
  hinge: { node: "Hinge_Right", offset: [0, 0, 0] },
  camera: { node: "Camera_Glass", offset: [0, 0, 0] },
  module: { node: "Module_Compute_Left", offset: [0, 0, 0] },
  lensHud: { node: "Lens_Left", offset: [0, 0.02, 0] },
  tip: { node: "TempleTip_Left", offset: [0, 0, 0] },
  led: { node: "Status_LED_Left", offset: [0, 0, 0] },
  frameR: { node: "Frame", offset: [0, 0, 0], abs: [0.12, 0.252, 0.0] },
  lensHudR: { node: "Lens_Right", offset: [0, 0.02, 0] },
  tipR: { node: "TempleTip_Right", offset: [0, 0, 0] },
  ledR: { node: "Status_LED_Right", offset: [0, 0, 0] },
};

interface Part {
  obj: Object3D;
  base: Vector3;
  offset: Vector3;
}

function createMaterials() {
  const brushed = getBrushedTexture();
  const knurl = getKnurlTexture();
  const t = FINISHES.titanium;
  const lens = TINTS.clear;
  return {
    frame: new MeshPhysicalMaterial({
      name: "live-frame",
      color: t.frame.color,
      metalness: t.frame.metalness,
      roughness: t.frame.roughness,
      roughnessMap: brushed,
      anisotropy: t.frame.anisotropy,
      clearcoat: t.frame.clearcoat,
      clearcoatRoughness: 0.22,
      envMapIntensity: 1.0,
    }),
    arm: new MeshPhysicalMaterial({
      name: "live-arm",
      color: t.arm.color,
      metalness: t.arm.metalness,
      roughness: t.arm.roughness,
      roughnessMap: brushed,
      // three.js anisotropic IBL turns fine geometry into wavy bands above ~0.3
      anisotropy: 0.15,
      envMapIntensity: 0.95,
    }),
    tip: new MeshPhysicalMaterial({
      name: "live-tip",
      color: t.tip,
      metalness: 0,
      roughness: 0.68,
      bumpMap: knurl,
      bumpScale: 0.9,
      sheen: 0.5,
      sheenRoughness: 0.55,
      sheenColor: new Color("#5a6470"),
      envMapIntensity: 0.8,
    }),
    lensTint: new MeshPhysicalMaterial({
      name: "live-lens",
      color: lens.color,
      transparent: true,
      opacity: lens.opacity,
      roughness: 0.12,
      metalness: 0,
      depthWrite: false,
      envMapIntensity: 0.5,
    }),
    lensGloss: new MeshPhysicalMaterial({
      name: "live-lens-gloss",
      color: "#000000",
      transparent: true,
      // additive colour, but leave canvas alpha untouched so the page shows through
      blending: CustomBlending,
      blendEquation: AddEquation,
      // src × alpha: `opacity` works as the gloss gain (1 on dark scenes, eased down on ivory)
      blendSrc: SrcAlphaFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      depthWrite: false,
      roughness: 0.02,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.015,
      iridescence: lens.iridescence,
      iridescenceIOR: 1.55,
      iridescenceThicknessMinimum: 220,
      iridescenceThicknessMaximum: 620,
      envMapIntensity: 1.9,
    }),
    lensEdge: new MeshStandardMaterial({
      name: "live-lens-edge",
      color: "#d8f6ff",
      emissive: new Color(lens.edge),
      emissiveIntensity: 0.7,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
    }),
    led: new MeshBasicMaterial({ name: "live-led", color: new Color("#8FE7FF"), toneMapped: false }),
    accent: new MeshBasicMaterial({ name: "live-accent", color: new Color("#6fb8cc"), toneMapped: false }),
    pad: new MeshPhysicalMaterial({
      name: "live-pad",
      color: "#f2f7fa",
      transparent: true,
      opacity: 0.5,
      roughness: 0.2,
      clearcoat: 1,
      depthWrite: false,
      envMapIntensity: 1.4,
    }),
  };
}

type LiveMaterials = ReturnType<typeof createMaterials>;

const tmpColor = new Color();
const tmpV = new Vector3();

/**
 * Anisotropic brushed metal needs a stable tangent frame. Without a tangent
 * attribute three.js derives one per pixel from screen-space derivatives, which
 * jumps between triangles and shows as a crumpled pattern on finely
 * tessellated surfaces. Per-vertex tangents (along the brushing U axis) fix it.
 */
function ensureTangents(mesh: Mesh) {
  const g = mesh.geometry;
  if (g.getAttribute("tangent") || !g.getIndex() || !g.getAttribute("uv") || !g.getAttribute("normal")) return;
  g.computeTangents();
}

/** Assign the live (configurable) materials to the GLB meshes by Blender material name. */
function applyMaterials(scene: Object3D, mats: LiveMaterials) {
  scene.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const mesh = o as Mesh;
    if (mesh.userData.isGloss) return;
    const original = (mesh.userData.originalMaterial as Material | undefined) ?? (mesh.material as Material);
    mesh.userData.originalMaterial = original;
    switch (original.name) {
      case "PARALL_Frame":
        ensureTangents(mesh);
        mesh.material = mats.frame;
        break;
      case "PARALL_FrameArm":
        ensureTangents(mesh);
        mesh.material = mats.arm;
        break;
      case "PARALL_TempleTip":
        mesh.material = mats.tip;
        break;
      case "PARALL_Lens": {
        mesh.material = mats.lensTint;
        mesh.renderOrder = 2;
        let gloss = mesh.children.find((c) => c.userData.isGloss) as Mesh | undefined;
        if (!gloss) {
          gloss = new Mesh(mesh.geometry, mats.lensGloss);
          gloss.userData.isGloss = true;
          gloss.renderOrder = 3;
          mesh.add(gloss);
        } else {
          gloss.material = mats.lensGloss;
        }
        break;
      }
      case "PARALL_LensEdge":
        mesh.material = mats.lensEdge;
        mesh.renderOrder = 2;
        break;
      case "PARALL_LED":
        mesh.material = mesh.name.startsWith("Accent") ? mats.accent : mats.led;
        break;
      case "PARALL_NosePad":
        mesh.material = mats.pad;
        mesh.renderOrder = 2;
        break;
      default: {
        const m = original as MeshPhysicalMaterial;
        if ("envMapIntensity" in m) m.envMapIntensity = 1.2;
        // Any transmission > 0 makes three.js re-render every opaque object into an
        // offscreen buffer EVERY frame (and compile a second set of programs on the first
        // visible frame). The only user is the camera's tiny near-black sensor cover, where
        // it is invisible: render it as glossy dark glass instead.
        if (m.isMeshPhysicalMaterial && m.transmission > 0) {
          m.transmission = 0;
          m.transparent = true;
          m.opacity = 0.92;
          m.roughness = 0.04;
          m.clearcoat = 1;
          m.clearcoatRoughness = 0.02;
          m.needsUpdate = true;
        }
      }
    }
  });
}

export function SmartGlasses() {
  const { scene } = useGLTF(MODEL_URL, DRACO_PATH);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const rootScene = useThree((s) => s.scene);

  useEffect(() => {
    const max = gl.capabilities.getMaxAnisotropy();
    for (const tex of [getBrushedTexture(), getKnurlTexture()]) {
      tex.anisotropy = max;
      tex.needsUpdate = true;
    }
  }, [gl]);

  const rig = useMemo(() => {
    const mats: LiveMaterials = createMaterials();
    const parts: Part[] = [];
    const nodes = new Map<string, Object3D>();
    const centers = new Map<AnchorKey, { mesh: Mesh; center: Vector3 }>();

    scene.traverse((o) => {
      if (o.name) nodes.set(o.name, o);
      const off = EXPLODE[o.name];
      if (off) {
        if (o.userData.basePos === undefined) o.userData.basePos = o.position.clone();
        parts.push({ obj: o, base: (o.userData.basePos as Vector3).clone(), offset: new Vector3(...off) });
      }
    });

    (Object.keys(ANCHOR_NODES) as AnchorKey[]).forEach((key) => {
      const def = ANCHOR_NODES[key];
      let n = nodes.get(def.node);
      if (n && !(n as Mesh).isMesh) n = n.children.find((c) => (c as Mesh).isMesh);
      if (n && (n as Mesh).isMesh) {
        const mesh = n as Mesh;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox ?? new Box3();
        const center = def.abs ? new Vector3(...def.abs) : box.getCenter(new Vector3()).add(new Vector3(...def.offset));
        centers.set(key, { mesh, center });
      }
    });

    return {
      mats,
      parts,
      templeL: nodes.get("Temple_Left") ?? null,
      templeR: nodes.get("Temple_Right") ?? null,
      centers,
    };
  }, [scene]);

  const rigRef = useRef<typeof rig | null>(null);
  useEffect(() => {
    applyMaterials(scene, rig.mats);
    rigRef.current = rig;
    // measure every anchor in the model's own space (assembled), for camera framing
    scene.updateMatrixWorld(true);
    rig.centers.forEach((c, key) => {
      const p = c.center.clone().applyMatrix4(c.mesh.matrixWorld);
      scene.worldToLocal(p);
      partLocal.set(key, [p.x, p.y, p.z]);
    });
    reportPhase("materials", 1);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __parallMats?: LiveMaterials }).__parallMats = rig.mats;
    }
    // Compile every program the product needs WITHOUT blocking the main thread
    // (KHR_parallel_shader_compile, polled by three). Synchronously, the first
    // visible frame used to link ~10 physical-material programs in one 2.8 s task
    // — the "freeze at 99 %". Two frames' wait lets the studio environment bake
    // first, so the compiled variants match what the first draw will ask for.
    let alive = true;
    let raf = 0;
    // After the programs, upload textures (one frame) and then draw the product once,
    // scissored to a single pixel (next frame): vertex buffers + textures reach the GPU behind the
    // progress line instead of on the first visible frame after Enter.
    const warm = () => {
      if (!alive) return;
      const textures = new Set<Texture>();
      scene.traverse((o) => {
        const m = (o as Mesh).material as MeshStandardMaterial | undefined;
        if (!m) return;
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "bumpMap", "anisotropyMap", "emissiveMap"] as const) {
          const t = (m as unknown as Record<string, Texture | null | undefined>)[k];
          if (t) textures.add(t);
        }
      });
      textures.forEach((t) => gl.initTexture(t));
      reportPhase("shaders", 0.9);
      raf = requestAnimationFrame(() => {
        if (!alive) return;
        const holder = scene.parent;
        const was = holder?.visible ?? true;
        if (holder) holder.visible = true;
        // draw to the real framebuffer (same tone-mapping / colour-space program variants
        // as the visible frames — a render target would compile different ones), clipped
        // to one pixel; the next regular frame repaints it.
        const scissorWas = gl.getScissorTest();
        gl.setScissorTest(true);
        gl.setScissor(0, 0, 1, 1);
        gl.render(rootScene, camera);
        gl.setScissor(0, 0, gl.domElement.width, gl.domElement.height);
        gl.setScissorTest(scissorWas);
        if (holder) holder.visible = was;
        reportPhase("shaders", 1);
      });
    };
    const compile = () => {
      // compile exactly what the screen will draw: the root scene with the product shown
      const holder = scene.parent;
      const was = holder?.visible ?? true;
      if (holder) holder.visible = true;
      const job = gl.compileAsync(rootScene, camera);
      if (holder) holder.visible = was;
      job
        .then(() => {
          if (!alive) return;
          reportPhase("shaders", 0.75);
          raf = requestAnimationFrame(warm);
        })
        .catch(() => alive && reportPhase("shaders", 1));
    };
    raf = requestAnimationFrame(() => (raf = requestAnimationFrame(compile)));
    const { mats } = rig;
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [rig, scene, gl, camera, rootScene]);

  useFrame((_, dt) => {
    const current = rigRef.current;
    if (!current) return;
    const { mats, parts, templeL, templeR, centers } = current;
    const st = useExperience.getState();
    const f = FINISHES[st.finish];
    const t = TINTS[st.tint];
    const k = 1 - Math.exp(-dt * (st.reducedMotion ? 30 : 6));

    // ---- configurator: ease materials toward the selected finish / tint ----
    // material exploration: the inspected material stays true, the rest recede a little
    const fw = live.focusW;
    const recede = (id: "titanium" | "composite" | "glass" | "light") => (live.focus && live.focus !== id ? 1 - 0.42 * fw : 1);
    mats.frame.color.lerp(tmpColor.set(f.frame.color).multiplyScalar(recede("titanium")), k);
    mats.frame.metalness += (f.frame.metalness - mats.frame.metalness) * k;
    mats.frame.roughness += (f.frame.roughness - mats.frame.roughness) * k;
    mats.frame.clearcoat += (f.frame.clearcoat - mats.frame.clearcoat) * k;
    mats.frame.anisotropy += (f.frame.anisotropy - mats.frame.anisotropy) * k;
    mats.arm.color.lerp(tmpColor.set(f.arm.color).multiplyScalar(recede("titanium")), k);
    mats.arm.metalness += (f.arm.metalness - mats.arm.metalness) * k;
    mats.arm.roughness += (f.arm.roughness - mats.arm.roughness) * k;
    mats.tip.color.lerp(tmpColor.set(f.tip).multiplyScalar(recede("composite")), k);
    mats.lensTint.color.lerp(tmpColor.set(t.color), k);
    mats.lensTint.opacity += (t.opacity - mats.lensTint.opacity) * k;
    mats.lensGloss.iridescence += (t.iridescence - mats.lensGloss.iridescence) * k;
    mats.lensEdge.emissive.lerp(tmpColor.set(t.edge), k);
    // big flat reflections read as "screens" in macro shots: soften as the camera closes in.
    // On the ivory scenes the additive gloss saturates to flat white blocks, so its gain
    // (opacity) is eased down there (theme read from the DOM, damped to avoid a pop at scene changes).
    const lightTarget = document.documentElement.dataset.theme === "light" ? 1 : 0;
    live.light += (lightTarget - live.light) * (1 - Math.exp(-dt * 3));
    mats.lensGloss.envMapIntensity = 1.9 / Math.max(1, live.scale / 2.2);
    mats.lensGloss.opacity = 1 - 0.72 * live.light;

    // ---- glow / status light ----
    const pulse = st.reducedMotion ? 0 : Math.sin(performance.now() * 0.0022) * 0.08;
    const sel = (id: string) => (live.focus === id ? fw : 0);
    mats.lensEdge.emissiveIntensity = 0.3 + live.glow * 0.55 + pulse + sel("glass") * 0.9;
    // keep emitters inside [0, 1] so they read as cyan light, not clipped white
    const ledI = Math.min(1, 0.72 + live.glow * 0.18 + pulse + sel("light") * (0.35 + Math.sin(performance.now() * 0.004) * 0.1));
    mats.led.color.setRGB(0.56 * ledI, 0.9 * ledI, 1.0 * ledI);
    mats.accent.color.setRGB(0.56 * ledI * 0.8, 0.9 * ledI * 0.8, 1.0 * ledI * 0.8);

    // ---- exploded view ----
    const e = live.explode;
    for (const p of parts) {
      p.obj.position.set(p.base.x + p.offset.x * e, p.base.y + p.offset.y * e, p.base.z + p.offset.z * e);
    }
    // ---- temple fold (hinge rotation) ----
    if (templeL) templeL.rotation.y = -live.fold * 1.4;
    if (templeR) {
      templeR.rotation.y = live.fold * 1.52;
      templeR.position.y = (templeR.userData.basePos as Vector3).y + live.fold * 0.012;
    }

    // ---- DOM anchors: publish every projected point; registered elements follow theirs ----
    const targets = anchorTargets();
    productFrame.explode = live.explode;
    productFrame.w = size.width;
    productFrame.h = size.height;
    centers.forEach((c, key) => {
      tmpV.copy(c.center).applyMatrix4(c.mesh.matrixWorld).project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * size.width;
      const y = (-tmpV.y * 0.5 + 0.5) * size.height;
      const pt = projected.get(key);
      if (pt) {
        pt.x = x;
        pt.y = y;
      } else projected.set(key, { x, y });
      targets.get(key)?.forEach((el) => {
        el.style.setProperty("--ax", `${x.toFixed(1)}px`);
        el.style.setProperty("--ay", `${y.toFixed(1)}px`);
      });
    });
  });

  return <primitive object={scene} />;
}

useGLTF.preload(MODEL_URL, DRACO_PATH);
