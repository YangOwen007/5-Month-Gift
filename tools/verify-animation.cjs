/* Run with `node tools/verify-animation.cjs`.
 * Deterministic smoke checks exercise the real renderer with a recording canvas.
 * They verify geometry, phase completion, delayed color, resize, and Replay;
 * browser screenshots remain the check for how the actual artwork looks.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const code = (name) => fs.readFileSync(path.join(root, name), "utf8");

// Canvas doubles reject non-finite coordinates and remember fill colors.
function finite(...values) { values.forEach((x) => assert(Number.isFinite(x), `Invalid coordinate: ${x}`)); }
class RecordedPath {
  moveTo(...p) { finite(...p); this.first ||= p; }
  lineTo(...p) { finite(...p); }
  bezierCurveTo(...p) { finite(...p); }
  closePath() { this.closed = true; }
}
function run(width, height) {
  let now = 0, nextId = 1;
  const callbacks = new Map(), events = [], stack = [], listeners = {};
  const ctx = {
    setTransform: finite, translate: finite, scale: finite,
    moveTo: finite, lineTo: finite, arc: finite, fillRect: finite,
    roundRect() { throw new Error("Equation panels must not be drawn"); },
    globalAlpha: 1,
    beginPath() {}, closePath() {},
    stroke(path) { if (path) events.push({ time: now, type: "stroke", color: this.strokeStyle, closed: path.closed, first: path.first }); },
    fillText(text, x, y) { if (this.globalAlpha > 0) events.push({ time: now, type: "text", text, x, y, color: this.fillStyle, alpha: this.globalAlpha }); },
    measureText(text) { return { width: text.length * 7.8 }; },
    save() { stack.push([this.fillStyle, this.globalAlpha]); },
    restore() { [this.fillStyle, this.globalAlpha] = stack.pop(); },
    clip(_path, rule) { assert.equal(rule, "evenodd"); },
    fill() { events.push({ time: now, color: this.fillStyle }); },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  const element = () => {
    const classes = new Set();
    return { style: {}, classes, classList: { add: (s) => classes.add(s), remove: (s) => classes.delete(s) },
      addEventListener(name, callback) { this[name] = callback; } };
  };
  const elements = Object.fromEntries(["c", "start-screen", "end-bar", "play-btn", "replay-btn"].map((id) => [id, element()]));
  elements.c.getContext = () => ctx;
  elements["end-bar"].classes.add("hidden");
  const sandbox = { innerWidth: width, innerHeight: height, devicePixelRatio: 2, Path2D: RecordedPath,
    document: { getElementById: (id) => elements[id] }, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = nextId++; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    addEventListener(name, callback) { listeners[name] = callback; } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code("artwork.js"), sandbox);
  vm.runInContext(code("main.js"), sandbox);
  assert.equal(callbacks.size, 0, "Idle must not animate forever");

  // Every drawn control point must have a saved equation, with closed rings.
  const G = sandbox.GIFT_ARTWORK;
  const saved = JSON.parse(code("equations/sticker-v2.json"));
  let count = 0;
  for (const shape of [...G.letters, ...G.cat, G.heart]) {
    const entry = saved.shapes.find((s) => s.id === shape.name);
    assert(entry, `Missing equations for ${shape.name}`);
    assert.equal(JSON.stringify(entry.rings.map((r) => r.map((s) => s.controlPoints))), JSON.stringify(shape.curves));
    shape.curves.forEach((ring) => ring.forEach((curve, i) => {
      const a = curve.at(-1), b = ring[(i + 1) % ring.length][0];
      assert(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.00001, `Open ring in ${shape.name}`);
      finite(...curve.flat()); count++;
    }));
  }

  function advance(duration) {
    const until = now + duration;
    while (now < until) {
      now += 16;
      const pending = [...callbacks.values()]; callbacks.clear();
      pending.forEach((callback) => callback(now));
      assert(callbacks.size <= 1, "Multiple animation loops are running");
    }
  }
  elements["play-btn"].click(); advance(27800);
  // The first equation leads the heart by 0.5s, fades for 0.6s after drawing,
  // and only then begins the untouched three-second pause.
  const isEquation = (e) => e.type === "text" && e.color === "#88776c";
  const firstTitle = events.find(isEquation);
  const firstHeart = events.find((e) => e.type === "stroke" && e.color === "#d45d72");
  assert(firstTitle && firstHeart, "Missing heart equation or drawing");
  assert(Math.abs(firstHeart.time - firstTitle.time - 500) <= 32, "Heart equation must lead drawing by 500ms");
  const finishedHeart = events.find((e) => e.type === "stroke" && e.color === "#d45d72" && e.closed);
  const heartTitles = events.filter((e) => isEquation(e) && e.time < finishedHeart.time + 650);
  assert(heartTitles.some((e) => e.time > finishedHeart.time && e.alpha > 0 && e.alpha < 1), "Heart equation must fade after drawing");
  // Every shape must start and finish on the original colored-sticker schedule.
  // Matching its first coordinate also checks that curve traversal wasn't rotated.
  const firstOf = (shape) => JSON.stringify(shape.curves[0][0][0]);
  const strokesOf = (shape) => events.filter((e) => e.type === "stroke" && JSON.stringify(e.first) === firstOf(shape));
  const multiStart = strokesOf(G.letters[0])[0].time - 16;
  assert(Math.abs(multiStart - finishedHeart.time - 3600) <= 64, "Pause must begin after the equation fades");
  for (const shape of [...G.letters, ...G.cat]) {
    const strokes = strokesOf(shape), full = strokes.find((e) => e.closed);
    assert(strokes.length && full, `Missing original traversal for ${shape.name}`);
    assert(Math.abs(strokes[0].time - multiStart - shape.drawAt * 16000) <= 32, `Changed start pace: ${shape.name}`);
    assert(Math.abs(full.time - multiStart - (shape.drawAt + 0.48) * 16000) <= 32, `Changed duration: ${shape.name}`);
  }
  assert(!events.some((e) => e.type === "text" && /FIRST CURVE|FIRST EDGE|HEART|BUBBLE/.test(e.text)), "Equation headings must be absent");
  const cardsPerFrame = new Map();
  events.filter((e) => isEquation(e) && e.text.startsWith("x")).forEach((e) => cardsPerFrame.set(e.time, (cardsPerFrame.get(e.time) || 0) + 1));
  assert.equal(Math.max(...cardsPerFrame.values()), 4, "Multi-line reveal must show twice the previous two equations together");
  // Fully typed rows can move smoothly with the camera, but must never swap sides.
  const previousRows = new Map();
  events.filter((e) => isEquation(e) && e.text.length > 25 && !e.text.includes("▏")).forEach((event) => {
    const previous = previousRows.get(event.text);
    if (previous && event.time - previous.time === 16) {
      assert(Math.hypot(event.x - previous.x, event.y - previous.y) < 20, "Equation teleported between frames");
    }
    previousRows.set(event.text, event);
  });
  assert(elements["end-bar"].classes.has("hidden"), "Replay appeared before color chapter");
  assert(!events.some((e) => e.color === "#f4b7cd"), "Letter color appeared during outlines");
  assert(!events.some((e) => e.color === "#292428"), "Charcoal filled before the color chapter");
  advance(4000);
  const firstInk = events.find((e) => e.color === "#292428");
  assert(firstInk && Math.abs(firstInk.time - multiStart - 15900) <= 48, "Charcoal must begin filling at the start of coloring");
  assert(events.some((e) => e.color === "#f4b7cd"), "Letter color never began filling");
  assert(elements["end-bar"].classes.has("hidden"), "Replay appeared before colors completed");
  advance(5000);
  assert(!elements["end-bar"].classes.has("hidden"), "Playback never reached final hold");
  assert.equal(callbacks.size, 0, "Final hold must stop scheduling frames");
  assert(!events.some((e) => isEquation(e) && e.time > 28500 + 100), "Equations must clear before coloring");
  for (const color of ["#fffdfc", "#292428", "#f4b5cd", "#f2b0c8", "#c2c0c0"]) {
    assert(events.some((e) => e.color === color), `Missing sticker color ${color}`);
  }
  // A completed scene can resize and replay without carrying old fill state.
  sandbox.innerWidth = height; sandbox.innerHeight = width; listeners.resize();
  events.length = 0;
  elements["replay-btn"].click(); advance(1000);
  assert(elements["end-bar"].classes.has("hidden"));
  assert(!events.some((e) => e.color === "#f4b7cd"), "Replay retained old color");
  advance(35000);
  assert(!elements["end-bar"].classes.has("hidden"));
  assert.equal(callbacks.size, 0);
  console.log(`${width}x${height}: ${count} equations match; original pacing for all shapes, floating text, heart timing, fill, resize, and Replay pass.`);
}
run(1920, 1080);
run(390, 844);
