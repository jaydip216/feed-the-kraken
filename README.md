# Feed the Kraken — companion web app

A digital companion for playing the board game *Feed the Kraken* face to face.
The app manages hidden information, guides gameplay, and displays shared game
state while players handle the table talk.

For gameplay rules and further details, please refer to the
[gameplay PDF](feed%20the%20kraken%20rules.pdf) included in this repository.

## Getting started

Install Node.js and npm, then run:

```bash
npm install
npm run dev
```

The client runs on port `5173` and the server on port `3000`. Open
`http://localhost:5173/table` on the shared display. Players on the same network
can open `http://<host-ip>:5173/play` on their phones.

## App pages

- `/table` — shared board and public game state.
- `/play` — each player's private information and actions.
- `/host` — host controls, including undo and game management.
- `/guide` — in-app gameplay guide.

## Development

```bash
npm test      # Run the test suite
npm run build # Build the app
```

## Run with Docker

```bash
docker build -t feed-the-kraken .
docker run -p 3000:3000 feed-the-kraken
```

Open `http://localhost:3000/table` on the host computer.
