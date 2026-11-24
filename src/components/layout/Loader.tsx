"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useExperience } from "@/state/store";
import { startSoundtrack } from "@/lib/sound";
import { Wordmark } from "../ui/Wordmark";
import { Arrow } from "../ui/Icons";

/**
 * Prologue → Enter.
 *
 * 1. The PARALL / 01 wordmark draws itself (stroke + masked sweep) over the live
 *    atmosphere, which is rendered in the main canvas underneath.
 * 2. The progress line reports real, weighted readiness (lib/readiness): assets,
 *    fonts, materials and an asynchronous shader compile. 100 % = the first
 *    product frame will not stall.
 * 3. At 100 % the line becomes the Enter screen. Nothing auto-dismisses.
 * 4. Enter (with or without sound) starts the soundtrack inside the click (a real
 *    user gesture), then dissolves the prologue while the hero, the product and
 *    the music swell come in together.
 */
const FORCE_READY_MS = 20000; // never trap a visitor if a GPU never reports back

export function Loader() {
  const { t } = useLocale();
  const progress = useExperience((s) => s.loadProgress);
  const modelReady = useExperience((s) => s.modelReady);
  const webglFailed = useExperience((s) => s.webglFailed);
  const loaderDone = useExperience((s) => s.loaderDone);
  const reducedMotion = useExperience((s) => s.reducedMotion);
  const setLoaderDone = useExperience((s) => s.setLoaderDone);
  const [forced, setForced] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const enterBtn = useRef<HTMLButtonElement>(null);

  const ready = modelReady || webglFailed || forced;

  useEffect(() => {
    const id = window.setTimeout(() => setForced(true), FORCE_READY_MS);
    return () => window.clearTimeout(id);
  }, []);

  // keyboard users land on the primary action as soon as it exists
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => enterBtn.current?.focus({ preventScroll: true }), reducedMotion ? 0 : 900);
    return () => window.clearTimeout(id);
  }, [ready, reducedMotion]);

  const enter = useCallback(
    (withSound: boolean) => {
      if (leaving || loaderDone) return;
      // inside the click: the browser allows audio to start here (never before)
      if (withSound) void startSoundtrack();
      setLeaving(true);
      const el = root.current;
      if (!el || reducedMotion) {
        setLoaderDone(true);
        window.setTimeout(() => setGone(true), 250);
        return;
      }
      const q = gsap.utils.selector(el);
      const tl = gsap.timeline({ onComplete: () => setGone(true) });
      tl.to(q(".loader__enter > *"), { y: -14, autoAlpha: 0, duration: 0.45, stagger: 0.04, ease: "power2.in" }, 0)
        .to(q(".loader__wm"), { scale: 0.94, y: "-6vh", autoAlpha: 0, filter: "blur(12px)", duration: 0.85, ease: "power3.in" }, 0.08)
        // the hero + product intro begin as the wordmark clears (no overlap with the logo)
        .add(() => setLoaderDone(true), 0.62)
        .to(el, { autoAlpha: 0, duration: 0.8, ease: "power2.inOut" }, 0.8);
    },
    [leaving, loaderDone, reducedMotion, setLoaderDone],
  );

  if (gone) return null;
  const pct = ready && modelReady ? 100 : Math.min(99.9, progress);

  return (
    <div
      ref={root}
      className={`loader ${ready ? "loader--ready" : ""} ${leaving ? "loader--leaving" : ""} ${loaderDone ? "loader--done" : ""} ${webglFailed ? "loader--nogl" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loader-title"
      aria-busy={!ready}
    >
      <div className="loader__veil" aria-hidden />
      <div className="loader__center">
        <h1 id="loader-title" className="sr-only">
          PARALL / 01 — {t.hero.title.join(" ")}
        </h1>
        <Wordmark variant="titanium" className="loader__wm" subtitle="AI SMART EYEWEAR" />
        <div className="loader__stage">
          {!ready ? (
            <div className="loader__meta" role="status" aria-live="polite">
              <span className="loader__status">{t.loader.preparing}</span>
              <span className="loader__bar" aria-hidden>
                <span style={{ transform: `scaleX(${pct / 100})` }} />
              </span>
              <span className="loader__pct" translate="no" aria-label={`${Math.floor(pct)}%`}>
                {String(Math.floor(pct)).padStart(3, "0")}
              </span>
            </div>
          ) : (
            <div className="loader__enter">
              <p className="loader__tagline">{t.hero.title.join(" ")}</p>
              <button ref={enterBtn} type="button" className="enter-btn" onClick={() => enter(true)}>
                <span className="enter-btn__sheen" aria-hidden />
                <span className="enter-btn__label">{t.loader.enter}</span>
                <span className="enter-btn__arrow" aria-hidden>
                  <Arrow dir="end" />
                </span>
              </button>
              <p className="loader__hint">
                <span className="loader__wave" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                {t.loader.withSound}
              </p>
              <button type="button" className="loader__silent" onClick={() => enter(false)}>
                {t.loader.silent}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
