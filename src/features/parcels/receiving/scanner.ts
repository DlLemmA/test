// ============================================
// Scanner seam. The flow knows only this interface: a code comes in, the
// reducer decides what it means. Camera and scripted scanners are adapters.
// ============================================

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export interface Scanner {
  start(video: HTMLVideoElement, onCode: (code: string) => void): Promise<void>;
  stop(): void;
}

export function cameraScanner(): Scanner {
  let reader: BrowserMultiFormatReader | null = null;
  let controls: IScannerControls | null = null;

  return {
    async start(video, onCode) {
      if (!reader) {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        reader = new BrowserMultiFormatReader(hints);
      }

      const active = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        video,
        (result, error, callbackControls) => {
          if (result) {
            try {
              callbackControls?.stop();
            } catch {
              // already released
            }
            if (controls === callbackControls) controls = null;
            onCode(result.getText().trim());
            return;
          }
          if (error && error.name !== "NotFoundException") {
            console.warn("ZXing scan error:", error);
          }
        },
      );
      controls = active;
    },
    stop() {
      const active = controls;
      controls = null;
      try {
        active?.stop();
      } catch {
        // camera may already have been released
      }
    },
  };
}

/** Second adapter on the same seam: drives the flow in tests without a camera. */
export class ScriptedScanner implements Scanner {
  private onCode: ((code: string) => void) | null = null;
  starts = 0;
  stops = 0;

  async start(_video: HTMLVideoElement, onCode: (code: string) => void): Promise<void> {
    this.onCode = onCode;
    this.starts += 1;
  }

  stop(): void {
    this.onCode = null;
    this.stops += 1;
  }

  emit(code: string): void {
    this.onCode?.(code);
  }
}
