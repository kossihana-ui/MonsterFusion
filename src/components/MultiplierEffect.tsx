import type { BattleEffectEvent } from '@core/core/index.ts';
import '../styles/multiplier.css';

export function multiplierPresentation(event: BattleEffectEvent) {
  if (event.type !== 'damage' || event.hit !== event.hits) return null;
  const boosts = (event.boosts ?? []).filter(b => b.source !== 'element');
  const product = boosts.reduce((value, b) => value * b.factor, 1);
  if (product <= 1) return null;
  const factor = Math.round(product * 100) / 100;
  return { factor, critical: event.critical, reason: boosts.length === 1
    ? boosts[0].reason : boosts.map(b => `${b.reason} ×${b.factor}`).join(' / ') };
}
export type MultiplierPresentation = NonNullable<ReturnType<typeof multiplierPresentation>>;
export function MultiplierEffect({ value }: { value: MultiplierPresentation }) {
  return <div className="multiplier-effect" role="status">
    {value.critical && <span>会心</span>}
    <strong>×{value.factor}倍</strong><small>{value.reason}</small>
  </div>;
}
export function orchestraHit(factor: number, muted = false) {
  if (muted) return () => {};
  const audio = new Audio(`${import.meta.env.BASE_URL}sounds/orchestra-hit.wav?v=2`);
  audio.volume = factor >= 3 ? .48 : factor >= 2 ? .4 : .32;
  audio.playbackRate = factor >= 3 ? 1.12 : factor >= 2 ? 1.06 : 1;
  audio.preservesPitch = false;
  void audio.play().catch(() => {});
  return () => { audio.pause(); audio.src = ''; };
}
