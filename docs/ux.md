# Discoverability and modes (M9)

## Simple and Pro
A per-browser preference (`stores/prefs.ts`), never stored in the project; `mode.simple`,
`mode.pro`, `mode.toggle` (Alt+S), and a Simple | Pro switch in the header.
- **Simple:** big-buttons bar (Template, Add media, Split, Speed, Text, Effects, Stickers, Captions,
  Audio, Export, Shape), side tabs Template / Media / Effects / Text / Stickers / Properties /
  Exports, a Toolbar with only history, playback and zoom, no graph editor or mixer dock, the
  Inspector in Basic only with an **"Advanced settings applied"** chip (keyframes, masks, mattes,
  several effects, grading, blend, motion blur, animators, audio effects) that opens Pro.
- **Magnetic main track:** in Simple mode, after every action and timeline gesture the bottom
  picture track is packed (`packMainTrackOps`), in the same undo step (shared `coalesceKey`).
  `main.closeGaps` does it on demand in Pro.
- `project.setAspect` (9:16 / 16:9 / 1:1 / 4:5) resizes the canvas keeping everything centred
  (animated positions shift too); auto-reframe is M11.

## Browser and palette
`components/browser/Browser.tsx` lists effects, transitions, audio effects, motion presets and looks
(`browser/items.ts`), with search, **favourites** (☆) and **recents** (12), and a **live hover
preview**: after 150 ms the item's action is executed without committing, its ops applied to a copy
of the project (`applyOp`) and that copy handed to the preview; leaving the item (or any edit)
drops it. Not while playing. The command palette also lists these items (through their actions
with arguments) when something is typed.

## Workspaces
`workspace.edit` (Alt+1), `.motion` (Alt+2, graph editor), `.color` (Alt+3, scopes), `.audio`
(Alt+4, mixer), `.photo` (Alt+5, photo projects): each sets the side tab and the bottom dock and
switches to Pro. `workspace.save {name}` stores the current arrangement (per browser);
`workspace.use`, `workspace.delete`; a Workspace menu in the header.

## Onboarding
A five-step guided tour with a spotlight (`data-tour` anchors: panels, mode, preview, palette,
export), shown once per browser; `help.tour` replays it. The library shows a **Getting started**
checklist (template, replace a slot, captions, export) that ticks itself when those actions succeed.

## Tooltips and inspector search
Every icon button is a registry `ActionButton` or wrapped in `<Tip>` (name, description, shortcut);
text buttons that run actions carry the action's description. The Inspector search now also filters
the generated sections (effects, transition, text, masks, matte, audio effects, shape, captions).

## Start screen and theme

The start screen (`/`) is a shell: a sidebar (logo, New project, Home / Projects / Templates / Media, theme, account), a top bar (section title, search for the current section, section buttons) and the section's content. Sections switch in place; every nav item, the theme buttons and the project menu run registry actions (`home.show*`, `theme.*`, `project.open`, `project.delete`, `project.new`).

- **New project** opens one chooser: a video in a shape (9:16, 16:9, 1:1, 4:5), a photo (blank, or from one of your images), or a template.
- **Projects** are cards (kind, name, last edited) with search, a kind filter, sort and a ⋯ menu (Open, Delete with confirmation).
- **Theme** is Light, Dark or System, a per-browser preference. Components are written against the dark `neutral` scale; the light theme remaps that scale in `index.css` rather than restyling each component. The editor is always dark.
