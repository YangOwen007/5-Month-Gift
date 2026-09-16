# 5 Month Gift

A static, dependency-free coordinate love note for Kathy.

**Live:** https://YangOwen007.github.io/5-Month-Gift/

## Storyboard

1. **Happy 5 months!** / **from ur chickenbutt** → **Play**.
2. Empty Cartesian guides (700 ms).
3. Zoom into the speech-bubble heart (2,600 ms).
4. Type a heart equation; the continuous heart stroke starts 500 ms later and
   draws for 5,200 ms. After both finish, the equation fades for 600 ms.
5. Pause (3,000 ms), beginning after the equation has faded.
6. Zoom out as the outlined **I L♥VE / KATHY / CHEN** and sticker draw with the
   original colored-version stagger, speed, and curve order. Four representative
   equations type as warm gray-tan text directly on the graph, leading their
   selected segments by 500 ms. There are no panels, pointers, or headings;
   equations stay on one line when they fit. At most two appear together.
7. Coloring starts at the end of the 15,900 ms reveal: the former 900 ms hold
   and 100 ms of settled reveal time have been removed (one second total).
8. White, pink, and gray colors sweep through the cat and thick letter shapes
   with staggered timing (6,500 ms).
9. Final hold → **Replay**, resetting every drawing and fill progress value.

The cat is traced from the supplied sticker, using smooth cubic Bezier curves.
The letters retain the original arrangement and are widened into closed shapes,
with joined intersections and preserved holes. Canvas draws exact curves even
while a stroke is incomplete; sampled arc lengths are used only for timing.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | Original page shell and warm UI |
| `main.js` | Camera, exact curve drawing, staggered color fill, Replay |
| `artwork.js` | Generated closed vector shapes and equation control points |
| `assets/sticker-reference.png` | Supplied sticker used for tracing |
| `equations/sticker-v2.json` | All current parametric equations, with stable IDs |
| `equations/original-v1-sampled.json` | All original handoff geometry |
| `equations/README.md` | Equation format, coordinate system, and ID mapping |
| `tools/rebuild-art.py` | Optional artwork/equation authoring tool |
| `tools/verify-animation.cjs` | Deterministic playback and equation smoke checks |
| `geometry.js`, `preview-final.png` | Original handoff data and original preview, retained for reference |

Floating equations show a representative curve or edge for five shapes,
including the opening heart. Their polynomials come from the saved control
points. Display coefficients are rounded to three decimals and marked **≈**;
the full-precision geometry and equation archives remain unchanged.

## Run locally

From the repository folder:

```sh
python -m http.server 8080
```

Open http://127.0.0.1:8080/ and press Play. No build step is required.

GitHub Pages publishes `main` / `/ (root)`.

## Restore the original version

The colored sticker version, before equation callouts and title changes, is
also saved locally and on GitHub as **`v2-colored-sticker`** (`8243e02`). To
restore that checkpoint, use the restore command below with
`--source=v2-colored-sticker` instead of `--source=v1-line-art`.

The exact verified original is saved locally and on GitHub as **`v1-line-art`**,
pointing to commit **`969a8a6`**. It can also be downloaded from the tag's archive.

To restore its application files without rewriting Git history:

```sh
git switch main
git restore --source=v1-line-art -- index.html style.css main.js geometry.js README.md
git add index.html style.css main.js geometry.js README.md
git commit -m "Restore original line-art gift"
git push origin main
```

The newer artwork and equation archives can remain for future use; the original
page does not load them. This restores the original visuals, timing, and Replay.

## Regenerate the artwork (optional)

The reference image and `v1-line-art` tag are the authoring inputs. See the
instructions at the top of `tools/rebuild-art.py` for its Python dependencies.
These tools are not needed by the site, GitHub Pages, or the visitor's browser.
