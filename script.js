const DATASETS = {
  matches: "matches.csv",
  players: "players.csv",
  goalkeepers: "goalkeepers.csv",
};

const STAT_SERIES = {
  XG: "Expected Goals",
  XGA: "Expected Goals Against",
  GoalsFor: "Goals For",
  GoalsAgainst: "Goals Against",
  PointsPerGame: "Points Per Game",
};

const STAT_COLORS = [
  "#fca311",
  "#e63946",
  "#2a9d8f",
  "#8ac926",
  "#7b2cbf",
];

const TREND_FIELDS = {
  players: {
    G: "Goals",
    A: "Assists",
    Min: "Minutes",
    SoT: "Shots on Target",
    Touches: "Touches",
    Tackles: "Tackles",
    Ints: "Interceptions",
    Blocks: "Blocks",
    xG: "xG",
    npxG: "npxG",
    xAG: "xAG",
    Passes: "Passes",
    PassesA: "Passes Assisted",
    PrgPas: "Progressive Passes",
    Carries: "Carries",
    PrgCar: "Progressive Carries",
    S: "Saves",
  },
  goalkeepers: {
    Min: "Minutes",
    SoTA: "Shots on Target Against",
    GA: "Goals Against",
    Saves: "Saves",
    PSxG: "Post-Shot xG",
    PKatt: "PK Attacks",
    PKA: "PK Against",
    PKm: "PK Misses",
    PassAtt: "Pass Attempts",
    Throws: "Throws",
    AvgLen: "Average Length",
    GKAtt: "GK Attacks",
    GKAvgLen: "GK Average Length",
    SavePct: "Save %",
  },
};

const state = {
  current: "matches",
  datasets: {},
  filters: {},
  expandedCoaches: {},
  trend: {},
  stats: { active: [] },
};

function showError(msg) {
  try {
    const el = document.getElementById("loading");
    if (el) {
      el.classList.remove("hidden");
      el.textContent = `Error: ${msg}`;
    }
  } catch (e) {
    console.error("showError failed", e);
  }
}

window.addEventListener("error", (ev) => {
  showError(ev.message + (ev.filename ? ` (${ev.filename}:${ev.lineno})` : ""));
});
window.addEventListener("unhandledrejection", (ev) => {
  const reason = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason);
  showError(`UnhandledRejection: ${reason}`);
});

function pickMostCommon(values) {
  const counts = values.reduce((acc, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function getPlayerSummary(matches) {
  const aggregated = {};
  const numericFields = [
    "Min",
    "G",
    "A",
    "PK",
    "PKA",
    "S",
    "SoT",
    "Touches",
    "Tackles",
    "Ints",
    "Blocks",
    "xG",
    "npxG",
    "xAG",
    "Passes",
    "PassesA",
    "PrgPas",
    "Carries",
    "PrgCar",
  ];

  matches.forEach((match) => {
    const key = `${match.LastName || ""}||${match.FirstName || ""}`;
    if (!aggregated[key]) {
      aggregated[key] = {
        LastName: match.LastName || "",
        FirstName: match.FirstName || "",
        Matches: 0,
        PosValues: [],
        LineValues: [],
        Captain: [],
      };
      numericFields.forEach((field) => {
        aggregated[key][field] = 0;
      });
    }
    const row = aggregated[key];
    row.Matches += 1;
    row.PosValues.push(match.Pos);
    row.LineValues.push(match.Line);
    row.Captain.push(match.C);
    numericFields.forEach((field) => {
      const value = Number(match[field]);
      if (!Number.isNaN(value)) {
        row[field] += value;
      }
    });
  });

  return Object.values(aggregated).map((row) => {
    const summary = {
      LastName: row.LastName,
      FirstName: row.FirstName,
      Matches: row.Matches,
      Pos: pickMostCommon(row.PosValues),
      Line: pickMostCommon(row.LineValues),
      C: pickMostCommon(row.Captain),
    };

    numericFields.forEach((field) => {
      summary[field] = row[field];
      summary[`${field}PerGame`] = row.Matches ? (row[field] / row.Matches).toFixed(1) : "0.0";
    });

    return summary;
  });
}

function getGoalkeeperSummary(matches) {
  const aggregated = {};
  const numericFields = [
    "Min",
    "SoTA",
    "GA",
    "Saves",
    "PSxG",
    "PKatt",
    "PKA",
    "PKm",
    "PassAtt",
    "Throws",
    "AvgLen",
    "GKAtt",
    "GKAvgLen",
  ];

  matches.forEach((match) => {
    const key = `${match.LastName || ""}||${match.FirstName || ""}`;
    if (!aggregated[key]) {
      aggregated[key] = {
        LastName: match.LastName || "",
        FirstName: match.FirstName || "",
        Matches: 0,
        PosValues: [],
        CS: 0,
      };
      numericFields.forEach((field) => {
        aggregated[key][field] = 0;
      });
    }
    const row = aggregated[key];
    row.Matches += 1;
    row.PosValues.push(match.Pos);
    numericFields.forEach((field) => {
      const value = Number(match[field]);
      if (!Number.isNaN(value)) {
        row[field] += value;
      }
    });
    const gaValue = Number(match.GA);
    if (!Number.isNaN(gaValue) && gaValue === 0) {
      row.CS += 1;
    }
  });

  return Object.values(aggregated).map((row) => {
    const summary = {
      LastName: row.LastName,
      FirstName: row.FirstName,
      Matches: row.Matches,
      CS: row.CS,
      CSPerGame: row.Matches ? (row.CS / row.Matches).toFixed(1) : "0.0",
      SavePct: row.SoTA ? ((row.Saves / row.SoTA) * 100).toFixed(1) + "%" : "0.0%",
    };

    numericFields.forEach((field) => {
      summary[field] = row[field];
      summary[`${field}PerGame`] = row.Matches ? (row[field] / row.Matches).toFixed(1) : "0.0";
    });

    return summary;
  });
}

function parseDate(str) {
  if (!str) return null;
  // try native parse first (ISO-like)
  const iso = Date.parse(str);
  if (!Number.isNaN(iso)) return new Date(iso);
  // dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy
  const dmy = String(str).trim().match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    const y = parseInt(dmy[3], 10);
    return new Date(y, m, d);
  }
  // yyyy-mm-dd or yyyy/mm/dd
  const ymd = String(str).trim().match(/^(\d{4})[\.\/-](\d{1,2})[\.\/-](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return null;
}

function seasonRange(seasonStr) {
  if (!seasonStr) return null;
  const parts = String(seasonStr).trim().match(/^(\d{4})\/(\d{2})$/);
  if (!parts) return null;
  const startYear = parseInt(parts[1], 10);
  const endYear = startYear + 1;
  const startDate = new Date(startYear, 7, 1); // Aug 1
  // special 2019/20 season extends to Aug 2, 2020
  if (startYear === 2019 && endYear === 2020) {
    const endDate = new Date(2020, 7, 1);
    return { startDate, endDate };
  }
  const endDate = new Date(endYear, 5, 30); // Jun 30
  return { startDate, endDate };
}


function getGroundSummary(matches) {
  const filteredMatches = applyFilters(matches);
  const groups = {
    Emirates: {
      Ground: "Emirates Stadium",
      Matches: 0,
      Wins: 0,
      Draws: 0,
      Losses: 0,
      GoalsFor: 0,
      GoalsAgainst: 0,
      AttendanceTotal: 0,
    },
    Other: {
      Ground: "Other stadiums",
      Matches: 0,
      Wins: 0,
      Draws: 0,
      Losses: 0,
      GoalsFor: 0,
      GoalsAgainst: 0,
      AttendanceTotal: 0,
    },
  };

  filteredMatches.forEach((match) => {
    const isEmirates = String(match.Stadium).trim().toLowerCase().includes("emirates");
    const row = isEmirates ? groups.Emirates : groups.Other;
    row.Matches += 1;
    const gf = Number(match.ArsenalScore);
    const ga = Number(match.OpponentScore);
    row.GoalsFor += Number.isNaN(gf) ? 0 : gf;
    row.GoalsAgainst += Number.isNaN(ga) ? 0 : ga;
    if (gf > ga) row.Wins += 1;
    else if (gf === ga) row.Draws += 1;
    else row.Losses += 1;
    const attendance = Number(match.Attendance.toString().replace(/,/g, ""));
    if (!Number.isNaN(attendance)) {
      row.AttendanceTotal += attendance;
    }
  });

  return Object.values(groups).map((item) => {
    return {
      ...item,
      WinPct: item.Matches ? ((item.Wins / item.Matches) * 100).toFixed(1) + "%" : "0%",
      AvgAttendance: item.Matches ? Math.round(item.AttendanceTotal / item.Matches).toLocaleString() : "N/A",
    };
  });
}

function getCoachSummary(matches) {
  const hoawSel = state.filters.HoAw;

  // Always aggregate by coach across all seasons
  const aggregatedByCoach = {};
  const aggregatedByCoachSeason = {};

  matches.forEach((match) => {
    if (hoawSel && hoawSel !== "") {
      if ((match.HoAw || "") !== hoawSel) return;
    }
    const coach = match.Coach || "Unknown";
    const season = match.Season || "Unknown";

    // Total coach aggregation
    if (!aggregatedByCoach[coach]) {
      aggregatedByCoach[coach] = {
        Coach: coach,
        Matches: 0,
        Wins: 0,
        Draws: 0,
        Losses: 0,
        GoalsFor: 0,
        GoalsAgainst: 0,
        AttendanceTotal: 0,
        EmiratesAttendanceTotal: 0,
        EmiratesMatches: 0,
        FirstDate: null,
        seasons: {},
      };
    }
    const coachItem = aggregatedByCoach[coach];
    coachItem.Matches += 1;
    const gf = Number(match.ArsenalScore);
    const ga = Number(match.OpponentScore);
    coachItem.GoalsFor += Number.isNaN(gf) ? 0 : gf;
    coachItem.GoalsAgainst += Number.isNaN(ga) ? 0 : ga;
    if (gf > ga) coachItem.Wins += 1;
    else if (gf === ga) coachItem.Draws += 1;
    else coachItem.Losses += 1;
    const attendance = Number(match.Attendance.toString().replace(/,/g, ""));
    if (!Number.isNaN(attendance)) {
      coachItem.AttendanceTotal += attendance;
    }
    const isEmirates = String(match.Stadium).trim().toLowerCase().includes("emirates");
    if (isEmirates && !Number.isNaN(attendance)) {
      coachItem.EmiratesAttendanceTotal += attendance;
      coachItem.EmiratesMatches += 1;
    }
    const matchDate = parseDate(match.Date);
    if (matchDate && (!coachItem.FirstDate || matchDate < coachItem.FirstDate)) {
      coachItem.FirstDate = matchDate;
    }

    // Per-season aggregation within coach
    const seasonKey = `${coach}||${season}`;
    if (!aggregatedByCoachSeason[seasonKey]) {
      aggregatedByCoachSeason[seasonKey] = {
        Coach: coach,
        Season: season,
        Matches: 0,
        Wins: 0,
        Draws: 0,
        Losses: 0,
        GoalsFor: 0,
        GoalsAgainst: 0,
        AttendanceTotal: 0,
        EmiratesAttendanceTotal: 0,
        EmiratesMatches: 0,
        FirstDate: null,
      };
    }
    const seasonItem = aggregatedByCoachSeason[seasonKey];
    seasonItem.Matches += 1;
    seasonItem.GoalsFor += Number.isNaN(gf) ? 0 : gf;
    seasonItem.GoalsAgainst += Number.isNaN(ga) ? 0 : ga;
    if (gf > ga) seasonItem.Wins += 1;
    else if (gf === ga) seasonItem.Draws += 1;
    else seasonItem.Losses += 1;
    if (!Number.isNaN(attendance)) {
      seasonItem.AttendanceTotal += attendance;
    }
    if (isEmirates && !Number.isNaN(attendance)) {
      seasonItem.EmiratesAttendanceTotal += attendance;
      seasonItem.EmiratesMatches += 1;
    }
    if (matchDate && (!seasonItem.FirstDate || matchDate < seasonItem.FirstDate)) {
      seasonItem.FirstDate = matchDate;
    }
    
    // Store season data in coach object
    if (!coachItem.seasons[season]) {
      coachItem.seasons[season] = seasonItem;
    }
  });

  // Build final coach list with totals and embedded seasonal data
  const coaches = Object.values(aggregatedByCoach)
    .sort((a, b) => {
      if (a.FirstDate && b.FirstDate) return a.FirstDate - b.FirstDate;
      if (a.FirstDate) return -1;
      if (b.FirstDate) return 1;
      return a.Coach.localeCompare(b.Coach, undefined, { sensitivity: "base" });
    })
    .map((item) => {
      const seasonArray = Object.entries(item.seasons)
        .map(([season, sData]) => ({
          Coach: item.Coach,
          Season: season,
          Matches: sData.Matches,
          WinPct: sData.Matches ? ((sData.Wins / sData.Matches) * 100).toFixed(1) + "%" : "0%",
          Wins: sData.Wins,
          Draws: sData.Draws,
          Losses: sData.Losses,
          Points: sData.Wins * 3 + sData.Draws * 1,
          PointsPerGame: sData.Matches ? ((sData.Wins * 3 + sData.Draws * 1) / sData.Matches).toFixed(2) : "0.00",
          GoalsFor: sData.GoalsFor,
          GoalsForPerGame: sData.Matches ? (sData.GoalsFor / sData.Matches).toFixed(2) : "0.00",
          GoalsAgainst: sData.GoalsAgainst,
          GoalsAgainstPerGame: sData.Matches ? (sData.GoalsAgainst / sData.Matches).toFixed(2) : "0.00",
          "Avg Attendance Emirates Stadium": sData.EmiratesMatches ? Math.round(sData.EmiratesAttendanceTotal / sData.EmiratesMatches).toLocaleString() : "N/A",
        }))
        .sort((a, b) => seasonStartYear(a.Season) - seasonStartYear(b.Season));

      return {
        Coach: item.Coach,
        Matches: item.Matches,
        WinPct: item.Matches ? ((item.Wins / item.Matches) * 100).toFixed(1) + "%" : "0%",
        Wins: item.Wins,
        Draws: item.Draws,
        Losses: item.Losses,
        Points: item.Wins * 3 + item.Draws * 1,
        PointsPerGame: item.Matches ? ((item.Wins * 3 + item.Draws * 1) / item.Matches).toFixed(2) : "0.00",
        GoalsFor: item.GoalsFor,
        GoalsForPerGame: item.Matches ? (item.GoalsFor / item.Matches).toFixed(2) : "0.00",
        GoalsAgainst: item.GoalsAgainst,
        GoalsAgainstPerGame: item.Matches ? (item.GoalsAgainst / item.Matches).toFixed(2) : "0.00",
        "Avg Attendance Emirates Stadium": item.EmiratesMatches ? Math.round(item.EmiratesAttendanceTotal / item.EmiratesMatches).toLocaleString() : "N/A",
        _expanded: !!state.expandedCoaches[item.Coach],
        _seasons: seasonArray,
      };
    });

  return coaches;
}

function seasonStartYear(season) {
  const parts = String(season).trim().match(/^(\d{4})\/\d{2}$/);
  return parts ? Number(parts[1]) : Number.MAX_SAFE_INTEGER;
}

function getRefereeSummary(matches) {
  const filtered = applyFilters(matches);
  const agg = {};
  filtered.forEach((match) => {
    const ref = match.Referee || "Unknown";
    if (!agg[ref]) {
      agg[ref] = { Referee: ref, Matches: 0, Wins: 0, Draws: 0, Losses: 0, GoalsFor: 0, GoalsAgainst: 0 };
    }
    const item = agg[ref];
    item.Matches += 1;
    const gf = Number(match.ArsenalScore);
    const ga = Number(match.OpponentScore);
    item.GoalsFor += Number.isNaN(gf) ? 0 : gf;
    item.GoalsAgainst += Number.isNaN(ga) ? 0 : ga;
    if (gf > ga) item.Wins += 1;
    else if (gf === ga) item.Draws += 1;
    else item.Losses += 1;
  });

  return Object.values(agg).map((it) => ({
    Referee: it.Referee,
    Matches: it.Matches,
    Wins: it.Wins,
    Draws: it.Draws,
    Losses: it.Losses,
    GoalsFor: it.GoalsFor,
    GoalsAgainst: it.GoalsAgainst,
    WinPct: it.Matches ? ((it.Wins / it.Matches) * 100).toFixed(1) + "%" : "0%",
  })).sort((a, b) => parseFloat(b.WinPct) - parseFloat(a.WinPct));
}

function sortMatchesBySeason(matches) {
  return [...matches].sort((a, b) => {
    const seasonA = seasonStartYear(a.Season);
    const seasonB = seasonStartYear(b.Season);
    if (seasonA !== seasonB) return seasonA - seasonB;

    const dateA = parseDate(a.Date);
    const dateB = parseDate(b.Date);
    if (dateA && dateB) return dateA - dateB;
    if (dateA) return -1;
    if (dateB) return 1;

    return 0;
  });
}

function getCurrentData() {
  const ds = state.datasets || {};
  switch (state.current) {
    case "matches":
      return sortMatchesBySeason(ds.matches || []);
    case "players":
      return getPlayerSummary(ds.players || []);
    case "goalkeepers":
      return getGoalkeeperSummary(ds.goalkeepers || []);
    case "referees":
      return getRefereeSummary(ds.matches || []);
    case "grounds":
      return getGroundSummary(ds.matches || []);
    case "coaches":
      return getCoachSummary(ds.matches || []);
    case "stats":
      return sortMatchesBySeason(ds.matches || []);
    default:
      return ds[state.current] || [];
  }
}

const loadingEl = document.getElementById("loading");
const dashboardEl = document.getElementById("dashboard");
const tableSectionEl = document.getElementById("table-section");
const chartSectionEl = document.getElementById("chart-section");
const insightSectionEl = document.getElementById("insight-section");
const tableTitleEl = document.getElementById("table-title");
const rowCountEl = document.getElementById("row-count");
const dataTableEl = document.getElementById("data-table");
const summaryPanelEl = document.getElementById("summary-panel");
const filtersPanelEl = document.getElementById("filters-panel");
const diagnosticsEl = document.getElementById("diagnostics");

const navButtons = Array.from(document.querySelectorAll("nav button"));
navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    setDataset(button.dataset.dataset);
  });
});

async function loadCsv(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${url}`);
  }
  const text = await response.text();
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
    });
  });
}

async function init() {
  try {
    const keys = Object.keys(DATASETS);
    if (diagnosticsEl) diagnosticsEl.textContent = "Loading datasets...";
    const promises = keys.map((key) => loadCsv(DATASETS[key]));
    const results = await Promise.all(promises);
    keys.forEach((key, index) => {
      state.datasets[key] = results[index];
    });
    if (state.datasets.matches) {
      state.datasets.matches = sortMatchesBySeason(state.datasets.matches);
    }
    // show diagnostics
    if (diagnosticsEl) {
      diagnosticsEl.innerHTML = keys.map((k) => `<div>${k}: ${state.datasets[k].length.toLocaleString()} rows</div>`).join("");
    }
    loadingEl.classList.add("hidden");
    dashboardEl.classList.remove("hidden");
    tableSectionEl.classList.remove("hidden");
    insightSectionEl.classList.remove("hidden");
    renderCurrent();
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    if (diagnosticsEl) diagnosticsEl.textContent = `Error loading data: ${msg}`;
    loadingEl.textContent = `Error loading data: ${msg}`;
  }
}

function setDataset(dataset) {
  state.current = dataset;
  state.filters = {};
  state.expandedCoaches = {};
  state.trend = {};
  state.stats.active = [];
  renderCurrent();
}

function renderCurrent() {
  const data = getCurrentData();
  tableTitleEl.textContent = state.current.charAt(0).toUpperCase() + state.current.slice(1);
  rowCountEl.textContent = `${data.length.toLocaleString()} rows`;
  renderSummary(data);
  renderFilters(data);

  if (state.current === "stats") {
    tableSectionEl.classList.add("hidden");
    insightSectionEl.classList.add("hidden");
  } else {
    tableSectionEl.classList.remove("hidden");
    insightSectionEl.classList.remove("hidden");
    renderTable(data);
    renderInsight(data);
  }

  if (typeof renderChart === "function") {
    renderChart(data);
  }
}

function renderSummary(data) {
  summaryPanelEl.innerHTML = "";
  const title = document.createElement("h2");
  const total = document.createElement("p");
  title.textContent = `${state.current.charAt(0).toUpperCase() + state.current.slice(1)} summary`;
  total.textContent = state.current === "stats"
    ? `Matches available: ${data.length.toLocaleString()}`
    : `Dataset has ${data.length.toLocaleString()} records.`;
  summaryPanelEl.appendChild(title);
  summaryPanelEl.appendChild(total);
  if (state.current === "stats") {
    const description = document.createElement("p");
    description.textContent = "Toggle the normalized series below to compare match metrics on the same time axis.";
    summaryPanelEl.appendChild(description);
  }
}

function createSelect(labelText, name, options) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  select.name = name;
  select.addEventListener("change", () => {
    state.filters[name] = select.value || undefined;
    renderCurrent();
  });
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = `All ${labelText.toLowerCase()}`;
  select.appendChild(emptyOption);
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    select.appendChild(opt);
  });
  label.appendChild(select);
  return label;
}

function applyFilters(data) {
  return data.filter((row) => {
    for (const [key, value] of Object.entries(state.filters)) {
      if (!value) continue;
      if (!row[key]) return false;
      if (row[key] !== value) return false;
    }
    return true;
  });
}

function uniqueSorted(data, field) {
  return [...new Set(data.map((row) => row[field]).filter(Boolean))].sort((a, b) => {
    if (!Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
      return Number(a) - Number(b);
    }
    return a.toString().localeCompare(b.toString(), undefined, { numeric: true });
  });
}

function renderFilters(data) {
  filtersPanelEl.innerHTML = "";
  if (state.current === "matches" || state.current === "referees" || state.current === "grounds") {
    const seasonOptions = uniqueSorted(state.datasets.matches || [], "Season");
    const homeAwayOptions = uniqueSorted(state.datasets.matches || [], "HoAw");
    filtersPanelEl.appendChild(createSelect("Season", "Season", seasonOptions));
    filtersPanelEl.appendChild(createSelect("Home/Away", "HoAw", homeAwayOptions));
  } else if (state.current === "coaches") {
    const homeAwayOptions = uniqueSorted(state.datasets.matches || [], "HoAw");
    filtersPanelEl.appendChild(createSelect("Home/Away", "HoAw", homeAwayOptions));
  } else if (state.current === "players") {
    const positionOptions = uniqueSorted(data, "Pos");
    const lineOptions = uniqueSorted(data, "Line");
    filtersPanelEl.appendChild(createSelect("Position", "Pos", positionOptions));
    filtersPanelEl.appendChild(createSelect("Line", "Line", lineOptions));
  } else if (state.current === "goalkeepers") {
    // Goalkeepers have a summarized view without position as a visible stat.
  }
  if (filtersPanelEl.children.length === 0) {
    filtersPanelEl.innerHTML = "<p>No filters available for this dataset.</p>";
  }
}

function renderTable(data) {
  let filteredData = (state.current === "referees" || state.current === "coaches") ? data : applyFilters(data);
  if (state.current === "matches") {
    filteredData = sortMatchesBySeason(filteredData);
  }
  const sample = filteredData.slice(0, 50);
  dataTableEl.innerHTML = "";

  if (!sample.length) {
    dataTableEl.innerHTML = "<tr><td>No rows match the selected filters.</td></tr>";
    return;
  }

  const keys = Object.keys(sample[0]).filter((k) => !k.startsWith("_"));
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  
  // Add expand column for coaches
  if (state.current === "coaches") {
    const thExpand = document.createElement("th");
    thExpand.textContent = "";
    thExpand.style.width = "40px";
    headRow.appendChild(thExpand);
  }
  
  keys.forEach((key) => {
    const th = document.createElement("th");
    th.textContent = key;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  dataTableEl.appendChild(thead);

  const tbody = document.createElement("tbody");
  sample.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    tr.className = "coach-row";
    
    // Add expand button for coaches
    if (state.current === "coaches") {
      const tdExpand = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = row._expanded ? "−" : "+";
      btn.style.width = "30px";
      btn.style.cursor = "pointer";
      btn.onclick = (e) => {
        e.stopPropagation();
        const coachName = row.Coach;
        if (state.expandedCoaches[coachName]) {
          delete state.expandedCoaches[coachName];
        } else {
          state.expandedCoaches[coachName] = true;
        }
        renderCurrent();
      };
      tdExpand.appendChild(btn);
      tr.appendChild(tdExpand);
    }
    
    keys.forEach((key) => {
      const td = document.createElement("td");
      td.textContent = formatNumber(row[key]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);

    // Add seasonal sub-rows if coach is expanded
    if (state.current === "coaches" && row._expanded && row._seasons) {
      row._seasons.forEach((season) => {
        const seasonTr = document.createElement("tr");
        seasonTr.className = "season-sub-row";
        seasonTr.style.backgroundColor = "#f9f9f9";
        
        // Empty expand cell
        const tdEmpty = document.createElement("td");
        seasonTr.appendChild(tdEmpty);
        
        // Add Season column first
        const tdSeason = document.createElement("td");
        tdSeason.textContent = season.Season || "";
        tdSeason.style.paddingLeft = "30px";
        tdSeason.style.fontWeight = "600";
        seasonTr.appendChild(tdSeason);
        
        // Then add the rest of the keys (skipping Coach which is repeated)
        keys.slice(1).forEach((key) => {
          const td = document.createElement("td");
          const val = season[key];
          td.textContent = formatNumber(val);
          seasonTr.appendChild(td);
        });
        tbody.appendChild(seasonTr);
      });
    }
  });
  dataTableEl.appendChild(tbody);
}

function renderInsight(data) {
  insightSectionEl.innerHTML = "";
  const filteredData = (state.current === "referees" || state.current === "coaches") ? data : applyFilters(data);
  const insightData = state.current === "coaches"
    ? filteredData.filter((row) => row._seasons && !row.Season)
    : filteredData;
  const insightTitle = document.createElement("h3");
  insightTitle.textContent = "Quick insights";
  insightSectionEl.appendChild(insightTitle);

  const grid = document.createElement("div");
  grid.className = "metric-grid";

  if (state.current === "matches") {
    const totalMatches = insightData.length;
    const wins = insightData.filter((row) => Number(row.ArsenalScore) > Number(row.OpponentScore)).length;
    const draws = insightData.filter((row) => Number(row.ArsenalScore) === Number(row.OpponentScore)).length;
    const losses = insightData.filter((row) => Number(row.ArsenalScore) < Number(row.OpponentScore)).length;
    const averageAttendance = averageValue(insightData, "Attendance");
    grid.appendChild(createMetric("Matches", totalMatches));
    grid.appendChild(createMetric("Wins", wins));
    grid.appendChild(createMetric("Draws", draws));
    grid.appendChild(createMetric("Losses", losses));
    grid.appendChild(createMetric("Avg Attendance", averageAttendance ? averageAttendance.toLocaleString() : "N/A"));
  } else if (state.current === "players") {
    const topGoal = topByField(insightData, "G", 5);
    const topAssist = topByField(insightData, "A", 5);
    const topMinutes = topByField(insightData, "Min", 5);
    grid.appendChild(createMetric("Records", insightData.length));
    grid.appendChild(createMetric("Top goals in a match", topGoal[0] || "N/A"));
    grid.appendChild(createMetric("Top assists in a match", topAssist[0] || "N/A"));
    grid.appendChild(createMetric("Top minutes played", topMinutes[0] || "N/A"));
  } else if (state.current === "goalkeepers") {
    const topSaves = topByField(insightData, "Saves", 5);
    const lowestGA = lowestByField(insightData, "GA", 5);
    grid.appendChild(createMetric("Records", insightData.length));
    grid.appendChild(createMetric("Best saves", topSaves[0] || "N/A"));
    grid.appendChild(createMetric("Best GA", lowestGA[0] || "N/A"));
    grid.appendChild(createMetric("Avg minutes", averageValue(insightData, "Min")?.toFixed(1) ?? "N/A"));
  } else if (state.current === "referees") {
    const topReferee = insightData.slice(0, 1)[0];
    grid.appendChild(createMetric("Referees", insightData.length));
    grid.appendChild(createMetric("Top Win %", topReferee ? topReferee.WinPct : "N/A"));
    grid.appendChild(createMetric("Top Wins", topReferee ? `${topReferee.Referee} (${topReferee.Wins})` : "N/A"));
    grid.appendChild(createMetric("Avg Goals For", insightData.length ? (insightData.reduce((sum, row) => sum + Number(row.GoalsFor), 0) / insightData.length).toFixed(1) : "N/A"));
  } else if (state.current === "grounds") {
    const emirates = insightData.find((row) => row.Ground === "Emirates Stadium");
    const others = insightData.find((row) => row.Ground === "Other stadiums");
    grid.appendChild(createMetric("Groups", insightData.length));
    grid.appendChild(createMetric("Emirates Win %", emirates ? emirates.WinPct : "N/A"));
    grid.appendChild(createMetric("Other Win %", others ? others.WinPct : "N/A"));
    grid.appendChild(createMetric("Emirates Avg Attend", emirates ? emirates.AvgAttendance : "N/A"));
  }
  else if (state.current === "coaches") {
    const topCoach = insightData.slice(0, 1)[0];
    grid.appendChild(createMetric("Coaches", insightData.length));
    grid.appendChild(createMetric("Top Win %", topCoach ? topCoach.WinPct : "N/A"));
    grid.appendChild(createMetric("Top Wins", topCoach ? `${topCoach.Coach} (${topCoach.Wins})` : "N/A"));
    grid.appendChild(createMetric("Avg Goals For", insightData.length ? (insightData.reduce((sum, row) => sum + Number(row.GoalsFor), 0) / insightData.length).toFixed(1) : "N/A"));
    grid.appendChild(createMetric("Top Points Per Game", topCoach ? topCoach.PointsPerGame : "N/A"));
  }

  insightSectionEl.appendChild(grid);
}

function getPlayerKey(match) {
  return `${match.LastName || ""}||${match.FirstName || ""}`;
}

function getTrendKeys(datasetKey) {
  const keys = new Set();
  (state.datasets[datasetKey] || []).forEach((match) => {
    keys.add(getPlayerKey(match));
  });
  return [...keys].sort((a, b) => {
    const [aLast, aFirst] = a.split("||");
    const [bLast, bFirst] = b.split("||");
    const last = aLast.localeCompare(bLast, undefined, { sensitivity: "base" });
    return last !== 0 ? last : aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
  });
}

function getMatchTrend(datasetKey, entityKey, field) {
  const blockSize = 10;
  const matchData = (state.datasets[datasetKey] || [])
    .filter((match) => getPlayerKey(match) === entityKey)
    .map((match) => {
      const rawValue = field === "SavePct"
        ? (Number(match.Saves) / Number(match.SoTA)) * 100
        : Number(match[field]);
      return {
        date: parseDate(match.Date),
        dateLabel: match.Date || "",
        season: match.Season || "Unknown",
        value: Number.isNaN(rawValue) ? 0 : rawValue,
      };
    })
    .filter((entry) => entry.date)
    .sort((a, b) => a.date - b.date);

  const blocks = [];
  for (let i = 0; i < matchData.length; i += blockSize) {
    const chunk = matchData.slice(i, i + blockSize);
    const total = chunk.reduce((sum, item) => sum + item.value, 0);
    const average = chunk.length ? total / chunk.length : 0;
    const firstDate = chunk[0]?.dateLabel || "";
    const lastDate = chunk[chunk.length - 1]?.dateLabel || "";
    blocks.push({
      date: chunk[0]?.date || null,
      dateLabel: chunk.length === 1 ? firstDate : `${firstDate} – ${lastDate}`,
      season: chunk[0]?.season || "Unknown",
      value: average,
      games: chunk.length,
      label: `${i + 1}-${i + chunk.length}`,
    });
  }
  return blocks;
}

function getStatsSeries() {
  const byMatch = {};
  (state.datasets.matches || []).forEach((match) => {
    const key = `${match.Date || ""}`;
    const date = parseDate(match.Date);
    const arsenal = Number(match.ArsenalScore);
    const opponent = Number(match.OpponentScore);
    const points = arsenal > opponent ? 3 : arsenal === opponent ? 1 : 0;

    byMatch[key] = {
      season: match.Season || "Unknown",
      date,
      dateLabel: match.Season || "Unknown",
      ArsenalGoals: Number.isNaN(arsenal) ? 0 : arsenal,
      OpponentGoals: Number.isNaN(opponent) ? 0 : opponent,
      Points: points,
      xG: 0,
      xGA: 0,
    };
  });

  (state.datasets.players || []).forEach((player) => {
    const key = `${player.Date || ""}`;
    if (!byMatch[key]) return;
    const xG = Number(player.xG);
    const xGA = Number(player.xAG);
    if (!Number.isNaN(xG)) byMatch[key].xG += xG;
    if (!Number.isNaN(xGA)) byMatch[key].xGA += xGA;
  });

  const seasonData = {};
  Object.values(byMatch).forEach((match) => {
    const season = match.season || "Unknown";
    if (!seasonData[season]) {
      seasonData[season] = {
        season,
        matches: 0,
        totalXG: 0,
        totalXGA: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        totalPoints: 0,
      };
    }
    const row = seasonData[season];
    row.matches += 1;
    row.totalXG += match.xG;
    row.totalXGA += match.xGA;
    row.goalsFor += match.ArsenalGoals;
    row.goalsAgainst += match.OpponentGoals;
    row.totalPoints += match.Points;
  });

  return Object.values(seasonData)
    .sort((a, b) => {
      const yearA = seasonStartYear(a.season);
      const yearB = seasonStartYear(b.season);
      return yearA - yearB;
    })
    .map((season) => ({
      season: season.season,
      label: season.season,
      XG: season.matches ? season.totalXG / season.matches : 0,
      XGA: season.matches ? season.totalXGA / season.matches : 0,
      GoalsFor: season.matches ? season.goalsFor / season.matches : 0,
      GoalsAgainst: season.matches ? season.goalsAgainst / season.matches : 0,
      PointsPerGame: season.matches ? season.totalPoints / season.matches : 0,
    }));
}

function normalizeSeries(series, key) {
  const values = series.map((item) => item[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return series.map((item) => ({
    ...item,
    normalized: (item[key] - min) / range,
  }));
}

function renderStatsChart() {
  const series = getStatsSeries();
  if (!series.length) {
    chartSectionEl.classList.remove("hidden");
    chartSectionEl.innerHTML = "<p class='chart-no-data'>No stats available.</p>";
    return;
  }

  const stats = Object.keys(STAT_SERIES);
  let activeStats = state.stats.active.length ? state.stats.active : ["XG", "XGA", "GoalsFor", "GoalsAgainst", "PointsPerGame"];
  activeStats = activeStats.filter((key) => stats.includes(key));
  if (!activeStats.length) activeStats = ["XG", "XGA", "GoalsFor", "GoalsAgainst", "PointsPerGame"];
  state.stats.active = activeStats;

  const controls = document.createElement("div");
  controls.className = "chart-controls";
  const controlLabel = document.createElement("div");
  controlLabel.textContent = "Toggle stats";
  controlLabel.style.fontWeight = "700";
  controlLabel.style.color = "var(--muted)";
  controls.appendChild(controlLabel);

  stats.forEach((stat, index) => {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "0.5rem";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = stat;
    checkbox.checked = activeStats.includes(stat);
    checkbox.addEventListener("change", () => {
      const next = new Set(state.stats.active);
      if (checkbox.checked) next.add(stat);
      else next.delete(stat);
      state.stats.active = [...next];
      renderStatsChart();
    });
    const colorSwatch = document.createElement("span");
    colorSwatch.style.display = "inline-block";
    colorSwatch.style.width = "14px";
    colorSwatch.style.height = "14px";
    colorSwatch.style.backgroundColor = STAT_COLORS[index % STAT_COLORS.length];
    colorSwatch.style.borderRadius = "3px";
    label.appendChild(checkbox);
    label.appendChild(colorSwatch);
    label.appendChild(document.createTextNode(STAT_SERIES[stat]));
    controls.appendChild(label);
  });

  chartSectionEl.classList.remove("hidden");
  chartSectionEl.innerHTML = "";
  chartSectionEl.appendChild(controls);

  const title = document.createElement("h3");
  title.textContent = "Normalized season metrics over time";
  chartSectionEl.appendChild(title);

  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent = "All metrics are shown on a per-game basis and normalized for comparison. Hover points to see the actual per-game values.";
  chartSectionEl.appendChild(note);

  const activeSeries = series.map((item) => ({ ...item }));
  const normalizedSeries = activeStats.map((stat, index) => ({
    key: stat,
    label: STAT_SERIES[stat],
    color: STAT_COLORS[index % STAT_COLORS.length],
    values: normalizeSeries(activeSeries, stat),
    actualValues: activeSeries.map((item) => item[stat]),
  }));

  const summaryBlock = document.createElement("div");
  summaryBlock.className = "chart-stat-summary";
  normalizedSeries.forEach((seriesItem) => {
    const values = seriesItem.actualValues.filter((v) => typeof v === "number" && !Number.isNaN(v));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const avg = values.length ? (values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
    const statLine = document.createElement("div");
    statLine.className = "chart-stat-summary-item";
    statLine.innerHTML = `<strong style="color:${seriesItem.color}">${seriesItem.label}</strong>: min ${formatNumber(min)}, avg ${formatNumber(avg)}, max ${formatNumber(max)}`;
    summaryBlock.appendChild(statLine);
  });
  chartSectionEl.appendChild(summaryBlock);

  const svg = createSvgElement("svg");
  svg.classList.add("chart-svg");
  svg.setAttribute("viewBox", "0 0 900 360");
  svg.setAttribute("preserveAspectRatio", "none");

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip hidden";
  chartSectionEl.appendChild(tooltip);

  const showInlineLabels = activeSeries.length <= 8;

  const margin = { top: 30, right: 30, bottom: 60, left: 55 };
  const width = 900;
  const height = 360;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const points = activeSeries.map((item, index) => ({
    x: margin.left + (chartWidth * index) / Math.max(activeSeries.length - 1, 1),
    label: item.season || item.label || item.dateLabel,
  }));

  const axis = createSvgElement("g");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "rgba(255,255,255,0.12)");
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + (chartHeight * i) / 4;
    const line = createSvgElement("line");
    line.setAttribute("x1", margin.left);
    line.setAttribute("x2", width - margin.right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    axis.appendChild(line);
    const label = createSvgElement("text");
    label.setAttribute("x", margin.left - 8);
    label.setAttribute("y", y + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "12");
    label.setAttribute("fill", "var(--muted)");
    label.textContent = `${((1 - i / 4) * 100).toFixed(0)}%`;
    axis.appendChild(label);
  }
  const yAxisLabel = createSvgElement("text");
  yAxisLabel.setAttribute("x", margin.left - 30);
  yAxisLabel.setAttribute("y", margin.top - 10);
  yAxisLabel.setAttribute("text-anchor", "middle");
  yAxisLabel.setAttribute("font-size", "12");
  yAxisLabel.setAttribute("fill", "var(--muted)");
  yAxisLabel.textContent = "Normalized";
  axis.appendChild(yAxisLabel);
  svg.appendChild(axis);

  const updateTooltip = (event, text) => {
    const rect = chartSectionEl.getBoundingClientRect();
    tooltip.textContent = text;
    tooltip.classList.remove("hidden");
    const left = Math.min(rect.width - tooltip.offsetWidth - 12, event.clientX - rect.left + 12);
    const top = Math.max(12, event.clientY - rect.top + 12);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  normalizedSeries.forEach((seriesItem) => {
    const path = createSvgElement("path");
    const d = seriesItem.values
      .map((item, index) => {
        const y = margin.top + chartHeight - item.normalized * chartHeight;
        return `${index === 0 ? "M" : "L"}${points[index].x},${y}`;
      })
      .join(" ");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", seriesItem.color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("d", d);
    svg.appendChild(path);

    seriesItem.values.forEach((item, index) => {
      const y = margin.top + chartHeight - item.normalized * chartHeight;
      const circle = createSvgElement("circle");
      circle.setAttribute("cx", points[index].x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", seriesItem.color);
      const valueText = `${seriesItem.label} (${points[index].label}): ${formatNumber(item[seriesItem.key])}`;
      circle.addEventListener("pointerenter", (event) => updateTooltip(event, valueText));
      circle.addEventListener("pointermove", (event) => updateTooltip(event, valueText));
      circle.addEventListener("pointerleave", () => tooltip.classList.add("hidden"));
      svg.appendChild(circle);

      if (showInlineLabels) {
        const valueLabel = createSvgElement("text");
        valueLabel.setAttribute("x", points[index].x);
        valueLabel.setAttribute("y", y - 8);
        valueLabel.setAttribute("text-anchor", "middle");
        valueLabel.setAttribute("font-size", "11");
        valueLabel.setAttribute("fill", seriesItem.color);
        valueLabel.textContent = formatNumber(item[seriesItem.key]);
        svg.appendChild(valueLabel);
      }
    });
  });

  const labelStep = Math.max(1, Math.ceil(activeSeries.length / 10));
  activeSeries.forEach((item, index) => {
    if (index % labelStep !== 0 && index !== activeSeries.length - 1) return;
    const text = createSvgElement("text");
    text.setAttribute("x", points[index].x);
    text.setAttribute("y", height - 10);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "12");
    text.setAttribute("fill", "var(--muted)");
    text.textContent = points[index].label || item.season || item.label || item.dateLabel;
    svg.appendChild(text);
  });

  chartSectionEl.appendChild(svg);
}

function renderChart() {
  if (!chartSectionEl) return;
  if (state.current === "stats") {
    renderStatsChart();
    return;
  }
  if (!["players", "goalkeepers"].includes(state.current)) {
    chartSectionEl.classList.add("hidden");
    chartSectionEl.innerHTML = "";
    return;
  }

  const fields = TREND_FIELDS[state.current] || {};
  const entityKeys = getTrendKeys(state.current);
  if (!entityKeys.length) {
    chartSectionEl.classList.remove("hidden");
    chartSectionEl.innerHTML = "<p class='chart-no-data'>No trend data available.</p>";
    return;
  }

  const selectedEntity = entityKeys.includes(state.trend.entity) ? state.trend.entity : entityKeys[0];
  const selectedStat = fields[state.trend.stat] ? state.trend.stat : Object.keys(fields)[0];
  state.trend.entity = selectedEntity;
  state.trend.stat = selectedStat;

  const controls = document.createElement("div");
  controls.className = "chart-controls";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = state.current === "goalkeepers" ? "Goalkeeper" : "Player";
  const nameSelect = document.createElement("select");
  entityKeys.forEach((key) => {
    const [last, first] = key.split("||");
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${first} ${last}`.trim();
    if (key === selectedEntity) option.selected = true;
    nameSelect.appendChild(option);
  });
  nameLabel.appendChild(nameSelect);
  controls.appendChild(nameLabel);

  const statLabel = document.createElement("label");
  statLabel.textContent = "Stat";
  const statSelect = document.createElement("select");
  Object.entries(fields).forEach(([field, label]) => {
    const option = document.createElement("option");
    option.value = field;
    option.textContent = label;
    if (field === selectedStat) option.selected = true;
    statSelect.appendChild(option);
  });
  statLabel.appendChild(statSelect);
  controls.appendChild(statLabel);

  chartSectionEl.classList.remove("hidden");
  chartSectionEl.innerHTML = "";
  chartSectionEl.appendChild(controls);

  nameSelect.addEventListener("change", () => {
    state.trend.entity = nameSelect.value;
    renderChart();
  });
  statSelect.addEventListener("change", () => {
    state.trend.stat = statSelect.value;
    renderChart();
  });

  const trendData = getMatchTrend(state.current, selectedEntity, selectedStat);
  if (!trendData.length) {
    const empty = document.createElement("p");
    empty.className = "chart-no-data";
    empty.textContent = "No data found for this selection.";
    chartSectionEl.appendChild(empty);
    return;
  }

  const title = document.createElement("h3");
  title.textContent = `${fields[selectedStat]} per 10-game block across ${nameSelect.selectedOptions[0]?.textContent}'s career`;
  chartSectionEl.appendChild(title);

  const svg = createSvgElement("svg");
  svg.classList.add("chart-svg");
  svg.setAttribute("viewBox", "0 0 900 360");
  svg.setAttribute("preserveAspectRatio", "none");

  const margin = { top: 30, right: 30, bottom: 60, left: 55 };
  const width = 900;
  const height = 360;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const values = trendData.map((item) => item.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const yRange = maxValue - minValue || 1;

  const points = trendData.map((item, index) => {
    const x = margin.left + (chartWidth * index) / Math.max(trendData.length - 1, 1);
    const y = margin.top + chartHeight - ((item.value - minValue) / yRange) * chartHeight;
    return { x, y, label: item.season, value: item.value };
  });

  const axis = createSvgElement("g");
  axis.setAttribute("fill", "none");
  axis.setAttribute("stroke", "rgba(255,255,255,0.12)");
  for (let i = 0; i <= 4; i += 1) {
    const y = margin.top + (chartHeight * i) / 4;
    const line = createSvgElement("line");
    line.setAttribute("x1", margin.left);
    line.setAttribute("x2", width - margin.right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    axis.appendChild(line);

    const label = createSvgElement("text");
    label.setAttribute("x", margin.left - 8);
    label.setAttribute("y", y + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "12");
    label.setAttribute("fill", "var(--muted)");
    label.textContent = formatNumber((maxValue - (y - margin.top) * yRange / chartHeight).toFixed(1));
    axis.appendChild(label);
  }
  svg.appendChild(axis);

  const path = createSvgElement("path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--accent)");
  path.setAttribute("stroke-width", "3");
  path.setAttribute("d", points.map((p, index) => `${index === 0 ? "M" : "L"}${p.x},${p.y}`).join(" "));
  svg.appendChild(path);

  points.forEach((point) => {
    const circle = createSvgElement("circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "var(--accent)");
    svg.appendChild(circle);

    const label = createSvgElement("text");
    label.setAttribute("x", point.x);
    label.setAttribute("y", point.y - 10);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "var(--text)");
    label.textContent = formatNumber(point.value);
    svg.appendChild(label);
  });

  const labelStep = Math.max(1, Math.ceil(trendData.length / 10));
  trendData.forEach((item, index) => {
    if (index % labelStep !== 0 && index !== trendData.length - 1) return;
    const text = createSvgElement("text");
    text.setAttribute("x", margin.left + (chartWidth * index) / Math.max(trendData.length - 1, 1));
    text.setAttribute("y", height - 10);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "12");
    text.setAttribute("fill", "var(--muted)");
    text.textContent = item.dateLabel;
    svg.appendChild(text);
  });

  chartSectionEl.appendChild(svg);
}

function createSvgElement(type) {
  return document.createElementNS("http://www.w3.org/2000/svg", type);
}

window.renderChart = renderChart;

function formatNumber(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (str === "") return "";
  // Only format plain numeric values, not values like percentages or N/A
  if (/^[+-]?[0-9]*\.?[0-9]+$/.test(str)) {
    return Number(str).toFixed(1);
  }
  const numeric = Number(str.replace(/,/g, ""));
  if (!Number.isNaN(numeric)) {
    return numeric.toFixed(1);
  }
  return value;
}

function createMetric(label, value) {
  const card = document.createElement("div");
  card.className = "metric-card";
  const title = document.createElement("h4");
  title.textContent = label;
  const valueEl = document.createElement("p");
  valueEl.textContent = formatNumber(value);
  card.appendChild(title);
  card.appendChild(valueEl);
  return card;
}

function averageValue(data, field) {
  const numbers = data.map((row) => Number(row[field])).filter((n) => !Number.isNaN(n));
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function topByField(data, field, count) {
  return data
    .map((row) => ({ value: Number(row[field]), label: row.LastName ? `${row.LastName} ${row.FirstName}` : row.Date }))
    .filter((entry) => !Number.isNaN(entry.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((entry) => `${entry.label}: ${entry.value}`);
}

function lowestByField(data, field, count) {
  return data
    .map((row) => ({ value: Number(row[field]), label: row.LastName ? `${row.LastName} ${row.FirstName}` : row.Date }))
    .filter((entry) => !Number.isNaN(entry.value))
    .sort((a, b) => a.value - b.value)
    .slice(0, count)
    .map((entry) => `${entry.label}: ${entry.value}`);
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (e) {
    console.error(e);
    showError(e.message || String(e));
  }
});
