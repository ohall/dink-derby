import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photoDimensions, preparePhoto } from './photo';

function jpeg(width: number, height: number) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]);
}
const file = (width = 4032, height = 3024) => new NodeBlob([jpeg(width, height)], { type: 'image/jpeg' }) as unknown as File;

describe('photo preparation', () => {
  let canvas: HTMLCanvasElement;
  let draw: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    draw = vi.fn();
    close = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    vi.spyOn(canvas, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
    vi.spyOn(canvas, 'toBlob').mockImplementation(callback => callback(new NodeBlob(['jpeg'], { type: 'image/jpeg' }) as unknown as Blob));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1200, height: 900, close }));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('rejects a 48 MP camera image before decoding it', async () => {
    await expect(preparePhoto(file(8064, 6048))).rejects.toThrow('16 MP');
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });

  it('rejects unsupported formats and huge compressed files before decoding', async () => {
    await expect(preparePhoto(new NodeBlob(['HEIC']) as unknown as File)).rejects.toThrow('JPEG');
    await expect(preparePhoto({ size: 21 * 1024 * 1024 } as File)).rejects.toThrow('20 MB');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('requests a small bitmap, hashes the compressed output, and releases both buffers', async () => {
    const result = await preparePhoto(file());
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ resizeWidth: 1200, imageOrientation: 'from-image' }));
    expect(result).toMatchObject({ width: 1200, height: 900, hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.bytes.byteLength).toBe(4);
    expect(result.contentType).toBe('image/jpeg');
    expect(close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('does not retry a failing decoder with an original-size image', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('decoder out of memory'));
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    await expect(preparePhoto(file())).rejects.toThrow('decoder out of memory');
    expect(image).not.toHaveBeenCalled();
  });

  it.each(['draw', 'encode'])('releases buffers when %s fails', async stage => {
    if (stage === 'draw') draw.mockImplementation(() => { throw new Error('draw failed'); });
    else vi.mocked(canvas.toBlob).mockImplementation(callback => callback(null));
    await expect(preparePhoto(file())).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('serializes selections and releases a cancelled decode before the next starts', async () => {
    let complete!: (bitmap: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const controller = new AbortController();
    const first = preparePhoto(file(), controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
    const second = preparePhoto(file());
    expect(createImageBitmap).toHaveBeenCalledOnce();
    controller.abort();
    complete({ width: 1200, height: 900, close } as unknown as ImageBitmap);
    await rejected;
    await second;
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledOnce();
  });

  it('rejects a cancelled queued selection without decoding', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(preparePhoto(file(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('reads JPEG, PNG and WebP dimensions without decoding pixels', () => {
    expect(photoDimensions(jpeg(4032, 3024))).toEqual({ width: 4032, height: 3024 });
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.set([73, 72, 68, 82], 12);
    const pngView = new DataView(png.buffer);
    pngView.setUint32(16, 800); pngView.setUint32(20, 600);
    expect(photoDimensions(png)).toEqual({ width: 800, height: 600 });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
    webp[24] = 99; webp[27] = 49;
    expect(photoDimensions(webp)).toEqual({ width: 100, height: 50 });
    webp[20] = 2;
    expect(() => photoDimensions(webp)).toThrow('still photo');
  });

  it('rejects truncated and malformed headers', () => {
    for (const bytes of [new Uint8Array(), jpeg(1, 1).slice(0, 8), new Uint8Array([255, 216, 255, 224, 0, 0])]) {
      expect(() => photoDimensions(bytes)).toThrow('JPEG');
    }
  });
});
