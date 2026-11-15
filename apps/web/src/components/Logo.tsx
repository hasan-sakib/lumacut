import { useId } from "react";

interface LogoProps {
  /** "mark": the icon only; "full": icon + wordmark. */
  variant?: "mark" | "full";
  /** Tailwind size classes for the mark. */
  markClassName?: string;
  className?: string;
}

/** The Lumacut mark: a play triangle with a cut through it, on a sky-to-indigo tile. */
export function Logo({ variant = "full", markClassName = "h-8 w-8", className = "" }: LogoProps) {
  const id = useId();
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className={`shrink-0 ${markClassName}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="32" y2="32">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
        <path d="M12 8.5v15l12-7.5z" fill="#fff" />
        <path
          d="M7 25.5 24.5 6"
          stroke={`url(#${id})`}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {variant === "full" ? (
        <span className="text-lg font-bold tracking-tight">Lumacut</span>
      ) : (
        <span className="sr-only">Lumacut</span>
      )}
    </span>
  );
}
