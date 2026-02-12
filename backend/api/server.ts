// Server entry point for the backend. 
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string; env: Record<string, string | undefined> }; // Provide minimal process typing.

const http = require("http"); // Node HTTP server module.
const path = require("path"); // Node path module.
const fs = require("fs"); // Node file system module.
const url = require("url"); // Node URL module.

const { loadEnv } = require(path.join(process.cwd(), "backend", "utils", "env")); // Load .env for local dev.
const { handleChatRequest } = require(path.join(process.cwd(), "backend", "api", "chat_handler")); // Chat handler.

loadEnv(); // Populate process.env before handling requests.

const PORT = 3001; // Local API port.
const FRONTEND_DIR = path.join(process.cwd(), "frontend"); // Frontend directory path.

function getContentType(filePath: string): string { // Determine content type from file extension.
  const ext = path.extname(filePath).toLowerCase(); // Get file extension.
  const types: Record<string, string> = { // Content type map.
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".ico": "image/x-icon",
  };
  return types[ext] || "application/octet-stream"; // Return type or default.
}

function serveStaticFile(req: any, res: any): void { // Serve static files from frontend directory.
  const parsedUrl = url.parse(req.url || "/"); // Parse request URL.
  let filePath = parsedUrl.pathname || "/"; // Get pathname.
  
  // Default to index.html for root
  if (filePath === "/") {
    filePath = "/index.html";
  }
  
  // Remove leading slash and resolve path
  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ""); // Prevent directory traversal.
  const fullPath = path.join(FRONTEND_DIR, safePath); // Build full file path.
  
  // Check if file exists
  if (!fs.existsSync(fullPath) || !fullPath.startsWith(FRONTEND_DIR)) { // Security check.
    res.statusCode = 404; // Not found.
    res.setHeader("Content-Type", "text/plain"); // Plain text.
    res.end("404 Not Found"); // Send 404.
    return; // Stop processing.
  }
  
  // Check if it's a directory, serve index.html
  const stats = fs.statSync(fullPath); // Get file stats.
  if (stats.isDirectory()) { // If directory.
    const indexPath = path.join(fullPath, "index.html"); // Try index.html.
    if (fs.existsSync(indexPath)) { // If exists.
      filePath = path.join(filePath, "index.html"); // Update path.
      filePath = path.join(FRONTEND_DIR, filePath); // Build full path.
      const content = fs.readFileSync(filePath); // Read file.
      res.statusCode = 200; // OK.
      res.setHeader("Content-Type", getContentType(filePath)); // Set content type.
      res.end(content); // Send content.
      return; // Stop processing.
    }
    res.statusCode = 404; // Not found.
    res.end("404 Not Found"); // Send 404.
    return; // Stop processing.
  }
  
  // Serve the file
  try {
    const content = fs.readFileSync(fullPath); // Read file.
    res.statusCode = 200; // OK.
    res.setHeader("Content-Type", getContentType(fullPath)); // Set content type.
    res.end(content); // Send content.
  } catch (error: any) { // Handle errors.
    res.statusCode = 500; // Server error.
    res.setHeader("Content-Type", "text/plain"); // Plain text.
    res.end(`500 Internal Server Error: ${error?.message || error}`); // Send error.
  }
}

const server = http.createServer(async (req: any, res: any) => { // Create HTTP server.
  const parsedUrl = url.parse(req.url || "/"); // Parse URL.
  
  // Route API requests to chat handler
  if (parsedUrl.pathname === "/api/chat") { // If API endpoint.
    await handleChatRequest(req, res); // Handle chat request.
  } else { // Otherwise.
    serveStaticFile(req, res); // Serve static file.
  }
}); 

server.listen(PORT, () => { // Start listening for requests.
  // eslint-disable-next-line no-console // Allow a simple startup log.
  console.log(`Server running on http://localhost:${PORT}`); // Log URL.
  // eslint-disable-next-line no-console
  console.log(`Frontend: http://localhost:${PORT}/pages/home.html`); // Log frontend URL.
});
