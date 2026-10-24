import { useEffect, useRef, useState } from "react";
import { machineTiming } from "./FusionMachine";

export function useFusionPlayback(context: AudioContext | null, muted: boolean, stopped: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [soundUnavailable, setSoundUnavailable] = useState(false);
  const volume = useRef<GainNode | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => {
    if (volume.current && context) volume.current.gain.setTargetAtTime(muted ? 0 : .7, context.currentTime, .012);
  }, [muted, context]);
  useEffect(() => {
    if (stopped) { setLoading(false); return; }
    let cancelled = false, frame = 0, source: AudioBufferSourceNode | null = null;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 4000);
    async function start() {
      let buffer: AudioBuffer | null = null;
      try {
        if (context?.state === "running") {
          const response = await fetch(import.meta.env.BASE_URL + "audio/selection/fusion-motor-door.wav", { signal: abort.signal });
          if (!response.ok) throw new Error("Audio load failed");
          buffer = await context.decodeAudioData(await response.arrayBuffer());
        } else if (!mutedRef.current) setSoundUnavailable(true);
      } catch {
        if (!cancelled) setSoundUnavailable(true);
      } finally { clearTimeout(timeout); }
      if (cancelled) return;
      const startWall = performance.now();
      const startAudio = context?.currentTime ?? 0;
      let usingAudio = Boolean(buffer && context?.state === "running");
      if (buffer && context && usingAudio) {
        source = context.createBufferSource(); source.buffer = buffer;
        const gain = context.createGain(); volume.current = gain;
        gain.gain.value = mutedRef.current ? 0 : .7;
        source.connect(gain); gain.connect(context.destination);
        source.start(startAudio + machineTiming.close);
      }
      setLoading(false);
      let last = 0, fallbackStart = startWall;
      const tick = () => {
        if (cancelled) return;
        if (usingAudio && context?.state !== "running") {
          usingAudio = false; fallbackStart = performance.now()-last;
          source?.stop(); source = null;
        }
        last = usingAudio && context ? (context.currentTime-startAudio)*1000 : performance.now()-fallbackStart;
        setElapsed(last);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    void start();
    return () => {
      cancelled = true; abort.abort(); clearTimeout(timeout); cancelAnimationFrame(frame);
      source?.stop(); source?.disconnect(); volume.current?.disconnect(); volume.current = null;
    };
  }, [context, stopped]);
  return { elapsed, loading, soundUnavailable };
}
