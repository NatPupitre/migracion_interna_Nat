import { Deck } from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";   // correcto para Deck 8.9
import { FlowmapLayer } from "@flowmap.gl/layers";

// ------------------------------
// Cargar CSV desde public/
// ------------------------------
async function loadCSV(path) {
  const text = await fetch(path).then((r) => r.text());
  const lines = text.trim().split("\n");
  return {
    header: lines[0].split(","),
    rows: lines.slice(1).map((r) => r.split(",")),
  };
}

// id,lat,lon,name
function parseLocations(csv) {
  return csv.rows.map((r) => ({
    id: r[0].trim(),
    lat: parseFloat(r[1]),
    lon: parseFloat(r[2]),
    name: r[3]?.trim(),
  }));
}

function parseFlows(csv) {
  return csv.rows.map((r) => ({
    origin: r[0].trim(),
    dest: r[1].trim(),
    count: parseInt(r[2], 10),
  }));
}

// ------------------------------
// Inicializar mapa
// ------------------------------
async function init() {
  const locCSV = await loadCSV("/locations.csv");
  const flowCSV = await loadCSV("/flows.csv");

  const locations = parseLocations(locCSV);
  const flows = parseFlows(flowCSV);

  // Logs de chequeo
  console.log("Ejemplo location:", locations[0]);
  console.log("Ejemplo flow:", flows[0]);

  // ------------------------------
  // 🔥 FILTRAR FLOWS PARA QUE FLOWMAP NO QUEDE VACÍO
  // ------------------------------
  const validIds = new Set(locations.map((l) => l.id));

  const filteredFlows = flows.filter(
    (f) => validIds.has(f.origin) && validIds.has(f.dest)
  );

  console.log("Flujos válidos que se van a dibujar:", filteredFlows.length);

  // ------------------------------
  // Crear mapa
  // ------------------------------
  new Deck({
    parent: document.getElementById("app"),
    initialViewState: {
      longitude: -70.65,
      latitude: -33.45,
      zoom: 6,
    },
    controller: true,

    // opcional pero recomendable para más nitidez del canvas
    useDevicePixels: window.devicePixelRatio || 1,

    layers: [
      // ----------- Mapa base oscuro CARTO ----------
      new TileLayer({
        id: "carto-dark",
        data: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,

        renderSubLayers: (props) => {
          const {
            bbox: { west, south, east, north },
          } = props.tile;

          return new BitmapLayer(props, {
            id: `carto-dark-bitmap-${props.tile.id}`,
            data: null,
            image: props.data,
            bounds: [west, south, east, north],
            opacity: 1,
          });
        },
      }),

      // ----------- Flowmap -----------
      new FlowmapLayer({
        id: "flowmap",

        data: {
          locations: locations,
          flows: filteredFlows, // 🔥 SOLO LOS VÁLIDOS
        },

        getLocationId: (d) => d.id,
        getLocationLat: (d) => d.lat,
        getLocationLon: (d) => d.lon,

        getFlowOriginId: (d) => d.origin,
        getFlowDestId: (d) => d.dest,
        getFlowMagnitude: (d) => d.count,
        getFlowThickness: () => 0.1,
      }),
    ],
  });
}

init();
