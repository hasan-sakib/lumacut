import { m, useReducedMotion, useScroll, useTransform, type Variants } from "motion/react";
import { useRef } from "react";
import { Link } from "react-router";
import { Icon } from "../Icon.tsx";
import { COUNTS } from "./content.ts";
import { EditorMock } from "./EditorMock.tsx";
import { LumacutScene } from "./LumacutScene.tsx";
import { EASE, RISE } from "./motion.tsx";

const FACTS = [
  "Runs in your browser",
  `${String(COUNTS.templates)} templates`,
  `${String(COUNTS.effects)} effects`,
  `${String(COUNTS.transitions)} transitions`,
];

/** The hero's words arrive one after another once the doodle letters start stamping. */
const ENTRANCE: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.35 } },
};

/** The first screen: the doodle LUMACUT, what Lumacut is, the two ways in, and the editor. */
export function Hero() {
  const reduced = useReducedMotion() === true;
  const sectionRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // While the hero scrolls away, the doodle LUMACUT drifts up slower than the page and fades.
  const { scrollYProgress: away } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const sceneY = useTransform(away, [0, 1], [0, 220]);
  const sceneOpacity = useTransform(away, [0, 0.45], [1, 0.25]);
  // The editor picture lands: tilted back in 3D, it straightens and grows as it comes into view.
  const { scrollYProgress: landing } = useScroll({
    target: editorRef,
    offset: ["start end", "start 25%"],
  });
  const tilt = useTransform(landing, [0, 1], [24, 0]);
  const grow = useTransform(landing, [0, 1], [0.88, 1]);
  const lift = useTransform(landing, [0, 1], [60, 0]);
  return (
    <section ref={sectionRef} id="top" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-linear-to-br from-sky-500/25 via-indigo-500/20 to-fuchsia-500/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-4 text-center lg:px-8 lg:pt-8">
        <m.div style={reduced ? undefined : { y: sceneY, opacity: sceneOpacity }}>
          <LumacutScene className="mx-auto mb-6 max-w-6xl" />
        </m.div>
        <m.div initial="hidden" animate="shown" variants={ENTRANCE}>
          <m.p
            variants={RISE}
            className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1 text-xs font-medium text-neutral-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Video · Motion graphics · Photo
          </m.p>
          <m.h1
            variants={RISE}
            className="mx-auto max-w-4xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Edit video, motion and photos in{" "}
            <span className="bg-linear-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
              one studio
            </span>
          </m.h1>
          <m.p
            variants={RISE}
            className="mx-auto mt-5 max-w-2xl text-pretty text-base text-neutral-400 sm:text-lg"
          >
            A timeline editor, a motion graphics tool and a photo editor that share one project and
            one engine. Nothing to install.
          </m.p>
          <m.div variants={RISE} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-6 text-sm font-semibold text-white shadow-lg shadow-sky-600/25 transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              Get started <Icon name="arrowRight" />
            </Link>
            <a
              href="#templates"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-6 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800"
            >
              <Icon name="template" /> See templates
            </a>
          </m.div>
          <m.ul
            variants={RISE}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-400"
          >
            {FACTS.map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <Icon name="check" className="h-3.5 w-3.5 text-sky-400" /> {fact}
              </li>
            ))}
          </m.ul>
        </m.div>
        <div ref={editorRef} className="mx-auto mt-14 max-w-5xl [perspective:1400px]">
          <m.div
            style={
              reduced
                ? undefined
                : { rotateX: tilt, scale: grow, y: lift, transformOrigin: "50% 0%" }
            }
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.7 }}
          >
            <EditorMock />
          </m.div>
        </div>
      </div>
    </section>
  );
}
