# Recognized CSS icon patterns

The converter intentionally targets a small, explainable subset of CSS rather than attempting to reproduce arbitrary browser layout.

## Geometry model

- The root icon is a square canvas. The default canvas is 16×16.
- The root canvas follows the VS icon box (`border-box`); root borders are drawn inside the canvas and non-default root boxes are centered in the canvas.
- Pseudo-elements use `content-box` by default because a global `*` rule does not change their non-inherited `box-sizing`; an explicit pseudo-element declaration overrides this default.
- A pseudo-element's `left`, `right`, `top`, and `bottom` are resolved against the root element's padding box, including the visual size required by its borders.
- `inset: 0` with `margin: auto` centers the element.
- When `inset: 0` is combined with one explicit side and `margin: auto`, the remaining axis is still centered and the explicit side is treated as an offset within the remaining space.
- Non-default root boxes are centered inside the 16×16 canvas first; relative root offsets (`top` / `left`) are then applied from that centered position.
- Border-box declarations subtract border widths from the content geometry before placing borders and pseudo-elements.
- CSS transforms are flattened into SVG polygon coordinates around the element center.
- A transformed polygon clip is emitted as the filled polygon itself, so the untransformed CSS element rectangle cannot incorrectly clip the rotated result.
- The SVG `viewBox` is the design canvas. Do not globally set `overflow="visible"`; if CSS geometry falls outside the intended canvas, resolve it against the VS reference or mark it for manual review.

## Mappings

| CSS | SVG candidate |
| --- | --- |
| solid rectangular background | `<rect>` |
| `border-*` or `border` | filled border rectangles or a stroked rectangle |
| `linear-gradient(currentColor 0 0) ... / ...` | one `<rect>` per background layer |
| `clip-path: polygon(...)` | `<polygon>` |
| `rotate()` / `scaleX()` / `scaleY()` | transformed polygon points |
| transparent border sides with zero content box | filled SVG triangles |
| `border-radius` | SVG `rx` / `ry` |
| border plus `clip-path` | stroked rectangle with an SVG clip path |
| `currentColor` | `fill="currentColor"` or `stroke="currentColor"` |

For the VS 2px dotted-border pattern, each SVG side is emitted as an independent line with a 2px dash and 2px gap. The line center stays half a border width inside the box, while its dash path starts at the CSS border-box endpoint; this preserves the browser's endpoint phase and avoids a continuous path phase around the corners.

Selector matching is boundary-aware. `.icon-next` does not collect `.icon-next-frame`, and a modifier such as `.icon-checkbox.checked::after` is included only when `--variant checked` is requested.

## Manual-review cases

The report marks an icon for review when it sees an unsupported selector or declaration, a non-linear background image, an unrecognized transform, a non-polygon clip path, or a CSS rule that has no renderable geometry.

Warnings are deliberately retained even when the tool can produce a partial SVG. A partial candidate is useful for inspection but must not be promoted without comparison.
