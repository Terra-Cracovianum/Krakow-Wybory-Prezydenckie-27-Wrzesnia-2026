# Handover: Kraków mayoral election map

This is the first-round site for the 27 September 2026 by-election for president of Kraków (PKW municipality 4485). It is a static page. There is no build step, no bundler, and no application server. The next developer should copy this repository into a new one for the second round on 11 October 2026, then change the parts listed at the end. Do not start that work by rewriting the map.

The short Polish project note is [README.md](../README.md). This file is the one to trust when the two disagree.

## What you are looking at

On election night the page shows Kraków, every polling place, and the official count as it arrives. The left column is the result. The map only changes which area is in frame. The result card is ordinary HTML on top of the map, so panning and zooming do not move it.

When every commission has reported, and the file is not marked as sample data, three things appear together:

- a red ticker across the top
- a card over the map naming who advanced, or who won outright
- a short burst of confetti, once per browser tab

The first round ended with Łukasz Gibała and Monika Jadwiga Piątkowska advancing. Neither had more than half of the valid votes. Those two are the second-round ballot. The numbers below are the final first-round snapshot in `data/results.json` (`updatedAt` `2026-09-28T02:24:12+02:00`).

| | |
| --- | --- |
| Commissions reporting | 454 / 454 |
| Eligible | 591 230 |
| Valid cards | 257 211 |
| Valid votes | 255 785 |
| Gibała | 93 042 (36,38%) |
| Piątkowska | 76 514 (29,91%) |

## Run it

From the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Opening `index.html` as a file will fail, because the page fetches JSON.

GitHub Pages serves the site at `https://terra-cracovianum.github.io/Krakow-Wybory-Prezydenckie-27-Wrzesnia-2026/`. The Pages source for this repository is the branch `cursor/krakow-election-map-d860`, folder `/`. `main` does not contain the site. A new repository should deploy whatever branch you intend to publish, and the canonical URL in `index.html` has to match that repository.

Libraries, loaded from unpkg in `index.html`:

- Leaflet 1.9.4
- MapLibre GL 5.24.0
- `@maplibre/maplibre-gl-leaflet` 0.1.0

The basemap is the OpenFreeMap Positron style (`https://tiles.openfreemap.org/styles/positron`). Fonts are Fraunces and Source Sans 3 from Google Fonts.

## Files

| Path | Role |
| --- | --- |
| `index.html` | Shell, copy, Open Graph tags, library tags. |
| `js/map.js` | The whole application. One file, no modules, no imports. |
| `css/styles.css` | Layout, including the phone rules. |
| `data/candidates.json` | Ballot order, names, colours, withdrawn flag. |
| `data/results.json` | The only file the count lives in. |
| `data/precincts.geojson` | 412 polygons, precincts 1–412. Property `nr`, property `dzielnica`. |
| `data/districts.geojson` | 18 districts dissolved from those polygons. Property `dzielnica`, property `nrs` (string numbers). |
| `data/stations.geojson` | 250 polling places. A place lists every precinct that votes there in `obwody`. |
| `data/commissions.geojson` | One point per precinct, 1–454. The page never fetches this file. It is a reference copy of the commission list. |
| `wyniki.jpg` | 1200×630 baseline JPEG used as the link-preview image. |

`js/map.js` starts in `init()`. That function loads the five JSON/GeoJSON files the page needs (`candidates`, `results`, `precincts`, `stations`, `districts`), draws the city, and wires the controls. Everything else is a function in the same file. Search for the function name from this document.

## Results file

`data/results.json` is the contract. The page does not compute a city total by walking precincts for the headline numbers. It reads the city fields, and it reads `precincts` for the map, the station table, and district sums.

```json
{
  "status": "final",
  "round": 1,
  "updatedAt": "2026-09-28T02:24:12+02:00",
  "precinctsTotal": 454,
  "precinctsReporting": 454,
  "eligible": 591230,
  "ballots": 257260,
  "validCards": 257211,
  "validVotes": 255785,
  "invalidVotes": 1426,
  "turnout": 43.5,
  "candidates": { "gibala": 93042 },
  "precincts": {
    "1": {
      "reported": true,
      "eligible": 1518,
      "ballots": 660,
      "validCards": 660,
      "validVotes": 660,
      "invalidVotes": 0,
      "votes": { "gibala": 208 }
    }
  }
}
```

`candidates` and each precinct `votes` object use the ids from `data/candidates.json`.

`status` is `awaiting` before any protocol, `partial` while some commissions are in, and `final` when `precinctsReporting` equals `precinctsTotal`. The label on the page keys off `precinctsReporting` more than off the string. `round` is `1` or `2`. When the count is finished, `round === 2` changes the status line to “Wyniki drugiej tury”.

`sample: true` is optional. If it is set, the amber example banner stays visible, the map chip says the figures are not PKW, and the ticker, runoff card, and confetti stay hidden. Real results must not set it.

A precinct is counted only when `reported` is `true`. Until then the polygon is grey (`#d7deda`) and the station table shows “—”.

There must be one precinct object for every number from 1 to 454, including commissions that reported all zeros. PKW omits numeric fields that are zero on the wire. An importer still has to write those zeros and set `reported: true`, or the page will treat the commission as missing.

## How a number is calculated

Turnout on the city card is `validCards / eligible`, not `ballots / eligible`, and not the stored `turnout` field when `validCards` and `eligible` are both numbers. That is `officialTurnout`. A station row and a district row use the same rule in `turnoutOf`: `validCards` if it is a number, otherwise `ballots`, divided by `eligible`. `formatPercent` rounds with `pkwRound` to two decimal places and formats with `pl-PL`, so 43.5 displays as `43,50%`.

`pkwRound` is round-half-away-from-the-string-form PKW uses: shift with `Number(`${value}e${digits}`)`, round, shift back. Candidate shares are `(100 * votes) / validVotes` through that function (`percentLabel`). The denominator is valid votes, not valid cards and not eligible voters.

A candidate has an absolute majority only when `votes * 2 > validVotes` (`renderRunoff`). A tie at exactly half is not a majority. Withdrawn candidates are left out of that ranking. If nobody has a majority, the card and the ticker name the first two by votes, with ballot order as the tie-break.

Hoffman (`id` `hoffman`, `withdrawn: true`) stays on the candidate list. His votes are stored in `votes.hoffman` and must not be included in `validVotes`. He gets no share bar in the station table, and he cannot colour the map or enter the runoff (`outcomeForNumbers`, `leaderOf`, `candidateList`).

Polish plurals are `voteNoun` and `obwodNoun`. One uses the singular (`1 głos`, `1 obwód`). Two, three, and four use the small plural, except 12–14 (`2 głosy`, `22 obwody`, `12 głosów`, `23 obwody`). Everything else uses the large plural (`5 głosów`, `23` is `obwody`, `25` is `obwodów`).

District figures are not stored. `placeTotals` sums the reported precincts whose numbers are in that district’s `nrs`: eligible, ballots, valid cards, valid votes, invalid votes, and each candidate. If any reported row is missing a numeric field, that sum becomes `null` and the cell shows “—”. The district turnout then uses the same `validCards / eligible` rule.

## Geography

Precincts 1–412 are territorial. They have polygons in `precincts.geojson` and they are dissolved into the 18 city districts in `districts.geojson`. Official names are hardcoded in `DISTRICT_TITLE` in `js/map.js` (I Stare Miasto through XVIII Nowa Huta). The GeoJSON only says `Dzielnica I` and so on.

Precincts 413–454 are commissions in hospitals, care homes, and prisons. They have a point on a polling place and a protocol in `results.json`. They have no neighbourhood polygon, so they belong to no district. They still count in the city total, and search can open them. Number 417 is the hospital on Siemiradzkiego. Number 444 is one commission, not a sum of others.

`stations.geojson` groups precincts that share a building. Several `obwody` on one feature means one address and several columns in the station table. Clicking a precinct polygon calls `stationIndexFor`, which finds the station whose `obwody` contains that number.

`districts.geojson` was built by dissolving the precinct polygons. Interior rings smaller than about 0.00005 square degrees were dropped, because Leaflet was stroking them as dark dashes inside the district. Do not put those slivers back.

Four addresses were missing from the MSIP point layer and were taken from OpenStreetMap: Lubelska 29, Wadowicka 8W, Henryka Siemiradzkiego 1, Forteczna 22.

Sources:

- Commission list: `https://wybory.gov.pl/wojtburmistrz_2024_2029/pl/4485/organy_wyborcze/komisje_obwodowe`
- Precinct polygons: MSIP Kraków, layer “Aktualny podział na obwody wyborcze”
- Building points: `https://msip.um.krakow.pl/arcgis/rest/services/Obserwatorium/K05_Wybory_Dzielnice/MapServer`
- Candidates: the Kraków election commission notice of 14 September 2026

## Map colour and framing

`outcomeForNumbers` sums reported precincts, ignores withdrawn candidates, and returns the person with the most votes plus their share of valid votes. `choropleth` mixes that candidate’s hex with paper `rgb(244, 244, 244)`. The mix is pale at a 25% share and reaches the candidate colour at 50%:

```text
amount = 0.34 + clamp((share - 0.25) / 0.25, 0, 1) * 0.66
channel = round(244 + (channel - 244) * amount)
```

The legend lists every candidate who leads at least one precinct or district in the current view, in ballot order, with a 25% to 50% ramp.

`withSurroundings` expands a bounds by a fraction of its span (minimum span 0.008° latitude and 0.01° longitude). `fitCity` uses fraction `0.16`. `fitDistrict` uses `0.42` and `maxZoom` 14. `fitPrecinct` uses `0.42` and `maxZoom` 15. The city fit also sets `minZoom` so the user cannot zoom the city out of the frame.

The MapLibre layer’s own resize handler recentres the canvas without resizing it, which shoves the city off the polygons when the left column changes width. `init` replaces that handler with `resizeBasemap`. Leave that override in place.

## What the screen does

`setMapView("precincts" | "districts")` swaps the two GeoJSON layers. Choosing Dzielnice while that view is already on toggles the district menu. Escape closes the menu first, then the sheet.

Clicking a district calls `selectDistrict`. The sheet is `showDistrict`: it fills `#place-view` and adds `is-district` on `.panel`. It does not add `is-place`. `is-place` is what widens the column for the station table (`--place-cols`). The district sheet must stay on the narrow column, 268px (`min(268px, calc(100% - 320px))`).

The district sheet shows the roman number and the official name, a sentence with the precinct count, a chip per precinct, turnout, counted precincts, valid votes, and the same candidate rows as the city list (`candidateList`). A chip calls `openListedPrecinct`, which leaves district view, shows the precinct layer, and opens the station table via `showPlace`.

“Miasto” (`data-close`) and “Całe miasto” (`data-district=""`) call `closeSheet`. That clears the highlight, clears `state.district`, and fits the city again.

Search (`#query`) matches a station’s precinct numbers, building name, street, or building number. An exact precinct number sorts above a substring. `/` focuses the box when it is not already focused.

The phone layout starts at `max-width: 860px`. The map is on top and the column becomes a bottom sheet. `html.has-ticker` means the count is finished. On a phone that class shortens the city sheet to `48dvh`, hides the title and the PKW chip, turns the three totals into one row, and collapses the runoff card to a strip. A station or district sheet stays taller (`68dvh`). Below 520px of height the sheet is `50dvh`.

## Finished count, confetti, visits

`renderRunoff` runs only when `sample` is absent and `precinctsReporting >= precinctsTotal`. It writes `#runoff` and calls `renderTicker`. The ticker copies its sentence into `#ticker-live` once, for the screen reader, and duplicates the visible track until it is at least twice the viewport. `prefers-reduced-motion` leaves a single static line. The first-round sentence is either “Wybrany w pierwszej turze…” or “Druga tura, 11 października 2026. Do drugiej tury przechodzą…”. Both strings are first-round copy. They are wrong for a second-round site.

`celebrateCount` reads `sessionStorage` key `krakow-wybory-confetti`. Reduced motion skips it. It does not run again in the same tab.

`countVisit` skips `localhost` and `127.0.0.1`. Otherwise it hits `https://abacus.jasoncameron.dev/hit/terra-cracovianum.github.io/krakow-wybory-visits` once per browser, remembered in `localStorage` key `krakow-wybory-visit`. The public read URL is `https://abacus.jasoncameron.dev/get/terra-cracovianum.github.io/krakow-wybory-visits`. Do not put an admin key in the repository or in this document. A second-round site needs its own counter name if the two sites should be counted apart.

## Link preview

`og:image` and `twitter:image` point at `wyniki.jpg` on the published host. The file is a baseline JPEG, 1200×630. X dropped the picture when an earlier image URL had a query string, and it kept showing an older card until the image path itself changed. Replace the file by publishing a new filename and updating both tags. Do not add `?v=`.

The image is not generated by the page. It was drawn from the district polygons and the final first-round leaders. Rebuild it when the candidates or the result change.

## What is not in this repository

Nothing here polls PKW. During the first round a separate script, not committed, read:

`https://wybory.gov.pl/wojtburmistrz_2024_2029/data/details/4485.blob`

and wrote `data/results.json`. The second-round address will not automatically be that URL. Open the official Kraków page on wybory.gov.pl and confirm the blob before writing an importer.

Rules that importer has to keep:

- Publish only PKW numbers. No polls, no photographs of a television, no partial arithmetic you cannot tie to a protocol.
- A counted commission with all zeros is still counted. Write the zeros and `reported: true`.
- Turnout in the file may be stored, but the page recomputes it from `validCards / eligible`.
- Do not commit an admin key, and do not commit beside `results.json` unless you mean to publish that snapshot.

## Second round: what to copy and what to change

Copy this repository into the new one. Keep the geometry, the district dissolve, the choropleth, search, the fixed results column, and the phone `has-ticker` layout, unless the commission list actually changes.

Change these before the new site goes public.

1. `data/candidates.json`. The ballot is Łukasz Gibała and Monika Jadwiga Piątkowska. Give them the ids the rest of the file will use (`gibala`, `piatkowska` if you keep the current ids), ballot numbers for the second-round card, full official names, committees, and colours. `#ff8a3d` and `#ff7eb3` are what the first-round map used for them. Remove the other six candidates. `withdrawn` can go once nothing in `js/map.js` still branches on it (`outcomeForNumbers`, `leaderOf`, `candidateList`, `voteCell`, `renderRunoff`).

2. `data/results.json`. Set `round` to `2`, `status` to `"awaiting"`, `precinctsReporting` to `0`, and the city totals to zero or omit them until the first protocol. Leave one precinct object for each number 1–454 with `"reported": false`. Do not ship the first-round totals on the second-round site.

3. Copy in `index.html` and `js/map.js`. The election date is 11 października 2026. The kicker should not say “Przedterminowe wybory”. The line under the candidate list (“Druga tura 11 października 2026, jeśli nikt nie przekroczy połowy głosów.”) is a first-round rule. `renderRunoff` and `tickerLine` must not announce another second round. On a finished count, name the person with more valid votes. Keep `votes * 2 > validVotes` if you still want the card to say they have an absolute majority. `renderSummary` and `renderPkwChip` already switch the finished label when `round === 2`.

4. `wyniki.jpg` and the `og:*` / `twitter:*` tags, including `og:url`, the canonical link, the title, and the description. New filename, baseline JPEG, no query string. Colours should be the two second-round candidates, not the first-round poster.

5. The visit counter host and key, if this site should not increment the first-round counter.

6. Confirm the PKW blob URL and whether precinct numbers 1–454 and the polling places are unchanged. If PKW adds or drops a commission, update `stations.geojson`, `precincts.geojson`, `districts.geojson`, and `precinctsTotal` together. A district total is only as good as its `nrs` list.

Leave these alone unless a real bug forces it:

- `withSurroundings` and the three fit functions
- the MapLibre resize override
- `placeTotals` including `validCards`
- precincts 413–454 staying out of district geometry
- the `is-place` versus `is-district` split
- `pkwRound` and the Polish noun rules
