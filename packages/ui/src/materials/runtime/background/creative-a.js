// Original procedural backgrounds. All geometry is expressed in viewport units.
// Time is real seconds; every animated value has a common 64 second period.
const WIDTH = 640;
const HEIGHT = 400;
const PERIOD = 64;
const TAU = Math.PI * 2;
const BASE = '#15181d';
const JADE = [84, 172, 159];
const IRIS = [138, 116, 188];
const ROSE = [190, 124, 148];

const color = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(.90, alpha * 2.8)})`;
const phaseAt = time => TAU * (((Number.isFinite(time) ? time : 0) % PERIOD + PERIOD) % PERIOD) / PERIOD;

function haze(ctx, x, y, rx, ry, rgb, alpha, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color(rgb, alpha));
  g.addColorStop(0.42, color(rgb, alpha * 0.57));
  g.addColorStop(1, color(rgb, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// A fabric section has an undulating silhouette and folded cross section.
// Each narrow section follows the same cloth map, so the shading bends with it.
function clothX(v, cross, spec, phase) {
  const waviness = 0.070 * Math.sin(v * 4.7 + spec.wave)
    + 0.026 * Math.sin(v * 10.2 + spec.wave * 1.6);
  const flowingPleat = 0.012 * Math.sin(v * 7.7 + phase * 2 + spec.wave + cross * 1.8);
  const width = spec.width * (0.78 + 0.17 * Math.sin(v * 3.9 + spec.wave))
    * (1 + 0.025 * Math.sin(phase + v * 2 + spec.wave));
  const rolledEdge = 0.012 * Math.sin(cross * Math.PI) * Math.sin(v * 5.6 - phase + spec.wave);
  return spec.x + waviness + cross * width + flowingPleat + rolledEdge;
}

function clothBand(ctx, spec, phase, left, right) {
  // Extending the fabric beyond the viewport keeps the translated edges hidden.
  const top = -0.24;
  const bottom = 1.24;
  const steps = 40;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const v = top + (bottom - top) * i / steps;
    const x = clothX(v, left, spec, phase);
    if (i === 0) ctx.moveTo(x, v);
    else ctx.lineTo(x, v);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const v = top + (bottom - top) * i / steps;
    ctx.lineTo(clothX(v, right, spec, phase), v);
  }
  ctx.closePath();
}

function curtain(ctx, phase) {
  // The material, rather than a large light ball, supplies the dominant color.
  const sheets = [
    { x: 0.035, width: 0.265, wave: 0.35, offset: 0.2, rgb: JADE, strength: 0.94 },
    { x: 0.265, width: 0.205, wave: 2.0, offset: 1.9, rgb: IRIS, strength: 0.78 },
    { x: 0.785, width: 0.270, wave: 3.9, offset: 3.7, rgb: JADE, strength: 0.88 },
    { x: 1.008, width: 0.230, wave: 5.4, offset: 5.1, rgb: IRIS, strength: 0.82 },
    // A thinner warm strand is woven between two larger folds.
    { x: 0.712, width: 0.083, wave: 1.5, offset: 2.8, rgb: ROSE, strength: 0.57 },
  ];

  for (const sheet of sheets) {
    ctx.save();
    ctx.translate(
      0.085 * Math.sin(phase + sheet.offset),
      0.070 * Math.cos(phase + sheet.offset),
    );

    // Broad translucent backing gives each folded sheet a continuous body.
    clothBand(ctx, sheet, phase, -0.53, 0.53);
    const backing = ctx.createLinearGradient(0, -0.2, 0, 1.2);
    backing.addColorStop(0, color(sheet.rgb, 0.015 * sheet.strength));
    backing.addColorStop(0.36, color(sheet.rgb, 0.041 * sheet.strength));
    backing.addColorStop(0.77, color(sheet.rgb, 0.060 * sheet.strength));
    backing.addColorStop(1, color(sheet.rgb, 0.025 * sheet.strength));
    ctx.fillStyle = backing;
    ctx.fill();

    // Uneven pleat widths avoid evenly spaced stripes or a wireframe appearance.
    const edges = [-0.53, -0.47, -0.395, -0.31, -0.255, -0.185, -0.095,
      -0.025, 0.045, 0.105, 0.19, 0.265, 0.32, 0.405, 0.465, 0.53];
    for (let j = 0; j < edges.length - 1; j += 1) {
      const middle = (edges[j] + edges[j + 1]) / 2;
      const fold = (0.5 + 0.5 * Math.cos(middle * 24 + sheet.wave)) ** 2;
      const rim = Math.sin((middle + 0.53) / 1.06 * Math.PI) ** 0.65;
      const opacity = (0.012 + 0.105 * fold) * rim * sheet.strength;
      clothBand(ctx, sheet, phase, edges[j], edges[j + 1]);
      const fabric = ctx.createLinearGradient(0, -0.14, 0, 1.16);
      fabric.addColorStop(0, color(sheet.rgb, opacity * 0.38));
      fabric.addColorStop(0.32, color(sheet.rgb, opacity * 0.88));
      fabric.addColorStop(0.68, color(sheet.rgb, opacity));
      fabric.addColorStop(1, color(sheet.rgb, opacity * 0.52));
      ctx.fillStyle = fabric;
      ctx.fill();
    }

    // Soft, broad creases appear only on selected folds, with no neon outline.
    for (const cross of [-0.31, 0.105, 0.405]) {
      clothBand(ctx, sheet, phase, cross - 0.010, cross + 0.010);
      ctx.fillStyle = color(sheet.rgb, 0.030 * sheet.strength);
      ctx.fill();
    }
    ctx.restore();
  }
}

function ellipsePath(ctx, rx, ry, start = 0, end = TAU) {
  if(end-start>=TAU-.001){start=-.82;end=2.08;} // Incomplete arcs suggest depth without drawing literal rings.
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, start, end);
}

function orbitStroke(ctx, rx, ry, rgb, strength, start = 0, end = TAU) {
  // Three translucent widths feather the arc without blur filters or textures.
  const layers = [
    { width: 0.070, opacity: 0.028 },
    { width: 0.032, opacity: 0.060 },
    { width: 0.009, opacity: 0.085 },
  ];
  for (const layer of layers) {
    ellipsePath(ctx, rx, ry, start, end);
    ctx.lineWidth = layer.width;
    ctx.strokeStyle = color(rgb, layer.opacity * strength);
    ctx.stroke();
  }
}

function orbit(ctx, phase) {
  // Each family occupies a different plane and precesses independently.
  const families = [
    { x: 0.235, y: 0.645, rx: 0.46, ry: 0.205, angle: -0.50, offset: 0.4, rgb: JADE, strength: 1.0, count: 3 },
    { x: 0.845, y: 0.385, rx: 0.365, ry: 0.177, angle: 0.79, offset: 2.5, rgb: IRIS, strength: 0.91, count: 3 },
    { x: 0.705, y: 0.935, rx: 0.345, ry: 0.175, angle: -0.93, offset: 4.3, rgb: ROSE, strength: 0.68, count: 2 },
    { x: 0.170, y: 0.255, rx: 0.190, ry: 0.089, angle: 0.36, offset: 5.5, rgb: JADE, strength: 0.50, count: 2 },
  ];

  for (let index = 0; index < families.length; index += 1) {
    const f = families[index];
    const driftX = 0.080 * Math.sin(phase + f.offset);
    const driftY = 0.065 * Math.cos(phase + f.offset);
    const precession = 0.105 * Math.sin(phase + f.offset + 0.8)
      + 0.026 * Math.sin(phase * 2 - f.offset);
    ctx.save();
    ctx.translate(f.x + driftX, f.y + driftY);
    ctx.rotate(f.angle + precession);

    // Small elliptical washes belong to a local orbital tangent, never a ball.
    const washAngle = 0.88 + index * 1.7 + 0.17 * Math.sin(phase + f.offset);
    haze(ctx, f.rx * Math.cos(washAngle), f.ry * Math.sin(washAngle),
      f.rx * 0.34, f.ry * 0.52, f.rgb, 0.105 * f.strength, -0.35);

    for (let ring = 0; ring < f.count; ring += 1) {
      const scale = 0.86 + ring * 0.145;
      const rx = f.rx * scale;
      const ry = f.ry * (scale + 0.017 * Math.sin(phase + f.offset + ring));
      orbitStroke(ctx, rx, ry, f.rgb, f.strength * 0.53);

      // Rear arcs stay diffuse; a shorter front arc defines the tilted plane.
      const front = 0.12 + 0.16 * Math.sin(phase + f.offset + ring * 0.9);
      orbitStroke(ctx, rx, ry, f.rgb, f.strength * 0.82, front, front + 1.24);
    }

    // Local diffuse concentrations retain movement without identifiable stars.
    for (let point = 0; point < 2; point += 1) {
      const theta = f.offset + point * 2.17 + phase * (point === 1 ? -1 : 1);
      const x = f.rx * Math.cos(theta), y = f.ry * Math.sin(theta);
      haze(ctx,x,y,.042,.028,f.rgb,.055*f.strength);
    }
    ctx.restore();
  }
}

/** Paint a 640 x 400 Canvas2D frame for preset "curtain" or "orbit". */
export function paintCreativeA(canvas, preset, time = 0) {
  if (canvas.width !== WIDTH) canvas.width = WIDTH;
  if (canvas.height !== HEIGHT) canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  ctx.setTransform(WIDTH, 0, 0, HEIGHT, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, 1, 1);

  const phase = phaseAt(time);
  const id = typeof preset === 'string' ? preset : preset?.id;
  if (id === 'orbit') orbit(ctx, phase);
  else curtain(ctx, phase);

  ctx.restore();
  return canvas;
}
