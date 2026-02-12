// OpenAI client helper for chat completions.
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { env: Record<string, string | undefined> }; // Provide minimal process typing.
declare const Buffer: { byteLength: (input: string) => number }; // Provide minimal Buffer typing.

const https = require("https"); // Node HTTPS client module.

const OPENAI_MODEL = "gpt-4o-mini"; // Default OpenAI model.

export function callOpenAI(systemPrompt: string, userPrompt: string, conversationHistory: any[] = []): Promise<string> { // Call OpenAI API.
  return new Promise((resolve, reject) => { // Return a promise for the API call.
    const apiKey = process.env.OPENAI_API_KEY; // Read API key from env.
    if (!apiKey) { // If API key is missing.
      reject(new Error("Missing OPENAI_API_KEY")); // Reject with error.
      return; // Stop execution.
    }

    // Build messages array: system prompt, conversation history, then current user prompt
    const messages: any[] = [
      { role: "system", content: systemPrompt }, // System prompt.
    ];
    
    // Add conversation history (already in correct format: {role, content})
    if (Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory);
    }
    
    // Add current user message
    messages.push({ role: "user", content: userPrompt }); // User prompt.

    const body = JSON.stringify({ // Build request body.
      model: OPENAI_MODEL, // Set model name.
      messages, // Provide system + history + user messages.
      temperature: 0.4, // Keep answers stable.
    });

    const options = { // Configure HTTPS request.
      hostname: "api.openai.com", // OpenAI host.
      path: "/v1/chat/completions", // Chat completions endpoint.
      method: "POST", // POST request.
      headers: { // Request headers.
        "Content-Type": "application/json", // JSON content type.
        Authorization: `Bearer ${apiKey}`, // Authorization header.
        "Content-Length": Buffer.byteLength(body), // Content length.
      },
    };

    const request = https.request(options, (response: any) => { // Create HTTPS request.
      let data = ""; // Accumulate response data.
      response.on("data", (chunk: string) => { // Handle incoming chunks.
        data += chunk; // Append chunk.
      });
      response.on("end", () => { // Handle end of response.
        if (response.statusCode < 200 || response.statusCode >= 300) { // Check status code.
          reject(new Error(`OpenAI error ${response.statusCode}: ${data}`)); // Reject on error.
          return; // Stop execution.
        }
        try { // Try parsing JSON response.
          const parsed = JSON.parse(data); // Parse JSON.
          const text = parsed?.choices?.[0]?.message?.content; // Extract answer text.
          resolve(text ? String(text).trim() : ""); // Resolve with text or empty.
        } catch (error) { // Handle JSON parse errors.
          reject(error); // Reject on error.
        }
      });
    });

    request.on("error", (error: any) => { // Handle request errors.
      reject(error); // Reject on error.
    });

    request.write(body); // Send request body.
    request.end(); // Finish request.
  }); 
} 
