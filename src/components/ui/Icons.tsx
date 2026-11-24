export function Arrow({ dir = "end", className }: { dir?: "end" | "down" | "up"; className?: string }) {
  const rot = dir === "down" ? 90 : dir === "up" ? -90 : 0;
  return (
    <svg className={`icon-arrow ${dir === "end" ? "icon-arrow--flip" : ""} ${className ?? ""}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false" style={{ rotate: `${rot}deg` }}>
      <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FeatureGlyph({ id }: { id: "context" | "translate" | "assist" | "gesture" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
      {id === "context" && (
        <g {...common}>
          <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" />
          <circle cx="12" cy="12" r="3" />
        </g>
      )}
      {id === "translate" && (
        <g {...common}>
          <path d="M4 6h8M8 4v2M6 6c0 4 3 7 6 8M10 6c-1 4-3 7-6 8" />
          <path d="M13 20l4-9 4 9M14.5 17h5" />
        </g>
      )}
      {id === "assist" && (
        <g {...common}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
          <path d="M18 15l.7 1.8 1.8.7-1.8.7L18 20l-.7-1.8-1.8-.7 1.8-.7z" />
        </g>
      )}
      {id === "gesture" && (
        <g {...common}>
          <path d="M4 10v4M7 7v10M10 9v6M13 5v14M16 8v8M19 11v2" />
        </g>
      )}
    </svg>
  );
}
