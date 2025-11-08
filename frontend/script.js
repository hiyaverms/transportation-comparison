let directionsRenderer, directionsService;

function initMap() {
  const boston = { lat: 42.3601, lng: -71.0589 };
  const cambridge = { lat: 42.3736, lng: -71.1097 };

  // Initialize map
  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 13,
    center: boston,
  });

  // Add markers
  new google.maps.Marker({ position: boston, map, title: "Boston" });
  new google.maps.Marker({ position: boston, map, title: "Allston" });

  // Directions setup
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    draggable: false,
    suppressMarkers: true
  });

  // Request route
  directionsService.route(
    {
      origin: boston,
      destination: cambridge,
      travelMode: google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);

        // Display summary in overlay
        const route = result.routes[0].legs[0];
        document.getElementById("route-summary").textContent =
          `Distance: ${route.distance.text}, Duration: ${route.duration.text}`;
      } else {
        console.error("Directions request failed: " + status);
      }
    }
  );

  // Info panel toggle
  const toggleBtn = document.getElementById("toggle-panel");
  const infoPanel = document.getElementById("info-panel");
  toggleBtn.addEventListener("click", () => {
    infoPanel.classList.toggle("hidden");
  });

  // Map control button to toggle route
  const mapControlDiv = document.createElement("div");
  mapControlDiv.classList.add("map-control-button");
  mapControlDiv.innerHTML = "Toggle Route";

  map.controls[google.maps.ControlPosition.TOP_LEFT].push(mapControlDiv);

  mapControlDiv.addEventListener("click", () => {
    const container = directionsRenderer.getContainer();
    if (container.style.display === "none") {
      container.style.display = "block";
    } else {
      container.style.display = "none";
    }
  });
}
