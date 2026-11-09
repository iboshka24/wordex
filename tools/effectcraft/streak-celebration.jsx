// ============================================================================
//  Wordzone — "Streak Celebration" motion piece
//  Built headlessly for EffectCraft (https://github.com/iboshka24/effectcraft-mcp)
//  Run:  effectcraft-cli script streak-celebration.jsx --empty --save-as streak.ecproj
//
//  Brief (identical to the native CSS/JS version in the web app's Motion Lab):
//    dark stage -> expanding violet ping ring -> warm flame pop-in with flicker
//    -> title "5 Day Streak!" overshoot rise -> confetti burst + falling confetti
// ============================================================================

var W = 640, H = 400, FPS = 30, DUR = 3.6;

var comp = app.project.items.addComp('StreakCelebration', W, H, 1, DUR, FPS);
writeLn('comp created: ' + comp.name + ' ' + W + 'x' + H + ' @' + FPS + 'fps');

function run(id, params) { return app.run(id, params); }
function set(layer, path, value) { run('prop.set', { layer: layer, path: path, value: value }); }
function key(layer, path, t, value) { run('prop.addKey', { layer: layer, path: path, time: t, value: value }); }

// Apply Easy-Ease style influence to one key. side: 'both' | 'in' | 'out'
function ease(layer, path, t, influence, side) {
  var eff = (influence === undefined) ? 66.67 : influence;
  var sides = (side === 'in') ? ['in'] : (side === 'out') ? ['out'] : ['in', 'out'];
  for (var i = 0; i < sides.length; i++) {
    try {
      run('keys.setEase', { layer: layer, path: path, time: t, side: sides[i], speed: 0, influence: eff });
    } catch (e) {
      // fall back to select + easyEase
      try {
        run('keys.select', { keys: [{ layer: layer, prop: path, time: t }] });
        run('keys.easyEase', { which: sides[i] === 'in' ? 'in' : 'out' });
      } catch (e2) { writeLn('ease skip ' + layer + '/' + path + '@' + t + ': ' + e2.message); }
    }
  }
}

function newShapeLayer(name) {
  var l = comp.layers.addShape();
  l.name = name;
  return l;
}

// ── palette ────────────────────────────────────────────────────────────────
var VIOLET  = '#8B5CF6';
var ORANGE  = '#FF7A18';
var DEEP    = '#0D0B18';
var PALETTE = ['#F97316', '#8B5CF6', '#22C55E', '#38BDF8', '#FACC15', '#F43F5E', '#FB7185', '#A78BFA'];

// ── 1. background plate ────────────────────────────────────────────────────
var bg = newShapeLayer('BG');
run('layer.addShapeItem', { layer: 'BG', kind: 'rect', name: 'Plate' });
run('layer.addShapeItem', { layer: 'BG', kind: 'fill', name: 'PlateFill' });
set('BG', 'contents/rect/size', [W + 80, H + 80]);
set('BG', 'contents/rect/position', [0, 0]);
set('BG', 'contents/fill/color', DEEP);
set('BG', 'transform/position', [W / 2, H / 2]);

// ── 2. big soft glow behind the flame ─────────────────────────────────────
var glow = newShapeLayer('Glow');
run('layer.addShapeItem', { layer: 'Glow', kind: 'ellipse', name: 'GlowBall' });
run('layer.addShapeItem', { layer: 'Glow', kind: 'gfill', name: 'GlowFill' });
set('Glow', 'contents/ellipse/size', [430, 430]);
set('Glow', 'contents/gfill/type', 1); // radial
set('Glow', 'contents/gfill/colors', { colors: [[0, [1.0, 0.48, 0.09, 0.52]], [0.55, [1.0, 0.3, 0.02, 0.16]], [1, [1.0, 0.2, 0.0, 0.0]]] });
set('Glow', 'transform/position', [W / 2, 222]);
set('Glow', 'transform/opacity', 70);
key('Glow', 'transform/scale', 0, [92, 92]);
key('Glow', 'transform/scale', 1.8, [106, 106]);
key('Glow', 'transform/scale', 3.6, [92, 92]);
key('Glow', 'transform/opacity', 0, 55);
key('Glow', 'transform/opacity', 1.8, 85);
key('Glow', 'transform/opacity', 3.6, 55);
ease('Glow', 'transform/scale', 0); ease('Glow', 'transform/scale', 1.8); ease('Glow', 'transform/scale', 3.6);
ease('Glow', 'transform/opacity', 0); ease('Glow', 'transform/opacity', 1.8); ease('Glow', 'transform/opacity', 3.6);

// ── 3. ping ring ───────────────────────────────────────────────────────────
var ring = newShapeLayer('Ring');
run('layer.addShapeItem', { layer: 'Ring', kind: 'ellipse', name: 'RingPath' });
run('layer.addShapeItem', { layer: 'Ring', kind: 'stroke', name: 'RingStroke' });
set('Ring', 'contents/ellipse/size', [120, 120]);
set('Ring', 'contents/stroke/color', VIOLET);
set('Ring', 'contents/stroke/width', 7);
set('Ring', 'transform/position', [W / 2, 236]);
key('Ring', 'transform/scale', 0.08, [26, 26]);
key('Ring', 'transform/scale', 0.95, [315, 315]);
key('Ring', 'transform/opacity', 0.08, 85);
key('Ring', 'transform/opacity', 0.95, 0);
ease('Ring', 'transform/scale', 0.08, 30, 'in');
ease('Ring', 'transform/scale', 0.95, 30, 'out');
ease('Ring', 'transform/opacity', 0.08, 30, 'in');
ease('Ring', 'transform/opacity', 0.95, 30, 'out');

// ── 4. flame (ellipse base + polygon tip), pops in then flickers ──────────
function flamePart(name, knob, size) {
  var l = newShapeLayer(name);
  run('layer.addShapeItem', { layer: name, kind: knob === 'poly' ? 'polygon' : 'ellipse', name: name + 'Shape' });
  run('layer.addShapeItem', { layer: name, kind: 'gfill', name: name + 'Fill' });
  return l;
}

var fBot = flamePart('FlameBase', 'ellipse');
set('FlameBase', 'contents/ellipse/size', [96, 96]);
set('FlameBase', 'contents/gfill/type', 1);
set('FlameBase', 'contents/gfill/colors', { colors: [[0, [1.0, 0.89, 0.55, 1]], [0.6, [1.0, 0.55, 0.05, 1]], [1, [1.0, 0.28, 0.0, 1]]] });
set('FlameBase', 'transform/position', [W / 2, 247]);

var fTop = flamePart('FlameTip', 'poly');
set('FlameTip', 'contents/star/points', 3);
set('FlameTip', 'contents/star/outerRadius', 46);
set('FlameTip', 'contents/star/outerRoundness', 26);
set('FlameTip', 'contents/gfill/colors', { colors: [[0, [1.0, 0.86, 0.38, 1]], [1, [1.0, 0.33, 0.0, 1]]] });
set('FlameTip', 'contents/gfill/start', [0, -68]);
set('FlameTip', 'contents/gfill/end', [0, 62]);
set('FlameTip', 'transform/position', [W / 2, 206]);
set('FlameTip', 'transform/scale', [96, 132]);

var flames = ['FlameBase', 'FlameTip'];
for (var f = 0; f < flames.length; f++) {
  var fn = flames[f];
  // pop-in with overshoot
  key(fn, 'transform/scale', 0.10, [0, 0]);
  key(fn, 'transform/scale', 0.52, [114, 114]);
  key(fn, 'transform/scale', 0.78, [100, 100]);
  ease(fn, 'transform/scale', 0.10, 55, 'in');
  ease(fn, 'transform/scale', 0.52, 55);
  ease(fn, 'transform/scale', 0.78, 55);
  key(fn, 'transform/opacity', 0.10, 0);
  key(fn, 'transform/opacity', 0.30, 100);
  ease(fn, 'transform/opacity', 0.10, 50, 'in');
  // flicker loop (0.9 s .. 3.6 s)
  var times = [0.9, 1.35, 1.8, 2.25, 2.7, 3.15, 3.6];
  for (var i = 0; i < times.length; i++) {
    var wob = (i % 2 === 0) ? -3.2 : 3.2;
    if (i === times.length - 1) wob = 0;
    key(fn, 'transform/scale', times[i], [100 + wob, 100 - wob]);
    key(fn, 'transform/rotation', times[i], (i % 2 === 0) ? 2.4 : -2.4);
    ease(fn, 'transform/scale', times[i], 45);
    ease(fn, 'transform/rotation', times[i], 45);
  }
  key(fn, 'transform/rotation', 3.6, 0);
}
// keep the tip elongated after the uniform pop-in scale keys
key('FlameTip', 'transform/scale', 0.10, [0, 0]);

// ── 5. title + subtitle ────────────────────────────────────────────────────
var title = comp.layers.addText('5 Day Streak!');
title.name = 'Title';
run('layer.setText', { layer: 'Title', font: 'Inter', style: 'Bold', size: 58, fill: '#FFFFFF' });
title.property('ADBE Transform Group').property('ADBE Position').setValue([W / 2, 322]);
key('Title', 'transform/opacity', 0.50, 0);
key('Title', 'transform/opacity', 0.78, 100);
key('Title', 'transform/position', 0.50, [W / 2, 352]);
key('Title', 'transform/position', 0.95, [W / 2, 322]);
key('Title', 'transform/scale', 0.50, [82, 82]);
key('Title', 'transform/scale', 0.86, [107, 107]);
key('Title', 'transform/scale', 1.10, [100, 100]);
ease('Title', 'transform/opacity', 0.50, 60, 'in');
ease('Title', 'transform/opacity', 0.78, 60, 'out');
ease('Title', 'transform/position', 0.50, 66, 'in');
ease('Title', 'transform/position', 0.95, 66, 'out');
ease('Title', 'transform/scale', 0.50, 60, 'in');
ease('Title', 'transform/scale', 0.86, 70);
ease('Title', 'transform/scale', 1.10, 60, 'out');

var sub = comp.layers.addText('daily goal met');
sub.name = 'Subtitle';
run('layer.setText', { layer: 'Subtitle', font: 'Inter', style: 'Medium', size: 22, fill: '#B9B6D9' });
sub.property('ADBE Transform Group').property('ADBE Position').setValue([W / 2, 360]);
key('Subtitle', 'transform/opacity', 0.95, 0);
key('Subtitle', 'transform/opacity', 1.35, 88);
ease('Subtitle', 'transform/opacity', 0.95, 60, 'in');

// ── 6. confetti burst from the flame ───────────────────────────────────────
var BURST = 16, BX = W / 2, BY = 214;
for (var b = 0; b < BURST; b++) {
  var name = 'Burst' + b;
  var streamer = (b % 4 === 3);
  var sw = streamer ? 9 : 16, sh = streamer ? 30 : 16;
  var l = newShapeLayer(name);
  run('layer.addShapeItem', { layer: name, kind: 'rect', name: 'Piece' });
  run('layer.addShapeItem', { layer: name, kind: 'fill', name: 'PieceFill' });
  set(name, 'contents/rect/size', [sw, sh]);
  set(name, 'contents/rect/roundness', 4);
  set(name, 'contents/fill/color', PALETTE[b % PALETTE.length]);
  set(name, 'transform/position', [BX, BY]);
  var ang = (b * 22.5 + 9) * Math.PI / 180;
  var dist = 165 + ((b * 47) % 115);
  var ex = BX + Math.cos(ang) * dist;
  var ey = BY + Math.sin(ang) * dist * 0.82 - 26; // slightly top-biased
  key(name, 'transform/opacity', 0.22, 0);
  key(name, 'transform/opacity', 0.30, 100);
  key(name, 'transform/opacity', 3.0, 100);
  key(name, 'transform/opacity', 3.5, 0);
  key(name, 'transform/position', 0.22, [BX, BY]);
  key(name, 'transform/position', 0.80, [ex, ey]);
  key(name, 'transform/position', 3.3, [ex + (b % 2 ? 14 : -14), ey + 52]);
  key(name, 'transform/rotation', 0.22, 0);
  key(name, 'transform/rotation', 1.2, 360 + (b % 5) * 120);
  ease(name, 'transform/opacity', 0.22, 60, 'in');
  ease(name, 'transform/opacity', 3.0, 60, 'in');
  ease(name, 'transform/opacity', 3.5, 60, 'out');
  ease(name, 'transform/position', 0.22, 70, 'in');
  ease(name, 'transform/position', 0.80, 40, 'out');
  ease(name, 'transform/position', 3.3, 40, 'out');
  ease(name, 'transform/rotation', 0.22, 40, 'in');
  ease(name, 'transform/rotation', 1.2, 40, 'out');
}

// ── 7. falling confetti rain ───────────────────────────────────────────────
var FALL = 14;
for (var c = 0; c < FALL; c++) {
  var n2 = 'Fall' + c;
  var streamer2 = (c % 5 === 2);
  var w2 = streamer2 ? 8 : 13, h2 = streamer2 ? 26 : 13;
  var x0 = 26 + c * 44 + ((c * 29) % 31);
  if (x0 > W - 20) x0 -= W - 40;
  var t0 = 0.5 + (c % 7) * 0.16;
  var sway = (c % 2 === 0) ? 26 : -26;
  var l2 = newShapeLayer(n2);
  run('layer.addShapeItem', { layer: n2, kind: 'rect', name: 'Flake' });
  run('layer.addShapeItem', { layer: n2, kind: 'fill', name: 'FlakeFill' });
  set(n2, 'contents/rect/size', [w2, h2]);
  set(n2, 'contents/rect/roundness', 3);
  set(n2, 'contents/fill/color', PALETTE[(c + 3) % PALETTE.length]);
  key(n2, 'transform/opacity', t0, 0);
  key(n2, 'transform/opacity', t0 + 0.12, 100);
  key(n2, 'transform/opacity', t0 + 2.05, 100);
  key(n2, 'transform/opacity', t0 + 2.35, 0);
  key(n2, 'transform/position', t0, [x0, -40]);
  key(n2, 'transform/position', t0 + 1.05, [x0 + sway, 210]);
  key(n2, 'transform/position', t0 + 2.30, [x0, 460]);
  key(n2, 'transform/rotation', t0, 0);
  key(n2, 'transform/rotation', t0 + 2.2, 200 + (c % 4) * 90);
  ease(n2, 'transform/opacity', t0, 60, 'in');
  ease(n2, 'transform/position', t0, 30, 'in');
  ease(n2, 'transform/position', t0 + 2.30, 30, 'out');
}

writeLn('layers: ' + comp.layers.length);
writeLn('done');
