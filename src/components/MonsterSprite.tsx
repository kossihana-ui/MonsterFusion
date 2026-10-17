import { useEffect, useRef, useState } from "react";
import { poseAt } from "@core/core/index.ts";
import type { AnimationName, MonsterPhenotype } from "@core/core/index.ts";
import { compositionFor, drawPose, prepareParts } from "./sprites/renderer";
import "../styles/sprites.css";

export interface SpriteMotion {
  animation: AnimationName;
  sequence: number;
}
export function MonsterSprite({
  phenotype,
  name,
  id,
  facingRight = false,
  motion,
}: {
  phenotype: MonsterPhenotype;
  name: string;
  id: string;
  facingRight?: boolean;
  motion?: SpriteMotion;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const animation = motion?.animation ?? "idle",
    sequence = motion?.sequence ?? 0;
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let disposed = false,
      frame = 0,
      visible = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const composition = compositionFor(phenotype);
    const phase =
      [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % 5000;
    const started = performance.now();
    setFailed(false);
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    observer.observe(canvas);
    prepareParts(composition)
      .then((assets) => {
        if (disposed) return;
        if (!assets.has(`body/${phenotype.bodyShape}`)) {
          setFailed(true);
          return;
        }
        const tick = (now: number) => {
          if (disposed) return;
          if (visible && !document.hidden) {
            let pose = poseAt(composition, {
              animation: reduced.matches ? "idle" : animation,
              timeMs: reduced.matches ? 0 : now - started,
              phase: reduced.matches ? 0 : phase,
              facingRight,
            });
            if (pose.finished)
              pose = poseAt(composition, {
                animation: "idle",
                timeMs: now - started,
                phase,
                facingRight,
              });
            drawPose(ctx, pose, assets, facingRight);
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [phenotype, id, facingRight, animation, sequence]);
  return (
    <>
      <canvas
        ref={ref}
        className="monster-sprite"
        width={64}
        height={64}
        role="img"
        aria-label={`${name}のドット絵`}
      />
      {failed && <span role="status">画像を読み込めませんでした</span>}
    </>
  );
}
