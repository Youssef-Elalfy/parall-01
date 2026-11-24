"use client";

import { useMemo, useRef } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useSectionProgress } from "@/lib/animation/useScrollEngine";
import { SplitLines, Words } from "../ui/SplitLines";
import { ExplodedCallouts, type Callout } from "../ui/ExplodedCallouts";

export function Reveal() {
  const { t } = useLocale();
  const ref = useRef<HTMLElement>(null);
  useSectionProgress(ref, [0.33, 0.7]);
  const l = t.reveal.labels;
  const callouts = useMemo<Callout[]>(
    () => [
      { key: "frame", index: "A", title: l.frame, note: l.frameNote },
      { key: "lens", index: "B", title: l.lens, note: l.lensNote },
      { key: "hinge", index: "C", title: l.hinge, note: l.hingeNote },
      { key: "module", index: "D", title: l.module, note: l.moduleNote },
    ],
    [l],
  );
  return (
    <section
      ref={ref}
      id="vision"
      tabIndex={-1}
      className="scene reveal sticky-scene"
      data-scene
      data-bg="#F3F1EB"
      data-theme="light"
      aria-labelledby="reveal-title"
    >
      <span className="shot" data-shot="reveal-front" style={{ top: "15%" }} />
      <span className="shot" data-shot="reveal-explode" style={{ top: "50%" }} />
      <span className="shot" data-shot="reveal-macro" style={{ top: "85%" }} />
      <div className="stage">
        <div className="tech-grid" aria-hidden />
        <div className="wrap reveal__layout">
          <header className="reveal__head">
            <p className="eyebrow" data-motion="track">{t.reveal.eyebrow}</p>
            <SplitLines lines={t.reveal.title} id="reveal-title" className="h2 step-lines" motion="rise" />
            <Words text={t.reveal.body} className="lede step-fade" motion="words" />
          </header>
          <p className="reveal__parts step-show-1" translate="no" aria-hidden>
            {t.reveal.parts}
          </p>
          <div className="reveal__macro step-show-2">
            <p className="eyebrow">{l.camera}</p>
            <p className="reveal__macro-title">{t.reveal.detail}</p>
            <p className="reveal__macro-note">{l.cameraNote}</p>
          </div>
        </div>
        <ExplodedCallouts items={callouts} sectionRef={ref} />
        {/* accessible version of the labels */}
        <ul className="sr-only">
          <li>
            {l.frame}: {l.frameNote}
          </li>
          <li>
            {l.lens}: {l.lensNote}
          </li>
          <li>
            {l.hinge}: {l.hingeNote}
          </li>
          <li>
            {l.module}: {l.moduleNote}
          </li>
          <li>
            {l.camera}: {l.cameraNote}
          </li>
        </ul>
      </div>
    </section>
  );
}
