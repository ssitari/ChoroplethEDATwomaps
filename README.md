# Compare Two Variables Across Space

Explore each variable on its own map, then see how their values relate in the linked scatterplot.

An interactive dual choropleth explorer linking two stacked univariate maps to a scatterplot with OLS regression and bidirectional selection. Each map displays an independently chosen and colored variable; the scatterplot plots them against each other.

The inspiration for this is the brushable EDA toolset in [GeoDa](https://geodacenter.github.io/), which I have been using for years. It's remarkable that ESRI and QGIS still haven't brought those tools into their own platforms. This is an effort to replicate that kind of linked-view interactivity for outward-facing web visualization.

Built with [D3.js](https://d3js.org). No build step required — plain HTML, CSS, and ES modules.

---

## Live demo

[View on GitHub Pages](https://ssitari.github.io/ChoroplethEDATwomaps/)

---

## What it does

- **Two stacked choropleth maps** — Map ▲ and Map ▼ each display an independently selected variable with its own ColorBrewer palette, classification method, and floating legend
- **Synchronized zoom** — zooming or panning either map mirrors the other instantly
- **Linked scatterplot** — one dot per feature; X axis = Map ▲ variable, Y axis = Map ▼ variable
- **OLS regression lines** — a dashed grey line shows the full-population trend with r value; an orange line shows the trend for the active selection with its own r value
- **Bidirectional selection** — lasso or rectangle selection on either map or the scatterplot highlights the corresponding features in all three views simultaneously
- **Summary statistics panel** — always visible; shows mean, median, std deviation, and n for both variables at load, expanding to an All / Selection / Δ comparison table when a selection is active
- **Draggable panel divider** — the split between the map area and the right panel can be repositioned by dragging
- **ColorBrewer palette picker** — 18 sequential and 9 diverging schemes per map, with a warning when a diverging scheme is applied to a non-diverging variable
- **Classification controls** — toggle between quantile and equal-interval; choose 3–8 classes, applied to both maps simultaneously
- **Configuration checking** — `config.js` is validated against itself and against the loaded data before anything is drawn, naming the specific setting at fault rather than failing silently or drawing an empty map
- **Responsive layout** — the panels stack below 820px; selection needs a mouse, and the page says so to touch devices

---

## Project structure

```
project/
├── index.html          # Layout and controls — do not edit
├── app.js              # Visualization engine — do not edit
├── config.js           # ← Edit this to use your own data
├── LICENSE             # MIT
└── data/
    └── *.geojson       # Drop your GeoJSON file here
```

---

## Using your own data

### 1. Prepare your GeoJSON

Your file must meet these requirements before loading:

- **Coordinate system: WGS 84 (EPSG:4326)** — standard lat/lng decimal degrees. If your file uses a projected CRS (e.g. State Plane feet, UTM metres) you must reproject it first. [QGIS](https://qgis.org) and the Python `pyproj` library can both do this.
- **Geometry types: Polygon or MultiPolygon** only
- **All variables must be pre-computed numeric fields** in the feature properties. The tool does not perform calculations — prepare percentages, rates, and derived fields in your data before loading.
- **A unique ID field** — one property that is a unique integer or string identifier per feature (e.g. FIPS code, GEOID, an auto-incremented `fid`). Uniqueness is checked at load and is not optional: the ID is the join key, so duplicates make features vanish from the map and break selection.
- **No null geometries** — features with missing or empty geometries should be removed before loading

A good workflow for preparation is QGIS (for reprojection and field calculation) or GeoPandas in Python. See [Data preparation notes](#data-preparation-notes) below.

### 2. Place your file

Copy your GeoJSON file into the `data/` folder.

### 3. Edit config.js

Open `config.js` and work down it. The first block is what the published
page says about itself:

```javascript
export const PAGE_TITLE = 'Vacancy and Rent Burden by Tract';

// Optional line under the heading; '' hides it.
export const PAGE_SUBTITLE = 'ACS 5-year estimates, 2020–24';

// Footer credit. Inline HTML is allowed so you can link the source.
// Never leave the demo credit in place over your own data.
export const DATA_CREDIT_HTML = `
  Data: <a href="https://example.org/source">Source name</a>.
  Code: <a href="https://github.com/you/your-repo">you/your-repo</a>.
`;

// Cloudflare Web Analytics site token, or null for none.
// The token in the repository is the original author's — replace it or
// set it to null, or your traffic is reported to someone else's account.
export const ANALYTICS_TOKEN = null;
```

Then the data itself:

```javascript
export const DATA_FILE = './data/YourFile.geojson';

// What one feature is called (singular), e.g. 'county', 'tract', 'zip code'
export const GEOGRAPHY_LABEL = 'tract';

// A property that uniquely identifies each feature
export const FEATURE_ID_FIELD = 'GEOID';

// A human-readable name shown in tooltips
export const FEATURE_NAME_FIELD = 'NAME';

// Optional secondary label in tooltips (e.g. state, borough). Set null to omit.
export const FEATURE_GROUP_FIELD = 'STATE_NAME';
```

Then replace the `VARIABLES` array with entries for your own fields:

```javascript
export const VARIABLES = [
  {
    id:      'med_income',                // unique key, no spaces
    label:   'Median Household Income',   // dropdowns, legend title, axis, tooltip
    prop:    'MED_HH_INC',                // exact property name in your GeoJSON
    fmt:     v => '$' + Math.round(v).toLocaleString(),  // used everywhere values
                                          // are shown, including legend breaks
    nullVal: null,                        // a value to treat as "no data", or null
    diverge: false,                       // true for variables with a meaningful midpoint
                                          // (e.g. percent change, z-score)
  },
  {
    id:      'pct_vacant',
    label:   'Percent Vacant Housing',
    prop:    'PCT_VACANT',
    fmt:     v => v.toFixed(1) + '%',
    nullVal: null,
    diverge: false,
  },
  // Add as many variables as you like — any two can be assigned to Map ▲ and Map ▼
];
```

Finally set your defaults:

```javascript
export const DEFAULT_VAR_X          = 'med_income';   // variable shown on Map ▲ at load
export const DEFAULT_VAR_Y          = 'pct_vacant';   // variable shown on Map ▼ at load
export const DEFAULT_CLASSIFICATION = 'quantile';     // 'quantile' | 'equal'
export const DEFAULT_BUCKETS        = 5;              // 3–8
export const DEFAULT_SCHEME_X       = 'BuGn';         // palette for Map ▲
export const DEFAULT_SCHEME_Y       = 'BuGn';         // palette for Map ▼
```

### 4. Serve and open

You need a local web server because the app loads data via `fetch()`, which browsers block on `file://` URLs.

**Python (simplest):**
```bash
cd your-project-folder
python3 -m http.server 8000
# then open http://localhost:8000
```

**Node / npx:**
```bash
npx serve your-project-folder
```

**VS Code:** Install the "Live Server" extension → right-click `index.html` → Open with Live Server.

### 5. Before you publish your copy

Four things in this repository are specific to the original and will follow
your copy unless you change them:

- **`ANALYTICS_TOKEN`** — the Cloudflare Web Analytics token belongs to the
  original author's account. Replace it with your own or set it to `null`.
- **`DATA_CREDIT_HTML`** — the demo footer credits NYC DOHMH. Left in place
  over your data it misattributes your map.
- **`PAGE_TITLE`** and **`PAGE_SUBTITLE`** — appear in the browser tab and the toolbar.
- **`data/MODZCTAS_Vaccine_2021.geojson`** — delete the demo file once your
  own data loads.

Everything above lives in `config.js`. You should not need to touch
`index.html` or `app.js` to publish your own map.

---

## Interaction reference

| Action | Effect |
|---|---|
| Shift + drag on either map | Freehand lasso selection of features |
| Shift + Alt + drag on either map | Rectangle selection of features |
| Shift + drag on scatterplot | Freehand lasso selection of points |
| Shift + Alt + drag on scatterplot | Rectangle selection of points |
| Escape while dragging | Abandon the selection in progress |
| Scroll wheel on map | Zoom in/out (mirrors to both maps) |
| Drag on map (no Shift) | Pan (mirrors to both maps) |
| +/− buttons | Zoom in/out |
| ⊙ button | Reset zoom |
| Hover over feature or dot | Tooltip with name and both variable values |
| Clear selection button | Reset all views |
| Map ▲ / Map ▼ variable dropdowns | Change the variable on each map and the corresponding scatter axis |
| Palette buttons | Open the ColorBrewer scheme picker for each map |
| Classification dropdown | Switch between quantile and equal-interval (both maps) |
| Classes dropdown | Change the number of classes, 3–8 (both maps) |
| Drag panel divider | Resize the map area vs. scatterplot/stats panel |

---

## Deploying to GitHub Pages

1. Push the entire project folder to a GitHub repository
2. Go to **Settings → Pages → Source**: `main` branch, `/ (root)`
3. Your tool will be live at `https://<username>.github.io/<repo>/`

No build step required.

---

## Data preparation notes

### Reprojecting in Python

```python
import geopandas as gpd

gdf = gpd.read_file('your_file.shp')    # or .geojson
gdf = gdf.to_crs('EPSG:4326')           # reproject to WGS 84
gdf.to_file('your_file_wgs84.geojson', driver='GeoJSON')
```

### Adding a unique ID field

```python
gdf['fid'] = range(1, len(gdf) + 1)
```

### Simplifying geometry for web performance

For large datasets (1,000+ features), simplifying geometry significantly reduces file size and improves rendering speed:

```python
from shapely import simplify
gdf['geometry'] = gdf['geometry'].apply(
    lambda g: simplify(g, tolerance=0.0003, preserve_topology=True)
)
```

Tolerance values around 0.0002–0.0005 degrees work well for city/regional data. Increase for national datasets.

### Recommended file sizes

| Features | Target size | Notes |
|---|---|---|
| < 500 | < 1 MB | No simplification needed |
| 500–2,000 | 1–3 MB | Light simplification recommended |
| 2,000–5,000 | 2–5 MB | Moderate simplification required |
| 5,000+ | Consider vector tiles | SVG rendering becomes slow above ~5k features |

---

## Classification methods

- **Quantile** — features are divided into k equal-count classes. Produces a visually balanced map for most datasets but class boundaries may be unintuitive.
- **Equal interval** — the data range is divided into k equal-width classes. More intuitive boundaries but can produce visually unbalanced maps when the data is skewed.

Classification and class count apply to both maps simultaneously.

**Tied values.** Quantile breaks collapse when many features share the same
value — common for a rate that is zero across most small geographies, or a
rounded percentage. Rather than list classes the map cannot draw, the tool
drops the duplicate breaks and notes the result in the legend, e.g.
*2 of 5 classes — tied values*. If you see that note, either lower k or
switch to equal interval; the underlying data simply does not support the
number of classes you asked for.

---

## Color schemes

All palettes are from [ColorBrewer](https://colorbrewer2.org), Cynthia Brewer's hand-tuned cartographic color schemes, accessed through D3's built-in scheme objects. Each map has its own independently selectable palette.

**Sequential schemes (18):** Blues, Greens, Greys, Oranges, Purples, Reds, BuGn, BuPu, GnBu, OrRd, PuBu, PuBuGn, PuRd, RdPu, YlGn, YlGnBu, YlOrBr, YlOrRd

**Diverging schemes (9):** BrBG, PiYG, PRGn, PuOr, RdBu, RdGy, RdYlBu, RdYlGn, Spectral

A warning appears in the palette picker when a diverging scheme is selected for a variable not flagged as `diverge: true` in config.js.

---

## Demo data

The included demo dataset covers **NYC Modified Zip Code Tabulation Areas (MODZCTAs)** with COVID-19 vaccination rates as of March 26, 2021, and demographic data from the 2017–2021 American Community Survey (ACS) 5-year estimates.

**Sources:**
- Vaccination rates: NYC Department of Health and Mental Hygiene (DOHMH), NYC COVID-19 Vaccine Data — [github.com/nychealth/covid-vaccine-data](https://github.com/nychealth/covid-vaccine-data)
- Demographics (percent over 65, white, Black, Hispanic): US Census Bureau, American Community Survey 2017–2021 5-year estimates — [data.census.gov](https://data.census.gov)

**Geography:** NYC MODZCTA boundaries are derived from US Census ZIP Code Tabulation Areas, modified by DOHMH for public health reporting. Original boundaries available at [NYC Open Data](https://data.cityofnewyork.us).

**Inspiration:** The New York Times, March 26, 2021 — [Why Are Some N.Y.C. Neighborhoods Still Waiting for Vaccines?](https://www.nytimes.com/interactive/2021/03/26/nyregion/nyc-vaccination-rates-map.html)

---

## Related tools

This project is part of a series of linked-view exploratory data analysis tools:

- **Choropleth EDA — Univariate** — single variable choropleth with linked histogram, multiple classification schemes, and ColorBrewer palettes
- **Choropleth EDA — Bivariate** — two-variable bivariate choropleth linked to a scatterplot with OLS regression and bidirectional selection
- **Choropleth EDA — Two Maps** — this tool

---

## Libraries and tools

| Library | Use | License |
|---|---|---|
| [D3.js v7](https://d3js.org) | Visualization, mapping, statistics | ISC |

---

## Acknowledgements

Methodological inspiration from the GeoDa platform:

> Anselin, Luc, Ibnu Syabri and Youngihn Kho (2006). GeoDa: An Introduction to Spatial Data Analysis. *Geographical Analysis* 38 (1), 5–22.

Color palettes from [ColorBrewer](https://colorbrewer2.org) (Cynthia Brewer).

Most of the code written with assistance from [Claude](https://claude.ai) (Anthropic).

---

## License

MIT — free to use, adapt, and redistribute with attribution. See [LICENSE](LICENSE).
