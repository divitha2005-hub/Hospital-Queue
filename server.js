require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const DatabaseEngine = require("./server/db");
const routes = require("./server/routes");

const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/hospital_queue";

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from public/ directory
app.use(express.static(path.join(__dirname, "public")));

// Mount API routes
app.use("/api", routes);

// Catch-all route to serve index.html for client side SPA fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// Connect to MongoDB first (falls back to local JSON mode if offline), then boot server
const db = DatabaseEngine.getInstance();
db.connect(MONGODB_URI)
    .then(() => {
        app.listen(PORT, () => {
            console.log(`===========================================================`);
            console.log(`  🏥 BIOCARE EHR: FULL-STACK HOSPITAL QUEUE IS RUNNING!    `);
            console.log(`  🖥️  Server URL: http://localhost:${PORT}                  `);
            console.log(`  📁 Serving Frontend from: ./public                       `);
            console.log(`  ⚡ Real-time data streams active.                         `);
            console.log(`===========================================================`);
        });
    })
    .catch(err => {
        console.error("❌ Failed to launch BIOCARE EHR server due to database error:", err);
        process.exit(1);
    });
