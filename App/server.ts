import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  // API Route to proxy the public Google Spreadsheet to avoid browser CORS issues
  app.get("/api/sync-spreadsheet", async (req, res) => {
    try {
      const url = 'https://docs.google.com/spreadsheets/d/1uCpxARIPFmkhL1BdzCL5dXmxO5CbNbFkKrgOCmUM6cA/gviz/tq?tqx=out:json&gid=2069304119';
      console.log('Proxying spreadsheet request to:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Sheets responded with status ${response.status}`);
      }
      const text = await response.text();
      res.setHeader('Content-Type', 'text/plain');
      res.send(text);
    } catch (err: any) {
      console.error('Spreadsheet proxy error:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch spreadsheet data' });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development, static assets for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
