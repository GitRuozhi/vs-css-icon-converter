# Recognized CSS icon patterns

The converter intentionally targets a small, explainable subset of CSS rather than attempting to reproduce arbitrary browser layout.

## Geometry model

- The root icon is a square canvas. The default canvas is 16×16.
- A pseudo-element's `width`, `height`, `left`, `right`, `top`, and `bottom` are resolved against that canvas.
- `inset: 0` with `margin: auto` centers the element.
- CSS transforms are flattened into SVG polygon coordinates around the element center.

## Mappings

| CSS | SVG candidate |
| --- | --- |
| solid rectangular background | `<rect>` |
| `border-*` or `border` | filled border rectangles or a stroked rectangle |
| `linear-gradient(currentColor 0 0) ... / ...` | one `<rect>` per background layer |
| `clip-path: polygon(...)` | `<polygon>` |
| `rotate()` / `scaleX()` / `scaleY()` | transformed polygon points |
| `currentColor` | `fill="currentColor"` or `stroke="currentColor"` |

## Manual-review cases

The report marks an icon for review when it sees an unsupported selector or declaration, a non-linear background image, an unrecognized transform, a non-polygon clip path, or a CSS rule that has no renderable geometry.

Warnings are deliberately retained even when the tool can produce a partial SVG. A partial candidate is useful for inspection but must not be promoted without comparison.
