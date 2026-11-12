/**
 * 图片在客户端先压缩再上传，避免把原始大图塞进记录里拖慢同步。
 *
 * 关键：JPEG 没有 alpha 通道，画布上的透明像素编码成 JPEG 会变成**黑色**，
 * 于是透明背景的 PNG 一发出去四周就多了一圈黑边。所以带透明的图必须走
 * WebP / PNG，只有真正不透明的照片才用 JPEG。
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const ALPHA_QUALITY = 0.92;

export async function fileToImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const transparent = file.type !== 'image/jpeg' && hasAlpha(ctx, width, height);

  if (transparent) {
    // 透明优先，宁可不压那么狠，也不要把透明区压成黑块
    const webp = canvas.toDataURL('image/webp', ALPHA_QUALITY);
    if (webp.startsWith('data:image/webp')) {
      return webp.length < dataUrl.length ? webp : dataUrl;
    }
    return canvas.toDataURL('image/png');
  }

  // 不透明的图：先铺一层白底，避免边缘半透明像素在编码时发黑
  const flat = document.createElement('canvas');
  flat.width = width;
  flat.height = height;
  const flatCtx = flat.getContext('2d');
  if (!flatCtx) return canvas.toDataURL('image/jpeg', QUALITY);
  flatCtx.fillStyle = '#ffffff';
  flatCtx.fillRect(0, 0, width, height);
  flatCtx.drawImage(canvas, 0, 0);

  const compressed = flat.toDataURL('image/jpeg', QUALITY);
  return compressed.length < dataUrl.length ? compressed : dataUrl;
}

/**
 * 检测是否有透明像素。
 *
 * 采样必须密：图标类 PNG 的透明区常常只在四个圆角（几十个像素），
 * 64×64 的稀疏网格容易整格落在不透明区域上，误判成"不透明"→ 压成 JPEG → 四角变黑。
 * 这里按 192×192 采样，并额外强制检查四条边（透明图几乎总有贴边像素）。
 */
function hasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    const at = (x: number, y: number) => data[(y * width + x) * 4 + 3];

    const stepY = Math.max(1, Math.floor(height / 192));
    const stepX = Math.max(1, Math.floor(width / 192));
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        if (at(x, y) < 250) return true;
      }
    }

    // 四边逐像素扫一遍（成本可控：2×(w+h)）
    for (let x = 0; x < width; x++) {
      if (at(x, 0) < 250 || at(x, height - 1) < 250) return true;
    }
    for (let y = 0; y < height; y++) {
      if (at(0, y) < 250 || at(width - 1, y) < 250) return true;
    }
    return false;
  } catch {
    // 读不到像素时按「可能透明」处理，宁可输出 webp 也不要黑边
    return true;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function filesToImages(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  const out: string[] = [];
  for (const file of list.slice(0, 4)) {
    try {
      out.push(await fileToImage(file));
    } catch {
      /* 单张失败不影响其他 */
    }
  }
  return out;
}
