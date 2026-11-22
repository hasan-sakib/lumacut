const SIZES = {
  sm: { word: "h-6", mark: "h-7 w-7" },
  md: { word: "h-8", mark: "h-8 w-8" },
  lg: { word: "h-11", mark: "h-10 w-10" },
} as const;

interface LogoProps {
  /** "full": the Lumacut wordmark; "mark": the film-strip "L" alone (square). */
  variant?: "full" | "mark";
  size?: keyof typeof SIZES;
  /**
   * "auto": follows the theme (white letters on dark, ink letters on light); "onDark": always the
   * white-letter version, for logos sitting on a dark or coloured panel whatever the theme.
   */
  tone?: "auto" | "onDark";
  className?: string;
}

/**
 * The Lumacut logo (artwork in docs/brand, files built by scripts/brand/make_logo_assets.py).
 * The wordmark exists in two versions; CSS in index.css shows the one that fits the theme.
 */
export function Logo({ variant = "full", size = "md", tone = "auto", className = "" }: LogoProps) {
  const sizes = SIZES[size];
  if (variant === "mark") {
    return (
      <img
        src="/brand/lumacut-mark.png"
        alt="Lumacut"
        draggable={false}
        className={`${sizes.mark} shrink-0 object-contain ${className}`}
      />
    );
  }
  const common = `${sizes.word} w-auto shrink-0 select-none`;
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src="/brand/lumacut-wordmark-dark.png"
        alt="Lumacut"
        draggable={false}
        className={`${common} ${tone === "auto" ? "lc-logo-for-dark" : ""}`}
      />
      {tone === "auto" && (
        <img
          src="/brand/lumacut-wordmark-light.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className={`${common} lc-logo-for-light`}
        />
      )}
    </span>
  );
}
