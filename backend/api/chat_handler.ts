// Chat request handler for the backend. 
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string }; // Provide minimal process typing.

const path = require("path"); // Node path module.

const { // HTTP helper functions.
  applyCors,
  readRequestBody,
  sendJson,
} = require(path.join(process.cwd(), "backend", "utils", "http")); // HTTP helpers.

    const { callOpenAI } = require(path.join(process.cwd(), "backend", "services", "openai_client")); // OpenAI client.
    const { callGemini } = require(path.join(process.cwd(), "backend", "services", "gemini_client")); // Gemini client.
    const { logUnansweredQuestion } = require(path.join(process.cwd(), "backend", "utils", "unanswered_logger")); // Logger.

const {
  loadPipelineInputs,
  applySafety,
} = require(path.join(process.cwd(), "backend", "services", "pipeline_runner")); // Pipeline helpers.

export async function handleChatRequest(req: any, res: any): Promise<void> { // Handle /api/chat.
  applyCors(res); // Apply CORS headers.

  if (req.method === "OPTIONS") { // Handle CORS preflight.
    res.statusCode = 204; // No content.
    res.end(); // End response.
    return; // Stop processing.
  } 

  if (req.method !== "POST" || req.url !== "/api/chat") { // Only allow POST /api/chat.
    sendJson(res, 404, { error: "Not found" }); // Return 404 for other routes.
    return; // Stop processing.
  } 

  const raw = await readRequestBody(req); // Read raw request body.
  let payload: any = {}; // Initialize payload.

  try { 
    payload = JSON.parse(raw || "{}"); // Parse JSON or fallback to empty.
  } catch { // If JSON is invalid.
    sendJson(res, 400, { error: "Invalid JSON" }); // Return 400 error.
    return; // Stop processing.
  } 

  const message = String(payload.message || "").trim(); // Normalize message text.
  const characterSlug = String(payload.character || "").trim().toLowerCase(); // Normalize character slug.
  const conversationHistory = Array.isArray(payload.conversationHistory) ? payload.conversationHistory : []; // Get conversation history.

  if (!message) { // If message is missing.
    sendJson(res, 400, { error: "Missing message" }); // Return 400 error.
    return; // Stop processing.
  } 

  if (!characterSlug) { // If character is missing.
    sendJson(res, 400, { error: "Missing character" }); // Return 400 error.
    return; // Stop processing.
  } 

  const pipeline = loadPipelineInputs(characterSlug, message, conversationHistory); // Load pipeline data.

      let rawAnswer = ""; // Store raw model answer.

      const normalize = (text: string): string =>
        String(text || "")
          .trim()
          .replace(/\s+/g, " "); // Normalize whitespace for comparison.

      if (pipeline.prompt.shouldRefuse) { // Check if context is empty.
        rawAnswer = pipeline.refusalText; // If no context, refuse.
        logUnansweredQuestion({
          timestamp: new Date().toISOString(),
          character: characterSlug,
          message,
          reason: "empty_context",
        });
  } else {
        try { // Try calling OpenAI.
          rawAnswer = await callOpenAI(pipeline.prompt.system, pipeline.prompt.user, pipeline.conversationHistory); // Call model.
        } catch (error: any) { // If OpenAI fails, try Gemini if available.
          const openAiMessage = String(error?.message || "OpenAI failed");
          const isQuotaError =
            openAiMessage.includes("insufficient_quota") ||
            openAiMessage.includes("OpenAI error 429") ||
            openAiMessage.includes("Missing OPENAI_API_KEY");

          if (!isQuotaError) {
            logUnansweredQuestion({
              timestamp: new Date().toISOString(),
              character: characterSlug,
              message,
              reason: `openai_error:${openAiMessage}`,
            });
            sendJson(res, 500, { error: `OpenAI failed: ${openAiMessage}` });
            return; // Stop processing.
          }

          try {
            rawAnswer = await callGemini(pipeline.prompt.system, pipeline.prompt.user, pipeline.conversationHistory);
          } catch (fallbackError: any) {
            const fallbackMessage = String(
              fallbackError?.message || "Gemini failed"
            );
            logUnansweredQuestion({
              timestamp: new Date().toISOString(),
              character: characterSlug,
              message,
              reason: `gemini_error:${fallbackMessage}`,
            });
            sendJson(res, 500, {
              error: `OpenAI failed: ${openAiMessage}. Gemini failed: ${fallbackMessage}`,
            });
            return; // Stop processing.
          }
        }
  }

      if (normalize(rawAnswer) === normalize(pipeline.refusalText)) {
        logUnansweredQuestion({
          timestamp: new Date().toISOString(),
          character: characterSlug,
          message,
          reason: "model_refusal",
        });
      }

      const safeAnswer = applySafety( // Apply safety + guardrails checks.
    rawAnswer, // Answer from model.
    pipeline.safety, // Safety configuration.
    pipeline.primary.guardrails, // Guardrails for this character.
    pipeline.refusalText // Refusal text.
  ); 

      if (normalize(safeAnswer) === normalize(pipeline.refusalText)) {
        logUnansweredQuestion({
          timestamp: new Date().toISOString(),
          character: characterSlug,
          message,
          reason: "safety_refusal",
        });
      }

  sendJson(res, 200, { // Return successful response.
    answer: safeAnswer, // Final answer after checks.
    shouldRefuse: pipeline.prompt.shouldRefuse, // Include refusal flag for UI.
  }); 
} 
