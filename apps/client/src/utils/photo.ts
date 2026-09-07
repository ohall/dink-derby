import { Sha256 } from './sha256';

export type PreparedPhoto = { bytes: ArrayBuffer; contentType: 'image/jpeg'; hash: string; width: number; height: number };

const LONGEST_EDGE = 1600;
const MAX_SOURCE_PIXELS = 16_000_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const HEADER_BYTES = 256 * 1024;
const unreadable = () => new Error('Choose a JPEG, PNG, or WebP photo. You can also save without a photo.');

// Inspect a bounded header before asking the browser to allocate decoded pixels.
// Resize options alone do not bound the decoder's intermediate allocations.
export function photoDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && text(12, 4) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 25 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    if (text(12, 4) === 'VP8X' && bytes.length >= 30) {
      if (bytes[20] & 2) throw new Error('Choose a still photo instead of an animation.');
      const uint24 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
      return { width: 1 + uint24(24), height: 1 + uint24(27) };
    }
    if (text(12, 4) === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (text(12, 4) === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  throw unreadable();
}

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Photo preparation cancelled.', 'AbortError');
}

async function prepare(file: File, signal?: AbortSignal): Promise<PreparedPhoto> {
  checkCancelled(signal);
  if (file.size > MAX_FILE_BYTES) throw new Error('This photo is too large. Choose one under 20 MB, or save without a photo.');
  const dimensions = photoDimensions(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()));
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_SOURCE_PIXELS) {
    throw new Error('This photo is too large to safely open here. Choose a photo at 16 MP or less, or save without a photo.');
  }
  checkCancelled(signal);

  let source: ImageBitmap | HTMLImageElement | undefined;
  let objectUrl: string | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const releaseSource = () => {
    if (source) {
      if ('close' in source) source.close();
      else source.src = '';
      source = undefined;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };
  try {
    if (typeof createImageBitmap === 'function') {
      // Set one edge only to preserve EXIF orientation and aspect ratio. Using
      // the smaller edge keeps either orientation within the target size.
      const ratio = Math.min(1, LONGEST_EDGE / Math.max(dimensions.width, dimensions.height));
      source = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: Math.max(1, Math.round(Math.min(dimensions.width, dimensions.height) * ratio)), resizeQuality: 'low' });
    } else {
      // The header guard also bounds the older-browser fallback. Never retry a
      // failed bitmap decode with a second decoder under memory pressure.
      const image = new Image();
      source = image;
      objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(unreadable());
        image.src = objectUrl!;
      });
    }
    checkCancelled(signal);
    const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
    const scale = Math.min(1, LONGEST_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the photo. You can save without it.');
    context.drawImage(source, 0, 0, width, height);
    releaseSource();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(value => value ? resolve(value) : reject(new Error('Photo compression failed. You can save without it.')), 'image/jpeg', 0.8);
    });
    canvas.width = canvas.height = 0;
    if (blob.size > MAX_OUTPUT_BYTES) throw new Error('Choose a smaller photo, or save without a photo.');
    checkCancelled(signal);
    // WebKit can fail while staging Blob/File objects for IndexedDB. Store a
    // bounded encoded buffer instead, only after releasing decoded pixels.
    const bytes = await blob.arrayBuffer();
    const hasher = new Sha256();
    hasher.update(new Uint8Array(bytes));
    checkCancelled(signal);
    return { bytes, contentType: 'image/jpeg', hash: hasher.digest(), width, height };
  } finally {
    releaseSource();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

let pending: Promise<unknown> = Promise.resolve();

export function preparePhoto(file: File, signal?: AbortSignal): Promise<PreparedPhoto> {
  // Closing/reopening the sheet or quickly replacing a selection must not
  // allow two camera-sized decodes to overlap.
  const result = pending.then(() => prepare(file, signal));
  pending = result.catch(() => undefined);
  return result;
}
