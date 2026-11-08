/** Camera transform shared by Canvas rendering and input/world-coordinate tools.
 * Canvas dimensions are backing-store pixels; viewportWidth is CSS pixels.
 */
export function cameraFrame(target, width, height, viewportWidth) {
  if (!target || ![target.x, target.y, width, height, viewportWidth].every(Number.isFinite) ||
      width <= 0 || height <= 0 || viewportWidth <= 0) {
    throw new RangeError('Camera requires finite coordinates and positive dimensions');
  }
  // Preserve the prototype's exact viewport breakpoints and world-space framing.
  const scale = viewportWidth < 700 ? 0.6 : 0.72;
  return {
    cx: target.x,
    cy: target.y,
    width,
    height,
    scale,
    rx: width / (2 * scale) + 100,
    ry: height / (2 * scale) + 100
  };
}

export function worldToCanvas(camera, x, y) {
  return {
    x: camera.width / 2 + (x - camera.cx) * camera.scale,
    y: camera.height / 2 + (y - camera.cy) * camera.scale
  };
}

export function canvasToWorld(camera, x, y) {
  return {
    x: camera.cx + (x - camera.width / 2) / camera.scale,
    y: camera.cy + (y - camera.height / 2) / camera.scale
  };
}
