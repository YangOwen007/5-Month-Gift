/* gzip-compressed geometry (chunked for GitHub MCP size limits) */
window.__GIFT_GEOMETRY_READY__ = (async function () {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const r = await fetch("geom_b64_" + i + ".txt");
    if (!r.ok) throw new Error("missing geom_b64_" + i + ".txt: " + r.status);
    parts.push(await r.text());
  }
  const b64 = parts.join("");
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  window.GIFT_GEOMETRY = JSON.parse(text);
  return window.GIFT_GEOMETRY;
})();
