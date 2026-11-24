"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { scrollToTarget } from "@/lib/animation/scrollState";
import { SplitLines } from "../ui/SplitLines";
import { Arrow } from "../ui/Icons";

export function Hero() {
  const { t } = useLocale();
  return (
    <section id="top" className="scene hero" data-scene data-bg="#0B0E14" data-theme="dark" aria-labelledby="hero-title">
      <span className="shot" data-shot="hero" style={{ top: "50%" }} />
      <div className="hero__glow" aria-hidden />
      <div className="wrap hero__inner" data-motion="hero-out">
        <p className="eyebrow hero__eyebrow intro-in" style={{ "--d": "0.15s" } as React.CSSProperties}>
          <span className="eyebrow__dot" aria-hidden />
          {t.hero.eyebrow}
        </p>
        <SplitLines as="h1" id="hero-title" lines={t.hero.title} className="display hero__title intro-lines" />
        <div className="hero__copy intro-in" style={{ "--d": "0.95s" } as React.CSSProperties}>
          <p className="hero__sub">{t.hero.sub}</p>
          <p className="hero__body">{t.hero.body}</p>
          <a
            className="btn btn--primary"
            href="#vision"
            onClick={(e) => {
              e.preventDefault();
              scrollToTarget("#vision");
            }}
          >
            <span>{t.hero.cta}</span>
            <Arrow dir="down" />
          </a>
        </div>
        <div className="hero__foot">
        <ul className="hero__meta intro-in" style={{ "--d": "1.2s" } as React.CSSProperties}>
          {t.hero.meta.map((m, i) => (
            <li key={m}>
              <span className="hero__meta-idx" translate="no">
                0{i + 1}
              </span>
              {m}
            </li>
          ))}
        </ul>
        <div className="scroll-cue intro-in" style={{ "--d": "1.6s" } as React.CSSProperties} aria-hidden>
          <span>{t.nav.scroll}</span>
          <i />
        </div>
        </div>
      </div>
    </section>
  );
}
