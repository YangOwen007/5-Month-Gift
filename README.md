# 5 Month Gift

A static GitHub Pages animation: coordinate axes, a zoom into the cat’s speech-bubble heart, then the full **I L♥VE / KATHY / CHEN** lettering and cat sticker line art.

**Live URL:** https://YangOwen007.github.io/5-Month-Gift/

## Storyboard

1. Start screen with **Play**
2. Empty cartesian axes + faint grid
3. Camera zooms to the speech-bubble heart
4. One heart ink layer draws (camera follows the tip; speed eases in)
5. Pause (~3s)
6. Zoom out while letters + remaining cat curves draw with staggered timing
7. Final hold of the complete figure — **Replay** restarts cleanly

## Phase-1 heart curves

Speech-bubble heart (clean inner ink layer) = **Bezier indices `287`–`297`** (0-based into the 401 cat cubics from `cat_equations_only.txt` / the Bezier block of `final_equations_paste.txt`).

They are chained into one continuous stroke starting at the bottom tip:

`290 → 291 → 292 → 293 → 294 → 295 → 296 → 297 → 287 → 288 → 289`

Nested outer heart layers and the bubble outline draw later in the multi-draw phase.

## Local test

No build step. From this folder:

```bash
cd /workspace/5-month-gift   # or your clone root
python -m http.server 8080
```

Open http://127.0.0.1:8080/

## Files

| File | Role |
|------|------|
| `index.html` | Page shell + start overlay |
| `style.css` | Warm romantic UI |
| `main.js` | Camera, timing, stroke animation |
| `geometry.js` | Parsed letter segments + sampled Beziers |
| `preview-final.png` | Optional static preview of final composition |

## GitHub Pages

Repo: https://github.com/YangOwen007/5-Month-Gift  

Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.

## Geometry source

Built from `/workspace/desmos-cat-exact/final_equations_paste.txt` (37 letter eqs + 401 cubic Beziers) and `cat_equations_only.txt`. World ≈ `x ∈ [0.5, 17]`, `y ∈ [0.5, 10]`.
