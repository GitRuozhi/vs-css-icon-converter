# VS CSS Icon Converter

Convert CSS icon geometry into transparent, `currentColor` SVG candidates for review.

![Eight CSS icons and their corresponding SVG candidates: plus, zoom-in, transform, mirror-horizontal, checkbox-checked, link-connected, screenshot, and picture-adjust.](.github/assets/css-to-svg-8-icons.png)

A small Codex Skill plus a deterministic Node.js CLI. It reads CSS rules directly instead of tracing screenshots, so each candidate stays inspectable and can be compared with the browser-rendered source.

## Install as a Codex Skill

Clone this repository into your Codex skills directory, then restart or refresh Codex so it discovers the skill:

```text
<CODEX_HOME>/skills/vs-css-icon-converter
```

For example:

```sh
git clone https://github.com/GitRuozhi/vs-css-icon-converter.git ~/.codex/skills/vs-css-icon-converter
```

Then ask Codex to use `$vs-css-icon-converter`, or make a request such as “convert these CSS icons into SVG candidates and flag anything needing manual review.”

## CLI

Run one icon first and keep the JSON report beside the generated SVG:

```sh
node scripts/convert-icons.mjs --css ./icons.css --icon plus --output ./plus.svg --report ./plus.report.json
```

Add each relevant stylesheet with another `--css` argument. The CLI emits a transparent SVG and reports whether the result is converted or needs `manual-review`.

## Handles

- CSS icon rules and pseudo-elements
- Pixel geometry, borders, border radii, solid fills, and `currentColor`
- Rectangular `linear-gradient` layers, polygon `clip-path`, and simple transforms
- 16×16 canvas placement, including non-default root boxes
- Dotted borders as explicit SVG line segments

## Review is intentional

This is not a universal CSS renderer. Some browser layout behavior, advanced transforms, or unsupported declarations need a manual SVG correction. Treat every result as a reviewable candidate: compare it in a browser before adding it to a formal icon set.

See [SKILL.md](SKILL.md) for the agent workflow and [references/css-patterns.md](references/css-patterns.md) for the mapping and review rules.
