let map, geocoder;
let startMarker, endMarker;

// Separate polyline for each transportation mode
let walkingPolyline = null;
let drivingPolyline = null;
let transitPolyline = null;
let bicyclingPolyline = null;
let ebikePolyline = null;
let escooterPolyline = null;

// Color scheme for each mode
const routeColors = {
  walking: '#4285F4',    // Blue
  driving: '#EA4335',    // Red
  transit: '#9C27B0',    // Purple
  bicycling: '#34A853',  // Green
  'e-bike': '#FF6F00',   // Orange
  'e-scooter': '#FBBC04' // Yellow
};

// State tracking for selected mode
// null = all modes visible, "driving" = only driving visible
let selectedMode = null;

// Store all route data from backend for reference
let allRoutesData = [];

// Carpooling state for driving mode
let isCarpooling = false;
let passengerCount = 1; // Default to 1 person (driver only)

// Load Google Maps with callback to initMap
async function loadMap() {
  try {
    const res = await fetch("http://localhost:8080/api/key");
    const data = await res.json();
    const GOOGLE_API_KEY = data.key;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&callback=initMap&libraries=geometry`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  } catch (err) {
    console.error("Failed to load Google Maps:", err);
  }
}

// Called whenever start/end markers move or change
async function handleRouteChange() {
  if (!startMarker || !endMarker) return;

  const origin = startMarker.getPosition();
  const destination = endMarker.getPosition();

  try {
    const response = await fetch(
      `http://localhost:8080/api/routes?origin=${origin.lat()},${origin.lng()}&destination=${destination.lat()},${destination.lng()}`
    );
    const routes = await response.json();
    console.log("Routes received:", routes); // Debug: see what we got

    if (routes.length === 0) {
      console.warn("No routes returned from backend");
      return;
    }

    // STORE route data for later use in UI
    allRoutesData = routes;

    // Sort routes by stroke weight (thickest first) so they layer properly
    const modeOrder = ['e-scooter', 'transit', 'walking', 'driving', 'bicycling', 'e-bike'];
    const sortedRoutes = routes.sort((a, b) => {
      return modeOrder.indexOf(b.mode) - modeOrder.indexOf(a.mode);
    });

    // Display all 6 routes in different colors
    sortedRoutes.forEach(route => {
      console.log(`Displaying ${route.mode}:`, route.polyline ? 'has polyline' : 'NO POLYLINE');
      if (route.polyline) {
        displayRouteByMode(route.mode, route.polyline);
      }
    });

    // Populate transport options panel with mode buttons
    populateTransportOptions(routes);
  } catch (err) {
    console.error("Failed to fetch routes:", err);
  }
}

// Draw each mode's polyline on the map with its specific color
function displayRouteByMode(mode, encodedPolyline) {
  if (!encodedPolyline) {
    console.warn(`No polyline available for ${mode}`);
    return;
  }

  const path = google.maps.geometry.encoding.decodePath(encodedPolyline);
  const color = routeColors[mode] || '#000000';

  // Use different stroke weights so overlapping routes are visible
  const strokeWeights = {
    'walking': 6,
    'driving': 5,
    'transit': 7,
    'bicycling': 4,
    'e-bike': 3,
    'e-scooter': 8
  };

  // Create polyline with mode-specific styling
  // Use lower opacity for driving-based modes so they show through each other
  const opacity = ['driving', 'e-bike', 'e-scooter'].includes(mode) ? 0.5 : 0.8;

  const polyline = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: color,
    strokeOpacity: opacity,
    strokeWeight: strokeWeights[mode] || 4,
  });

  polyline.setMap(map);

  // Store polyline in the appropriate variable
  switch(mode) {
    case 'walking':
      if (walkingPolyline) walkingPolyline.setMap(null);
      walkingPolyline = polyline;
      break;
    case 'driving':
      if (drivingPolyline) drivingPolyline.setMap(null);
      drivingPolyline = polyline;
      break;
    case 'transit':
      if (transitPolyline) transitPolyline.setMap(null);
      transitPolyline = polyline;
      break;
    case 'bicycling':
      if (bicyclingPolyline) bicyclingPolyline.setMap(null);
      bicyclingPolyline = polyline;
      break;
    case 'e-bike':
      if (ebikePolyline) ebikePolyline.setMap(null);
      ebikePolyline = polyline;
      break;
    case 'e-scooter':
      if (escooterPolyline) escooterPolyline.setMap(null);
      escooterPolyline = polyline;
      break;
  }
}

/**
 * Populate the transport options panel with mode buttons
 * Shows all 6 modes with basic info (time, distance, emissions)
 * @param {Array} routes - Array of route objects from backend
 */
function populateTransportOptions(routes) {
  const transportInfo = document.getElementById('transport-info');

  // Clear existing content
  transportInfo.innerHTML = '';

  // If a mode is selected, show back button + detailed view
  if (selectedMode) {
    showDetailedModeView(selectedMode, routes);
    return;
  }

  // Otherwise, show all modes as clickable buttons
  routes.forEach(route => {
    const modeButton = createModeButton(route);
    transportInfo.appendChild(modeButton);
  });
}

/**
 * Create a clickable button for a transportation mode
 * @param {Object} route - Route object with mode, duration_min, distance_km, carbon_kg
 * @returns {HTMLElement} Button element
 */
function createModeButton(route) {
  const button = document.createElement('div');
  button.className = 'mode-button';
  button.style.cssText = `
    padding: 12px;
    margin: 8px 0;
    border: 2px solid ${routeColors[route.mode]};
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  `;

  // Icon mapping
  const icons = {
    walking: '🚶',
    driving: '🚗',
    transit: '🚌',
    bicycling: '🚴',
    'e-bike': '⚡',
    'e-scooter': '🛴'
  };

  // Build button content
  button.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">
      ${icons[route.mode] || '🚶'} ${route.mode.charAt(0).toUpperCase() + route.mode.slice(1)}
    </div>
    <div style="font-size: 12px; color: #666;">
      ${Math.round(route.duration_min)} min · ${route.distance_km.toFixed(1)} km
    </div>
    <div style="font-size: 12px; color: ${route.carbon_kg > 1 ? '#EA4335' : '#34A853'};">
      ${route.carbon_kg.toFixed(2)} kg CO₂
    </div>
  `;

  // Add hover effect
  button.addEventListener('mouseenter', () => {
    button.style.background = `${routeColors[route.mode]}22`; // 22 = light transparency
  });
  button.addEventListener('mouseleave', () => {
    button.style.background = 'white';
  });

  // Click handler - select this mode
  button.addEventListener('click', () => {
    selectMode(route.mode);
  });

  return button;
}

/**
 * Select a specific transportation mode - hides others, shows detailed view
 * @param {string} mode - Mode name (e.g., "driving", "walking")
 */
function selectMode(mode) {
  // Update state
  selectedMode = mode;

  // Reset carpooling state if not selecting driving
  if (mode !== 'driving') {
    isCarpooling = false;
    passengerCount = 1;
  }

  // Hide all polylines except selected one
  hideAllPolylinesExcept(mode);

  // Refresh UI to show back button + detailed view
  populateTransportOptions(allRoutesData);
}

/**
 * Hide all route polylines except the specified mode
 * @param {string} keepMode - Mode to keep visible (e.g., "driving")
 */
function hideAllPolylinesExcept(keepMode) {
  const polylines = {
    walking: walkingPolyline,
    driving: drivingPolyline,
    transit: transitPolyline,
    bicycling: bicyclingPolyline,
    'e-bike': ebikePolyline,
    'e-scooter': escooterPolyline
  };

  // Loop through all polylines
  Object.keys(polylines).forEach(mode => {
    if (mode !== keepMode && polylines[mode]) {
      polylines[mode].setMap(null); // Hide this polyline
    }
  });

  // Ensure the selected mode is visible
  if (polylines[keepMode]) {
    polylines[keepMode].setMap(map);
  }
}

/**
 * Show all route polylines on the map
 */
function showAllRoutes() {
  const polylines = [
    walkingPolyline, drivingPolyline, transitPolyline,
    bicyclingPolyline, ebikePolyline, escooterPolyline
  ];

  // Make all polylines visible
  polylines.forEach(polyline => {
    if (polyline) {
      polyline.setMap(map);
    }
  });
}

/**
 * Show detailed view for a selected mode with back button
 * @param {string} mode - Selected mode name
 * @param {Array} routes - All route data
 */
function showDetailedModeView(mode, routes) {
  const transportInfo = document.getElementById('transport-info');
  transportInfo.innerHTML = ''; // Clear content

  // Find the selected route data
  const route = routes.find(r => r.mode === mode);
  if (!route) return;

  // Icon mapping
  const icons = {
    walking: '🚶', driving: '🚗', transit: '🚌',
    bicycling: '🚴', 'e-bike': '⚡', 'e-scooter': '🛴'
  };

  // CREATE BACK BUTTON
  const backButton = document.createElement('button');
  backButton.textContent = '← Back to All Routes';
  backButton.style.cssText = `
    width: 100%;
    padding: 10px;
    margin-bottom: 16px;
    background: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  `;
  backButton.addEventListener('click', () => {
    selectedMode = null; // Reset state
    showAllRoutes(); // Show all polylines again
    populateTransportOptions(allRoutesData); // Refresh UI
  });
  transportInfo.appendChild(backButton);

  // CREATE DETAILED INFO CARD
  const detailCard = document.createElement('div');
  detailCard.style.cssText = `
    padding: 16px;
    border: 3px solid ${routeColors[mode]};
    border-radius: 12px;
    background: white;
  `;

  // Build detailed content
  let detailHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 12px; color: ${routeColors[mode]};">
      ${icons[mode] || '🚶'} ${mode.charAt(0).toUpperCase() + mode.slice(1)}
    </div>
  `;

  // Base duration
  detailHTML += `
    <div style="margin: 8px 0;">
      <strong>Base time:</strong> ${Math.round(route.duration_min)} min
    </div>
  `;

  // Traffic info (if applicable)
  if (route.has_traffic_data && route.duration_with_traffic_min) {
    const delay = route.duration_with_traffic_min - route.duration_min;
    const delayText = delay > 0 ? `+${Math.round(delay)} min 🔴` : 'No delay ✅';

    detailHTML += `
      <div style="margin: 8px 0;">
        <strong>With traffic:</strong> ${Math.round(route.duration_with_traffic_min)} min
      </div>
      <div style="margin: 8px 0; color: ${delay > 0 ? '#EA4335' : '#34A853'};">
        <strong>Traffic delay:</strong> ${delayText}
      </div>
    `;
  }

  // Distance
  detailHTML += `
    <div style="margin: 8px 0;">
      <strong>Distance:</strong> ${route.distance_km.toFixed(2)} km
    </div>
  `;

  // Emissions (color-coded)
  const emissionColor = route.carbon_kg > 1 ? '#EA4335' : route.carbon_kg > 0.1 ? '#FBBC04' : '#34A853';

  // For driving mode, show carpooling impact
  if (mode === 'driving') {
    const perPersonEmissions = route.carbon_kg / passengerCount;
    detailHTML += `
      <div style="margin: 8px 0; color: ${emissionColor};">
        <strong>Total Emissions:</strong> ${route.carbon_kg.toFixed(2)} kg CO₂
      </div>
      <div style="margin: 8px 0; color: ${perPersonEmissions < route.carbon_kg / 2 ? '#34A853' : emissionColor};">
        <strong>Per Person:</strong> ${perPersonEmissions.toFixed(2)} kg CO₂
        ${passengerCount > 1 ? '<span style="color: #34A853;">✅ Carpooling saves emissions!</span>' : ''}
      </div>
    `;
  } else {
    detailHTML += `
      <div style="margin: 8px 0; color: ${emissionColor};">
        <strong>Emissions:</strong> ${route.carbon_kg.toFixed(2)} kg CO₂
      </div>
    `;
  }

  detailCard.innerHTML = detailHTML;
  transportInfo.appendChild(detailCard);

  // Add carpooling question for driving mode
  if (mode === 'driving') {
    const carpoolSection = createCarpoolSection(route);
    transportInfo.appendChild(carpoolSection);
  }
}

/**
 * Create carpooling section UI for driving mode
 * @param {Object} route - Route data for driving
 * @returns {HTMLElement} Carpool section element
 */
function createCarpoolSection(route) {
  const carpoolDiv = document.createElement('div');
  carpoolDiv.style.cssText = `
    margin-top: 16px;
    padding: 12px;
    border: 2px solid #4285F4;
    border-radius: 8px;
    background: #f8f9fa;
  `;

  carpoolDiv.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">🚗 Carpooling?</div>
    <div id="carpool-question">
      <button id="carpool-yes" style="padding: 8px 16px; margin-right: 8px; cursor: pointer; border: 2px solid #34A853; background: white; border-radius: 6px;">Yes</button>
      <button id="carpool-no" style="padding: 8px 16px; cursor: pointer; border: 2px solid #EA4335; background: white; border-radius: 6px;">No</button>
    </div>
    <div id="passenger-input" style="display: none; margin-top: 12px;">
      <label style="display: block; margin-bottom: 4px;">How many people total in the car?</label>
      <input type="number" id="passenger-count" min="2" max="8" value="2" style="width: 60px; padding: 6px; border: 2px solid #4285F4; border-radius: 4px;">
      <button id="update-passengers" style="margin-left: 8px; padding: 6px 12px; background: #4285F4; color: white; border: none; border-radius: 4px; cursor: pointer;">Update</button>
    </div>
  `;

  // Add event listeners after adding to DOM
  setTimeout(() => {
    const yesBtn = document.getElementById('carpool-yes');
    const noBtn = document.getElementById('carpool-no');
    const passengerInput = document.getElementById('passenger-input');
    const updateBtn = document.getElementById('update-passengers');
    const countInput = document.getElementById('passenger-count');

    yesBtn.addEventListener('click', () => {
      isCarpooling = true;
      passengerInput.style.display = 'block';
      yesBtn.style.background = '#34A853';
      yesBtn.style.color = 'white';
      noBtn.style.background = 'white';
      noBtn.style.color = 'black';
    });

    noBtn.addEventListener('click', () => {
      isCarpooling = false;
      passengerCount = 1;
      passengerInput.style.display = 'none';
      noBtn.style.background = '#EA4335';
      noBtn.style.color = 'white';
      yesBtn.style.background = 'white';
      yesBtn.style.color = 'black';
      // Refresh view to update emissions
      showDetailedModeView('driving', allRoutesData);
    });

    updateBtn.addEventListener('click', () => {
      const newCount = parseInt(countInput.value);
      if (newCount >= 2 && newCount <= 8) {
        passengerCount = newCount;
        // Refresh view to update emissions display
        showDetailedModeView('driving', allRoutesData);
      }
    });
  }, 0);

  return carpoolDiv;
}

function initMap() {
  const boston = { lat: 42.3601, lng: -71.0589 };
  const cambridge = { lat: 42.3736, lng: -71.1097 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 13,
    center: boston,
  });

  geocoder = new google.maps.Geocoder();

  // Draggable markers
  startMarker = new google.maps.Marker({ position: boston, map, draggable: true });
  endMarker = new google.maps.Marker({ position: cambridge, map, draggable: true });

  // Event listeners
  startMarker.addListener("dragend", () => {
    updateLocation(startMarker, "start-location");
    handleRouteChange();
  });
  endMarker.addListener("dragend", () => {
    updateLocation(endMarker, "end-location");
    handleRouteChange();
  });

  // Input boxes
  const startInput = document.getElementById("start-input");
  const endInput = document.getElementById("end-input");

  startInput.addEventListener("change", () => geocodeAddress(startInput.value, startMarker, "start-location"));
  endInput.addEventListener("change", () => geocodeAddress(endInput.value, endMarker, "end-location"));

  // Initial locations + route
  updateLocation(startMarker, "start-location");
  updateLocation(endMarker, "end-location");
  handleRouteChange();
}

function updateLocation(marker, elementId) {
  geocoder.geocode({ location: marker.getPosition() }, (results, status) => {
    const display = status === "OK" && results[0] ? results[0].formatted_address : marker.getPosition().toUrlValue(6);
    document.getElementById(elementId).textContent = display;
  });
}

function geocodeAddress(address, marker, elementId) {
  geocoder.geocode({ address }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;
      marker.setPosition(location);
      map.panTo(location);
      updateLocation(marker, elementId);
      handleRouteChange();
    } else {
      alert("Address not found: " + status);
    }
  });
}

const overlay = document.getElementById('overlay-panel');
const toggleButton = document.getElementById('toggle-overlay');

toggleButton.addEventListener('click', () => {
  const isHidden = overlay.classList.toggle('hidden');
  toggleButton.textContent = isHidden ? 'Show Directions' : 'Hide Directions';
});

const transport = document.getElementById('transport-panel');
const toggleTransport = document.getElementById('toggle-transport');

toggleTransport.addEventListener('click', () => {
  const isHidden = transport.classList.toggle('hidden');
  toggleTransport.textContent = isHidden ? 'Show Options' : 'Hide Options';
});

// Kick it off
loadMap();
window.initMap = initMap;
