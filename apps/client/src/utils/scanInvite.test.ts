import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QrScanner from 'qr-scanner';
import { startInviteScanner } from './scanInvite';

vi.mock('qr-scanner', () => ({ default: { createQrEngine: vi.fn(), scanImage: vi.fn(), NO_QR_CODE_FOUND: 'No QR code found' } }));
let stopTrack: ReturnType<typeof vi.fn>, terminate: ReturnType<typeof vi.fn>, getUserMedia: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let video: HTMLVideoElement;
let stop: (() => void) | undefined;
const callbacks = { onCode: vi.fn(), onStatus: vi.fn(), onError: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  stopTrack = vi.fn(); terminate = vi.fn();
  const track = { stop: stopTrack, addEventListener: vi.fn() };
  stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  video = document.createElement('video');
  for (const [key, value] of Object.entries({ readyState: 4, videoWidth: 640, videoHeight: 480 })) Object.defineProperty(video, key, { value });
  vi.mocked(QrScanner.createQrEngine).mockResolvedValue({ terminate } as unknown as Worker);
  vi.mocked(QrScanner.scanImage).mockRejectedValue('No QR code found');
});
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function start() { stop = startInviteScanner(video, callbacks); await vi.advanceTimersByTimeAsync(0); }

it('bounds camera capture and reuses a 400px decoder at no more than four scans per second', async () => {
  await start();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 10, max: 15 } } });
  await vi.advanceTimersByTimeAsync(999);
  expect(QrScanner.scanImage).toHaveBeenCalledTimes(4);
  const calls = vi.mocked(QrScanner.scanImage).mock.calls;
  expect(calls[0][1]).toMatchObject({ scanRegion: { width: 480, height: 480, downScaledWidth: 400, downScaledHeight: 400 } });
  expect((calls[0][1] as { canvas: unknown }).canvas).toBe((calls[3][1] as { canvas: unknown }).canvas);
});
it('stops the camera and worker before delivering a recognized invite', async () => {
  vi.mocked(QrScanner.scanImage).mockResolvedValue({ data: 'DINK-ABCD1234', cornerPoints: [] } as never);
  callbacks.onCode.mockImplementation(() => { expect(stopTrack).toHaveBeenCalledTimes(1); expect(terminate).toHaveBeenCalledTimes(1); });
  await start(); await vi.advanceTimersByTimeAsync(1000);
  expect(callbacks.onCode).toHaveBeenCalledExactlyOnceWith('DINK-ABCD1234');
  expect(video.srcObject).toBeNull(); expect(QrScanner.scanImage).toHaveBeenCalledTimes(1);
});
it('ignores unrelated QR content and never navigates or joins automatically', async () => {
  vi.mocked(QrScanner.scanImage).mockResolvedValue({ data: 'https://evil.example', cornerPoints: [] } as never);
  await start();
  expect(callbacks.onStatus).toHaveBeenLastCalledWith(expect.stringContaining('isn’t a Dink Derby invite'));
  expect(callbacks.onCode).not.toHaveBeenCalled(); expect(stopTrack).not.toHaveBeenCalled();
});
it('keeps scanning when the native detector reports a wrapped no-code result', async () => {
  vi.mocked(QrScanner.scanImage).mockRejectedValue('Scanner error: No QR code found');
  await start(); await vi.advanceTimersByTimeAsync(500);
  expect(QrScanner.scanImage).toHaveBeenCalledTimes(3); expect(callbacks.onError).not.toHaveBeenCalled();
});
it('releases resources on close and ignores a late decode', async () => {
  let resolve!: (value: never) => void;
  vi.mocked(QrScanner.scanImage).mockReturnValue(new Promise(done => { resolve = done; }));
  await start(); stop!();
  resolve({ data: 'DINK-ABCD1234', cornerPoints: [] } as never);
  await vi.advanceTimersByTimeAsync(1000);
  expect(stopTrack).toHaveBeenCalledTimes(1); expect(terminate).toHaveBeenCalledTimes(1); expect(callbacks.onCode).not.toHaveBeenCalled();
});
it.each(['cancel', 'timeout'])('stops a permission grant arriving after %s', async mode => {
  let resolve!: (stream: MediaStream) => void;
  getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
  await start();
  if (mode === 'cancel') stop!(); else await vi.advanceTimersByTimeAsync(20_000);
  resolve(stream); await vi.advanceTimersByTimeAsync(0);
  expect(stopTrack).toHaveBeenCalledTimes(1); expect(terminate).toHaveBeenCalledTimes(1);
  expect(QrScanner.scanImage).not.toHaveBeenCalled(); expect(video.srcObject).toBeNull();
});
it('reports denied permission without repeated camera prompts', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  await start();
  expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('permission was denied'));
  expect(getUserMedia).toHaveBeenCalledTimes(1); expect(terminate).toHaveBeenCalledTimes(1);
});
it('requires an explicit retry after backgrounding instead of reactivating the camera', async () => {
  await start();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(stopTrack).toHaveBeenCalledTimes(1); expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('background'));
});
it('times out idle scans to conserve battery', async () => {
  await start(); await vi.advanceTimersByTimeAsync(90_000);
  expect(stopTrack).toHaveBeenCalledTimes(1); expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('save battery'));
});
