export type OptimizedImage = { file: File; width: number; height: number; optimized: boolean };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (result: OptimizedImage) => void; reject: (error: Error) => void }>();

async function decodeImage(file: File) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return createImageBitmap(file); }
}

function getWorker() {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("./image-optimizer.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; blob?: Blob; width?: number; height?: number; optimized?: boolean; error?: string }>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.error || !event.data.blob || !event.data.width || !event.data.height) task.reject(new Error(event.data.error ?? "Could not process this image."));
      else task.resolve({ file: new File([event.data.blob], "", { type: event.data.blob.type }), width: event.data.width, height: event.data.height, optimized: !!event.data.optimized });
    };
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(new Error("Image processing worker failed."));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export async function optimizeImage(file: File, targetWidth: number, targetHeight: number): Promise<OptimizedImage> {
  const id = nextId++;
  const currentWorker = getWorker();
  if (currentWorker) {
    try {
      const result = await new Promise<OptimizedImage>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        currentWorker.postMessage({ id, file, maxWidth: targetWidth, maxHeight: targetHeight });
      });
      const extension = result.file.type === "image/png" ? "png" : "webp";
      const name = `${file.name.replace(/\.[^.]+$/, "")}.${extension}`;
      return { ...result, file: new File([result.file], name, { type: result.file.type, lastModified: file.lastModified }) };
    } catch { /* use the main-thread compatibility path */ }
  }
  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(1, targetWidth / bitmap.width, targetHeight / bitmap.height);
    if (scale === 1 && file.size < 5 * 1024 * 1024) return { file, width: bitmap.width, height: bitmap.height, optimized: false };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: file.type === "image/png" });
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/webp";
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not process this image.")), type, 0.9));
    const extension = blob.type === "image/png" ? "png" : "webp";
    return { file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, { type: blob.type, lastModified: file.lastModified }), width: canvas.width, height: canvas.height, optimized: blob.size < file.size || scale < 1 };
  } finally { bitmap.close(); }
}

export function disposeImageOptimizer() {
  worker?.terminate();
  worker = null;
  pending.clear();
}
