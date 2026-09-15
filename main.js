/* 5 Month Gift — canvas animation
 * Storyboard: start → axes → zoom to speech-bubble heart → draw one heart layer
 * → pause → zoom out + staggered multi-draw → final hold. Replay resets cleanly.
 */
window.__GIFT_GEOMETRY_READY__.then(function (G) {
  "use strict";

  if (!G) {
    console.error("geometry.js failed to load");
    return;
  }

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const startScreen = document.getElementById("start-screen");
  const endBar = document.getElementById("end-bar");
  const playBtn = document.getElementById("play-btn");
  const replayBtn = document.getElementById("replay-btn");

  // ---- timing (ms) ----
  const T = {
    axesHold: 700,
    zoomIn: 2600,
    heartDraw: 5200,
    pause: 3000,
    multi: 16000,
    finalHold: 999999,
  };

  const WORLD = G.meta.world; // {xmin,xmax,ymin,ymax}
  const HEART = G.phase1Heart;
  const HEART_IDS = new Set(G.meta.phase1IdsSorted || HEART.ids);

  // Camera: center + half-width in world units (height from aspect)
  const fullView = {
    cx: (WORLD.xmin + WORLD.xmax) / 2,
    cy: (WORLD.ymin + WORLD.ymax) / 2,
    halfW: (WORLD.xmax - WORLD.xmin) / 2 * 1.02,
  };

  const heartPad = 0.55;
  const hb = HEART.bbox; // [xmin,xmax,ymin,ymax]
  const heartView = {
    cx: (hb[0] + hb[1]) / 2,
    cy: (hb[2] + hb[3]) / 2,
    halfW: Math.max(hb[1] - hb[0], hb[3] - hb[2]) / 2 + heartPad,
  };

  // ---- resize ----
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- easing ----
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeInQuad(t) {
    return t * t;
  }
  function clamp01(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerpCam(a, b, t) {
    return {
      cx: lerp(a.cx, b.cx, t),
      cy: lerp(a.cy, b.cy, t),
      halfW: lerp(a.halfW, b.halfW, t),
    };
  }

  // Tip-following camera during heart draw
  function camFollowTip(tip, base, mix) {
    return {
      cx: lerp(base.cx, tip[0], mix),
      cy: lerp(base.cy, tip[1], mix),
      halfW: base.halfW,
    };
  }

  // ---- path length helpers ----
  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      L += Math.hypot(dx, dy);
    }
    return L;
  }

  function pointAtLength(pts, totalLen, dist) {
    if (pts.length < 2) return { tip: pts[0] || [0, 0], prefix: pts.slice() };
    if (dist <= 0) return { tip: pts[0], prefix: [pts[0]] };
    if (dist >= totalLen) return { tip: pts[pts.length - 1], prefix: pts };
    let acc = 0;
    const prefix = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      const seg = Math.hypot(dx, dy);
      if (acc + seg >= dist) {
        const u = (dist - acc) / (seg || 1);
        const tip = [
          pts[i - 1][0] + dx * u,
          pts[i - 1][1] + dy * u,
        ];
        prefix.push(tip);
        return { tip, prefix };
      }
      acc += seg;
      prefix.push(pts[i]);
    }
    return { tip: pts[pts.length - 1], prefix: pts };
  }

  // ---- prepare strokes for multi-draw ----
  const letterStrokes = G.letters.map((L, i) => {
    const pts = L.points;
    const len = pathLength(pts) || 0.001;
    return { kind: "letter", id: i, points: pts, length: len };
  });

  const catStrokes = G.cat
    .filter((s) => !HEART_IDS.has(s.id))
    .map((s) => ({
      kind: "cat",
      id: s.id,
      points: s.points,
      length: s.length || pathLength(s.points) || 0.001,
    }));

  const multiStrokes = letterStrokes.concat(catStrokes);

  // Deterministic stagger: start/end fractions within multi phase
  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  multiStrokes.forEach((s, i) => {
    const h = hash01(s.id * 17 + (s.kind === "letter" ? 3 : 91));
    const h2 = hash01(s.id * 31 + 7);
    // letters start a bit earlier / denser; cats more staggered
    const startMax = s.kind === "letter" ? 0.35 : 0.55;
    const durMin = s.kind === "letter" ? 0.25 : 0.18;
    const durMax = s.kind === "letter" ? 0.55 : 0.5;
    s.t0 = h * startMax;
    s.t1 = Math.min(0.98, s.t0 + durMin + h2 * (durMax - durMin));
  });

  const heartLen = HEART.length || pathLength(HEART.points);

  // ---- state ----
  let phase = "idle"; // idle | axes | zoomIn | heart | pause | multi | done
  let phaseStart = 0;
  let raf = 0;
  let cam = { ...fullView };
  let heartDrawn = null; // {prefix, tip}
  let multiProgress = new Map(); // stroke -> 0..1 draw progress

  function resetAnimState() {
    phase = "idle";
    phaseStart = 0;
    cam = { ...fullView };
    heartDrawn = null;
    multiProgress = new Map();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function goPhase(name, now) {
    phase = name;
    phaseStart = now;
  }

  // ---- world ↔ screen ----
  function viewRect(camState, cssW, cssH) {
    const aspect = cssW / cssH;
    const halfH = camState.halfW / aspect;
    return {
      xmin: camState.cx - camState.halfW,
      xmax: camState.cx + camState.halfW,
      ymin: camState.cy - halfH,
      ymax: camState.cy + halfH,
    };
  }

  function worldToScreen(x, y, vr, cssW, cssH) {
    const sx = ((x - vr.xmin) / (vr.xmax - vr.xmin)) * cssW;
    const sy = cssH - ((y - vr.ymin) / (vr.ymax - vr.ymin)) * cssH; // y-up
    return [sx, sy];
  }

  // ---- drawing primitives ----
  function drawPaper(cssW, cssH) {
    const g = ctx.createRadialGradient(
      cssW * 0.5, cssH * 0.4, 0,
      cssW * 0.5, cssH * 0.5, Math.max(cssW, cssH) * 0.75
    );
    g.addColorStop(0, "#fffaf6");
    g.addColorStop(0.55, "#f7ebe4");
    g.addColorStop(1, "#e8d2cb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  function drawGrid(vr, cssW, cssH) {
    const x0 = Math.floor(vr.xmin);
    const x1 = Math.ceil(vr.xmax);
    const y0 = Math.floor(vr.ymin);
    const y1 = Math.ceil(vr.ymax);

    // minor-ish unit grid
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(58,36,48,0.10)";
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const [sx0, sy0] = worldToScreen(x, vr.ymin, vr, cssW, cssH);
      const [, sy1] = worldToScreen(x, vr.ymax, vr, cssW, cssH);
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx0, sy1);
    }
    for (let y = y0; y <= y1; y++) {
      const [sx0, sy0] = worldToScreen(vr.xmin, y, vr, cssW, cssH);
      const [sx1] = worldToScreen(vr.xmax, y, vr, cssW, cssH);
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy0);
    }
    ctx.stroke();

    // axes
    ctx.strokeStyle = "rgba(58,36,48,0.42)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    {
      const [ax0, ay] = worldToScreen(vr.xmin, 0, vr, cssW, cssH);
      const [ax1] = worldToScreen(vr.xmax, 0, vr, cssW, cssH);
      if (0 >= vr.ymin && 0 <= vr.ymax) {
        ctx.moveTo(ax0, ay);
        ctx.lineTo(ax1, ay);
      }
      const [bx, by0] = worldToScreen(0, vr.ymin, vr, cssW, cssH);
      const [, by1] = worldToScreen(0, vr.ymax, vr, cssW, cssH);
      if (0 >= vr.xmin && 0 <= vr.xmax) {
        ctx.moveTo(bx, by0);
        ctx.lineTo(bx, by1);
      }
    }
    // if origin not in world, draw left/bottom frame axes at world edges
    {
      const [lx0, ly0] = worldToScreen(WORLD.xmin, WORLD.ymin, vr, cssW, cssH);
      const [lx1] = worldToScreen(WORLD.xmax, WORLD.ymin, vr, cssW, cssH);
      const [, ly1] = worldToScreen(WORLD.xmin, WORLD.ymax, vr, cssW, cssH);
      ctx.moveTo(lx0, ly0);
      ctx.lineTo(lx1, ly0);
      ctx.moveTo(lx0, ly0);
      ctx.lineTo(lx0, ly1);
    }
    ctx.stroke();

    // ticks + labels (only when zoomed out enough)
    const span = vr.xmax - vr.xmin;
    const labelEvery = span > 10 ? 2 : span > 4 ? 1 : 0.5;
    const showLabels = span < 22;
    ctx.fillStyle = "rgba(58,36,48,0.55)";
    const fontPx = Math.max(10, Math.min(14, cssW / 70));
    ctx.font = fontPx + "px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const tickLen = Math.min(8, cssH * 0.012);
    for (let x = Math.ceil(WORLD.xmin / labelEvery) * labelEvery; x <= WORLD.xmax + 1e-6; x += labelEvery) {
      if (x < vr.xmin - 0.1 || x > vr.xmax + 0.1) continue;
      const [sx, sy] = worldToScreen(x, WORLD.ymin, vr, cssW, cssH);
      ctx.strokeStyle = "rgba(58,36,48,0.4)";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - tickLen);
      ctx.stroke();
      if (showLabels && Math.abs(x - Math.round(x)) < 1e-6) {
        ctx.fillText(String(Math.round(x)), sx, sy + 3);
      }
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = Math.ceil(WORLD.ymin / labelEvery) * labelEvery; y <= WORLD.ymax + 1e-6; y += labelEvery) {
      if (y < vr.ymin - 0.1 || y > vr.ymax + 0.1) continue;
      const [sx, sy] = worldToScreen(WORLD.xmin, y, vr, cssW, cssH);
      ctx.strokeStyle = "rgba(58,36,48,0.4)";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tickLen, sy);
      ctx.stroke();
      if (showLabels && Math.abs(y - Math.round(y)) < 1e-6) {
        ctx.fillText(String(Math.round(y)), sx - 4, sy);
      }
    }
    ctx.restore();
  }

  function strokePolyline(pts, vr, cssW, cssH, style) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (style.shadow) {
      ctx.shadowColor = style.shadow;
      ctx.shadowBlur = style.shadowBlur || 0;
    }
    ctx.beginPath();
    const [x0, y0] = worldToScreen(pts[0][0], pts[0][1], vr, cssW, cssH);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = worldToScreen(pts[i][0], pts[i][1], vr, cssW, cssH);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTipGlow(tip, vr, cssW, cssH) {
    if (!tip) return;
    const [sx, sy] = worldToScreen(tip[0], tip[1], vr, cssW, cssH);
    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
    g.addColorStop(0, "rgba(212,93,114,0.85)");
    g.addColorStop(0.4, "rgba(212,93,114,0.35)");
    g.addColorStop(1, "rgba(212,93,114,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- frame ----
  function frame(now) {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    drawPaper(cssW, cssH);

    let showContent = phase !== "idle";

    if (phase === "axes") {
      cam = { ...fullView };
      const elapsed = now - phaseStart;
      if (elapsed >= T.axesHold) goPhase("zoomIn", now);
    } else if (phase === "zoomIn") {
      const t = clamp01((now - phaseStart) / T.zoomIn);
      cam = lerpCam(fullView, heartView, easeInOutCubic(t));
      if (t >= 1) goPhase("heart", now);
    } else if (phase === "heart") {
      const t = clamp01((now - phaseStart) / T.heartDraw);
      // ease-in: speed slowly increases → progress is easeIn of time
      const p = easeInQuad(t);
      const { tip, prefix } = pointAtLength(HEART.points, heartLen, p * heartLen);
      heartDrawn = { tip, prefix };
      cam = camFollowTip(tip, heartView, 0.35);
      if (t >= 1) {
        heartDrawn = { tip: HEART.points[HEART.points.length - 1], prefix: HEART.points };
        goPhase("pause", now);
      }
    } else if (phase === "pause") {
      cam = { ...heartView };
      if (now - phaseStart >= T.pause) goPhase("multi", now);
    } else if (phase === "multi") {
      const t = clamp01((now - phaseStart) / T.multi);
      cam = lerpCam(heartView, fullView, easeInOutCubic(t));
      multiStrokes.forEach((s) => {
        const local = clamp01((t - s.t0) / (s.t1 - s.t0 || 1e-6));
        // slight ease-in per stroke
        multiProgress.set(s, easeInQuad(local));
      });
      if (t >= 1) {
        multiStrokes.forEach((s) => multiProgress.set(s, 1));
        goPhase("done", now);
        endBar.classList.remove("hidden");
      }
    } else if (phase === "done") {
      cam = { ...fullView };
      multiStrokes.forEach((s) => multiProgress.set(s, 1));
      if (!heartDrawn) heartDrawn = { tip: null, prefix: HEART.points };
    }

    const vr = viewRect(cam, cssW, cssH);
    if (showContent) {
      drawGrid(vr, cssW, cssH);

      // completed heart (phase1)
      if (heartDrawn && heartDrawn.prefix && heartDrawn.prefix.length > 1) {
        const lw = Math.max(1.8, 7 / (cam.halfW + 0.2));
        strokePolyline(heartDrawn.prefix, vr, cssW, cssH, {
          color: "#d45d72",
          width: lw,
          shadow: "rgba(212,93,114,0.35)",
          shadowBlur: 4,
        });
        if (phase === "heart") drawTipGlow(heartDrawn.tip, vr, cssW, cssH);
      }

      // multi strokes
      if (phase === "multi" || phase === "done") {
        multiStrokes.forEach((s) => {
          const prog = multiProgress.get(s) || 0;
          if (prog <= 0) return;
          const { prefix } = pointAtLength(s.points, s.length, prog * s.length);
          if (prefix.length < 2) return;
          if (s.kind === "letter") {
            strokePolyline(prefix, vr, cssW, cssH, {
              color: "#3d5f96",
              width: 2.4,
            });
          } else {
            strokePolyline(prefix, vr, cssW, cssH, {
              color: "rgba(40, 28, 34, 0.78)",
              width: 1.15,
            });
          }
        });
      }
    }

    if (phase !== "idle" && phase !== "done") {
      raf = requestAnimationFrame(frame);
    } else if (phase === "done") {
      // one more static paint is enough; still allow idle loop? paint once more for resize
      raf = 0;
    }
  }

  function start() {
    resetAnimState();
    endBar.classList.add("hidden");
    startScreen.classList.add("hidden");
    goPhase("axes", performance.now());
    raf = requestAnimationFrame(frame);
  }

  function replay() {
    endBar.classList.add("hidden");
    start();
  }

  playBtn.addEventListener("click", start);
  replayBtn.addEventListener("click", replay);

  // Initial idle: soft empty paper behind start overlay
  function paintIdle() {
    resize();
    drawPaper(window.innerWidth, window.innerHeight);
  }
  paintIdle();
  window.addEventListener("resize", () => {
    if (phase === "idle") paintIdle();
    else if (phase === "done") {
      // redraw final frame
      requestAnimationFrame(frame);
    }
  });
});
