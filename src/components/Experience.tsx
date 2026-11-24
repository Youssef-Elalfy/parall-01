"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { dictionaries, directionOf, type Locale } from "@/lib/i18n/dictionaries";
import { LocaleContext } from "@/lib/i18n/LocaleContext";
import { useScrollEngine } from "@/lib/animation/useScrollEngine";
import { measureShots, scrollState, scrollToTarget } from "@/lib/animation/scrollState";
import { useExperience } from "@/state/store";
import { TopNav } from "./layout/TopNav";
import { Loader } from "./layout/Loader";
import { ScrollProgress } from "./layout/ScrollProgress";
import { PosterFallback } from "./layout/PosterFallback";
import { useRevealObserver } from "./ui/useRevealObserver";
import { useTextMotion } from "@/lib/animation/textMotion";
import { Hero } from "./sections/Hero";
import { Reveal } from "./sections/Reveal";
import { Intelligence } from "./sections/Intelligence";
import { ARExperience } from "./sections/ARExperience";
import { EditorialShift } from "./sections/EditorialShift";
import { Materials } from "./sections/Materials";
import { Configurator } from "./sections/Configurator";
import { Finale } from "./sections/Finale";

const ProductCanvas = dynamic(() => import("./three/ProductCanvas"), { ssr: false });

/** Applies section backgrounds/themes and the progress index as sections cross the viewport centre. */
function useSceneDirector(setScene: (i: number) => void) {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"));
    const root = document.documentElement;
    const triggers = sections.map((el, i) =>
      ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => {
          if (!self.isActive) return;
          root.style.setProperty("--scene-bg", el.dataset.bg ?? "#0B0E14");
          root.dataset.theme = el.dataset.theme ?? "dark";
          root.dataset.scene = el.id || "";
          setScene(i);
        },
      }),
    );
    return () => triggers.forEach((t) => t.kill());
  }, [setScene]);
}

export default function Experience({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [scene, setScene] = useState(0);
  const reducedMotion = useExperience((s) => s.reducedMotion);
  const setReducedMotion = useExperience((s) => s.setReducedMotion);
  const loaderDone = useExperience((s) => s.loaderDone);
  const webglFailed = useExperience((s) => s.webglFailed);
  const t = dictionaries[locale];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [setReducedMotion]);

  useScrollEngine(reducedMotion);
  useSceneDirector(setScene);
  useRevealObserver();
  useTextMotion(locale, reducedMotion, loaderDone);

  // Intro: product glides out of the dark once the loader clears.
  useEffect(() => {
    if (!loaderDone) return;
    document.documentElement.classList.add("is-ready");
    if (reducedMotion) {
      scrollState.intro = 1;
      return;
    }
    // idempotent (Strict Mode / HMR safe): the render loop derives `intro` from this timestamp
    scrollState.introStart ??= performance.now();
  }, [loaderDone, reducedMotion]);

  // Deep links (#customize etc.) once layout is measured.
  useEffect(() => {
    if (!loaderDone) return;
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const id = window.setTimeout(() => {
        ScrollTrigger.refresh();
        scrollToTarget(hash, true);
      }, 60);
      return () => window.clearTimeout(id);
    }
  }, [loaderDone]);

  const toggleLocale = useCallback(() => {
    const next: Locale = locale === "en" ? "ar" : "en";
    const root = document.documentElement;
    root.lang = next;
    root.dir = directionOf(next);
    document.title = dictionaries[next].meta.title;
    window.history.replaceState(window.history.state, "", `/${next}${window.location.hash}`);
    setLocale(next);
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      measureShots();
    });
  }, [locale]);

  const value = useMemo(() => ({ locale, t, dir: directionOf(locale), toggleLocale }), [locale, t, toggleLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <a className="skip-link" href="#main">
        {t.nav.skip}
      </a>
      <div className="backdrop" aria-hidden>
        {/* scene atmospheres live BEHIND the WebGL canvas so they can never veil the product */}
        <div className="backdrop__wash" />
      </div>
      <div className="canvas-layer" aria-hidden>
        {!webglFailed && <ProductCanvas />}
      </div>
      {webglFailed && <PosterFallback />}
      <TopNav />
      <ScrollProgress scene={scene} />
      <main id="main" className="story">
        <Hero />
        <Reveal />
        <Intelligence />
        <ARExperience />
        <EditorialShift />
        <Materials />
        <Configurator />
        <Finale />
      </main>
      <Loader />
    </LocaleContext.Provider>
  );
}
