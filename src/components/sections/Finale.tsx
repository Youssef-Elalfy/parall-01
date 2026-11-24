"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { scrollToTarget } from "@/lib/animation/scrollState";
import { SplitLines } from "../ui/SplitLines";
import { Arrow } from "../ui/Icons";
import { Wordmark } from "../ui/Wordmark";

export function Finale() {
  const { t, locale } = useLocale();
  const f = t.finale;
  return (
    <section className="scene finale" data-scene data-bg="#0B0E14" data-theme="dark" aria-labelledby="finale-title">
      {/* reached when the stage fills the viewport (stage top = viewport top) */}
      <span className="shot" data-shot="finale" style={{ top: "50svh" }} />
      <div className="finale__stage">
      <div className="finale__beam" aria-hidden />
      <div className="wrap finale__inner">
        <p className="eyebrow" data-motion="track">{f.eyebrow}</p>
        <SplitLines lines={f.title} id="finale-title" className="display finale__title" motion="finale" />
        <div className="finale__ctas" data-motion="stagger" data-motion-start="top 92%">
          <a
            className="btn btn--primary"
            href="#customize"
            onClick={(e) => {
              e.preventDefault();
              scrollToTarget("#customize");
            }}
          >
            <span>{f.colors}</span>
            <Arrow dir="up" />
          </a>
          <a
            className="btn btn--ghost"
            href={`/${locale}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToTarget(0);
              window.history.replaceState(window.history.state, "", `/${locale}`);
            }}
          >
            <span>{f.top}</span>
            <Arrow dir="up" />
          </a>
        </div>
      </div>
      </div>
      <footer className="footer wrap">
        <div className="footer__brand">
          <Wordmark className="footer__wm" subtitle="AI SMART EYEWEAR" />
          <span className="footer__tag">{f.tagline}</span>
        </div>
        <p className="footer__legal">{f.legal}</p>
        <p className="footer__meta">
          <span>{f.rights}</span>
          <span>{f.noCommerce}</span>
        </p>
      </footer>
    </section>
  );
}
