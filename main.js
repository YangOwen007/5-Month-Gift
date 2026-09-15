/* Original storyboard plus a color-fill chapter. All paths are closed vectors.
 * Exact equations and stable segment IDs are saved in equations/sticker-v2.json.
 * No runtime dependencies, network fetches, or raster drawings are needed.
 */
(function () {
  "use strict";
  const G = window.GIFT_ARTWORK;
  const canvas = document.getElementById("c"), ctx = canvas.getContext("2d");
  const startScreen = document.getElementById("start-screen"), endBar = document.getElementById("end-bar");
  const T = { axes: 700, zoomIn: 2600, heart: 5200, pause: 3000, multi: 16000, outlineHold: 900, color: 6500 };
  const WORLD = G.meta.world;
  const clamp = (t) => Math.max(0, Math.min(1, t));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const pointLerp = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
  let phase = "idle", phaseStart = 0, raf = 0;
  let heartProgress = 0, multiProgress = 0, colorProgress = 0;
  let fullView, heartView, cam;

  // Evaluate the same line or cubic Bernstein equation saved for each segment.
  function evaluate(points, t) {
    if (points.length === 2) return pointLerp(points[0], points[1], t);
    const [a, b, c, d] = points, u = 1 - t;
    return [0, 1].map((i) => u ** 3 * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t ** 3 * d[i]);
  }
  // de Casteljau subdivision draws an exact partial cubic instead of a polyline.
  function curveTo(path, points, t = 1) {
    if (points.length === 2) { path.lineTo(...evaluate(points, t)); return; }
    const a = pointLerp(points[0], points[1], t), b = pointLerp(points[1], points[2], t), c = pointLerp(points[2], points[3], t);
    const d = pointLerp(a, b, t), e = pointLerp(b, c, t);
    path.bezierCurveTo(...a, ...d, ...pointLerp(d, e, t));
  }
  // Length samples control timing only; visible paths use exact saved equations.
  function prepare(source) {
    const path = new Path2D(), segments = [];
    let total = 0;
    source.curves.forEach((ring, ringIndex) => {
      path.moveTo(...ring[0][0]);
      ring.forEach((points, segmentIndex) => {
        const steps = points.length === 2 ? 1 : 32, lengths = [0];
        let previous = points[0];
        for (let j = 1; j <= steps; j++) {
          const next = evaluate(points, j / steps);
          lengths.push(lengths[j - 1] + Math.hypot(next[0] - previous[0], next[1] - previous[1])); previous = next;
        }
        const length = lengths.at(-1);
        segments.push({ points, lengths, length, start: total, ringStart: segmentIndex === 0,
          id: `${source.name}/ring-${ringIndex}/segment-${segmentIndex}` });
        total += length; curveTo(path, points);
      });
      path.closePath();
    });
    const all = source.curves.flat(2), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    return { ...source, path, segments, length: total, bounds: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] };
  }
  const letters = G.letters.map(prepare), cat = G.cat.map(prepare), heart = prepare(G.heart);
  const shapes = [...cat, ...letters];
  // Convert traveled distance to the local equation parameter for a continuous tip.
  function parameterAt(segment, distance) {
    const a = segment.lengths;
    for (let j = 1; j < a.length; j++) {
      if (a[j] >= distance) return (j - 1 + (distance - a[j - 1]) / (a[j] - a[j - 1] || 1)) / (a.length - 1);
    }
    return 1;
  }
  function partial(shape, progress) {
    if (progress >= 1) return { path: shape.path, tip: shape.segments.at(-1).points.at(-1) };
    const distance = shape.length * progress, path = new Path2D();
    let tip = shape.segments[0].points[0];
    for (const s of shape.segments) {
      if (s.ringStart) path.moveTo(...s.points[0]);
      const t = parameterAt(s, Math.min(s.length, Math.max(0, distance - s.start)));
      curveTo(path, s.points, t); tip = evaluate(s.points, t);
      if (distance <= s.start + s.length) break;
    }
    return { path, tip };
  }

  // Fit both dimensions so the full gift stays visible on wide and narrow screens.
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px"; canvas.style.height = h + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const aspect = w / h;
    fullView = { cx: (WORLD.xmin + WORLD.xmax) / 2, cy: (WORLD.ymin + WORLD.ymax) / 2,
      halfW: Math.max((WORLD.xmax - WORLD.xmin) * 0.55, (WORLD.ymax - WORLD.ymin) * aspect * 0.57) };
    const [x0, x1, y0, y1] = heart.bounds;
    heartView = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
      halfW: Math.max((x1 - x0) * 0.9 + 0.2, ((y1 - y0) * 0.9 + 0.2) * aspect) };
    if (phase === "idle" || phase === "done") frame(performance.now());
  }
  function mixCam(a, b, t) { return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), halfW: lerp(a.halfW, b.halfW, t) }; }
  function go(next, now) { phase = next; phaseStart = now; }

  // Warm paper and Cartesian guides retain the original visual setting.
  function paper() {
    const w = innerWidth, h = innerHeight;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, "#fffaf6"); g.addColorStop(0.55, "#f7ebe4"); g.addColorStop(1, "#e8d2cb");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function screen(x, y) {
    const scale = innerWidth / (cam.halfW * 2);
    return [innerWidth / 2 + (x - cam.cx) * scale, innerHeight / 2 - (y - cam.cy) * scale];
  }
  function grid() {
    const scale = innerWidth / (2 * cam.halfW), halfH = innerHeight / (2 * scale);
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(58,36,48,0.10)"; ctx.beginPath();
    for (let x = Math.floor(cam.cx - cam.halfW); x <= Math.ceil(cam.cx + cam.halfW); x++) {
      const [sx] = screen(x, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, innerHeight);
    }
    for (let y = Math.floor(cam.cy - halfH); y <= Math.ceil(cam.cy + halfH); y++) {
      const [, sy] = screen(0, y); ctx.moveTo(0, sy); ctx.lineTo(innerWidth, sy);
    }
    ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = "rgba(58,36,48,0.42)"; ctx.lineWidth = 1.5;
    ctx.moveTo(...screen(WORLD.xmin, WORLD.ymax)); ctx.lineTo(...screen(WORLD.xmin, WORLD.ymin)); ctx.lineTo(...screen(WORLD.xmax, WORLD.ymin)); ctx.stroke();
    if (cam.halfW > 4) {
      ctx.font = `${Math.max(10, Math.min(14, innerWidth / 70))}px 'Segoe UI', sans-serif`;
      ctx.fillStyle = "rgba(58,36,48,0.55)"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (let x = 2; x <= 16; x += 2) { const [sx, sy] = screen(x, WORLD.ymin); ctx.fillText(x, sx, sy + 5); }
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let y = 2; y <= 10; y += 2) { const [sx, sy] = screen(WORLD.xmin, y); ctx.fillText(y, sx - 6, sy); }
    }
    ctx.restore();
  }

  // Each color rises through its own clipped shape. Even-odd clipping preserves
  // holes (such as A's center), and the gently moving edge cannot spill outside.
  function fillShape(shape, progress) {
    if (progress <= 0) return;
    ctx.save(); ctx.fillStyle = shape.color;
    if (progress < 1) {
      ctx.clip(shape.path, "evenodd");
      const [x0, x1, y0, y1] = shape.bounds, level = lerp(y0 - 0.12, y1 + 0.12, ease(progress));
      ctx.beginPath(); ctx.moveTo(x0 - 0.2, y0 - 0.2); ctx.lineTo(x1 + 0.2, y0 - 0.2);
      for (let x = x1 + 0.2; x >= x0 - 0.21; x -= 0.035) {
        ctx.lineTo(x, level + Math.sin(x * 8 + progress * 12) * 0.035 * Math.sin(Math.PI * progress));
      }
      ctx.closePath(); ctx.fill();
    } else ctx.fill(shape.path, "evenodd");
    ctx.restore();
  }
  function drawShape(shape, progress, fill, scale) {
    if (progress <= 0) return;
    fillShape(shape, fill);
    ctx.strokeStyle = shape.kind === "letter" ? "#6b4659" : shape.kind === "gray" ? "#b4aeb0" : shape.kind === "paper" ? "#bcadb0" : "#30272c";
    ctx.lineWidth = (shape.kind === "letter" ? 1.7 : shape.kind === "paper" ? 0.85 : 1.05) / scale;
    ctx.stroke(partial(shape, progress).path);
  }
  function drawContent() {
    grid();
    const scale = innerWidth / (cam.halfW * 2);
    ctx.save(); ctx.translate(innerWidth / 2, innerHeight / 2); ctx.scale(scale, -scale); ctx.translate(-cam.cx, -cam.cy);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (["multi", "outlineHold", "color", "done"].includes(phase)) {
      // Paint backing first, then charcoal ink, gray fur, pink accents, and letters.
      shapes.forEach((shape) => {
        const draw = clamp((multiProgress - shape.drawAt) / 0.48);
        const fill = shape.kind === "ink" ? clamp((draw - 0.75) / 0.25) : clamp((colorProgress - shape.fillAt) / 0.38);
        drawShape(shape, ease(draw), fill, scale);
      });
    }
    if (heartProgress > 0) {
      fillShape(heart, clamp((colorProgress - heart.fillAt) / 0.38));
      ctx.strokeStyle = "#d45d72"; ctx.lineWidth = (phase === "heart" ? 3.2 : 1.7) / scale;
      ctx.stroke(partial(heart, heartProgress).path);
    }
    ctx.restore();
    if (phase === "heart") {
      const [x, y] = screen(...partial(heart, heartProgress).tip);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
      glow.addColorStop(0, "rgba(212,93,114,0.85)"); glow.addColorStop(1, "rgba(212,93,114,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Keep the original phase lengths; add an outline hold and a 6.5-second fill.
  function frame(now) {
    paper();
    const t = clamp((now - phaseStart) / (T[phase] || 1));
    if (phase === "axes") { cam = { ...fullView }; if (t === 1) go("zoomIn", now); }
    else if (phase === "zoomIn") { cam = mixCam(fullView, heartView, ease(t)); if (t === 1) go("heart", now); }
    else if (phase === "heart") {
      heartProgress = t * t;
      const tip = partial(heart, heartProgress).tip;
      // Ease the follow strength at both ends to avoid camera jumps into the pause.
      const follow = 0.35 * Math.sin(Math.PI * t);
      cam = { ...heartView, cx: lerp(heartView.cx, tip[0], follow), cy: lerp(heartView.cy, tip[1], follow) };
      if (t === 1) go("pause", now);
    } else if (phase === "pause") { cam = { ...heartView }; if (t === 1) go("multi", now); }
    else if (phase === "multi") {
      multiProgress = t; cam = mixCam(heartView, fullView, ease(t)); if (t === 1) go("outlineHold", now);
    } else if (phase === "outlineHold") { cam = { ...fullView }; if (t === 1) go("color", now); }
    else if (phase === "color") {
      colorProgress = t; cam = { ...fullView };
      if (t === 1) { go("done", now); endBar.classList.remove("hidden"); }
    } else cam = { ...fullView };
    if (phase !== "idle") drawContent();
    // Static holds don't keep an unnecessary requestAnimationFrame loop running.
    if (phase !== "idle" && phase !== "done") raf = requestAnimationFrame(frame); else raf = 0;
  }
  function start() {
    if (raf) cancelAnimationFrame(raf);
    heartProgress = multiProgress = colorProgress = 0;
    startScreen.classList.add("hidden"); endBar.classList.add("hidden");
    go("axes", performance.now()); raf = requestAnimationFrame(frame);
  }
  document.getElementById("play-btn").addEventListener("click", start);
  document.getElementById("replay-btn").addEventListener("click", start);
  window.addEventListener("resize", resize);
  resize();
})();
