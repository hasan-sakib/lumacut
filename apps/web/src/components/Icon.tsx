/** Small inline icon set (no icon-font dependency). Decorative: callers provide the label. */

const PATHS: Record<string, string> = {
  keyframe: "M12 3l9 9-9 9-9-9z",
  brush: "M18 3l3 3-9 9-3-3zM9 12c-3 0-4 2-4 4 0 2-1 3-2 4 3 1 8 0 8-4",
  eraser: "M8 20h12M5 15 15 5l5 5-9 9H8zM9 11l5 5",
  marquee:
    "M4 4h2M9 4h2M14 4h2M19 4h1v1M20 9v2M20 14v2M20 19v1h-1M15 20h-2M10 20H8M5 20H4v-1M4 15v-2M4 10V8",
  ellipseMarquee: "M12 4c4.5 0 8 3.6 8 8s-3.5 8-8 8-8-3.6-8-8 3.5-8 8-8z",
  lasso: "M12 5c4.4 0 8 1.8 8 4s-3.6 4-8 4-8-1.8-8-4 3.6-4 8-4zM8 13c-1 1-1 3 1 4s3 2 2 4",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14",
  hand: "M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-5-1.5-6.5-4L3 13a1.5 1.5 0 0 1 2.4-1.7L9 15",
  maskBrush: "M4 4h16v16H4zM12 4a8 8 0 0 0 0 16zM18 3l3 3-5 5-3-3z",
  eyeOff:
    "M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.5 7.5C3.6 9.3 2 12 2 12s4 6 10 6c1.4 0 2.7-.3 3.9-.8M9.9 9.9a3 3 0 0 0 4.2 4.2",
  unlock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  group: "M3 7h6l2 2h10v10H3zM3 7v12",
  download: "M12 4v12m0 0-4-4m4 4 4-4M4 18v2h16v-2",
  pen: "M12 19l7-7-4-4-7 7-1 5zM15 8l1-1a2 2 0 0 1 3 3l-1 1M6 18l-2 2",
  layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  shape: "M4 20h9L8.5 11zM15 4h5v5h-5zM17.5 12a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  effect:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z",
  lut: "M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16",
  graph: "M3 20h18M4 17c4 0 4-10 8-10s4 10 8 10",
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
  select: "M5 3l14 8-6 2-2 6z",
  trim: "M8 4v16M16 4v16M3 12h5m8 0h5",
  zoomIn: "M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14ZM11 8v6M8 11h6",
  zoomOut: "M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14ZM8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  magnet: "M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z",
  mute: "M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6",
  solo: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9.5C9 8.7 9.8 8 11 8h2c1.2 0 2 .7 2 1.5S14.2 11 13 11h-2c-1.2 0-2 .7-2 1.5S9.8 15 11 15h2c1.2 0 2-.7 2-1.5",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  menu: "M4 6h16M4 12h16M4 18h16",
  blur: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11zM9.5 15a2.5 2.5 0 0 0 2.5 2.5",
  distort: "M3 7c3-3 6 3 9 0s6 3 9 0M3 12c3-3 6 3 9 0s6 3 9 0M3 17c3-3 6 3 9 0s6 3 9 0",
  key: "M14.5 9.5a4.5 4.5 0 1 0-4 4.4L4 20.5V17h2v-2h2l1.2-1.2M15.5 8.5h.01",
  generate: "M4 4h16v16H4zM4 14l5-5 4 4 3-3 4 4",
  sliders: "M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M14 5v4M8 10v4M16 15v4",
  transition: "M3 5h8v14H3zM13 5h8v14h-8zM9 12h6m0 0-2-2m2 2-2 2",
  motion: "M3 12h4M9 12h3M17 8l4 4-4 4M14 12h7",
  motionIn: "M3 12h10m0 0-4-4m4 4-4 4M17 5v14M21 5v14",
  motionOut: "M11 12h10m0 0-4-4m4 4-4 4M3 5v14M7 5v14",
  dynamics: "M3 18h3l4-12 4 12 2-5h5",
  space:
    "M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z",
  folder: "M3 6h6l2 2h10v11H3z",
  template: "M4 4h16v6H4zM4 14h7v6H4zM15 14h5M15 18h5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  sort: "M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.5 3.6-6 8-6s8 2.5 8 6",
  check: "M5 12l5 5 9-10",
  reel: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10.5 9.5v5l4-2.5z",
  chevronRight: "M9 6l6 6-6 6",
  arrowRight: "M5 12h14m0 0-5-5m5 5-5 5",
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
