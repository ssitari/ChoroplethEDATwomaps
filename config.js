// ============================================================
//  config.js  —  Configure this file to use your own data
// ============================================================
//
//  HOW TO USE THIS FILE
//  ────────────────────
//  This is the only file you need to edit. The visualization
//  engine (app.js) and layout (index.html) read everything
//  they need from the settings you define below.
//
//  QUICK START
//  1. Drop your GeoJSON file into the data/ folder
//  2. Set DATA_FILE to its path (see below)
//  3. Set GEOGRAPHY_LABEL to describe one feature (e.g. 'tract', 'county')
//  4. Update the four identity fields to match your GeoJSON properties
//  5. Replace the VARIABLES array with your own numeric fields
//  6. Set PAGE_TITLE and DATA_CREDIT_HTML, and clear ANALYTICS_TOKEN
//  7. Serve the folder with a local web server and open in a browser
//
//  LOCAL SERVER OPTIONS
//  Browsers block direct file:// access to data — you need a server:
//    Python:  python3 -m http.server 8000   → open http://localhost:8000
//    Node:    npx serve .                   → follow the printed URL
//    VS Code: Live Server extension → right-click index.html → Open with Live Server
//
// ============================================================


// ── Page identity ───────────────────────────────────────────────────────
//
//  PAGE_TITLE
//    Shown in the browser tab and in the toolbar heading. Keep it short:
//    it shares one row with every control on a wide screen.
//
//  PAGE_SUBTITLE
//    Optional smaller line under the heading. Set to '' to hide it.
//
//  DATA_CREDIT_HTML
//    The footer line on the published page. This is the one thing a reader
//    who arrives cold has to work from, so it should name the actual source
//    of your data and link to it. Inline HTML is allowed so you can include
//    links. Set to null to hide the footer entirely.
//
//    Never leave the demo credit in place over your own data — it will
//    attribute your map to NYC DOHMH.
//
//  ANALYTICS_TOKEN
//    Cloudflare Web Analytics site token, or null for no analytics.
//    If you copied this repository, the token below is NOT yours: it
//    belongs to the original author's account and your traffic would be
//    reported there. Replace it with your own or set it to null.
//
export const PAGE_TITLE = 'Compare Two Variables Across Space';

export const PAGE_SUBTITLE = 'Explore each variable on its own map, then see how their values relate in the linked scatterplot';

export const DATA_CREDIT_HTML = `
  Demo data: NYC DOHMH
  <a href="https://github.com/nychealth/covid-vaccine-data" rel="noopener" target="_blank">COVID-19 Vaccine Data</a>
  as of March 26, 2021 &mdash; a historical snapshot from early in the vaccine rollout, not current figures.
  Demographics: US Census Bureau, American Community Survey 2017&ndash;21 5-year estimates.
  Source code, method notes and full citations:
  <a href="https://github.com/ssitari/ChoroplethEDATwomaps" rel="noopener" target="_blank">ssitari/ChoroplethEDATwomaps</a>.
`;

export const ANALYTICS_TOKEN = '8bd0b9cc3d344a979211402c2f0108ee';


// ── Data file ───────────────────────────────────────────────────────────
//
//  Path to your GeoJSON file, relative to this folder.
//
//  Requirements:
//    • Coordinate system: WGS 84 (EPSG:4326) — decimal lat/lng.
//      If your file uses a projected CRS (State Plane, UTM, etc.)
//      reproject it first:
//        Python:  gdf.to_crs('EPSG:4326').to_file('out.geojson', driver='GeoJSON')
//        QGIS:    Vector → Data Management Tools → Reproject Layer
//    • Geometry: Polygon or MultiPolygon only
//    • Variables: all must be pre-calculated numeric fields in the properties.
//      The tool does not calculate anything — prepare rates, percentages,
//      and derived fields in your data before loading.
//    • One property must uniquely identify each feature (see FEATURE_ID_FIELD)
//    • For large datasets (2,000+ features) consider simplifying geometry:
//        from shapely import simplify
//        gdf['geometry'] = gdf['geometry'].apply(
//            lambda g: simplify(g, tolerance=0.0003, preserve_topology=True))
//
export const DATA_FILE = './data/MODZCTAS_Vaccine_2021.geojson';


// ── Geography label ─────────────────────────────────────────────────────
//
//  Singular label for one feature, shown in status messages and tooltips.
//  Examples: 'tract', 'county', 'zip code area', 'borough', 'block group'
//
export const GEOGRAPHY_LABEL = 'zip code area';


// ── Feature identity fields ─────────────────────────────────────────────
//
//  FEATURE_ID_FIELD
//    A property that uniquely identifies each feature.
//    Can be a number or a string. Used to track selections internally.
//    Examples: 'GEOID', 'FIPS', 'fid', 'OBJECTID', 'GEO_ID'
//
//  FEATURE_NAME_FIELD
//    A human-readable label shown in tooltips.
//    Can be the same as FEATURE_ID_FIELD if no better label exists.
//    Examples: 'NAME', 'GEOID', 'NTA_NAME', 'COUNTY_NAME'
//
//  FEATURE_GROUP_FIELD
//    An optional secondary label shown in tooltips — useful for a parent
//    geography like borough, county, or state.
//    Set to null to omit.
//    Examples: 'BoroName', 'COUNTY', 'STATE_NAME', null
//
export const FEATURE_ID_FIELD    = 'fid';
export const FEATURE_NAME_FIELD  = 'MODZCTA';
export const FEATURE_GROUP_FIELD = 'Area Name';


// ── Variables ───────────────────────────────────────────────────────────
//
//  Each entry defines one mappable numeric variable.
//  Add, remove, or edit entries to match your data.
//  Any variable can be assigned to either map using the dropdowns.
//
//  Fields:
//    id       A unique short key — no spaces or special characters.
//             Used to identify the variable in the defaults below.
//
//    label    Shown in the variable dropdown, the legend title, the
//             scatterplot axis label, and the tooltip.
//             Keep it concise; long labels may be truncated.
//
//    prop     The exact property name in your GeoJSON features.
//             Must match character-for-character, including spaces and
//             capitalisation. Check with a GeoJSON viewer if unsure.
//
//    fmt      A JavaScript function that formats one value for display.
//             Used everywhere the variable's values are shown: tooltips,
//             the statistics panel, the legend breaks, and the scatterplot
//             axis ticks — so whatever units you put here appear on the map
//             itself, not just on hover. Common patterns:
//               Whole number:      v => Math.round(v).toLocaleString()
//               One decimal:       v => v.toFixed(1)
//               Percentage:        v => v.toFixed(1) + '%'
//               Currency:          v => '$' + Math.round(v).toLocaleString()
//               Per square mile:   v => Math.round(v).toLocaleString() + ' /mi²'
//
//    nullVal  A data value that should be treated as "no data".
//             Features with this value receive the null color on the map
//             and are excluded from statistics and the scatterplot.
//
//             Set to null when every value in the field is real — this is
//             the right choice more often than it looks. Some GIS exports
//             do use 0 to mean "no data", but for a great many variables
//             (percent vacant, percent uninsured, counts of a rare event,
//             net change) 0 is a genuine observation, and setting
//             nullVal: 0 will silently delete those features from the map
//             and from every statistic. When in doubt, set it to null and
//             check the "No data" count in the legend against your source.
//
//             Values that are null, empty, or non-numeric in the data are
//             always treated as missing regardless of this setting.
//
//    diverge  Set to true if the variable has a meaningful midpoint —
//             for example: percent change, deviation from average, z-score,
//             or any measure that goes both positive and negative.
//             When true, diverging ColorBrewer palettes become appropriate.
//             Leave false for variables that only go in one direction
//             (counts, rates, percentages from 0 to 100).
//
export const VARIABLES = [
  {
    id:      'vax_full',
    label:   'Percent Fully Vaccinated',
    prop:    'Percent Fully Vaccinated',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
  {
    id:      'vax_one',
    label:   'Percent With at Least One Dose',
    prop:    'Percent With at Least One Dose',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
  {
    id:      'over65',
    label:   'Percent Over 65',
    prop:    'Percent Over 65',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
  {
    id:      'white',
    label:   'Percent White',
    prop:    'Percent White',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
  {
    id:      'black',
    label:   'Percent Black',
    prop:    'Percent Black',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
  {
    id:      'hispanic',
    label:   'Percent Hispanic',
    prop:    'Percent Hispanic',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
];


// ── Default variable assignments ────────────────────────────────────────
//
//  Which variables appear on the top map (X) and bottom map (Y) at load.
//  Must match an id value from the VARIABLES array above.
//
export const DEFAULT_VAR_X = 'over65';
export const DEFAULT_VAR_Y = 'vax_full';


// ── Classification ──────────────────────────────────────────────────────
//
//  DEFAULT_CLASSIFICATION controls how features are grouped into classes:
//    'quantile'   Equal-count classes. Each class contains roughly the same
//                 number of features. Good for skewed distributions; produces
//                 visually balanced maps.
//    'equal'      Equal-width classes. The data range is divided into equal
//                 intervals. More intuitive breakpoints, but can produce
//                 unbalanced maps when data is heavily skewed.
//
//  DEFAULT_BUCKETS is the number of classes (3–8).
//  5 or 6 works well for most datasets.
//  Both can be changed interactively in the toolbar.
//
export const DEFAULT_CLASSIFICATION = 'quantile';
export const DEFAULT_BUCKETS        = 5;


// ── Color schemes ───────────────────────────────────────────────────────
//
//  ColorBrewer palette applied to the top map (X) and bottom map (Y).
//  Using different palettes helps visually distinguish the two variables.
//  Both can be changed interactively using the palette buttons in the toolbar.
//
//  Sequential schemes — for data that goes in one direction (rates, counts):
//    Blues, Greens, Greys, Oranges, Purples, Reds,
//    BuGn, BuPu, GnBu, OrRd, PuBu, PuBuGn, PuRd, RdPu,
//    YlGn, YlGnBu, YlOrBr, YlOrRd
//
//  Diverging schemes — for data with a meaningful midpoint
//  (requires diverge: true on the variable):
//    BrBG, PiYG, PRGn, PuOr, RdBu, RdGy, RdYlBu, RdYlGn, Spectral
//
export const DEFAULT_SCHEME_X = 'BuGn';
export const DEFAULT_SCHEME_Y = 'BuGn';


// ── Display options ─────────────────────────────────────────────────────
//
//  NULL_COLOR
//    Fill color for features with null or missing data.
//    A neutral grey works best against most base colors.
//
//  SELECTION_COLOR
//    Highlight color for selected features in the scatterplot, and for
//    the regression line fitted to the selection.
//    Should contrast clearly with both map palette colors.
//
//  DEEMPHASIS_OPACITY
//    Opacity of non-selected features when a selection is active.
//    Range: 0 (invisible) to 1 (full opacity). 0.15–0.25 works well.
//
export const NULL_COLOR         = '#d0d0d0';
export const SELECTION_COLOR    = '#e07b39';
export const DEEMPHASIS_OPACITY = 0.2;
