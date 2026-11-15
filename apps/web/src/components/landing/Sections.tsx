import { Accordion } from "radix-ui";
import { Link } from "react-router";
import { usePrefsStore } from "../../stores/prefs.ts";
import { ThemeSwitch } from "../home/ThemeSwitch.tsx";
import { Icon } from "../Icon.tsx";
import { Logo } from "../Logo.tsx";
import { COMING, FAQ, FEATURES, SECTIONS, STEPS } from "./content.ts";
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

export function CallToAction() {
  return (
    <section aria-label="Get started" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-600 via-indigo-600 to-violet-700 px-6 py-14 text-center text-white lg:py-20">
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Make your first video today
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/80">
          Create an account, pick a template or import your footage, and export when it looks right.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/register"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-white/90"
          >
            Get started <Icon name="arrowRight" />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-11 items-center rounded-xl border border-white/40 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Log in
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  return (
    <footer className="border-t border-neutral-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 lg:flex-row lg:items-start lg:px-8">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-neutral-500">
            Video, motion graphics and photo editing in one studio.
          </p>
        </div>
        <nav aria-label="Footer" className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Product
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-neutral-300 hover:text-sky-400">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Account
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <Link to="/register" className="text-neutral-300 hover:text-sky-400">
                  Create an account
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-neutral-300 hover:text-sky-400">
                  Log in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Appearance
            </h3>
            <ThemeSwitch theme={theme} onPick={setTheme} />
          </div>
        </nav>
      </div>
      <p className="border-t border-neutral-800 px-5 py-5 text-center text-xs text-neutral-500">
        © Lumacut
      </p>
    </footer>
  );
}
