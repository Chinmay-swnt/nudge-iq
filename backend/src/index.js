const express = require("express");
const cors = require("cors");
require("dotenv").config();

const hardwareRoutes = require("./routes/hardware.routes");
const meetingPipelineRoutes = require("./routes/meetingPipeline.routes");
const meetingsRoutes = require("./routes/meetings.routes");
const reminderRoutes = require("./routes/reminder.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "backend" });
});

// Phase 2 Meetings & Audio Upload routes
app.use("/api/meetings", meetingsRoutes);

// Phase 4 Task Nudges & Automated Reminders
app.use("/api/reminders", reminderRoutes);

// Hardware ingestion integration routes
app.use("/meetings", hardwareRoutes);
app.use("/api/hardware", hardwareRoutes);

// Meeting Bot & AI Pipeline routes
app.use("/api/pipeline", meetingPipelineRoutes);
app.use("/meetings", meetingPipelineRoutes);

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("[backend] Unhandled request error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[backend] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[backend] Uncaught Exception:", err);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});