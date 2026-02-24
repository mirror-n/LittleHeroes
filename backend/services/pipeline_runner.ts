import * as fs from 'fs';
import * as path from 'path';

const RAG_BASE = path.resolve(__dirname, '../../ai/primary-rag');
const PROMPTS_BASE = path.resolve(__dirname, '../../ai/prompts');

export interface PipelineInput {
  language: string;
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

// Map character slug (URL format) to the best directory name for the given language.
// Some characters have two directories (hyphen and underscore versions) with different file sets.
// The hyphen version may only have plain .json files, while the underscore version has .ko.json / .en.json.
function resolveCharacterDir(slug: string, language: string): string {
  const hyphenated = slug;                          // e.g., "leonardo-da-vinci"
  const underscored = slug.replace(/-/g, '_');      // e.g., "leonardo_da_vinci"
  const langFile = `identity.${language}.json`;     // e.g., "identity.ko.json"
  const plainFile = 'identity.json';

  // Candidate directories in priority order
  const candidates: string[] = [];

  // Add exact slug if it exists
  if (fs.existsSync(path.join(RAG_BASE, hyphenated))) candidates.push(hyphenated);
  // Add underscore version if different and exists
  if (underscored !== hyphenated && fs.existsSync(path.join(RAG_BASE, underscored))) candidates.push(underscored);

  // If no candidates found, try partial match
  if (candidates.length === 0) {
    const dirs = fs.readdirSync(RAG_BASE);
    const normalized = slug.replace(/-/g, '').toLowerCase();
    const match = dirs.find(d => d.replace(/[-_]/g, '').toLowerCase() === normalized);
    if (match) candidates.push(match);
  }

  if (candidates.length === 0) {
    throw new Error(`Character directory not found for slug: ${slug}`);
  }

  // Prefer the directory that has the language-specific file (e.g., identity.ko.json)
  for (const dir of candidates) {
    if (fs.existsSync(path.join(RAG_BASE, dir, langFile))) {
      return dir;
    }
  }

  // Fallback: prefer the directory that has the plain file (identity.json)
  for (const dir of candidates) {
    if (fs.existsSync(path.join(RAG_BASE, dir, plainFile))) {
      return dir;
    }
  }

  // Last resort: return first candidate
  return candidates[0];
}

// Safely load a JSON file, trying language-specific first, then plain fallback
function loadRagJson(charPath: string, baseName: string, language: string): any {
  const langPath = path.join(charPath, `${baseName}.${language}.json`);
  if (fs.existsSync(langPath)) {
    return loadJsonFile(langPath);
  }
  // Fallback to plain .json
  const plainPath = path.join(charPath, `${baseName}.json`);
  if (fs.existsSync(plainPath)) {
    return loadJsonFile(plainPath);
  }
  throw new Error(`RAG file not found: ${baseName} for language ${language} in ${charPath}`);
}

export function loadPipelineInputs(characterSlug: string, userMessage: string, language: string): PipelineInput {
  const charDir = resolveCharacterDir(characterSlug, language);
  const charPath = path.join(RAG_BASE, charDir);

  // Load prompt templates
  const systemPrompt = loadTextFile(path.join(PROMPTS_BASE, 'system.txt'));
  const characterPromptTemplate = loadTextFile(path.join(PROMPTS_BASE, 'character.txt'));
  const answerPromptTemplate = loadTextFile(path.join(PROMPTS_BASE, 'answer_with_rag.txt'));
  const refusalText = loadTextFile(path.join(PROMPTS_BASE, 'refusal.txt'));

  // Load RAG data based on language (with fallback to plain .json)
  const identity = loadRagJson(charPath, 'identity', language);
  const style = loadRagJson(charPath, 'style', language);
  const guardrails = loadRagJson(charPath, 'guardrails', language);

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
    language,
  };
}

// Detect if the user is asking an introduction/identity question
function isIntroductionQuestion(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  const introPatterns = [
    // English patterns
    'who are you', 'introduce yourself', 'what is your name', 'what\'s your name',
    'tell me about yourself', 'who is this', 'what are you', 'your name',
    'hi, who', 'hello, who', 'hi who', 'hello who',
    // Korean patterns
    '누구', '자기소개', '이름이 뭐', '너 뭐야', '넌 뭐야', '넌 누구',
    '소개해', '자기 소개', '이름 알려', '이름을 알려', '이름 뭐',
    '안녕 누구', '너는 누구', '당신은 누구', '넌 누구야',
  ];
  return introPatterns.some(pattern => lowerMsg.includes(pattern));
}

// Retrieve relevant context based on user message
export function retrieveRelevantContext(identity: any, userMessage: string): string {
  // If this is an introduction question, return character's basic info directly
  if (isIntroductionQuestion(userMessage)) {
    const char = identity.character;
    const nickname = char.nickname || char.name;
    const virtue = char.iconic_virtue;
    const background = char.background_summary || '';
    const firstEpisode = identity.episodes && identity.episodes[0]
      ? `[First memory: ${identity.episodes[0].title}]\n${identity.episodes[0].story?.substring(0, 200)}...`
      : '';

    return `[Character Introduction]\nName: ${char.name}\nNickname: ${nickname}\nVirtue: ${virtue}\nBackground: ${background}\n${firstEpisode}`;
  }

  const episodes = identity.episodes || [];
  const msg = userMessage.toLowerCase();

  // Simple keyword matching for relevant episodes
  const relevant = episodes.filter((ep: any) => {
    const combined = `${ep.title || ''} ${ep.story || ''} ${ep.fact || ''} ${ep.value || ''} ${ep.quote || ''}`.toLowerCase();
    const words = msg.split(/\s+/).filter((w: string) => w.length > 1);
    return words.some((w: string) => combined.includes(w));
  });

  if (relevant.length > 0) {
    return relevant.slice(0, 2).map((ep: any) =>
      `[Episode: ${ep.title}]\nStory: ${ep.story}\nFact: ${ep.fact}\nQuote: "${ep.quote}"\nValue: ${ep.value}\nCoach: ${ep.coach_line}\nMission: ${ep.daily_mission}`
    ).join('\n\n');
  }

  // If no keyword match, return first 2 episodes as default context
  return episodes.slice(0, 2).map((ep: any) =>
    `[Episode: ${ep.title}]\nStory: ${ep.story}\nFact: ${ep.fact}\nQuote: "${ep.quote}"\nValue: ${ep.value}\nCoach: ${ep.coach_line}\nMission: ${ep.daily_mission}`
  ).join('\n\n');
}
