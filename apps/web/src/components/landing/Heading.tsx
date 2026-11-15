interface HeadingProps {
  eyebrow: string;
  title: string;
  text?: string;
}

/** A section's heading block: small label, title, one line of explanation. */
export function Heading({ eyebrow, title, text }: HeadingProps) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">{eyebrow}</p>
      <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {text !== undefined && <p className="mt-3 text-pretty text-neutral-400">{text}</p>}
    </div>
  );
}

/** The shared wrapper for a landing section: anchor target, width and spacing. */
export const SECTION = "mx-auto max-w-7xl scroll-mt-20 px-5 py-16 lg:px-8 lg:py-24";
