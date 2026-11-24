"use client";

import { useEffect, useRef, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { scrollToTarget } from "@/lib/animation/scrollState";
import { useExperience } from "@/state/store";
import { onSoundChange, startAmbient, stopAmbient } from "@/lib/sound";
import { Wordmark } from "../ui/Wordmark";

const LINKS = [
  { id: "vision", key: "vision" },
  { id: "technology", key: "technology" },
  { id: "experience", key: "experience" },
  { id: "design", key: "design" },
  { id: "customize", key: "customize" },
] as const;

export function TopNav() {
  const { t, toggleLocale, locale } = useLocale();
  const soundOn = useExperience((s) => s.soundOn);
  const setSoundOn = useExperience((s) => s.setSoundOn);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  // active section → aria-current + persistent underline
  useEffect(() => {
    const triggers = LINKS.map((l) => {
      const el = document.getElementById(l.id);
      if (!el) return null;
      return ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => {
          if (self.isActive) setActive(l.id);
          else setActive((cur) => (cur === l.id ? null : cur));
        },
      });
    });
    return () => triggers.forEach((t) => t?.kill());
  }, []);

  // the audio engine is the source of truth for the button state
  useEffect(() => onSoundChange((on) => setSoundOn(on)), [setSoundOn]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    setOpen(false);
    scrollToTarget(hash);
    window.history.replaceState(window.history.state, "", `/${locale}${hash === "#top" ? "" : hash}`);
    if (hash !== "#top") {
      const el = document.querySelector<HTMLElement>(hash);
      el?.focus({ preventScroll: true });
    }
  };

  const toggleSound = () => {
    // called from the click itself (a user gesture) so the AudioContext may start
    if (soundOn) stopAmbient();
    else void startAmbient();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);



  return (
    <header className={`nav ${open ? "nav--open" : ""}`}>
      <a className="nav__brand" href={`/${locale}`} onClick={(e) => go(e, "#top")} aria-label={t.nav.home}>
        <Wordmark className="nav__wm" title="PARALL / 01" />
      </a>

      <nav className="nav__links" aria-label={t.nav.label} id="primary-nav">
        <ul>
          {LINKS.map((l, i) => (
            <li key={l.id} style={{ "--li": i } as React.CSSProperties}>
              <a
                href={`#${l.id}`}
                onClick={(e) => go(e, `#${l.id}`)}
                aria-current={active === l.id ? "true" : undefined}
              >
                <span className="nav__idx" aria-hidden>
                  0{i + 2}
                </span>
                <span className="nav__label">{t.nav[l.key]}</span>
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`nav__menu-sound ${soundOn ? "is-on" : ""}`}
          onClick={toggleSound}
          aria-pressed={soundOn}
        >
          <span className="nav__bars" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          {soundOn ? t.nav.soundOff : t.nav.soundOn}
        </button>
      </nav>

      <div className="nav__tools">
        <button
          type="button"
          className={`nav__sound ${soundOn ? "is-on" : ""}`}
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? t.nav.soundOff : t.nav.soundOn}
          title={soundOn ? t.nav.soundOff : t.nav.soundOn}
        >
          <span className="nav__bars" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        </button>
        <button
          type="button"
          className="nav__lang"
          onClick={toggleLocale}
          aria-label={t.nav.switchToLabel}
          lang={locale === "en" ? "ar" : "en"}
        >
          {t.nav.switchTo}
        </button>
        <button
          ref={menuBtn}
          type="button"
          className="nav__menu"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? t.nav.close : t.nav.menu}</span>
          <span className="nav__burger" aria-hidden />
        </button>
      </div>
    </header>
  );
}
