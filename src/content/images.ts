import type { BuiltDocument } from "../markdown/document";
import type { SiteAdapter } from "../sites/types";
import type { ImageAsset } from "../types";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Fetches the document's images in the page (with the chat site's session)
 * for the service worker to upload. Images that can't be read, or aren't
 * PNG, JPEG, WebP, GIF or SVG up to 10 MB, are left out.
 */
export async function collectImages(site: SiteAdapter, images: BuiltDocument["images"]): Promise<ImageAsset[]> {
  const assets: ImageAsset[] = [];
  for (const [i, { ref, source }] of images.entries()) {
    const blob = await site.imageBytes(source);
    const contentType = blob?.type.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!blob || !TYPES[contentType] || blob.size > MAX_BYTES) continue;
    assets.push({ ref, data: base64(await blob.arrayBuffer()), contentType, filename: `image-${i + 1}.${TYPES[contentType]}` });
  }
  return assets;
}
