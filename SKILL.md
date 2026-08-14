---
name: vs-css-icon-converter
description: Convert CSS icon definitions into high-fidelity SVG candidates with deterministic geometry extraction and manual-review warnings. Use for CSS-to-SVG icon conversion or browser comparison when icons use pseudo-elements, CSS borders, gradients, clip-path polygons, simple transforms, or 16×16 design canvases.
---

# CSS to SVG Converter

Use the bundled Node CLI to convert selected CSS icon classes into SVG candidates. The converter reads CSS declarations and pseudo-element rules directly; it does not infer geometry from a screenshot and does not depend on layout2vector.

## Workflow

1. Identify the CSS file(s) containing the icon and the exact `.icon-name` selector. Include the project's global reset/foundation CSS when it defines root geometry; do not assume its `*` rule changes pseudo-element `box-sizing`.
2. Run the converter for one icon first:

   ```powershell
   node scripts/convert-icons.mjs `
     --css "D:\Coding\VisualStandards\css\foundations.css" `
     --css "D:\Coding\VisualStandards\css\components-icon-basic.css" `
     --icon plus `
     --output "Temp\plus.svg" `
     --report "Temp\plus.report.json"
   ```

   For a modifier state, keep the semantic icon name and pass the state separately:

   ```powershell
   node scripts/convert-icons.mjs `
     --css "D:\Coding\VisualStandards\css\components-icon-page.css" `
     --icon checkbox `
     --variant checked `
     --output "Temp\checkbox-checked.svg" `
     --report "Temp\checkbox-checked.report.json"
   ```

3. Inspect the report. Treat `status: "manual-review"` or any warning as a reason to inspect the SVG against a browser-rendered CSS source.
4. Render CSS and SVG at the same canvas size before accepting a batch. Do not replace formal assets automatically.
5. Only promote an SVG after visual comparison and user approval.

## Supported CSS

- `.icon-name`, `.icon-name::before`, and `.icon-name::after` rules
- absolute pseudo-elements with px dimensions and simple offsets
- `currentColor`, solid backgrounds, `border`, and individual borders
- `linear-gradient(currentColor 0 0) ... / ... no-repeat` layers used as rectangles
- `clip-path: polygon(...)`
- `rotate()`, `scaleX()`, and `scaleY()` transforms
- solid and dotted rectangular borders
- transparent-border CSS triangles
- `border-radius` on filled and stroked rectangles
- clipped rounded borders through SVG `clipPath`

The output uses a 16×16 viewBox by default, transparent background, and `currentColor`. The viewBox is the icon's design canvas; a non-default `.icon-name` box is centered inside that canvas before its relative `top` / `left` offset is applied. Do not add a global overflow override to conceal geometry errors. The tool applies the VS `border-box` root model, keeps pseudo-elements at their CSS-default `content-box` model unless explicitly overridden, resolves absolute children against the root padding box, flattens simple transforms, and uses the 2px/2px dotted-border rhythm. It reports unsupported declarations rather than hiding them.

## Guardrails

- Keep generated output separate from formal icon directories until reviewed.
- Never overwrite an existing output without `--force`.
- Preserve the report beside the SVG when converting a batch.
- Do not describe a result as converted successfully if the report says `manual-review`.
- CSS visual equivalence remains the acceptance criterion; the converter is intentionally conservative.

## CLI reference

```text
--css <file>       Repeatable CSS input file.
  --icon <name>      Icon class suffix without the `icon-` prefix.
  --variant <name>   Optional modifier state, such as `checked`.
--output <file>    SVG output path.
--report <file>    Optional JSON report path.
--size <number>    Square canvas size; default 16.
--force            Allow replacing an existing output.
```

For implementation details and recognized patterns, read `references/css-patterns.md`.
