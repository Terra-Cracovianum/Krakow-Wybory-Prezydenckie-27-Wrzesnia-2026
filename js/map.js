const numberFormat = new Intl.NumberFormat("pl-PL");

const state = {
  candidates: [],
  results: null,
  stations: null,
  highlightNr: null,
  map: null,
  cityBounds: null,
};

const query = document.querySelector("#query");
const hits = document.querySelector("#hits");

init().catch((error) => {
  document.querySelector("#status").textContent = "Nie udało się wczytać mapy";
  console.error(error);
});

async function init() {
  const [candidateFile, results, precincts, stations] = await Promise.all([
    fetch("data/candidates.json").then((response) => response.json()),
    fetch("data/results.json").then((response) => response.json()),
    fetch("data/precincts.geojson").then((response) => response.json()),
    fetch("data/stations.geojson").then((response) => response.json()),
  ]);

  state.candidates = candidateFile.candidates;
  state.results = results;
  state.stations = stations;

  renderSummary();
  renderCandidates();

  const cityBounds = L.geoJSON(precincts).getBounds();
  state.cityBounds = cityBounds;
  const map = L.map("map", {
    zoomControl: false,
    zoomSnap: 0,
    zoomDelta: 1,
    minZoom: 10,
    maxZoom: 18,
    maxBounds: cityBounds.pad(0.85),
    maxBoundsViscosity: 1,
    worldCopyJump: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  const basemap = L.maplibreGL({
    style: "https://tiles.openfreemap.org/styles/positron",
  }).addTo(map);
  // The plugin's resize handler recenters the canvas without changing its
  // pixel size, so a narrower map leaves the city shifted off the precincts.
  map.off("resize", basemap._resize, basemap);
  basemap._resize = function () {
    resizeBasemap(this);
  };
  map.on("resize", basemap._resize, basemap);
  map.attributionControl.addAttribution(
    '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · obwody: <a href="https://msip.krakow.pl/">MSIP Kraków</a>'
  );

  const precinctLayer = L.geoJSON(precincts, {
    style: stylePrecinct,
    onEachFeature(feature, layer) {
      layer.on({
        mouseover(event) {
          if (state.highlightNr) return;
          event.target.setStyle(hoverPrecinct(feature));
          event.target.bringToFront();
        },
        mouseout(event) {
          precinctLayer.resetStyle(event.target);
          bringSelectedToFront();
        },
        click() {
          const stationIndex = stationIndexFor(feature.properties.nr);
          if (stationIndex >= 0) openStation(stationIndex, feature.properties.nr);
        },
      });
    },
  }).addTo(map);
  state.precinctLayer = precinctLayer;
  state.map = map;
  fitCity();
  const refitSoon = () => {
    if (settling) return;
    map.invalidateSize({ animate: false });
    fitCity();
    syncBasemap();
  };
  map.on("resize", refitSoon);
  const refitObserver = new ResizeObserver(refitSoon);
  refitObserver.observe(document.querySelector("#map"));
  refitObserver.observe(document.querySelector(".panel"));
  document.fonts.ready.then(refitSoon);

  query.addEventListener("input", () => renderHits(query.value));
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== query) {
      event.preventDefault();
      query.focus();
    }
    if (event.key === "Escape") closeSheet();
  });
}

const pathEdge = { lineJoin: "round", lineCap: "round" };

function stylePrecinct(feature) {
  const leader = leaderOf(feature.properties.nr);
  const selected = String(feature.properties.nr) === String(state.highlightNr);
  const base = leader
    ? { color: "rgba(255,255,255,0.8)", weight: 0.75, opacity: 1, fillColor: leader.color, fillOpacity: 0.7, ...pathEdge }
    : { color: "rgba(255,255,255,0.45)", weight: 0.6, opacity: 1, fillColor: "#31404c", fillOpacity: 0.4, ...pathEdge };
  if (!selected) return base;
  return {
    ...base,
    color: "#ffffff",
    weight: 3,
    opacity: 1,
    fillOpacity: Math.min(0.92, base.fillOpacity + 0.35),
  };
}

function hoverPrecinct(feature) {
  const base = stylePrecinct(feature);
  return {
    ...base,
    color: "#ffffff",
    weight: 1.1,
    opacity: 0.85,
    fillOpacity: Math.min(0.55, base.fillOpacity + 0.08),
  };
}

function bringSelectedToFront() {
  const nr = state.highlightNr;
  if (!nr || !state.precinctLayer) return;
  state.precinctLayer.eachLayer((shape) => {
    if (String(shape.feature.properties.nr) === String(nr)) shape.bringToFront();
  });
}

function paintPrecincts() {
  const layer = state.precinctLayer;
  if (!layer) return;
  layer.eachLayer((shape) => {
    layer.resetStyle(shape);
    if (String(shape.feature.properties.nr) === String(state.highlightNr)) shape.bringToFront();
  });
}

function leaderOf(nr) {
  const row = state.results.precincts[nr];
  if (!row || !row.reported) return null;
  let best = null;
  for (const candidate of state.candidates) {
    if (candidate.withdrawn) continue;
    const votes = row.votes[candidate.id];
    if (typeof votes !== "number") continue;
    if (!best || votes > best.votes) best = { ...candidate, votes };
  }
  return best;
}

function stationIndexFor(nr) {
  return state.stations.features.findIndex((feature) =>
    feature.properties.obwody.includes(String(nr))
  );
}

let fitting = false;
let settling = false;

function viewPadding() {
  const mapEl = document.querySelector("#map").getBoundingClientRect();
  const zoom = document.querySelector(".leaflet-control-zoom");
  let right = 56;
  if (zoom) right = Math.max(right, mapEl.right - zoom.getBoundingClientRect().left + 10);
  return {
    paddingTopLeft: L.point(16, 16),
    paddingBottomRight: L.point(right, 16),
  };
}

function fitCity() {
  const map = state.map;
  if (!map || fitting) return;
  const size = map.getSize();
  if (size.x < 40 || size.y < 40) return;
  const pad = viewPadding();
  map.setMinZoom(0);
  const fitted = map.getBoundsZoom(state.cityBounds, false, pad.paddingTopLeft.add(pad.paddingBottomRight));
  if (!Number.isFinite(fitted)) return;
  map.setMinZoom(fitted);
  const zoom = map.getZoom();
  if (zoom != null && map.getBounds().contains(state.cityBounds) && zoom <= fitted + 0.01) return;
  fitting = true;
  map.fitBounds(state.cityBounds, { ...pad, animate: false });
  fitting = false;
}

function easeCity() {
  glideCity();
}

function resizeBasemap(layer) {
  if (!layer || !layer._glMap || !layer._map || !layer._container) return;
  const size = layer.getSize();
  layer._container.style.width = size.x + "px";
  layer._container.style.height = size.y + "px";
  const canvas = layer._glMap._actualCanvas;
  if (canvas) L.DomUtil.setTransform(canvas, L.point(0, 0), 1);
  layer._zooming = false;
  layer._glMap.resize();
  layer._update();
}

function syncBasemap() {
  const map = state.map;
  if (!map) return;
  map.eachLayer((layer) => {
    if (layer._glMap) resizeBasemap(layer);
  });
}

function glideCity() {
  const map = state.map;
  if (!map) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const panel = document.querySelector(".panel");
  if (reduce) {
    settling = false;
    map.invalidateSize({ animate: false });
    fitCity();
    syncBasemap();
    return;
  }
  settling = true;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    settling = false;
    panel.removeEventListener("transitionend", onEnd);
    window.clearTimeout(fallback);
    map.invalidateSize({ animate: false });
    fitCity();
    syncBasemap();
  };
  const onEnd = (event) => {
    if (event.target !== panel) return;
    if (event.propertyName !== "width" && event.propertyName !== "flex-basis") return;
    finish();
  };
  panel.addEventListener("transitionend", onEnd);
  const fallback = window.setTimeout(finish, 700);
}

function openStation(index, nr) {
  state.highlightNr = nr ? String(nr) : null;
  paintPrecincts();
  showPlace(state.stations.features[index], state.highlightNr);
  hits.hidden = true;
  query.blur();
}

function showPlace(feature, highlightNr) {
  const city = document.querySelector("#city-view");
  const place = document.querySelector("#place-view");
  const panel = document.querySelector(".panel");
  const columns = feature.properties.obwody.length + (feature.properties.obwody.length > 1 ? 1 : 0);
  panel.classList.add("is-place");
  panel.style.setProperty("--place-cols", String(columns));
  city.hidden = true;
  place.hidden = false;
  place.innerHTML = stationPopup(feature, highlightNr);
  place.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", closeSheet);
  });
  requestAnimationFrame(() => easeCity());
}

function closeSheet() {
  const city = document.querySelector("#city-view");
  const place = document.querySelector("#place-view");
  if (place.hidden) return;
  place.hidden = true;
  place.innerHTML = "";
  city.hidden = false;
  const panel = document.querySelector(".panel");
  panel.classList.remove("is-place");
  panel.style.removeProperty("--place-cols");
  state.highlightNr = null;
  paintPrecincts();
  requestAnimationFrame(() => easeCity());
}

function renderHits(raw) {
  const term = raw.trim().toLocaleLowerCase("pl-PL");
  if (!term) {
    hits.hidden = true;
    hits.innerHTML = "";
    return;
  }
  const matches = [];
  state.stations.features.forEach((feature, index) => {
    const props = feature.properties;
    const haystack = [
      props.obwody.join(" "),
      props.siedziba,
      props.ulica,
      props.nrBud,
    ]
      .join(" ")
      .toLocaleLowerCase("pl-PL");
    const exact = props.obwody.some((nr) => nr === term);
    if (exact || haystack.includes(term)) matches.push({ feature, index, exact });
  });
  matches.sort((a, b) => Number(b.exact) - Number(a.exact));
  const shown = matches.slice(0, 8);
  hits.hidden = shown.length === 0;
  hits.innerHTML = shown
    .map(({ feature, index }) => {
      const props = feature.properties;
      return `<li><button type="button" data-index="${index}"><strong>${escapeHtml(props.siedziba)}</strong><small>obwody ${escapeHtml(props.obwody.join(", "))} · ${escapeHtml(address(props))}</small></button></li>`;
    })
    .join("");
  hits.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => openStation(Number(button.dataset.index)));
  });
}

function renderSummary() {
  const results = state.results;
  const status = document.querySelector("#status");
  const sample = document.querySelector("#sample");
  sample.hidden = !results.sample;
  if (results.sample) {
    status.textContent = "Podgląd przykładowych wyników";
  } else if (results.status === "awaiting" || results.precinctsReporting === 0) {
    status.textContent = "Oczekiwanie na wyniki";
  } else if (results.precinctsReporting < results.precinctsTotal) {
    status.textContent = "Wyniki spływają";
  } else {
    status.textContent = results.round === 2 ? "Wyniki drugiej tury" : "Wyniki pełne";
  }
  document.querySelector("#turnout").textContent = formatPercent(results.turnout);
  document.querySelector("#reporting").textContent =
    `${numberFormat.format(results.precinctsReporting)} / ${numberFormat.format(results.precinctsTotal)}`;
  document.querySelector("#valid").textContent = formatCount(results.validVotes);
  renderProgress();
}

function countedSoFar() {
  let ballots = 0;
  let valid = 0;
  let precincts = 0;
  for (const row of Object.values(state.results.precincts)) {
    if (!row.reported) continue;
    precincts += 1;
    if (typeof row.ballots === "number") ballots += row.ballots;
    if (typeof row.validVotes === "number") valid += row.validVotes;
  }
  return { ballots, valid, precincts };
}

function renderProgress() {
  const results = state.results;
  const counted = countedSoFar();
  const total = results.precinctsTotal;
  const waiting = counted.precincts === 0;
  const status = document.querySelector("#progress-status");
  status.textContent = waiting
    ? "Oczekiwanie"
    : counted.precincts >= total
      ? "Policzone"
      : "Spływają";
  document.querySelector("#progress-precincts").textContent = waiting
    ? "—"
    : `${numberFormat.format(counted.precincts)} / ${numberFormat.format(total)}`;
  document.querySelector("#progress-ballots").textContent = waiting ? "—" : formatCount(counted.ballots);
  document.querySelector("#progress-valid").textContent = waiting ? "—" : formatCount(counted.valid);
  const share = total > 0 ? (counted.precincts / total) * 100 : 0;
  document.querySelector("#progress-bar").style.width = `${share}%`;
}

function renderCandidates() {
  const list = document.querySelector("#candidates");
  const totals = state.results.candidates;
  const max = Math.max(
    0,
    ...state.candidates.map((candidate) =>
      typeof totals[candidate.id] === "number" ? totals[candidate.id] : 0
    )
  );
  list.innerHTML = state.candidates
    .map((candidate) => {
      const votes = totals[candidate.id];
      const width = max > 0 && typeof votes === "number" ? (votes / max) * 100 : 0;
      const share = shareOf(votes, state.results.validVotes);
      return `<li class="candidate${candidate.withdrawn ? " withdrawn" : ""}">
        <header>
          <span class="swatch" style="background:${candidate.color}"></span>
          <h2 title="${escapeHtml(candidate.name)}">${candidate.ballot}. ${escapeHtml(candidate.short)}</h2>
          <span class="count">${formatCount(votes)}${share}</span>
        </header>
        <p class="meta">${escapeHtml(candidate.committee)}</p>
        ${candidate.note ? `<p class="note">${escapeHtml(candidate.note)}</p>` : ""}
        <div class="bar" aria-hidden="true"><span style="width:${width}%;background:${candidate.color}"></span></div>
      </li>`;
    })
    .join("");
}

function stationPopup(feature, highlightNr) {
  const props = feature.properties;
  const numbers = [...props.obwody].sort((a, b) => Number(a) - Number(b));
  const showTotal = numbers.length > 1;
  const total = showTotal ? placeTotals(numbers) : null;
  const heads = numbers.map((nr) => columnHead(nr, String(nr) === String(highlightNr))).join("");
  const totalHead = showTotal
    ? `<th scope="col" class="is-total"><span class="nr-label">Razem</span><span class="nr-note">${total.reportedCount} z ${numbers.length}</span></th>`
    : "";
  const stats = [
    ["Uprawnieni", (row) => formatCount(row && row.eligible), (sum) => formatCount(sum.eligible)],
    ["Frekwencja", turnoutOf, turnoutOf],
    ["Ważne", (row) => formatCount(row && row.validVotes), (sum) => formatCount(sum.validVotes)],
    ["Nieważne", (row) => formatCount(row && row.invalidVotes), (sum) => formatCount(sum.invalidVotes)],
  ];
  const statRows = stats
    .map(([label, cell, totalCell]) => {
      const tds = numbers
        .map((nr) => statCell(cell(precinctRow(nr))))
        .join("");
      const tail = showTotal ? statCell(totalCell(total), "is-total") : "";
      const last = label === "Nieważne" ? " is-break" : "";
      return `<tr class="is-stat${last}"><th scope="row">${label}</th>${tds}${tail}</tr>`;
    })
    .join("");
  const candidateRows = state.candidates
    .map((candidate) => {
      const note = candidate.withdrawn ? `<span class="withdrawn-note">wycofany</span>` : "";
      const tds = numbers.map((nr) => voteCell(candidate, precinctRow(nr), nr, highlightNr)).join("");
      const tail = showTotal ? voteTotalCell(candidate, total) : "";
      return `<tr>
        <th scope="row"><span class="who"><span class="swatch" style="background:${candidate.color}"></span><span>${escapeHtml(candidate.short)}</span>${note}</span></th>
        ${tds}${tail}
      </tr>`;
    })
    .join("");
  return `<div class="place-toolbar">
      <button type="button" class="place-back" data-close>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M10 3.2L5.2 8 10 12.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Miasto
      </button>
      <button type="button" class="sheet-close" data-close aria-label="Zamknij">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>
    <header class="popup-place">
      <p class="popup-kicker">Lokal wyborczy</p>
      <h3>${escapeHtml(props.siedziba)}</h3>
      <p class="place">${escapeHtml(address(props))}</p>
    </header>
    <div class="popup-blocks">
      <table class="result-table">
        <caption>Wyniki obwodów w tym lokalu</caption>
        <thead>
          <tr>
            <th class="result-corner" scope="col"><span class="nr-label">Obwód</span></th>
            ${heads}
            ${totalHead}
          </tr>
        </thead>
        <tbody>${statRows}${candidateRows}</tbody>
      </table>
    </div>`;
}

function precinctRow(nr) {
  return state.results.precincts[String(nr)] || null;
}

function columnHead(nr) {
  return `<th scope="col"><span class="nr">${escapeHtml(nr)}</span></th>`;
}

function statCell(text, extra = "") {
  const empty = text === "—" ? " is-empty" : "";
  const cls = `${extra}${empty}`.trim();
  return `<td${cls ? ` class="${cls}"` : ""}>${text}</td>`;
}

function placeTotals(numbers) {
  const rows = numbers.map((nr) => precinctRow(nr)).filter((row) => row && row.reported);
  const votes = {};
  for (const candidate of state.candidates) votes[candidate.id] = sumVotes(rows, candidate.id);
  return {
    reportedCount: rows.length,
    eligible: sumField(rows, "eligible"),
    ballots: sumField(rows, "ballots"),
    validVotes: sumField(rows, "validVotes"),
    invalidVotes: sumField(rows, "invalidVotes"),
    votes,
  };
}

function sumField(rows, key) {
  if (!rows.length) return null;
  let total = 0;
  for (const row of rows) {
    if (typeof row[key] !== "number") return null;
    total += row[key];
  }
  return total;
}

function sumVotes(rows, id) {
  if (!rows.length) return null;
  let total = 0;
  for (const row of rows) {
    const value = row.votes && row.votes[id];
    if (typeof value !== "number") return null;
    total += value;
  }
  return total;
}

function turnoutOf(row) {
  if (!row || typeof row.ballots !== "number" || typeof row.eligible !== "number" || row.eligible <= 0) return "—";
  return percentLabel(row.ballots, row.eligible);
}

function voteCell(candidate, row, nr) {
  const votes = row && row.votes ? row.votes[candidate.id] : null;
  if (candidate.withdrawn) return countCell(votes, "is-withdrawn");
  const valid = row && row.reported ? row.validVotes : null;
  const leader = leaderOf(nr);
  const ahead = leader && leader.id === candidate.id ? " is-ahead" : "";
  return countCell(votes, ahead, valid, candidate.color);
}

function voteTotalCell(candidate, total) {
  const votes = total.votes[candidate.id];
  if (candidate.withdrawn) return countCell(votes, "is-total is-withdrawn");
  return countCell(votes, "is-total", total.validVotes, candidate.color);
}

function countCell(votes, extra = "", valid = null, color = "") {
  const empty = typeof votes !== "number" ? " is-empty" : "";
  const cls = `${extra}${empty}`.trim();
  if (typeof votes !== "number" || valid == null) {
    return `<td${cls ? ` class="${cls}"` : ""}><span class="nums"><strong>${formatCount(votes)}</strong></span></td>`;
  }
  const width = valid > 0 ? (votes / valid) * 100 : 0;
  return `<td${cls ? ` class="${cls}"` : ""}>
      <span class="nums"><strong>${formatCount(votes)}</strong><em>${percentLabel(votes, valid)}</em></span>
      <span class="meter" aria-hidden="true"><span style="width:${width}%;background:${color}"></span></span>
    </td>`;
}

function address(props) {
  return `${titleCase(props.ulica)} ${props.nrBud}`;
}

function titleCase(value) {
  return value
    .toLocaleLowerCase("pl-PL")
    .replace(/(^|[\s\-„”"'])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toLocaleUpperCase("pl-PL"));
}

function formatCount(value) {
  return typeof value === "number" ? numberFormat.format(value) : "—";
}

function formatPercent(value) {
  return typeof value === "number"
    ? `${numberFormat.format(value)}%`
    : "—";
}

function shareOf(votes, valid) {
  const label = percentLabel(votes, valid);
  return label === "—" ? "" : ` · ${label}`;
}

function percentLabel(votes, valid) {
  if (typeof votes !== "number" || typeof valid !== "number" || valid <= 0) return "—";
  return `${numberFormat.format(Math.round((votes / valid) * 1000) / 10)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
