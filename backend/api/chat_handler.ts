import { loadPipelineInputs, retrieveRelevantContext } from '../services/pipeline_runner';
import { callOpenAI, AIResponse } from '../services/openai_client';
import { callGemini } from '../services/gemini_client';
import { searchMemories, addMemory, buildMem0UserId } from '../services/mem0_client';
import * as fs from 'fs';
import * as path from 'path';

const RAG_BASE = path.resolve(__dirname, '../../ai/primary-rag');

interface ChatRequest {
  message: string;
  character: string;
  language?: string; // 'ko' or 'en', defaults to 'ko'
  userId?: string;   // Browser-generated anonymous user ID
}

interface ChatResponse {
  answer: string;
  shouldRefuse: boolean;
  character: string;
  language: string;
  suggestedReplies: string[];
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
  const { message, character, language = 'ko', userId } = req;

  if (!message || !character) {
    throw new Error('Missing required fields: message, character');
  }

  // Validate language
  const validLanguages = ['ko', 'en'];
  const selectedLanguage = validLanguages.includes(language) ? language : 'ko';

  // Load pipeline inputs
  const pipelineInput = loadPipelineInputs(character, message, selectedLanguage);

  // Load identity for context retrieval
  function findIdentityFile(char: string, lang: string): string {
    const hyphenated = char;
    const underscored = char.replace(/-/g, '_');
    const candidates = [hyphenated, underscored];
    
    const dirs = fs.readdirSync(RAG_BASE);
    const normalized = char.replace(/-/g, '').toLowerCase();
    const partialMatch = dirs.find(d => d.replace(/[-_]/g, '').toLowerCase() === normalized);
    if (partialMatch && !candidates.includes(partialMatch)) candidates.push(partialMatch);

    for (const dir of candidates) {
      const p = path.join(RAG_BASE, dir, `identity.${lang}.json`);
      if (fs.existsSync(p)) return p;
    }
    for (const dir of candidates) {
      const p = path.join(RAG_BASE, dir, 'identity.json');
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`Identity file not found for character: ${char}, language: ${lang}`);
  }

  const identityPath = findIdentityFile(character, selectedLanguage);
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf-8'));

  // Retrieve relevant RAG context
  const context = retrieveRelevantContext(identity, message);

  // Check if we should refuse (no relevant context found)
  const shouldRefuse = !context || context.trim().length === 0;

  if (shouldRefuse) {
    // Even on refusal, provide suggested replies to keep conversation going
    const refusalSuggestions = selectedLanguage === 'ko'
      ? ['너에 대해 알려줘!', '어릴 때 어땠어?', '제일 좋아하는 게 뭐야?']
      : ['Tell me about yourself!', 'What were you like as a kid?', "What's your favorite thing?"];

    return {
      answer: pipelineInput.refusalText,
      shouldRefuse: true,
      character,
      language: selectedLanguage,
      suggestedReplies: refusalSuggestions,
    };
  }

  // ===== Mem0 Long-Term Memory Integration =====
  let memoryContext = '';
  let mem0UserId = '';

  if (userId) {
    mem0UserId = buildMem0UserId(character, userId);
    
    try {
      // Search for relevant memories about this user
      const memories = await searchMemories(mem0UserId, message);
      if (memories) {
        memoryContext = memories;
        console.log(`[Mem0] Found memories for ${mem0UserId}:`, memories.substring(0, 200));
      } else {
        console.log(`[Mem0] No memories found for ${mem0UserId}`);
      }
    } catch (err) {
      console.error('[Mem0] Memory search error (non-blocking):', err);
    }
  }

  // Build enhanced context with memory
  let enhancedContext = context;
  if (memoryContext) {
    const memoryLabel = selectedLanguage === 'ko'
      ? '이 친구에 대해 기억하고 있는 것들'
      : 'Things you remember about this friend';
    enhancedContext = `${context}\n\n[${memoryLabel}]\n${memoryContext}`;
  }
  // ===== End Mem0 Integration =====

  // Try OpenAI first, fallback to Gemini
  let aiResponse: AIResponse;
  try {
    aiResponse = await callOpenAI(pipelineInput, enhancedContext);
  } catch (openaiError) {
    console.error('OpenAI failed, trying Gemini:', openaiError);
    try {
      aiResponse = await callGemini(pipelineInput, enhancedContext);
    } catch (geminiError) {
      console.error('Gemini also failed:', geminiError);
      throw new Error('AI_PROVIDER_FAILED');
    }
  }

  // Apply safety check on the answer text
  const safeAnswer = applySafety(aiResponse.answer);

  // ===== Store conversation as memory (fire-and-forget) =====
  if (userId && mem0UserId) {
    addMemory(
      mem0UserId,
      message,
      safeAnswer,
      { character, language: selectedLanguage }
    ).catch(err => {
      console.error('[Mem0] Background memory storage failed:', err);
    });
  }
  // ===== End Memory Storage =====

  return {
    answer: safeAnswer,
    shouldRefuse: false,
    character,
    language: selectedLanguage,
    suggestedReplies: aiResponse.suggestedReplies,
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
    const { message, character, language, userId } = parsed;

    if (!message || !character) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields: message, character' }));
      return;
    }

    // Call core chat logic (now with userId for memory + suggested replies)
    const result = await handleChat({ message, character, language, userId });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (error: any) {
    console.error('Chat handler error:', error);
    const lang = (() => { try { return JSON.parse(rawBody).language || 'ko'; } catch { return 'ko'; } })();
    const friendlyMessage = lang === 'ko'
      ? '미안, 지금 내가 좀 바빠서 대답을 못 했어. 다시 한번 말해줄래?'
      : "Sorry, I couldn't answer right now. Can you ask me again?";
    const fallbackSuggestions = lang === 'ko'
      ? ['다시 물어볼게!', '다른 얘기 하자!', '너에 대해 알려줘!']
      : ['Let me ask again!', "Let's talk about something else!", 'Tell me about yourself!'];
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      answer: friendlyMessage,
      shouldRefuse: false,
      character: '',
      language: lang,
      suggestedReplies: fallbackSuggestions,
    }));
  }
}

// Also export handleChat for backward compatibility
export { handleChat };
