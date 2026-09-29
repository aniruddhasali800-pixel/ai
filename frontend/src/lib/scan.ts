/**
 * The camera reading, kept apart from the UI so the scanner in the back office and the
 * one on a guest's table sticker share exactly the same behaviour.
 *
 * Nothing here is downloaded: every browser we care about now ships a QR decoder, and a
 * desktop with no camera falls back to typing the code that is printed under the sticker.
 */
interface DetectedCode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedCode[]>;
}

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  const host = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return host.BarcodeDetector ?? null;
}

/** True when this browser can genuinely point a camera at a code. */
export function cameraScanningSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!detectorCtor();
}

export class CameraUnavailable extends Error {}

/**
 * Opens the rear camera and calls onCode with the first QR it reads, then releases the
 * lens. The returned function stops the stream early — a left-open camera on a phone
 * drains the battery and keeps the privacy light on.
 */
export async function startQrCamera(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<() => void> {
  const Ctor = detectorCtor();
  if (!Ctor) throw new CameraUnavailable('This browser cannot read codes from the camera');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraUnavailable('No camera is reachable from this page');

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError') throw new CameraUnavailable('Camera blocked — allow it in the browser, or type the code');
    if (name === 'NotFoundError') throw new CameraUnavailable('No camera found — type the code instead');
    throw new CameraUnavailable('The camera could not start — type the code instead');
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => undefined);

  const detector = new Ctor({ formats: ['qr_code'] });
  let reading = true;
  let finished = false;

  const stop = () => {
    reading = false;
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  const readFrame = async () => {
    if (!reading) return;
    try {
      const found = await detector.detect(video);
      if (found.length && !finished) {
        finished = true;
        stop();
        onCode(found[0].rawValue);
        return;
      }
    } catch {
      // A blurry frame is normal; the next tick tries again.
    }
    if (reading) timer = window.setTimeout(readFrame, 260);
  };

  let timer = window.setTimeout(readFrame, 260);
  return () => {
    window.clearTimeout(timer);
    stop();
  };
}
