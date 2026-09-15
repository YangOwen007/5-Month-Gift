# Saved drawing equations

`sticker-v2.json` contains every equation used by the upgraded cat and lettering.
This is an archive only: the site does not display equation labels yet.

## Matching an equation to a visible line

Each shape has a stable `id`, such as `letter-06-A` or `speech-heart`.
Each ring contains segments with IDs such as
`speech-heart/ring-0/segment-3`. These are the same IDs constructed in
`main.js` when it prepares the drawing. `artwork.js` contains the same control
points, in the same ring and segment order.

- Coordinates use the original Cartesian world: **x right, y up**.
- Each segment's parameter is **0 ≤ t ≤ 1**.
- `x` and `y` are explicit parametric expressions. `^` means exponentiation.
- `controlPoints` stores the numerical source of each expression.
- Two control points define a line; four define a cubic Bezier curve.
- Multiple rings describe holes, such as the opening in **A**. Fill uses the
  even-odd rule, so these openings stay empty.
- A path's visible stroke also has a display thickness; that is a rendering
  style, separate from its saved centerline equation.

For a line from A to B:

`P(t) = (1-t)A + tB`

For a cubic with controls A, B, C, D:

`P(t) = (1-t)^3 A + 3(1-t)^2 t B + 3(1-t)t^2 C + t^3 D`

The cat uses smooth cubic curves fitted to the supplied sticker's contours.
The lettering uses closed outlines made by widening and joining the original
letter strokes. Its rounded outlines are saved as short line segments, so the
equations match the geometry actually rendered rather than an unrelated font.
The original lettering's heart is a closed, fillable shape.

## Original version

`original-v1-sampled.json` preserves all geometry received in the handoff:
401 cat strokes, 37 letter strokes, and the first heart chain. The handoff
contained sampled points, **not the original image-to-equations source formulas**.
No missing original formulas have been invented. Each consecutive pair of those
points defines the exact line segment rendered in version 1 using the line
equation above.

The complete original application is preserved in Git tag `v1-line-art`.

## Regeneration

`tools/rebuild-art.py` regenerates the vector artwork and both archives from
`assets/sticker-reference.png` and the `v1-line-art` tag. Its optional authoring
dependencies are documented in the script. There is no build step or Python
dependency when running or deploying the site.
