# Templates (M9)

A template is a **project document whose placeholder clips are its slots** (`Clip.placeholder
{slotId, kind: media | text | color, label}`).

## Built-in templates (`packages/templates`)
20 originals, each a deterministic builder (`TemplateBuilder`) using only bundled fonts and generated
graphics — no third-party media:

| Category | Templates |
| --- | --- |
| Reels (9:16) | Hook + 3 cuts, Before / after, Top 3 countdown, Talking point, Product promo |
| Intros (16:9) | Clean title, Bold bars, Glitch logo, Handwritten hello |
| Lower thirds (16:9) | Classic name bar, Minimal line, Social handle, Breaking news |
| Slideshows | Memories (16:9), Square photo dump (1:1), Travel diary (16:9), Portfolio (16:9) |
| Quote cards | Serif quote (1:1), Quote on photo (4:5), Colour block quote (1:1) |

Every layer is its own track; motion comes from the ordinary preset generators and plain keyframes,
so everything stays editable. Builder: `mediaSlot`, `fill`, `rect`, `shape`, `text`, `captions`,
`audioTrack`, `preset`, `keys`, `build`.

## Slots (`slots.ts`)
- **Media slot**: a grey colour fill standing in for a picture. `replaceMediaOps` turns it into a
  media clip (remove + add with the same id, one batch): timing, effects, masks, opacity, blend and
  keyframes are kept; the picture **covers** the slot's box and is cropped to its shape; every scale
  value (static and keyframed) is rescaled by the same factor so zooms and pops stay as designed.
- **Text slot**: `setTextOps` changes the words, not the style or animators; caption slots are
  re-timed evenly.
- **Colour slot**: `setColorOps` on a fill, shape or text.
- `projectSlots(project)` lists them (one per slot id per composition).

## Using a template
`instantiateTemplate` gives compositions, tracks, clips, links and markers fresh ids (mattes and
nested-composition references follow; ids inside a clip stay, so keyframe paths stay valid), marks
clips `source: "template"` and sets `meta.templateId`. `POST /api/projects {doc}` stores it as a new
project (validated, new id and timestamps).

## Saved templates
`clip.markPlaceholder` / `clip.clearPlaceholder`, then `template.saveAs` → `POST /api/templates`
(`templates` table, Alembic `0004`). `GET /api/templates` lists yours; `DELETE` removes one.

## UI
Start screen: **Create** (New video 9:16 / 16:9 / 1:1 / 4:5, New photo) and the **template gallery**
(categories, shape, search, live thumbnails drawn by one shared engine at a third of the length).
Using a template opens the project in Simple mode on its **Template** tab (slots panel: pick media
from the library, type words, pick colours).

Actions: `template.use`, `template.delete`, `project.newVideo` (library); `template.replaceMedia`,
`template.setText`, `template.setColor`, `template.saveAs`, `clip.markPlaceholder`,
`clip.clearPlaceholder` (editor). Stickers (`STICKERS`, `sticker.add`) live in the same package.
