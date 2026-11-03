# SPEC: Merge Game (Suika-style)

A browser game where you drop items into a box. Two identical items that touch merge into the next bigger item. The owner is learning JavaScript, so code must be simple, with short comments.

## 1. Tech

- Plain HTML / CSS / JavaScript. No build tools, no npm packages in the game.
- Library from CDN, pinned version (loaded in `index.html` before our scripts):
  - Matter.js 0.20.0: `https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.20.0/matter.min.js`
  - poly-decomp is **not** used any more: every collision shape is one convex body (see §4).
- Must run on VS Code Live Server and on GitHub Pages. Use **relative paths only** (no leading `/`).
- Tests: Node built-in runner (`node --test`), no dependencies.

## 2. Files

| File | Role |
|---|---|
| `index.html` | Page, canvas, UI elements, script tags (`config.js` → `logic.js` → `main.js`) |
| `style.css` | Layout, scaling, no-scroll |
| `config.js` | **All tunable data**: item list, sizes, scores, sounds, world size. Global `CONFIG`; also `module.exports` for tests |
| `logic.js` | **Pure game logic**, no DOM, no Matter.js: merge rules, score, game-over timing, high-score parsing. Global `GameLogic`; also `module.exports` |
| `main.js` | Everything that touches the DOM / Matter.js / audio: physics, input, drawing, UI, shape tracing |
| `tests/*.test.js` | Node tests for `logic.js` and `config.js` |
| `assets/candidates/` | Original candidate images (never delete) |
| `assets/fruits/` | The 11 chosen images: `01.png` … `11.png` (originals) and `01.webp` … `11.webp` (what the game loads: 2.1 MB → 272 KB, same size and hitboxes, made with Chrome's WebP encoder at quality 0.86) |
| `assets/sounds/` | `drop.wav`, `merge.wav`, `gameover.wav`, `bgm.wav` (made by `tools/make-sounds.js`) |
| `manifest.webmanifest` | App name, icons, colors: lets phones install the game (PWA) |
| `sw.js` | Service worker: keeps copies of the game files so it opens offline ("network first": online always gets fresh files) |
| `assets/icons/` | App icons (192, 512, 180 for iPhone), made by `tools/make-icons.js` |
| `tools/make-icons.js` | Draws the app icons (sleeping Mokumoku on the sky) as PNG, no libraries |
| `tools/ranking-apps-script.gs` | Online ranking server code to paste into a NEW Google Spreadsheet (setup steps inside). Not part of the game |
| `tools/make-sounds.js` | Makes the four sounds from scratch (no libraries): `node tools/make-sounds.js`. Edit its numbers to change the sounds |

Rule: when a new piece of logic can be written without the DOM or Matter.js, put it in `logic.js` and add a test.

## 3. Items (config.js)

- 11 types, index 0 (smallest) … 10 (largest), defined **only** in `CONFIG.fruits`. Each entry: `{ file, ratio, score, color }`.
  - `ratio`: how big the item **looks**, as a part of the game width (`0.5` = half the width): the visible part of the image (alpha > threshold, not the empty background) gets the same area as a circle with this diameter. So a thin pose is drawn longer and a chunky pose shorter, and every type looks bigger than the one before. (It used to be the longest side; then e.g. a thin type 4 looked smaller than a chunky type 3.)
  - `size` (computed in `config.js`, not written by hand) = `width × ratio × SIZE_SCALE`, in game units. The rest of the game only uses `size`.
  - `SIZE_SCALE` (global in `config.js`, default `1.0`) makes every item bigger or smaller at once.
  - Visible size: smallest ≈ 1/10 of the width, largest ≈ 1/2, each type 1.175× the previous one (smooth, no jumps).
  - Current values (`SIZE_SCALE = 1.0`, width 400): ratio 0.100 / 0.117 / 0.138 / 0.162 / 0.190 / 0.224 / 0.263 / 0.309 / 0.362 / 0.426 / 0.500 → size 40 / 47 / 55 / 65 / 76 / 90 / 105 / 124 / 145 / 170 / 200. Drawn longest sides (current images): 63 / 89 / 79 / 80 / 144 / 164 / 181 / 208 / 242 / 353 / 284; every hull fits the 400-wide box.
  - The image's drawn longest side (`longSide`) and the hitbox both come from `GameLogic.buildOutline` (`visibleScale`). Before an image is traced it is drawn (and its circle sized) with longest side / diameter = `size`.
  - `dropY` (68) leaves room for the tallest drop type while it waits. The waiting item is clamped by its hull's real left/right edges.
  - `score`: points for creating this type by a merge.
  - `color`: placeholder circle color.
- Swapping an image must only require editing `file` in `config.js`.
- Until an image has loaded (or if it fails), draw a colored circle with diameter `size` (the same area as the item's visible part).

### Chosen images (approved 2026-11-03)

Originals are in `assets/candidates/`. They were copied to `assets/fruits/`, cropped to their visible pixels and resized to at most 520 px (originals untouched).

| Type | File | Source | Pose |
|---|---|---|---|
| 0 | `01.png` | `俺のゲーム12.png` | bent sideways, peace signs |
| 1 | `02.png` | `新俺のゲーム１１.png` | kneeling bow |
| 2 | `03.png` | `俺のゲーム４.png` | squat, hands up |
| 3 | `04.png` | `俺のゲーム10.png` | bent over, hands to floor |
| 4 | `05.png` | `俺のゲーム８.png` | hunched, sunglasses |
| 5 | `06.png` | `俺のゲーム６.png` | knees together |
| 6 | `07.png` | `俺のゲーム３.png` | jacket, hands clasped |
| 7 | `08.png` | `新俺のゲーム８.png` | wide squat, arms out |
| 8 | `09.png` | `新俺のゲーム３.png` | lunge |
| 9 | `10.png` | `俺のゲーム9.png` | one-leg balance |
| 10 | `11.png` | `新俺のゲーム６.png` | two people holding hands |

Rejected on purpose: poses with thin protrusions (sword, flag, sticks, gun, box stack) and tall/flat poses. They make spiky shapes that snag or wobble. Each `InShot_*` file is a duplicate of a `新俺のゲーム*` file.

## 4. Collision shapes

- Use a **simple outline**: the convex hull of each PNG's alpha outline, not the exact (dented) shape and not a circle:
  1. Draw the image on an offscreen canvas at a small resolution (about 100 px on the long side).
  2. Make an alpha mask (alpha > threshold). Dilate it by 1 cell.
  3. Keep the largest connected blob and trace its outer contour (Moore-neighbour tracing).
  4. Take the **convex hull** of the contour (`GameLogic.convexHull`).
  5. If it has more than 20 vertices, simplify with Ramer–Douglas–Peucker until it has ≤ 20 (a subset of hull corners stays convex). The current images give 11–16 vertices.
  6. Scale so the image's visible part has the area of a circle of diameter `size` (`GameLogic.visibleScale`), and build **one convex body** with `Matter.Body.create({ position, vertices })`. No compound bodies, no poly-decomp parts.
- Why: the exact outlines were cut into about 13 convex parts per item, and those compound bodies never came to rest (a single one crept about 124 units in 10 s on a flat floor). One convex body per item rests still.
- The sprite is aligned to the body's **centre of mass**: the outline's vertices are centred on their centroid, and the image is drawn at the stored `imageOffset` from the body position (rotated with the body).
- Compute the outline **once per image** and cache it, together with `imageOffset`.
- If tracing or body creation fails, use `Bodies.circle` and `console.warn` the file name.
- Debug: press **D** (or open with `?debug` in the URL) to draw every hitbox outline and its centre of mass over the images.

## 5. Game rules

1. The next item waits at the top. Move it left/right with mouse or touch. Release (or click) drops it. It is clamped inside the walls. There is a short cooldown between drops (`dropCooldown`).
2. Dropped types are random among the first `CONFIG.dropTypes` (= 5) types (`GameLogic.randomDropType`).
3. Two touching items of the same type merge into the next type at the contact point (`resolveMerge`, `contactPoint`). Each item merges at most once per step (`pickMergePairs`). Score += the new type's `score`.
4. Two of the largest type both disappear. Score += `CONFIG.bonusScore`.
5. If any item's top stays above `CONFIG.dangerLineY` for `CONFIG.gameOverSeconds` (2 s) in a row, it is game over (`updateDangerTimers`, timers per item, reset when the item goes below the line). The item still waiting at the top is not in the world, so it does not count. On game over, physics stops and a panel shows GAME OVER, the final score, **NEW BEST!** if the score beat the best from before this game (`GameLogic.isNewBest`), and a **Retry** button. Retry clears the world and the score. There is **no time limit**: a 60 s time attack was tried and removed because it turned the game into tap-mashing.

## 6. UI and features

- Score, high score and NEXT preview (the item after the current one).
- High score saved in `localStorage` under `mergeGameHighScore`. Every read and write is wrapped in try/catch, and the game must work when storage is blocked. Parse with `GameLogic.parseHighScore`.
- Sound effects (drop, merge, game over) and looping BGM (an original, cozy and bouncy Western-style tune: a clear, high flute lead (about G5 to B6) over marimba chords and a round oom-pah bass; key of C with E7/D7/G7 chords, about 107 bpm, 16 bars = 35.84 s, seamless loop. An earlier flute version with plucked strings and pentatonic-like lines sounded too Japanese) from `assets/sounds/` (WAV, original sounds made by `tools/make-sounds.js`). A sound set to `null` in `CONFIG.sounds` is skipped and never requested. A mute button toggles all audio, and the mute state is remembered in localStorage (try/catch).
- Audio starts only after the first user tap or click (mobile autoplay rule). Missing sound files must not break the game.
- Works on PC and phone (portrait). The game area keeps a fixed aspect ratio (`width:height` = 400:600) and scales to fit the screen with the UI included. Canvas is sharp on high-DPI screens.
- No page scrolling, zoom or text selection while playing (`touch-action: none`, `overflow: hidden`, viewport meta).
- Physics steps at a fixed 60 Hz, so the game speed is the same on 120 Hz screens.
- Items fall softly ("fuwa"): `CONFIG.physics` sets gravity 0.6 (Matter.js normal = 1), air friction 0.02, bounce (restitution) 0.3, friction 0.5. A drop takes about 1.7 s to reach the floor (about 1.1 s with normal gravity). Bigger bounce values barely change convex-hull bodies (they land on a corner and roll), so softness comes from gravity and air friction.
- Resting items must stay still (no visible jitter). Sleeping (`enableSleeping`) is **off** on purpose: a sleeping item would stay floating when the item under it merges away.

### Look and feel: "a glass jar floating in a soft evening sky" (visual only — never changes logic, physics, scoring or hitboxes)
- Original design (not based on any existing game). The 11 character images are the stars.
- Theme: CSS variables in `style.css` `:root`: sky gradient pale blue (top) → soft peach (bottom), accents warm cream and soft lavender, soft indigo text. Font: **M PLUS Rounded 1c** from Google Fonts (500 and 800; has Japanese) on every screen. Google Fonts is the only outside resource besides Matter.js. No image files for UI or the mascot.
- Background (`#sky` canvas, full screen, behind everything): 5 faint clouds drifting very slowly and 28 tiny twinkling stars (`GameLogic.driftX`, `twinkle`). During play, clouds are kept **outside the jar body** (clipped). Drawn at 1× resolution and about 30 fps to stay light.
- Glass jar: drawn only from the danger line down (`#jar-back` behind the characters: glass body; `#jar-front` in front: glass edges, a light reflection line and a thin cream rim; both ignore taps). Its **mouth is the danger line**, so the space above it is open sky and a full jar visibly overflows. While something sticks out above the mouth, the rim glows pink (`#jar-front.danger`). The play area keeps small corners so items in a corner are never hidden (the walls are straight). Walls and hitboxes unchanged.
- Layout (little empty space on any screen): `resize()` works out two arrangements and uses the one with the bigger jar. **"top"** (tall screens, phones): top bar (SCORE, BEST, pause, sound), then a row with the NEXT box and the evolution circle, then the jar at full width (390×844 phone: play area 368 px wide, 91% of the height used). **"side"** (wide screens, PC/tablet): no top bar; a right column holds SCORE, BEST, pause + sound, NEXT and a big evolution circle, and grows with the free width (124–240 units), so the jar is taller (1280×720: 434 px). Checked at 9 screen sizes from 300×400 to 1600×500: nothing overlaps, nothing scrolls, the 400:600 play area is kept.
- **Mokumoku** (original mascot, Canvas only, `drawMokumoku`): a fluffy, sleepy cloud with half-closed eyes and pink cheeks, drawn on the `#fx` layer over the game box (ignores taps). It glides to the drop position (`GameLogic.follow`, frame-rate independent), sits just above the waiting item so it looks like it is holding it, bobs gently (`mascotBob`), and opens its eyes in surprise for 0.6 s after a merge (`mascotFace`). Faces: sleepy, surprised, sleeping (title), sad (game over).
- HUD: SCORE / BEST and the mute button are rounded cream cards with soft lavender shadows. NEXT is its own cream box beside the jar.
- Evolution circle (`#ring` canvas, under the NEXT box): all 11 characters around a circle from the top, clockwise (`GameLogic.ringPositions`), with tiny lavender arrows and "しんか" in the middle. Redrawn only when an image loads or the size changes.
- **Home screen** (`#home`): its own full screen, shown first; no in-game score or NEXT on it. Logo **かじーの合体大合戦**, a **showcase** (sleeping Mokumoku with all 11 characters slowly circling it, nearer ones bigger; still when background motion is off), the **BEST** score, a wide **Tap to Start** button (only this button starts the game), a 2×2 menu (**遊び方**, **ランキング**, **図鑑**, **設定**) and a round sound button in the top-right corner. Sizes follow both the screen width and height (`clamp(10px, min(5.2vw, 2.4vh), 30px)`), so tall phones are filled (about 80% of the height); wide screens use two columns (showcase left; logo, best, Start and menu right).
- **Mokumoku talks** (home screen): tapping the showcase makes Mokumoku hop, open its eyes in surprise (0.45 s), then talk (round eyes, mouth opening and closing) with a speech bubble above its head for 3 s, then fall asleep again. Lines come from `CONFIG.mokumokuLines` (`{best}` is replaced with the best score, `GameLogic.fillLine`); a line is never repeated twice in a row (`pickLine`); 5 taps within 3 s say a line from `CONFIG.mokumokuTickleLines` instead (`isTickled`). Each tap plays the tap sound.
- Home menu panel (`#panel`, one pop-up, one section at a time; closes with とじる or a tap outside the card):
  - 遊び方: four short lines about dropping, merging, the largest pair vanishing, and overflowing for 2 s.
  - ランキング: top 10 from the online ranking (`CONFIG.rankingUrl`); "ランキングは準備中です" while the URL is empty, "通信できませんでした" on errors (8 s timeout).
  - 図鑑 (character book): 11 boxes; characters seen on this device show their picture and number, the rest a pale shadow with "？？？" and an "n / 11" count.
  - 設定: BGM volume and sound-effect volume (sliders 0–100, `GameLogic.parseVolume`; the BGM also stays at 0.4 of the effects' level), and background motion on/off (`parseOnOff`; when off, the sky is frozen and only redrawn when something changes). All saved in localStorage (try/catch).
- Sound uses the **Web Audio API**: each file is downloaded and decoded once, then played from memory (many copies can overlap). Playing `<audio>` elements again and again made the browser fetch the files again through the service worker, which caused stutter (p95 frame 35 ms → 17 ms on a 4× slowed CPU after the change). BGM loops through a gain knob (0 when muted, 0.4 × BGM volume otherwise); all sound is suspended while the page is hidden.
- Audio starts on `pointerup` (finger lifted): phone browsers only allow sound after the finger is lifted. If the BGM was blocked, the next tap tries again (only when it is not already playing, and never when muted).
- Merge effect: the new item is drawn with a short "boing" (`popScale`) and a few soft sparkles (yellow, lavender, pink; at most 60). Drawing only.
- Game over: a see-through soft-indigo overlay with a cream card: GAME OVER, sad Mokumoku, final score, NEW BEST! (only when beaten), BEST and a round lavender **Retry** button.

### Full-game features
- **Pause** (⏸ in the top bar, or Esc on PC): "ひとやすみ" card with つづける / やりなおす / ホームへ; the last two ask "はい / いいえ" first. Physics and drops stop while paused. Switching to another app or tab **pauses automatically**.
- Game over card: score (counts up from 0, `GameLogic.countUpValue`), NEW BEST!, BEST, Retry, **シェア** (phone share menu; elsewhere the text + URL are copied), **ホームへ**, and the ranking form when `rankingUrl` is set (name, "名前はランキングで公開されます", send once; shows the place or an error and lets the player retry).
- **Title call** (`#splash`): after the loading screen, the company name **がんばりピース** with "presents" fades in for about 2 s (a tap goes on sooner), then the home screen — or, the very first time, the tutorial. Only when the game is opened, not when going back home. The home screen shows "© 2026 がんばりピース" at the bottom.
- **Loading screen**: sleepy Mokumoku, "よみこみ中…" and a progress bar until all 11 pictures (loaded or failed) and the font are ready; closes anyway after 20 s.
- **Tutorial, explained by Mokumoku** (replaces the old first-time hints): **the first time the game is opened it starts right after the loading screen, without the home screen and without a skip button** (everyone does it once; leaving in the middle means it starts again next time; saved as `mergeGameTutorialDone` when finished). It can be replayed from 遊び方 → 「もくもくに教えてもらう」, and replays can be skipped. Steps live in `CONFIG.tutorialSteps` (`text`, `wait`: 'tap' / 'drop' / 'merge', optional `highlight`: 'next' / 'ring' / 'rim'); `GameLogic.tutorialNext` moves on only for the awaited event. Mokumoku talks (moving mouth) with a speech bubble that follows it just under the jar's mouth; on 'tap' steps a tap goes on and never drops; on drop/merge steps the bubble lets taps through. The NEXT box, the evolution circle or the rim glows while it is explained. During the tutorial only the smallest character drops (easy first merge), there is no game over, and points do not change the high score. A スキップ button ends it; finishing or skipping starts a normal game on an empty jar.
- **Score pop-ups**: "+points" rises from each merge; a character made for the first time ever also shows a pink "NEW!" (`GameLogic.updatePopups`). Seen characters are saved as text like "11100000000" (`parseSeen` / `seenToText`); dropped characters count as seen too.
- **Online ranking — everyone takes part**: each device gets a player id (`GameLogic.makePlayerId`, saved as `mergeGamePlayerId`). The name is asked once and cannot be skipped: right after the tutorial (Mokumoku asks: 「ランキングに参加するモク！」, with 「名前とスコアは、ランキングで公開されます」), or at the next game over for players without a name. Every game-over score is sent automatically (no button; 0 points are not sent); the card shows 「ランキング n 位！」. A score that could not be sent is kept (`mergeGameRankPending`) and resent when the game opens. The ranking panel marks the player's own row and shows 「あなたは N 人中 n 位」; the name can be changed in 設定. Server: `tools/ranking-apps-script.gs` (v2) keeps one row per player id with the best score (GET `?id=` → `{ ok, top: [{ name, score, mine }], rank, players }`; POST text/plain `{ id, name, score }` → same; bad ids, empty names and bad scores are refused; names starting with = + - @ are stored as plain text; a lock keeps simultaneous posts safe). Names are shown with textContent only. Anyone with the URL could post a fake score; acceptable for friends; a rude name can be removed by deleting its row.
- **Install as an app (PWA)**: manifest (かじーの合体大合戦, standalone, portrait, icons), iPhone meta tags and touch icon, theme color, OGP title/description. `sw.js` caches the app files; checked: after one visit the game opens and plays with the network off. Service workers only run on https (GitHub Pages) or localhost.
- **Phones**: `viewport-fit=cover` + safe-area padding (notch, home bar), and `resize()` subtracts that padding. Merge vibration (Android only; on/off in 設定, default on). Long-press menus are blocked except in text inputs.
- **Feel**: every button shrinks slightly when pressed and plays a soft tap sound (`tap.wav`); the home and game screens fade in; settings show "ver 1.0".

## Publishing (GitHub Pages)
- Live: **https://akionlywork-dot.github.io/kajii-game/** — repository `akionlywork-dot/kajii-game` (public), Pages from `main` / root.
- Not uploaded (`.gitignore`): `assets/candidates/` (kept on the computer only) and `.claude/` (local settings with this computer's paths).
- To update the site: run `node --test`, then `git add -A`, `git commit -m "..."`, `git push`. Pages rebuilds in about a minute. The service worker is network-first, so players get the new files when online; bump `VERSION` in `sw.js` to drop old offline copies.
- Checked on the live site: loads with no console errors and no failed requests, installable as an app (no installability errors), opens and plays offline after one visit.

## 7. Build order

Do one step at a time. After each step, tell the owner what to check in the browser.

1. Placeholder circles, move + drop ✅ (done)
2. Merge logic + score (using `logic.js`) ✅
3. Images + traced collision shapes ✅
4. UI: score, high score, NEXT, danger line, game over + Retry ✅
5. Sound + mute ✅
6. Mobile polish (scaling with UI, touch, no scroll) ✅

## 8. Acceptance criteria

- [x] `node --test` passes with 0 failures.
- [x] Opens with Live Server with no console errors; all paths are relative (works on GitHub Pages).
- [x] Matter.js is loaded from the CDN with a pinned version; no build step.
- [x] Exactly 11 types are defined only in `config.js`; changing a `file` there swaps the image with no other edits.
- [x] Colored circles are shown when images are missing or still loading.
- [x] Collision shapes are one convex hull per image, ≤ 20 vertices, lined up with the image at the centre of mass (check with the D debug toggle). Tracing runs once per image. A failed shape falls back to a circle with a `console.warn`.
- [x] Stacked items stay still for 10 seconds (no jitter).
- [x] Item sizes come from `ratio × width × SIZE_SCALE`: the visible size (equal-area circle) goes from ≈ 1/10 to ≈ 1/2 of the width in smooth steps, and each type looks bigger than the one before.
- [x] The next item follows the mouse and touch, stays inside the walls, and drops on release/click.
- [x] Only the 5 smallest types are ever dropped.
- [x] Two identical items merge into the next type at the contact point; an item never merges twice at once.
- [x] Two of the largest type vanish and add the bonus score.
- [x] Score increases by the new type's score on each merge.
- [x] The high score survives a page reload, and the game still works in private mode / with storage blocked.
- [x] The NEXT preview shows the correct upcoming item.
- [x] Game over happens only after an item stays above the top line for 2 s; briefly passing the line does not trigger it.
- [x] The Retry button resets the board and score; the high score is kept. The game-over panel shows the final score and NEW BEST! only when the best was beaten.
- [x] Drop / merge / game-over sounds and looping BGM play; mute silences everything and is remembered.
- [x] No audio plays before the first tap; missing sound files cause no errors.
- [x] On a phone in portrait: the whole game is visible, the aspect ratio is fixed, the page does not scroll or zoom while playing, and touch controls work. _(owner tested on a real phone 2026-11-03; only feedback was item sizes, now changed)_
- [x] On PC: resizing the window keeps the aspect ratio and the game stays playable.
- [x] Visuals ("glass jar in an evening sky"): sky-color CSS variables and rounded font; separate home screen without score/NEXT (sleeping Mokumoku, Tap to Start, BGM on the first tap); jar drawn from the danger line down so the top is open and a full jar overflows, rim glows pink in danger; clouds stay outside the jar; NEXT box and evolution circle beside the jar, never overlapping the play area; Mokumoku follows the drop position, holds the waiting item, bobs, and looks surprised on merges; merge boing + soft sparkles; game-over card with sad Mokumoku, score, high score and Retry; hitboxes unchanged; 60 fps on a 4× slowed CPU.
- [x] Pause menu (also automatic when the app is hidden), confirmations before ending a game, and "ホームへ" from pause and game over.
- [x] Loading screen until all pictures and the font are ready; first-time hints shown only once.
- [x] "+points" and "NEW!" pop-ups; character book with seen/unseen characters, saved on the device.
- [x] Everyone takes part in the online ranking: name asked once (cannot skip, empty names refused), scores sent automatically at game over, one row per player with the best score, unsent scores resent on the next open, own row and place shown, name changeable in settings — checked against a test server with the same rules as the v2 script.
- [x] Installable and playable offline (manifest without errors, service worker caches the game, offline reload plays); share button; merge vibration on Android.
- [x] 60 fps on a 4× slowed CPU for a whole game, with the service worker active (p95 frame 16.8 ms).
- [x] Tapping Mokumoku on the home screen shows a speech bubble with a random line (no repeats in a row, best score filled in, tickle lines after quick taps); the bubble stays on screen on phones (both ways) and PC.
- [x] Tutorial: Mokumoku explains step by step (talk, drop, merge, NEXT, evolution circle, overflow, bonus) with glowing highlights; taps on talk steps never drop; no game over and no high score during it; forced on the first open (straight after loading, no skip), replayable and skippable from 遊び方.
- [x] Title call with the company name がんばりピース after loading (about 2 s, tap to go on; only on opening), and the © line on the home screen, on every screen size.
- [x] Code is simple, commented, and pure logic lives in `logic.js` with tests.
- [x] No file in `assets/` was deleted.
