# PosterWall agent guide

PosterWall is a static editor and browser-free CLI for framed poster compositions.

## Workflow

1. Read `README.md`, `docs/project-format.md`, and `schema/project.schema.json`.
2. Use the user's provided or authorized local images. Do not fetch remote images or add uploads, telemetry, keys, or a backend.
   When the user needs help finding covers, consult `docs/cover-sources.md` for sources and edition-matching guidance. The web editor exposes the same sources through “找封面”; these are external links, not remote image inputs.
3. Run `npm ci` if needed; Node.js 22+ is required.
4. Configure the two independent layers: `subject` (arrangement outline and placement) and optional `base` (mounting paper, frame, and background image). `settings.template` and `settings.columns` are legacy import fields, ignored by the level layout.
5. Run `npm run render -- --input project.json --output output/wall.png --scale 2 --project output/wall.posterwall.json`.
6. Inspect the output for clipping, margins, shape, background, and text. Deliver the image and portable project. Do not publish without the user's instruction.

## Data contract

- Version is 1. `images` holds at most 100 unique-ID source images. A background is separate in `base.background` and does not count as a source tile.
- Each source image has optional `selected` (boolean, default true for existing projects). Web imports start unselected; check a thumbnail or use select all to include it. Only selected sources affect capacities, ratio checks, repetition and rendering. Keep all library assets and selection states in drafts and portable projects; the shared renderer and CLI honor selection. Returned tile indices still refer to the full input image array.
- `subject.placement`: null by default, or `{ key, images }` for manual fixed-template placement. Key joins tileRatio/shape/granularity/count/seed with `/`; images lists a selected source ID for every slot. Ignore stale keys, missing/deselected sources, count mismatches and duplicates without repeat. Native mode ignores it. The editor clears invalid maps; canvas/base/position changes preserve them. Dragging library art replaces one slot (and selects that source); with repeat off, already-used art swaps with the target instead. Preview-to-preview swaps affect two instances only. Preserve assignments in drafts, exports and CLI; `renderWall` returns each tile's `imageId`.
- `subject.shape`: `square`, `portrait`, `landscape`, `heart`, `circle`, `arch`.
- `subject.scale`: 0.3–1. `subject.x` / `subject.y`: 0–1 placement within the available mounting area. Web position sliders display percentages, with 50% centered; “居中” resets both axes to 0.5.
- `subject.granularity`: legacy JSON name for UI “层级”, integer 1–4, default 1. Web templates have exactly N distinct sizes. Fixed templates use one standard source aspect per project and never justify rows or images. The UI preserves the selected level. Native agent mode retains mixed-aspect height palettes and may reduce levels when symmetric pairing is impossible. `subject.repeat`: default false; unlocks capacities exceeding the available source count without changing the options or selected count. Assets are stored once.
- `subject.count`: null or integer 1-600 for legacy/native compatibility. Fixed templates use exact catalogue counts, never above 200. Every shape/format/level offers six fixed capacities, except one-size rectangular families mathematically limited to two or five counts below 200. Favor readable compositions; small tiers need not have single-digit counts. Insufficient-source options stay visible and disabled until repeat is enabled. null chooses the largest tier fitting the available sources, or the smallest tier if none fits. Use the first min(count, sourceCount) sources; balance reuse when count exceeds sourceCount. Retain every source asset. Native mode keeps its legacy density budgets and 600 limit. CLI: --count.
- `base.preset`: `none`, `white`, `paper`, `black`, `gallery`. `base.mat`: legacy 0–80 px, default 0; removed from the editor. Use subject.scale for whitespace. `base.shadow`: boolean. `base.background`: null or an image object.
- `none` exports real PNG alpha, ignores mat and shadow, and normalizes background to null. JPG is rejected in this mode. Preview checkerboards are CSS only and must never enter the exported bitmap.
- Each image needs `src`; optional `id`, `title`, `focusX`, `focusY` (0–1). Subject images are shown in full at their original aspect ratio unless subject.crop is explicitly enabled for a fixed template. focusX/focusY control the crop only when subject.crop is explicitly enabled (and continue to control background cropping).
- JSON local paths resolve relative to the input file. CLI `--background` resolves relative to cwd. Use PNG/JPEG/WebP or embedded data URLs. No network URLs or SVG.
- `settings.template` / `settings.columns`: retained for v1 compatibility, ignored in the current composition. The UI has no arrangement selector. `seed` determines band groupings, stacks and source order; repeated regions shuffle equal-aspect sources independently without changing symmetry.
- `settings.ratio`: `portrait`, `square`, `story`, `landscape` describes the final canvas, independently of the subject's shape.
- The web editor has no text controls and disables `showHeader` and `showCaptions` when loading projects or drafts. Preserve legacy text metadata in portable files. Agent / CLI may use the compatible text fields for custom compositions. Never add automatic decorative counters or slogans.
- Old v1 projects remain readable; missing layers use the new defaults, so compositions reflow. Legacy `settings.theme` is retained for import; base colors use `base.preset`.
- `--project` embeds ALL assets including the background. Keep this portable format interoperable with the web editor.
- Install CJK fonts on Linux or pass `--font`. Do not deliver missing-glyph output.
- CLI output files can be overwritten. Protect input JSON, source images, and background; choose a new output name when revisions should be retained.

## Implementation

- Web mode uses subject.tileRatio = portrait (2:3), landscape (3:2), or square (1:1). subject.crop defaults false. Reject incompatible source ratios until the user explicitly enables cropping. The silhouette is never clipped. Native arbitrary-ratio mode is available to agents only.
- `src/fixed-layout.js` selects precomputed templates and assigns sources with balanced quotas and penalties for adjacent repeats. `src/fixed-templates.js` is generated by `npm run build-templates`, with capacity targets defined in `src/quantity-presets.js`. Rectangular outlines must be exact, with no stepped outside edges. Repeat and non-repeat share the same exact capacities; do not silently change levels. The web editor maps obsolete capacities to an available tier when opening old projects or changing shape/format/level; switching repeat off keeps the selected count and explains any source shortage.
- `src/model.js`: normalization, defaults and allowed enums. `projectAssets()` returns source images plus the optional background.
- `src/placement.js`: validates manual slot assignments, creates replacement/swap edits and chooses a different random layout while keeping shape, level and count. `src/preview-editor.js`: drag/drop and click-based preview editing; overlays never enter exported images. Random layout clears manual placement, preserves library order, prefers a different geometry, and falls back to a different art order for uniform grids.
- `src/preview-zoom.js`: view-only zoom (10–200%, initially fit), scrolling and canvas panning with Space or the middle mouse button. Zoom and pan stay outside project data and exported pixels. Preserve the current view during placement edits; constrain drop hit-testing to the visible stage as well as scaled tile bounds.
- Apply manual edits with `applyPlacement`: select incoming IDs and deselect displaced IDs only when their last slot is removed; preserve other selected candidates. Explicit checkbox/select-all changes clear manual placement. Compute material usage badges from successfully rendered slots, clear them on empty/invalid previews, and show repeat counts above one over the existing accessible checkbox. Undo, drafts and portable projects retain the selection changes.
- `src/demo.js`: original geometric cover generator shared by the web demo and review scripts. `npm run preview` regenerates `docs/preview.png`. Public examples and documentation previews use these generated designs. Local collections and exported projects are ignored by Git; build assets are explicitly selected in `scripts/build.mjs`.
- `src/layout.js`: rectangular arrangements.
- `src/levels.js`: quantity tiers and layout dispatch. `src/mosaic.js`: native-ratio columns, whole-cell silhouette selection and interlocking 1x1 to 4x4 merges. No clipping, overlap or internal gaps. `src/native-bands.js`: bounded band allocation for non-repeat and many distinct ratios. Strict preservation of native ratios takes precedence over shape fidelity when source constraints conflict.
- `settings.gap` remains readable for legacy imports but is ignored by current rendering. Always join complete image edges. Snap shared boundaries to the same output pixel, symmetrically on heart X and circle X/Y. Never restore the gap control or legacy film strips.
- `src/heart.js`: shared rounded heart geometry for row layouts and granular packing. Heart compositions use a 1.12:1 bounding box, a shallow center notch and rounded shoulders. Geometry is used only to place whole rectangles.
- `src/shapes.js`: whole rectangular image packing, optional repeated source indices, and placement within the mount. Never use silhouette paths, masks, or polygon clipping to create a shape. Preserve all source corners and aspect ratios by default, and prevent image overlap. Individual-image cropping is allowed only with subject.crop; shape masks remain forbidden. Small collections naturally give simpler outlines when repetition is disabled.
- `src/render.js`: shared browser / CLI Canvas 2D renderer. Signature: `renderWall(canvas, project, images, scale, backgroundImage)`.
- Update schema, HTML controls, documentation and meaningful tests when extending a shape or base.
- Keep UI chrome black/white/neutral gray. Use concise, legible labels; no tiny captions or decorative copy. Poster art and the selected base may have their own colors.
- Keep supplied image data and legacy focus fields when importing projects. New fields must have documented defaults.

## Verification

Run `npm run check`, `npm test`, `npm run build` after changes. Visually inspect PNGs. Run `npm run review-layouts` for all 420 format/shape/level/capacity previews. Test whole image corners, separation, real alpha, dense collections and background round trips. Verify browser uploads, controls, exports and mobile layout with a connected browser. No browser launch is needed for CLI generation. Publish only `dist/`; never put private images, output projects, or Git files into the public build.
