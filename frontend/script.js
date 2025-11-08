async function loadMap() {
  try {
    const res = await fetch("http://localhost:8080/api/key");
    const data = await res.json();
    const GOOGLE_API_KEY = data.key;
    console.log("Fetched Google API Key:", GOOGLE_API_KEY);

    const script = document.createElement("script");
    console.log("attempting to use: ", GOOGLE_API_KEY);
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  } catch (err) {
    console.error("Failed to load Google Maps:", err);
  }
}

// Kick it off
loadMap();

let map, geocoder;
let startMarker, endMarker;

function initMap() {
  const boston = { lat: 42.3601, lng: -71.0589 };
  const cambridge = { lat: 42.3736, lng: -71.1097 };

  map = new google.maps.Map(document.getElementById("map"), {
    zoom: 13,
    center: boston
  });

  geocoder = new google.maps.Geocoder();

  // Create draggable markers
  startMarker = new google.maps.Marker({ position: boston, map, draggable: true });
  endMarker = new google.maps.Marker({ position: cambridge, map, draggable: true });

  // Update route and locations when dragged
  startMarker.addListener("dragend", () => { 
    updateLocation(startMarker, "start-location"); 
    sendLocationsToBackend();
});
  endMarker.addListener("dragend", () => { 
    updateLocation(endMarker, "end-location");
    sendLocationsToBackend(); 
});

  // Initial route and locations
  updateLocation(startMarker, "start-location");
  updateLocation(endMarker, "end-location");

  // Input boxes
  const startInput = document.getElementById("start-input");
  const endInput = document.getElementById("end-input");

  startInput.addEventListener("change", () => { geocodeAddress(startInput.value, startMarker, "start-location"); });
  endInput.addEventListener("change", () => { geocodeAddress(endInput.value, endMarker, "end-location"); });
}

function updateLocation(marker, elementId) {
  geocoder.geocode({ location: marker.getPosition() },
    (results, status) => {
      let display;
      if (status === "OK" && results[0]) {
        display = results[0].formatted_address;
      } else {
        display = marker.getPosition().toUrlValue(6); // fallback to "lat,lng"
      }
      document.getElementById(elementId).textContent = display;
    }
  );
}

function geocodeAddress(address, marker, elementId) {
  geocoder.geocode({ address: address }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;
      marker.setPosition(location);
      map.panTo(location);
      updateLocation(marker, elementId);
      sendLocationsToBackend();
    } else {
      alert("Address not found: " + status);
    }
  });
}

async function sendLocationsToBackend() {
  if (!startMarker || !endMarker) return;

  const start = startMarker.getPosition().toJSON();
  const end = endMarker.getPosition().toJSON();

  try {
    const response = await fetch("http://localhost:8080/api/locations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ start, end })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    console.log("Backend response:", data);
  } catch (err) {
    console.error("Failed to send locations:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("overlay-panel");
  const toggleButton = document.getElementById("toggle-overlay");

  if (overlay && toggleButton) {
    toggleButton.addEventListener("click", () => {
      const isHidden = overlay.classList.toggle("hidden");
      toggleButton.textContent = isHidden ? "Show Directions" : "Hide Directions";
    });
  } else {
    console.warn("Overlay or toggle button not found in DOM");
  }
});

// Important for Google Maps callback to find initMap
window.initMap = initMap;
