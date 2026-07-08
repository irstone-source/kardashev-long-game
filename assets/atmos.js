/*!
 * atmos.js — KARDASHEV: The Long Game
 * Zero-dependency background atmosphere engine. Classic script (NOT a module):
 * runs from file:// (double-click) as well as http://. Assigns window.Atmos.
 *
 * ---------------------------------------------------------------------------
 * CONFIG SCHEMA  — window.ATMOS_CONFIG (optional; a built-in DEFAULT is used
 * when absent, so the engine always renders). Shape:
 *
 *   window.ATMOS_CONFIG = {
 *     imgBase: "assets/img/",   // optional; still-image base path (trailing /).
 *     vidBase: "assets/vid/",   // optional; video-loop base path (trailing /).
 *     images:  true,            // optional; false forces Tier-1 (no stills).
 *     scenes: {
 *       "<name>": {
 *         grad:     [css color, ...]  // linear base stops, top->bottom.
 *                                     //   dark-native: near-black, accent
 *                                     //   bleeding in at top/edges, center dark.
 *         accent:   "#RRGGBB"         // single accent colour (also particle glow).
 *         preset:   "drift"|"embers"|"wind"|"starstream"|"deepfield"|"dawn"
 *         density:  0..1              // multiplier on particle count.
 *         scrim:    "rgba(r,g,b,a)"   // vignette tint overlay colour.
 *         vignette: 0..1              // edge-darkening strength.
 *         focus:    "center 35%"      // optional; object-position for still+video.
 *         video:    true              // optional; play vidBase+scene+".mp4" loop
 *                                     //   (gated off for reduced-motion / Save-Data
 *                                     //   / 2G / deviceMemory<4 — still shows instead).
 *       }, ...
 *     }
 *   }
 *
 * Scene names the game uses: title, era-0..era-6, end-death, end-transcend,
 * end-survive. Unknown names to Atmos.set() are ignored (no throw).
 * ---------------------------------------------------------------------------
 *
 * PUBLIC API (window.Atmos):
 *   init(opts)      build layers inside #atmos, start rAF loop. Idempotent.
 *   set(scene)      crossfade to a named scene (gradient/scrim/preset/palette).
 *   mood({heat})    live modulation; heat 0..1 warms scrim + agitates motion.
 *   pulse(kind)     transient: "lapse" (light streaks) | "filter" (dread flicker).
 *   preload(scene)  reserved image-preload hook; safe no-op for now.
 *   pause() / resume()   stop / start the loop.
 *   destroy()       cancel rAF, drop listeners, empty #atmos.
 */
(function () {
  "use strict";

  var W = window, D = document;

  /* ----------------------------- DEFAULT CONFIG ----------------------------- */
  var DEFAULT = {
    scenes: {
      "title": {
        grad: ["#0a0906", "#0a0906", "#070604", "#050403"],
        accent: "#F2B44C", preset: "drift", density: 0.85,
        scrim: "rgba(8,6,3,0.55)", vignette: 0.85, video: true
      },
      "era-0": {
        grad: ["#12100a", "#0b0906", "#070503", "#040302"],
        accent: "#F2B44C", preset: "embers", density: 0.9,
        scrim: "rgba(12,7,3,0.5)", vignette: 0.8, video: true
      },
      "era-1": {
        grad: ["#140f08", "#0d0805", "#080503", "#050302"],
        accent: "#F2A03C", preset: "wind", density: 0.9,
        scrim: "rgba(14,8,3,0.5)", vignette: 0.78
      },
      "era-2": {
        grad: ["#04121a", "#030c12", "#02080c", "#020406"],
        accent: "#5EC6E8", preset: "starstream", density: 0.8,
        scrim: "rgba(3,10,16,0.52)", vignette: 0.82
      },
      "era-3": {
        grad: ["#0d0718", "#090511", "#06040c", "#040207"],
        accent: "#B48CF2", preset: "deepfield", density: 0.7,
        scrim: "rgba(8,5,16,0.55)", vignette: 0.85
      },
      "era-4": {
        grad: ["#0a0716", "#07050f", "#05040b", "#030206"],
        accent: "#9B8CF2", preset: "deepfield", density: 0.65,
        scrim: "rgba(6,5,14,0.58)", vignette: 0.88
      },
      "era-5": {
        grad: ["#160806", "#0f0604", "#0a0403", "#050202"],
        accent: "#E86A5B", preset: "embers", density: 0.85,
        scrim: "rgba(16,5,3,0.55)", vignette: 0.82
      },
      "era-6": {
        grad: ["#1a140a", "#120d07", "#0b0805", "#060403"],
        accent: "#FFE9C2", preset: "dawn", density: 0.9,
        scrim: "rgba(14,10,5,0.45)", vignette: 0.72, video: true
      },
      "end-death": {
        grad: ["#100504", "#0a0302", "#060202", "#030101"],
        accent: "#8A3B34", preset: "embers", density: 0.35,
        scrim: "rgba(10,3,2,0.62)", vignette: 0.92
      },
      "end-transcend": {
        grad: ["#1c160c", "#141009", "#0c0906", "#050403"],
        accent: "#FFE9C2", preset: "dawn", density: 1.0,
        scrim: "rgba(16,12,6,0.4)", vignette: 0.68
      },
      "end-survive": {
        grad: ["#100c07", "#0b0805", "#070503", "#040302"],
        accent: "#C9A15E", preset: "drift", density: 0.8,
        scrim: "rgba(10,7,3,0.52)", vignette: 0.8
      }
    }
  };

  /* -------------------------- PRESET BEHAVIOUR PARAMS ----------------------- */
  /* Each preset parameterises the SAME particle struct. Numeric-only so the
     hot loop stays allocation-free (branch on integer id). */
  var P_DRIFT = 0, P_EMBERS = 1, P_WIND = 2, P_STARSTREAM = 3, P_DEEPFIELD = 4, P_DAWN = 5;
  var PRESET_ID = {
    drift: P_DRIFT, embers: P_EMBERS, wind: P_WIND,
    starstream: P_STARSTREAM, deepfield: P_DEEPFIELD, dawn: P_DAWN
  };

  var MAX = 160;          // hard pool cap
  var DPR_CAP = 1.75;

  /* ------------------------------- STATE ------------------------------------ */
  var cfg = DEFAULT;
  var inited = false;
  var root, washA, washB, canvas, ctx, scrim, fx;
  var washTop = true;     // which wash div is currently on top (visible)
  var dpr = 1;
  var W_px = 0, H_px = 0;         // backing-store pixels
  var W_css = 0, H_css = 0;       // css pixels
  var rafId = 0, lastT = 0, running = false, reduced = false;
  var resizeTimer = 0;

  var sceneName = null;
  var cur = null;                 // active scene object
  var preset = P_DRIFT;
  var accent = "#F2B44C";
  var accentRGB = [242, 180, 76];
  var activeCount = 60;
  var baseCount = 120;
  var heat = 0;

  var spriteCache = {};           // color hex -> glow canvas
  var curSprite = null;

  // scrim tint (base, from scene) + live warmed value
  var scrimBase = [8, 6, 3, 0.55];
  var vignette = 0.85;

  // still-image layer (Tier-2). Degrades silently to gradient+particles (Tier-1).
  var imgA, imgB;
  var imgTop = true;              // which img is currently on top (visible)
  var imgEnabled = true;         // config `images:false` disables the layer
  var imgBase = "assets/img/";   // config `imgBase` overrides
  var defaultFocus = "center 35%"; // keep bright subject off the vertical centre
  var avifSupported = null;      // null = detection pending, then true/false
  var pendingImgScene = null;    // scene awaiting AVIF detection to resolve
  var imgToken = 0;              // guards against out-of-order decodes
  var curImgKey = "";            // scene+orient+fmt actually shown (dedupes work)
  var lastPreloaded = null;      // never prefetch more than current + this one
  var idleId = 0;
  var idleIsTimeout = false;      // true when idleId is a setTimeout handle
  // preload chain: title -> era-0 ... -> era-6; era-6 and end-* preload nothing.
  var SCENE_ORDER = ["title", "era-0", "era-1", "era-2", "era-3", "era-4", "era-5", "era-6"];

  // video-loop layer (Tier-3). Only marquee scenes with `video:true` and only
  // when device/prefs gating allows; otherwise the still remains the top frame.
  var vid = null;                // single <video> element
  var vidBase = "assets/vid/";   // config `vidBase` overrides
  var vidToken = 0;              // guards against out-of-order canplay handlers
  var vidScene = null;           // scene whose src is currently on the element
  var vidAllowed = null;         // null until computed; then true/false (device gate)

  // transient effects
  var lapse = [];                 // {x,y,vx,vy,life,max,len} small fixed array
  var LAPSE_N = 6;
  var filterUntil = 0;            // timestamp; while >now, dread flicker active

  /* -------------------------------- POOL ------------------------------------ */
  // Struct-of-arrays would be leaner but object pool is plenty here and clearer.
  var pool = new Array(MAX);
  (function initPool() {
    for (var i = 0; i < MAX; i++) {
      pool[i] = { x: 0, y: 0, vx: 0, vy: 0, sz: 1, a: 0, life: 0, max: 1, seed: 0, streak: 0 };
    }
    for (var j = 0; j < LAPSE_N; j++) {
      lapse[j] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, on: false };
    }
  })();

  /* ------------------------------- HELPERS ---------------------------------- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function hexToRgb(h) {
    h = ("" + h).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [255, 255, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function parseRgba(s) {
    var m = (" " + s).match(/(-?\d*\.?\d+)/g);
    if (!m) return [0, 0, 0, 1];
    return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]];
  }
  function rgba(r, g, b, a) {
    return "rgba(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + "," + a + ")";
  }

  /* Pre-render a soft additive glow sprite for a colour, cache by hex. Built
     off the animation loop; the loop only blits with drawImage. Never uses
     ctx.shadowBlur. */
  function getSprite(hex) {
    if (spriteCache[hex]) return spriteCache[hex];
    var S = 64, c = D.createElement("canvas");
    c.width = S; c.height = S;
    var g = c.getContext("2d");
    var rgb = hexToRgb(hex);
    var grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0.0, rgba(rgb[0], rgb[1], rgb[2], 1));
    grad.addColorStop(0.25, rgba(rgb[0], rgb[1], rgb[2], 0.55));
    grad.addColorStop(0.6, rgba(rgb[0], rgb[1], rgb[2], 0.12));
    grad.addColorStop(1.0, rgba(rgb[0], rgb[1], rgb[2], 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    spriteCache[hex] = c;
    return c;
  }

  /* --------------------------- LAYER CONSTRUCTION --------------------------- */
  function makeDiv(css) {
    var d = D.createElement("div");
    d.style.cssText = css;
    return d;
  }

  function buildLayers() {
    root = D.getElementById("atmos");
    if (!root) {
      root = D.createElement("div");
      root.id = "atmos";
      root.setAttribute("aria-hidden", "true");
      if (D.body.firstChild) D.body.insertBefore(root, D.body.firstChild);
      else D.body.appendChild(root);
    }
    root.style.cssText =
      "position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;";
    // wipe any prior content (idempotent rebuild)
    while (root.firstChild) root.removeChild(root.firstChild);

    var base = "position:absolute;inset:0;pointer-events:none;";
    // 1. gradient wash A/B (crossfaded on set)
    washA = makeDiv(base + "opacity:1;transition:opacity 1.2s ease;");
    washB = makeDiv(base + "opacity:0;transition:opacity 1.2s ease;");
    // 2. still-image A/B (crossfaded on set; between wash and canvas). Any
    //    load/decode failure just leaves these transparent → clean Tier-1.
    var imgCss = base + "width:100%;height:100%;object-fit:cover;opacity:0;" +
      "object-position:" + defaultFocus + ";transition:opacity 1.2s ease;";
    imgA = D.createElement("img"); imgA.style.cssText = imgCss;
    imgB = D.createElement("img"); imgB.style.cssText = imgCss;
    imgA.decoding = "async"; imgB.decoding = "async";
    imgA.alt = ""; imgB.alt = "";
    // swallow late errors so a 404/abort never reaches the console
    imgA.onerror = imgB.onerror = function () { this.style.opacity = "0"; };
    // 3. video loop (above stills, below canvas). Only marquee scenes with
    //    video:true set a src; the still stays underneath as poster/fallback.
    vid = D.createElement("video");
    vid.style.cssText = base + "width:100%;height:100%;object-fit:cover;opacity:0;" +
      "object-position:" + defaultFocus + ";transition:opacity 1s ease;";
    vid.muted = true; vid.playsInline = true;   // properties for iOS
    vid.setAttribute("muted", "");
    vid.setAttribute("playsinline", "");
    vid.setAttribute("loop", "");
    vid.setAttribute("preload", "none");
    vid.setAttribute("disableremoteplayback", "");
    vid.loop = true;
    vid.onerror = function () { this.style.opacity = "0"; }; // swallow load errors
    // 4. particle canvas
    canvas = D.createElement("canvas");
    canvas.style.cssText = base + "opacity:1;";
    // 5. scrim vignette + tint
    scrim = makeDiv(base + "transition:background 0.6s ease;");
    // fx overlay for transient flashes (lapse / filter)
    fx = makeDiv(base + "opacity:0;transition:opacity 0.18s ease;mix-blend-mode:screen;");

    root.appendChild(washA);
    root.appendChild(washB);
    root.appendChild(imgA);
    root.appendChild(imgB);
    root.appendChild(vid);
    root.appendChild(canvas);
    root.appendChild(scrim);
    root.appendChild(fx);

    ctx = canvas.getContext("2d");
  }

  /* ------------------------------- SIZING ----------------------------------- */
  function resize() {
    dpr = Math.min(W.devicePixelRatio || 1, DPR_CAP);
    W_css = root.clientWidth || W.innerWidth || 1;
    H_css = root.clientHeight || W.innerHeight || 1;
    W_px = Math.max(1, Math.round(W_css * dpr));
    H_px = Math.max(1, Math.round(H_css * dpr));
    canvas.width = W_px;
    canvas.height = H_px;
    canvas.style.width = W_css + "px";
    canvas.style.height = H_css + "px";
    // area-scaled base count: full at ~ desktop; fewer on small screens
    var area = W_css * H_css;
    baseCount = clamp(Math.round(area / 13000), 24, MAX);
    recount();
    if (cur) seedAll(true);
    if (reduced) renderStatic();
    // orientation may have flipped (portrait<->landscape): reload the matching
    // still. curImgKey dedupes, so no refetch when the orient is unchanged.
    if (sceneName) showImage(sceneName);
  }

  function recount() {
    var d = cur ? (cur.density == null ? 1 : cur.density) : 1;
    activeCount = clamp(Math.round(baseCount * d), 8, MAX);
  }

  /* ---------------------------- SEED PARTICLES ------------------------------ */
  function seedOne(p, spread) {
    p.seed = rand(0, Math.PI * 2);
    switch (preset) {
      case P_EMBERS:
        p.x = rand(0, W_px);
        p.y = spread ? rand(0, H_px) : H_px + rand(0, 40);
        p.vx = rand(-8, 8);
        p.vy = rand(-40, -18);
        p.sz = rand(1.4, 4.2) * dpr;
        p.a = rand(0.35, 0.9);
        p.max = rand(3.2, 6.5);
        p.life = spread ? rand(0, p.max) : 0;
        p.streak = 0;
        break;
      case P_WIND: {
        var dir = Math.random() < 0.5 ? 1 : -1;
        p.x = dir > 0 ? rand(-60, 0) : W_px + rand(0, 60);
        if (spread) p.x = rand(0, W_px);
        p.y = rand(0, H_px);
        p.vx = dir * rand(160, 320);
        p.vy = rand(-10, 10);
        p.sz = rand(1.2, 3) * dpr;
        p.a = rand(0.2, 0.6);
        p.max = 10;
        p.life = 0;
        p.streak = 1;
        break;
      }
      case P_STARSTREAM: {
        var ang = rand(0, Math.PI * 2);
        var sp = rand(60, 220);
        p.x = W_px / 2 + Math.cos(ang) * (spread ? rand(0, W_px / 2) : rand(0, 30));
        p.y = H_px / 2 + Math.sin(ang) * (spread ? rand(0, H_px / 2) : rand(0, 30));
        p.vx = Math.cos(ang) * sp;
        p.vy = Math.sin(ang) * sp;
        p.sz = rand(1.2, 2.8) * dpr;
        p.a = rand(0.25, 0.7);
        p.max = 8;
        p.life = 0;
        p.streak = 1;
        break;
      }
      case P_DEEPFIELD:
        p.x = rand(0, W_px);
        p.y = rand(0, H_px);
        p.vx = rand(-4, 4);
        p.vy = rand(-2, 2);
        p.sz = rand(0.7, 2.4) * dpr;
        p.a = rand(0.15, 0.75);
        p.max = rand(4, 9);
        p.life = rand(0, p.max);
        p.streak = 0;
        break;
      case P_DAWN:
        p.x = rand(0, W_px);
        p.y = spread ? rand(0, H_px) : H_px + rand(0, 30);
        p.vx = 0;
        p.vy = rand(-30, -12);
        p.sz = rand(1.2, 3.4) * dpr;
        p.a = rand(0.2, 0.7);
        p.max = rand(4, 7);
        p.life = spread ? rand(0, p.max) : 0;
        p.streak = 0;
        break;
      default: // P_DRIFT
        p.x = rand(0, W_px);
        p.y = rand(0, H_px);
        p.vx = rand(-9, 9);
        p.vy = rand(-7, 7);
        p.sz = rand(1.4, 3.6) * dpr;
        p.a = rand(0.15, 0.6);
        p.max = rand(5, 11);
        p.life = rand(0, p.max);
        p.streak = 0;
    }
  }

  function seedAll(spread) {
    for (var i = 0; i < MAX; i++) seedOne(pool[i], spread);
  }

  /* ------------------------------- STEP ------------------------------------- */
  function step(p, dt, speedMul, turb) {
    p.life += dt;
    var reborn = false;
    switch (preset) {
      case P_EMBERS:
        p.x += (p.vx + Math.sin(p.seed + p.life * 2) * 14 * turb) * dt * speedMul;
        p.y += p.vy * dt * speedMul;
        if (p.life >= p.max || p.y < -20) reborn = true;
        break;
      case P_WIND:
        p.x += p.vx * dt * speedMul;
        p.y += (p.vy + Math.sin(p.seed + p.life * 3) * 6 * turb) * dt;
        if (p.x < -80 || p.x > W_px + 80) reborn = true;
        break;
      case P_STARSTREAM:
        // accelerate outward for a warp feel
        p.vx *= (1 + 0.9 * dt * speedMul);
        p.vy *= (1 + 0.9 * dt * speedMul);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -40 || p.x > W_px + 40 || p.y < -40 || p.y > H_px + 40) reborn = true;
        break;
      case P_DEEPFIELD:
        // parallax: larger stars drift a touch faster
        p.x += p.vx * dt * (0.5 + p.sz * 0.15) * speedMul;
        p.y += p.vy * dt * (0.5 + p.sz * 0.15) * speedMul;
        if (p.x < 0) p.x += W_px; else if (p.x > W_px) p.x -= W_px;
        if (p.y < 0) p.y += H_px; else if (p.y > H_px) p.y -= H_px;
        break;
      case P_DAWN: {
        // converge toward a bloom near top-centre while rising
        var bx = W_px * 0.5, by = H_px * 0.18;
        p.vx += (bx - p.x) * 0.08 * dt;
        p.x += (p.vx + Math.sin(p.seed + p.life) * 10 * turb) * dt * speedMul;
        p.y += p.vy * dt * speedMul;
        if (p.life >= p.max || p.y < by) reborn = true;
        break;
      }
      default: // DRIFT
        p.x += (p.vx + Math.sin(p.seed + p.life * 0.7) * 6 * turb) * dt * speedMul;
        p.y += (p.vy + Math.cos(p.seed + p.life * 0.6) * 5 * turb) * dt * speedMul;
        if (p.x < -20) p.x += W_px + 40; else if (p.x > W_px + 20) p.x -= W_px + 40;
        if (p.y < -20) p.y += H_px + 40; else if (p.y > H_px + 20) p.y -= H_px + 40;
        if (p.life >= p.max) reborn = true;
    }
    if (reborn) seedOne(p, false);
  }

  /* alpha envelope: fade in at birth, fade out near death (for finite-life presets) */
  function envelope(p) {
    var t = p.life / p.max;
    if (t < 0.15) return p.a * (t / 0.15);
    if (t > 0.7) return p.a * (1 - (t - 0.7) / 0.3);
    return p.a;
  }

  /* ------------------------------- DRAW ------------------------------------- */
  function drawParticle(p, sprite) {
    var a;
    if (preset === P_DEEPFIELD) {
      // gentle twinkle, no finite life
      a = p.a * (0.6 + 0.4 * Math.sin(p.seed + p.life * 2.2));
    } else if (preset === P_WIND || preset === P_STARSTREAM) {
      a = p.a;
    } else {
      a = envelope(p);
    }
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    if (p.streak) {
      var vx = p.vx, vy = p.vy;
      var len = Math.sqrt(vx * vx + vy * vy);
      if (len < 0.001) return;
      var ux = vx / len, uy = vy / len;
      var ln = clamp(len * 0.06, 6, 90) * dpr / dpr; // px in backing store
      var wd = p.sz * 2.2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(uy, ux));
      ctx.drawImage(sprite, -ln, -wd / 2, ln * 2, wd);
      ctx.restore();
    } else {
      var s = p.sz * 3.2;
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  function renderFrame(speedMul, turb, dt) {
    ctx.clearRect(0, 0, W_px, H_px);
    ctx.globalCompositeOperation = "lighter";
    var sprite = curSprite || getSprite(accent);
    var i;
    for (i = 0; i < activeCount; i++) {
      var p = pool[i];
      if (dt > 0) step(p, dt, speedMul, turb);
      drawParticle(p, sprite);
    }
    // transient lapse streaks (fast light across the field)
    for (i = 0; i < LAPSE_N; i++) {
      var l = lapse[i];
      if (!l.on) continue;
      l.life += dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (l.life >= l.max) { l.on = false; continue; }
      var la = Math.sin((l.life / l.max) * Math.PI) * 0.9;
      ctx.globalAlpha = la;
      var lang = Math.atan2(l.vy, l.vx);
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(lang);
      ctx.drawImage(sprite, -80 * dpr, -2.4 * dpr, 160 * dpr, 4.8 * dpr);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function renderStatic() {
    // reduced-motion single frame: a calm constellation, no rAF.
    if (!ctx) return;
    ctx.clearRect(0, 0, W_px, H_px);
    ctx.globalCompositeOperation = "lighter";
    var sprite = curSprite || getSprite(accent);
    for (var i = 0; i < activeCount; i++) {
      var p = pool[i];
      var a = p.a * 0.8;
      ctx.globalAlpha = a;
      var s = p.sz * 3;
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /* ------------------------------- LOOP ------------------------------------- */
  function frame(t) {
    if (!running) return;
    rafId = W.requestAnimationFrame(frame);
    var dt = (t - lastT) / 1000;
    lastT = t;
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;          // clamp (tab jank / low fps)
    var speedMul = 1 + heat * 0.7;
    var turb = 1 + heat * 1.2;
    renderFrame(speedMul, turb, dt);
    // filter dread flicker resolves itself
    if (filterUntil && t > filterUntil) { filterUntil = 0; applyScrim(); fx.style.opacity = "0"; }
  }

  function startLoop() {
    if (reduced) { renderStatic(); return; }
    if (running || D.hidden) return;
    running = true;
    lastT = performance.now();
    rafId = W.requestAnimationFrame(frame);
  }
  function stopLoop() {
    running = false;
    if (rafId) { W.cancelAnimationFrame(rafId); rafId = 0; }
  }

  /* ------------------------------- SCRIM ------------------------------------ */
  function applyScrim() {
    if (!scrim) return;
    var r = scrimBase[0], g = scrimBase[1], b = scrimBase[2], a = scrimBase[3];
    // warm toward ember-orange with heat
    var wr = 232, wg = 96, wb = 52;
    var k = heat * 0.55;
    r = r + (wr - r) * k; g = g + (wg - g) * k; b = b + (wb - b) * k;
    a = clamp(a + heat * 0.12, 0, 0.95);
    var tint = rgba(r, g, b, a);
    var edge = rgba(0, 0, 0, clamp(vignette, 0, 1));
    scrim.style.background =
      "radial-gradient(130% 95% at 50% 46%, rgba(0,0,0,0) 42%, " + edge + " 100%)," +
      "linear-gradient(" + tint + "," + tint + ")";
  }

  /* -------------------------------- WASH ------------------------------------ */
  function washBackground(sc) {
    var stops = (sc.grad && sc.grad.length) ? sc.grad : ["#050403", "#020101"];
    var rgb = hexToRgb(sc.accent || "#ffffff");
    var glow = "radial-gradient(120% 78% at 50% -6%," +
      rgba(rgb[0], rgb[1], rgb[2], 0.28) + " 0%," +
      rgba(rgb[0], rgb[1], rgb[2], 0.06) + " 34%,rgba(0,0,0,0) 62%)";
    var edgeGlow = "radial-gradient(90% 60% at 50% 108%," +
      rgba(rgb[0], rgb[1], rgb[2], 0.10) + " 0%,rgba(0,0,0,0) 55%)";
    var linear = "linear-gradient(180deg," + stops.join(",") + ")";
    return glow + "," + edgeGlow + "," + linear;
  }

  /* ---------------------------- IMAGE LAYER --------------------------------- */
  // Minimal 2x2 AVIF data-URI probe for one-time feature detection (decodes
  // only where AV1/AVIF is supported).
  var AVIF_PROBE = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlh" +
    "Zk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aW" +
    "YAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAA" +
    "AAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAA" +
    "AAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIA" +
    "BoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMg8f8D///8Wfhw" +
    "B8+ErK42A=";

  function detectAvif() {
    var im = new Image();
    im.onload = function () { avifSupported = (im.width > 0); flushPending(); };
    im.onerror = function () { avifSupported = false; flushPending(); };
    try { im.src = AVIF_PROBE; } catch (e) { avifSupported = false; flushPending(); }
  }
  function flushPending() {
    if (pendingImgScene) {
      var s = pendingImgScene; pendingImgScene = null;
      showImage(s);
      scheduleNextPreload(s);   // detection was pending when set() first ran
    }
  }

  function orient() { return (W.innerHeight >= W.innerWidth) ? "p" : "l"; }
  function fmtExt() { return avifSupported ? "avif" : "jpg"; }
  function stillUrl(scene) { return imgBase + scene + "-" + orient() + "." + fmtExt(); }

  function sceneFocus(scene) {
    var sc = cfg.scenes[scene];
    return (sc && sc.focus) ? sc.focus : defaultFocus;
  }

  // Crossfade the scene's still in. Gated on decode() so no half-decoded flash.
  // Any failure degrades silently (no console noise, gradient/particles remain).
  function showImage(scene) {
    if (!imgEnabled || !imgA) return;
    if (avifSupported === null) { pendingImgScene = scene; return; }
    var url = stillUrl(scene);
    var key = scene + "-" + orient() + "-" + fmtExt();
    if (key === curImgKey) return;            // already showing this exact still
    var token = ++imgToken;
    var loader = new Image();
    loader.decoding = "async";
    var done = false;
    var reveal = function () {
      if (done) return; done = true;
      if (token !== imgToken) return;         // a newer set() superseded us
      var incoming = imgTop ? imgB : imgA;
      var outgoing = imgTop ? imgA : imgB;
      incoming.onerror = function () { this.style.opacity = "0"; };
      incoming.style.objectPosition = sceneFocus(scene);
      incoming.src = url;                     // cached+decoded → no flash
      incoming.style.opacity = "1";
      outgoing.style.opacity = "0";
      imgTop = !imgTop;
      curImgKey = key;
    };
    var fail = function () { done = true; /* silent: stay Tier-1 */ };
    loader.onerror = fail;
    loader.src = url;
    if (loader.decode) {
      // decode() resolves once fully decoded, rejects on load/decode failure.
      loader.decode().then(reveal, fail);
    } else {
      loader.onload = reveal;                 // legacy fallback
    }
  }

  // Prefetch a scene's still (current orient+fmt) via a throwaway Image. Never
  // fetches beyond current + one-ahead: guarded by lastPreloaded + curImgKey.
  function prefetchStill(scene) {
    if (!imgEnabled || !scene) return;
    if (avifSupported === null) return;       // wait until format is known
    if (scene === sceneName) return;          // that's the current still
    if (scene === lastPreloaded) return;      // already prefetched
    lastPreloaded = scene;
    var im = new Image();
    im.onerror = function () {};              // swallow 404/abort silently
    im.decoding = "async";
    im.src = stillUrl(scene);
  }

  function nextScene(scene) {
    if (!scene || scene.indexOf("end-") === 0) return null;
    var i = SCENE_ORDER.indexOf(scene);
    if (i < 0 || i >= SCENE_ORDER.length - 1) return null; // unknown or era-6
    return SCENE_ORDER[i + 1];
  }

  function cancelIdle() {
    if (!idleId) return;
    if (idleIsTimeout) W.clearTimeout(idleId);
    else if (W.cancelIdleCallback) W.cancelIdleCallback(idleId);
    idleId = 0;
  }

  // After a successful set(), preload exactly the next scene, on idle. Any
  // pending (now-stale) preload from a previous scene is cancelled first, so
  // we never fetch beyond current + one-ahead.
  function scheduleNextPreload(scene) {
    cancelIdle();
    var nxt = nextScene(scene);
    if (!nxt) return;
    var run = function () { idleId = 0; prefetchStill(nxt); };
    if (W.requestIdleCallback) { idleIsTimeout = false; idleId = W.requestIdleCallback(run, { timeout: 1200 }); }
    else { idleIsTimeout = true; idleId = W.setTimeout(run, 300); }
  }

  /* ---------------------------- VIDEO LAYER --------------------------------- */
  // Device/preference gate — computed once. When false, no marquee scene ever
  // sets a video src (the still stays the top frame). Reasons: reduced-motion,
  // Save-Data / 2G, or low device memory (<4GB).
  function computeVidAllowed() {
    try {
      if (W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    } catch (e) {}
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData) return false;
      if (conn.effectiveType && /2g/.test(conn.effectiveType)) return false;
    }
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 4) return false;
    return true;
  }

  function sceneHasVideo(scene) {
    var sc = cfg.scenes[scene];
    return !!(sc && sc.video === true);
  }

  // Fade the video layer out, pause it, and drop its src so it stops
  // downloading. Leaves the still + particles as the visible frame.
  function stopVideo() {
    if (!vid) return;
    vidToken++;                    // invalidate any in-flight canplay handler
    vid.style.opacity = "0";
    try { vid.pause(); } catch (e) {}
    if (vidScene !== null) {
      try { vid.removeAttribute("src"); vid.load(); } catch (e) {}  // halt network
      vidScene = null;
    }
  }

  // For a scene, either start its loop (video:true + gate passes) or stop the
  // layer. On canplay, fade in over ~1s atop the still. .play() rejection
  // (e.g. iOS Low Power Mode) hides the layer silently.
  function updateVideo(scene) {
    if (!vid) return;
    if (vidAllowed === null) vidAllowed = computeVidAllowed();
    if (!vidAllowed || !sceneHasVideo(scene)) { stopVideo(); return; }
    if (vidScene === scene) { tryPlay(); return; }   // already loaded this scene
    var token = ++vidToken;
    vidScene = scene;
    vid.style.objectPosition = sceneFocus(scene);
    vid.style.opacity = "0";                          // stay hidden until ready
    var onReady = function () {
      vid.removeEventListener("canplay", onReady);
      if (token !== vidToken) return;                // superseded by newer set()
      tryPlay(token);
    };
    vid.addEventListener("canplay", onReady);
    try {
      vid.src = vidBase + scene + ".mp4";
      vid.load();
    } catch (e) { stopVideo(); }
  }

  function tryPlay(token) {
    if (!vid) return;
    var p;
    try { p = vid.play(); } catch (e) { vid.style.opacity = "0"; return; }
    var reveal = function () {
      if (token != null && token !== vidToken) return;
      vid.style.opacity = "1";                        // fade in over the still
    };
    if (p && typeof p.then === "function") {
      p.then(reveal, function () { vid.style.opacity = "0"; /* silent */ });
    } else {
      reveal();
    }
  }

  /* ------------------------------- PUBLIC ----------------------------------- */
  function resolveConfig() {
    var c = W.ATMOS_CONFIG;
    if (c && c.scenes && typeof c.scenes === "object") cfg = c;
    else cfg = DEFAULT;
    imgEnabled = !(c && c.images === false);
    imgBase = (c && typeof c.imgBase === "string") ? c.imgBase : "assets/img/";
    vidBase = (c && typeof c.vidBase === "string") ? c.vidBase : "assets/vid/";
  }

  function applyScene(name, immediate) {
    var sc = cfg.scenes[name];
    if (!sc) return false;               // unknown → keep current
    sceneName = name;
    cur = sc;
    preset = PRESET_ID[sc.preset] != null ? PRESET_ID[sc.preset] : P_DRIFT;
    accent = sc.accent || "#ffffff";
    accentRGB = hexToRgb(accent);
    curSprite = getSprite(accent);
    scrimBase = parseRgba(sc.scrim || "rgba(6,5,3,0.5)");
    vignette = sc.vignette == null ? 0.82 : sc.vignette;
    recount();

    // crossfade wash via A/B swap
    var incoming = washTop ? washB : washA;
    var outgoing = washTop ? washA : washB;
    incoming.style.background = washBackground(sc);
    if (immediate) {
      incoming.style.transition = "none";
      outgoing.style.transition = "none";
    }
    incoming.style.opacity = "1";
    outgoing.style.opacity = "0";
    if (immediate) {
      // force reflow then restore transitions
      void incoming.offsetWidth;
      incoming.style.transition = "opacity 1.2s ease";
      outgoing.style.transition = "opacity 1.2s ease";
    }
    washTop = !washTop;

    applyScrim();
    seedAll(true);
    if (reduced) renderStatic();

    // Tier-2 still: crossfade in, then preload exactly one scene ahead.
    showImage(name);
    scheduleNextPreload(name);
    // Tier-3 video loop: start on marquee scenes (gated), else stop the layer.
    updateVideo(name);
    return true;
  }

  var Atmos = {
    init: function (opts) {
      if (inited) return Atmos;
      opts = opts || {};
      resolveConfig();
      reduced = false;
      try {
        reduced = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (e) { reduced = false; }

      buildLayers();
      if (imgEnabled && avifSupported === null) detectAvif();
      resize();
      applyScene(opts.scene || "title", true);

      // listeners
      W.addEventListener("resize", onResize, false);
      D.addEventListener("visibilitychange", onVisibility, false);

      inited = true;
      if (!reduced) startLoop(); else renderStatic();
      return Atmos;
    },

    set: function (scene) {
      if (!inited) return Atmos;
      applyScene(scene, false);
      return Atmos;
    },

    mood: function (obj) {
      if (!inited || !obj) return Atmos;
      if (typeof obj.heat === "number") {
        heat = clamp(obj.heat, 0, 1);
        applyScrim();
        if (reduced) renderStatic();
      }
      return Atmos;
    },

    pulse: function (kind) {
      if (!inited) return Atmos;
      if (kind === "lapse") {
        var cx = W_px / 2, cy = H_px / 2;
        for (var i = 0; i < LAPSE_N; i++) {
          var l = lapse[i];
          var ang = (i / LAPSE_N) * Math.PI * 2 + rand(-0.3, 0.3);
          var sp = rand(900, 1500) * dpr;
          l.x = cx + Math.cos(ang) * rand(0, 30);
          l.y = cy + Math.sin(ang) * rand(0, 30);
          l.vx = Math.cos(ang) * sp;
          l.vy = Math.sin(ang) * sp;
          l.life = 0;
          l.max = rand(0.35, 0.6);
          l.on = true;
        }
        // brief brightening for reduced-motion users too
        if (reduced) {
          fx.style.background =
            "radial-gradient(60% 40% at 50% 50%," +
            rgba(accentRGB[0], accentRGB[1], accentRGB[2], 0.25) + " 0%,rgba(0,0,0,0) 70%)";
          fx.style.opacity = "1";
          W.setTimeout(function () { fx.style.opacity = "0"; }, 220);
        }
      } else if (kind === "filter") {
        // short dread flicker/desaturate of the scrim
        var self = this;
        var flick = function (n) {
          if (n <= 0) { applyScrim(); fx.style.opacity = "0"; return; }
          fx.style.background = "linear-gradient(rgba(20,4,4,0.5),rgba(4,2,6,0.5))";
          fx.style.opacity = (n % 2 === 0) ? "0.85" : "0.25";
          W.setTimeout(function () { flick(n - 1); }, 90);
        };
        filterUntil = performance.now() + 700;
        flick(6);
      }
      return Atmos;
    },

    preload: function (scene) {
      // Prefetch this scene's still (current orient+fmt) via a throwaway
      // Image(). Guards keep total fetches to current + at most one ahead.
      if (inited && scene) prefetchStill(scene);
      return Atmos;
    },

    pause: function () { if (inited) stopLoop(); return Atmos; },
    resume: function () { if (inited) startLoop(); return Atmos; },

    destroy: function () {
      stopLoop();
      W.removeEventListener("resize", onResize, false);
      D.removeEventListener("visibilitychange", onVisibility, false);
      if (W.clearTimeout) W.clearTimeout(resizeTimer);
      cancelIdle();
      stopVideo();
      if (root) { while (root.firstChild) root.removeChild(root.firstChild); }
      inited = false;
      imgToken++; curImgKey = ""; pendingImgScene = null; lastPreloaded = null;
      vidToken++; vidScene = null;
      root = washA = washB = imgA = imgB = vid = canvas = ctx = scrim = fx = null;
      return Atmos;
    }
  };

  /* ----------------------------- LISTENERS ---------------------------------- */
  function onResize() {
    if (resizeTimer) W.clearTimeout(resizeTimer);
    resizeTimer = W.setTimeout(function () {
      resizeTimer = 0;
      if (inited) resize();
    }, 160);
  }
  function onVisibility() {
    if (!inited) return;
    if (D.hidden) {
      stopLoop();
      if (vid && vidScene) { try { vid.pause(); } catch (e) {} }  // pause the loop
    } else {
      startLoop();
      // resume video only if the current scene actually has a running loop
      if (vid && vidScene && vidScene === sceneName) tryPlay(vidToken);
    }
  }

  W.Atmos = Atmos;
})();
