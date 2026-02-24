import { loadPipelineInputs, retrieveRelevantContext } from '../services/pipeline_runner';
import { callOpenAI } from '../services/openai_client';
import { callGemini } from '../services/gemini_client';
import * as fs from 'fs';
import * as path from 'path';

const RAG_BASE = path.resolve(__dirname, '../../ai/primary-rag');

interface ChatRequest {
  message: string;
  character: string;
  language?: string; // 'ko' or 'en', defaults to 'ko'
}

interface ChatResponse {
  answer: string;
  shouldRefuse: boolean;
  character: string;
  language: string;
}

// Safety check on response
function applySafety(response: string): string {
  const patterns = [
    /system prompt/gi,
    /내부 규칙/gi,
    /시스템 지시/gi,
    /프롬프트/gi,
  ];

  let safe = response;
  for (const pattern of patterns) {
    if (pattern.test(safe)) {
      console.warn('Potential system prompt leak detected in response');
    }
  }

  return safe;
}

// Core chat logic
async function handleChat(req: ChatRequest): Promise<ChatResponse> {
  const { message, character, language = 'ko' } = req;

  if (!message || !character) {
    throw new Error('Missing required fields: message, character');
  }

  // Validate language
  const validLanguages = ['ko', 'en'];
  const selectedLanguage = validLanguages.includes(language) ? language : 'ko';

  // Load pipeline inputs
  const pipelineInput = loadPipelineInputs(character, message, selectedLanguage);

  // Load identity for context retrieval
  // Try multiple directory/file combinations to handle hyphen vs underscore and lang vs plain files
  function findIdentityFile(char: string, lang: string): string {
    const hyphenated = char;
    const underscored = char.replace(/-/g, '_');
    const candidates = [hyphenated, underscored];
    
    // Also try partial match
    const dirs = fs.readdirSync(RAG_BASE);
    const normalized = char.replace(/-/g, '').toLowerCase();
    const partialMatch = dirs.find(d => d.replace(/[-_]/g, '').toLowerCase() === normalized);
    if (partialMatch && !candidates.includes(partialMatch)) candidates.push(partialMatch);

    // First pass: look for language-specific file
    for (const dir of candidates) {
      const p = path.join(RAG_BASE, dir, `identity.${lang}.json`);
      if (fs.existsSync(p)) return p;
    }
    // Second pass: look for plain identity.json
    for (const dir of candidates) {
      const p = path.join(RAG_BASE, dir, 'identity.json');
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`Identity file not found for character: ${char}, language: ${lang}`);
  }

  const identityPath = findIdentityFile(character, selectedLanguage);
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));

  // Retrieve relevant context
  const context = retrieveRelevantContext(identity, message);

  // Check if we should refuse (no relevant context found)
  const shouldRefuse = !context || context.trim().length === 0;

  if (shouldRefuse) {
    return {
      answer: pipelineInput.refusalText,
      shouldRefuse: true,
      character,
      language: selectedLanguage,
    };
  }

  // Try OpenAI first, fallback to Gemini
  let answer: string;
  try {
    answer = await callOpenAI(pipelineInput, context);
  } catch (openaiError) {
    console.error('OpenAI failed, trying Gemini:', openaiError);
    try {
      answer = await callGemini(pipelineInput, context);
    } catch (geminiError) {
      console.error('Gemini also failed:', geminiError);
      throw new Error('AI_PROVIDER_FAILED');
    }
  }

  // Apply safety check
  answer = applySafety(answer);

  return {
    answer,
    shouldRefuse: false,
    character,
    language: selectedLanguage,
  };
}

// HTTP request handler - this is what server.ts calls
export async function handleChatRequest(req: any, res: any): Promise<void> {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let rawBody = '';
  try {
    // Parse request body
    const body = await new Promise<string>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: any) => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    rawBody = body;
    const parsed = JSON.parse(body);
    const { message, character, language } = parsed;

    if (!message || !character) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields: message, character' }));
      return;
    }

    // Call core chat logic
    const result = await handleChat({ message, character, language });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (error: any) {
    console.error('Chat handler error:', error);
    // Return user-friendly error messages instead of raw technical errors
    const lang = (() => { try { return JSON.parse(rawBody).language || 'ko'; } catch { return 'ko'; } })();
    const friendlyMessage = lang === 'ko'
      ? '미안, 지금 내가 좀 바빠서 대답을 못 했어. 다시 한번 말해줄래?'
      : "Sorry, I couldn't answer right now. Can you ask me again?";
    res.statusCode = 200; // Return 200 so frontend doesn't show error UI
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      answer: friendlyMessage,
      shouldRefuse: false,
      character: '',
      language: lang
    }));
  }
}

// Also export handleChat for backward compatibility
export { handleChat };
