import { Deck } from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import { FlowmapLayer } from '@flowmap.gl/layers';

// ------------------------------
// 🔥 CONFIGURACIÓN POR URL
// ------------------------------
function getConfigFromURL() {
  const params = new URLSearchParams(window.location.search);
  
  return {
    // Archivos de datos (pueden estar en subcarpetas)
    locationsFile: params.get('locations') || 'locations.csv',
    flowsFile: params.get('flows') || 'flows.csv',
    
    // Centro y zoom del mapa
    centerLon: parseFloat(params.get('lon')) || -70.65,
    centerLat: parseFloat(params.get('lat')) || -33.45,
    zoom: parseFloat(params.get('zoom')) || 6,
    
    // Estilo
    baseMap: params.get('basemap') || 'dark_all',
    colorScheme: params.get('colors') || 'Magma',  // ← COLORr
    title: params.get('title') || 'Flowmap Visualización',
    
    // Configuraciones específicas
    minFlow: parseInt(params.get('min')) || 1,
    maxDistance: params.get('maxdist') ? parseInt(params.get('maxdist')) : null,
    
    // Control de visibilidad
    showControls: params.get('controls') !== 'false', // true por defecto
    showPoints: params.get('points') !== 'false', // true por defecto
  };
}

// ------------------------------
// Cargar CSV (ahora con parámetros)
// ------------------------------
async function loadCSV(filename) {
  console.log(`📂 Cargando archivo: ${filename}`);
  const text = await fetch(filename).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar ${filename}`);
    return r.text();
  });
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
// Variables globales
// ------------------------------
let deck = null;
let locations = [];
let filteredFlows = [];
let urlConfig = getConfigFromURL();
let animationStartTime = Date.now();
let animationId = null; // Para controlar la animación

// 🔥 CONFIGURACIÓN ACTUALIZABLE
let currentConfig = {
  // VISIBILIDAD
  opacity: 1.0,
  
  // ANIMACIÓN
  animationEnabled: true,
  animationSpeed: 0.5,
  
  // PARTÍCULAS
  maxParticles: 5000,
  particleSpeed: 5.0,
  
  // LÍNEAS
  flowThickness: 5.0,
  
  // PUNTOS
  drawPoints: true,
  locationRadius: 15,
  
  // COLORES
  colorScheme: urlConfig.colorScheme,
  darkMode: urlConfig.baseMap.includes('dark'),
};

// ------------------------------
// 🔥 FUNCIÓN ACTUALIZADA - CON PARÁMETROS DINÁMICOS
// ------------------------------
function createFlowmapLayer(config = currentConfig) {
  console.log("🎯 Creando FlowmapLayer con config:", config);
  
  return new FlowmapLayer({
    id: 'flowmap-layer',
    
    // DATOS
    data: {
      locations: locations.map(loc => ({
        id: loc.id,
        lat: loc.lat,
        lon: loc.lon,
        name: loc.name || loc.id
      })),
      flows: filteredFlows.map(flow => ({
        origin: flow.origin,
        dest: flow.dest,
        count: Math.max(flow.count, urlConfig.minFlow),
      }))
    },
    
    // ANIMACIÓN - Configurar para que sea automática
    animate: config.animationEnabled,
    animationSpeed: config.animationSpeed,
    
    // PARTÍCULAS
    maxParticles: config.maxParticles,
    
    // VISIBILIDAD
    opacity: config.opacity,
    pickable: true,  // ← Reactivar pickable
    
    // LÍNEAS
    getFlowThickness: () => config.flowThickness,
    
    // 🔥 VELOCIDAD DE FLUJO - Basada en magnitud
    getAnimatedFlowSpeed: (flow) => {
      // Normalizar la velocidad según el count
      const minSpeed = 0.1;  // Velocidad mínima
      const maxSpeed = 2.0;   // Velocidad máxima
      
      // Encontrar el flujo máximo para normalizar
      const maxCount = Math.max(...filteredFlows.map(f => f.count));
      const normalizedSpeed = (flow.count / maxCount);
      
      // Interpolar entre min y max speed
      return minSpeed + (normalizedSpeed * (maxSpeed - minSpeed));
    },
    
    // PUNTOS
    drawPoints: config.drawPoints,
    getLocationRadius: () => config.locationRadius,
    
    // COLORES
    colorScheme: config.colorScheme,
    darkMode: config.darkMode,
    
    // Accessors
    getLocationId: (loc) => loc.id,
    getLocationLat: (loc) => loc.lat,
    getLocationLon: (loc) => loc.lon,
    getLocationName: (loc) => loc.name,
    getFlowOriginId: (flow) => flow.origin,
    getFlowDestId: (flow) => flow.dest,
    getFlowMagnitude: (flow) => Math.max(flow.count, urlConfig.minFlow),
    
    // DEBUG
    debug: false,
    
    // 🔥 HOVER HANDLER SEGURO
    onHover: (info) => {
      // Verificación robusta
      if (!info || !info.object) {
        // Ocultar tooltip si existe
        const tooltip = document.getElementById('flowmap-tooltip');
        if (tooltip) tooltip.style.display = 'none';
        return;
      }
      
      // Mostrar tooltip
      showTooltip(info);
    },
    
    // 🔥 CLICK HANDLER
    onClick: (info) => {
      if (info && info.object) {
        console.log("🖱️ Click:", info.object);
        // Aquí puedes agregar lógica adicional para clicks
      }
    },
    
    // PARÁMETROS DE RENDER
    parameters: {
      depthTest: false,
      blend: true,
      blendEquation: 32774,  // GL.FUNC_ADD
      blendFunc: [770, 771, 1, 771]  // GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA, GL.ONE, GL.ONE_MINUS_SRC_ALPHA
    }
  });
}

// ------------------------------
// 🔥 FUNCIÓN PARA MOSTRAR TOOLTIP
// ------------------------------
function showTooltip(info) {
  let tooltip = document.getElementById('flowmap-tooltip');
  
  // Crear tooltip si no existe
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'flowmap-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      pointer-events: none;
      padding: 12px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      max-width: 300px;
    `;
    document.body.appendChild(tooltip);
  }
  
  // Actualizar contenido según el tipo de objeto
  let content = '';
  
  if (info.object.type === 'location') {
    // Hover sobre un punto/ubicación
    content = `
      <div style="font-weight: bold; margin-bottom: 5px;">📍 ${info.object.name || info.object.id}</div>
      <div style="font-size: 11px; opacity: 0.8;">ID: ${info.object.id}</div>
    `;
  } else if (info.object.type === 'flow') {
    // Hover sobre un flujo
    const origin = info.object.origin;
    const dest = info.object.dest;
    const count = info.object.count;
    
    content = `
      <div style="font-weight: bold; margin-bottom: 8px;">🔄 Flujo Migratorio</div>
      <div style="margin-bottom: 4px;">
        <span style="color: #4CAF50;">Origen:</span> ${origin.name || origin.id}
      </div>
      <div style="margin-bottom: 4px;">
        <span style="color: #2196F3;">Destino:</span> ${dest.name || dest.id}
      </div>
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
        <span style="font-weight: bold; color: #FFC107;">Personas:</span> ${count.toLocaleString()}
      </div>
    `;
  }
  
  tooltip.innerHTML = content;
  tooltip.style.display = 'block';
  tooltip.style.left = `${info.x + 10}px`;
  tooltip.style.top = `${info.y + 10}px`;
}

// ------------------------------
// 🔥 SIMPLIFICAR LA ANIMACIÓN - NO USAR clone()
// ------------------------------
function startAnimation() {
  console.log("▶️ Animación configurada (automática por FlowmapLayer)");
  // La animación es manejada automáticamente por FlowmapLayer
  // No necesitas un loop manual con requestAnimationFrame
  // Solo necesitas recrear la capa cuando cambien las configuraciones
}

// 🔥 FUNCIÓN PARA ACTUALIZAR SOLO LA CAPA FLOWMAP (cuando cambien configuraciones)
function updateFlowmapLayer() {
  if (!deck) return;
  
  const layers = deck.props.layers;
  if (!layers || layers.length < 2) return;
  
  console.log("🎯 Creando FlowmapLayer con config:", currentConfig);
  
  // Crear nueva capa con la configuración actual
  const newFlowmapLayer = createFlowmapLayer();
  
  // Reemplazar la capa de flowmap (índice 1)
  const newLayers = [
    layers[0], // Capa base
    newFlowmapLayer  // Nueva capa flowmap
  ];
  
  deck.setProps({ layers: newLayers });
}

// ------------------------------
// Función para crear capa base según URL
// ------------------------------
function createBaseLayer() {
  const baseMapUrl = `https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}@2x.png`;
  //const baseMapUrl = `https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}@2x.png`;
  console.log(`🗺️ Usando mapa base: ${urlConfig.baseMap}`);
  
  return new TileLayer({
    id: "base-map",
    data: baseMapUrl,
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props) => {
      const { bbox: { west, south, east, north } } = props.tile;
      return new BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
        opacity: 1,
      });
    },
  });
}

// ------------------------------
// 🔥 CONTROLES QUE SÍ FUNCIONAN
// ------------------------------
function createControls() {
  if (!urlConfig.showControls) {
    console.log("ℹ️ Controles deshabilitados por URL");
    return;
  }
  
  const controls = document.createElement('div');
  controls.id = 'flowmap-controls';
  controls.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(255, 255, 255, 0.95);
    padding: 15px;
    border-radius: 8px;
    z-index: 1000;
    font-family: Arial, sans-serif;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    min-width: 280px;
    max-height: 80vh;
    overflow-y: auto;
  `;
  
  controls.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 15px; color: #333; font-size: 16px;">
      🎛️ ${urlConfig.title}
    </h3>
    
    <div style="margin-bottom: 15px; padding: 10px; background: #e3f2fd; border-radius: 5px;">
      <h4 style="margin-top: 0; margin-bottom: 5px; color: #1565c0;">Controles Activos</h4>
      <div style="font-size: 12px;">
        <div><b>Estado:</b> <span id="statusText" style="color: #4CAF50;">Listo</span></div>
      </div>
    </div>
    
    <!-- OPCIÓN DE OPACIDAD -->
    <div style="margin-bottom: 15px;">
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
          Opacidad: <span id="opacityValue">${currentConfig.opacity}</span>
        </label>
        <input type="range" id="opacitySlider" min="0.1" max="1" step="0.1" 
               value="${currentConfig.opacity}" style="width: 100%;">
      </div>
    </div>
    
    <!-- VELOCIDAD DE ANIMACIÓN -->
    <div style="margin-bottom: 15px;">
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
          Velocidad: <span id="speedValue">${currentConfig.animationSpeed}</span>
        </label>
        <input type="range" id="speedSlider" min="0.1" max="2" step="0.1" 
               value="${currentConfig.animationSpeed}" style="width: 100%;">
      </div>
    </div>
    
    <!-- PARTÍCULAS -->
    <div style="margin-bottom: 15px;">
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
          Partículas: <span id="particlesValue">${currentConfig.maxParticles}</span>
        </label>
        <input type="range" id="particlesSlider" min="100" max="10000" step="100" 
               value="${currentConfig.maxParticles}" style="width: 100%;">
      </div>
    </div>
    
    <!-- GROSOR DE LÍNEAS -->
    <div style="margin-bottom: 15px;">
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
          Grosor Líneas: <span id="thicknessValue">${currentConfig.flowThickness}</span>
        </label>
        <input type="range" id="thicknessSlider" min="1" max="20" step="0.5" 
               value="${currentConfig.flowThickness}" style="width: 100%;">
      </div>
    </div>
    
    <!-- TOGGLES -->
    <div style="margin-bottom: 15px;">
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
          <input type="checkbox" id="animationToggle" ${currentConfig.animationEnabled ? 'checked' : ''}>
          Animación
        </label>
      </div>
      
      <div style="margin-bottom: 10px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">
          <input type="checkbox" id="pointsToggle" ${currentConfig.drawPoints ? 'checked' : ''}>
          Mostrar Puntos
        </label>
      </div>
    </div>
    
    <!-- BOTONES -->
    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button id="applyBtn" style="flex: 1; padding: 10px; background: #4CAF50; color: white; 
             border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
        🔄 Aplicar Cambios
      </button>
      <button id="resetBtn" style="padding: 10px; background: #FF9800; color: white; 
             border: none; border-radius: 4px; cursor: pointer;">
        🔁 Reiniciar
      </button>
    </div>
    
    <!-- INFO -->
    <div style="margin-top: 15px; font-size: 11px; color: #666; 
         border-top: 1px solid #ddd; padding-top: 10px;">
      <div>📍 Locations: <span>${locations.length}</span></div>
      <div>🔄 Flows: <span>${filteredFlows.length}</span></div>
      <div>🎯 Opacidad actual: <span id="currentOpacity">${currentConfig.opacity}</span></div>
    </div>
  `;
  
  document.getElementById('app').appendChild(controls);
  
  // 🔥 CONFIGURAR EVENT LISTENERS QUE SÍ FUNCIONAN
  
  // Slider de opacidad - Actualización en tiempo real
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityValue = document.getElementById('opacityValue');
  const currentOpacity = document.getElementById('currentOpacity');
  
  opacitySlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    opacityValue.textContent = value.toFixed(1);
    currentOpacity.textContent = value.toFixed(1);
    
    // Actualizar configuración
    currentConfig.opacity = value;
    
    // 🔥 ACTUALIZAR LA CAPA INMEDIATAMENTE
    updateFlowmapLayer();
    
    // Actualizar estado
    updateStatus("Opacidad actualizada");
  });
  
  // Slider de velocidad
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  
  speedSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    speedValue.textContent = value.toFixed(1);
    currentConfig.animationSpeed = value;
    updateStatus("Velocidad actualizada");
  });
  
  // Slider de partículas
  const particlesSlider = document.getElementById('particlesSlider');
  const particlesValue = document.getElementById('particlesValue');
  
  particlesSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    particlesValue.textContent = value;
    currentConfig.maxParticles = value;
    updateStatus("Partículas actualizadas");
  });
  
  // Slider de grosor
  const thicknessSlider = document.getElementById('thicknessSlider');
  const thicknessValue = document.getElementById('thicknessValue');
  
  thicknessSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    thicknessValue.textContent = value.toFixed(1);
    currentConfig.flowThickness = value;
    
    // 🔥 ACTUALIZAR LA CAPA INMEDIATAMENTE
    updateFlowmapLayer();
    
    updateStatus("Grosor actualizado");
  });
  
  // Toggle de animación
  const animationToggle = document.getElementById('animationToggle');
  animationToggle.addEventListener('change', (e) => {
    currentConfig.animationEnabled = e.target.checked;
    updateStatus(`Animación ${e.target.checked ? 'activada' : 'desactivada'}`);
  });
  
  // Toggle de puntos
  const pointsToggle = document.getElementById('pointsToggle');
  pointsToggle.addEventListener('change', (e) => {
    currentConfig.drawPoints = e.target.checked;
    
    // 🔥 ACTUALIZAR LA CAPA INMEDIATAMENTE
    updateFlowmapLayer();
    
    updateStatus(`Puntos ${e.target.checked ? 'mostrados' : 'ocultos'}`);
  });
  
  // Botón Aplicar - Para aplicar TODOS los cambios
  document.getElementById('applyBtn').addEventListener('click', () => {
    console.log("🔄 Aplicando todos los cambios:", currentConfig);
    
    // Reiniciar animación con nueva configuración
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    
    // Actualizar capa
    updateFlowmapLayer();
    
    // Reiniciar animación
    startAnimation();
    
    updateStatus("Todos los cambios aplicados ✓", true);
  });
  
  // Botón Reiniciar
  document.getElementById('resetBtn').addEventListener('click', () => {
    // Restaurar configuración por defecto
    currentConfig = {
      opacity: 1.0,
      animationEnabled: true,
      animationSpeed: 0.5,
      maxParticles: 5000,
      particleSpeed: 5.0,
      flowThickness: 5.0,
      drawPoints: true,
      locationRadius: 15,
      colorScheme: urlConfig.colorScheme,
      darkMode: urlConfig.baseMap.includes('dark'),
    };
    
    // Actualizar controles UI
    opacitySlider.value = currentConfig.opacity;
    opacityValue.textContent = currentConfig.opacity;
    currentOpacity.textContent = currentConfig.opacity;
    
    speedSlider.value = currentConfig.animationSpeed;
    speedValue.textContent = currentConfig.animationSpeed;
    
    particlesSlider.value = currentConfig.maxParticles;
    particlesValue.textContent = currentConfig.maxParticles;
    
    thicknessSlider.value = currentConfig.flowThickness;
    thicknessValue.textContent = currentConfig.flowThickness;
    
    animationToggle.checked = currentConfig.animationEnabled;
    pointsToggle.checked = currentConfig.drawPoints;
    
    // Actualizar capa
    updateFlowmapLayer();
    
    updateStatus("Configuración reiniciada ✓", true);
  });
  
  // Función para actualizar estado
  function updateStatus(message, isSuccess = false) {
    const statusText = document.getElementById('statusText');
    statusText.textContent = message;
    statusText.style.color = isSuccess ? '#4CAF50' : '#2196F3';
    
    // Resetear después de 2 segundos
    setTimeout(() => {
      statusText.textContent = 'Listo';
      statusText.style.color = '#4CAF50';
    }, 2000);
  }
}

// ------------------------------
// Inicializar
// ------------------------------
async function init() {
  console.log("⚡ Iniciando aplicación");
  console.log("Configuración desde URL:", urlConfig);
  
  document.title = urlConfig.title;
  
  try {
    // Cargar datos
    const locCSV = await loadCSV(urlConfig.locationsFile);
    const flowCSV = await loadCSV(urlConfig.flowsFile);
    
    locations = parseLocations(locCSV);
    const flows = parseFlows(flowCSV);
    
    // Filtrar flujos
    const validIds = new Set(locations.map((l) => l.id));
    filteredFlows = flows.filter(
      (f) => validIds.has(f.origin) && validIds.has(f.dest)
    );
    
    // Aplicar filtro de distancia
    if (urlConfig.maxDistance) {
      filteredFlows = filterByDistance(filteredFlows, locations, urlConfig.maxDistance);
    }
    
    console.log("📊 Datos cargados:");
    console.log("- Locations:", locations.length);
    console.log("- Flows:", filteredFlows.length);
    
    // Crear controles
    if (urlConfig.showControls) {
      createControls();
    }
    
    // Crear Deck
    deck = new Deck({
      parent: document.getElementById("app"),
      initialViewState: {
        longitude: urlConfig.centerLon,
        latitude: urlConfig.centerLat,
        zoom: urlConfig.zoom,
        pitch: 15,
        bearing: 0,
      },
      controller: true,
      useDevicePixels: window.devicePixelRatio || 1,
      
      layers: [
        createBaseLayer(),
        createFlowmapLayer()
      ],
    });
    
    // Iniciar animación
    setTimeout(startAnimation, 500);
    
    console.log("✅ Aplicación inicializada");
    
  } catch (error) {
    console.error("❌ Error:", error);
    document.getElementById('app').innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h2 style="color: #e74c3c;">Error cargando datos</h2>
        <p>${error.message}</p>
        <button onclick="location.reload()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Reintentar
        </button>
      </div>
    `;
  }
}

// ------------------------------
// Función auxiliar: filtrar por distancia
// ------------------------------
function filterByDistance(flows, locations, maxDistanceKm) {
  const locationMap = {};
  locations.forEach(loc => {
    locationMap[loc.id] = loc;
  });
  
  function calculateDistance(loc1, loc2) {
    const R = 6371;
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  return flows.filter(flow => {
    const origin = locationMap[flow.origin];
    const dest = locationMap[flow.dest];
    
    if (!origin || !dest) return false;
    
    const distance = calculateDistance(origin, dest);
    return distance <= maxDistanceKm;
  });
}

// Iniciar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}