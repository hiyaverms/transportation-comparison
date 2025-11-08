import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PORT = 8080;


const MODES = ["driving", "transit", "bicycling", "walking", "e-bike", "e-scooter"];

const EMISSIONS_FACTORS = { // need to find kg CO2 per km
  driving: 0.192,    
  transit: 0.089,
  bicycling: 0.0,
  walking: 0.0,
  "e-bike": 0.015, 
  "e-scooter": 0.021
};

app.get("/", (req, res) => {
  res.json({ message: "Transport Compare API is running" });
});

app.get("/api/routes", async (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination required" });
    }

    const results = [];

    for (const mode of MODES) {
      // e-bike & e-scooter use driving
      const actualMode = ["e-bike", "e-scooter"].includes(mode) ? "driving" : mode;

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${actualMode}&key=${GOOGLE_API_KEY}`;
      const response = await axios.get(url);
      const data = response.data;

      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        // e-bike: 1.5x slower than car, e-scooter: 1.6x slower than e-bike
        let durationMultiplier = 1;
        if (mode === "e-bike") durationMultiplier = 1.5;
        if (mode === "e-scooter") durationMultiplier = 1.5 * 1.6;
        results.push({
          mode,
          distance_km: leg.distance.value / 1000,
          duration_min: (leg.duration.value / 60) * durationMultiplier,
          carbon_kg: (leg.distance.value / 1000) * (EMISSIONS_FACTORS[mode] || 0),
        });
      }
    }


    res.json(results);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch route data" });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));