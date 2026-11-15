import { Tabs } from "radix-ui";
import { Icon } from "../Icon.tsx";
import { TOOLS } from "./content.ts";
import { Heading, SECTION } from "./Heading.tsx";

function VideoVisual() {
  const rows = [
    ["ml-[10%] w-[40%] bg-violet-500/70", "w-[20%] bg-violet-500/40"],
    ["w-[32%] bg-sky-500/80", "w-[24%] bg-sky-500/55", "w-[34%] bg-sky-500/80"],
    ["w-[55%] bg-sky-500/45", "w-[30%] bg-sky-500/70"],
    ["w-[88%] bg-emerald-500/40"],
  ];
  return (
    <div className="relative flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex h-9 gap-1.5 rounded-md bg-neutral-950 p-1">
          {row.map((bar) => (
            <span key={bar} className={`rounded ${bar}`} />
          ))}
        </div>
      ))}
      <span className="absolute inset-y-0 left-[46%] w-px bg-red-500" />
    </div>
  );
}

function MotionVisual() {
  return (
    <svg viewBox="0 0 320 180" className="w-full text-neutral-700">
      {[45, 90, 135].map((y) => (
        <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="currentColor" strokeDasharray="3 5" />
      ))}
      <path
        d="M20 150 C 90 150, 80 30, 160 30 S 240 120, 300 60"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M160 30 L 110 30 M160 30 L 210 30" stroke="#818cf8" strokeWidth="1.5" />
      {[
        [20, 150],
        [160, 30],
        [300, 60],
      ].map(([x, y]) => (
        <rect
          key={`${String(x)}-${String(y)}`}
          x={Number(x) - 6}
          y={Number(y) - 6}
          width="12"
          height="12"
          transform={`rotate(45 ${String(x)} ${String(y)})`}
          fill="#38bdf8"
        />
      ))}
      <circle cx="110" cy="30" r="4" fill="#818cf8" />
      <circle cx="210" cy="30" r="4" fill="#818cf8" />
    </svg>
  );
}

function PhotoVisual() {
  const layers = [
    ["Look: Warm film", "lut"],
    ["Headline", "text"],
    ["Portrait", "image"],
    ["Background", "layers"],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
      <div className="aspect-[4/3] rounded-lg bg-linear-to-br from-amber-300 via-rose-400 to-indigo-500" />
      <ul className="flex flex-col gap-1.5">
        {layers.map(([name, icon], i) => (
          <li
            key={name}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
              i === 0
                ? "border-sky-500 bg-sky-500/10 text-neutral-100"
                : "border-neutral-800 text-neutral-400"
            }`}
          >
            <Icon name="eye" className="h-3 w-3" />
            <Icon name={icon} className="h-3 w-3" />
            <span className="truncate">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VISUAL = { video: VideoVisual, motion: MotionVisual, photo: PhotoVisual };

/** "Three tools, one project": what each of the three editors does, as tabs. */
export function ToolTabs() {
  return (
    <section id="features" className={SECTION}>
      <Heading
        eyebrow="Features"
        title="Three tools, one project"
        text="Video, motion graphics and photos are all compositions drawn by the same engine, so what you learn in one works in the others."
      />
      <Tabs.Root defaultValue="video">
        <Tabs.List
          aria-label="Tools"
          className="mx-auto mb-8 flex w-fit gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1"
        >
          {TOOLS.map((tool) => (
            <Tabs.Trigger
              key={tool.id}
              value={tool.id}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium text-neutral-400 transition hover:text-neutral-100 data-[state=active]:bg-sky-600 data-[state=active]:text-white"
            >
              <Icon name={tool.icon} /> {tool.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TOOLS.map((tool) => {
          const Visual = VISUAL[tool.id];
          return (
            <Tabs.Content
              key={tool.id}
              value={tool.id}
              className="grid items-center gap-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 outline-none lg:grid-cols-2 lg:gap-12 lg:p-10"
            >
              <div>
                <h3 className="text-2xl font-bold tracking-tight">{tool.title}</h3>
                <p className="mt-2 text-neutral-400">{tool.text}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {tool.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm text-neutral-200">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-400">
                        <Icon name="check" className="h-3 w-3" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                aria-hidden="true"
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <Visual />
              </div>
            </Tabs.Content>
          );
        })}
      </Tabs.Root>
    </section>
  );
}
