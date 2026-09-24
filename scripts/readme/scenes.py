"""Procedurally paints the demo-library artwork used for README screenshots (pure PIL, no assets).
   python3 scripts/readme/scenes.py <out-dir>"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H = 1920, 1080
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "scenes")
OUT.mkdir(parents=True, exist_ok=True)


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgrad(stops, w=W, h=H):
    """Vertical gradient; stops = [(pos 0..1, '#rrggbb'), ...]."""
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    stops = [(p, hexc(c)) for p, c in stops]
    for y in range(h):
        t = y / (h - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                d.line([(0, y), (w, y)], fill=lerp(c0, c1, (t - p0) / max(p1 - p0, 1e-6)))
                break
    return img


def screen(base, layer):
    return ImageChops.screen(base, layer)


def glow(base, cx, cy, r, color, blur=None, strength=1.0):
    layer = Image.new("RGB", base.size)
    ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r], fill=lerp((0, 0, 0), hexc(color), strength))
    return screen(base, layer.filter(ImageFilter.GaussianBlur(blur or r * 0.6)))


def ridge(seed, base, amp, freq=1.0, w=W):
    rnd = random.Random(seed)
    waves = [(rnd.uniform(0.5, 3.0) * freq, rnd.uniform(0, 6.28), rnd.uniform(0.3, 1.0)) for _ in range(6)]
    norm = sum(a for _, _, a in waves)
    pts = []
    for x in range(0, w + 8, 8):
        v = sum(a * math.sin(x / w * f * 6.28 + p) for f, p, a in waves) / norm
        v += 0.15 * math.sin(x * 0.05 + seed) * rnd.uniform(0.2, 1)
        pts.append((x, base - v * amp))
    return pts


def mountains(img, seed, base, amp, color, freq=1.0, blur=0):
    layer = Image.new("RGBA", img.size)
    pts = ridge(seed, base, amp, freq, img.size[0])
    ImageDraw.Draw(layer).polygon(pts + [(img.size[0], img.size[1]), (0, img.size[1])], fill=hexc(color) + (255,))
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(layer, (0, 0), layer)
    return img


def stars(img, n, seed=1, top=1.0):
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    w, h = img.size
    for _ in range(n):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h * top) ** 1.0
        b = rnd.randint(120, 255)
        r = rnd.choice([0.6, 0.8, 1.0, 1.4])
        d.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 20)))
    return img


def value_noise(seed, cells=(16, 9), size=(W, H), octaves=4):
    rnd = random.Random(seed)
    acc = Image.new("L", size, 0)
    amp_total = 0
    for o in range(octaves):
        cw, ch = cells[0] * 2**o, cells[1] * 2**o
        small = Image.new("L", (cw, ch))
        small.putdata([rnd.randint(0, 255) for _ in range(cw * ch)])
        layer = small.resize(size, Image.BICUBIC)
        a = 1 / 2**o
        acc = Image.blend(acc, layer, a / (amp_total + a))
        amp_total += a
    return acc


def colorize(gray, stops):
    """Map a grayscale image through a colour ramp."""
    lut = []
    stops = [(p, hexc(c)) for p, c in stops]
    for i in range(256):
        t = i / 255
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                lut.append(lerp(c0, c1, (t - p0) / max(p1 - p0, 1e-6)))
                break
        else:
            lut.append(stops[-1][1])
    r = gray.point([c[0] for c in lut])
    g = gray.point([c[1] for c in lut])
    b = gray.point([c[2] for c in lut])
    return Image.merge("RGB", (r, g, b))


def reflect(img, horizon, strength=0.55):
    top = img.crop((0, int(horizon - (H - horizon)), W, int(horizon))).transpose(Image.FLIP_TOP_BOTTOM)
    top = top.filter(ImageFilter.GaussianBlur(3))
    dark = Image.new("RGB", top.size, (0, 0, 0))
    ref = Image.blend(dark, top, strength)
    d = ImageDraw.Draw(ref)
    rnd = random.Random(4)
    for _ in range(140):
        y = rnd.uniform(0, ref.size[1])
        x = rnd.uniform(0, W)
        L = rnd.uniform(40, 260)
        d.line([(x, y), (x + L, y)], fill=(0, 0, 0), width=1)
    img.paste(ref, (0, int(horizon)))
    return img


def vignette(img, strength=0.55):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse([-W * 0.15, -H * 0.2, W * 1.15, H * 1.2], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(220))
    dark = Image.blend(img, Image.new("RGB", img.size), strength)
    return Image.composite(img, dark, mask)


# ---------------------------------------------------------------- scenes


def aurora():
    img = vgrad([(0, "#02040d"), (0.55, "#071a2e"), (1, "#0b2a3a")])
    stars(img, 900, 3, 0.7)
    layer = Image.new("RGB", img.size)
    d = ImageDraw.Draw(layer)
    for band, (col, y0, amp, ph) in enumerate(
        [("#2cf5a3", 380, 120, 0.3), ("#18c8d8", 330, 90, 1.7), ("#8a5cff", 270, 70, 3.1)]
    ):
        c = hexc(col)
        for x in range(0, W, 3):
            y = y0 + amp * math.sin(x / W * 5.5 + ph) + 30 * math.sin(x / 90 + band)
            inten = 0.5 + 0.5 * math.sin(x / 40 + band * 2)
            top = y - 260 - 80 * inten
            for k in range(8):
                t = k / 8
                yy = top + (y - top) * t
                d.line([(x, yy), (x, yy + (y - top) / 8)], fill=lerp((0, 0, 0), c, (t**2) * (0.35 + 0.65 * inten)))
    img = screen(img, layer.filter(ImageFilter.GaussianBlur(10)))
    img = screen(img, layer.filter(ImageFilter.GaussianBlur(60)))
    mountains(img, 7, 720, 110, "#0a1622", 1.4)
    mountains(img, 9, 770, 70, "#050b12", 2.2)
    reflect(img, 800)
    return vignette(img)


def sunset_sea():
    img = vgrad([(0, "#2a1450"), (0.35, "#b0376b"), (0.62, "#ff8a4c"), (0.7, "#ffc46b"), (1, "#ffd9a0")])
    img = glow(img, 1180, 640, 150, "#fff1c9", 40)
    img = glow(img, 1180, 640, 420, "#ff9a5a", 220, 0.7)
    horizon = 700
    reflect(img, horizon, 0.7)
    cliff = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(cliff)
    pts = [(0, 520), (160, 500), (330, 540), (520, 610), (700, 690), (760, 720), (0, 760)]
    d.polygon(pts, fill=(28, 16, 38, 255))
    rnd = random.Random(5)
    for _ in range(70):
        x = rnd.uniform(20, 560)
        y = 520 + (x / 560) * 110 + rnd.uniform(-10, 40)
        s = rnd.uniform(14, 30)
        d.rectangle([x, y - s * 0.7, x + s, y], fill=(250, 238, 230, 255))
        if rnd.random() < 0.2:
            d.ellipse([x + s * 0.2, y - s * 1.2, x + s * 0.8, y - s * 0.5], fill=(60, 110, 200, 255))
    img.paste(cliff, (0, 0), cliff)
    return vignette(img, 0.4)


def neon_city(w=W, h=H, seed=11):
    img = vgrad([(0, "#0b0620"), (0.5, "#2a0f4a"), (0.72, "#6b1f6b"), (1, "#12081f")], w, h)
    stars(img, 200, seed, 0.4)
    img = glow(img, int(w * 0.5), int(h * 0.62), int(w * 0.35), "#ff3fa4", w * 0.2, 0.55)
    rnd = random.Random(seed)
    horizon = int(h * 0.74)
    for layer_i, (shade, hmin, hmax) in enumerate([("#1a0f33", 0.25, 0.5), ("#0d0820", 0.12, 0.35)]):
        city = Image.new("RGBA", img.size)
        d = ImageDraw.Draw(city)
        x = -20
        while x < w:
            bw = rnd.uniform(w * 0.03, w * 0.08)
            bh = rnd.uniform(h * hmin, h * hmax) * (1.1 if layer_i else 0.9)
            top = horizon - bh
            d.rectangle([x, top, x + bw, horizon], fill=hexc(shade) + (255,))
            for wy in range(int(top + 12), horizon - 8, 14):
                for wx in range(int(x + 6), int(x + bw - 6), 12):
                    if rnd.random() < (0.28 if layer_i else 0.18):
                        col = rnd.choice([(255, 196, 120), (120, 230, 255), (255, 120, 210), (255, 240, 200)])
                        d.rectangle([wx, wy, wx + 5, wy + 7], fill=col + (255,))
            if rnd.random() < 0.25:
                d.rectangle([x + bw * 0.3, top - 30, x + bw * 0.34, top], fill=hexc(shade) + (255,))
                d.ellipse([x + bw * 0.3 - 4, top - 36, x + bw * 0.34 + 4, top - 28], fill=(255, 60, 90, 255))
            x += bw + rnd.uniform(0, w * 0.01)
        glowl = city.filter(ImageFilter.GaussianBlur(12))
        img.paste(glowl, (0, 0), glowl)
        img.paste(city, (0, 0), city)
    top = img.crop((0, horizon - (h - horizon), w, horizon)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(6))
    img.paste(Image.blend(Image.new("RGB", top.size), top, 0.6), (0, horizon))
    d = ImageDraw.Draw(img)
    for i in range(24):
        y = horizon + 6 + i * (h - horizon) / 24
        d.line([(0, y), (w, y)], fill=(10, 4, 20), width=1)
    return vignette(img, 0.45)


def synthwave():
    img = vgrad([(0, "#0d0221"), (0.4, "#3b0b59"), (0.62, "#ff2e97"), (0.63, "#1a0633"), (1, "#0d0221")])
    stars(img, 300, 8, 0.45)
    sun = Image.new("RGB", img.size)
    ImageDraw.Draw(sun).ellipse([960 - 250, 330, 960 + 250, 830], fill=(255, 200, 80))
    grad = vgrad([(0, "#ffe46b"), (0.5, "#ff7a3d"), (1, "#ff2e97")])
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([960 - 250, 330, 960 + 250, 830], fill=255)
    for i, y in enumerate(range(560, 690, 22)):
        md.rectangle([0, y, W, y + 4 + i * 2], fill=0)
    md.rectangle([0, 680, W, H], fill=0)
    img = Image.composite(grad, img, mask)
    img = glow(img, 960, 560, 330, "#ff2e97", 160, 0.5)
    mountains(img, 21, 690, 90, "#2a0a4a", 1.3)
    ground = vgrad([(0, "#1a0633"), (1, "#070112")], W, H - 690)
    img.paste(ground, (0, 690))
    d = ImageDraw.Draw(img)
    for i in range(-30, 31):
        d.line([(960 + i * 20, 690), (960 + i * 260, H)], fill=(255, 46, 151), width=2)
    y, gap = 694, 4
    while y < H:
        d.line([(0, y), (W, y)], fill=(255, 46, 151), width=2)
        y += gap
        gap *= 1.28
    return screen(img, img.filter(ImageFilter.GaussianBlur(14)).point(lambda p: p * 0.45))


def ocean():
    img = vgrad([(0, "#1ec0d8"), (0.25, "#0b7fb0"), (0.7, "#063a6b"), (1, "#021327")])
    rays = Image.new("RGB", img.size)
    d = ImageDraw.Draw(rays)
    rnd = random.Random(2)
    for _ in range(14):
        x = rnd.uniform(200, 1700)
        d.polygon([(x, -50), (x + 60, -50), (x + 260 + rnd.uniform(-80, 80), H), (x + 120, H)], fill=(60, 150, 170))
    img = screen(img, rays.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(img)
    for _ in range(90):
        x, y, r = rnd.uniform(0, W), rnd.uniform(200, H), rnd.uniform(2, 9)
        d.ellipse([x - r, y - r, x + r, y + r], outline=(170, 230, 255), width=1)
    for _ in range(26):
        x, y, s = rnd.uniform(100, 1800), rnd.uniform(420, 880), rnd.uniform(18, 46)
        d.ellipse([x, y, x + s * 2, y + s * 0.7], fill=(8, 40, 70))
        d.polygon([(x + s * 2, y + s * 0.35), (x + s * 2.6, y), (x + s * 2.6, y + s * 0.7)], fill=(8, 40, 70))
    mountains(img, 3, 960, 60, "#021a2e", 2.5)
    return vignette(img, 0.5)


def desert():
    img = vgrad([(0, "#f6b26b"), (0.45, "#ffd59e"), (0.5, "#ffe3b8"), (1, "#ffe3b8")])
    img = glow(img, 1350, 380, 90, "#fff6de", 30)
    img = glow(img, 1350, 380, 360, "#ffb45a", 180, 0.6)
    for i, (col, base, amp) in enumerate(
        [("#e9a25a", 600, 60), ("#d9853f", 700, 70), ("#c26a2c", 820, 80), ("#9c4d1d", 960, 90)]
    ):
        mountains(img, 30 + i, base, amp, col, 0.8)
    return vignette(img, 0.35)


def forest():
    img = vgrad([(0, "#cfe3dc"), (0.5, "#8fb5a8"), (1, "#27453d")])
    rnd = random.Random(6)
    for i, (col, base, size) in enumerate([("#86ab9f", 560, 130), ("#5e8a7e", 660, 170), ("#35594f", 780, 220), ("#16302a", 930, 300)]):
        layer = Image.new("RGBA", img.size)
        d = ImageDraw.Draw(layer)
        x = -50
        while x < W + 50:
            s = size * rnd.uniform(0.7, 1.2)
            base_y = base + rnd.uniform(-20, 20)
            d.polygon([(x, base_y - s), (x - s * 0.28, base_y), (x + s * 0.28, base_y)], fill=hexc(col) + (255,))
            x += s * rnd.uniform(0.25, 0.45)
        d.rectangle([0, base, W, H], fill=hexc(col) + (255,))
        img.paste(layer, (0, 0), layer)
        fog = Image.new("RGB", img.size, (205, 225, 220))
        img = Image.blend(img, fog, 0.12)
    rain = Image.new("RGB", img.size)
    d = ImageDraw.Draw(rain)
    for _ in range(900):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        d.line([(x, y), (x - 8, y + 30)], fill=(90, 110, 110))
    return vignette(screen(img, rain), 0.4)


def nebula():
    n = value_noise(12)
    img = colorize(n, [(0, "#02010a"), (0.45, "#120a3a"), (0.6, "#5b1f8f"), (0.72, "#e0438c"), (0.85, "#ffb36b"), (1, "#fff3d6")])
    n2 = value_noise(33, (10, 6))
    img = screen(img, colorize(n2, [(0, "#000000"), (0.6, "#000000"), (0.8, "#1d6fd1"), (1, "#7fe7ff")]))
    stars(img, 1400, 5)
    img = glow(img, 1250, 480, 60, "#ffffff", 20)
    img = glow(img, 1250, 480, 260, "#ff7ab8", 140, 0.5)
    return vignette(img, 0.4)


def galaxy():
    img = Image.new("RGB", (W, H), (3, 3, 12))
    stars(img, 1600, 9)
    layer = Image.new("RGB", img.size)
    d = ImageDraw.Draw(layer)
    rnd = random.Random(10)
    cx, cy = W / 2, H / 2
    for _ in range(26000):
        arm = rnd.choice([0, math.pi])
        r = rnd.random() ** 0.7 * 620
        a = arm + r / 120 + rnd.gauss(0, 0.28)
        x = cx + r * math.cos(a) * 1.25
        y = cy + r * math.sin(a) * 0.62
        c = lerp(hexc("#ffe7c2"), hexc("#6aa8ff"), min(1, r / 520))
        d.point((x, y), fill=c)
    img = screen(img, layer)
    img = screen(img, layer.filter(ImageFilter.GaussianBlur(6)))
    img = glow(img, int(cx), int(cy), 120, "#fff0d0", 60)
    return vignette(img, 0.3)


def beach():
    img = vgrad([(0, "#9ad7f5"), (0.42, "#d9f1ff"), (0.45, "#3fc7c4"), (0.62, "#1a9fb0"), (0.66, "#f4e3bf"), (1, "#e9cf9d")])
    img = glow(img, 420, 180, 70, "#fffdf0", 40)
    d = ImageDraw.Draw(img)
    for i in range(6):
        y = 690 + i * 12
        d.arc([-200, y - 40, W + 200, y + 40], 0, 180, fill=(255, 255, 255), width=3)
    trunk = [(1500 + i * 3 - (i / 40) ** 2 * 30, 1080 - i * 16) for i in range(45)]
    d.line(trunk, fill=(60, 40, 30), width=26, joint="curve")
    tx, ty = trunk[-1]
    for ang in range(0, 360, 36):
        a = math.radians(ang)
        pts = [(tx + math.cos(a) * r, ty + math.sin(a) * r * 0.5 + (r / 280) ** 2 * 120) for r in range(0, 300, 20)]
        d.line(pts, fill=(24, 70, 40), width=18, joint="curve")
    return vignette(img, 0.25)


def alps():
    img = vgrad([(0, "#2b3a67"), (0.45, "#e59aa8"), (0.7, "#ffd4b8"), (1, "#ffe9d6")])
    img = glow(img, 1500, 620, 280, "#ffc9a8", 160, 0.6)
    for i, (col, base, amp, f) in enumerate(
        [("#b6a3c6", 600, 230, 1.6), ("#8c86b5", 700, 200, 1.9), ("#5d6497", 820, 170, 2.3), ("#343d6b", 960, 140, 2.8)]
    ):
        mountains(img, 50 + i, base, amp, col, f)
    return vignette(img, 0.35)


def lofi():
    img = vgrad([(0, "#1d1b3a"), (0.6, "#5b4a8b"), (1, "#f2a6b8")])
    stars(img, 250, 2, 0.5)
    img = glow(img, 1380, 300, 110, "#fff3d9", 26)
    img = glow(img, 1380, 300, 300, "#c7a6ff", 160, 0.4)
    d = ImageDraw.Draw(img)
    # window frame
    d.rectangle([0, 0, W, 110], fill=(24, 20, 40))
    d.rectangle([0, 900, W, H], fill=(36, 28, 52))
    d.rectangle([940, 110, 980, 900], fill=(24, 20, 40))
    # desk, lamp, plant, headphones silhouettes
    d.rectangle([200, 860, 900, 900], fill=(60, 44, 70))
    d.polygon([(300, 860), (340, 700), (380, 700), (420, 860)], fill=(40, 30, 55))
    d.ellipse([290, 640, 430, 720], fill=(255, 200, 140))
    img = glow(img, 360, 700, 160, "#ffb070", 90, 0.6)
    d = ImageDraw.Draw(img)
    for k in range(7):
        a = -1.2 + k * 0.4
        d.line([(700, 860), (700 + math.cos(a) * 140, 860 - abs(math.sin(a)) * 170 - 40)], fill=(40, 90, 70), width=16)
    d.rectangle([660, 840, 740, 900], fill=(170, 100, 90))
    return vignette(img, 0.3)


def color_grading():
    img = vgrad([(0, "#0f1117"), (1, "#1a1e29")])
    layer = Image.new("RGB", img.size)
    d = ImageDraw.Draw(layer)
    for (x, y, c) in [(820, 470, (255, 60, 90)), (1100, 470, (60, 220, 140)), (960, 700, (70, 120, 255))]:
        d.ellipse([x - 230, y - 230, x + 230, y + 230], fill=c)
    img = ImageChops.add(img, layer.filter(ImageFilter.GaussianBlur(4)))
    img = screen(img, layer.filter(ImageFilter.GaussianBlur(80)).point(lambda p: p * 0.5))
    d = ImageDraw.Draw(img)
    for i, c in enumerate([(255, 90, 110), (80, 220, 150), (90, 140, 255)]):
        y = 900 + i * 40
        d.rounded_rectangle([560, y, 1360, y + 10], 5, fill=(50, 55, 70))
        d.rounded_rectangle([560, y, 760 + i * 220, y + 10], 5, fill=c)
        d.ellipse([750 + i * 220, y - 8, 776 + i * 220, y + 18], fill=(255, 255, 255))
    return img


def cinematic():
    img = alps().transpose(Image.FLIP_LEFT_RIGHT)
    img = Image.blend(img, vgrad([(0, "#1b2a44"), (1, "#f0a060")]), 0.25)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 140], fill=(0, 0, 0))
    d.rectangle([0, H - 140, W, H], fill=(0, 0, 0))
    return img


def neon_rings():
    img = Image.new("RGB", (W, H), (6, 4, 16))
    layer = Image.new("RGB", img.size)
    d = ImageDraw.Draw(layer)
    for i, c in enumerate(["#ff2e97", "#8a5cff", "#20e3ff", "#ffcf3f"]):
        r = 150 + i * 90
        d.ellipse([960 - r, 540 - r, 960 + r, 540 + r], outline=hexc(c), width=10)
    img = screen(img, layer)
    img = screen(img, layer.filter(ImageFilter.GaussianBlur(18)))
    img = screen(img, layer.filter(ImageFilter.GaussianBlur(60)))
    return vignette(img, 0.3)


def party():
    img = vgrad([(0, "#ff9ec7"), (0.6, "#ffcf8a"), (1, "#ffe9b0")])
    d = ImageDraw.Draw(img)
    rnd = random.Random(15)
    for _ in range(420):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        c = rnd.choice([(255, 80, 120), (80, 170, 255), (255, 220, 80), (120, 220, 140), (180, 120, 255)])
        s = rnd.uniform(6, 16)
        a = rnd.uniform(0, 6.28)
        d.polygon([(x + math.cos(a) * s, y + math.sin(a) * s), (x + math.cos(a + 2) * s * 0.5, y + math.sin(a + 2) * s * 0.5),
                   (x - math.cos(a) * s, y - math.sin(a) * s), (x + math.cos(a + 4) * s * 0.5, y + math.sin(a + 4) * s * 0.5)], fill=c)
    for i, (x, c) in enumerate([(560, "#ff5a8a"), (820, "#5aa9ff"), (1180, "#ffd45a"), (1420, "#9b7bff")]):
        y = 380 + (i % 2) * 90
        d.line([(x, y + 140), (x + 20, y + 420)], fill=(120, 110, 120), width=3)
        d.ellipse([x - 90, y - 120, x + 90, y + 140], fill=hexc(c))
        d.ellipse([x - 50, y - 80, x - 10, y - 20], fill=(255, 255, 255))
    return vignette(img, 0.2)


def picnic():
    img = vgrad([(0, "#8fd3ff"), (0.55, "#d8f1ff"), (0.56, "#7cc36a"), (1, "#3f8c3a")])
    img = glow(img, 1500, 150, 80, "#fffbe6", 40)
    mountains(img, 60, 640, 60, "#5fae57", 0.6)
    d = ImageDraw.Draw(img)
    d.rectangle([380, 300, 420, 760], fill=(92, 64, 44))
    for dx, dy, r in [(400, 260, 190), (300, 330, 140), (510, 330, 150), (400, 380, 170)]:
        d.ellipse([dx - r, dy - r, dx + r, dy + r], fill=(46, 120, 60))
    blanket = [(820, 860), (1380, 830), (1460, 1000), (760, 1040)]
    d.polygon(blanket, fill=(230, 70, 80))
    for i in range(1, 7):
        t = i / 7
        a = (820 + (1380 - 820) * t, 860 + (830 - 860) * t)
        b = (760 + (1460 - 760) * t, 1040 + (1000 - 1040) * t)
        d.line([a, b], fill=(255, 235, 235), width=6)
    d.ellipse([1040, 880, 1160, 930], fill=(250, 210, 120))
    return vignette(img, 0.2)


SCENES = {
    "aurora": aurora, "sunset_sea": sunset_sea, "neon_city": neon_city, "synthwave": synthwave,
    "ocean": ocean, "desert": desert, "forest": forest, "nebula": nebula, "galaxy": galaxy,
    "beach": beach, "alps": alps, "lofi": lofi, "color_grading": color_grading, "cinematic": cinematic,
    "neon_rings": neon_rings, "party": party, "picnic": picnic,
}

if __name__ == "__main__":
    only = sys.argv[2:]
    for name, fn in SCENES.items():
        if only and name not in only:
            continue
        fn().save(OUT / f"{name}.png")
        print("painted", name)
    if not only or "vertical_city" in only:
        neon_city(1080, 1920, 21).save(OUT / "vertical_city.png")
        print("painted vertical_city")
