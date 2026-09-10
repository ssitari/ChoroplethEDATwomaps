// ============================================================
//  app.js  —  Visualization engine
//  Do not edit unless you are modifying the tool itself.
// ============================================================

import {
  PAGE_TITLE, DATA_CREDIT_HTML, ANALYTICS_TOKEN,
  DATA_FILE, GEOGRAPHY_LABEL, FEATURE_ID_FIELD,
  FEATURE_NAME_FIELD, FEATURE_GROUP_FIELD,
  VARIABLES, DEFAULT_VAR_X, DEFAULT_VAR_Y,
  DEFAULT_CLASSIFICATION, DEFAULT_BUCKETS,
  DEFAULT_SCHEME_X, DEFAULT_SCHEME_Y,
  NULL_COLOR, SELECTION_COLOR, DEEMPHASIS_OPACITY,
} from './config.js';

// ============================================================
//  PAGE IDENTITY
//  Title, footer credit and analytics all come from config.js so that
//  adapting the tool to new data never requires editing index.html.
//  Run before the data fetch, so the page is correctly labelled even
//  when loading fails.
// ============================================================

function applyPageIdentity() {
  if (PAGE_TITLE) {
    document.title = PAGE_TITLE;
    document.getElementById('appTitle').textContent = PAGE_TITLE;
  }

  const footer = document.getElementById('pageCredit');
  if (DATA_CREDIT_HTML && DATA_CREDIT_HTML.trim()) {
    footer.innerHTML = DATA_CREDIT_HTML;
  } else {
    footer.remove();
  }

  // Injected rather than hardcoded in index.html: a copied repository that
  // kept the original tag would silently report its traffic to someone
  // else's account.
  if (ANALYTICS_TOKEN) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: ANALYTICS_TOKEN }));
    document.body.appendChild(s);
  }
}

// ============================================================
//  COLORBREWER PALETTE CATALOGUE
// ============================================================

const PALETTE_SCHEMES = {
  sequential: [
    { id: 'YlOrRd',  d3: 'schemeYlOrRd'  },
    { id: 'YlOrBr',  d3: 'schemeYlOrBr'  },
    { id: 'YlGnBu',  d3: 'schemeYlGnBu'  },
    { id: 'YlGn',    d3: 'schemeYlGn'    },
    { id: 'Reds',    d3: 'schemeReds'    },
    { id: 'RdPu',    d3: 'schemeRdPu'    },
    { id: 'Purples', d3: 'schemePurples' },
    { id: 'PuRd',    d3: 'schemePuRd'    },
    { id: 'PuBuGn',  d3: 'schemePuBuGn'  },
    { id: 'PuBu',    d3: 'schemePuBu'    },
    { id: 'OrRd',    d3: 'schemeOrRd'    },
    { id: 'Oranges', d3: 'schemeOranges' },
    { id: 'Greys',   d3: 'schemeGreys'   },
    { id: 'Greens',  d3: 'schemeGreens'  },
    { id: 'GnBu',    d3: 'schemeGnBu'    },
    { id: 'BuPu',    d3: 'schemeBuPu'    },
    { id: 'BuGn',    d3: 'schemeBuGn'    },
    { id: 'Blues',   d3: 'schemeBlues'   },
  ],
  diverging: [
    { id: 'Spectral', d3: 'schemeSpectral' },
    { id: 'RdYlGn',   d3: 'schemeRdYlGn'  },
    { id: 'RdYlBu',   d3: 'schemeRdYlBu'  },
    { id: 'RdGy',     d3: 'schemeRdGy'    },
    { id: 'RdBu',     d3: 'schemeRdBu'    },
    { id: 'PuOr',     d3: 'schemePuOr'    },
    { id: 'PRGn',     d3: 'schemePRGn'    },
    { id: 'PiYG',     d3: 'schemePiYG'    },
    { id: 'BrBG',     d3: 'schemeBrBG'    },
  ],
};

const ALL_SCHEMES = [...PALETTE_SCHEMES.sequential, ...PALETTE_SCHEMES.diverging];

function brewerColors(schemeId, k) {
  const entry = ALL_SCHEMES.find(s => s.id === schemeId);
  if (!entry) return d3.schemeBlues[k] || d3.schemeBlues[5];
  const arr = d3[entry.d3];
  if (!arr) return d3.schemeBlues[k] || d3.schemeBlues[5];
  const available = Object.keys(arr).map(Number).filter(n => !isNaN(n));
  if (!available.length) return d3.schemeBlues[5];
  const clamped = Math.min(Math.max(k, Math.min(...available)), Math.max(...available));
  return arr[clamped];
}

// ============================================================
//  STATE
// ============================================================

const state = {
  geojson:        null,
  varX:           DEFAULT_VAR_X,
  varY:           DEFAULT_VAR_Y,
  classification: DEFAULT_CLASSIFICATION,
  buckets:        DEFAULT_BUCKETS,
  schemeX:        DEFAULT_SCHEME_X,
  schemeY:        DEFAULT_SCHEME_Y,
  selectedIds:    new Set(),
  selMode:        null,   // null | 'mapX' | 'mapY' | 'scatter'
  zoomTransform:  d3.zoomIdentity,
};

// ============================================================
//  CLASSIFICATION
// ============================================================

function classifyQuantile(values, k) {
  const sorted = [...values].sort(d3.ascending);
  const breaks = [];
  for (let i = 1; i < k; i++) breaks.push(d3.quantile(sorted, i / k));
  return [sorted[0], ...breaks, sorted[sorted.length - 1]];
}

function classifyEqual(values, k) {
  const lo = d3.min(values), hi = d3.max(values);
  const step = (hi - lo) / k;
  return d3.range(0, k + 1).map(i => lo + i * step);
}

//  Returns strictly increasing break points, so the number of classes the
//  legend advertises is the number the map can actually draw.
//
//  Quantiles collapse whenever values are tied, and ties are the norm rather
//  than the exception in real data — a rate that is zero across most small
//  geographies, a rounded percentage, a count of a rare event. Asking for 5
//  classes of a variable where 70% of features share one value produced
//  breaks like [0.5, 0.5, 0.5, 0.5, 18, 40]: a legend listing five classes,
//  three of them reading "0.5 – 0.5", over a map drawing two colors.
//
//  Dropping the duplicates yields fewer classes than requested, which is the
//  honest answer; drawLegend says so rather than leaving the k control
//  looking like it was ignored.
function getBreaks(values, k, method) {
  if (!values.length) return [];
  const raw = method === 'equal' ? classifyEqual(values, k) : classifyQuantile(values, k);
  const out = [];
  raw.forEach(v => { if (!out.length || v > out[out.length - 1]) out.push(v); });
  // Every value identical: one class, drawn in a single color.
  return out.length >= 2 ? out : [out[0], out[0]];
}

//  Class count is derived from the breaks, never from the requested k, so a
//  deduplicated set of breaks cannot leave the range longer than the domain
//  (which is how an out-of-range class produced an undefined fill, and a
//  polygon SVG paints black).
function makeColorScale(schemeId, breaks) {
  const k      = Math.max(breaks.length - 1, 1);
  const colors = brewerColors(schemeId, k);
  return d3.scaleThreshold()
    .domain(breaks.slice(1, breaks.length - 1))
    .range(colors.slice(0, k));
}

// ============================================================
//  HELPERS
// ============================================================

function getVarDef(varId) {
  return VARIABLES.find(v => v.id === varId) || VARIABLES[0];
}

function featureId(f) {
  return f.properties[FEATURE_ID_FIELD];
}

//  Reads one variable off one feature, returning null for anything that
//  cannot be mapped. Everything downstream — scales, breaks, statistics,
//  regression — assumes it is handed finite numbers, so all three ways a
//  value can be unusable have to be caught here:
//
//    Missing      null or undefined in the properties, or an empty string.
//
//    Non-numeric  'N/A', 'null', '--' and similar survive a CSV join intact.
//                 +'N/A' is NaN, which passes a plain != null filter, poisons
//                 the statistics, and reaches colorScale(NaN) → undefined →
//                 a path with no fill attribute, which SVG paints black.
//
//    Sentinel     the variable's configured nullVal. Tested with hasOwn, not
//                 ??, so that nullVal: null genuinely disables the check
//                 instead of falling back to 0 and swallowing every real zero
//                 in the dataset. Compared numerically so a string '0' in the
//                 data matches a numeric 0 in the config.
function getFeatureValue(f, varId) {
  const vd = getVarDef(varId);
  const v  = f.properties[vd.prop];
  if (v == null || v === '') return null;

  const n = +v;
  if (!Number.isFinite(n)) return null;

  const nv = Object.hasOwn(vd, 'nullVal') ? vd.nullVal : 0;
  if (nv != null && n === +nv) return null;

  return n;
}

function getValues(varId) {
  if (!state.geojson) return [];
  return state.geojson.features
    .map(f => getFeatureValue(f, varId))
    .filter(v => v != null);
}

function getValuesFor(varId, features) {
  return features.map(f => getFeatureValue(f, varId)).filter(v => v != null);
}

function fmtBreak(v) {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return Number.isInteger(v) ? v.toString() : v.toFixed(1);
}

//  Legend breaks and scatter ticks run through the variable's own fmt, so
//  they carry the same units as the tooltip and the statistics panel. The
//  legend used to print bare numbers: a tooltip reading "$71,204" over a
//  legend reading "48.5k – 71.2k", and percentages with no % anywhere on
//  the map. fmtBreak remains the fallback for a fmt that throws.
function fmtValue(vd, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  try {
    const s = vd.fmt(v);
    return (s == null || s === '') ? fmtBreak(v) : String(s);
  } catch {
    return fmtBreak(v);
  }
}

// ============================================================
//  MAP DESCRIPTORS
// ============================================================

const mapX = {
  id: 'X', svgId: 'mapSvgX', paneId: 'mapPaneX',
  legendTitleId: 'legendTitleX', legendSwatchesId: 'legendSwatchesX',
  legendWarnId: 'legendWarnX', colorBtnId: 'colorBtnX',
  colorBtnSwatchesId: 'colorBtnSwatchesX', colorDdId: 'colorDropdownX',
  get varId()    { return state.varX; },
  get schemeId() { return state.schemeX; },
  svg: null, zoomRoot: null, tractsG: null, brushG: null,
  zoomBehavior: null, projection: null, pathGen: null,
};

const mapY = {
  id: 'Y', svgId: 'mapSvgY', paneId: 'mapPaneY',
  legendTitleId: 'legendTitleY', legendSwatchesId: 'legendSwatchesY',
  legendWarnId: 'legendWarnY', colorBtnId: 'colorBtnY',
  colorBtnSwatchesId: 'colorBtnSwatchesY', colorDdId: 'colorDropdownY',
  get varId()    { return state.varY; },
  get schemeId() { return state.schemeY; },
  svg: null, zoomRoot: null, tractsG: null, brushG: null,
  zoomBehavior: null, projection: null, pathGen: null,
};

const BOTH_MAPS = [mapX, mapY];

// ============================================================
//  MAP INIT & RESIZE
// ============================================================

function initMap(m) {
  m.svg      = d3.select('#' + m.svgId);
  const zoomRoot = m.svg.append('g').attr('class', 'zoom-root');
  m.zoomRoot = zoomRoot;
  m.tractsG  = zoomRoot.append('g').attr('class', 'tracts');
  m.brushG   = zoomRoot.append('g').attr('class', 'map-brush');

  m.brushG.append('path').attr('class', 'sel-path');
  m.brushG.append('rect').attr('class', 'sel-rect')
    .attr('fill', 'rgba(70,110,240,0.06)').attr('stroke', 'none')
    .style('display', 'none');

  m.zoomBehavior = d3.zoom()
    .scaleExtent([0.5, 32])
    .filter(event => {
      if (event.type === 'wheel') return true;
      if (event.type === 'mousedown') return !event.shiftKey;
      return false;
    });

  m.svg.call(m.zoomBehavior);
  m.svg.on('dblclick.zoom', null);
}

function resizeMap(m) {
  const el = document.getElementById(m.paneId);
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  m.svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
  m.projection = d3.geoMercator().fitSize([w, h], state.geojson);
  m.pathGen    = d3.geoPath().projection(m.projection);
  m.zoomBehavior.translateExtent([[-w * 0.5, -h * 0.5], [w * 1.5, h * 1.5]]);
  m.zoomRoot.attr('transform', state.zoomTransform);
}

// ============================================================
//  ZOOM SYNC
// ============================================================

let syncing   = false;
let hintShown = false;

function setupZoomSync() {
  BOTH_MAPS.forEach(m => {
    const other = m === mapX ? mapY : mapX;

    m.zoomBehavior.on('zoom', event => {
      m.zoomRoot.attr('transform', event.transform);

      if (!syncing) {
        state.zoomTransform = event.transform;
        if (other.svg) {
          syncing = true;
          other.svg.call(other.zoomBehavior.transform, event.transform);
          syncing = false;
        }
        if (!hintShown && event.transform.k > 1.5) {
          hintShown = true;
          const hint = document.getElementById('shiftHint');
          hint.classList.add('visible');
          setTimeout(() => hint.classList.remove('visible'), 3000);
        }
      }
    });
  });
}

function zoomBy(factor) {
  mapX.svg.transition().duration(280).call(mapX.zoomBehavior.scaleBy, factor);
}
function zoomReset() {
  mapX.svg.transition().duration(380).call(mapX.zoomBehavior.transform, d3.zoomIdentity);
}

// ============================================================
//  DRAW & COLOR
// ============================================================

function drawTracts(m) {
  if (!state.geojson || !m.pathGen) return;
  m.tractsG.selectAll('.tract')
    .data(state.geojson.features, featureId)
    .join('path')
    .attr('class', 'tract')
    .attr('d', m.pathGen)
    .attr('stroke', '#777')
    .attr('stroke-width', 0.5)
    .on('mousemove', (event, d) => showTooltip(event, d))
    .on('mouseleave', hideTooltip);

  applyColors(m);
  drawLegend(m);
}

function applyColors(m) {
  if (!state.geojson || !m.tractsG) return;
  const allVals    = getValues(m.varId);
  const breaks     = getBreaks(allVals, state.buckets, state.classification);
  const colorScale = makeColorScale(m.schemeId, breaks);
  const hasSel     = state.selectedIds.size > 0;

  m.tractsG.selectAll('.tract')
    .attr('fill', d => {
      const v = getFeatureValue(d, m.varId);
      if (v == null) return NULL_COLOR;
      if (hasSel && !state.selectedIds.has(featureId(d))) return NULL_COLOR;
      return colorScale(v);
    })
    .attr('opacity', d => {
      if (!hasSel) return 1;
      return state.selectedIds.has(featureId(d)) ? 1 : DEEMPHASIS_OPACITY;
    });
}

// ============================================================
//  LEGEND
// ============================================================

function drawLegend(m) {
  const vd      = getVarDef(m.varId);
  const allVals = getValues(m.varId);
  const breaks  = getBreaks(allVals, state.buckets, state.classification);
  const colorScale = makeColorScale(m.schemeId, breaks);
  const colors  = colorScale.range();
  const k       = Math.max(breaks.length - 1, 0);

  document.getElementById(m.legendTitleId).textContent = vd.label;

  const container = document.getElementById(m.legendSwatchesId);
  container.innerHTML = '';
  for (let i = 0; i < k; i++) {
    const lo  = breaks[i], hi = breaks[i + 1];
    const lbl = i === k - 1 ? `${fmtValue(vd, lo)} +`
                            : `${fmtValue(vd, lo)} – ${fmtValue(vd, hi)}`;
    const row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML =
      `<span class="legend-swatch" style="background:${colors[i]}"></span>` +
      `<span class="legend-label">${lbl}</span>`;
    container.appendChild(row);
  }
  const nullRow = document.createElement('div');
  nullRow.className = 'legend-row';
  nullRow.innerHTML =
    `<span class="legend-swatch" style="background:${NULL_COLOR}"></span>` +
    `<span class="legend-label" style="color:#bbb">No data</span>`;
  container.appendChild(nullRow);

  if (k && k < state.buckets) {
    const note = document.createElement('div');
    note.className = 'legend-note';
    note.textContent = `${k} of ${state.buckets} classes — tied values`;
    container.appendChild(note);
  }

  const isDiverging = PALETTE_SCHEMES.diverging.some(s => s.id === m.schemeId);
  document.getElementById(m.legendWarnId).style.display =
    (isDiverging && !vd.diverge) ? 'block' : 'none';
}

// ============================================================
//  COLOR SCHEME DROPDOWNS
// ============================================================

function buildDropdown(m) {
  const inner = document.getElementById(m.colorDdId);
  inner.innerHTML = '';

  ['sequential', 'diverging'].forEach(family => {
    const hdr = document.createElement('div');
    hdr.className = 'dd-family-label';
    hdr.textContent = family === 'sequential' ? 'Sequential' : 'Diverging';
    inner.appendChild(hdr);

    PALETTE_SCHEMES[family].forEach(scheme => {
      const row = document.createElement('div');
      row.className = 'dd-row' + (scheme.id === m.schemeId ? ' dd-row--active' : '');
      row.dataset.schemeId = scheme.id;
      const k = Math.min(Math.max(state.buckets, 3), 9);
      brewerColors(scheme.id, k).forEach(c => {
        const s = document.createElement('span');
        s.className = 'dd-swatch'; s.style.background = c;
        row.appendChild(s);
      });
      row.addEventListener('click', () => { onSchemeChange(m, scheme.id); closeDropdown(m); });
      inner.appendChild(row);
    });
  });

  const warn = document.createElement('div');
  warn.className = 'dd-diverge-warn';
  warn.id = 'ddWarn' + m.id;
  warn.textContent = '⚠ Diverging palette on non-diverging variable';
  inner.appendChild(warn);
  updateDdWarn(m);
}

function updateDdWarn(m) {
  const vd = getVarDef(m.varId);
  const isDiverging = PALETTE_SCHEMES.diverging.some(s => s.id === m.schemeId);
  const warn = document.getElementById('ddWarn' + m.id);
  if (warn) warn.style.display = (isDiverging && !vd.diverge) ? 'block' : 'none';
}

function refreshDropdownSwatches(m) {
  const k = Math.min(Math.max(state.buckets, 3), 9);
  document.querySelectorAll(`#${m.colorDdId} .dd-row`).forEach(row => {
    const id = row.dataset.schemeId;
    row.innerHTML = '';
    brewerColors(id, k).forEach(c => {
      const s = document.createElement('span');
      s.className = 'dd-swatch'; s.style.background = c;
      row.appendChild(s);
    });
    row.classList.toggle('dd-row--active', id === m.schemeId);
  });
}

function updateColorBtn(m) {
  const wrap = document.getElementById(m.colorBtnSwatchesId);
  wrap.innerHTML = '';
  const k = Math.min(Math.max(state.buckets, 3), 9);
  brewerColors(m.schemeId, k).forEach(c => {
    const s = document.createElement('span');
    s.className = 'btn-swatch'; s.style.background = c;
    wrap.appendChild(s);
  });
}

function openDropdown(m) {
  const btn  = document.getElementById(m.colorBtnId);
  const dd   = document.getElementById(m.colorDdId);
  const rect = btn.getBoundingClientRect();
  dd.style.top  = (rect.bottom + 4) + 'px';
  dd.style.left = rect.left + 'px';
  dd.classList.add('open');
  document.getElementById(m.colorBtnId).classList.add('open');
}

function closeDropdown(m) {
  document.getElementById(m.colorDdId).classList.remove('open');
  document.getElementById(m.colorBtnId).classList.remove('open');
}

function toggleDropdown(m) {
  const isOpen = document.getElementById(m.colorDdId).classList.contains('open');
  BOTH_MAPS.forEach(closeDropdown);
  if (!isOpen) openDropdown(m);
}

// ============================================================
//  MAP LASSO & RECTANGLE SELECTION
//  Shift+drag = freehand lasso; Shift+Alt+drag = rectangle.
// ============================================================

let selDrag = null;

function svgPoint(event, m) {
  const el   = document.getElementById(m.paneId);
  const rect = el.getBoundingClientRect();
  const t    = state.zoomTransform;
  return [(event.clientX - rect.left - t.x) / t.k,
          (event.clientY - rect.top  - t.y) / t.k];
}

//  Only mousedown is bound to the map. The rest of the drag lives on the
//  window, because a lasso drawn near the edge of a pane very often ends
//  with the pointer outside it — and a mouseup bound to the SVG never fires
//  in that case, leaving the drag permanently open: the mode badge stuck on
//  screen and the lasso still following the cursor with no button held.
function setupLasso(m) {
  m.svg.on('mousedown.sel', event => {
    if (!event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = event.altKey ? 'rect' : 'lasso';
    const pt   = svgPoint(event, m);
    selDrag = { mode, map: m, points: [pt], startX: pt[0], startY: pt[1] };
    showSelMode(mode);
  });
}

function dragLassoTo(event) {
  const m  = selDrag.map;
  const pt = svgPoint(event, m);
  selDrag.points.push(pt);
  if (selDrag.mode === 'lasso') {
    const closed = [...selDrag.points, selDrag.points[0]];
    m.brushG.select('.sel-path')
      .attr('d', 'M' + closed.map(p => p.join(',')).join('L') + 'Z')
      .attr('fill', 'rgba(70,110,240,0.07)')
      .attr('stroke', '#4466cc').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,3').attr('stroke-linejoin', 'round');
  } else {
    const x0 = Math.min(selDrag.startX, pt[0]), y0 = Math.min(selDrag.startY, pt[1]);
    const w  = Math.abs(pt[0] - selDrag.startX), h = Math.abs(pt[1] - selDrag.startY);
    m.brushG.select('.sel-rect').style('display', null)
      .attr('x', x0).attr('y', y0).attr('width', w).attr('height', h);
    m.brushG.select('.sel-path')
      .attr('d', `M${x0},${y0}h${w}v${h}h${-w}Z`)
      .attr('fill', 'none').attr('stroke', '#4466cc')
      .attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3');
  }
}

function finishLasso(event) {
  const drag = selDrag;
  const m    = drag.map;
  selDrag = null;
  hideSelMode();

  const poly = drag.mode === 'lasso'
    ? drag.points
    : (() => {
        const pt = svgPoint(event, m);
        const x0 = Math.min(drag.startX, pt[0]), y0 = Math.min(drag.startY, pt[1]);
        const x1 = Math.max(drag.startX, pt[0]), y1 = Math.max(drag.startY, pt[1]);
        return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
      })();

  if (poly.length < 3) { clearSelPath(m); return; }

  state.selectedIds.clear();
  state.selMode = 'map' + m.id;
  state.geojson.features.forEach(f => {
    const c = m.pathGen.centroid(f);
    if (!isNaN(c[0]) && d3.polygonContains(poly, c))
      state.selectedIds.add(featureId(f));
  });

  m.brushG.select('.sel-path').attr('stroke-dasharray', null)
    .attr('fill', 'rgba(70,110,240,0.09)');
  m.brushG.select('.sel-rect').style('display', 'none');
  setTimeout(() => clearSelPath(m), 600);

  showClearBtn(state.selectedIds.size > 0);
  BOTH_MAPS.forEach(applyColors);
  drawScatter();
  drawStats();
  updateStatus();
}

function cancelLasso() {
  if (!selDrag) return;
  const m = selDrag.map;
  selDrag = null;
  hideSelMode();
  clearSelPath(m);
}

function clearSelPath(m) {
  m.brushG.select('.sel-path').attr('d', null).attr('fill', 'none');
  m.brushG.select('.sel-rect').style('display', 'none');
}

function showSelMode(mode) {
  const el = document.getElementById('selModeIndicator');
  el.textContent = mode === 'lasso' ? '⟡ Lasso' : '⬜ Rectangle';
  el.style.opacity = '1';
}
function hideSelMode() {
  document.getElementById('selModeIndicator').style.opacity = '0';
}

// ============================================================
//  TOOLTIP
//  Shows values for both variables when hovering either map or
//  a scatterplot dot.
// ============================================================

function showTooltip(event, d) {
  const p    = d.properties;
  const vdX  = getVarDef(state.varX);
  const vdY  = getVarDef(state.varY);
  const valX = getFeatureValue(d, state.varX);
  const valY = getFeatureValue(d, state.varY);
  const name  = p[FEATURE_NAME_FIELD] || '';
  const group = FEATURE_GROUP_FIELD ? p[FEATURE_GROUP_FIELD] : null;

  const tip = document.getElementById('tooltip');
  tip.style.left    = Math.min(event.clientX + 14, window.innerWidth - 220) + 'px';
  tip.style.top     = Math.max(event.clientY - 40, 8) + 'px';
  tip.style.display = 'block';
  tip.innerHTML =
    `${group ? `<span class="tip-group">${group}</span> · ` : ''}<span class="tip-id">${name}</span><br>` +
    `<span class="tip-label">▲ ${vdX.label}</span><br>` +
    `<span class="tip-val">${valX != null ? vdX.fmt(valX) : 'No data'}</span><br>` +
    `<span class="tip-label">▼ ${vdY.label}</span><br>` +
    `<span class="tip-val-y">${valY != null ? vdY.fmt(valY) : 'No data'}</span>`;
}

function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}

// ============================================================
//  SCATTERPLOT
//  X axis = varX (Map ▲), Y axis = varY (Map ▼)
//  One dot per feature. Lasso selection links to both maps.
//  OLS regression lines shown for full population and selection.
// ============================================================

//  Margins leave room for tick labels carrying their units ("30.0%", not
//  "30"). Widen `left` further if your fmt produces long labels — full
//  currency, say — since the y-axis labels sit inside it.
const SM = { top: 24, right: 34, bottom: 50, left: 60 };

let scSvg, scG, scBrushG;
let scXScale, scYScale;

function scDims() {
  const el = document.getElementById('scatterPane');
  const W  = Math.max(el.clientWidth  - SM.left - SM.right,  10);
  const H  = Math.max(el.clientHeight - SM.top  - SM.bottom, 10);
  return { W, H, tw: el.clientWidth, th: el.clientHeight };
}

function initScatter() {
  const { tw, th, W, H } = scDims();
  scSvg = d3.select('#scatterSvg').attr('width', tw).attr('height', th)
            .attr('viewBox', `0 0 ${tw} ${th}`);

  scG = scSvg.append('g').attr('transform', `translate(${SM.left},${SM.top})`);
  scG.append('g').attr('class', 'sc-x-axis').attr('transform', `translate(0,${H})`);
  scG.append('g').attr('class', 'sc-y-axis');
  scG.append('text').attr('class', 'sc-x-label').attr('text-anchor', 'middle')
    .attr('y', H + 40).style('font-size', '10px').style('fill', '#888');
  scG.append('text').attr('class', 'sc-y-label').attr('text-anchor', 'middle')
    .attr('transform', 'rotate(-90)').attr('y', -SM.left + 13)
    .style('font-size', '10px').style('fill', '#888');

  // Regression lines — all-population below dots, selection on top
  scG.append('line').attr('class', 'reg-all')
    .attr('stroke', '#aaa').attr('stroke-width', 1).attr('stroke-dasharray', '4,3')
    .style('pointer-events', 'none');
  scG.append('g').attr('class', 'dots-layer');
  scG.append('line').attr('class', 'reg-sel')
    .attr('stroke', SELECTION_COLOR).attr('stroke-width', 1.5)
    .style('display', 'none').style('pointer-events', 'none');

  // Correlation labels
  scG.append('text').attr('class', 'r-label-all')
    .style('font-size', '10px').style('fill', '#aaa').style('pointer-events', 'none');
  scG.append('text').attr('class', 'r-label-sel')
    .style('font-size', '10px').style('fill', SELECTION_COLOR)
    .style('display', 'none').style('pointer-events', 'none');

  // Brush/lasso overlay
  scBrushG = scSvg.append('g').attr('transform', `translate(${SM.left},${SM.top})`);
  scBrushG.append('path').attr('class', 'sc-sel-path');
  scBrushG.append('rect').attr('class', 'sc-sel-rect')
    .attr('fill', 'rgba(70,110,240,0.06)').style('display', 'none');

  setupScatterLasso();
}

function resizeScatter() {
  const { tw, th, W, H } = scDims();
  scSvg.attr('width', tw).attr('height', th).attr('viewBox', `0 0 ${tw} ${th}`);
  scG.select('.sc-x-axis').attr('transform', `translate(0,${H})`);
  scG.select('.sc-x-label').attr('y', H + 40);
}

function computeOLS(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const mx = d3.mean(pairs, p => p[0]);
  const my = d3.mean(pairs, p => p[1]);
  const num = d3.sum(pairs, p => (p[0] - mx) * (p[1] - my));
  const den = d3.sum(pairs, p => (p[0] - mx) ** 2);
  if (Math.abs(den) < 1e-12) return null;
  const slope     = num / den;
  const intercept = my - slope * mx;
  const sst = d3.sum(pairs, p => (p[1] - my) ** 2);
  const ssr = d3.sum(pairs, p => (p[1] - (slope * p[0] + intercept)) ** 2);
  const r2  = sst > 0 ? 1 - ssr / sst : 0;
  const r   = Math.sign(slope) * Math.sqrt(Math.abs(r2));
  return { slope, intercept, r2, r };
}

function drawRegLine(selector, ols, W) {
  if (!ols) { scG.select(selector).style('display', 'none'); return; }
  const [x0, x1] = scXScale.domain();
  scG.select(selector).style('display', null)
    .attr('x1', scXScale(x0)).attr('y1', scYScale(ols.slope * x0 + ols.intercept))
    .attr('x2', scXScale(x1)).attr('y2', scYScale(ols.slope * x1 + ols.intercept));
}

function drawScatter() {
  if (!state.geojson) return;
  const { W, H } = scDims();
  const vdX = getVarDef(state.varX);
  const vdY = getVarDef(state.varY);

  const features = state.geojson.features.filter(f =>
    getFeatureValue(f, state.varX) != null && getFeatureValue(f, state.varY) != null
  );

  scXScale = d3.scaleLinear()
    .domain(d3.extent(features, f => getFeatureValue(f, state.varX))).range([0, W]).nice();
  scYScale = d3.scaleLinear()
    .domain(d3.extent(features, f => getFeatureValue(f, state.varY))).range([H, 0]).nice();

  // Axes
  scG.select('.sc-x-axis').call(
    d3.axisBottom(scXScale).ticks(5).tickFormat(v => fmtValue(vdX, v))
  ).selectAll('text').style('font-size', '10px');
  scG.select('.sc-y-axis').call(
    d3.axisLeft(scYScale).ticks(5).tickFormat(v => fmtValue(vdY, v))
  ).selectAll('text').style('font-size', '10px');
  scG.select('.sc-x-label').attr('x', W / 2).text(vdX.label);
  scG.select('.sc-y-label').attr('x', -H / 2).text(vdY.label);

  // Regression — full population
  const allPairs = features.map(f => [getFeatureValue(f, state.varX), getFeatureValue(f, state.varY)]);
  const olsAll   = computeOLS(allPairs);
  drawRegLine('.reg-all', olsAll, W);
  if (olsAll) {
    scG.select('.r-label-all').style('display', null)
      .attr('x', W - 4).attr('y', 14).attr('text-anchor', 'end')
      .text(`r = ${olsAll.r.toFixed(2)}`);
  } else {
    scG.select('.r-label-all').style('display', 'none');
  }

  // Dots
  const hasSel = state.selectedIds.size > 0;
  scG.select('.dots-layer').selectAll('.dot')
    .data(features, featureId)
    .join('circle')
    .attr('class', 'dot')
    .attr('cx', f => scXScale(getFeatureValue(f, state.varX)))
    .attr('cy', f => scYScale(getFeatureValue(f, state.varY)))
    .attr('r', 4)
    .attr('fill', f =>
      hasSel && state.selectedIds.has(featureId(f)) ? SELECTION_COLOR : '#888'
    )
    .attr('fill-opacity', f => {
      if (!hasSel) return 0.6;
      return state.selectedIds.has(featureId(f)) ? 0.9 : DEEMPHASIS_OPACITY;
    })
    .attr('stroke', f =>
      hasSel && state.selectedIds.has(featureId(f)) ? '#b85c18' : 'none'
    )
    .attr('stroke-width', 1)
    .on('mousemove', (event, f) => showTooltip(event, f))
    .on('mouseleave', hideTooltip);

  // Regression — selection
  if (hasSel && state.selectedIds.size > 2) {
    const selPairs = features
      .filter(f => state.selectedIds.has(featureId(f)))
      .map(f => [getFeatureValue(f, state.varX), getFeatureValue(f, state.varY)]);
    const olsSel = computeOLS(selPairs);
    drawRegLine('.reg-sel', olsSel, W);
    if (olsSel) {
      scG.select('.r-label-sel').style('display', null)
        .attr('x', W - 4).attr('y', 26).attr('text-anchor', 'end')
        .text(`r = ${olsSel.r.toFixed(2)} (sel)`);
    } else {
      scG.select('.r-label-sel').style('display', 'none');
    }
  } else {
    scG.select('.reg-sel').style('display', 'none');
    scG.select('.r-label-sel').style('display', 'none');
  }
}

// ── Scatter lasso ────────────────────────────────────────────
//  Uses the scatter coordinate space (xScale/yScale), not map
//  projection space. No zoom transform to account for.

function svgPointScatter(event) {
  const r = document.getElementById('scatterSvg').getBoundingClientRect();
  return [event.clientX - r.left - SM.left,
          event.clientY - r.top  - SM.top];
}

//  Same split as the map lasso: mousedown here, the rest on the window.
let scDrag = null;

function setupScatterLasso() {
  scSvg.on('mousedown.sel', event => {
    if (!event.shiftKey) return;
    event.preventDefault();
    const mode = event.altKey ? 'rect' : 'lasso';
    const pt   = svgPointScatter(event);
    scDrag = { mode, points: [pt], startX: pt[0], startY: pt[1] };
    showSelMode(mode);
  });
}

function dragScatterLassoTo(event) {
  const pt = svgPointScatter(event);
  scDrag.points.push(pt);
  if (scDrag.mode === 'lasso') {
    const closed = [...scDrag.points, scDrag.points[0]];
    scBrushG.select('.sc-sel-path')
      .attr('d', 'M' + closed.map(p => p.join(',')).join('L') + 'Z')
      .attr('fill', 'rgba(70,110,240,0.07)')
      .attr('stroke', '#4466cc').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,3').attr('stroke-linejoin', 'round');
  } else {
    const x0 = Math.min(scDrag.startX, pt[0]), y0 = Math.min(scDrag.startY, pt[1]);
    const w  = Math.abs(pt[0] - scDrag.startX), h = Math.abs(pt[1] - scDrag.startY);
    scBrushG.select('.sc-sel-rect').style('display', null)
      .attr('x', x0).attr('y', y0).attr('width', w).attr('height', h);
    scBrushG.select('.sc-sel-path')
      .attr('d', `M${x0},${y0}h${w}v${h}h${-w}Z`)
      .attr('fill', 'none').attr('stroke', '#4466cc')
      .attr('stroke-width', 1.5).attr('stroke-dasharray', '5,3');
  }
}

function finishScatterLasso(event) {
  const drag = scDrag;
  scDrag = null;
  hideSelMode();

  const poly = drag.mode === 'lasso'
    ? drag.points
    : (() => {
        const pt = svgPointScatter(event);
        const x0 = Math.min(drag.startX, pt[0]), y0 = Math.min(drag.startY, pt[1]);
        const x1 = Math.max(drag.startX, pt[0]), y1 = Math.max(drag.startY, pt[1]);
        return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
      })();

  if (poly.length < 3) { clearScatterSelPath(); return; }

  state.selectedIds.clear();
  state.selMode = 'scatter';

  if (scXScale && scYScale) {
    state.geojson.features.forEach(f => {
      const x = getFeatureValue(f, state.varX);
      const y = getFeatureValue(f, state.varY);
      if (x == null || y == null) return;
      if (d3.polygonContains(poly, [scXScale(x), scYScale(y)]))
        state.selectedIds.add(featureId(f));
    });
  }

  scBrushG.select('.sc-sel-path').attr('stroke-dasharray', null)
    .attr('fill', 'rgba(70,110,240,0.09)');
  scBrushG.select('.sc-sel-rect').style('display', 'none');
  setTimeout(clearScatterSelPath, 600);

  showClearBtn(state.selectedIds.size > 0);
  BOTH_MAPS.forEach(applyColors);
  drawScatter();
  drawStats();
  updateStatus();
}

function cancelScatterLasso() {
  if (!scDrag) return;
  scDrag = null;
  hideSelMode();
  clearScatterSelPath();
}

// ============================================================
//  DRAG LIFECYCLE
//  One set of window-level handlers drives both lassos, so a drag that
//  leaves its pane still tracks and still completes on release. Escape
//  abandons the drag cleanly.
//
//  Shift is deliberately not rechecked here: people routinely let go of
//  the modifier a moment before the mouse button, and cancelling on that
//  would throw away the selection they just finished drawing.
// ============================================================

function setupDragLifecycle() {
  window.addEventListener('mousemove', event => {
    if (!selDrag && !scDrag) return;
    // No buttons held means the release happened somewhere that swallowed
    // the event — another window, or a native context menu.
    if (event.buttons === 0) { cancelLasso(); cancelScatterLasso(); return; }
    event.preventDefault();
    if (selDrag) dragLassoTo(event);
    if (scDrag)  dragScatterLassoTo(event);
  });

  window.addEventListener('mouseup', event => {
    if (selDrag) finishLasso(event);
    if (scDrag)  finishScatterLasso(event);
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { cancelLasso(); cancelScatterLasso(); }
  });
}

function clearScatterSelPath() {
  scBrushG.select('.sc-sel-path').attr('d', null).attr('fill', 'none');
  scBrushG.select('.sc-sel-rect').style('display', 'none');
}

// ============================================================
//  STATISTICS PANEL
// ============================================================

function calcStats(vals) {
  if (!vals || !vals.length) return null;
  const sorted = [...vals].sort(d3.ascending);
  return {
    n:      sorted.length,
    mean:   d3.mean(sorted),
    median: d3.median(sorted),
    min:    sorted[0],
    max:    sorted[sorted.length - 1],
    stddev: d3.deviation(sorted),
  };
}

function drawStats() {
  if (!state.geojson) return;
  const panel  = document.getElementById('statsPanel');
  const hasSel = state.selectedIds.size > 0;

  function pctDiff(sv, av) {
    if (!av) return '—';
    const d = ((sv - av) / Math.abs(av)) * 100;
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
  }

  function varBlock(varId) {
    const vd      = getVarDef(varId);
    const allVals = getValues(varId);
    const all     = calcStats(allVals);
    if (!all) return '';
    const tag = varId === state.varX ? '▲' : '▼';

    if (!hasSel) {
      return `
        <div class="stats-var-head">${tag} ${vd.label}</div>
        <div class="stats-grid stats-grid--simple">
          <span class="stats-label">n</span><span class="stats-val">${all.n.toLocaleString()}</span>
          <span class="stats-label">Mean</span><span class="stats-val">${vd.fmt(all.mean)}</span>
          <span class="stats-label">Median</span><span class="stats-val">${vd.fmt(all.median)}</span>
          <span class="stats-label">Std dev</span><span class="stats-val">${vd.fmt(all.stddev)}</span>
        </div>`;
    }

    const selFeatures = state.geojson.features.filter(f => state.selectedIds.has(featureId(f)));
    const selVals     = getValuesFor(varId, selFeatures);
    const sel         = calcStats(selVals);
    if (!sel) return '';
    const rows = [
      { lbl: 'n',       a: all.n.toLocaleString(), s: sel.n.toLocaleString(), p: pctDiff(sel.n, all.n) },
      { lbl: 'Mean',    a: vd.fmt(all.mean),        s: vd.fmt(sel.mean),        p: pctDiff(sel.mean, all.mean) },
      { lbl: 'Median',  a: vd.fmt(all.median),      s: vd.fmt(sel.median),      p: pctDiff(sel.median, all.median) },
      { lbl: 'Std dev', a: vd.fmt(all.stddev),      s: vd.fmt(sel.stddev),      p: pctDiff(sel.stddev, all.stddev) },
    ];
    return `
      <div class="stats-var-head">${tag} ${vd.label}</div>
      <div class="stats-grid">
        <span class="stats-col-head"></span>
        <span class="stats-col-head">All</span>
        <span class="stats-col-head">Sel</span>
        <span class="stats-col-head">Δ</span>
        ${rows.map(r => `
          <span class="stats-label">${r.lbl}</span>
          <span class="stats-val">${r.a}</span>
          <span class="stats-val">${r.s}</span>
          <span class="stats-pct ${parseFloat(r.p) > 0 ? 'pos' : parseFloat(r.p) < 0 ? 'neg' : ''}">${r.p}</span>
        `).join('')}
      </div>`;
  }

  panel.innerHTML = varBlock(state.varX) + varBlock(state.varY);
  panel.style.display = 'block';
}

// ============================================================
//  STATUS BAR
// ============================================================

function updateStatus() {
  const total = state.geojson ? state.geojson.features.length : 0;
  const sel   = state.selectedIds.size;
  document.getElementById('statusText').textContent = sel > 0
    ? `${sel.toLocaleString()} of ${total.toLocaleString()} ${GEOGRAPHY_LABEL}s selected`
    : `${total.toLocaleString()} ${GEOGRAPHY_LABEL}s · Shift+drag on a map or the scatterplot to select`;
}

// ============================================================
//  SELECTION MANAGEMENT
// ============================================================

function showClearBtn(show) {
  document.getElementById('clearBtn').style.display = show ? 'inline-block' : 'none';
}

function clearSelection() {
  state.selectedIds.clear();
  state.selMode = null;
  showClearBtn(false);
  BOTH_MAPS.forEach(applyColors);
  drawScatter();
  drawStats();
  updateStatus();
}

// ============================================================
//  VARIABLE & CLASSIFICATION CHANGES
// ============================================================

function onVarChange(mapId, varId) {
  if (mapId === 'X') state.varX = varId; else state.varY = varId;
  clearSelection();
  const m = mapId === 'X' ? mapX : mapY;
  drawTracts(m);
  updateColorBtn(m);
  updateDdWarn(m);
  drawScatter();
}

function onSchemeChange(m, schemeId) {
  if (m === mapX) state.schemeX = schemeId; else state.schemeY = schemeId;
  clearSelection();
  drawTracts(m);
  updateColorBtn(m);
  updateDdWarn(m);
}

function onClassChange(method) {
  state.classification = method;
  clearSelection();
  BOTH_MAPS.forEach(drawTracts);
}

function onBucketChange(k) {
  state.buckets = +k;
  clearSelection();
  BOTH_MAPS.forEach(drawTracts);
  BOTH_MAPS.forEach(m => { refreshDropdownSwatches(m); updateColorBtn(m); });
}

// ============================================================
//  PANEL DIVIDER
// ============================================================

function setupPanelDivider() {
  const divider   = document.getElementById('panelDivider');
  const mapsPanel = document.getElementById('mapsPanel');
  const main      = document.getElementById('main');
  let dragging = false;

  divider.addEventListener('mousedown', e => {
    dragging = true;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const pct  = Math.min(Math.max((e.clientX - rect.left) / rect.width * 100, 25), 78);
    mapsPanel.style.flex = `0 0 ${pct}%`;
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    resizeAndRedraw();
  });
}

// ============================================================
//  RESIZE & REDRAW
// ============================================================

function resizeAndRedraw() {
  state.zoomTransform = d3.zoomIdentity;
  syncing = true;
  BOTH_MAPS.forEach(m => m.svg.call(m.zoomBehavior.transform, d3.zoomIdentity));
  syncing = false;
  BOTH_MAPS.forEach(m => { resizeMap(m); drawTracts(m); });
  resizeScatter();
  drawScatter();
}

// ============================================================
//  VALIDATION
// ============================================================

function showErrors(heading, errors) {
  document.getElementById('loadingMsg').innerHTML =
    `<span class="load-error">⚠ ${heading}:<br><br>` +
    errors.map(e => `• ${e}`).join('<br><br>') + '</span>';
}

//  Checks config.js against itself, before any data is loaded. These are all
//  settings that used to fail silently or half-apply: a DEFAULT_BUCKETS
//  outside the dropdown's range left the control showing one number while
//  the map drew another, and a DEFAULT_VAR_X naming no variable fell back to
//  VARIABLES[0] while the dropdown disagreed.
function validateConfig() {
  const errors = [];

  if (!Array.isArray(VARIABLES) || !VARIABLES.length) {
    errors.push('VARIABLES is empty. Define at least one variable.');
    return errors;
  }

  const ids = new Set();
  VARIABLES.forEach((v, i) => {
    const where = v.label || v.id || `entry ${i + 1}`;
    if (!v.id)                       errors.push(`Variable "${where}": missing id.`);
    else if (ids.has(v.id))          errors.push(`Variable id "${v.id}" is used more than once. Ids must be unique.`);
    else                             ids.add(v.id);
    if (!v.prop)                     errors.push(`Variable "${where}": missing prop (the GeoJSON property name).`);
    if (typeof v.fmt !== 'function') errors.push(`Variable "${where}": fmt must be a function, e.g. v => v.toFixed(1) + '%'.`);
  });

  [['DEFAULT_VAR_X', DEFAULT_VAR_X], ['DEFAULT_VAR_Y', DEFAULT_VAR_Y]].forEach(([name, val]) => {
    if (!ids.has(val))
      errors.push(`${name} is "${val}", which is not an id in VARIABLES. Available ids: ${[...ids].join(', ')}.`);
  });

  if (!['quantile', 'equal'].includes(DEFAULT_CLASSIFICATION))
    errors.push(`DEFAULT_CLASSIFICATION is "${DEFAULT_CLASSIFICATION}". Use 'quantile' or 'equal'.`);

  if (!Number.isInteger(DEFAULT_BUCKETS) || DEFAULT_BUCKETS < 3 || DEFAULT_BUCKETS > 8)
    errors.push(`DEFAULT_BUCKETS is ${DEFAULT_BUCKETS}. Use a whole number from 3 to 8.`);

  [['DEFAULT_SCHEME_X', DEFAULT_SCHEME_X], ['DEFAULT_SCHEME_Y', DEFAULT_SCHEME_Y]].forEach(([name, val]) => {
    if (!ALL_SCHEMES.some(s => s.id === val))
      errors.push(`${name} is "${val}", which is not a ColorBrewer scheme in this tool. See the list in config.js.`);
  });

  return errors;
}

//  Checks the loaded data against config.js.
//
//  Property names are collected across every feature, not read off
//  features[0]. Merged data very often has a ragged property set — one
//  feature missing one field is normal — and testing the first feature alone
//  reported a correctly named variable as "not found", which sends the
//  reader off to check a spelling that was never wrong.
function validate(geojson) {
  const errors = [];
  const features = geojson.features;

  if (!Array.isArray(features) || !features.length) {
    errors.push('The GeoJSON file contains no features. Check that the file is valid GeoJSON.');
    return errors;
  }

  const names = new Set();
  features.forEach(f => {
    if (f && f.properties) for (const k in f.properties) names.add(k);
  });

  if (!names.has(FEATURE_ID_FIELD))
    errors.push(`FEATURE_ID_FIELD: property "${FEATURE_ID_FIELD}" appears on no feature. Check the exact property name in your GeoJSON and update config.js.`);
  if (FEATURE_NAME_FIELD && !names.has(FEATURE_NAME_FIELD))
    errors.push(`FEATURE_NAME_FIELD: property "${FEATURE_NAME_FIELD}" appears on no feature.`);
  if (FEATURE_GROUP_FIELD && !names.has(FEATURE_GROUP_FIELD))
    errors.push(`FEATURE_GROUP_FIELD: property "${FEATURE_GROUP_FIELD}" appears on no feature. Set it to null if your data has no parent geography.`);

  VARIABLES.forEach(v => {
    if (!names.has(v.prop))
      errors.push(`Variable "${v.label}": property "${v.prop}" appears on no feature. Check that the prop name in config.js matches exactly, including spaces and capitalisation.`);
  });

  // Feature ids are the D3 join key and the members of the selection Set.
  // Duplicates are silent and destructive: repeated ids collapse in the join,
  // so features vanish from the map and selecting one highlights another.
  if (names.has(FEATURE_ID_FIELD)) {
    const seen = new Set();
    const dupes = new Set();
    let missing = 0, repeats = 0;
    features.forEach(f => {
      const id = f.properties ? f.properties[FEATURE_ID_FIELD] : undefined;
      if (id == null || id === '') { missing++; return; }
      if (seen.has(id)) { dupes.add(id); repeats++; } else seen.add(id);
    });
    if (missing)
      errors.push(`FEATURE_ID_FIELD: ${missing.toLocaleString()} feature(s) have no "${FEATURE_ID_FIELD}" value. Every feature needs a unique id.`);
    if (dupes.size)
      errors.push(`FEATURE_ID_FIELD: "${FEATURE_ID_FIELD}" is not unique — ${repeats.toLocaleString()} feature(s) reuse an id already taken by another (repeated value${dupes.size > 1 ? 's' : ''}: ${[...dupes].slice(0, 3).join(', ')}${dupes.size > 3 ? ', …' : ''}). Duplicated ids make features vanish from the map and break selection. Add a unique id, e.g. gdf['fid'] = range(1, len(gdf) + 1).`);
  }

  // A variable that parses to nothing usable is almost always a config
  // mistake — a text column mapped by accident, or a nullVal that matches
  // every row — and produces an empty map with no other explanation.
  VARIABLES.forEach(v => {
    if (!names.has(v.prop)) return;
    const usable = features.some(f => getFeatureValue(f, v.id) != null);
    if (!usable)
      errors.push(`Variable "${v.label}": no feature has a usable numeric value for "${v.prop}". Check that the field is numeric and that nullVal is not matching every row.`);
  });

  return errors;
}

// ============================================================
//  INIT
// ============================================================

async function init() {
  applyPageIdentity();
  document.getElementById('loadingMsg').style.display = 'flex';

  const configErrors = validateConfig();
  if (configErrors.length) { showErrors('Configuration errors in config.js', configErrors); return; }

  let geojson;
  try {
    const res = await fetch(DATA_FILE);
    if (!res.ok) throw new Error(`HTTP ${res.status} — could not load ${DATA_FILE}`);
    geojson = await res.json();
  } catch (err) {
    document.getElementById('loadingMsg').innerHTML =
      `<span class="load-error">⚠ Could not load data<br>${err.message}<br><br>` +
      `Make sure you are serving the project from a local web server, not opening index.html directly as a file.</span>`;
    return;
  }

  const errors = validate(geojson);
  if (errors.length) { showErrors('The data does not match config.js', errors); return; }

  state.geojson = geojson;
  document.getElementById('loadingMsg').style.display = 'none';

  // Variable dropdowns
  [['varSelectX', DEFAULT_VAR_X], ['varSelectY', DEFAULT_VAR_Y]].forEach(([selId, def]) => {
    const sel = document.getElementById(selId);
    sel.innerHTML = '';
    VARIABLES.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id; opt.textContent = v.label;
      if (v.id === def) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  document.getElementById('classSelect').value  = DEFAULT_CLASSIFICATION;
  document.getElementById('bucketSelect').value = String(DEFAULT_BUCKETS);

  document.getElementById('varSelectX').addEventListener('change', e => onVarChange('X', e.target.value));
  document.getElementById('varSelectY').addEventListener('change', e => onVarChange('Y', e.target.value));
  document.getElementById('classSelect').addEventListener('change', e => onClassChange(e.target.value));
  document.getElementById('bucketSelect').addEventListener('change', e => onBucketChange(e.target.value));
  document.getElementById('clearBtn').addEventListener('click', clearSelection);
  document.getElementById('zoomIn').addEventListener('click',    () => zoomBy(2));
  document.getElementById('zoomOut').addEventListener('click',   () => zoomBy(0.5));
  document.getElementById('zoomReset').addEventListener('click', () => zoomReset());

  BOTH_MAPS.forEach(m => {
    document.getElementById(m.colorBtnId).addEventListener('click', e => {
      e.stopPropagation();
      toggleDropdown(m);
    });
    buildDropdown(m);
    updateColorBtn(m);
  });

  document.addEventListener('click', () => BOTH_MAPS.forEach(closeDropdown));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') BOTH_MAPS.forEach(closeDropdown);
  });

  BOTH_MAPS.forEach(initMap);
  setupZoomSync();
  setupDragLifecycle();
  BOTH_MAPS.forEach(m => { resizeMap(m); drawTracts(m); setupLasso(m); });

  drawStats();
  initScatter();
  drawScatter();

  setupPanelDivider();
  window.addEventListener('resize', resizeAndRedraw);

  updateStatus();
}

window.addEventListener('DOMContentLoaded', init);
