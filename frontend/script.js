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
 });
  endMarker.addListener("dragend", () => { 
    updateLocation(endMarker, "end-location"); 
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
    } else {
      alert("Address not found: " + status);
    }
  });
}

// Important for Google Maps callback to find initMap
window.initMap = initMap;
