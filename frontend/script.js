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
