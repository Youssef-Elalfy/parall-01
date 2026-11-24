"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";

export function ScrollProgress({ scene }: { scene: number }) {
  const { t } = useLocale();
  const total = t.progress.scenes.length;
  return (
    <div className="progress" aria-hidden>
      <span className="progress__num" translate="no">
        {String(scene + 1).padStart(2, "0")}
        <span className="progress__of"> / {String(total).padStart(2, "0")}</span>
      </span>
      <span className="progress__track">
        <span className="progress__fill" style={{ transform: `scaleY(${(scene + 1) / total})` }} />
      </span>
      <span className="progress__label">{t.progress.scenes[scene]}</span>
    </div>
  );
}
