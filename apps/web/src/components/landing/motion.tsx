import {
  LazyMotion,
  MotionConfig,
  domMax,
  m,
  useScroll,
  useSpring,
  type Variants,
} from "motion/react";
import type { ReactNode } from "react";

/**
 * The landing page's motion vocabulary (Motion, formerly Framer Motion): one easing, one reveal,
 * one stagger, so every section moves the same way. Only transform and opacity animate (headings
 * add a light blur). `MotionProvider` turns movement off when the OS asks for reduced motion;
 * things still fade in.
 */

/** A soft "expo out": quick start, long gentle landing. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Spread on a container: hidden until a sliver of it scrolls into view, then shown once. */
export const IN_VIEW = {
  initial: "hidden",
  whileInView: "shown",
  viewport: { once: true, amount: 0.15 },
} as const;

/** A container whose children (with `RISE` or `HEADING_PART`) arrive one after another. */
export const STAGGER: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

/** A child that rises and fades in. */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.98 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease: EASE } },
};

/**
 * Like `RISE`, for items driven one by one (`custom` = their index): grids whose items change
 * after the first reveal (filter chips), so new items animate in too.
 */
export const RISE_AT: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.98 },
  shown: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: EASE, delay: Math.min(i, 12) * 0.05 },
  }),
};

/** A heading part: rises in from a light blur. */
export const HEADING_PART: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

/** Leaving a grid when a filter changes. */
export const EXIT = { opacity: 0, scale: 0.92, transition: { duration: 0.2 } } as const;

/** Springs for things that slide between places (pills, highlights). */
export const SLIDE = { type: "spring", stiffness: 420, damping: 34, mass: 0.6 } as const;

/** Loads Motion's features once for the page and respects the OS reduced-motion setting. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.6, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Fades and rises its content in the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

/** A thin line in the logo's colours that fills as the page scrolls (on a spring, so it eases). */
export function ScrollProgress({ className = "" }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 160, damping: 32, mass: 0.3 });
  return (
    <m.div
      aria-hidden="true"
      className={`h-0.5 origin-left ${className}`}
      style={{
        scaleX,
        background: "linear-gradient(90deg, #8b5cf6, #fb923c 35%, #38bdf8 70%, #2dd4bf)",
      }}
    />
  );
}
