"use client";

import Image from "next/image";

/** Shown only if WebGL is unavailable or the context is lost: an original Cycles render of the same model. */
export function PosterFallback() {
  return (
    <div className="poster-fallback" aria-hidden>
      <Image src="/images/parall-01-hero.jpg" alt="" fill sizes="100vw" priority={false} style={{ objectFit: "cover" }} />
    </div>
  );
}
