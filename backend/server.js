import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PORT = process.env.PORT || 8080;;

//serves frontend static files from backend/public
const publicPath = path.join(process.cwd(), "public");
app.use(express.static(publicPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

const MODES = [
  "driving",
  "bus",
  "tram",
  "subway",
  "bicycling",
  "walking",
  "e-bike",
  "e-scooter"
];


const EMISSIONS_FACTORS = {
  driving: 0.18,
  bus: 0.13,
  tram: 0.11,
  subway: 0.10, 
  bicycling: 0.0,
  walking: 0.0,
  "e-bike": 0.024,
  "e-scooter": 0.12 
};


app.get("/api/routes", async (req, res) => {
  try {
    const { origin, destination, departure_time } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination required" });
    }

    // Default to current time if not provided (for traffic-aware routing)
    const departureTime = departure_time || Math.floor(Date.now() / 1000);

    const results = [];

    for (const mode of MODES) {
      try {
        let actualMode = mode;
        let transitModeParam = "";

        // e-bike and e-scooter
        if (["e-bike", "e-scooter"].includes(mode)) {
          actualMode = "driving";
        }

        // bus/train/subway as transit submodes
        if (["bus", "tram", "subway"].includes(mode)) {
          actualMode = "transit";
          transitModeParam = `&transit_mode=${mode}`;
        }

        let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
          origin
        )}&destination=${encodeURIComponent(destination)}&mode=${actualMode}${transitModeParam}&key=${GOOGLE_API_KEY}`;

        if (actualMode === "driving") {
          url += `&departure_time=${departureTime}&traffic_model=best_guess`;
        }

      const response = await axios.get(url);
      const data = response.data;

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];

        // Extract polyline and bounds for map rendering
        const polyline = route.overview_polyline?.points || "";
        const bounds = route.bounds;

        // Use traffic-aware duration if available (for driving modes)
        const baseDuration = leg.duration_in_traffic?.value || leg.duration.value;
        const hasTrafficData = !!leg.duration_in_traffic;

        // e-bike: 1.5x slower than car, e-scooter: 1.6x slower than e-bike
        let durationMultiplier = 1;
        if (mode === "e-bike") durationMultiplier = 1.5;
        if (mode === "e-scooter") durationMultiplier = 1.5 * 1.6;

        results.push({
          mode,
          distance_km: leg.distance.value / 1000,
          duration_min: (leg.duration.value / 60) * durationMultiplier,
          duration_with_traffic_min: hasTrafficData ? (baseDuration / 60) * durationMultiplier : null,
          carbon_kg: (leg.distance.value / 1000) * (EMISSIONS_FACTORS[mode] || 0),
          polyline: route.overview_polyline?.points || "", // add this
          bounds,
          has_traffic_data: hasTrafficData
        });
      } else {
        console.warn(`No routes found for mode ${mode}`);
      }
      } catch (modeError) {
        console.error(`Error fetching route for mode ${mode}:`, modeError.message);
      }
    }

    let suggestion = null;
    if (results.length > 1) {
      const sortedByCarbon = [...results].sort((a, b) => a.carbon_kg - b.carbon_kg);
      const sortedByTime = [...results].sort((a, b) => a.duration_min - b.duration_min);

      const highestCarbon = sortedByCarbon[sortedByCarbon.length - 1];
      const lowestCarbon = sortedByCarbon[0];
      const fastest = sortedByTime[0];

      // lower-carbon alternative if highest
      const nearTimeAlternatives = results
        .filter(r => r.mode !== fastest.mode)
        .map(r => ({
          ...r,
          timeDiffPercent: Math.abs((r.duration_min - fastest.duration_min) / fastest.duration_min)
        }))
        .filter(r => r.timeDiffPercent <= 0.15 && r.carbon_kg < fastest.carbon_kg) // within 15% travel time
        .sort((a, b) => a.timeDiffPercent - b.timeDiffPercent);

      if (nearTimeAlternatives.length > 0) {
        const bestAlt = nearTimeAlternatives[0];
        const saved = (fastest.carbon_kg - bestAlt.carbon_kg).toFixed(2);
        suggestion = `You could save ${saved} kg of CO₂ by taking ${bestAlt.mode} — it'll get you there in about the same time as ${fastest.mode}.`;
      }

      // similar travel time, but lower emissions
      const nearFastAlternatives = results.filter(r =>
        r.mode !== fastest.mode && r.duration_min <= fastest.duration_min * 1.1 && r.carbon_kg < fastest.carbon_kg
      );
      if (nearFastAlternatives.length > 0) {
        const better = nearFastAlternatives[0];
        const saved = (fastest.carbon_kg - better.carbon_kg).toFixed(2);
        suggestion = suggestion ||
          `You could arrive in nearly the same time using ${better.mode}, saving ${saved} kg of CO₂.`;
      }
    }



    res.json(results);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch route data" });
  }
});

app.get("/api/key", (req, res) => {
  console.log("API Key requested");
  res.json({ key: process.env.GOOGLE_API_KEY });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));