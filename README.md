# Dash Duel

A 2-player couch racing platformer. Race through an endless, randomly generated
neon city. The camera follows whoever is in front. Fall off the left edge of the
screen and you lose the round. First to N points wins.

Plain HTML5 + JavaScript. No install, no build step, no internet needed.
Open `index.html` in Chrome or Edge.

## Controls (PS4 controller)

| Button | Action |
| --- | --- |
| Left stick / D-pad | Run |
| ✕ | Jump (hold for higher). Press while touching a wall to wall-jump |
| R1 / R2 / L1 / L2 (hold) | Grappling hook. Auto-aims at the nearest ring ahead of you. Release to let go |
| ↓ or ○ | Slide (keeps your speed, fits through low tunnels) |
| □ / △ | Use item |
| OPTIONS | Start match / pause |

**Lobby:** each player presses ✕ to join, ◀ ▶ sets the points needed to win,
OPTIONS starts. With one player joined, OPTIONS starts solo practice.

**Keyboard (for testing):** P1 `WASD` + `Space` jump, `F` hook, `G` item.
P2 arrow keys + `K` jump, `L` hook, `J` item. `Enter` start/pause, `Esc` back,
`M` music on/off, double-click for fullscreen.

### Items (grab the purple `?` boxes)
- **Bolt**: a homing shock orb that stuns your rival. You can dodge it by jumping.
- **Crate**: drops a 2-high crate behind you. Jump it, or hit it at speed to smash
  through (that costs you momentum).
- **Turbo**: 3 seconds of extra top speed and acceleration.

The player in the lead tends to get crates. The player behind tends to get bolts and turbo.

### Level pieces
Yellow boost pads, gaps, platform hops, wall-jump chimneys, slide tunnels,
grapple pits and long grapple-swing ceilings. After 30 seconds **sudden death**
starts: a red wall creeps in from the left and shrinks the screen until someone drops out.

## Playing on the TV with Steam Link

1. Put this folder on the PC that runs Steam, e.g. `C:\Games\dash-duel\`.
2. In Steam: **Games → Add a Non-Steam Game to My Library → Browse**, and pick your
   browser: `C:\Program Files\Google\Chrome\Application\chrome.exe`
   (or Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
3. Right-click the new shortcut → **Properties**. Rename it to *Dash Duel* and set
   **Launch Options** to:
   ```
   --kiosk --autoplay-policy=no-user-gesture-required --user-data-dir="C:\Games\dash-duel\profile" "file:///C:/Games/dash-duel/index.html"
   ```
   - `--kiosk` opens fullscreen with no browser UI.
   - `--user-data-dir` forces a separate browser window, so the flags work even if
     Chrome is already open.
   - `--autoplay-policy=...` lets sound play without a mouse click.
4. On the TV, launch *Dash Duel* from the Steam Link library. Both players press ✕ to join.
5. To quit: press the PS button → Exit game. Or press `Alt+F4` on a keyboard.

### Controller tips
- Steam Input normally presents PS4 pads to the game as standard gamepads. That
  works out of the box.
- If a controller doesn't respond or one pad shows up twice: Properties →
  **Controller** → set *Disable Steam Input*. Chrome reads DualShock 4 controllers natively.
- Press a button on each controller once if the game hasn't noticed it yet.
  Browsers only expose gamepads after a button press.
- If you hear no sound, check the `--autoplay-policy` flag. Otherwise press any key once.

## Code layout
```
index.html      entry point
js/util.js      constants, RNG, math helpers
js/audio.js     synthesized sound effects + music (WebAudio, no files)
js/input.js     gamepads + keyboard as unified input sources
js/level.js     procedural level made of chunk templates
js/player.js    movement physics: run, jump, wall-jump, slide, grapple
js/game.js      game states, items, camera/elimination, all rendering
js/main.js      canvas scaling and the main loop
```
Tuning constants (speed, jump height, hook range) are at the top of `js/player.js`.
To add a new level piece, add a method to `Level` in `js/level.js` and list it in
the `table` in `genChunk()`.
