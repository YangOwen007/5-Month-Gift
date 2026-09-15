"""Optional authoring tool: trace the supplied sticker and widen the original letters.

The published site uses only the generated artwork.js; Python is not a runtime
dependency. To regenerate: pip install numpy scipy opencv-python-headless shapely
then python tools/rebuild-art.py. The v1-line-art tag preserves the original data.
"""

import base64
import gzip
import json
import re
import subprocess
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
# Match each sampled ring to its exact cubic equations for future labels.
RING_CURVES = {}


def smooth_ring(contour, sigma=1.4):
    """Remove pixel stair steps without losing the sticker's hand-drawn character."""
    points = contour.reshape(-1, 2).astype(float)
    points = gaussian_filter1d(points, sigma, axis=0, mode="wrap")
    # A subpixel simplification keeps the downloadable geometry compact.
    points = cv2.approxPolyDP(points.astype(np.float32), 0.22, True).reshape(-1, 2)
    points = np.roll(points, -int(np.argmax(points[:, 1])), axis=0)
    # Rounded interpolation through the reduced points avoids angular tracing.
    samples, curves = [], []
    def world(point):
        return [round(9.65 + float(point[0]) * 0.023, 6), round(8.9 - float(point[1]) * 0.023, 6)]
    for i in range(len(points)):
        a, b, c, d = [points[j % len(points)] for j in (i - 1, i, i + 1, i + 2)]
        curves.append([world(p) for p in [b, b + (c - a) / 6, c - (d - b) / 6, c]])
        for t in np.linspace(0, 1, max(3, int(np.linalg.norm(c - b) * 1.4)), endpoint=False):
            samples.append(0.5 * ((2 * b) + (-a + c) * t +
                (2 * a - 5 * b + 4 * c - d) * t**2 + (-a + 3 * b - 3 * c + d) * t**3))
    # Uniform scale preserves the source sticker's proportions.
    ring = [[round(9.65 + float(x) * 0.023, 4), round(8.9 - float(y) * 0.023, 4)] for x, y in samples]
    ring.append(ring[0])
    RING_CURVES[id(ring)] = curves
    return ring


def trace(mask, minimum_area=12, sigma=1.4):
    """Return polygons with holes; even-odd filling keeps eyes and mouth openings intact."""
    contours, hierarchy = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    shapes = []
    if hierarchy is None:
        return shapes
    for i, contour in enumerate(contours):
        if hierarchy[0, i, 3] != -1 or cv2.contourArea(contour) < minimum_area:
            continue
        rings = [smooth_ring(contour, sigma)]
        child = hierarchy[0, i, 2]
        while child != -1:
            if cv2.contourArea(contours[child]) >= minimum_area:
                rings.append(smooth_ring(contours[child], sigma))
            child = hierarchy[0, child, 0]
        shapes.append(rings)
    return shapes


def shape(name, rings, color, kind, fill_at, draw_at=0):
    # A two-control-point segment is a line; four control points define a cubic.
    curves = [RING_CURVES.get(id(ring), [[a, b] for a, b in zip(ring, ring[1:])]) for ring in rings]
    return dict(name=name, rings=rings, curves=curves, color=color, kind=kind, fillAt=fill_at, drawAt=draw_at)


# Read the exact original lettering from the remote-backed rollback checkpoint.
old_js = subprocess.check_output(["git", "show", "v1-line-art:geometry.js"], cwd=ROOT).decode()
old = json.loads(gzip.decompress(base64.b64decode(re.search(r'const b64 = "([^"]+)"', old_js)[1])))
groups = [("I", 0, 3), ("L", 3, 5), ("love-heart", 5, 6), ("V", 6, 8), ("E", 8, 12),
          ("K", 12, 15), ("A", 15, 18), ("T", 18, 20), ("H", 20, 23), ("Y", 23, 26),
          ("C", 26, 27), ("H", 27, 30), ("E", 30, 34), ("N", 34, 37)]
letters = []
for i, (name, start, end) in enumerate(groups):
    # Union the thickened strokes so intersections have no seams or double edges.
    if name == "love-heart":
        region = Polygon(old["letters"][start]["points"]).buffer(0)
    else:
        region = unary_union([LineString(s["points"]).buffer(0.105, quad_segs=12)
                              for s in old["letters"][start:end]])
    polygons = list(region.geoms) if region.geom_type == "MultiPolygon" else [region]
    rings = []
    for polygon in polygons:
        rings += [[[round(x, 4), round(y, 4)] for x, y in r.coords]
                  for r in [polygon.exterior, *polygon.interiors]]
    row = 0 if i < 5 else 1 if i < 10 else 2
    letters.append(shape(f"letter-{i:02d}-{name}", rings, "#ee91b2" if name == "love-heart" else
                         ["#f4b7cd", "#f6c7d7", "#eaa8c2"][row], "letter", 0.08 + i * 0.029, i * 0.025))

# Separate the supplied sticker's silhouette, ink, pink accents, and gray details.
image = cv2.imread(str(ROOT / "assets" / "sticker-reference.png"))
b, g, r = [channel.astype(float) for channel in cv2.split(image)]
foreground = (g > 110).astype(np.uint8)
contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
silhouette = np.zeros(g.shape, np.uint8)
cv2.drawContours(silhouette, [max(contours, key=cv2.contourArea)], -1, 1, cv2.FILLED)
ink = (g < 105) & (silhouette > 0)
pink = (r - g > 25) & (r > 140) & (b > 100)
# Keep gray marks away from antialiased dark edges; those edges are already traced.
distance = cv2.distanceTransform((~ink).astype(np.uint8), cv2.DIST_L2, 3)
gray = (g > 120) & (g < 218) & (abs(r - g) < 18) & (distance > 2.0) & (silhouette > 0)
gray_regions = np.zeros(g.shape, np.uint8)
for x0, y0, x1, y1 in [(188, 112, 238, 146), (198, 225, 226, 250), (236, 198, 273, 217), (132, 174, 174, 197)]:
    gray_regions[y0:y1, x0:x1] = gray[y0:y1, x0:x1]

cat = [shape("sticker-white", [smooth_ring(max(contours, key=cv2.contourArea), 2.0)], "#fffdfc", "paper", 0.0, 0.06)]
for i, rings in enumerate(trace(ink)):
    cat.append(shape("ink-" + str(i), rings, "#292428", "ink", 0.06 + i * 0.012, 0.08 + i * 0.025))
for i, rings in enumerate(trace(gray_regions, 8, 1.1)):
    cat.append(shape("fur-" + str(i), rings, "#c2c0c0", "gray", 0.34 + i * 0.016, 0.28 + i * 0.014))

heart = None
for i, rings in enumerate(trace(pink, 15, 1.6)):
    points = rings[0]
    # The speech-bubble heart is the only pink region at the upper left.
    is_heart = max(p[0] for p in points) < 12 and min(p[1] for p in points) > 6
    if is_heart:
        # smooth_ring starts at the bottom, keeping the original heart-first story.
        heart = shape("speech-heart", [points], "#f4b5cd", "heart", 0.49)
    else:
        cat.append(shape("blush-" + str(i), rings, "#f2b0c8", "pink", 0.44 + i * 0.024, 0.34 + i * 0.024))

assert heart is not None, "The speech-bubble heart must be traced successfully"
artwork = dict(meta=old["meta"], letters=letters, cat=cat, heart=heart)
# Runtime uses exact curves; don't ship duplicate sampled points with the page.
def compact(item):
    return {key: value for key, value in item.items() if key != "rings"}
runtime_artwork = dict(meta=old["meta"], letters=list(map(compact, letters)), cat=list(map(compact, cat)), heart=compact(heart))
text = "// Smooth sticker contours and closed letter shapes. Generated by tools/rebuild-art.py.\n"
text += "// Coordinates stay in the original Cartesian world; ring holes use even-odd filling.\n"
text += "window.GIFT_ARTWORK = " + json.dumps(runtime_artwork, separators=(",", ":")) + ";\n"
(ROOT / "artwork.js").write_text(text, encoding="utf-8", newline="\n")
# Save explicit, human-readable parametric equations, keyed to rendered shapes.
equations = {"parameter": "0 <= t <= 1", "coordinateSystem": "Cartesian, y up", "shapes": []}
for item in [*letters, *cat, heart]:
    entry = {"id": item["name"], "kind": item["kind"], "rings": []}
    for ring_index, curves in enumerate(item["curves"]):
        ring = []
        for segment_index, controls in enumerate(curves):
            def expression(axis):
                v = [p[axis] for p in controls]
                if len(v) == 2:
                    return f"{v[0]:.6f}*(1-t) + {v[1]:.6f}*t"
                return f"{v[0]:.6f}*(1-t)^3 + 3*{v[1]:.6f}*(1-t)^2*t + 3*{v[2]:.6f}*(1-t)*t^2 + {v[3]:.6f}*t^3"
            ring.append({"id": f"{item['name']}/ring-{ring_index}/segment-{segment_index}",
                         "type": "cubic-bezier" if len(controls) == 4 else "line", "controlPoints": controls,
                         "x": expression(0), "y": expression(1)})
        entry["rings"].append(ring)
    equations["shapes"].append(entry)
(ROOT / "equations").mkdir(exist_ok=True)
(ROOT / "equations" / "sticker-v2.json").write_text(json.dumps(equations, indent=2), encoding="utf-8", newline="\n")
# Preserve all original sampled curves too; the handoff did not include their source equations.
(ROOT / "equations" / "original-v1-sampled.json").write_text(json.dumps(old), encoding="utf-8", newline="\n")
print(f"Generated {len(letters)} fillable glyphs, {len(cat)} sticker layers, and one continuous heart.")
