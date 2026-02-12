// Gemini client helper for content generation.
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { env: Record<string, string | undefined> }; // Minimal process typing.
declare const Buffer: { byteLength: (input: string) => number }; // Provide minimal Buffer typing.

const https = require("https"); // Node HTTPS client module.

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash"; // Default Gemini model.
const FALLBACK_MODELS = ["gemini-1.5-pro", "gemini-1.0-pro"]; // Safe fallbacks.
const PREFERRED_MODELS = [DEFAULT_GEMINI_MODEL, ...FALLBACK_MODELS];

function requestGemini(model: string, apiKey: string, contents: any[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.4,
      },
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1/models/${model}:generateContent?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const request = https.request(options, (response: any) => {
      let data = "";
      response.on("data", (chunk: string) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`Gemini error ${response.statusCode}: ${data}`);
          // @ts-ignore attach status code for fallback logic.
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text =
            parsed?.candidates?.[0]?.content?.parts?.[0]?.text ??
            parsed?.candidates?.[0]?.content?.text ??
            "";
          resolve(text ? String(text).trim() : "");
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", (error: any) => {
      reject(error);
    });

    request.write(body);
    request.end();
  });
}

function listGeminiModels(apiKey: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1/models?key=${apiKey}`,
      method: "GET",
    };

    const request = https.request(options, (response: any) => {
      let data = "";
      response.on("data", (chunk: string) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Gemini list models error ${response.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const models = Array.isArray(parsed?.models) ? parsed.models : [];
          const available = models
            .filter((model: any) =>
              Array.isArray(model?.supportedGenerationMethods)
                ? model.supportedGenerationMethods.includes("generateContent")
                : true
            )
            .map((model: any) => String(model?.name || ""))
            .filter((name: string) => name.length > 0)
            .map((name: string) => name.replace(/^models\//, ""));
          resolve(available);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", (error: any) => {
      reject(error);
    });

    request.end();
  });
}

export async function callGemini(systemPrompt: string, userPrompt: string, conversationHistory: any[] = []): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const configured = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const models = [configured, DEFAULT_GEMINI_MODEL, ...FALLBACK_MODELS].filter(
    (value, index, self) => self.indexOf(value) === index
  );

  // Build contents array for Gemini API
  // Gemini uses "model" instead of "assistant" and wraps content in parts array
  const contents: any[] = [];
  
  // Add system prompt as first user message (Gemini doesn't have system role)
  contents.push({
    role: "user",
    parts: [{ text: systemPrompt }],
  });
  
  // Convert conversation history from OpenAI format to Gemini format
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory) {
      if (msg && msg.role && msg.content) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: String(msg.content) }],
        });
      }
    }
  }
  
  // Add current user prompt
  contents.push({
    role: "user",
    parts: [{ text: userPrompt }],
  });

  let lastError: any = null;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      return await requestGemini(model, apiKey, contents);
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.statusCode || 0);
      if (status !== 404) {
        break;
      }
    }
  }

  try {
    const available = await listGeminiModels(apiKey);
    const preferred = PREFERRED_MODELS.find((model) => available.includes(model));
    const fallback = preferred || available[0];
    if (fallback) {
      return await requestGemini(fallback, apiKey, contents);
    }
  } catch (error) {
    lastError = error;
  }

  throw lastError || new Error("Gemini failed");
}
