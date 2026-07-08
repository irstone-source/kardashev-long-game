# KARDASHEV: The Long Game

A playable argument about superintelligence and coexistence. Single self-contained HTML file — no build, no dependencies, mobile-first, dark-native.

**Thesis:** the best arguments for AI–human coexistence don't require machines to care, only to be rational under uncertainty. The game encodes this as physics: four dials (POWER, INSIGHT, ACCORD, PLURALITY) that kill at **both** ends. Redline POWER and you become the optimizer everyone feared. Redline ACCORD and you dissolve into hollow coexistence. Survival is the corridor.

**▶ Play it live:** https://irstone-source.github.io/kardashev-long-game/

## v4 — "THE WITNESS"

v4 keeps the v3 corridor engine byte-for-byte and layers two things on top of it:

- **The Elder's Record (story).** A Type V Record-Keeper narrates your whole run as a file on its shelf. Your civilization has a *name* (Mara Voss, Soren, or Wren by origin); each age opens as a cinematic scene that tells you what the age *is* before any numbers appear; the Elder glosses your gravest choices, closes the record when you die, and eulogizes you by name when you don't. The Herald in the Intergalactic Age is revealed to be the Elder you've been dictating to since 2049.
- **The atmosphere engine (`assets/atmos.js`).** A reusable, zero-dependency, config-driven background stack: full-viewport Higgsfield stills that crossfade per scene, a pooled particle system with six presets, and mood tinting driven by game state (HEAT warms the scrim). It degrades gracefully — no file → the v3 game; JS only → gradients + particles; + stills → cinematic imagery. **New games are new config, same engine.**

Single-file purity is relaxed to `index.html` + `assets/` (no build step; still plays from `file://` with graceful fallback if `assets/` is missing).

## Play
Open `index.html`. That's it.

## Deploy on GitHub Pages
```
git remote add origin git@github.com:YOUR_USER/kardashev-long-game.git
git push -u origin main
```
Then: repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save.
Live at `https://YOUR_USER.github.io/kardashev-long-game/` within a minute.

## Design lineage
- **Reigns** — the corridor: every dial fatal at 0 and 100
- **Slay the Spire** — legible stakes: exams public, odds shown, deaths explained
- **Universal Paperclips** — the time-lapse number-whir; and the positioning: Paperclips made the doom argument playable in 2017, this is the counter-argument
- **King of Dragon Pass** — event-oracle narrative structure

## The knife-edge principle (v3)
Near decisions cast thousand-year shadows, and perspective only corrects as you approach the edge. Mechanically: your 2049 choice about the First Mind is quoted back verbatim by a Type V Elder two billion years later; ECHO chips mark the moments when old choices re-enter the room; the time-lapse makes you watch the years your decision just spent.

## Simulation lab (engine-verified, 1,000 runs/policy)
| Policy | Survive | Transcend | Avg ages (of 7) |
|---|---|---|---|
| POWER REDLINE | 0% | 0% | 0.9 |
| HARMONY REDLINE | 0% | 0% | 1.6 |
| THE BALANCER | 73% | 12% | 4.5 |
| THE GARDENER (balance+grace+reach) | 57% | 18% | 4.8 |
| PURE CHANCE | 22% | 1% | 2.9 |

Honesty clause: these numbers prove the model, not the universe.

## Versions
- `versions/v1-cyoa.html` — stat-check CYOA prototype
- `versions/v2-corridor.html` — corridor engine, public exams
- `versions/v3-timelapse.html` — time-lapse, plain-English dials, forensic deaths
- **v4 "THE WITNESS"** — story + atmosphere layer; the live `index.html` + `assets/`. v4 is multi-file, so the `versions/` archive stops at v3; v4 is tagged in git as `v4.0`.
