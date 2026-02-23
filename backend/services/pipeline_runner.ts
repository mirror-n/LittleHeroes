import * as fs from 'fs';
import * as path from 'path';

const RAG_BASE = path.resolve(__dirname, '../../ai/primary-rag');
const PROMPTS_BASE = path.resolve(__dirname, '../../ai/prompts');

export interface PipelineInput {
  systemPrompt: string;
  characterPrompt: string;
  answerPrompt: string;
  refusalText: string;
  identityContext: string;
  styleContext: string;
  guardrailsContext: string;
  characterName: string;
  iconicVirtue: string;
  userMessage: string;
}

function loadTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8').trim();
}

function loadJsonFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

// Map character slug (URL format) to directory name
function resolveCharacterDir(slug: string): string {
  // Try exact slug first (e.g., "abraham-lincoln")
  const exactPath = path.join(RAG_BASE, slug);
  if (fs.existsSync(exactPath)) return slug;

  // Try underscore version (e.g., "abraham_lincoln")
  const underscored = slug.replace(/-/g, '_');
  const underscorePath = path.join(RAG_BASE, underscored);
  if (fs.existsSync(underscorePath)) return underscored;

  // Try listing directories for partial match
  const dirs = fs.readdirSync(RAG_BASE);
  const normalized = slug.replace(/-/g, '').toLowerCase();
  const match = dirs.find(d => d.replace(/[-_]/g, '').toLowerCase() === normalized);
  if (match) return match;

  throw new Error(`Character directory not found for slug: ${slug}`);
}

export function loadPipelineInputs(characterSlug: string, userMessage: string): PipelineInput {
  const charDir = resolveCharacterDir(characterSlug);
  const charPath = path.join(RAG_BASE, charDir);

  // Load prompt templates
  const systemPrompt = loadTextFile(path.join(PROMPTS_BASE, 'system.txt'));
  const characterPromptTemplate = loadTextFile(path.join(PROMPTS_BASE, 'character.txt'));
  const answerPromptTemplate = loadTextFile(path.join(PROMPTS_BASE, 'answer_with_rag.txt'));
  const refusalText = loadTextFile(path.join(PROMPTS_BASE, 'refusal.txt'));

  // Load RAG data
  const identity = loadJsonFile(path.join(charPath, 'identity.json'));
  const style = loadJsonFile(path.join(charPath, 'style.json'));
  const guardrails = loadJsonFile(path.join(charPath, 'guardrails.json'));

  const characterName = identity.character.name;
  const iconicVirtue = identity.character.iconic_virtue;

  // Build context strings
  const identityContext = JSON.stringify(identity, null, 2);
  const styleContext = JSON.stringify(style, null, 2);
  const guardrailsContext = JSON.stringify(guardrails, null, 2);

  // Fill character prompt template
  const characterPrompt = characterPromptTemplate
    .replace(/\{\{character_name\}\}/g, characterName)
    .replace(/\{\{iconic_virtue\}\}/g, iconicVirtue)
    .replace(/\{\{identity_context\}\}/g, identityContext)
    .replace(/\{\{style_context\}\}/g, styleContext);

  return {
    systemPrompt,
    characterPrompt,
    answerPrompt: answerPromptTemplate,
    refusalText,
    identityContext,
    styleContext,
    guardrailsContext,
    characterName,
    iconicVirtue,
    userMessage,
  };
}

// Retrieve relevant episodes based on user message
export function retrieveRelevantContext(identity: any, userMessage: string): string {
  const episodes = identity.episodes || [];
  const msg = userMessage.toLowerCase();

  // Simple keyword matching for relevant episodes
  const relevant = episodes.filter((ep: any) => {
    const combined = `${ep.title} ${ep.story} ${ep.fact} ${ep.value} ${ep.quote}`.toLowerCase();
    const words = msg.split(/\s+/).filter((w: string) => w.length > 1);
    return words.some((w: string) => combined.includes(w));
  });

  if (relevant.length > 0) {
    return relevant.map((ep: any) =>
      `[에피소드: ${ep.title}]\n이야기: ${ep.story}\n사실: ${ep.fact}\n명언: "${ep.quote}"\n가치: ${ep.value}\n코칭: ${ep.coach_line}\n미션: ${ep.daily_mission}`
    ).join('\n\n');
  }

  // If no keyword match, return first 2 episodes as default context
  return episodes.slice(0, 2).map((ep: any) =>
    `[에피소드: ${ep.title}]\n이야기: ${ep.story}\n사실: ${ep.fact}\n명언: "${ep.quote}"\n가치: ${ep.value}\n코칭: ${ep.coach_line}\n미션: ${ep.daily_mission}`
  ).join('\n\n');
}
