# Selection sound studies

Original synthesized sounds for MonsterFusion; no sampled game audio or external recordings.
Created with scripts/build-selection-sounds.mjs (Node built-ins only).
Run: node scripts/build-selection-sounds.mjs

Revision 2: nearly level pitch, soft 35ms onset, 105ms sustain and a smooth release. Seeded filtered noise adds a breath-like onset; upward scoops, sub-octave and echoes removed.
Each file is 0.64 seconds, mono PCM16, 48 kHz. Matched RMS target 0.12,
peak capped at 0.65; attack and tail fades avoid abrupt discontinuities.
The audition page defaults to 50% volume. These are alternatives, not yet global UI sounds.

Reference direction is the user's description of a rounded electronic “fon”.
No claim of reproducing an existing game's exact sound.
