import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpeechCapture, type CaptureStatus } from "../audio/recognition";
import { tts } from "../audio/tts";
import { squelch } from "../audio/radioFx";

export interface PushToTalk {
  supported: boolean;
  status: CaptureStatus;
  statusDetail: string | null;
  keyed: boolean;
  enable: () => Promise<boolean>;
  keyDown: () => void;
  keyUp: () => void;
}

interface Options {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}

/**
 * Owns the SpeechCapture instance and wires the spacebar as a PTT key
 * (ignored while typing in form fields). Keying the mic steps on any
 * in-progress ATC speech, like a real radio.
 */
export function usePushToTalk({ onInterim, onFinal }: Options): PushToTalk {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [keyed, setKeyed] = useState(false);
  const keyedRef = useRef(false);

  const handlers = useRef({ onInterim, onFinal });
  handlers.current = { onInterim, onFinal };

  const capture = useMemo(
    () =>
      new SpeechCapture({
        onStatus: (s, detail) => {
          setStatus(s);
          setStatusDetail(detail ?? null);
        },
        onInterim: (text) => handlers.current.onInterim(text),
        onFinal: (text) => handlers.current.onFinal(text),
      }),
    [],
  );

  useEffect(() => () => capture.disable(), [capture]);

  const keyDown = useCallback(() => {
    if (keyedRef.current) return;
    keyedRef.current = true;
    setKeyed(true);
    tts.stopAll(); // keying the mic steps on whoever is talking
    squelch();
    capture.keyDown();
  }, [capture]);

  const keyUp = useCallback(() => {
    if (!keyedRef.current) return;
    keyedRef.current = false;
    setKeyed(false);
    squelch(0.08);
    capture.keyUp();
  }, [capture]);

  // Spacebar PTT, except while typing in an input
  useEffect(() => {
    const isTyping = () => {
      const tag = document.activeElement?.tagName;
      return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT";
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping()) return;
      e.preventDefault();
      if (!e.repeat) keyDown();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping()) return;
      e.preventDefault();
      keyUp();
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, [keyDown, keyUp]);

  return {
    supported: capture.supported,
    status,
    statusDetail,
    keyed,
    enable: () => capture.enable(),
    keyDown,
    keyUp,
  };
}
