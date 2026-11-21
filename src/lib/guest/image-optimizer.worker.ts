/// <reference lib="webworker" />

type Request = { id: number; file: File; maxWidth: number; maxHeight: number };
const worker = self as DedicatedWorkerGlobalScope;

async function decodeImage(file: File) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return createImageBitmap(file); }
}

worker.onmessage = async (event: MessageEvent<Request>) => {
  const { id, file, maxWidth, maxHeight } = event.data;
  try {
    const bitmap = await decodeImage(file);
    try {
      const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
      if (scale === 1 && file.size < 5 * 1024 * 1024) {
        worker.postMessage({ id, blob: file, width: bitmap.width, height: bitmap.height, optimized: false });
        return;
      }
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
      if (!context) throw new Error("Image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, width, height);
      const mime = file.type === "image/png" ? "image/png" : "image/webp";
      const blob = await canvas.convertToBlob({ type: mime, quality: 0.9 });
      worker.postMessage({ id, blob, width, height, optimized: blob.size < file.size || width < bitmap.width || height < bitmap.height });
    } finally {
      bitmap.close();
    }
  } catch (error) {
    worker.postMessage({ id, error: error instanceof Error ? error.message : "Could not process this image." });
  }
};

export {};
