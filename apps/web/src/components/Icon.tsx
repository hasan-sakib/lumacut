/** Small inline icon set (no icon-font dependency). Decorative: callers provide the label. */

const PATHS: Record<string, string> = {
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  search: "m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  retry: "M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 3l3-4M19 9A7 7 0 0 0 7 6L4 10",
  resume: "M8 5v14l11-7z",
  cancel: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
  play: "M7 4v16l13-8z",
  pause: "M8 5v14M16 5v14",
  stepBack: "M17 5v14M15 5l-9 7 9 7z",
  stepForward: "M7 5v14M9 5l9 7-9 7z",
  skipBack: "M11 5l-8 7 8 7zM21 5l-8 7 8 7z",
  skipForward: "M13 5l8 7-8 7zM3 5l8 7-8 7z",
  skipStart: "M5 5v14M19 5l-10 7 10 7z",
  skipEnd: "M19 5v14M5 5l10 7-10 7z",
  plus: "M12 5v14M5 12h14",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  split: "M12 3v18M7 8 3 12l4 4M17 8l4 4-4 4",
  copy: "M9 9h11v11H9zM5 15V4h11",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  unlink: "M10 14a4 4 0 0 0 5.7 0M14 10a4 4 0 0 0-5.7 0M4 4l16 16",
  marker: "M6 3h12v18l-6-4-6 4z",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
};

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.file} />
    </svg>
  );
}
