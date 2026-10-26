import sounds from '../mocks/battleSounds.json';
const ids = new Set(sounds.map(s => s.id));
export function battleSound(id: string, muted = false) {
  if (muted) return () => {};
  const audio = new Audio(`${import.meta.env.BASE_URL}audio/battle/${ids.has(id) ? id : 'attack'}.wav`);
  audio.volume = .38;
  void audio.play().catch(() => {});
  return () => { audio.pause(); audio.src = ''; };
}
