"""Synthesises the promo soundtrack (promo/music.wav). Needs numpy only.

Part A (0 to 16.4 s) is a plodding, slightly clumsy minor tune for the struggle.
Part B (16.4 s on) is an upbeat major groove at 120 bpm; the scene cuts and taps in
index.html sit on its beats.
"""
import wave
from pathlib import Path
import numpy as np

SR = 44100
DUR = 37.4
out = np.zeros(int(SR * (DUR + 0.5)))
rng = np.random.default_rng(7)


def hz(n):  # midi note to frequency
    return 440.0 * 2 ** ((n - 69) / 12)


def add(sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(out):
        return
    sig = sig[: len(out) - i]
    out[i : i + len(sig)] += sig * gain


def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1.0) * np.exp(-t / d)


def tone(f, dur, harm=(1, 0.5, 0.25), a=0.005, d=0.3, vib=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * f * t + (vib * np.sin(2 * np.pi * 5.5 * t) if vib else 0)
    s = sum(h * np.sin((k + 1) * ph) for k, h in enumerate(harm))
    return s * env(n, a, d) / sum(harm)


def slide(f0, f1, dur, d=0.5):
    n = int(dur * SR)
    f = np.linspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.33 * np.sin(3 * ph) + 0.2 * np.sin(4 * ph)
    return s * env(n, 0.03, d) / 2


def noise(dur, d=0.05, hp=True):
    n = int(dur * SR)
    s = rng.standard_normal(n)
    if hp:
        s = np.diff(s, prepend=0)
    return s * env(n, 0.001, d)


def kick():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (48 * t + 60 * (1 - np.exp(-t * 28)) / 28 * 3)) * np.exp(-t / 0.11)


def ding(f):
    return tone(f, 0.7, (1, 0.3, 0.12, 0.3), d=0.2) + 0.5 * tone(f * 2, 0.7, (1,), d=0.1)


# ---- Part A: the struggle (90 bpm) ----
beat = 60 / 90
tuba = (1, 0.7, 0.45, 0.2)
for i in range(18):  # oom-pah bass up to the failed lift
    add(tone(hz(45 if i % 2 == 0 else 40), 0.4, tuba, d=0.16), i * beat, 0.5)
mel = [57, None, 60, 59, 57, None, 52, None, 57, None, 60, 62, 64, 63, 64, None]
for i, m in enumerate(mel):  # sneaky pizzicato line
    if m:
        add(tone(hz(m + 12), 0.3, (1, 0.2), d=0.09), 1.2 + i * beat / 2 + (0.03 if i % 2 else 0), 0.3)
add(ding(1320), 1.15, 0.25)  # thought bubble
for t in (3.9, 4.5, 5.1, 5.7, 6.3):  # notes flying in
    add(noise(0.25, 0.07), t, 0.12)
    add(tone(hz(76 + int(t * 3) % 5), 0.2, (1,), d=0.05), t + 0.3, 0.22)
add(slide(110, 220, 0.9, d=2.0), 9.9, 0.25)  # straining upward
add(slide(240, 70, 0.3, d=0.4), 10.8, 0.35)  # and down it comes
add(kick(), 11.05, 0.9)
add(noise(0.3, 0.08, hp=False), 11.05, 0.25)
add(kick(), 11.4, 1.0)  # NOPE stamp
for i, (m, d) in enumerate([(62, 0.42), (61, 0.42), (60, 0.42), (59, 1.3)]):  # sad trombone
    add(tone(hz(m), d + 0.1, (1, 0.6, 0.4, 0.25, 0.12), a=0.04, d=1.2 if i == 3 else 0.5, vib=0.25 if i == 3 else 0), 11.5 + i * 0.4, 0.42)
for i in range(6):  # six flat weeks: the same dull note, a clock ticking
    add(tone(hz(45), 0.5, tuba, d=0.25), 13.1 + i * 0.36, 0.4)
    add(noise(0.03, 0.006), 13.1 + i * 0.36 + 0.18, 0.15)
n = int(0.9 * SR)  # riser into the reveal
ramp = np.linspace(0, 1, n) ** 2
add(rng.standard_normal(n) * ramp * 0.5 + slide(200, 1200, 0.9, d=5) * ramp, 15.5, 0.3)

# ---- Part B: Rival (120 bpm from 16.4 s) ----
T0, b = 16.4, 0.5
add(kick(), T0, 1.2)
for m in (60, 64, 67, 72):
    add(tone(hz(m), 2.0, (1, 0.4, 0.2), d=0.9), T0, 0.2)
chords = [(48, (60, 64, 67)), (43, (59, 62, 67)), (45, (60, 64, 69)), (41, (60, 65, 69))]  # C G Am F
nb = int((33.4 - T0) / b)
for i in range(nb):
    t = T0 + i * b
    root, tri = chords[(i // 4) % 4]
    drums = i >= 6  # the first three seconds stay light under the logo
    if drums:
        add(kick(), t, 0.85)
        add(noise(0.05, 0.012), t + b / 2, 0.16)
        if i % 2:
            add(noise(0.18, 0.05), t, 0.3)
    for k in range(2):
        add(tone(hz(root), 0.24, (1, 0.5, 0.3), d=0.12), t + k * b / 2, 0.45 if drums else 0.25)
    for k in range(4):
        note = tri[(k + i) % 3] + (12 if (k + i) % 4 == 3 else 0)
        add(tone(hz(note + 12), 0.3, (1, 0.25), d=0.1), t + k * b / 4, 0.16)
for j, t in enumerate((22.4, 22.9, 23.4)):  # week one taps
    add(ding(hz(84 + 2 * j)), t, 0.4)
add(noise(0.7, 0.3), 24.6, 0.12)  # phone flip
add(ding(hz(91)), 26.0, 0.35)  # +2.5 badges
for j, t in enumerate((27.9, 28.4, 28.9)):  # week two taps
    add(ding(hz(86 + 2 * j)), t, 0.4)
add(noise(0.5, 0.2), 31.4, 0.2)  # the ghost dissolves
for j, m in enumerate((72, 76, 79, 84)):
    add(ding(hz(m)), 31.5 + j * 0.12, 0.3)
add(kick(), 33.4, 1.2)  # end card
for m in (48, 60, 64, 67, 72, 76):
    add(tone(hz(m), 4.0, (1, 0.4, 0.2), a=0.01, d=1.6), 33.4, 0.22)
for j, m in enumerate((79, 76, 79, 84)):
    add(tone(hz(m), 0.8, (1, 0.25), d=0.3), 34.4 + j * 0.25, 0.22)

out = out[: int(SR * DUR)]
out[: int(15.4 * SR)] *= 1.9  # the sparse first half needs lifting to sit level with the groove
fade = int(0.6 * SR)
out[-fade:] *= np.linspace(1, 0, fade)
out = np.tanh(out * 1.1 / np.max(np.abs(out)) * 1.4) * 0.9
pcm = (out * 32767).astype("<i2")
with wave.open(str(Path(__file__).with_name("music.wav")), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote music.wav")
