/** Layout canvas coordinates are final print pixels; headroom preserves crop and modest zoom detail. */
export function photoTargetPixels(frame, zoomHeadroom = 1.5) {
  const width = Number(frame?.width);
  const height = Number(frame?.height);
  const headroom = Number(zoomHeadroom);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isFinite(headroom) || headroom < 1 || headroom > 3) {
    throw new Error("Photo frame dimensions or zoom headroom are invalid.");
  }
  return { width: Math.ceil(width * headroom), height: Math.ceil(height * headroom) };
}
