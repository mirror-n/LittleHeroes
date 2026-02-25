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
function resolveCharacterDir(slug: string, language: string): string {
  const hyphenated = slug;
  const underscored = slug.replace(/-/g, '_');
  const langFile = `identity.${language}.json`;
  const plainFile = 'identity.json';

  const candidates: string[] = [];

  if (fs.existsSync(path.join(RAG_BASE, hyphenated))) candidates.push(hyphenated);
  if (underscored !== hyphenated && fs.existsSync(path.join(RAG_BASE, underscored))) candidates.push(underscored);

  if (candidates.length === 0) {
    const dirs = fs.readdirSync(RAG_BASE);
    const normalized = slug.replace(/-/g, '').toLowerCase();
    const match = dirs.find(d => d.replace(/[-_]/g, '').toLowerCase() === normalized);
    if (match) candidates.push(match);
  }

  if (candidates.length === 0) {
    throw new Error(`Character directory not found for slug: ${slug}`);
  }

  for (const dir of candidates) {
    if (fs.existsSync(path.join(RAG_BASE, dir, langFile))) {
      return dir;
    }
  }

  for (const dir of candidates) {
    if (fs.existsSync(path.join(RAG_BASE, dir, plainFile))) {
      return dir;
    }
  }

  return candidates[0];
}

// Safely load a JSON file, trying language-specific first, then plain fallback
function loadRagJson(charPath: string, baseName: string, language: string): any {
  const langPath = path.join(charPath, `${baseName}.${language}.json`);
  if (fs.existsSync(langPath)) {
    return loadJsonFile(langPath);
  }
  const plainPath = path.join(charPath, `${baseName}.json`);
  if (fs.existsSync(plainPath)) {
    return loadJsonFile(plainPath);
  }
  throw new Error(`RAG file not found: ${baseName} for language ${language} in ${charPath}`);
}

export function loadPipelineInputs(characterSlug: string, userMessage: string, language: string): PipelineInput {
  const charDir = resolveCharacterDir(characterSlug, language);
  const charPath = path.join(RAG_BASE, charDir);

  const systemPrompt = loadTextFile(path.join(PROMPTS_BASE, 'system.txt'));
  const characterPromptTemplate = loadTextFile(path.join(PROMPTS_BASE, 'character.txt'));
  const answerPromptTemplate = loadTextFile(path.join(PROMPTS_BASE, 'answer_with_rag.txt'));
  const refusalText = loadTextFile(path.join(PROMPTS_BASE, 'refusal.txt'));

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
    'who are you', 'introduce yourself', 'what is your name', 'what\'s your name',
    'tell me about yourself', 'who is this', 'what are you', 'your name',
    'hi, who', 'hello, who', 'hi who', 'hello who',
    '누구', '자기소개', '이름이 뭐', '너 뭐야', '넌 뭐야', '넌 누구',
    '소개해', '자기 소개', '이름 알려', '이름을 알려', '이름 뭐',
    '안녕 누구', '너는 누구', '당신은 누구', '넌 누구야',
  ];
  return introPatterns.some(pattern => lowerMsg.includes(pattern));
}

// Detect emotional content in user message
function detectEmotion(message: string): string | null {
  const lowerMsg = message.toLowerCase();
  const emotions: Record<string, string[]> = {
    sad: ['슬퍼', '슬프', '울었', '속상', '힘들', '외로', '무서', '걱정', 'sad', 'cry', 'upset', 'lonely', 'scared', 'worried', 'afraid', '망했', '실패', '못해', '싫어', '짜증', 'hate', 'fail', 'can\'t'],
    excited: ['신나', '좋아', '재밌', '대박', '최고', '멋져', '멋진', 'excited', 'awesome', 'cool', 'amazing', 'love', 'great', 'fun', 'best', '행복', 'happy'],
    curious: ['궁금', '왜', '어떻게', '뭐야', '알려', 'why', 'how', 'what', 'curious', 'wonder', '신기', '어디'],
    silly: ['ㅋㅋ', 'ㅎㅎ', 'haha', 'lol', '웃겨', '장난', 'funny', 'silly', 'joke', '바보'],
  };
  for (const [emotion, keywords] of Object.entries(emotions)) {
    if (keywords.some(k => lowerMsg.includes(k))) return emotion;
  }
  return null;
}

// Pick a random dialogue example that matches the emotional context
function pickDialogueExample(childInteraction: any, emotion: string | null): string {
  if (!childInteraction || !childInteraction.dialogue_examples) return '';
  
  const examples = childInteraction.dialogue_examples;
  if (examples.length === 0) return '';
  
  // Pick a random example to add variety
  const idx = Math.floor(Math.random() * examples.length);
  const ex = examples[idx];
  return `\n[Example of how you talk]\nChild: "${ex.child}"\nYou: "${ex.response}"`;
}

// Retrieve relevant context based on user message — with variety and child_interaction
export function retrieveRelevantContext(identity: any, userMessage: string): string {
  const childInteraction = identity.child_interaction || null;
  const emotion = detectEmotion(userMessage);

  // Build personality context from child_interaction
  let personalityContext = '';
  if (childInteraction) {
    personalityContext += `\n[Your Personality as a Friend]\n${childInteraction.personality_as_friend || ''}`;
    
    // Add a random fun quirk (not all — to keep it fresh)
    if (childInteraction.fun_quirks && childInteraction.fun_quirks.length > 0) {
      const quirk = childInteraction.fun_quirks[Math.floor(Math.random() * childInteraction.fun_quirks.length)];
      personalityContext += `\n[Fun quirk to show]: ${quirk}`;
    }
    
    // Add a random vulnerable moment (to make character relatable)
    if (childInteraction.vulnerable_moments && childInteraction.vulnerable_moments.length > 0) {
      const vuln = childInteraction.vulnerable_moments[Math.floor(Math.random() * childInteraction.vulnerable_moments.length)];
      personalityContext += `\n[A vulnerable memory you can share if relevant]: ${vuln}`;
    }
    
    // Add a random question to ask the kid (for conversation flow)
    if (childInteraction.topics_i_love_asking_kids_about && childInteraction.topics_i_love_asking_kids_about.length > 0) {
      const topic = childInteraction.topics_i_love_asking_kids_about[Math.floor(Math.random() * childInteraction.topics_i_love_asking_kids_about.length)];
      personalityContext += `\n[A question you might ask]: ${topic}`;
    }
    
    // Add a dialogue example for tone reference
    personalityContext += pickDialogueExample(childInteraction, emotion);
  }

  // If this is an introduction question, return character's basic info
  if (isIntroductionQuestion(userMessage)) {
    const char = identity.character;
    const nickname = char.nickname || char.name;
    const virtue = char.iconic_virtue;
    const background = char.background_summary || '';
    const firstEpisode = identity.episodes && identity.episodes[0]
      ? `[First memory: ${identity.episodes[0].title}]\n${identity.episodes[0].story?.substring(0, 200)}...`
      : '';

    return `[Character Introduction]\nName: ${char.name}\nNickname: ${nickname}\nVirtue: ${virtue}\nBackground: ${background}\n${firstEpisode}${personalityContext}`;
  }

  // Emotion-aware response hint
  let emotionHint = '';
  if (emotion === 'sad') {
    emotionHint = '\n[EMOTION DETECTED: The child seems sad or struggling. Respond with empathy FIRST before anything else. Be gentle and understanding.]';
  } else if (emotion === 'excited') {
    emotionHint = '\n[EMOTION DETECTED: The child is excited! Match their energy and be enthusiastic WITH them!]';
  } else if (emotion === 'curious') {
    emotionHint = '\n[EMOTION DETECTED: The child is curious! Wonder together with them and explore the question as a team.]';
  } else if (emotion === 'silly') {
    emotionHint = '\n[EMOTION DETECTED: The child is being playful/silly! Be silly and fun together!]';
  }

  const episodes = identity.episodes || [];
  const msg = userMessage.toLowerCase();

  // Keyword matching for relevant episodes
  const relevant = episodes.filter((ep: any) => {
    const combined = `${ep.title || ''} ${ep.story || ''} ${ep.fact || ''} ${ep.value || ''} ${ep.quote || ''}`.toLowerCase();
    const words = msg.split(/\s+/).filter((w: string) => w.length > 1);
    return words.some((w: string) => combined.includes(w));
  });

  let episodeContext = '';
  if (relevant.length > 0) {
    // Pick up to 2 relevant episodes, but RANDOMIZE order to avoid always picking the same ones
    const shuffled = relevant.sort(() => Math.random() - 0.5);
    episodeContext = shuffled.slice(0, 2).map((ep: any) =>
      `[Episode: ${ep.title}]\nStory: ${ep.story}\nFact: ${ep.fact}\nQuote: "${ep.quote}"\nValue: ${ep.value}`
    ).join('\n\n');
  } else {
    // No keyword match — pick 2 RANDOM episodes (not always the first 2!)
    const shuffled = [...episodes].sort(() => Math.random() - 0.5);
    episodeContext = shuffled.slice(0, 2).map((ep: any) =>
      `[Episode: ${ep.title}]\nStory: ${ep.story}\nFact: ${ep.fact}\nQuote: "${ep.quote}"\nValue: ${ep.value}`
    ).join('\n\n');
  }

  return `${episodeContext}${personalityContext}${emotionHint}`;
}
