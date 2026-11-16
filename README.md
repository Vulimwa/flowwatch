# FlowWatch Africa

FlowWatch Africa is a Kenya-focused river and catchment exploration app for the Upper Tana Basin. It combines rainfall and soil-moisture context, modelled GEOGLOWS streamflow products, terrain indicators, exposure screening and clearly labelled illustrative water-operations scenarios in a shared ArcGIS MapView/SceneView.

The app is designed as a research and planning explorer, not as a flood-warning system or operational control tool.

## Run locally

Use Node.js 22 LTS, then install dependencies and start the application:

```powershell
npm install
npm run dev
```

The development server is available at `http://localhost:3000`. The Express server hosts the API routes and Vite development middleware together.

Useful checks:

```powershell
npm run lint
npm run build
```

`npm run lint` runs the TypeScript no-emit check. The production build is written to `dist`.

## Vercel deployment

The repository includes `vercel.json` and a catch-all API function at `api/[...path].ts`. Vercel builds the Vite client into `dist` and serves the Express API through the function. Calcite and ArcGIS static assets are included with that function and routed through it.

Import the repository into Vercel and use the detected project settings, or keep these settings:

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

The function uses Node.js built-ins, Express, GeoTIFF and the application server modules; no GIS credentials are required for the public services used by the app. Vercel function duration and bundle limits depend on the selected plan. Long-running raster analysis may need a plan with a suitable function duration.

## GEOGLOWS data scope and availability

GEOGLOWS is a global model, but FlowWatch does not download the global river index. The server queries the GEOGLOWS MapServer with both the `rivercountry='Kenya'` filter and Upper Tana area-of-interest bounds, cross-matches those reaches with the local Tana River FeatureServer, and validates forecast/history requests against that locally verified reach list. Forecast and historical products are requested per selected reach. The global MapServer layer is used as a time-enabled map service over the current map extent.

GEOGLOWS and ArcGIS services are remote dependencies and can occasionally time out or return transient server errors. GEOGLOWS REST requests retry one transient failure; successful responses are cached. If a service remains unavailable, the workspace shows its loading/error state rather than treating missing data as a measured value.

## Voice Guide and Guided GIS Demo

The Voice Guide uses the browser's built-in Web Speech API; it does not upload narration to a speech provider. Voice, rate and enabled preferences are saved in browser local storage. Narration is always shown as readable text. Speech starts only after the user enables or activates it in the current browser session.

The Guided GIS Demo visits seven chapters using the existing shared map and workspace state. Its pause/resume, previous, next, restart and stop controls also control narration. The demo pauses when the browser tab is hidden and resumes when it returns. If a data service is slow or unavailable, the demo reports that condition and continues with the chapter's text explanation. Stopping restores the user's prior workspace, map mode, selected reach/sub-basin, visible layers and panel state.

## Main data and scientific limits

- **Rainfall:** CHIRPS estimates for January–September 2026 are compared with the same months in the 2001–2025 reference period; the 2026 record shown is partial.
- **Soil moisture and demand:** ERA5-Land indicators provide modeled gridded context, not direct river-flow measurements.
- **Streamflow:** GEOGLOWS products are model output, not gauge observations. Remote forecast/history services may be unavailable.
- **Terrain:** DEM-derived flow, slope and HAND layers are screening indicators, not a calibrated hydraulic/inundation model. SceneView vertical exaggeration affects display only.
- **River topology:** The local reach network supports only short, unambiguous geometry-based connections in some locations. The 3D explorer stops at missing or ambiguous connections and does not claim a complete downstream route.
- **Exposure:** Population and built-up summaries are corridor screening context, not an inundation boundary or damage estimate.
- **Water operations:** Reservoir inputs and calculations are illustrative. There is no KenGen SCADA feed; selected reach discharge is not a measured reservoir inflow, and the scenarios are not operating instructions.

Check each workspace's displayed source, date range, units and status before interpreting a result.