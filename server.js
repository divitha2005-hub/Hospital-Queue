const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./server/routes");

const app = express();
const PORT = process.env.PORT || 8000;

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

// Start Server
app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`  🏥 BIOCARE EHR: FULL-STACK HOSPITAL QUEUE IS RUNNING!    `);
    console.log(`  🖥️  Server URL: http://localhost:${PORT}                  `);
    console.log(`  📁 Serving Frontend from: ./public                       `);
    console.log(`  ⚡ Server-Sent Events (SSE) Observers active.             `);
    console.log(`===========================================================`);
});
