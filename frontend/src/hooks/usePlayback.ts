import { useCallback, useEffect, useMemo, useState } from "react";
import type { Frame } from "../types";

export const SPEEDS = [1, 2, 5, 10, 25, 50];

/**
 * Playback over recorded engine frames. The cursor is a simulation time; the
 * displayed state is always the recorded frame with the greatest time <= cursor,
 * so stepping backward restores the exact prior recorded state.
 */
export function usePlayback(frames: Frame[] | undefined, endTime: number) {
  const [cursor, setCursor] = useState(endTime);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);

  // A new result starts fully revealed; playback is opt-in.
  useEffect(() => {
    setCursor(endTime);
    setPlaying(false);
  }, [frames, endTime]);

  const frameIndex = useMemo(() => {
    if (!frames?.length) return -1;
    let lo = 0, hi = frames.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].time <= cursor) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }, [frames, cursor]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        if (c >= endTime) { setPlaying(false); return endTime; }
        return c + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed, endTime]);

  const play = useCallback(() => {
    setCursor((c) => (c >= endTime ? 0 : c));
    setPlaying(true);
  }, [endTime]);
  const pause = useCallback(() => setPlaying(false), []);
  const reset = useCallback(() => { setPlaying(false); setCursor(0); }, []);
  const seek = useCallback((t: number) => { setPlaying(false); setCursor(Math.max(0, Math.min(endTime, Math.round(t)))); }, [endTime]);
  const stepForward = useCallback(() => {
    setPlaying(false);
    if (!frames?.length) return;
    const next = frames.find((f) => f.time > cursor);
    setCursor(next ? next.time : endTime);
  }, [frames, cursor, endTime]);
  const stepBackward = useCallback(() => {
    setPlaying(false);
    if (!frames?.length) return;
    let prev: Frame | undefined;
    for (const f of frames) { if (f.time < cursor) prev = f; else break; }
    setCursor(prev ? prev.time : 0);
  }, [frames, cursor]);

  return {
    cursor, playing, speed, setSpeed, frameIndex,
    frame: frameIndex >= 0 && frames ? frames[frameIndex] : null,
    play, pause, reset, seek, stepForward, stepBackward,
    atStart: cursor <= 0, atEnd: cursor >= endTime,
  };
}
