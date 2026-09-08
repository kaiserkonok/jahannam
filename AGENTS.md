# AGENTS.md — jahannam

Browser horror game (Three.js + Vite + TS). You walk 7 depths of Hell; goal is
dread + reminder, not winning. Live at https://github.com/kaiserkonok/jahannam (public).

## Commands

- `npm run dev` — playtest at http://localhost:5173 (always verify in a real tab, not an iframe: pointer-lock is blocked in frames)
- `npm run build` — this IS the verification (`tsc && vite build`). No tests, no lint. Build must pass before commit.
- No preview/prod deploy step in repo.

## Gotcha: `tsconfig.json` must keep `"noEmit": true`

The build script runs bare `tsc`. Without `noEmit`, tsc emits a stray `src/main.js`
next to the source that pollutes the tree and confuses Vite. If you ever see
`src/*.js`, delete it — do not import it.

## Architecture (single-file game)

- All game code: `src/main.ts` (~1700 lines, no modules). HUD DOM: `index.html`. Styles: `src/style.css`.
- Look: custom hover-look via `yaw`/`pitch` globals + `applyLook()`. Do NOT reintroduce
  `PointerLockControls` (removed deliberately: hardcoded slow sensitivity).
- Hard-won camera rules (user-rejected, do not regress): horizon roll stays 0,
  no per-frame random positional shake, no look clamps/blocks, no smoothing lag —
  mouse maps 1:1. Sensitivity slider + `[` `]` keys already exist; tune, don't redesign.
- Zones: `setZone(i)` swaps fog/sky/ground and toggles `zoneProps[i]` / `zoneFigs[i]`
  visibility. Punishment stations only trigger for the current `zoneIdx`.
- `descend()` has a `descending` flag + `phase` guard — double-fire skips a depth. Keep it.
- Audio: `actx` is null until ENTER is clicked (autoplay policy) — guard everything.
  All suffering audio is procedural WebAudio; the speaking voice is guarded
  SpeechSynthesis (`speak()` cancels previous; Chrome needs the prior click gesture).
- Touch must keep working: left-half stick moves, right-half drag looks (`pointer: coarse` CSS).

## Content rules (non-negotiable)

- Figures are whole-black featureless silhouettes (`makeShade`) — never add faces,
  eyes, or realistic human likeness (religious constraint).
- Punishments must stay grounded in Quran/Hadith with a shown reference; keep them
  symbolic — dread through sound/darkness/scale, never gore detail.
- The end screen's call to repent is the point of the game. Don't remove it.

## Workflow

- Commit each coherent change separately and push to `origin/main` (`git add -A`,
  concise message, `git push`). Working tree should not sit dirty.
