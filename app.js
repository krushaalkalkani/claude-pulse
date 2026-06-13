/* ============================================================
   Claude Pulse — app
   Renders the entire page from data/updates.json.
   The data contract is unchanged so the daily refresh keeps working.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

const fmtContext = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`);
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/* vendor accent colors for dots / identity */
const VENDOR_COLOR = {
  Anthropic: "#cc785c", OpenAI: "#10a37f", Google: "#4285f4", xAI: "#111111",
  DeepSeek: "#4d6bfe", Meta: "#0668e1", Mistral: "#ff7000",
};
const vColor = (v) => VENDOR_COLOR[v] || "#8a8a8a";

const COLS = [
  { key: "name", label: "Model", type: "text" },
  { key: "context", label: "Context", better: "high", fmt: (v) => fmtContext(v) },
  { key: "inPrice", label: "Input $/M", better: "low", fmt: (v) => `$${v}` },
  { key: "outPrice", label: "Output $/M", better: "low", fmt: (v) => `$${v}`, delta: true, unit: "$" },
  { key: "swe", label: "SWE-bench", better: "high", fmt: (v) => `${v}%`, delta: true, unit: "%" },
  { key: "reasoning", label: "Reasoning", better: "high", fmt: (v) => `${v}%`, delta: true, unit: "%" },
  { key: "speed", label: "Speed", better: "high", fmt: (v) => `${v} t/s`, delta: true, unit: " t/s" },
];

const state = {
  data: null,
  newsType: "all",
  newsExpanded: false,
  vendors: new Set(),
  sortKey: null,
  sortDir: -1,
  metric: "swe",
  showDelta: false,
  expanded: new Set(),
  resCat: "all",
};

const NEWS_COLLAPSED = 8;

/* ---------- theme ---------- */
function initTheme() {
  const saved = localStorage.getItem("cp-theme");
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("cp-theme", next);
  });
}

/* ---------- tooltip ---------- */
const tip = () => $("#tooltip");
function showTip(html, e) { const t = tip(); t.innerHTML = html; t.classList.add("show"); moveTip(e); }
function moveTip(e) { const t = tip(); const x = Math.min(e.clientX + 16, innerWidth - t.offsetWidth - 12); t.style.left = x + "px"; t.style.top = e.clientY + 18 + "px"; }
function hideTip() { tip().classList.remove("show"); }

/* ---------- scroll progress + scrollspy ---------- */
function initScroll() {
  const bar = $("#scrollProgress");
  const spies = $$(".nav-links a[data-spy]");
  const sections = spies.map((a) => $("#" + a.dataset.spy)).filter(Boolean);
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
    const y = h.scrollTop + 140;
    let current = null;
    sections.forEach((s) => { if (s.offsetTop <= y) current = s.id; });
    spies.forEach((a) => a.classList.toggle("active", a.dataset.spy === current));
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------- reveal on scroll ---------- */
function initReveal() {
  if (!("IntersectionObserver" in window)) { $$("[data-reveal]").forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
  $$("[data-reveal]").forEach((e) => io.observe(e));
}

/* ---------- count-up for stat numbers ---------- */
function animateCount(node) {
  const raw = node.dataset.count;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) { node.textContent = raw; return; }
  const prefix = raw.match(/^[^0-9.-]*/)[0];
  const suffix = raw.slice(prefix.length + String(num).length);
  const dur = 900, start = performance.now();
  const dec = (raw.split(".")[1] || "").replace(/[^0-9]/g, "").length;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = prefix + (num * eased).toFixed(dec) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- load ---------- */
async function load() {
  initTheme();
  let data;
  try { data = await (await fetch(`data/updates.json?t=${Date.now()}`)).json(); }
  catch { $("#heroName").textContent = "Could not load data"; $("#heroHeadline").textContent = "Run this through a local server (see README)."; return; }
  state.data = data;
  data.models.forEach((m) => state.vendors.add(m.vendor));
  state.metric = data.benchmarks.metrics[0].key;

  $("#lastUpdated").textContent = `Updated ${fmtDate(data.meta.lastUpdated)}`;
  $("#heroEyebrowDate").textContent = `updated ${fmtDate(data.meta.lastUpdated)}`;
  $("#footerTagline").textContent = data.meta.tagline || "";

  renderHero(data.latest);
  renderSpec(data.latest);
  renderStats(data);
  renderResources(data.resources);
  renderNewsFilter();
  renderTimeline();
  renderUpcoming(data.upcoming);
  renderVendorFilter();
  renderHead();
  renderTable();
  renderSentiment(data.sentiment);
  renderChartTabs(data.benchmarks);
  $("#deltaToggle").addEventListener("change", (e) => { state.showDelta = e.target.checked; drawChart(); });
  drawChart();
  renderSources(data.meta.sources);

  initScroll();
  initReveal();
}

/* ---------- hero ---------- */
function renderHero(l) {
  $("#heroName").textContent = l.name;
  $("#heroHeadline").textContent = l.headline;
  $("#heroHighlights").innerHTML = l.highlights.slice(0, 5).map((h) => `<li>${h}</li>`).join("");
  $("#heroLink").href = l.url;
}

function renderSpec(l) {
  const fast = l.pricing.fastInput != null ? `<div class="spec-foot"><span>Fast mode</span><strong>$${l.pricing.fastInput} in · $${l.pricing.fastOutput} out /M</strong></div>` : "";
  $("#heroSpec").innerHTML = `
    <div class="spec-head">
      <span class="spec-flag"><span class="live-dot"></span> Current flagship</span>
      <span class="spec-id">${l.id}</span>
    </div>
    <div class="spec-name">${l.name}</div>
    <div class="spec-rel">Released ${fmtDate(l.released)}</div>
    <div class="spec-grid">
      <div class="spec-cell"><div class="k">Context</div><div class="v">${fmtContext(l.context)} <small>tok</small></div></div>
      <div class="spec-cell"><div class="k">Input</div><div class="v">$${l.pricing.input} <small>/M</small></div></div>
      <div class="spec-cell"><div class="k">Output</div><div class="v">$${l.pricing.output} <small>/M</small></div></div>
      <div class="spec-cell"><div class="k">Highlights</div><div class="v">${l.highlights.length} <small>shipped</small></div></div>
    </div>
    ${fast}`;
}

function renderStats(d) {
  const claude = d.models.find((m) => m.highlight) || d.models[0];
  const cheapest = [...d.models].sort((a, b) => a.outPrice - b.outPrice)[0];
  const sweRank = [...d.models].sort((a, b) => b.swe - a.swe).findIndex((m) => m.highlight) + 1;
  const tiles = [
    { num: `${d.models.length}`, lbl: "frontier models tracked" },
    { num: `#${sweRank}`, lbl: "Claude rank · SWE-bench Pro" },
    { num: `${claude.swe}%`, lbl: "Claude SWE-bench Pro score" },
    { num: `$${cheapest.outPrice}`, lbl: `cheapest output · ${cheapest.vendor}` },
  ];
  $("#statStrip").innerHTML = tiles.map((t) => `<div class="stat"><div class="num" data-count="${t.num}">${t.num}</div><div class="lbl">${t.lbl}</div></div>`).join("");
  // count-up once revealed
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { animateCount(en.target); io.unobserve(en.target); } }), { threshold: 0.6 });
  $$("#statStrip .num").forEach((n) => io.observe(n));
}

/* ---------- resources ---------- */
function renderResources(res) {
  if (!res) return;
  $("#resIntro").textContent = res.intro;
  const cats = res.categories;
  const filters = [["all", "All"], ...cats.map((c) => [c.name, c.name])];
  $("#resFilter").innerHTML = filters.map(([v, l]) => `<button class="fbtn ${state.resCat === v ? "active" : ""}" data-v="${v}">${l}</button>`).join("");
  $("#resFilter").onclick = (e) => { const b = e.target.closest(".fbtn"); if (!b) return; state.resCat = b.dataset.v; renderResources(res); };

  const shown = cats.filter((c) => state.resCat === "all" || c.name === state.resCat);
  $("#resGroups").innerHTML = shown.map((c) => `
    <div class="res-group">
      <div class="rg-head">
        <h3>${c.name}</h3>
        <span class="rg-count">${c.items.length}</span>
        <p>${c.desc}</p>
      </div>
      <div class="res-grid">
        ${c.items.map((it) => `
          <a class="res-card" href="${it.url}" target="_blank" rel="noopener">
            <div class="rc-top"><h4>${it.title}</h4><span class="rc-tag">${it.tag}</span></div>
            <p>${it.desc}</p>
            <div class="rc-link">Visit
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
              <span class="rc-host">${host(it.url)}</span>
            </div>
          </a>`).join("")}
      </div>
    </div>`).join("");
}

/* ---------- what's new ---------- */
function renderNewsFilter() {
  const opts = [["all", "All"], ["model", "Models"], ["feature", "Features & news"]];
  $("#newsFilter").innerHTML = opts.map(([v, l]) => `<button class="fbtn ${state.newsType === v ? "active" : ""}" data-v="${v}">${l}</button>`).join("");
  $("#newsFilter").onclick = (e) => { const b = e.target.closest(".fbtn"); if (!b) return; state.newsType = b.dataset.v; state.newsExpanded = false; renderNewsFilter(); renderTimeline(); };
}
function renderTimeline() {
  const all = state.data.timeline.filter((i) => state.newsType === "all" || i.type === state.newsType);
  const items = state.newsExpanded ? all : all.slice(0, NEWS_COLLAPSED);
  $("#timeline").innerHTML = items.map((it) => `
    <div class="tl-item ${it.type}">
      <div class="tl-head">
        <span class="tl-date">${fmtDate(it.date)}</span>
        <span class="tl-type ${it.type}">${it.type}</span>
      </div>
      <div class="tl-card">
        <h3>${it.url ? `<a href="${it.url}" target="_blank" rel="noopener">${it.title}</a>` : it.title}</h3>
        <p>${it.summary}</p>
        ${(it.tags || []).length ? `<div class="tags">${it.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : ""}
      </div>
    </div>`).join("") || `<p style="color:var(--ink-soft)">No ${state.newsType} updates yet.</p>`;

  const more = $("#timelineMore");
  if (all.length > NEWS_COLLAPSED) {
    more.hidden = false;
    more.textContent = state.newsExpanded ? "Show fewer" : `Show all ${all.length} updates`;
    more.onclick = () => { state.newsExpanded = !state.newsExpanded; renderTimeline(); };
  } else { more.hidden = true; }
}

/* ---------- upcoming ---------- */
function renderUpcoming(items) {
  const conf = { high: 85, medium: 55, low: 28 };
  $("#upcoming-cards").innerHTML = items.map((u) => `
    <div class="u-card">
      <div class="u-top"><h3>${u.title}</h3><span class="status ${u.status}">${u.status}</span></div>
      <p>${u.summary}</p>
      <div class="u-foot">
        <div class="u-meta"><span class="eta">ETA · ${u.eta}</span><span class="conf-label">${u.confidence} confidence</span></div>
        <div class="conf" title="confidence: ${u.confidence}"><span data-w="${conf[u.confidence] || 30}"></span></div>
      </div>
    </div>`).join("");
  requestAnimationFrame(() => $$("#upcoming-cards .conf span").forEach((s) => { s.style.width = s.dataset.w + "%"; }));
}

/* ---------- comparison table ---------- */
function visibleModels() { return state.data.models.filter((m) => state.vendors.has(m.vendor)); }
function claudeModel() { return state.data.models.find((m) => m.highlight) || state.data.models[0]; }

function renderVendorFilter() {
  const vendors = [...new Set(state.data.models.map((m) => m.vendor))];
  $("#vendorFilter").innerHTML = vendors.map((v) =>
    `<button class="fbtn ${state.vendors.has(v) ? "active" : ""}" data-v="${v}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${vColor(v)};margin-right:6px;vertical-align:middle"></span>${v}</button>`).join("");
  $("#vendorFilter").onclick = (e) => {
    const b = e.target.closest(".fbtn"); if (!b) return;
    const v = b.dataset.v;
    if (state.vendors.has(v)) { if (state.vendors.size > 1) state.vendors.delete(v); } else state.vendors.add(v);
    renderVendorFilter(); renderTable(); drawChart();
  };
}

function renderHead() {
  $("#compareHead").innerHTML = COLS.map((c) => {
    const sorted = state.sortKey === c.key;
    const arrow = c.type === "text" ? "" : `<span class="arrow">${sorted ? (state.sortDir === -1 ? "▼" : "▲") : "▽"}</span>`;
    return `<th data-key="${c.key}" class="${sorted ? "sorted" : ""}">${c.label}${arrow}</th>`;
  }).join("") + `<th aria-label="expand"></th>`;
  $("#compareHead").onclick = (e) => {
    const th = e.target.closest("th"); if (!th || !th.dataset.key) return;
    const k = th.dataset.key;
    if (k === "name") { state.sortKey = state.sortKey === "name" ? null : "name"; state.sortDir = 1; }
    else { if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = -1; } }
    renderHead(); renderTable();
  };
}

function bestValue(key, better) {
  const vals = visibleModels().map((m) => m[key]);
  return better === "low" ? Math.min(...vals) : Math.max(...vals);
}

function renderTable() {
  let rows = visibleModels();
  if (state.sortKey) {
    const k = state.sortKey;
    rows = [...rows].sort((a, b) => k === "name" ? a.name.localeCompare(b.name) * state.sortDir : (a[k] - b[k]) * state.sortDir);
  }
  const claude = claudeModel();
  const best = {};
  COLS.forEach((c) => { if (c.type !== "text") best[c.key] = bestValue(c.key, c.better); });

  const body = $("#compareBody");
  body.innerHTML = "";
  rows.forEach((m) => {
    const tr = el("tr", m.highlight ? "highlight" : "");
    tr.dataset.name = m.name;
    COLS.forEach((c) => {
      const td = el("td");
      if (c.type === "text") {
        td.innerHTML = `<span class="model-name"><span class="vendor-dot" style="background:${vColor(m.vendor)}"></span>${m.name}</span><span class="vendor">${m.vendor}</span>`;
      } else {
        const isBest = m[c.key] === best[c.key];
        let inner = `<span class="cell-val"><span class="${isBest ? "best" : ""}">${c.fmt(m[c.key])}</span></span>`;
        if (c.delta && !m.highlight) {
          const diff = m[c.key] - claude[c.key];
          const better = c.better === "low" ? diff < 0 : diff > 0;
          const sign = diff > 0 ? "+" : "";
          inner += `<span class="delta ${better ? "pos" : "neg"}">${sign}${(+diff.toFixed(1))}${c.unit.trim()}</span>`;
        } else if (c.delta && m.highlight) { inner += `<span class="delta ref">ref</span>`; }
        td.innerHTML = inner;
      }
      tr.appendChild(td);
    });
    const expTd = el("td", "", `<button class="expand-btn" aria-label="Toggle details for ${m.name}">⌄</button>`);
    tr.appendChild(expTd);
    tr.addEventListener("mouseenter", (e) => showTip(`<strong>${m.name}</strong> · ${m.vendor}<br>${m.note}`, e));
    tr.addEventListener("mousemove", moveTip);
    tr.addEventListener("mouseleave", hideTip);
    body.appendChild(tr);

    const dr = el("tr", "detail-row" + (state.expanded.has(m.name) ? " open" : ""));
    const dtd = el("td"); dtd.colSpan = COLS.length + 1;
    dtd.innerHTML = `<div class="detail-inner"><p>${m.note}</p>
      <div class="meta-line">
        <span><strong>${fmtDate(m.released)}</strong> released</span>
        <span><strong>${fmtContext(m.context)}</strong> context</span>
        <span><strong>$${m.inPrice}</strong> in · <strong>$${m.outPrice}</strong> out /M</span>
        <span><strong>${m.speed}</strong> t/s</span>
      </div></div>`;
    dr.appendChild(dtd);
    body.appendChild(dr);

    expTd.querySelector(".expand-btn").addEventListener("click", () => {
      if (state.expanded.has(m.name)) state.expanded.delete(m.name); else state.expanded.add(m.name);
      dr.classList.toggle("open");
    });
  });
}

/* ---------- sentiment ---------- */
function renderSentiment(s) {
  if (!s) return;
  const total = s.positive + s.negative + s.neutral;
  $("#sentSub").textContent = `What people are saying about ${s.subject} on X — ${s.window}, N=${s.sampleSize.toLocaleString()}.`;
  const badge = $("#sentMode");
  badge.className = `mode-badge ${s.mode}`;
  badge.textContent = s.mode === "live" ? "● Live" : "Illustrative sample";

  $("#sentPos").textContent = s.positive.toLocaleString();
  $("#sentNeg").textContent = s.negative.toLocaleString();
  $("#sentNeu").textContent = s.neutral.toLocaleString();

  const pct = (n) => ((n / total) * 100).toFixed(1);
  const net = (+pct(s.positive) - +pct(s.negative)).toFixed(1);
  // gauge marker: map net (-100..100) → 0..100
  requestAnimationFrame(() => { $("#sentGauge").style.setProperty("--pct", Math.max(0, Math.min(100, (+net + 100) / 2))); });

  $("#sentBar").innerHTML = `
    <i class="sb-pos" style="width:${pct(s.positive)}%" title="Positive ${pct(s.positive)}%"></i>
    <i class="sb-neu" style="width:${pct(s.neutral)}%" title="Neutral ${pct(s.neutral)}%"></i>
    <i class="sb-neg" style="width:${pct(s.negative)}%" title="Negative ${pct(s.negative)}%"></i>`;
  $("#sentRatio").innerHTML = `<strong>${pct(s.positive)}% positive</strong> vs ${pct(s.negative)}% negative · net sentiment <strong>${net > 0 ? "+" : ""}${net}</strong>`;

  $("#proofList").innerHTML = [
    ["Source", s.source],
    ["Search query", `<code>${s.query}</code>`],
    ["Time window", s.window],
    ["Sample size", `${s.sampleSize.toLocaleString()} posts`],
    ["Classifier", s.classifier],
    ["Last fetched", fmtDate(s.lastFetched)],
    ["Mode", s.mode === "live" ? "Live data" : "Illustrative sample (connect an X API token to go live)"],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

  $("#sentSamples").innerHTML = (s.samples || []).map((t) =>
    `<div class="sample"><span class="slabel ${t.label}">${t.label}</span><span>“${t.text}”</span></div>`).join("");

  const lex = s.lexicon || { positive: [], negative: [] };
  $("#sentLexicon").innerHTML =
    `<div><strong style="color:var(--good)">Positive:</strong> ${lex.positive.map((w) => `<span class="lex-word p">${w}</span>`).join("")}</div>` +
    `<div><strong style="color:var(--bad)">Negative:</strong> ${lex.negative.map((w) => `<span class="lex-word n">${w}</span>`).join("")}</div>`;
}

/* ---------- charts ---------- */
function renderChartTabs(bench) {
  $("#benchNote").textContent = bench.note;
  $("#chartTabs").innerHTML = bench.metrics.map((m) => `<button class="chart-tab ${m.key === state.metric ? "active" : ""}" data-key="${m.key}">${m.label}</button>`).join("");
  $("#chartTabs").onclick = (e) => {
    const b = e.target.closest(".chart-tab"); if (!b) return;
    state.metric = b.dataset.key;
    $$(".chart-tab").forEach((x) => x.classList.toggle("active", x === b));
    drawChart();
  };
}

function metricMeta() { return state.data.benchmarks.metrics.find((m) => m.key === state.metric); }

function drawChart() {
  const meta = metricMeta();
  $("#metricDesc").textContent = meta.desc + (meta.better === "low" ? "  ·  lower is better" : "  ·  higher is better");
  const claude = claudeModel();
  let models = visibleModels().map((m) => ({ ...m, val: m[meta.key], delta: m[meta.key] - claude[meta.key] }));
  const legend = $("#chartLegend");

  if (state.showDelta) {
    models = models.filter((m) => !m.highlight);
    models.sort((a, b) => (meta.better === "low" ? a.delta - b.delta : b.delta - a.delta));
    const max = Math.max(1, ...models.map((m) => Math.abs(m.delta)));
    $("#chart").innerHTML = models.map((m) => {
      const better = meta.better === "low" ? m.delta < 0 : m.delta > 0;
      const sign = m.delta > 0 ? "+" : "";
      return barRow(m, Math.abs(m.delta) / max * 100, better ? "" : "neg",
        `${sign}${(+m.delta.toFixed(1))}${meta.unit}`, `<span class="d ${better ? "pos" : "neg"}">${better ? "ahead" : "behind"}</span>`);
    }).join("") || `<p style="color:var(--ink-soft)">Enable a vendor to compare.</p>`;
    legend.innerHTML = `<span class="legend-item"><span class="legend-swatch claude"></span>Ahead of Claude</span><span class="legend-item"><span class="legend-swatch worse"></span>Behind Claude</span>`;
  } else {
    models.sort((a, b) => (meta.better === "low" ? a.val - b.val : b.val - a.val));
    const max = Math.max(...models.map((m) => m.val));
    $("#chart").innerHTML = models.map((m) =>
      barRow(m, m.val / max * 100, m.highlight ? "" : "alt", `${m.val}${meta.unit}`, "")
    ).join("");
    legend.innerHTML = `<span class="legend-item"><span class="legend-swatch claude"></span>Claude (reference)</span><span class="legend-item"><span class="legend-swatch other"></span>Other vendors</span>`;
  }
  requestAnimationFrame(() => {
    $$("#chart .bar-row").forEach((row) => { row.querySelector(".bar-fill").style.width = row.dataset.w + "%"; });
  });
  bindChartTips();
}

function barRow(m, widthPct, fillClass, valText, sub) {
  return `<div class="bar-row" data-w="${widthPct.toFixed(1)}" data-name="${m.name}">
    <div class="lbl">${m.name}<small>${m.vendor}</small></div>
    <div class="bar-track"><div class="bar-fill ${fillClass}"></div></div>
    <div class="bar-val">${valText}${sub}</div>
  </div>`;
}

function bindChartTips() {
  const meta = metricMeta();
  $$("#chart .bar-row").forEach((row) => {
    const m = state.data.models.find((x) => x.name === row.dataset.name);
    if (!m) return;
    row.addEventListener("mouseenter", (e) => showTip(`<strong>${m.name}</strong> · ${m.vendor}<br>${meta.label}: ${m[meta.key]}${meta.unit}<br>${m.note}`, e));
    row.addEventListener("mousemove", moveTip);
    row.addEventListener("mouseleave", hideTip);
  });
}

function renderSources(sources) {
  $("#sources").innerHTML = sources.map((s) =>
    `<a href="${s.url}" target="_blank" rel="noopener">${s.label}
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
    </a>`).join("");
}

load();
