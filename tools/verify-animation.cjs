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
  moveTo(...p) { finite(...p); }
  lineTo(...p) { finite(...p); }
  bezierCurveTo(...p) { finite(...p); }
  closePath() {}
}
function run(width, height) {
  let now = 0, nextId = 1;
  const callbacks = new Map(), events = [], stack = [], listeners = {};
  const ctx = {
    setTransform: finite, translate: finite, scale: finite,
    moveTo: finite, lineTo: finite, arc: finite, fillRect: finite,
    beginPath() {}, closePath() {}, stroke() {}, fillText() {},
    save() { stack.push(this.fillStyle); }, restore() { this.fillStyle = stack.pop(); },
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
  assert(elements["end-bar"].classes.has("hidden"), "Replay appeared before color chapter");
  assert(!events.some((e) => e.color === "#f4b7cd"), "Letter color appeared during outlines");
  advance(4000);
  assert(events.some((e) => e.color === "#f4b7cd"), "Letter color never began filling");
  assert(elements["end-bar"].classes.has("hidden"), "Replay appeared before colors completed");
  advance(5000);
  assert(!elements["end-bar"].classes.has("hidden"), "Playback never reached final hold");
  assert.equal(callbacks.size, 0, "Final hold must stop scheduling frames");
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
  console.log(`${width}x${height}: ${count} equations match; full timeline, fill, resize, and Replay pass.`);
}
run(1920, 1080);
run(390, 844);
