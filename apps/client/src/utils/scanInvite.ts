import type QrScanner from 'qr-scanner';
import { parseDerbyInvite } from '../domain/invites';

type Callbacks = { onCode: (code: string) => void; onStatus: (message: string) => void; onError: (message: string) => void };

/** Own the camera lifecycle so cancellation also stops late permission grants. */
export function startInviteScanner(video: HTMLVideoElement, { onCode, onStatus, onError }: Callbacks): () => void {
  let closed = false;
  let stream: MediaStream | undefined;
  let engine: Awaited<ReturnType<typeof QrScanner.createQrEngine>> | undefined;
  let nextFrame: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const canvas = document.createElement('canvas');
  const startupTimer = setTimeout(() => fail('Camera took too long to open. Try again or enter the invite code.'), 20_000);

  function stop() {
    if (closed) return;
    closed = true;
    clearTimeout(startupTimer); clearTimeout(idleTimer); clearTimeout(nextFrame);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    stream?.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null;
    if (engine && 'terminate' in engine) engine.terminate();
    canvas.width = canvas.height = 0;
  }
  function fail(message: string) {
    if (closed) return;
    stop(); onError(message);
  }
  function onVisibility() { if (document.hidden) fail('Camera stopped while the app was in the background. Tap Try camera again to resume.'); }
  function onPageHide() { fail('Camera stopped. Tap Try camera again to resume.'); }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  async function start() {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        fail('Camera scanning is unavailable here. Use your phone camera to open the QR link, or enter the invite code.'); return;
      }
      const { default: Scanner } = await import('qr-scanner');
      if (closed) return;
      engine = await Scanner.createQrEngine();
      if (closed) { if ('terminate' in engine) engine.terminate(); return; }
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        facingMode: { ideal: 'environment' }, width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 10, max: 15 },
      } });
      if (closed) { stream.getTracks().forEach(track => track.stop()); return; }
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => fail('Camera disconnected. Try again or enter the invite code.'), { once: true }));
      video.srcObject = stream;
      await video.play();
      if (closed) return;
      clearTimeout(startupTimer);
      onStatus('Point the camera at a participant’s derby QR code.');
      idleTimer = setTimeout(() => fail('Camera stopped to save battery. Try again or enter the invite code.'), 90_000);

      async function scan() {
        if (closed) return;
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
          const size = Math.min(video.videoWidth, video.videoHeight);
          try {
            const result = await Scanner.scanImage(video, { qrEngine: engine, canvas, returnDetailedScanResult: true,
              scanRegion: { x: (video.videoWidth - size) / 2, y: (video.videoHeight - size) / 2, width: size, height: size, downScaledWidth: 400, downScaledHeight: 400 } });
            if (closed) return;
            const code = parseDerbyInvite(result.data, window.location.origin);
            if (code) { stop(); onCode(code); return; }
            onStatus('That isn’t a Dink Derby invite. Scan the code under Invite anglers.');
          } catch (error) {
            if (closed) return;
            // Native BarcodeDetector wraps a miss; the worker returns it bare.
            if (![Scanner.NO_QR_CODE_FOUND, `Scanner error: ${Scanner.NO_QR_CODE_FOUND}`].includes(String(error))) {
              fail('Could not read the camera. Try again or enter the invite code.'); return;
            }
          }
        }
        // One decode at a time, at most four per second; reuse one 400px canvas.
        if (!closed) nextFrame = setTimeout(() => void scan(), 250);
      }
      void scan();
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
      fail(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in browser settings, or enter the invite code.' :
        name === 'NotFoundError' ? 'No camera found. Enter the invite code instead.' : 'Camera could not start. Close other camera apps and try again, or enter the invite code.');
    }
  }
  if (document.hidden) onVisibility(); else void start();
  return stop;
}
