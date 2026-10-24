# Selection sound studies

Fusion motor study: fusion-motor.wav, 2.4 seconds.
Rebuild with node scripts/build-fusion-sound.mjs after generating selection sounds.
Deterministic harmonic motor rises from 78 to 320 Hz; rotor amplitude pulses
accelerate from 7 to 72 Hz with a subdued low housing resonance.
Motor fades out at 1.86s; approved clear.wav begins at 1.88s.
No drums, sampled audio or hiss. Preview only, not wired to the fusion timeline yet.

Revision 4 adds clear-layered.wav while preserving all three revision-3 files.
It layers a quiet 393 Hz perfect fifth over the 262 Hz clear tone (amplitude 0.24),
with a 160ms hold and 620ms smooth release. File duration: 0.84 seconds.
No noise or detuning is introduced; the upper tone fades earlier than the base.

Original synthesized sounds for MonsterFusion; no sampled game audio or external recordings.
Created with scripts/build-selection-sounds.mjs (Node built-ins only).
Run: node scripts/build-selection-sounds.mjs

Revision 3: lower stable pitches (220 / 262 / 196 Hz), 25ms onset and a smooth cosine release to silence at 420ms. Removed ALL noise, detuning and third harmonics. Second harmonics decay earlier than the fundamental for a clean dark tail.
Each file is 0.48 seconds, mono PCM16, 48 kHz. Matched RMS target 0.12,
peak capped at 0.65; attack and tail fades avoid abrupt discontinuities.
The audition page defaults to 50% volume. These are alternatives, not yet global UI sounds.

Reference direction is the user's description of a rounded electronic “fon”.
No claim of reproducing an existing game's exact sound.
