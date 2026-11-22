import {
  DoodleCrewScene,
  type CrewMember,
  type DoodleGlyph,
  type DoodleKind,
} from "../ui/doodle-crew-footer.tsx";

/** Light / dark theme colours for the doodle scene and footer (the neutral scale flips in light). */
export const DOODLE_PALETTE = {
  background: "var(--color-neutral-950)",
  ink: "var(--color-neutral-100)",
  accent: "var(--color-sky-400)",
};

export const DOODLE_SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

// The logo's colours. White letters in the logo use the ink colour (white in dark, ink in light).
const PLAIN = "var(--dcf-ink)";
const HOLE = "var(--dcf-bg)";
const TEAL = "#2dd4bf";

/** A U, 100 units wide, with 34-unit strokes. */
const U_PATH =
  "M0 -146 L34 -146 L34 -50 A16 16 0 0 0 66 -50 L66 -146 L100 -146 L100 -50 A50 50 0 0 1 0 -50 Z";

const gradient = (id: string, from: string, to: string, diagonal = true) => (
  <linearGradient id={id} x1="0" y1="0" x2={diagonal ? "1" : "0"} y2="1">
    <stop offset="0" stopColor={from} />
    <stop offset="1" stopColor={to} />
  </linearGradient>
);

/**
 * LUMACUT drawn after the logo (cap height 146): the purple film-strip L with its ribbon foot,
 * the folded orange M, the round a with a play button, the cut blue C, the teal U, and the T with
 * a slanted top and the sparkle.
 */
const GLYPHS: DoodleGlyph[] = [
  {
    char: "L",
    width: 214,
    draw: (uid) => (
      <>
        <defs>
          {gradient(`${uid}-lc-l`, "#7c4dff", "#b45cff")}
          {gradient(`${uid}-lc-l2`, "#b06bff", "#e39bff", false)}
        </defs>
        <path
          fill={`url(#${uid}-lc-l)`}
          d="M0 -222 L58 -204 L58 -40 C92 -42 120 -60 150 -62 C170 -63 184 -52 194 -36 L214 0 L20 0 C9 0 0 -9 0 -20 Z"
        />
        <path
          fill={`url(#${uid}-lc-l2)`}
          d="M58 -40 C92 -42 120 -60 150 -62 C170 -63 184 -52 194 -36 L214 0 L180 0 C178 -22 166 -38 150 -38 C120 -36 90 -24 58 -20 Z"
        />
        <path
          fill={HOLE}
          d="M18 -192 h22 v18 h-22 Z M18 -162 h22 v18 h-22 Z M18 -132 h22 v18 h-22 Z M18 -102 h22 v18 h-22 Z M18 -72 h22 v18 h-22 Z"
        />
      </>
    ),
  },
  { char: "U", width: 100, draw: () => <path fill={PLAIN} d={U_PATH} /> },
  {
    char: "M",
    width: 250,
    draw: () => (
      <>
        <path fill="#ffc04a" d="M0 0 L84 -146 L60 0 Z" />
        <path fill="#ff9a26" d="M84 -146 L128 -42 L60 0 Z" />
        <path fill="#ffb238" d="M128 -42 L186 -150 L176 0 Z" />
        <path fill="#ff7f16" d="M186 -150 L250 0 L176 0 Z" />
      </>
    ),
  },
  {
    char: "A",
    width: 148,
    draw: () => (
      <>
        <path
          fill={PLAIN}
          fillRule="evenodd"
          d="M1 -73 A73 73 0 1 0 147 -73 A73 73 0 1 0 1 -73 Z M34 -73 A40 40 0 1 1 114 -73 A40 40 0 1 1 34 -73 Z"
        />
        <path fill={PLAIN} d="M114 -146 L148 -146 L148 0 L114 0 Z" />
        <path
          d="M62 -94 L62 -52 L97 -73 Z"
          fill="none"
          stroke={PLAIN}
          strokeWidth="9"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    char: "C",
    width: 178,
    draw: (uid) => (
      <>
        <defs>{gradient(`${uid}-lc-c`, "#38d4ff", "#2f63ff", false)}</defs>
        <path
          fill={`url(#${uid}-lc-c)`}
          d="M128.9 -119.9 A73 73 0 1 0 73 0 L160 0 L178 -33 L73 -33 A40 40 0 1 1 103.6 -98.7 Z"
        />
      </>
    ),
  },
  {
    char: "U",
    width: 100,
    draw: (uid) => (
      <>
        <defs>{gradient(`${uid}-lc-u`, "#22d3ee", "#6ee7a0")}</defs>
        <path fill={`url(#${uid}-lc-u)`} d={U_PATH} />
      </>
    ),
  },
  {
    char: "T",
    width: 150,
    draw: () => (
      <>
        <path
          fill={PLAIN}
          d="M0 -104 L0 -130 L150 -160 L126 -118 L52 -108 L52 0 L18 0 L18 -104 Z"
        />
        <path
          fill={TEAL}
          transform="translate(-14 -190) scale(1.4)"
          d="M0 -14 C1.5 -4 4 -1.5 14 0 C4 1.5 1.5 4 0 14 C-1.5 4 -4 1.5 -14 0 C-4 -1.5 -1.5 -4 0 -14 Z"
        />
      </>
    ),
  },
];

// The crew lives on L-U-M-A-C-U-T (letters 0–6).
const CREW: CrewMember[] = [
  {
    kind: "clapper",
    letter: 0,
    seat: "front",
    offset: -0.77,
    name: "Clap",
    says: "Scene one, take one. Action!",
  },
  {
    kind: "bird",
    letter: 1,
    seat: "top",
    offset: 0,
    name: "Pip",
    says: "Clips so short, I tweet them.",
  },
  {
    kind: "reel",
    letter: 2,
    seat: "front",
    offset: -0.38,
    name: "Reel",
    says: "I've got a lot of footage.",
  },
  {
    kind: "camera",
    letter: 3,
    seat: "top",
    offset: 0,
    name: "Cami",
    says: "Smile! You're in the shot.",
  },
  {
    kind: "ghost",
    letter: 4,
    seat: "behind",
    offset: -0.09,
    name: "Boo",
    says: "Boo! …I'm just an adjustment layer.",
  },
  {
    kind: "cat",
    letter: 6,
    seat: "front",
    offset: 0.5,
    flip: true,
    name: "Patch",
    says: "Nice cursor. Mind if I scrub it?",
  },
];

const DOODLES: DoodleKind[] = [
  "play",
  "film",
  "scissors",
  "star",
  "sparkle",
  "play",
  "heart",
  "bolt",
];

/** The big doodle LUMACUT at the top of the landing page, drawn after the logo. */
export function LumacutScene({ className }: { className?: string }) {
  return (
    <DoodleCrewScene
      glyphs={GLYPHS}
      glyphCap={146}
      tracking={0.06}
      crew={CREW}
      doodles={DOODLES}
      doodleCount={10}
      palette={DOODLE_PALETTE}
      fontFamily={DOODLE_SANS}
      serifFamily={DOODLE_SANS}
      {...(className === undefined ? {} : { className })}
    />
  );
}
