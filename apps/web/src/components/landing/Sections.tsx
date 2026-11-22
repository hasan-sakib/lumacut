import { Accordion } from "radix-ui";
import { Icon } from "../Icon.tsx";
import { COMING, FAQ, FEATURES, STEPS } from "./content.ts";
import { Heading, SECTION } from "./Heading.tsx";

/** Import → Edit → Export. */
export function Steps() {
  return (
    <section id="how" className={SECTION}>
      <Heading eyebrow="How it works" title="From files to a finished video in three steps" />
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
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
          </li>
        ))}
      </ol>
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
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-700"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-500/15 text-sky-400">
              <Icon name={f.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-neutral-400">{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What is planned but not here yet, said plainly. */
export function ComingNext() {
  return (
    <section aria-label="Coming next" className={`${SECTION} !py-0`}>
      <div className="rounded-2xl border border-dashed border-neutral-700 p-6 lg:p-10">
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
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section id="faq" className={`${SECTION} max-w-3xl`}>
      <Heading eyebrow="FAQ" title="Questions, answered" />
      <Accordion.Root type="single" collapsible className="flex flex-col gap-2">
        {FAQ.map((item) => (
          <Accordion.Item
            key={item.q}
            value={item.q}
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
            <Accordion.Content className="px-5 pb-4 text-sm text-neutral-400">
              {item.a}
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}
