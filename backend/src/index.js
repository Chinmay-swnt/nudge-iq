const express = require("express");
const cors = require("cors");
require("dotenv").config();

const hardwareRoutes = require("./routes/hardware.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "backend" });
});

// Hardware ingestion integration routes
app.use("/meetings", hardwareRoutes);
app.use("/api/hardware", hardwareRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});