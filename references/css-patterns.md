# Recognized CSS icon patterns

The converter intentionally targets a small, explainable subset of CSS rather than attempting to reproduce arbitrary browser layout.

## Geometry model

- The root icon is a square canvas. The default canvas is 16×16.
- The root canvas follows the VS icon box (`border-box`); root borders are drawn inside the canvas.
- A pseudo-element's `width` and `height` are content-box dimensions unless it explicitly declares another `box-sizing`. Border widths therefore expand the visual box and affect `right`, `bottom`, and centered placement.
- A pseudo-element's `left`, `right`, `top`, and `bottom` are resolved against the containing icon box, including the visual size required by its borders.
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

For the VS 2px dotted-border pattern, the candidate uses a 2px dash and 2px gap so the SVG has the same visual rhythm as the browser-rendered CSS sample.

## Manual-review cases

The report marks an icon for review when it sees an unsupported selector or declaration, a non-linear background image, an unrecognized transform, a non-polygon clip path, or a CSS rule that has no renderable geometry.

Warnings are deliberately retained even when the tool can produce a partial SVG. A partial candidate is useful for inspection but must not be promoted without comparison.
