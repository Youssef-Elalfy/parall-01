"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useSectionProgress } from "@/lib/animation/useScrollEngine";
import { FEATURE_ORDER } from "@/data/product";
import { useExperience } from "@/state/store";
import { tick } from "@/lib/sound";
import type { FeatureId } from "@/lib/i18n/dictionaries";
import { registerAnchor } from "../three/anchors";
import { SplitLines, Words } from "../ui/SplitLines";
import { FeatureGlyph } from "../ui/Icons";

function Hud({ feature }: { feature: FeatureId }) {
  const { t } = useLocale();
  const f = t.intelligence.features;
  return (
    <div className="hud__panel" key={feature}>
      <p className="hud__tag">
        <span className="hud__pulse" aria-hidden />
        {t.intelligence.concept}
      </p>
      {feature === "context" && (
        <div className="hud__body">
          <div className="hud__reticle" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
          <p className="hud__title">{f.context.hud.title}</p>
          <p className="hud__line">{f.context.hud.line1}</p>
          <p className="hud__meta">{f.context.hud.line2}</p>
        </div>
      )}
      {feature === "translate" && (
        <div className="hud__body">
          <p className="hud__chip" translate="no">
            {f.translate.hud.tag}
          </p>
          <p className="hud__source" lang="fr" translate="no">
            {f.translate.hud.source}
          </p>
          <p className="hud__title">{f.translate.hud.target}</p>
        </div>
      )}
      {feature === "assist" && (
        <div className="hud__body">
          <p className="hud__title">{f.assist.hud.title}</p>
          <p className="hud__line">{f.assist.hud.line1}</p>
          <p className="hud__meta">{f.assist.hud.line2}</p>
        </div>
      )}
      {feature === "gesture" && (
        <div className="hud__body">
          <div className="hud__wave" aria-hidden>
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
          <p className="hud__title">{f.gesture.hud.title}</p>
          <p className="hud__line">{f.gesture.hud.line1}</p>
          <p className="hud__meta">{f.gesture.hud.line2}</p>
        </div>
      )}
    </div>
  );
}

export function Intelligence() {
  const { t } = useLocale();
  const ref = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const feature = useExperience((s) => s.feature);
  const setFeature = useExperience((s) => s.setFeature);

  const onStep = useCallback(
    (step: number) => {
      const f = FEATURE_ORDER[Math.min(FEATURE_ORDER.length - 1, step)];
      if (f) useExperience.getState().setFeature(f);
    },
    [],
  );
  useSectionProgress(ref, [0.27, 0.5, 0.73], onStep);

  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;
    return registerAnchor("lensHud", el);
  }, []);

  const select = (id: FeatureId, i: number) => {
    setFeature(id);
    tick(1 + i * 0.12);
  };

  const active = t.intelligence.features[feature];

  return (
    <section
      ref={ref}
      id="technology"
      tabIndex={-1}
      className="scene intel sticky-scene"
      data-scene
      data-bg="#0B0E14"
      data-theme="dark"
      aria-labelledby="intel-title"
    >
      <span className="shot" data-shot="intel-a" style={{ top: "14%" }} />
      <span className="shot" data-shot="intel-b" style={{ top: "86%" }} />
      <div className="stage">
        <div className="intel__aura" aria-hidden />
        <div className="wrap intel__layout">
          <header className="intel__head">
            <p className="eyebrow" data-motion="track">{t.intelligence.eyebrow}</p>
            <SplitLines lines={t.intelligence.title} id="intel-title" className="h2" mode="words" motion="chars" />
            <Words text={t.intelligence.body} className="lede" motion="words" />
          </header>
          <div className="intel__features" role="group" aria-label={t.intelligence.chooser} data-motion="stagger" data-motion-start="top 45%">
            {FEATURE_ORDER.map((id, i) => (
              <button
                key={id}
                type="button"
                className={`feature ${feature === id ? "is-active" : ""}`}
                aria-pressed={feature === id}
                onClick={() => select(id, i)}
              >
                <span className="feature__idx" translate="no">
                  0{i + 1}
                </span>
                <span className="feature__glyph">
                  <FeatureGlyph id={id} />
                </span>
                <span className="feature__name">{t.intelligence.features[id].name}</span>
              </button>
            ))}
            <p className="intel__desc" aria-live="polite">
              {active.body}
            </p>
          </div>
        </div>
        <div className="hud" ref={hudRef} aria-hidden>
          <span className="hud__leader" />
          <Hud feature={feature} />
        </div>
      </div>
    </section>
  );
}
