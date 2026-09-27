const numberFormat = new Intl.NumberFormat("pl-PL");

const state = {
  candidates: [],
  results: null,
  stations: null,
  markers: null,
  markerByIndex: new Map(),
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
  L.maplibreGL({
    style: "https://tiles.openfreemap.org/styles/positron",
  }).addTo(map);
  map.attributionControl.addAttribution(
    '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · obwody: <a href="https://msip.krakow.pl/">MSIP Kraków</a>'
  );

  const precinctLayer = L.geoJSON(precincts, {
    style: stylePrecinct,
    onEachFeature(feature, layer) {
      layer.on({
        mouseover(event) {
          event.target.setStyle(hoverPrecinct(feature));
          if (String(feature.properties.nr) !== String(state.highlightNr)) event.target.bringToFront();
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

  state.markers = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 18,
    disableClusteringAtZoom: 14,
    iconCreateFunction() {
      return L.divIcon({
        html: "",
        className: "cluster",
        iconSize: [14, 14],
      });
    },
  });

  stations.features.forEach((feature, index) => {
    const [lng, lat] = feature.geometry.coordinates;
    const marker = L.circleMarker([lat, lng], {
      radius: 5,
      color: "#14171c",
      weight: 1,
      fillColor: "#f4efe6",
      fillOpacity: 0.95,
    });
    marker.on("click", () => openStation(index));
    state.markerByIndex.set(index, marker);
    state.markers.addLayer(marker);
  });
  map.addLayer(state.markers);
  state.map = map;
  fitCity();
  const refitSoon = () => {
    map.invalidateSize({ animate: false });
    fitCity();
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
    weight: 2.25,
    fillOpacity: Math.min(0.9, base.fillOpacity + 0.22),
  };
}

function hoverPrecinct(feature) {
  if (String(feature.properties.nr) === String(state.highlightNr)) return stylePrecinct(feature);
  const base = stylePrecinct(feature);
  return {
    ...base,
    color: "#ffffff",
    weight: 1.35,
    opacity: 0.92,
    fillOpacity: Math.min(0.62, base.fillOpacity + 0.14),
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

function viewPadding() {
  const mapEl = document.querySelector("#map").getBoundingClientRect();
  const panel = document.querySelector(".panel").getBoundingClientRect();
  const sheet = document.querySelector("#place-sheet");
  const zoom = document.querySelector(".leaflet-control-zoom");
  const gap = 18;
  let left = 16;
  let top = 16;
  let right = 56;
  let bottom = 16;
  if (panel.width > 0 && panel.bottom > mapEl.top && panel.top < mapEl.bottom) {
    const coversWidth = panel.width > mapEl.width * 0.72;
    if (coversWidth) top = Math.max(top, panel.bottom - mapEl.top + gap);
    else left = Math.max(left, panel.right - mapEl.left + gap);
  }
  if (sheet && !sheet.hidden) bottom = Math.max(bottom, sheet.getBoundingClientRect().height + gap);
  if (zoom) right = Math.max(right, mapEl.right - zoom.getBoundingClientRect().left + 10);
  return {
    paddingTopLeft: L.point(left, top),
    paddingBottomRight: L.point(right, bottom),
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
  const map = state.map;
  if (!map) return;
  map.invalidateSize({ animate: false });
  const size = map.getSize();
  if (size.x < 40 || size.y < 40) return;
  const pad = viewPadding();
  map.setMinZoom(0);
  const fitted = map.getBoundsZoom(state.cityBounds, false, pad.paddingTopLeft.add(pad.paddingBottomRight));
  if (!Number.isFinite(fitted)) return;
  map.setMinZoom(fitted);
  fitting = true;
  map.flyToBounds(state.cityBounds, { ...pad, duration: 0.45, animate: true });
  fitting = false;
}

function openStation(index, nr) {
  state.highlightNr = nr ? String(nr) : null;
  paintPrecincts();
  showPlace(state.stations.features[index], state.highlightNr);
  hits.hidden = true;
  query.blur();
}

function showPlace(feature, highlightNr) {
  const sheet = document.querySelector("#place-sheet");
  sheet.hidden = false;
  sheet.innerHTML = stationPopup(feature, highlightNr);
  sheet.querySelector(".popup-blocks").style.setProperty("--cols", String(feature.properties.obwody.length));
  sheet.querySelector("[data-close]").addEventListener("click", closeSheet);
  requestAnimationFrame(() => easeCity());
}

function closeSheet() {
  const sheet = document.querySelector("#place-sheet");
  if (sheet.hidden) return;
  sheet.hidden = true;
  sheet.innerHTML = "";
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
  const blocks = [...props.obwody]
    .sort((a, b) => Number(a) - Number(b))
    .map((nr) => precinctBlock(nr, String(nr) === String(highlightNr)))
    .join("");
  return `<header class="popup-place">
      <p class="popup-kicker">Lokal wyborczy</p>
      <h3>${escapeHtml(props.siedziba)}</h3>
      <p class="place">${escapeHtml(address(props))}</p>
    </header>
    <div class="popup-blocks">${blocks}</div>
    <button type="button" class="sheet-close" data-close aria-label="Zamknij">×</button>`;
}

function precinctBlock(nr, highlighted) {
  const row = state.results.precincts[nr];
  const leader = leaderOf(nr);
  const focus = highlighted ? " is-focus" : "";
  if (!row || !row.reported || !leader) {
    return `<section class="precinct-block is-waiting${focus}">
      <div class="precinct-top">
        <h4>Obwód ${escapeHtml(nr)}</h4>
        <p class="awaiting">jeszcze niepoliczone</p>
      </div>
    </section>`;
  }
  const lines = state.candidates
    .map((candidate) => {
      const votes = row.votes[candidate.id];
      const count = typeof votes === "number" ? votes : 0;
      const ahead = candidate.id === leader.id ? " is-ahead" : "";
      const width = row.validVotes > 0 ? (count / row.validVotes) * 100 : 0;
      return `<li class="${ahead.trim()}">
        <span class="who"><span class="swatch" style="background:${candidate.color}"></span><span>${escapeHtml(candidate.short)}</span></span>
        <span class="nums"><strong>${formatCount(votes)}</strong><em>${percentLabel(votes, row.validVotes)}</em></span>
        <span class="meter" aria-hidden="true"><span style="width:${width}%;background:${candidate.color}"></span></span>
      </li>`;
    })
    .join("");
  return `<section class="precinct-block${focus}">
    <div class="precinct-top">
      <h4>Obwód ${escapeHtml(nr)}</h4>
      <p class="winner"><span class="swatch" style="background:${leader.color}"></span>${escapeHtml(leader.short)}</p>
    </div>
    <dl class="tallies">
      <div><dt>Karty</dt><dd>${formatCount(row.ballots)}</dd></div>
      <div><dt>Ważne</dt><dd>${formatCount(row.validVotes)}</dd></div>
      <div><dt>Nieważne</dt><dd>${formatCount(row.invalidVotes)}</dd></div>
    </dl>
    <ul class="vote-lines">${lines}</ul>
  </section>`;
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
