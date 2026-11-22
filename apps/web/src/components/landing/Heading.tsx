import { m } from "motion/react";
import { HEADING_PART, IN_VIEW, STAGGER } from "./motion.tsx";

interface HeadingProps {
  eyebrow: string;
  title: string;
  text?: string;
}

/** A section's heading block: small label, title, one line; each rises in from a light blur. */
export function Heading({ eyebrow, title, text }: HeadingProps) {
  return (
    <m.div {...IN_VIEW} variants={STAGGER} className="mx-auto mb-10 max-w-2xl text-center">
      <m.p
        variants={HEADING_PART}
        className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400"
      >
        {eyebrow}
      </m.p>
      <m.h2
        variants={HEADING_PART}
        className="text-balance text-3xl font-bold tracking-tight sm:text-4xl"
      >
        {title}
      </m.h2>
      {text !== undefined && (
        <m.p variants={HEADING_PART} className="mt-3 text-pretty text-neutral-400">
          {text}
        </m.p>
      )}
    </m.div>
  );
}

/** The shared wrapper for a landing section: anchor target, width and spacing. */
export const SECTION = "mx-auto max-w-7xl scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24";
