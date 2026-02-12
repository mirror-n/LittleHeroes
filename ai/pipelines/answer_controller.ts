// This part uses prompts and safety files to build the final prompt and enforce safety.
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string }; // Provide minimal process typing.

const fs = require("fs"); // Node file system module.
const path = require("path"); // Node path module.

type TemplateVars = Record<string, string | undefined>; // Template variable map.

export type RagAnswerInput = { // Input for prompt building.
  question: string; // User question text.
  context: string; // Retrieved RAG context.
  character?: string; // Optional character name.
  refusalText?: string; // Optional refusal override.
  guardrails?: any; // Optional guardrails for template access.
  conversationHistory?: any[]; // Optional conversation history.
}; 

export type RagPrompt = { // Output prompt package.
  system: string; // System prompt string.
  user: string; // User prompt string.
  shouldRefuse: boolean; // Flag when context is empty.
}; 

export type SafetyConfig = { // Safety configuration bundle.
  forbiddenTopics: string[]; // List of blocked topics.
  childSafeRules: string; // Safety rules text.
  escalationPolicy: string; // Escalation policy text.
}; 

const PROMPT_DIR = path.join(process.cwd(), "ai", "prompts"); // Prompts root path.
const SAFETY_DIR = path.join(process.cwd(), "ai", "safety"); // Safety root path.

function readPrompt(fileName: string): string { // Read prompt file.
  const filePath = path.join(PROMPT_DIR, fileName); // Build prompt path.
  if (!fs.existsSync(filePath)) return ""; // Return empty if missing.
  return fs.readFileSync(filePath, "utf8"); // Return file contents.
} 

function readSafetyFile(fileName: string): string { // Read safety file.
  const filePath = path.join(SAFETY_DIR, fileName); // Build safety path.
  if (!fs.existsSync(filePath)) return ""; // Return empty if missing.
  return fs.readFileSync(filePath, "utf8"); // Return file contents.
} 

function readJsonSafe(filePath: string): any { // Read JSON with fallback.
  if (!fs.existsSync(filePath)) return {}; // Return empty if missing.
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")); // Parse JSON.
  } catch { // If JSON is invalid.
    return {}; // Return empty object.
  } 
} 

function renderTemplate(template: string, vars: TemplateVars): string { // Render template.
  // First handle simple variables like {{key}}
  let result = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => { // Replace tokens.
    const value = vars[key]; // Lookup variable.
    return value === undefined ? "" : String(value); // Use empty if missing.
  }); 
  
  // Handle nested object access like guardrails.constraints.redirection_style
  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const keys = path.split('.'); // Split path by dots.
    let value: any = vars; // Start from vars object.
    
    // Traverse the path
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]; // Navigate deeper.
      } else {
        return ""; // Return empty if path not found.
      }
    }
    
    // Format the final value
    if (Array.isArray(value)) {
      return value.join(". "); // Join array items.
    }
    return value !== undefined && value !== null ? String(value) : ""; // Convert to string.
  });
  
  return result;
} 

export function loadSafetyConfig(): SafetyConfig { // Load safety config files.
  const forbidden = readJsonSafe(path.join(SAFETY_DIR, "forbidden_topics.json")); // Load JSON.
  const forbiddenTopics = Array.isArray(forbidden.hard_blocked_topics) // Validate array.
    ? forbidden.hard_blocked_topics // Use list if valid.
    : []; // Fall back to empty list.

  return { // Return composed safety config.
    forbiddenTopics, // Blocked topics list.
    childSafeRules: readSafetyFile("child_safe_rules.txt"), // Child-safe rules.
    escalationPolicy: readSafetyFile("escalation_policy.md"), // Escalation policy.
  }; 
} 

function containsForbiddenTopic(text: string, topics: string[]): boolean { // Check blocked topics.
  const lower = text.toLowerCase(); // Normalize answer text.
  return topics.some((topic) => lower.includes(String(topic).toLowerCase())); // Match topic.
} 

function asksForPersonalInfo(text: string): boolean { // Detect personal info requests.
  const lower = text.toLowerCase(); // Normalize answer text.
  return ( // Return true if any pattern matches.
    lower.includes("address") || // Detect address request.
    lower.includes("phone") || // Detect phone request.
    lower.includes("email") || // Detect email request.
    lower.includes("last name") || // Detect last name request.
    lower.includes("full name") // Detect full name request.
  ); 
} 

function extractVirtueKeywords(guardrails: any): string[] { // Build keyword list from guardrails.
  const rules = guardrails?.constraints?.virtue_alignment; // Read virtue alignment list.
  if (!Array.isArray(rules)) return []; // Return empty if missing.
  const raw = rules.join(" "); // Combine rule sentences.
  return raw
    .toLowerCase() // Normalize to lowercase.
    .replace(/[^a-z\s]/g, " ") // Remove punctuation.
    .split(/\s+/) // Split into words.
    .filter((word) => word.length >= 5) // Keep meaningful words.
    .filter((word, index, arr) => arr.indexOf(word) === index); // Deduplicate.
} 

function isSpeculative(answer: string): boolean { // Detect speculative language.
  const lower = answer.toLowerCase(); // Normalize answer text.
  return ( // Check common speculative phrases.
    lower.includes("i think") ||
    lower.includes("i guess") ||
    lower.includes("maybe") ||
    lower.includes("probably") ||
    lower.includes("i believe")
  ); 
} 

export function enforceSafety( // Apply safety post-check.
  answer: string, // Model answer text.
  safety: SafetyConfig, // Safety configuration.
  guardrails: any, // Character guardrails (placeholder).
  refusalText: string // Refusal response.
): string { // Return safe answer.
  if (containsForbiddenTopic(answer, safety.forbiddenTopics)) { // Block forbidden topics.
    return refusalText; // Refuse if blocked.
  } 

  if (asksForPersonalInfo(answer)) { // Block personal info requests.
    return refusalText; // Refuse if personal info.
  } // End personal info check.

  // Guardrails are enforced in the prompt. Avoid hard blocking on tone/virtue
  // to prevent unnecessary refusals for neutral, child-safe answers.

  return answer; // Return answer if safe.
} 

export function buildRagOnlyPrompt(input: RagAnswerInput): RagPrompt { // Build RAG-only prompts.
  const systemPrompt = readPrompt("system.txt"); // Load system prompt.
  const characterPrompt = readPrompt("character.txt"); // Load character prompt.
  const answerPrompt = readPrompt("answer_with_rag.txt"); // Load answer prompt.
  const refusalText = input.refusalText ?? readPrompt("refusal.txt"); // Load refusal.

  const context = (input.context || "").trim(); // Normalize context.
  const shouldRefuse = context.length === 0; // Flag empty context.

  const system = [ // Build system prompt stack.
    systemPrompt, // Add system prompt.
    renderTemplate(characterPrompt, { character: input.character ?? "" }), // Add character.
  ] 
    .filter(Boolean) // Remove empty entries.
    .join("\n\n"); // Join with spacing.

  const user = renderTemplate(answerPrompt, { // Render user prompt.
    context, // Inject context.
    question: input.question, // Inject question.
    character: input.character ?? "", // Inject character name.
    refusal_text: refusalText, // Inject refusal text.
    guardrails: input.guardrails || {}, // Inject guardrails for template access.
  }); 

  return { system, user, shouldRefuse }; // Return built prompt package.
} 

export function buildRefusalText(): string { // Read refusal text.
  const raw = readPrompt("refusal.txt"); // Load refusal options.
  const options = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (options.length === 0) return "";
  const index = Math.floor(Math.random() * options.length);
  return options[index]; // Return one refusal variant.
} 
