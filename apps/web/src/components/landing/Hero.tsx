import { Link } from "react-router";
import { Icon } from "../Icon.tsx";
import { COUNTS } from "./content.ts";
import { EditorMock } from "./EditorMock.tsx";
import { LumacutScene } from "./LumacutScene.tsx";

const FACTS = [
  "Runs in your browser",
  `${String(COUNTS.templates)} templates`,
  `${String(COUNTS.effects)} effects`,
  `${String(COUNTS.transitions)} transitions`,
];

/** The first screen: the doodle LUMACUT, what Lumacut is, the two ways in, and the editor. */
export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-12rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-linear-to-br from-sky-500/25 via-indigo-500/20 to-fuchsia-500/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-4 text-center lg:px-8 lg:pt-8">
        <LumacutScene className="mx-auto mb-6 max-w-6xl" />
        <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1 text-xs font-medium text-neutral-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          Video · Motion graphics · Photo
        </p>
        <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
          Edit video, motion and photos in{" "}
          <span className="bg-linear-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
            one studio
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-neutral-400 sm:text-lg">
          A timeline editor, a motion graphics tool and a photo editor that share one project and
          one engine. Nothing to install.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
        </div>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-400">
          {FACTS.map((fact) => (
            <li key={fact} className="inline-flex items-center gap-1.5">
              <Icon name="check" className="h-3.5 w-3.5 text-sky-400" /> {fact}
            </li>
          ))}
        </ul>
        <div className="mx-auto mt-14 max-w-5xl">
          <EditorMock />
        </div>
      </div>
    </section>
  );
}
