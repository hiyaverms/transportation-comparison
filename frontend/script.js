let map, geocoder;
let startMarker, endMarker;
let currentPolyline = null; // to remove old route

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
    if (routes.length === 0) {
      console.warn("No routes returned from backend");
      return;
    }

    // Display walking route by default
    const walkingRoute = routes.find(r => r.mode === "walking");
    if (walkingRoute && walkingRoute.polyline) {
      displayRoute(walkingRoute.polyline);
    } else {
      console.warn("No walking route available");
    }
  } catch (err) {
    console.error("Failed to fetch routes:", err);
  }
}

// Draw the polyline on the map
function displayRoute(encodedPolyline) {
  if (!encodedPolyline) {
    console.warn("No polyline available for this route");
    return;
  }

  // Remove old polyline if exists
  if (currentPolyline) currentPolyline.setMap(null);

  const path = google.maps.geometry.encoding.decodePath(encodedPolyline);
  currentPolyline = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 5,
  });

  currentPolyline.setMap(map);
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

// Kick it off
loadMap();
window.initMap = initMap;
