/**
 * Space Client — Premium animated cape asset generator
 *
 * Specs (store-quality):
 * - Cape face: 20×30 px (Minecraft UV back panel)
 * - Full texture: 64×32 PNG (frame 0)
 * - Sprite sheet: 20×(30×FRAMES) cropped faces for launcher preview
 * - 24 frames / loop (~2.4s at steps(24)) for smooth slow motion
 * - Strict 3–4 color palettes per cape
 *
 * Run: npm run generate:capes
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "src", "assets", "capes");
const FRAMES = 24;
const CAPE_W = 64;
const CAPE_H = 32;
const FACE_W = 20;
const FACE_H = 30;
const PREVIEW_W = 320;
const PREVIEW_H = 220;

const CAPES = [
  {
    id: "event-horizon",
    name: "Event Horizon",
    price: 850,
    rarity: "legendary",
    desc: "A matte-black singularity with silver–violet light lazily lensing around its edge.",
    tags: ["Animated", "Legendary", "Exclusive"],
    palette: { bg: [8, 8, 12], a: [28, 16, 48], b: [160, 168, 190], c: [210, 210, 220] },
    draw: drawEventHorizon,
  },
  {
    id: "hyperspace",
    name: "Hyperspace",
    price: 550,
    rarity: "epic",
    desc: "Vertical star streaks whip past as if you are forever jumping to warp.",
    tags: ["Animated", "Motion"],
    palette: { bg: [6, 8, 14], a: [40, 48, 70], b: [200, 210, 230], c: [255, 255, 255] },
    draw: drawHyperspace,
  },
  {
    id: "starfall",
    name: "Starfall",
    price: 400,
    rarity: "rare",
    desc: "Quiet charcoal stars, then a sharp white comet cuts across and dissolves.",
    tags: ["Animated", "Rare"],
    palette: { bg: [14, 14, 18], a: [48, 48, 56], b: [180, 190, 210], c: [255, 255, 255] },
    draw: drawStarfall,
  },
  {
    id: "solar-eclipse",
    name: "Solar Eclipse",
    price: 600,
    rarity: "epic",
    desc: "A black lunar disc crowned by a flickering white corona and soft flare wisps.",
    tags: ["Animated", "Solar"],
    palette: { bg: [10, 10, 14], a: [0, 0, 0], b: [220, 220, 230], c: [255, 255, 255] },
    draw: drawSolarEclipse,
  },
  {
    id: "liquid-nebula",
    name: "Liquid Nebula",
    price: 550,
    rarity: "epic",
    desc: "Obsidian canvas with indigo dust clouds drifting like silk lava.",
    tags: ["Animated", "Nebula"],
    palette: { bg: [6, 6, 10], a: [32, 32, 40], b: [36, 28, 72], c: [72, 56, 120] },
    draw: drawLiquidNebula,
  },
  {
    id: "chronos",
    name: "Chronos",
    price: 800,
    rarity: "legendary",
    desc: "Concentric orbital rings and pixel planets circling a tiny white sun.",
    tags: ["Animated", "Legendary"],
    palette: { bg: [8, 10, 16], a: [36, 42, 58], b: [160, 170, 190], c: [255, 255, 255] },
    draw: drawChronos,
  },
  {
    id: "lunar-cycle",
    name: "Lunar Cycle",
    price: 380,
    rarity: "rare",
    desc: "A single moon waxes and wanes through a clean phase loop.",
    tags: ["Animated", "Moon"],
    palette: { bg: [8, 8, 12], a: [28, 28, 34], b: [160, 165, 175], c: [235, 238, 245] },
    draw: drawLunarCycle,
  },
  {
    id: "cosmic-pulse",
    name: "Cosmic Pulse",
    price: 300,
    rarity: "uncommon",
    desc: "A quiet digital grid; ice-white nodes cascade from shoulders to hem.",
    tags: ["Animated", "Grid"],
    palette: { bg: [12, 14, 18], a: [36, 42, 52], b: [120, 180, 210], c: [230, 245, 255] },
    draw: drawCosmicPulse,
  },
  {
    id: "aurora-borealis",
    name: "Aurora Borealis",
    price: 580,
    rarity: "epic",
    desc: "Ethereal cyan curtains ripple like silk across a deep night sky.",
    tags: ["Animated", "Aurora"],
    palette: { bg: [6, 10, 14], a: [16, 32, 36], b: [40, 120, 100], c: [120, 230, 200] },
    draw: drawAurora,
  },
  {
    id: "orion-shimmer",
    name: "Orion's Shimmer",
    price: 420,
    rarity: "rare",
    desc: "A mapped constellation shimmering independently along faint silver links.",
    tags: ["Animated", "Constellation"],
    palette: { bg: [8, 10, 16], a: [40, 48, 64], b: [140, 150, 170], c: [245, 248, 255] },
    draw: drawOrion,
  },
  {
    id: "glitch-void",
    name: "Glitch Void",
    price: 620,
    rarity: "epic",
    desc: "Sleek black cloth that randomly slices, shifts, and flashes neon static.",
    tags: ["Animated", "Glitch"],
    palette: { bg: [4, 4, 6], a: [20, 20, 28], b: [60, 40, 160], c: [80, 200, 255] },
    draw: drawGlitchVoid,
  },
  {
    id: "cosmic-dust",
    name: "Cosmic Dust",
    price: 280,
    rarity: "uncommon",
    desc: "The hem dissolves into rising silver sparks that fade into the void.",
    tags: ["Animated", "Particles"],
    palette: { bg: [18, 18, 22], a: [40, 40, 48], b: [140, 145, 155], c: [230, 235, 245] },
    draw: drawCosmicDust,
  },
  {
    id: "supernova-burst",
    name: "Supernova Burst",
    price: 750,
    rarity: "legendary",
    desc: "A quiet field, then a white flash blooms into a fading stardust ring.",
    tags: ["Animated", "Legendary"],
    palette: { bg: [8, 10, 16], a: [40, 30, 60], b: [180, 140, 200], c: [255, 255, 255] },
    draw: drawSupernova,
  },
  {
    id: "satellite-signal",
    name: "Satellite Signal",
    price: 360,
    rarity: "rare",
    desc: "A retro vector satellite sends crisp concentric waves into the dark.",
    tags: ["Animated", "Retro"],
    palette: { bg: [8, 10, 14], a: [36, 44, 58], b: [120, 160, 200], c: [230, 240, 255] },
    draw: drawSatellite,
  },
  {
    id: "dark-matter-waves",
    name: "Dark Matter Waves",
    price: 500,
    rarity: "epic",
    desc: "Satin dark-grey cloth disturbed by a continuous hypnotic ripple.",
    tags: ["Animated", "Subtle"],
    palette: { bg: [22, 22, 28], a: [36, 36, 44], b: [56, 56, 68], c: [90, 90, 108] },
    draw: drawDarkMatter,
  },
  {
    id: "plus-sigil",
    name: "Plus Sigil",
    price: null,
    exclusive: "spaceplus",
    rarity: "legendary",
    desc: "Space+ exclusive — a silver plus mark that slowly blooms and retracts in the dark.",
    tags: ["Animated", "Space+", "Exclusive"],
    palette: { bg: [8, 8, 12], a: [40, 42, 52], b: [170, 176, 190], c: [240, 242, 248] },
    draw: drawPlusSigil,
  },
  {
    id: "member-orbit",
    name: "Member Orbit",
    price: null,
    exclusive: "spaceplus",
    rarity: "epic",
    desc: "Space+ exclusive — dual orbital rings with a soft silver pulse reserved for members.",
    tags: ["Animated", "Space+", "Exclusive"],
    palette: { bg: [6, 8, 14], a: [36, 44, 60], b: [140, 160, 190], c: [230, 236, 245] },
    draw: drawMemberOrbit,
  },
  {
    id: "priority-flare",
    name: "Priority Flare",
    price: null,
    exclusive: "spaceplus",
    rarity: "legendary",
    desc: "Space+ exclusive — a quiet field then a crisp priority flare that echoes down the cape.",
    tags: ["Animated", "Space+", "Exclusive"],
    palette: { bg: [8, 10, 16], a: [48, 48, 64], b: [180, 190, 210], c: [255, 255, 255] },
    draw: drawPriorityFlare,
  },
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgba(r, g, b, a = 255) {
  return [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255), clamp(Math.round(a), 0, 255)];
}

function setPixel(buf, w, x, y, color) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  if (i < 0 || i + 3 >= buf.length) return;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
  buf[i + 3] = color[3];
}

function getPixel(buf, w, x, y) {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

function fillRect(buf, w, h, x, y, rw, rh, color) {
  for (let py = y; py < y + rh; py++) {
    for (let px = x; px < x + rw; px++) {
      if (px >= 0 && py >= 0 && px < w && py < h) setPixel(buf, w, px, py, color);
    }
  }
}

function mixColor(c1, c2, t) {
  return rgba(lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), lerp(c1[3] ?? 255, c2[3] ?? 255, t));
}

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash(ix * 12.9898 + iy * 78.233);
  const b = hash((ix + 1) * 12.9898 + iy * 78.233);
  const c = hash(ix * 12.9898 + (iy + 1) * 78.233);
  const d = hash((ix + 1) * 12.9898 + (iy + 1) * 78.233);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

function drawFace(buf, w, h, colorFn) {
  for (let py = 0; py < FACE_H; py++) {
    for (let px = 0; px < FACE_W; px++) {
      const color = colorFn(px, py, FACE_W, FACE_H);
      if (color && color[3] > 0) setPixel(buf, w, 22 + px, 1 + py, color);
    }
  }
}

function clearFace(buf, w, h, bg) {
  fillRect(buf, w, h, 22, 1, FACE_W, FACE_H, rgba(...bg, 255));
}

/* ─── Cape drawers (palette-restricted) ─── */

function drawEventHorizon(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py, bw, bh) => {
    const cx = bw / 2 - 0.5;
    const cy = bh * 0.42;
    const dx = px - cx;
    const dy = (py - cy) * 1.15;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) + t * 0.35;
    if (dist < 2.2) return rgba(...p.bg, 255);
    const swirl = Math.sin(ang * 3 + dist * 0.9 - t) * 0.5 + 0.5;
    const ring = Math.exp(-Math.pow((dist - 6.5) / 1.8, 2));
    if (dist < 11) {
      if (swirl > 0.72 && dist > 3.5) return rgba(...p.b, 255);
      if (ring > 0.45) return rgba(...p.c, Math.round(180 + ring * 75));
      if (swirl > 0.5) return rgba(...p.a, 255);
    }
    return rgba(...p.bg, 255);
  });
}

function drawHyperspace(buf, w, h, frame, p) {
  const t = frame / FRAMES;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py) => rgba(...p.bg, 255));
  for (let i = 0; i < 14; i++) {
    const lane = Math.floor(hash(i * 17.3) * (FACE_W - 2)) + 1;
    const speed = 0.35 + hash(i * 3.1) * 0.9;
    const len = 3 + Math.floor(hash(i * 9.2) * 6);
    const y = ((t * FACE_H * speed + hash(i) * FACE_H) % (FACE_H + len)) - len;
    for (let d = 0; d < len; d++) {
      const yy = Math.floor(y + d);
      if (yy < 0 || yy >= FACE_H) continue;
      const fade = 1 - d / len;
      const col = fade > 0.55 ? p.c : fade > 0.25 ? p.b : p.a;
      setPixel(buf, w, 22 + lane, 1 + yy, rgba(...col, Math.round(255 * fade)));
    }
  }
}

function drawStarfall(buf, w, h, frame, p) {
  clearFace(buf, w, h, p.bg);
  const stars = [
    [3, 4], [8, 7], [15, 5], [5, 14], [12, 18], [17, 12], [2, 22], [10, 25], [16, 27],
  ];
  stars.forEach(([sx, sy], i) => {
    const on = hash(i * 4.2) > 0.35;
    if (on) setPixel(buf, w, 22 + sx, 1 + sy, rgba(...p.a, 200));
  });

  // Comet appears roughly every loop with long idle
  const cycle = frame / FRAMES;
  const active = cycle > 0.55 && cycle < 0.92;
  if (active) {
    const u = (cycle - 0.55) / 0.37;
    const hx = Math.round(lerp(-2, FACE_W + 2, u));
    const hy = Math.round(lerp(2, FACE_H - 4, u));
    for (let d = 0; d < 12; d++) {
      const tx = hx - d;
      const ty = hy - Math.floor(d * 0.55);
      if (tx < 0 || ty < 0 || tx >= FACE_W || ty >= FACE_H) continue;
      const fade = 1 - d / 12;
      const col = d < 2 ? p.c : d < 6 ? p.b : p.a;
      setPixel(buf, w, 22 + tx, 1 + ty, rgba(...col, Math.round(255 * fade * fade)));
      if (d < 3) setPixel(buf, w, 22 + tx, 1 + ty + 1, rgba(...p.b, Math.round(120 * fade)));
    }
  }
}

function drawSolarEclipse(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  const cx = FACE_W / 2 - 0.5;
  const cy = FACE_H * 0.38;
  drawFace(buf, w, h, (px, py) => {
    const dist = Math.hypot(px - cx, py - cy);
    const flare = 0.55 + 0.45 * Math.sin(t * 2 + Math.atan2(py - cy, px - cx) * 4);
    if (dist < 5.2) return rgba(...p.a, 255);
    if (dist < 6.2 + flare * 0.8) {
      const edge = 1 - (dist - 5.2) / (1.8);
      return rgba(...p.c, Math.round(140 + edge * 115 * flare));
    }
    if (dist < 8.5 && Math.sin(Math.atan2(py - cy, px - cx) * 5 + t * 3) > 0.65) {
      return rgba(...p.b, 160);
    }
    return rgba(...p.bg, 255);
  });
}

function drawLiquidNebula(buf, w, h, frame, p) {
  const t = frame / FRAMES;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py) => {
    const n1 = smoothNoise(px * 0.18 + t * 1.2, py * 0.12);
    const n2 = smoothNoise(px * 0.1 - t * 0.8, py * 0.2 + 3);
    const v = n1 * 0.65 + n2 * 0.35;
    if (v > 0.72) return rgba(...p.c, 255);
    if (v > 0.55) return rgba(...p.b, 255);
    if (v > 0.4) return rgba(...p.a, 255);
    return rgba(...p.bg, 255);
  });
}

function drawChronos(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  const cx = Math.floor(FACE_W / 2);
  const cy = Math.floor(FACE_H * 0.42);
  setPixel(buf, w, 22 + cx, 1 + cy, rgba(...p.c, 255));
  setPixel(buf, w, 22 + cx + 1, 1 + cy, rgba(...p.b, 200));

  const radii = [4, 7, 10];
  radii.forEach((r, ri) => {
    const dir = ri % 2 === 0 ? 1 : -1;
    for (let a = 0; a < Math.PI * 2; a += 0.18) {
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.85);
      if (x < 0 || y < 0 || x >= FACE_W || y >= FACE_H) continue;
      if (Math.floor(a * 8) % 3 === 0) setPixel(buf, w, 22 + x, 1 + y, rgba(...p.a, 220));
    }
    const ang = t * dir * (0.4 + ri * 0.15) + ri;
    const px = Math.round(cx + Math.cos(ang) * r);
    const py = Math.round(cy + Math.sin(ang) * r * 0.85);
    if (px >= 0 && py >= 0 && px < FACE_W && py < FACE_H) {
      setPixel(buf, w, 22 + px, 1 + py, rgba(...p.c, 255));
    }
  });
}

function drawLunarCycle(buf, w, h, frame, p) {
  clearFace(buf, w, h, p.bg);
  const phase = frame / FRAMES; // 0..1
  const cx = FACE_W / 2 - 0.5;
  const cy = FACE_H * 0.42;
  const radius = 6.2;
  drawFace(buf, w, h, (px, py) => {
    const dx = px - cx;
    const dy = py - cy;
    if (Math.hypot(dx, dy) > radius) return rgba(...p.bg, 255);

    // Shadow disc offset for phases
    const offset = lerp(-radius * 1.4, radius * 1.4, phase);
    const shadow = Math.hypot(dx - offset, dy) < radius * 1.02;
    // Around new moon more dark
    if (phase < 0.08 || phase > 0.92) return rgba(...p.a, 255);
    if (shadow) return rgba(...p.a, 255);
    return rgba(...p.c, 255);
  });
}

function drawCosmicPulse(buf, w, h, frame, p) {
  const t = frame / FRAMES;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py) => {
    const grid = px % 4 === 0 || py % 4 === 0;
    if (grid) return rgba(...p.a, 180);
    return rgba(...p.bg, 255);
  });
  for (let row = 0; row < 7; row++) {
    const wave = (t + row * 0.08) % 1;
    const y = Math.floor(row * 4 + 2);
    const bright = Math.sin(wave * Math.PI);
    if (bright < 0.2) continue;
    for (let col = 0; col < 5; col++) {
      const x = 2 + col * 4;
      const col2 = bright > 0.7 ? p.c : p.b;
      setPixel(buf, w, 22 + x, 1 + y, rgba(...col2, Math.round(255 * bright)));
    }
  }
}

function drawAurora(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py, bw, bh) => {
    const curtain = Math.sin(px * 0.55 + t) * 3 + Math.sin(px * 0.2 - t * 0.7) * 2;
    const bandY = bh * 0.35 + curtain;
    const dist = Math.abs(py - bandY);
    if (py > bh * 0.75) return rgba(...p.a, 120);
    if (dist < 1.2) return rgba(...p.c, 255);
    if (dist < 3.5) return rgba(...p.b, Math.round(200 - dist * 30));
    if (dist < 6 && py < bandY) return rgba(...p.a, 160);
    return rgba(...p.bg, 255);
  });
}

function drawOrion(buf, w, h, frame, p) {
  clearFace(buf, w, h, p.bg);
  const stars = [
    [6, 6], [14, 5], [10, 10], [8, 14], [12, 14], [7, 20], [13, 21], [10, 25],
  ];
  const links = [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7]];
  const pulse = (frame / FRAMES) * Math.PI * 2;

  links.forEach(([a, b], i) => {
    const [x0, y0] = stars[a];
    const [x1, y1] = stars[b];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const linePulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(pulse + i));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(lerp(x0, x1, s / steps));
      const y = Math.round(lerp(y0, y1, s / steps));
      if (linePulse > 0.45) setPixel(buf, w, 22 + x, 1 + y, rgba(...p.a, Math.round(120 * linePulse)));
    }
  });

  stars.forEach(([sx, sy], i) => {
    const shimmer = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(pulse * 1.3 + i * 1.7));
    const col = shimmer > 0.75 ? p.c : shimmer > 0.5 ? p.b : p.a;
    setPixel(buf, w, 22 + sx, 1 + sy, rgba(...col, 255));
    if (shimmer > 0.85) {
      setPixel(buf, w, 22 + sx + 1, 1 + sy, rgba(...p.b, 160));
      setPixel(buf, w, 22 + sx, 1 + sy + 1, rgba(...p.b, 120));
    }
  });
}

function drawGlitchVoid(buf, w, h, frame, p) {
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, () => rgba(...p.bg, 255));

  // Occasional glitch slices
  const glitchFrame = frame % FRAMES;
  const hits = [5, 6, 14, 15, 20];
  if (hits.includes(glitchFrame)) {
    const sliceY = Math.floor(hash(glitchFrame * 11.1) * (FACE_H - 4)) + 1;
    const shift = glitchFrame % 2 === 0 ? 2 : -3;
    const flash = glitchFrame === 6 || glitchFrame === 15;
    for (let x = 0; x < FACE_W; x++) {
      for (let dy = 0; dy < 3; dy++) {
        const xx = clamp(x + shift, 0, FACE_W - 1);
        const col = flash ? (x % 2 === 0 ? p.c : p.b) : p.a;
        setPixel(buf, w, 22 + xx, 1 + sliceY + dy, rgba(...col, 255));
      }
    }
  }
}

function drawCosmicDust(buf, w, h, frame, p) {
  const t = frame / FRAMES;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py, bw, bh) => {
    const fade = py / bh;
    return mixColor(rgba(...p.bg, 255), rgba(...p.a, 255), fade * 0.85);
  });

  for (let i = 0; i < 18; i++) {
    const seed = hash(i * 13.7);
    const x = Math.floor(seed * FACE_W);
    const life = (t + seed) % 1;
    const y = Math.floor(lerp(FACE_H - 1, FACE_H * 0.35, life));
    const fade = 1 - life;
    if (fade < 0.1) continue;
    const col = fade > 0.6 ? p.c : fade > 0.3 ? p.b : p.a;
    setPixel(buf, w, 22 + x, 1 + y, rgba(...col, Math.round(255 * fade)));
  }
}

function drawSupernova(buf, w, h, frame, p) {
  clearFace(buf, w, h, p.bg);
  // faint background stars
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(hash(i * 2.2) * FACE_W);
    const y = Math.floor(hash(i * 5.5) * FACE_H);
    setPixel(buf, w, 22 + x, 1 + y, rgba(...p.a, 160));
  }

  const t = frame / FRAMES;
  const cx = FACE_W / 2 - 0.5;
  const cy = FACE_H * 0.4;
  // Quiet -> flash -> ring expand -> remnant
  let flash = 0;
  let ringR = -1;
  let remnant = 0;
  if (t < 0.15) {
    flash = t / 0.15;
    setPixel(buf, w, 22 + Math.round(cx), 1 + Math.round(cy), rgba(...p.c, 255));
  } else if (t < 0.28) {
    flash = 1;
  } else if (t < 0.7) {
    ringR = ((t - 0.28) / 0.42) * 14;
    remnant = 0.35;
  } else {
    remnant = Math.max(0, 1 - (t - 0.7) / 0.3);
  }

  drawFace(buf, w, h, (px, py) => {
    const dist = Math.hypot(px - cx, py - cy);
    if (flash > 0.5 && dist < 2 + flash * 3) return rgba(...p.c, 255);
    if (flash > 0.8 && dist < 8) return rgba(...p.b, Math.round(180 * (1 - dist / 8)));
    if (ringR > 0) {
      const band = Math.abs(dist - ringR);
      if (band < 1.2) return rgba(...p.c, Math.round(220 * (1 - band)));
      if (band < 2.4) return rgba(...p.b, Math.round(140 * (1 - band / 2.4)));
    }
    if (remnant > 0.2 && dist < 5) {
      const n = smoothNoise(px * 0.4, py * 0.4 + t * 2);
      if (n > 0.55) return rgba(...p.a, Math.round(200 * remnant));
    }
    return null;
  });
}

function drawSatellite(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  // satellite body top-left
  fillRect(buf, w, h, 24, 4, 5, 3, rgba(...p.b, 255));
  fillRect(buf, w, h, 23, 5, 1, 1, rgba(...p.a, 255));
  fillRect(buf, w, h, 29, 5, 1, 1, rgba(...p.a, 255));
  setPixel(buf, w, 26, 3, rgba(...p.c, 255)); // antenna

  const cx = 4.5;
  const cy = 5.5;
  const maxR = 3 + ((frame % 8) / 8) * 16;
  for (let r = 2; r < 18; r++) {
    const wave = Math.abs(r - maxR);
    if (wave > 1.2) continue;
    const alpha = Math.round((1 - wave / 1.2) * 200 * (0.4 + 0.6 * Math.sin(t + r)));
    for (let a = 0; a < Math.PI * 0.9; a += 0.12) {
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x < 0 || y < 0 || x >= FACE_W || y >= FACE_H) continue;
      setPixel(buf, w, 22 + x, 1 + y, rgba(...p.c, alpha));
    }
  }
}

function drawDarkMatter(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  drawFace(buf, w, h, (px, py, bw, bh) => {
    const cx = bw / 2;
    const cy = bh / 2;
    const dist = Math.hypot(px - cx, py - cy);
    const ripple = Math.sin(dist * 0.9 - t * 1.5);
    const grain = smoothNoise(px * 0.5, py * 0.5 + t * 0.2) * 0.15;
    const v = 0.5 + ripple * 0.25 + grain;
    if (v > 0.72) return rgba(...p.c, 255);
    if (v > 0.55) return rgba(...p.b, 255);
    if (v > 0.4) return rgba(...p.a, 255);
    return rgba(...p.bg, 255);
  });
}

function drawPlusSigil(buf, w, h, frame, p) {
  const t = frame / FRAMES;
  const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2);
  clearFace(buf, w, h, p.bg);
  const cx = Math.floor(FACE_W / 2);
  const cy = Math.floor(FACE_H * 0.42);
  const arm = Math.round(2 + pulse * 3);
  const thick = pulse > 0.75 ? 2 : 1;
  for (let d = -arm; d <= arm; d++) {
    fillRect(buf, w, h, 22 + cx - thick + 1, 1 + cy + d, thick, 1, rgba(...(Math.abs(d) < 2 ? p.c : p.b), 255));
    fillRect(buf, w, h, 22 + cx + d, 1 + cy - thick + 1, 1, thick, rgba(...(Math.abs(d) < 2 ? p.c : p.b), 255));
  }
  if (pulse > 0.7) {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + t * Math.PI;
      const x = Math.round(cx + Math.cos(ang) * (arm + 3));
      const y = Math.round(cy + Math.sin(ang) * (arm + 3));
      if (x >= 0 && y >= 0 && x < FACE_W && y < FACE_H) {
        setPixel(buf, w, 22 + x, 1 + y, rgba(...p.a, 200));
      }
    }
  }
}

function drawMemberOrbit(buf, w, h, frame, p) {
  const t = (frame / FRAMES) * Math.PI * 2;
  clearFace(buf, w, h, p.bg);
  const cx = Math.floor(FACE_W / 2);
  const cy = Math.floor(FACE_H * 0.42);
  setPixel(buf, w, 22 + cx, 1 + cy, rgba(...p.c, 255));
  // plus tip
  setPixel(buf, w, 22 + cx, 1 + cy - 1, rgba(...p.b, 220));
  setPixel(buf, w, 22 + cx + 1, 1 + cy, rgba(...p.b, 220));

  [5, 8].forEach((r, ri) => {
    const dir = ri === 0 ? 1 : -1;
    for (let a = 0; a < Math.PI * 2; a += 0.22) {
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.88);
      if (x < 0 || y < 0 || x >= FACE_W || y >= FACE_H) continue;
      if (Math.floor(a * 6) % 2 === 0) setPixel(buf, w, 22 + x, 1 + y, rgba(...p.a, 210));
    }
    const ang = t * dir * 0.55 + ri;
    const px = Math.round(cx + Math.cos(ang) * r);
    const py = Math.round(cy + Math.sin(ang) * r * 0.88);
    if (px >= 0 && py >= 0 && px < FACE_W && py < FACE_H) {
      setPixel(buf, w, 22 + px, 1 + py, rgba(...p.c, 255));
    }
  });
}

function drawPriorityFlare(buf, w, h, frame, p) {
  clearFace(buf, w, h, p.bg);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(hash(i * 4.1) * FACE_W);
    const y = Math.floor(hash(i * 8.8) * FACE_H);
    setPixel(buf, w, 22 + x, 1 + y, rgba(...p.a, 150));
  }
  const t = frame / FRAMES;
  const cx = FACE_W / 2 - 0.5;
  const cy = FACE_H * 0.32;
  let stage = "idle";
  let ring = -1;
  let flash = 0;
  if (t > 0.35 && t < 0.48) {
    stage = "flash";
    flash = (t - 0.35) / 0.13;
  } else if (t >= 0.48 && t < 0.85) {
    stage = "ring";
    ring = ((t - 0.48) / 0.37) * 16;
  }

  drawFace(buf, w, h, (px, py) => {
    const dist = Math.hypot(px - cx, py - cy);
    if (stage === "flash" && dist < 2 + flash * 4) return rgba(...p.c, 255);
    if (stage === "flash" && dist < 7) return rgba(...p.b, Math.round(160 * (1 - dist / 7) * flash));
    if (stage === "ring") {
      const band = Math.abs(dist - ring);
      if (band < 1.1) return rgba(...p.c, Math.round(220 * (1 - band)));
      if (band < 2.2) return rgba(...p.b, Math.round(120 * (1 - band / 2.2)));
    }
    if (t > 0.85 && dist < 3) return rgba(...p.a, Math.round(180 * (1 - (t - 0.85) / 0.15)));
    return null;
  });
}

/* ─── Core render ─── */

function renderCapeFrame(cape, frame) {
  const buf = Buffer.alloc(CAPE_W * CAPE_H * 4, 0);
  cape.draw(buf, CAPE_W, CAPE_H, frame, cape.palette);
  return buf;
}

function buildSpriteSheet(cape) {
  const sheet = Buffer.alloc(FACE_W * FACE_H * FRAMES * 4, 0);
  for (let f = 0; f < FRAMES; f++) {
    const frame = renderCapeFrame(cape, f);
    for (let y = 0; y < FACE_H; y++) {
      for (let x = 0; x < FACE_W; x++) {
        const si = ((1 + y) * CAPE_W + (22 + x)) * 4;
        const di = ((f * FACE_H + y) * FACE_W + x) * 4;
        sheet[di] = frame[si];
        sheet[di + 1] = frame[si + 1];
        sheet[di + 2] = frame[si + 2];
        sheet[di + 3] = frame[si + 3] || 255;
      }
    }
  }
  return { buf: sheet, width: FACE_W, height: FACE_H * FRAMES };
}

function buildPreview(cape) {
  const buf = Buffer.alloc(PREVIEW_W * PREVIEW_H * 4);
  for (let y = 0; y < PREVIEW_H; y++) {
    for (let x = 0; x < PREVIEW_W; x++) {
      const grad = lerp(6, 18, y / PREVIEW_H);
      setPixel(buf, PREVIEW_W, x, y, rgba(grad, grad + 1, grad + 6, 255));
    }
  }
  for (let i = 0; i < 50; i++) {
    const sx = Math.floor(hash(i * 19.1) * PREVIEW_W);
    const sy = Math.floor(hash(i * 7.7) * PREVIEW_H * 0.65);
    const bright = 90 + Math.floor(hash(i * 3.3) * 140);
    setPixel(buf, PREVIEW_W, sx, sy, rgba(bright, bright, bright, 180));
  }

  const cx = PREVIEW_W / 2;
  const headY = 40;
  fillRect(buf, PREVIEW_W, PREVIEW_H, cx - 16, headY, 32, 32, rgba(198, 156, 109, 255));
  fillRect(buf, PREVIEW_W, PREVIEW_H, cx - 20, headY + 30, 40, 48, rgba(74, 85, 104, 255));
  fillRect(buf, PREVIEW_W, PREVIEW_H, cx - 20, headY + 76, 18, 44, rgba(26, 32, 44, 255));
  fillRect(buf, PREVIEW_W, PREVIEW_H, cx + 2, headY + 76, 18, 44, rgba(26, 32, 44, 255));

  const capeFrame = renderCapeFrame(cape, Math.floor(FRAMES * 0.4));
  const scale = 4;
  const capeDrawX = Math.round(cx - (FACE_W * scale) / 2);
  const capeDrawY = headY + 26;
  for (let py = 0; py < FACE_H; py++) {
    for (let px = 0; px < FACE_W; px++) {
      const si = ((1 + py) * CAPE_W + (22 + px)) * 4;
      const r = capeFrame[si];
      const g = capeFrame[si + 1];
      const b = capeFrame[si + 2];
      const a = capeFrame[si + 3];
      if (a === 0) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          setPixel(buf, PREVIEW_W, capeDrawX + px * scale + sx, capeDrawY + py * scale + sy, [r, g, b, a]);
        }
      }
    }
  }
  return buf;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, width, height, rgbaBuf) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgbaBuf.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  fs.writeFileSync(
    filePath,
    Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", Buffer.alloc(0))])
  );
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Remove obsolete cape files
  for (const file of fs.readdirSync(OUT)) {
    if (file === "catalog.json") continue;
    fs.unlinkSync(path.join(OUT, file));
  }

  const catalog = CAPES.map((cape) => {
    const texturePath = path.join(OUT, `${cape.id}-texture.png`);
    const sheetPath = path.join(OUT, `${cape.id}-sheet.png`);
    const previewPath = path.join(OUT, `${cape.id}-preview.png`);

    const frame0 = renderCapeFrame(cape, 0);
    const sheet = buildSpriteSheet(cape);
    const preview = buildPreview(cape);

    writePng(texturePath, CAPE_W, CAPE_H, frame0);
    writePng(sheetPath, sheet.width, sheet.height, sheet.buf);
    writePng(previewPath, PREVIEW_W, PREVIEW_H, preview);

    console.log(`✓ ${cape.name} (${cape.price} credits)`);

    return {
      id: cape.id,
      category: "capes",
      name: cape.name,
      desc: cape.desc,
      rarity: cape.rarity,
      tags: cape.tags,
      price: cape.price,
      exclusive: cape.exclusive || null,
      previewImage: `assets/capes/${cape.id}-preview.png`,
      sheetImage: `assets/capes/${cape.id}-sheet.png`,
      textureImage: `assets/capes/${cape.id}-texture.png`,
      frameCount: FRAMES,
    };
  });

  fs.writeFileSync(path.join(OUT, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(`\nDone — ${catalog.length} premium capes → ${OUT}`);
}

main();
