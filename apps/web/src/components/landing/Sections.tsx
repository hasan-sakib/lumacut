import { m, useReducedMotion, useScroll, useSpring } from "motion/react";
import { Accordion } from "radix-ui";
import { useRef } from "react";
import { Icon } from "../Icon.tsx";
import { COMING, FAQ, FEATURES, STEPS } from "./content.ts";
import { Heading, SECTION } from "./Heading.tsx";
import { IN_VIEW, RISE, Reveal, STAGGER } from "./motion.tsx";

/** Import → Edit → Export. */
export function Steps() {
  const reduced = useReducedMotion() === true;
  const listRef = useRef<HTMLOListElement>(null);
  // The rail above the steps fills as you scroll through them.
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 85%", "end 55%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });
  return (
    <section id="how" className={SECTION}>
      <Heading eyebrow="How it works" title="From files to a finished video in three steps" />
      <div aria-hidden="true" className="relative mx-[16.6%] mb-6 hidden h-1 md:block">
        <div className="absolute inset-0 rounded-full bg-neutral-800" />
        <m.div
          className="absolute inset-0 origin-left rounded-full bg-linear-to-r from-sky-500 via-indigo-500 to-violet-500"
          style={{ scaleX: reduced ? 1 : fill }}
        />
        {[0, 50, 100].map((at) => (
          <span
            key={at}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400 bg-neutral-950"
            style={{ left: `${String(at)}%` }}
          />
        ))}
      </div>
      <m.ol ref={listRef} {...IN_VIEW} variants={STAGGER} className="grid gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <m.li
            key={step.title}
            variants={RISE}
            className="relative rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <span className="absolute right-5 top-4 font-mono text-4xl font-bold text-neutral-800">
              {i + 1}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500/15 text-sky-400">
              <Icon name={step.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
            <p className="mt-1.5 text-sm text-neutral-400">{step.text}</p>
          </m.li>
        ))}
      </m.ol>
    </section>
  );
}

/** The rest of what's in the box, as icon cards. */
export function FeatureGrid() {
  return (
    <section aria-label="More features" className={SECTION}>
      <Heading
        eyebrow="Everything else"
        title="The tools a real edit needs"
        text="Built in, not bolted on."
      />
      <m.ul {...IN_VIEW} variants={STAGGER} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <m.li
            key={f.title}
            variants={RISE}
            whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 26 } }}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition-colors hover:border-neutral-700"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-500/15 text-sky-400">
              <Icon name={f.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-neutral-400">{f.text}</p>
          </m.li>
        ))}
      </m.ul>
    </section>
  );
}

/** What is planned but not here yet, said plainly. */
export function ComingNext() {
  return (
    <section aria-label="Coming next" className={`${SECTION} !py-0`}>
      <Reveal className="rounded-2xl border border-dashed border-neutral-700 p-6 lg:p-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">Coming next: AI editing</h2>
          <span className="rounded-full bg-amber-900/70 px-2.5 py-0.5 text-xs font-semibold text-amber-200">
            Not available yet
          </span>
        </div>
        <ul className="grid gap-6 md:grid-cols-3">
          {COMING.map((c) => (
            <li key={c.title}>
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon name="effect" className="h-4 w-4 text-neutral-500" /> {c.title}
              </h3>
              <p className="mt-1 text-sm text-neutral-400">{c.text}</p>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className={`${SECTION} max-w-3xl`}>
      <Heading eyebrow="FAQ" title="Questions, answered" />
      <Accordion.Root type="single" collapsible asChild>
        <m.div {...IN_VIEW} variants={STAGGER} className="flex flex-col gap-2">
          {FAQ.map((item) => (
            <Accordion.Item key={item.q} value={item.q} asChild>
              <m.div
                variants={RISE}
                className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center gap-4 px-5 py-4 text-left font-medium outline-none hover:bg-neutral-800/50 focus-visible:bg-neutral-800/50">
                    <span className="flex-1">{item.q}</span>
                    <Icon
                      name="chevronDown"
                      className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-data-[state=open]:rotate-180"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="lc-accordion-content text-sm text-neutral-400">
                  <div className="px-5 pb-4">{item.a}</div>
                </Accordion.Content>
              </m.div>
            </Accordion.Item>
          ))}
        </m.div>
      </Accordion.Root>
    </section>
  );
}
