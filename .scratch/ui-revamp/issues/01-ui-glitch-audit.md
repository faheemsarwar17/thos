# Audit current UI glitches across screens and viewports

Type: task
Mode: AFK
Status: resolved
Blocked by: —

## Question

What exactly overlaps, clips, overflows or misbehaves today? Run backend + frontend with demo data, sign in as employer (ayesha.khan@nut.edu.pk) and candidate (hira.ahmed@gmail.com), visit every route in the feature inventory at 1280×620, 1366×768, 1536×730, 1920×1080 and 390×844 in light and dark, and log each defect (route, viewport, theme, symptom, likely CSS cause) to `.scratch/ui-revamp/assets/glitch-log.md` with screenshots in `assets/before/`. The log becomes the PRD's "must not regress / must fix" list and the before-baseline for the Playwright screenshots.

## Answer

Done — 270 captures, 0 load errors. Full log: [glitch-log.md](../assets/glitch-log.md); screenshots + `report.json` in `assets/before/`.

17 systemic defects. Worst: (G1) topbar overflows on mobile → every page scrolls sideways at 390; (G6) Messages hides the conversation/composer on mobile; (G7/G8/G9) register-org, candidate jobs and home requisitions clip controls at 390; (G2) sidebar footer clipped at 1280×620; (G3/G4) pipeline column titles truncated and score pills escaping cards; (G11) analytics shows fabricated fallback numbers; (G12) admin hash tabs don't respond to hash changes. Seven "must-hold" acceptance rules extracted for the PRD.
