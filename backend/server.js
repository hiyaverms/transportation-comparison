// backend/server.js
import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.get("/", (req, res) => {
  res.json({ message: "Transport Compare API is running thumbs up" });
});

app.get("/compare", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "Missing from/to parameters" });
  }

  const modes = ["driving", "transit", "bicycling", "walking"];
  const results = {};

  for (const mode of modes) {
    try {
      const response = await axios.get(
        "https://maps.googleapis.com/maps/api/directions/json",
        {
          params: {
            origin: from,
            destination: to,
            mode,
            key: GOOGLE_API_KEY,
          },
        }
      );

      const data = response.data;
      if (data.status === "OK") {
        const leg = data.routes[0].legs[0];
        results[mode] = {
          time: leg.duration.text,
          distance: leg.distance.text,
        };
      } else {
        results[mode] = { error: data.status };
      }
    } catch (err) {
      results[mode] = { error: "API request failed" };
    }
  }

  res.json(results);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
