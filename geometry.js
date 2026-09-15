/* gzip-compressed geometry */
window.__GIFT_GEOMETRY_READY__ = (async function () {
  const b64 = "LOAD_FROM_WORKSPACE";
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  window.GIFT_GEOMETRY = JSON.parse(text);
  return window.GIFT_GEOMETRY;
})();
