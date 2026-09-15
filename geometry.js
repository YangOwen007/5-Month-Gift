/* gzip-compressed geometry — chunked for GitHub push limits */
window.__GIFT_GEOMETRY_READY__ = (async function () {
  const n = 8;
  const parts = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      fetch(`geom_b64_${i}.txt`).then((r) => {
        if (!r.ok) throw new Error(`missing geom_b64_${i}.txt`);
        return r.text();
      })
    )
  );
  const b64 = parts.join("").trim();
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  window.GIFT_GEOMETRY = JSON.parse(text);
  return window.GIFT_GEOMETRY;
})();
