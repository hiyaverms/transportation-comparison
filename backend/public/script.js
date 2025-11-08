let map, geocoder;
let startMarker, endMarker;

// Separate polyline for each transportation mode
let walkingPolyline = null;
let drivingPolyline = null;
let busPolyline = null;
let tramPolyline = null;
let subwayPolyline = null;
let bicyclingPolyline = null;
let ebikePolyline = null;
let escooterPolyline = null;

// Color scheme for each mode - all unique colors
const routeColors = {
  walking: '#4285F4',    // Blue
  driving: '#EA4335',    // Red
  bus: '#9C27B0',        // Purple
  tram: '#00BCD4',       // Cyan
  subway: '#795548',     // Brown - distinct from driving red
  bicycling: '#34A853',  // Green
  'e-bike': '#FF6F00',   // Orange
  'e-scooter': '#FBBC04' // Yellow
};

// State tracking for selected mode
// null = all modes visible, "driving" = only driving visible
let selectedMode = null;

// Store all route data from backend for reference
let allRoutesData = [];
let greenSuggestion = null;

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
    const data = await response.json();
    const routes = data.routes || data; // Handle both old and new format
    greenSuggestion = data.suggestion || null;
    console.log("Routes received:", routes); // Debug: see what we got
    console.log("Green suggestion:", greenSuggestion);

    if (routes.length === 0) {
      console.warn("No routes returned from backend");
      return;
    }

    // STORE route data for later use in UI
    allRoutesData = routes;

    // Sort routes by stroke weight (thickest first) so they layer properly
    const modeOrder = ['e-scooter', 'bus', 'tram', 'subway', 'walking', 'driving', 'bicycling', 'e-bike'];
    const sortedRoutes = routes.sort((a, b) => {
      return modeOrder.indexOf(b.mode) - modeOrder.indexOf(a.mode);
    });

    // Display all 8 routes in different colors (walking, driving, bus, tram, subway, bicycling, e-bike, e-scooter)
    sortedRoutes.forEach(route => {
      console.log(`Displaying ${route.mode}:`, route.polyline ? 'has polyline' : 'NO POLYLINE');
      if (route.polyline) {
        displayRouteByMode(route.mode, route.polyline);
      }
    });

    // Auto-zoom and center map to fit all routes
    if (routes.length > 0 && routes[0].bounds) {
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(routes[0].bounds.southwest.lat, routes[0].bounds.southwest.lng),
        new google.maps.LatLng(routes[0].bounds.northeast.lat, routes[0].bounds.northeast.lng)
      );
      // Add padding to zoom out further and avoid UI panels obscuring the route
      map.fitBounds(bounds, { top: 100, right: 350, bottom: 100, left: 100 });
    }

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
    'bus': 7,
    'tram': 8,
    'subway': 9,
    'bicycling': 4,
    'e-bike': 3,
    'e-scooter': 10
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
    case 'bus':
      if (busPolyline) busPolyline.setMap(null);
      busPolyline = polyline;
      break;
    case 'tram':
      if (tramPolyline) tramPolyline.setMap(null);
      tramPolyline = polyline;
      break;
    case 'subway':
      if (subwayPolyline) subwayPolyline.setMap(null);
      subwayPolyline = polyline;
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
 * Shows all 8 modes with basic info (time, distance, emissions)
 * Sorted by emissions first, then by time if emissions are equal
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

  // Sort by emissions (ascending), then by time if emissions are equal
  const sortedRoutes = [...routes].sort((a, b) => {
    // Primary sort: emissions (lowest first)
    if (a.carbon_kg !== b.carbon_kg) {
      return a.carbon_kg - b.carbon_kg;
    }
    // Secondary sort: time (fastest first) if emissions are equal
    return a.duration_min - b.duration_min;
  });

  // Show all modes as clickable buttons
  sortedRoutes.forEach(route => {
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
    border: 3px solid ${routeColors[route.mode]};
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  `;

  // Icon mapping
  const icons = {
    walking: '🚶',
    driving: '🚗',
    bus: '🚌',
    tram: '🚋',
    subway: '🚇',
    bicycling: '🚴',
    'e-bike': '⚡',
    'e-scooter': '🛴'
  };

  // Build button content with mode color matching the map line
  button.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px; color: ${routeColors[route.mode]};">
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
  // Check if there's a greener alternative for this mode
  const selectedRoute = allRoutesData.find(r => r.mode === mode);

  // Sort routes by emissions (HIGHEST FIRST) to find top 3 polluters
  const sortedByEmissions = [...allRoutesData].sort((a, b) => b.carbon_kg - a.carbon_kg);
  const top3HighestEmitters = sortedByEmissions.slice(0, 3).map(r => r.mode);

  // ONLY show popup if selected mode is one of the TOP 3 HIGHEST carbon emitters
  // AND has actual emissions (not zero-emission like walking/biking)
  if (top3HighestEmitters.includes(mode) && selectedRoute.carbon_kg > 0.05) {
    // Find greener alternatives within 30% travel time
    const alternatives = allRoutesData
      .filter(r => r.mode !== mode)
      .map(r => ({
        ...r,
        timeDiff: Math.abs(r.duration_min - selectedRoute.duration_min),
        timeDiffPercent: Math.abs((r.duration_min - selectedRoute.duration_min) / selectedRoute.duration_min)
      }))
      .filter(r => r.timeDiffPercent <= 0.30 && r.carbon_kg < selectedRoute.carbon_kg)
      .sort((a, b) => a.carbon_kg - b.carbon_kg);

    if (alternatives.length > 0) {
      const bestAlt = alternatives[0];
      const saved = (selectedRoute.carbon_kg - bestAlt.carbon_kg).toFixed(2);
      const customSuggestion = `You could save ${saved} kg of CO₂ by taking ${bestAlt.mode} — it'll get you there in about the same time!`;
      showGreenSuggestionPopup(mode, customSuggestion);
      return; // Wait for user decision in popup
    }
  }

  // Otherwise, proceed with selection (NO POPUP)
  proceedWithModeSelection(mode);
}

/**
 * Actually perform the mode selection (called after popup or directly)
 */
function proceedWithModeSelection(mode) {
  // Update state
  selectedMode = mode;

  // Reset carpooling state if not selecting driving
  if (mode !== 'driving') {
    isCarpooling = false;
    passengerCount = 1;
  }

  // Hide all polylines except selected one
  hideAllPolylinesExcept(mode);

  // Auto-zoom to fit the selected route
  const selectedRoute = allRoutesData.find(r => r.mode === mode);
  if (selectedRoute && selectedRoute.bounds) {
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(selectedRoute.bounds.southwest.lat, selectedRoute.bounds.southwest.lng),
      new google.maps.LatLng(selectedRoute.bounds.northeast.lat, selectedRoute.bounds.northeast.lng)
    );
    map.fitBounds(bounds, { top: 100, right: 350, bottom: 100, left: 100 });
  }

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
    bus: busPolyline,
    tram: tramPolyline,
    subway: subwayPolyline,
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
    walkingPolyline, drivingPolyline, busPolyline, tramPolyline, subwayPolyline,
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
    walking: '🚶', driving: '🚗', bus: '🚌', tram: '🚋', subway: '🚇',
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

    // Re-fit map to show all routes
    if (allRoutesData.length > 0 && allRoutesData[0].bounds) {
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(allRoutesData[0].bounds.southwest.lat, allRoutesData[0].bounds.southwest.lng),
        new google.maps.LatLng(allRoutesData[0].bounds.northeast.lat, allRoutesData[0].bounds.northeast.lng)
      );
      map.fitBounds(bounds, { top: 100, right: 350, bottom: 100, left: 100 });
    }

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

const transport = document.getElementById('transport-panel');
const toggleTransport = document.getElementById('toggle-transport');

toggleTransport.addEventListener('click', () => {
  const isHidden = transport.classList.toggle('hidden');
  toggleTransport.textContent = isHidden ? 'Show Options' : 'Hide Options';
});

/**
 * Show popup suggesting a greener transportation alternative
 * @param {string} selectedMode - The mode the user clicked on
 * @param {string} suggestion - The suggestion message to display
 */
function showGreenSuggestionPopup(selectedMode, suggestion) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'green-suggestion-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  // Create popup
  const popup = document.createElement('div');
  popup.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 16px;
    max-width: 450px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    text-align: center;
  `;

  popup.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 12px;">🌱</div>
    <h2 style="margin: 0 0 12px 0; color: #34A853;">Consider a Greener Option!</h2>
    <p style="font-size: 16px; line-height: 1.5; color: #333; margin: 0 0 20px 0;">
      ${suggestion}
    </p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="proceed-anyway" style="
        padding: 12px 24px;
        background: #EA4335;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
      ">Continue with ${selectedMode}</button>
      <button id="back-to-options" style="
        padding: 12px 24px;
        background: #34A853;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
      ">Choose Different Option</button>
    </div>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Event listeners
  document.getElementById('proceed-anyway').addEventListener('click', () => {
    document.body.removeChild(overlay);
    proceedWithModeSelection(selectedMode);
  });

  document.getElementById('back-to-options').addEventListener('click', () => {
    document.body.removeChild(overlay);
    // Stay on the options view (do nothing)
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// Kick it off
loadMap();
window.initMap = initMap;

// ========== GEMINI CHAT FUNCTIONS (EASY TO REMOVE) ==========
// To remove: Delete everything from here to END GEMINI CHAT FUNCTIONS

function toggleChat() {
  const chatPanel = document.getElementById('chat-panel');
  const toggleButton = document.getElementById('toggle-chat');
  const isHidden = chatPanel.classList.toggle('hidden');
  toggleButton.textContent = isHidden ? 'Travel Assistant' : 'Hide Assistant';
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const sendButton = document.getElementById('chat-send');
  const messagesContainer = document.getElementById('chat-messages');

  const message = input.value.trim();
  if (!message) return;

  // Add user message to chat
  const userMessage = document.createElement('div');
  userMessage.className = 'chat-message user';
  userMessage.textContent = message;
  messagesContainer.appendChild(userMessage);

  // Clear input and disable button
  input.value = '';
  sendButton.disabled = true;
  sendButton.textContent = 'Sending...';

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  try {
    // Send to backend with current route data
    const response = await fetch('http://localhost:8080/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        routeData: allRoutesData // Send current route data for context
      })
    });

    const data = await response.json();

    // Add AI response to chat
    const aiMessage = document.createElement('div');
    aiMessage.className = 'chat-message ai';
    aiMessage.textContent = data.reply || 'Sorry, I couldn\'t process that.';
    messagesContainer.appendChild(aiMessage);

  } catch (error) {
    console.error('Chat error:', error);
    const errorMessage = document.createElement('div');
    errorMessage.className = 'chat-message ai';
    errorMessage.textContent = 'Sorry, I\'m having trouble connecting. Please try again.';
    messagesContainer.appendChild(errorMessage);
  } finally {
    // Re-enable button
    sendButton.disabled = false;
    sendButton.textContent = 'Send';

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// Make functions globally available
window.toggleChat = toggleChat;
window.sendChatMessage = sendChatMessage;

// ========== END GEMINI CHAT FUNCTIONS ==========
