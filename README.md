# VS CSS Icon Converter

Conservative CSS-to-SVG conversion for VS-style icons.

This repository contains an installable Codex AgentSkill and the deterministic Node.js CLI used by that skill. It reads CSS rules directly and converts a supported subset of icon geometry into transparent, `currentColor`-driven SVG candidates.

The converter is intentionally not a universal CSS renderer. Unsupported declarations are reported as `manual-review`; generated output must be compared with the browser-rendered CSS before it is promoted to a formal icon set.

## Quick start

```powershell
npm test

node scripts/convert-icons.mjs `
  --css "D:\Coding\VisualStandards\css\components-icon-basic.css" `
  --icon plus `
  --output "Temp\plus.svg" `
  --report "Temp\plus.report.json"
```

Install the skill by copying this repository folder into the Codex skills directory, or invoke it from a local skill path as `$vs-css-icon-converter`.

## Scope

Supported patterns include pseudo-elements, px geometry, borders, solid backgrounds, rectangular `linear-gradient` layers, polygon clip paths, simple rotation/mirroring, and `currentColor`. See [references/css-patterns.md](references/css-patterns.md) for the mapping and review rules.
