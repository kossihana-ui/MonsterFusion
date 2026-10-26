import sounds from '../mocks/battleSounds.json';
const ids = new Set(sounds.map(s => s.id));
export function battleSoundLayers(id: string, element?: string) {
  if (id === 'victory') return ['music/victory'];
  const layers = [`battle/${ids.has(id) ? id : 'attack'}`];
  const definition = sounds.find(s => s.id === id);
  if ((definition?.element === 'self' || !definition) && element && ids.has(`element-${element}`)) {
    layers.push(`battle/element-${element}`);
  }
  return layers;
}
export function battleSound(id: string, muted = false, element?: string) {
  if (muted) return () => {};
  const layers = battleSoundLayers(id, element);
  const players = layers.map((file,i) => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${file}.wav?v=3`);
    audio.volume = layers.length > 1 ? (i === 0 ? .15 : .32) : .38;
    void audio.play().catch(() => {});
    return audio;
  });
  return () => { players.forEach(audio => { audio.pause(); audio.src = ''; }); };
}
