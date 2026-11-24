import { CanvasTexture, NoColorSpace, RepeatWrapping, type Texture } from "three";

let brushed: Texture | null = null;
let knurl: Texture | null = null;

/** Seeded PRNG so the grain is identical on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Directional brushed-metal grain used as a roughness/bump map (U = brush direction). */
export function getBrushedTexture(): Texture {
  if (brushed) return brushed;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "rgb(205,205,205)";
  ctx.fillRect(0, 0, size, size);
  const r = rng(7);
  for (let i = 0; i < 2600; i++) {
    const y = r() * size;
    const len = 40 + r() * size * 0.9;
    const x = r() * size;
    const v = 150 + Math.floor(r() * 105);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.16})`;
    ctx.lineWidth = 0.5 + r() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (r() - 0.5) * 0.8);
    ctx.stroke();
    if (x + len > size) {
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + len - size, y);
      ctx.stroke();
    }
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = NoColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(2, 16);
  brushed = tex;
  return tex;
}

/** Fine diamond knurl for the soft-touch temple tips (bump map). */
export function getKnurlTexture(): Texture {
  if (knurl) return knurl;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  const img = ctx.createImageData(size, size);
  const f = (Math.PI * 2 * 8) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.abs(Math.sin((x + y) * f));
      const b = Math.abs(Math.sin((x - y) * f));
      const h = Math.min(a, b);
      const v = Math.floor(80 + h * 175);
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = NoColorSpace;
  tex.repeat.set(10, 10);
  knurl = tex;
  return tex;
}
