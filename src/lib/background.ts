/** Turn an uploaded image or PDF (first page) into a downscaled data URL for use as a layout background. */
const MAX = 2200;

function toDataUrl(src: CanvasImageSource, w: number, h: number) {
  const k = Math.min(1, MAX / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(src, 0, 0, cv.width, cv.height);
  return { dataUrl: cv.toDataURL('image/jpeg', 0.85), ratio: cv.width / cv.height };
}

export async function fileToBackground(file: File): Promise<{ dataUrl: string; ratio: number }> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: MAX / Math.max(base.width, base.height) });
    const cv = document.createElement('canvas');
    cv.width = Math.round(viewport.width); cv.height = Math.round(viewport.height);
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport, canvas: cv }).promise;
    return { dataUrl: cv.toDataURL('image/jpeg', 0.85), ratio: cv.width / cv.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return toDataUrl(img, img.naturalWidth || 1000, img.naturalHeight || 700);
  } finally { URL.revokeObjectURL(url); }
}
