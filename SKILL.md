---
name: vs-css-icon-converter
description: Convert CSS icon definitions into transparent, currentColor-driven SVG candidates with deterministic geometry extraction, explicit manual-review warnings, and optional browser comparison. Use when converting VS or similar CSS icons that use pseudo-elements, borders, gradients, clip-path polygons, and simple transforms into SVG files.
---

# VS CSS Icon Converter

Use the bundled Node CLI to convert selected CSS icon classes into SVG candidates. The converter reads CSS declarations and pseudo-element rules directly; it does not infer geometry from a screenshot and does not depend on layout2vector.

## Workflow

1. Identify the CSS file(s) containing the icon and the exact `.icon-name` selector.
2. Run the converter for one icon first:

   ```powershell
   node scripts/convert-icons.mjs `
     --css "D:\Coding\VisualStandards\css\components-icon-basic.css" `
     --icon plus `
     --output "Temp\plus.svg" `
     --report "Temp\plus.report.json"
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

The output uses a 16×16 viewBox by default, transparent background, and `currentColor`. The tool reports unsupported declarations rather than hiding them.

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
--output <file>    SVG output path.
--report <file>    Optional JSON report path.
--size <number>    Square canvas size; default 16.
--force            Allow replacing an existing output.
```

For implementation details and recognized patterns, read `references/css-patterns.md`.
