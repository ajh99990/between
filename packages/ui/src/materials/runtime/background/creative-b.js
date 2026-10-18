// Local Canvas2D artwork. Time is in seconds; every animated term closes at 64 s.
const BASE = '#15181d';
const TAU = Math.PI * 2;
const PERIOD = 64;
const PIXEL_W = 400;
const PIXEL_H = 250;
const buffers = new WeakMap();
const LUT_N = 16384;
const LUT_MASK = LUT_N - 1;
const LUT_SCALE = LUT_N / TAU;
const sineTable = new Float32Array(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) sineTable[i] = Math.sin(i / LUT_N * TAU);
function sine(angle) {
  const sample = angle * LUT_SCALE;
  const integer = Math.floor(sample);
  const index = integer & LUT_MASK;
  return sineTable[index] + (sineTable[index + 1] - sineTable[index]) * (sample - integer);
}
const clamp = value => Math.max(0, Math.min(1, value));
function phaseFor(time) {
  const seconds = Number.isFinite(time) ? time : 0;
  return ((seconds % PERIOD + PERIOD) % PERIOD) / PERIOD * TAU;
}
function size(canvas, width, height) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas.getContext('2d');
}

function caustic(canvas, phase) {
  const ctx = size(canvas, PIXEL_W, PIXEL_H);
  let cache = buffers.get(canvas);
  if (!cache || cache.image.width !== PIXEL_W || cache.image.height !== PIXEL_H) {
    cache = { image: ctx.createImageData(PIXEL_W, PIXEL_H), columns: new Float32Array(PIXEL_W) };
    buffers.set(canvas, cache);
  }
  const data = cache.image.data;
  const sp = Math.sin(phase), cp = Math.cos(phase);
  const s2 = Math.sin(phase * 2), c2 = Math.cos(phase * 2);
  const driftX = .112 * sp, driftY = .075 * cp;
  for (let x = 0; x < PIXEL_W; x++) {
    const qx = x / (PIXEL_W - 1) - driftX;
    cache.columns[x] = .095 * sine(3.9 * qx + .55 * sp);
  }
  for (let y = 0; y < PIXEL_H; y++) {
    const v = y / (PIXEL_H - 1), qy = v - driftY;
    const rowWarp = .105 * sine(3.6 * qy + .65 * cp);
    for (let x = 0; x < PIXEL_W; x++) {
      const u = x / (PIXEL_W - 1), qx = u - driftX;
      const X = qx + rowWarp + .047 * sine(5.1 * qx + 2.4 * qy + .55 * s2);
      const Y = qy + cache.columns[x] + .032 * sine(4.4 * qy - 2.2 * qx + .4 * c2 + Math.PI / 2);
      // A refractive surface's local ray Jacobian folds into soft focus curves.
      // Its determinant, rather than a straight-line grid, defines the light web.
      const a = sine(17.4 * X + 2.2 * Y + .22 * sp);
      const b = sine(-5.2 * X + 15.8 * Y + .31 * cp);
      const c = sine(11.1 * X + 13.3 * Y + .26 * s2);
      const jxx = 1 + 1.16 * (.92 * a + .12 * b + .39 * c);
      const jyy = 1 + 1.16 * (.08 * a + .88 * b + .58 * c);
      const jxy = 1.16 * (.22 * a - .32 * b + .47 * c);
      const determinant = jxx * jyy - jxy * jxy;
      const width = .115 + .045 * (.5 + .5 * sine(4.1 * X - 2.7 * Y + .2 * cp));
      const ratio = determinant / width;
      const shoulder = 1 / (1 + ratio * ratio);
      const trace = (jxx + jyy) / .62;
      const focus = 1 / (1 + trace * trace);
      const pool = .70 + .20 * sine(3.0 * X + 2.0 * Y + .3 * cp);
      const light = shoulder * shoulder * (.58 + .42 * focus) * pool + shoulder * .12;
      const sandX = (qx - .79) / .40, sandY = (qy - .63) / .48;
      const sandFalloff = 1 / (1 + sandX * sandX + sandY * sandY);
      const sand = sandFalloff * sandFalloff * sandFalloff;
      const volume = .45 + .23 * sine(3.7 * X - 2.5 * Y + .2 * cp);
      const vignette = 1 - .30 * (u - .48) ** 2 - .24 * (v - .55) ** 2;
      const dither = (((x * 13 + y * 7) % 17) / 17 - .5) * .5;
      const offset = (y * PIXEL_W + x) * 4;
      data[offset] = 21 + (3 + volume * 4 + sand * 17 + light * (9 + sand * 22)) * vignette + dither;
      data[offset + 1] = 24 + (6 + volume * 13 + sand * 7 + light * (36 + sand * 2)) * vignette + dither;
      data[offset + 2] = 29 + (12 + volume * 19 - sand * 3 + light * (45 - sand * 23)) * vignette + dither;
      data[offset + 3] = 255;
    }
  }
  ctx.putImageData(cache.image, 0, 0);
  return canvas;
}

// Each paper plane has its own silhouette and control points, including its
// lower edge. These are not copies of one wave with a different color.
const PLANES = [
  {
    start: [-.18, .38],
    curves: [
      [.01,.16, .22,.21, .38,.38], [.52,.53, .72,.39, .91,.56],
      [1.03,.64, 1.12,.78, 1.20,.82], [1.17,1.14, .88,1.19, .63,1.10],
      [.37,1.02, .16,.97, -.18,1.12],
    ],
    gradient: [-.05,.24, .84,1.12],
    stops: [[0,'rgba(83,103,111,.42)'],[.46,'rgba(48,66,77,.68)'],[1,'rgba(28,35,43,.88)']],
    edge: 'rgba(167,182,182,.17)', motion: [.108,.058,.016],
  },
  {
    start: [-.18,.52],
    curves: [
      [.04,.28, .22,.35, .34,.48], [.46,.62, .56,.63, .68,.62],
      [.86,.58, 1.02,.72, 1.17,.93], [1.02,1.15, .72,1.11, .49,.97],
      [.27,.85, .28,.72, .08,.75], [-.08,.75, -.22,.84, -.18,.52],
    ],
    gradient: [.06,.34, .64,1.02],
    stops: [[0,'rgba(151,112,64,.51)'],[.36,'rgba(114,87,58,.59)'],[.76,'rgba(72,64,56,.62)'],[1,'rgba(48,46,44,.66)']],
    edge: 'rgba(212,177,118,.21)', motion: [.111,.054,.021],
  },
  {
    start: [-.17,.67],
    curves: [
      [.01,.52, .14,.43, .30,.55], [.44,.63, .38,.76, .60,.78],
      [.76,.81, .85,.67, 1.15,.88], [1.23,1.06, 1.20,1.16, 1.18,1.23],
      [.87,1.10, .76,1.07, .56,1.05], [.31,1.06, .36,.88, .16,.84],
      [.04,.82, -.08,.91, -.17,.94],
    ],
    gradient: [.06,.49, .82,1.10],
    stops: [[0,'rgba(113,145,156,.46)'],[.37,'rgba(76,108,122,.63)'],[.73,'rgba(58,76,88,.67)'],[1,'rgba(32,43,55,.83)']],
    edge: 'rgba(178,209,214,.23)', motion: [.103,.061,.019],
  },
  {
    start: [-.14,.76],
    curves: [
      [.04,.60, .08,.57, .20,.63], [.34,.69, .31,.82, .45,.87],
      [.58,.92, .72,.86, .84,.92], [.96,.99, 1.01,1.10, 1.18,1.12],
      [1.19,1.24, .89,1.27, .56,1.23], [.27,1.19, .07,1.16, -.15,1.25],
    ],
    gradient: [.10,.60, .52,1.20],
    stops: [[0,'rgba(153,123,77,.42)'],[.40,'rgba(111,92,66,.50)'],[1,'rgba(38,38,39,.76)']],
    edge: 'rgba(203,177,129,.20)', motion: [.116,.051,.024],
  },
  {
    start: [-.14,1.02],
    curves: [
      [.06,.85, .26,.82, .41,.96], [.56,1.10, .74,.92, .91,1.02],
      [1.06,1.11, 1.12,1.13, 1.20,1.13], [1.23,1.35, .47,1.43, -.18,1.35],
    ],
    gradient: [.15,.84, .72,1.30],
    stops: [[0,'rgba(86,98,105,.57)'],[.39,'rgba(48,58,68,.78)'],[1,'rgba(21,24,29,.97)']],
    edge: 'rgba(156,173,181,.15)', motion: [.101,.063,.016],
  },
];

function terrace(canvas, phase) {
  const w = 640, h = 400;
  const ctx = size(canvas, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, w, h);
  const sp = Math.sin(phase), cp = Math.cos(phase);
  // Broad grazing illumination moves with the same 64-second current.
  const wash = ctx.createRadialGradient((.18 + .07 * sp) * w, (.58 + .04 * cp) * h, 0,
    (.18 + .07 * sp) * w, (.58 + .04 * cp) * h, .77 * w);
  wash.addColorStop(0, 'rgba(85,80,61,.12)');
  wash.addColorStop(.55, 'rgba(38,57,68,.08)');
  wash.addColorStop(1, 'rgba(21,24,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  for (let layerIndex = 0; layerIndex < PLANES.length; layerIndex++) {
    const plane = PLANES[layerIndex];
    const [ax, ay, breathe] = plane.motion;
    const offset = layerIndex * .31;
    const dx = ax * Math.sin(phase + offset);
    const dy = ay * Math.cos(phase + offset * .71);
    // A long, shallow bend and independent control-point breathing make the
    // layers flex like paper/cloth, without moving a duplicate wave ridge.
    function point(x, y) {
      const bendX = breathe * Math.sin(phase * 2 + x * 4.1 + layerIndex * .8);
      const bendY = breathe * Math.cos(phase + x * 5.2 - y * 2.4 + layerIndex * .9);
      return [(x + dx + bendX * (.45 + y * .35)) * w,
        (y + dy + bendY) * h];
    }
    function path() {
      ctx.beginPath();
      ctx.moveTo(...point(...plane.start));
      for (const curve of plane.curves) {
        ctx.bezierCurveTo(...point(curve[0], curve[1]), ...point(curve[2], curve[3]), ...point(curve[4], curve[5]));
      }
      ctx.closePath();
    }
    const g = plane.gradient;
    const gradient = ctx.createLinearGradient(...point(g[0], g[1]), ...point(g[2], g[3]));
    for (const [position, color] of plane.stops) gradient.addColorStop(position, color);
    path();
    ctx.save();
    ctx.shadowColor = 'rgba(4,9,15,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = .85;
    // Layer colors merge softly; no drawn paper edge.
    // A single oblique veil follows one portion of each independent surface.
    // The differing paths keep the planes asymmetric at large scale.
    if (layerIndex === 1 || layerIndex === 2) {
      ctx.save();
      path();
      ctx.clip();
      const sheen = ctx.createLinearGradient(...point(.14,.48), ...point(.49,.95));
      sheen.addColorStop(0, 'rgba(201,202,181,0)');
      sheen.addColorStop(.48, layerIndex === 1 ? 'rgba(208,180,124,.055)' : 'rgba(167,203,216,.06)');
      sheen.addColorStop(1, 'rgba(167,203,216,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
  return canvas;
}

export function paintCreativeB(canvas, preset, time = 0) {
  const id = typeof preset === 'string' ? preset : preset?.id;
  const phase = phaseFor(time);
  return id === 'terrace' ? terrace(canvas, phase) : caustic(canvas, phase);
}
