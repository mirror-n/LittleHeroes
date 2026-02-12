// Primary RAG retrieval (use primary-rag files: character identity, style, and guardrails). 
// Reads ai/primary-rag/<character-slug> and returns formatted context.

declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string }; // Provide minimal process typing.

const fs = require("fs"); // Node file system module.
const path = require("path"); // Node path module.

export type PrimaryRagResult = { // Return shape for primary RAG.
  context: string; // Combined identity + style context.
  guardrails: any; // Guardrails JSON object.
  characterId: string; // Character ID string.
  characterName: string; // Character display name.
}; 

function readJsonSafe(filePath: string): any { // Read JSON with fallback.
  if (!fs.existsSync(filePath)) return {}; // Return empty if missing.
  try { // Try parsing JSON.
    return JSON.parse(fs.readFileSync(filePath, "utf8")); // Parse JSON content.
  } catch { // If JSON is invalid.
    return {}; // Return empty object.
  } 
} 

function formatSection(title: string, data: any): string { // Format one context block.
  return `## ${title}\n${JSON.stringify(data, null, 2)}\n`; // Markdown section.
} 

function formatVirtues(virtues: any): string { // Format virtues object into readable text.
  if (!virtues || typeof virtues !== "object") return ""; // Return empty if invalid.
  
  const virtueEntries = Object.entries(virtues); // Get virtue entries.
  if (virtueEntries.length === 0) return ""; // Return empty if no virtues.
  
  const formatted = virtueEntries.map(([name, description]) => {
    return `- **${name}**: ${description}`; // Format as markdown list item.
  }).join("\n"); // Join with newlines.
  
  return `## Character Virtues\n${formatted}\n`; // Return formatted section.
}

function formatArraySection(title: string, items: any[]): string { // Format array into readable text.
  if (!Array.isArray(items) || items.length === 0) return ""; // Return empty if invalid.
  
  const formatted = items.map((item: any) => {
    return `- ${typeof item === "string" ? item : String(item)}`; // Format as list item.
  }).join("\n"); // Join with newlines.
  
  return `## ${title}\n${formatted}\n`; // Return formatted section.
}

export function loadPrimaryRag(characterSlug: string): PrimaryRagResult { // Load primary RAG.
  const baseDir = path.join(process.cwd(), "ai", "primary-rag", characterSlug); // Base path.
  const identityPath = path.join(baseDir, "identity.json"); // Identity file path.
  const stylePath = path.join(baseDir, "style.json"); // Style file path.
  const guardrailsPath = path.join(baseDir, "guardrails.json"); // Guardrails file path.

  const identity = readJsonSafe(identityPath); // Read identity JSON.
  const style = readJsonSafe(stylePath); // Read style JSON.
  const guardrails = readJsonSafe(guardrailsPath); // Read guardrails JSON.

  const characterId = identity.character_id || characterSlug; // Use id or slug.
  const characterName = identity.character?.name || characterSlug; // Use name or slug.

  // Extract background facts from identity (supports both array of strings and array of objects)
  const backgroundFacts = Array.isArray(identity.background)
    ? identity.background
        .map((item: any) => (typeof item === "string" ? item : item.fact || ""))
        .filter(Boolean)
        .join("\n")
    : "";

  // Format virtues from identity for better readability
  const virtuesSection = formatVirtues(identity.virtues);
  
  // Format new arrays for better readability
  const teachingGuidanceSection = formatArraySection("Teaching Guidance", identity.teaching_guidance || []);
  const coachLinesSection = formatArraySection("Coach Lines", identity.coach_lines || []);
  const quotesSection = formatArraySection("Quotes", identity.quotes || []);
  const dailyMissionsSection = formatArraySection("Daily Missions", identity.daily_missions || []);

  const context = [ // Build context sections.
    formatSection("Identity", identity), // Identity section.
    formatSection("Style", style), // Style section.
    backgroundFacts ? `## Background Facts\n${backgroundFacts}\n` : "", // Background facts section.
    virtuesSection, // Character virtues section (formatted for readability).
    teachingGuidanceSection, // Teaching guidance section.
    coachLinesSection, // Coach lines section.
    quotesSection, // Quotes section.
    dailyMissionsSection, // Daily missions section.
  ].filter(Boolean).join("\n"); // Join sections.

  return { context, guardrails, characterId, characterName }; // Return result.
} 
