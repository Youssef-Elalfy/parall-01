"use client";

import { useCallback, useRef } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useSectionProgress } from "@/lib/animation/useScrollEngine";

function Lines({ lines, inverse = false }: { lines: readonly string[]; inverse?: boolean }) {
  return (
    <p className={`shift__lines ${inverse ? "shift__lines--inverse" : ""}`} aria-hidden>
      {lines.map((l, i) => (
        <span key={`${i}-${l}`} className={`shift__line shift__line--${i}`}>
          {l}
        </span>
      ))}
    </p>
  );
}

export function EditorialShift() {
  const { t } = useLocale();
  const ref = useRef<HTMLElement>(null);
  const onStep = useCallback((step: number) => {
    document.documentElement.dataset.theme = step >= 1 ? "dark" : "light";
  }, []);
  useSectionProgress(ref, [0.62], onStep);

  return (
    <section
      ref={ref}
      className="scene shift sticky-scene"
      data-scene
      data-bg="#FF5B43"
      data-theme="light"
      aria-labelledby="shift-title"
    >
      <span className="shot" data-shot="shift" style={{ top: "50%" }} />
      <div className="stage">
        <h2 id="shift-title" className="sr-only">
          {t.shift.title.join(" ")}
        </h2>
        <p className="eyebrow shift__eyebrow">{t.shift.eyebrow}</p>
        <Lines lines={t.shift.title} />
        <div className="shift__lens" aria-hidden>
          <Lines lines={t.shift.title} inverse />
        </div>
        <svg className="shift__rings" viewBox="0 0 200 200" aria-hidden focusable="false">
          <circle cx="100" cy="100" r="98" />
          <circle cx="100" cy="100" r="86" />
          <circle cx="100" cy="100" r="60" />
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            const r1 = i % 4 === 0 ? 90 : 93;
            return (
              <line
                key={i}
                x1={(100 + Math.cos(a) * r1).toFixed(2)}
                y1={(100 + Math.sin(a) * r1).toFixed(2)}
                x2={(100 + Math.cos(a) * 97).toFixed(2)}
                y2={(100 + Math.sin(a) * 97).toFixed(2)}
              />
            );
          })}
        </svg>
        <div className="shift__foot">
          <span className="shift__foot-idx" aria-hidden translate="no">
            PARALL / 01
          </span>
          <p className="shift__body">{t.shift.body}</p>
        </div>
      </div>
    </section>
  );
}
