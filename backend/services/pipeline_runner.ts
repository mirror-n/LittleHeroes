// Pipeline runner that loads RAG, prompts, and safety. 
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string }; // Provide minimal process typing.

const path = require("path"); // Node path module.

const {
  loadPrimaryRag,
} = require(path.join(process.cwd(), "ai", "pipelines", "retrieve_primary")); // Primary RAG loader.

const {
  buildRagOnlyPrompt,
  buildRefusalText,
  loadSafetyConfig,
  enforceSafety,
} = require(path.join(process.cwd(), "ai", "pipelines", "answer_controller")); // Prompt + safety helpers.

export type PipelineInputs = { // Pipeline input package.
  prompt: { system: string; user: string; shouldRefuse: boolean }; // Prompt bundle.
  primary: { context: string; guardrails: any; characterName: string }; // Primary RAG data.
  safety: { forbiddenTopics: string[]; childSafeRules: string; escalationPolicy: string }; // Safety config.
  refusalText: string; // Refusal text.
  conversationHistory: any[]; // Conversation history.
}; 

export function loadPipelineInputs(characterSlug: string, message: string, conversationHistory: any[] = []): PipelineInputs { // Load pipeline data.
  const primary = loadPrimaryRag(characterSlug); // Load primary RAG for character.
  const safety = loadSafetyConfig(); // Load safety config files.
  const refusalText = buildRefusalText(); // Load refusal text.

  const prompt = buildRagOnlyPrompt({ // Build prompt inputs.
    question: message, // User message.
    context: primary.context, // Primary RAG context.
    character: primary.characterName, // Character display name.
    refusalText, // Refusal text.
    guardrails: primary.guardrails, // Guardrails for template access.
    conversationHistory, // Conversation history.
  }); 

  return { prompt, primary, safety, refusalText, conversationHistory }; // Return pipeline inputs.
} 

export function applySafety( // Apply safety + guardrails checks.
  answer: string, // Raw model answer.
  safety: { forbiddenTopics: string[]; childSafeRules: string; escalationPolicy: string }, // Safety config.
  guardrails: any, // Guardrails object.
  refusalText: string // Refusal response.
): string { // Return safe answer.
  return enforceSafety(answer, safety, guardrails, refusalText); // Delegate to safety checker.
} 
