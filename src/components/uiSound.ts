let playing: HTMLAudioElement | undefined;
export function playUiSound(kind: "select" | "equip" | "remove" = "select") {
  playing?.pause();
  const audio = new Audio(`${import.meta.env.BASE_URL}audio/selection/clear.wav`);
  audio.volume = .35;
  audio.preservesPitch = false;
  audio.playbackRate = kind === "equip" ? 1.12 : kind === "remove" ? .82 : 1;
  playing = audio;
  void audio.play().catch(() => {});
}
