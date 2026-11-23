"""The cover itch.io shows in a listing, at 630x500.

Why it exists: the share card (public/og.jpg, 800x420) was being used for
this too, and itch crops a listing thumbnail to 630x500. A card laid out
wide lost its sides, and in a grid of other games it read as a smear. The
game was shown 385 times in a week and clicked 3 times.

A listing thumbnail is seen at about half this size, next to twenty others,
for less than a second. So: the creatures big, three words of type, and
nothing that needs reading. Everything here is the game's own art and
palette, so the thumbnail and the page look like the same thing.

    python -I scripts/build-itch-cover.py

Writes release/itch-cover.png - outside public/, because it is uploaded
to itch.io rather than served with the game. Pillow only; no network, nothing invented -
the creatures are the starter sprites the game itself draws.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 630, 500
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(HERE, "src", "mocks", "assets", "starters")
OUT = os.path.join(HERE, "release", "itch-cover.png")

BOLD = r"C:\Windows\Fonts\YuGothB.ttc"
MED = r"C:\Windows\Fonts\YuGothM.ttc"


def font(path, size):
    return ImageFont.truetype(path, size)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


card = Image.new("RGB", (W, H), (13, 18, 21))
draw = ImageDraw.Draw(card)

# The page's own background: a diagonal wash from near-black to the
# slightly warmer green-grey the game uses behind everything.
top, mid, bottom = (13, 18, 21), (18, 27, 29), (14, 22, 24)
for y in range(H):
    t = y / (H - 1)
    draw.line([(0, y), (W, y)], fill=lerp(top, mid, t * 2) if t < .5 else lerp(mid, bottom, (t - .5) * 2))

# The arena doors' grid, at the same faint strength.
for y in range(0, H, 62):
    draw.line([(0, y), (W, y)], fill=(24, 34, 33))

# The light the fusion chamber throws.
glow = Image.new("RGB", (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
cx, cy, r = W // 2, 215, 300
for i in range(r, 0, -2):
    k = 1 - i / r
    gd.ellipse([cx - i, cy - i * .8, cx + i, cy + i * .8],
               fill=(round(70 * k * k), round(128 * k * k), round(74 * k * k)))
card = Image.blend(card, glow, 0.55)
draw = ImageDraw.Draw(card)


def creature(name, height, xy):
    """A starter at a clean multiple, nearest-neighbour: it is pixel art."""
    img = Image.open(os.path.join(ART, name)).convert("RGBA")
    scale = max(1, round(height / img.height))
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    # Its own shadow, so it sits on the card rather than floating on it.
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse(
        [xy[0] + img.width * .12, xy[1] + img.height - 14,
         xy[0] + img.width * .88, xy[1] + img.height + 10],
        fill=(0, 0, 0, 90))
    card.paste(Image.alpha_composite(card.convert("RGBA"), shade).convert("RGB"), (0, 0))
    card.paste(img, xy, img)


# The flower one is the face of the game, so it stands in front and biggest.
creature("ignis-v2-64.png", 150, (44, 160))
creature("aqua-v2-64.png", 150, (436, 160))
creature("moss-v2-64.png", 224, (203, 92))

# The mark, small and out of the way: the title is printed under the
# thumbnail by itch anyway, so this only has to be recognisable.
draw.rounded_rectangle([34, 30, 68, 64], 9, fill=(178, 216, 144))
draw.text((45, 36), "M", font=font(BOLD, 24), fill=(15, 23, 20))
draw.text((80, 39), "M O N S T E R F U S I O N", font=font(MED, 15), fill=(154, 179, 160))

# The band the words sit on, so they never fight the art behind them.
band = Image.new("RGBA", (W, 160), (10, 15, 17, 0))
bd = ImageDraw.Draw(band)
for y in range(160):
    bd.line([(0, y), (W, y)], fill=(10, 15, 17, round(248 * min(1, y / 46))))
card.paste(Image.alpha_composite(card.convert("RGBA").crop((0, H - 160, W, H)), band).convert("RGB"), (0, H - 160))
draw = ImageDraw.Draw(card)


def centred(text, f, y, fill):
    w = draw.textbbox((0, 0), text, font=f)[2]
    draw.text(((W - w) / 2, y), text, font=f, fill=fill)


# Two lines, both readable at half size. The first is what you do, the
# second is the only rule that matters.
centred("2体を融合して、世界に1体だけ", font(BOLD, 40), H - 126, (242, 247, 240))
centred("負けると、その仲間は二度と戻らない", font(MED, 25), H - 62, (255, 198, 136))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
card.save(OUT, "PNG", optimize=True)
print(f"{OUT}  {W}x{H}  {os.path.getsize(OUT):,} bytes")
