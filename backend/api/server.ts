// Server entry point for the backend. 
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string; env: Record<string, string | undefined> }; // Provide minimal process typing.

const http = require("http"); // Node HTTP server module.
const path = require("path"); // Node path module.

const { loadEnv } = require(path.join(process.cwd(), "backend", "utils", "env")); // Load .env for local dev.
const { handleChatRequest } = require(path.join(process.cwd(), "backend", "api", "chat_handler")); // Chat handler.

loadEnv(); // Populate process.env before handling requests.

const PORT = 3001; // Local API port.

const server = http.createServer(async (req: any, res: any) => { // Create HTTP server.
  await handleChatRequest(req, res); // Handle all requests in one handler.
}); 

server.listen(PORT, () => { // Start listening for requests.
  // eslint-disable-next-line no-console // Allow a simple startup log.
  console.log(`Backend chat server running on http://localhost:${PORT}`); // Log URL.
}); 
