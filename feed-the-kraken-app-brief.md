# Feed the Kraken — Companion Web App: Build Brief

> **Rules source:** the official rulebook PDF is provided alongside this brief.
> It is the single source of truth for all game rules, card effects, player-count
> tables, and thresholds. This document does **not** restate them — it defines the
> product, architecture, and build order. When a rule detail is needed, read the PDF.

---

## 1. What this is

A digital companion that replaces the physical components of *Feed the Kraken* for a
group playing **in the same room, face to face**. All discussion, lying, negotiation
and table-talk stays verbal and off-screen. The app exists only to manage hidden
information, enforce rules, and display shared state.

Explicitly **not** an online/remote game. No internet dependency at play time.

### Why this is a good fit

Nearly every physical component in the game exists to move secret information around
(seabags, closed fists, the captain's logbook, eyes-closed rituals). A server does this
better and faster. The eyes-closed night phases and their read-aloud scripts are
deleted entirely and replaced with private prompts.

---

## 2. Deployment context

- Self-hosted on the user's home server (Proxmox host, deploy as a Docker container).
- Players connect over the **local network** — LAN IP or a locally-resolving subdomain.
- No internet required during play. Remote access via existing Cloudflare Tunnel is a
  nice-to-have, not a design constraint.
- All players are on Android phones; one shared laptop acts as the table display.

---

## 3. Architecture

**Server-authoritative.** The server holds all game state. Clients receive **only** the
state their seat is entitled to see. Never send full state and hide it client-side —
view-source ends the game.

Suggested stack (not mandatory, but chosen for fit):

- **Backend:** Node + Socket.IO. In-memory game state, periodic snapshot to SQLite or
  a JSON file so a container restart doesn't kill a game in progress.
- **Frontend:** React + Vite SPA, served from the same container. Single build, three
  routes/modes (below).
- **Transport:** WebSocket for all game events. HTTP only for the initial page load.

### Three surfaces, one codebase

| Surface | Device | Shows |
|---|---|---|
| **Table view** | Laptop, shared | Map, ship position, all résumés, public gun counts, off-duty signs, badges, current phase, game log. **Nothing secret, ever.** |
| **Player view** | Personal phone | Own faction, own gun supply, the action the current phase asks of them. Idle most of the time. |
| **Host controls** | Host's device | Admin escape hatch — not a game role. Fix misclicks, rewind, force-advance. |

The table view carries the bookkeeping burden (badges, signs, résumés, gun counts,
supply pool) so the phone stays minimal.

---

## 4. Session flow

### Setup

1. Host opens table view → room code generated.
2. Players join by code on phones, enter a name.
3. Host arranges names into **physical seating order** — this is required, the Drunk
   card moves the captaincy clockwise. The physical game gets seating for free; the
   app must capture it.
4. Host selects map (quick / long journey). Both maps ship in v1.
5. Server deals factions per the rulebook's player-count table, including the
   5-player variant where a bag is removed and pirates learn only their own count.
6. **Pirate gathering** happens as a private card on each pirate's phone. No eyes
   closed, no timer.
7. First captain is selected at random in v1 (the rulebook uses the "Captain"
   character card; character cards are deferred to v2).

### Round loop

Each phase names the screen that drives it.

**1. Appoint navigation team** — Captain's phone shows eligible players only (self and
off-duty players filtered out by the server, not the UI). Picks lieutenant, then
navigator. Table view shows the badges land.

**2. A question of loyalty (mutiny)** — This must be a genuine **simultaneous commit**:

- Every non-captain phone shows a 0–N gun stepper and a **Lock In** button.
- Table view shows only progress ("4 of 6 locked in") — never partial counts.
- When all are locked, the table reveals every count at once and states pass/fail
  against the player-count threshold.
- On a tie for most guns, the sitting captain's phone runs the iterative elimination
  picks per the rulebook.

**3. Navigation** — Sequential, server-mediated:

- Captain sees their two cards, discards one.
- Lieutenant sees their two cards, discards one.
- Server shuffles the two survivors; navigator sees both, discards one.
- Table view shows a silence indicator throughout, then reveals the final card.
- The navigator's screen also carries the **Denial of Command** action, which triggers
  the emergency-navigator loop (including the case where successive emergency
  navigators also jump).

**4. Execute** — Table view animates ship movement. If the destination space carries an
icon, the captain's phone gets the appropriate target picker. Then the navigation
card's own action resolves. Order matters — see rulebook.

**5. Off-duty** — Signs assigned automatically by player count and role. Badges return
to the captain. Next round begins.

### Cult uprisings

Interrupt at end of navigation. The ritual card flips on the table view, then the cult
leader's phone drives it privately: choose a convert, distribute three guns, or read
the navigation team's factions. The converted player gets a private notification.
Convertibility rules (players examined by cabin search or flogging are unconvertible)
are enforced server-side.

### Game end

Victory space reached, or cult leader fed to the kraken. Table view flips **all**
factions face up simultaneously, alongside the complete game log.

---

## 5. Design decisions already made

- **Cabin search shows the captain the true faction.** The captain then lies or
  doesn't, verbally. The app neither helps nor hinders this.
- **Off with the Tongue** is enforced *mechanically* only — the affected player cannot
  become captain, and their guns count 0 when determining the next captain, but they
  still count toward the mutiny total. The silence itself is honour-system; do not mute
  their UI.
- **Silence during navigation** is likewise social. Show an indicator, enforce nothing.
- **Eliminated players** (fed to the kraken, jumped overboard) keep a screen showing
  their own faction and all public state, with every action disabled. They still win
  with their team.

---

## 6. Non-obvious requirements

These will cause pain if left until late:

- **Reconnect is the single most important non-game feature.** Android phones sleep and
  drop sockets. Store a reconnect token in `localStorage`; a player must be able to
  reload and land back in their seat with faction intact.
- **Host rewind.** Someone will appoint the wrong navigator or advance a phase early.
  Build "undo last action" from the start — retrofitting it into a phase machine is
  expensive.
- **Model the round as an explicit state machine**, not nested callbacks. Denial of
  command and emergency navigation form a loop that re-enters navigation without
  passing through appointment; the sub-three-players fallback (captain resolves open
  positions randomly) is another branch.
- **Guns are a finite shared pool of 40.** Track a supply pool, not just per-player
  counters — the long journey's supply line and the cult's guns stash both draw from it.
- **Gun counts are public outside mutinies, secret during them.** The table view must
  respect this transition.
- **Résumé cards never return to the draw pile.** Reshuffle logic must exclude them.

---

## 7. Scope

**In v1:** both maps, all navigation cards, all cult ritual cards, all map actions,
5–11 players, full round loop.

**Deferred to v2:** the 22 character cards. Each is a bespoke rule exception hooking
into a different phase (some are ongoing, some re-arm after being turned facedown,
some can drain the draw pile mid-navigation). Their card texts are not in the rulebook
PDF and must be sourced separately. Design the phase machine with hooks in mind, but
do not build the cards now.

---

## 8. Build order

| Milestone | Scope |
|---|---|
| **M0** | Lobby, seating order, faction deal, pirate gathering, end-game reveal |
| **M1** | Round loop: appoint → mutiny → navigation → off-duty. No map yet. |
| **M2** | Both maps, ship movement, victory detection |
| **M3** | Map actions + navigation card actions |
| **M4** | Cult rituals and conversion |
| **M5** | Long-journey extras: supply line, flogging, off with the tongue, armed |
| **M6** | Reconnect, host rewind, game log polish |
| **V2** | Character cards |

M0–M2 produces something playable-but-rough. M4 is where it becomes the real game.
