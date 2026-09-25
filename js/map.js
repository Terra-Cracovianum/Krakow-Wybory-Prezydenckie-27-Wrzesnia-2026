const numberFormat = new Intl.NumberFormat("pl-PL");

const state = {
  candidates: [],
  results: null,
  stations: null,
  markers: null,
  markerByIndex: new Map(),
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

  const map = L.map("map", { zoomControl: true, minZoom: 11, maxZoom: 18 });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · obwody: <a href="https://msip.krakow.pl/">MSIP Kraków</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  const precinctLayer = L.geoJSON(precincts, {
    style: stylePrecinct,
    onEachFeature(feature, layer) {
      layer.on({
        mouseover(event) {
          event.target.setStyle({ weight: 2, color: "#f4efe6" });
        },
        mouseout(event) {
          precinctLayer.resetStyle(event.target);
        },
        click() {
          const stationIndex = stationIndexFor(feature.properties.nr);
          if (stationIndex >= 0) openStation(stationIndex);
        },
      });
    },
  }).addTo(map);

  state.markers = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 42,
    iconCreateFunction(cluster) {
      return L.divIcon({
        html: `<span>${cluster.getChildCount()}</span>`,
        className: "cluster",
        iconSize: [34, 34],
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
    marker.bindPopup(() => stationPopup(feature));
    state.markerByIndex.set(index, marker);
    state.markers.addLayer(marker);
  });
  map.addLayer(state.markers);
  map.fitBounds(precinctLayer.getBounds(), { padding: [16, 16] });

  query.addEventListener("input", () => renderHits(query.value));
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== query) {
      event.preventDefault();
      query.focus();
    }
  });
}

function stylePrecinct(feature) {
  const leader = leaderOf(feature.properties.nr);
  if (!leader) {
    return {
      color: "#8b93a7",
      weight: 1,
      fillColor: "#243044",
      fillOpacity: 0.55,
    };
  }
  return {
    color: "#0e1116",
    weight: 1,
    fillColor: leader.color,
    fillOpacity: 0.78,
  };
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

function openStation(index) {
  const marker = state.markerByIndex.get(index);
  state.markers.zoomToShowLayer(marker, () => marker.openPopup());
  hits.hidden = true;
  query.blur();
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
  if (results.status === "awaiting" || results.precinctsReporting === 0) {
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
          <h2>${candidate.ballot}. ${escapeHtml(candidate.name)}</h2>
          <span class="count">${formatCount(votes)}${share}</span>
        </header>
        <p class="meta">${escapeHtml(candidate.committee)} · ${candidate.age} lat · ${escapeHtml(candidate.education)} · ${escapeHtml(candidate.party)}</p>
        ${candidate.note ? `<p class="note">${escapeHtml(candidate.note)}</p>` : ""}
        <div class="bar" aria-hidden="true"><span style="width:${width}%;background:${candidate.color}"></span></div>
      </li>`;
    })
    .join("");
}

function stationPopup(feature) {
  const props = feature.properties;
  const rows = props.obwody
    .map((nr) => {
      const row = state.results.precincts[nr];
      const leader = leaderOf(nr);
      if (!row || !row.reported || !leader) {
        return `<li><span>Obwód ${escapeHtml(nr)}</span><span class="awaiting">wyniki pojawią się po ogłoszeniu</span></li>`;
      }
      return `<li><span>Obwód ${escapeHtml(nr)}</span><span>${escapeHtml(leader.short)} ${formatCount(leader.votes)}</span></li>`;
    })
    .join("");
  return `<h3>${escapeHtml(props.siedziba)}</h3>
    <p>${escapeHtml(address(props))}</p>
    <ul class="popup-rows">${rows}</ul>`;
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
  if (typeof votes !== "number" || typeof valid !== "number" || valid <= 0) return "";
  return ` · ${numberFormat.format(Math.round((votes / valid) * 1000) / 10)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
