import express from "express";
import path from "node:path";
import { getStations } from "./cache.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/api/stations", async (req, res) => {
  try {
    const data = await getStations(req.query.refresh === "1");
    res.json(data);
  } catch (err) {
    console.error("Failed to load stations:", err);
    res.status(502).json({ error: "Could not load stations from OpenStreetMap" });
  }
});

app.use(express.static(path.resolve("public")));

app.listen(port, () => {
  console.log(`LPG map running at http://localhost:${port}`);
});
