// Server entry point for the backend. 
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string; env: Record<string, string | undefined> }; // Provide minimal process typing.

const http = require("http"); // Node HTTP server module.
const path = require("path"); // Node path module.
const fs = require("fs"); // Node file system module.

const { loadEnv } = require(path.join(process.cwd(), "backend", "utils", "env")); // Load .env for local dev.
const { handleChatRequest } = require(path.join(process.cwd(), "backend", "api", "chat_handler")); // Chat handler.

loadEnv(); // Populate process.env before handling requests.

const PORT = parseInt(process.env.PORT || '3001', 10); // Use Render's PORT env var, fallback to 3001 for local dev.
const FRONTEND_DIR = path.join(process.cwd(), "frontend"); // Frontend static files directory.

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function serveStaticFile(req: any, res: any): boolean {
  let urlPath = req.url.split("?")[0]; // Remove query string.
  if (urlPath === "/") urlPath = "/index.html"; // Default to index.
  const filePath = path.join(FRONTEND_DIR, urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.setHeader("Content-Type", contentType);
  res.statusCode = 200;
  res.end(content);
  return true;
}

const server = http.createServer(async (req: any, res: any) => { // Create HTTP server.
  // API routes
  if (req.url === "/api/chat" || req.method === "OPTIONS") {
    await handleChatRequest(req, res); // Handle API requests.
    return;
  }
  // Static file serving
  if (!serveStaticFile(req, res)) {
    res.statusCode = 404;
    res.end("Not found");
  }
}); 

server.listen(PORT, "0.0.0.0", () => { // Start listening for requests.
  // eslint-disable-next-line no-console // Allow a simple startup log.
  console.log(`Server running on http://localhost:${PORT}`); // Log URL.
  console.log(`Frontend: http://localhost:${PORT}/pages/home.html`); // Log frontend URL.
}); 
