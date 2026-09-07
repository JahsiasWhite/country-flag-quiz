# Country Flag Quiz

An interactive 3D globe that helps users study basic country data, including location, capital city, and flags. Can be ran locally or accessed online at: [countryflagquiz.com](https://www.countryflagquiz.com)

![Country Flag Quiz Example](/countryflagquizexample.png)

## Installing

Clone this repo

## Downloading country data

1. Ensure you have **Node.js** installed.
2. Install dependencies:

```bash
npm install node-fetch@3
```

- Downloads **all country flags** as SVGs into a `flags` folder.
- Generates **two JSON files**:

  1. `countries-array.json` – array of country objects (`name`, `capital`, `flag`).
  2. `countries-map.json` – object keyed by country name

```bash
node DownloadCountryData.js
```

## Usage

```bash
npm i
```

Run the web app and lobby server together:

```bash
npm run dev:all
```

Or in two terminals:

```bash
npm run server
npm run dev
```

```bash
npm run build
```

### Multiplayer

1. Open the quiz panel → **Multiplayer**
2. Create a lobby (share the 4-letter code or the invite link) or join with a code
3. Host sets quiz options and clicks **Start for everyone**
4. Everyone gets the same question set; scores and per-player progress sync live
5. When the round ends everyone lands back in the lobby and the host can start another

The lobby server defaults to `http://localhost:3001`. Vite proxies `/socket.io` there in development. For production, set `VITE_WS_URL` to your hosted lobby server URL.

Run the lobby server's tests with:

```bash
npm run test:server
```

#### How rounds work

The **server** owns round state, which is what keeps a lobby from getting stuck:

- **Joining is never blocked.** Arrive mid-round and you watch the live scoreboard,
  then you're automatically in the next round.
- **A round only ends server-side**, when every connected participant has finished.
  Players who disconnect are skipped, the host can end a round early, and a
  watchdog closes any round that outlives its deadline. No client message is
  needed to reopen a lobby.
- **Identity survives reconnects.** Each browser keeps a durable player id, so a
  refresh or a dropped connection reclaims your seat, score and place in the
  question list instead of leaving a ghost player behind.
- The host role moves to another player automatically if the host leaves.

Server behaviour can be tuned with `PORT`, `CFQ_ROUND_TIMEOUT_MS` and
`CFQ_DISCONNECT_GRACE_MS`.

## Sources

This project fetches border data from the geo-countries dataset. All country data and earth textures are installed locally.

Earth Textures:

- https://github.com/Siqister/files
- https://www.visibleearth.nasa.gov/collection/1484/blue-marble.?page=1

Country Data:

- https://restcountries.com/v3.1/all?fields=name,capital,flags,cca2

Border Data:

- https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson

Favicon:

- https://www.svgrepo.com/svg/471481/globe-06

# ISSUES

1. Vatican is in the border dataset but not in the quiz country list (no flag asset yet)

# TODO

1. Option to show names/flags directly on the country on the globe
2. We already have partial wikipedia integration. Now we should have a "Show More" button for the countries. It will open a "card" that has the wiki info on it for easy fact viewing
3. Global leaderboard
4. Host multiplayer lobby server in production (Railway/Fly/etc.)
5. Score answers on the server so a modified client can't inflate its points
