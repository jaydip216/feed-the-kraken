# Feed the Kraken — companion web app

In-room digital companion for the board game *Feed the Kraken*. Manages hidden
information, enforces rules, and displays shared state. Play happens face to
face; the app never replaces table talk.

## Surfaces
- `/table` — the TV/monitor everyone watches. Hex map and crew side by side, with the
  action spotlight, movement-step buttons and captain's log below. Never shows a secret.
- `/play` — personal phone. Own faction, own guns, current action. Idle most of the time.
- `/host` — admin escape hatch (undo, force-advance, reveal). Not a game role.
- `/guide` — full how-to-play: rules, every card action, what is public, and tips.

## The board
`shared/src/maps.ts` builds a true flat-top hex lattice — every space edge-to-edge
with its neighbours, no gaps — to the layer counts on the printed map. A *layer* is
the zig-zag band the eye reads across the board; because flat-top hexes interlock,
one band spans two half-levels, which is what makes the counts come out
**1 / 3 / 3 / 5 / 5 / 7 / 7**, thirty-one spaces in all:

```
layer 6   25 26 27 28 29 30 31   Crimson Cove 25-27 | the Kraken 28 | Bluewater Bay 29-31
layer 5   18 19 20 21 22 23 24   feed the kraken on 20, 21, 22
layer 4      13 14 15 16 17      flogging on 14 and 16
layer 3       8  9 10 11 12      cabin search on 8, off with the tongue on 10
layer 2          5  6  7         cabin search on 5, 6, 7
layer 1          2  3  4
layer 0             1            the start
```

A space is at `(col, level)` with `x = col·1.5·s`, `y = -level·(√3/2)·s`, and exists
only where `col + level` is even. Its three exits are the three upward edges:
north `(col, level+2)`, west `(col-1, level+1)`, east `(col+1, level+1)` — so from
space 21 the cards fan out onto all three coasts (west 27, north 28, east 29). Every
destination is six navigations from the start. The arrows are derived from the same
movement function the server uses, so the drawing can never disagree with the rules.

## Develop
```bash
npm install
npm run dev        # builds shared, runs server (3000) + client (5173, LAN-exposed)
```
Open the table on the laptop at `http://<host>:5173/table`, players join `/play`.

## Test
```bash
npm test           # server unit tests incl. the redaction guard
```

## Deploy (home server)
```bash
docker build -t feed-the-kraken .
docker run -p 3000:3000 feed-the-kraken   # serves everything on :3000
```

## Status
All v1 gameplay implemented (M0–M6; character cards are v2 and deferred):

- **M0** lobby, seating, faction deal (incl. 5-player variant), pirate gathering, end reveal
- **M1** full round loop: appoint -> mutiny (simultaneous commit + tie break) -> navigation
  (captain/lieutenant/navigator draw-discard) -> off-duty, plus Denial of Command and the
  emergency-navigation loop, and the <3-player random fallback
- **M2** both maps as a triangular hex board, ship movement, victory detection, reshuffle
  (résumés excluded), deck-exhaustion handling
- **M3** map actions (cabin search, flogging, off-with-tongue, feed the kraken) and
  navigation-card actions (drunk, mermaid, telescope, armed, disarmed, cult uprising),
  resolved in rulebook order: move -> map-space icon -> card action
- **M4** cult rituals (guns stash, cult cabin search, conversion) with convertibility
  enforcement and private convert notification
- **M5** supply line refill on both maps (house rule: the printed board has it on the
  long journey only); off-with-the-tongue enforced mechanically
- **M6** host undo/rewind across the whole phase machine; reconnect tokens; game log

### Tests
`npm test` runs unit tests plus a **50-game simulation** (5–11 players, both maps) that
plays every game to completion and asserts gun-supply conservation and table redaction
after every single step. Deferred to v2: the 22 character cards.
