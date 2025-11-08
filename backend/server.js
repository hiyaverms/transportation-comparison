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


const MODES = ["driving", "transit", "bicycling", "walking"];

const EMISSIONS_FACTORS = { //need to update
  driving: 0.120,
  transit: 0.065,
  bicycling: 0.0,
  walking: 0.0
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
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${GOOGLE_API_KEY}`;
      const response = await axios.get(url);
      const data = response.data;

      if (data.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        results.push({
          mode,
          distance_km: leg.distance.value / 1000,
          duration_min: leg.duration.value / 60,
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