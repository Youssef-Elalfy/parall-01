"use client";

import type { ElementType } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Masked editorial heading. Lines come from the dictionary (deliberate breaks,
 * safe for Arabic shaping). Optional inner split:
 *  - "words": each word is its own span (works in Arabic: letters inside a word stay joined)
 *  - "chars": per-character spans — English only; Arabic automatically falls back to
 *    words, because splitting Arabic letters would break their joining forms.
 * Rendered by React (not by mutating the DOM afterwards), so locale switches re-render
 * cleanly. Screen readers get one label; the visual spans are aria-hidden.
 */
export type SplitMode = "lines" | "words" | "chars";

function splitWords(line: string, mode: SplitMode, wordOffset: number) {
  const words = line.split(" ");
  return words.map((w, i) => {
    const wi = wordOffset + i;
    const sep = i < words.length - 1 ? " " : null;
    if (mode === "chars") {
      return (
        <span className="w" key={i} style={{ "--wi": wi } as React.CSSProperties}>
          {Array.from(w).map((ch, ci) => (
            <span className="c" key={ci} style={{ "--ci": ci } as React.CSSProperties}>
              {ch}
            </span>
          ))}
          {sep}
        </span>
      );
    }
    return (
      <span className="w" key={i} style={{ "--wi": wi } as React.CSSProperties}>
        {w}
        {sep}
      </span>
    );
  });
}

export function SplitLines({
  lines,
  as: Tag = "h2",
  className = "",
  id,
  mode = "lines",
  motion,
}: {
  lines: readonly string[];
  as?: ElementType;
  className?: string;
  id?: string;
  mode?: SplitMode;
  /** data-motion treatment picked up by the scroll typography director */
  motion?: string;
}) {
  const { locale } = useLocale();
  const m: SplitMode = mode === "chars" && locale === "ar" ? "words" : mode;
  // running word index per line (for cross-line stagger variables)
  const offsets = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.split(" ").length, 0));
  return (
    <Tag className={`split split--${m} ${className}`} aria-label={lines.join(" ")} id={id} data-motion={motion}>
      {lines.map((line, i) => {
        const inner = m === "lines" ? line : splitWords(line, m, offsets[i]);
        return (
          <span className="split__line" key={`${i}-${line}`} aria-hidden style={{ "--i": i } as React.CSSProperties}>
            <span className="split__inner">{inner}</span>
          </span>
        );
      })}
    </Tag>
  );
}

/** Paragraph split into words (accessible: the whole sentence is the label). */
export function Words({
  text,
  as: Tag = "p",
  className = "",
  motion,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  motion?: string;
}) {
  const words = text.split(" ");
  return (
    <Tag className={`words ${className}`} aria-label={text} data-motion={motion}>
      {words.map((w, i) => (
        <span className="w" key={`${i}-${w}`} aria-hidden style={{ "--wi": i } as React.CSSProperties}>
          {w}
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}
