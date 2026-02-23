import { loadPipelineInputs, retrieveRelevantContext } from '../services/pipeline_runner';
import { callOpenAI } from '../services/openai_client';
import { callGemini } from '../services/gemini_client';
import * as fs from 'fs';
import * as path from 'path';

const RAG_BASE = path.resolve(__dirname, '../../ai/primary-rag');

interface ChatRequest {
  message: string;
  character: string;
}

interface ChatResponse {
  answer: string;
  shouldRefuse: boolean;
  character: string;
}

// Safety check on response
function applySafety(response: string): string {
  // Remove any potential system prompt leaks
  const patterns = [
    /system prompt/gi,
    /내부 규칙/gi,
    /시스템 지시/gi,
    /프롬프트/gi,
  ];

  let safe = response;
  for (const pattern of patterns) {
    if (pattern.test(safe)) {
      // If response contains system-related terms, it might be leaking
      // For now, just log a warning
      console.warn('Potential system prompt leak detected in response');
    }
  }

  return safe;
}

export async function handleChat(req: ChatRequest): Promise<ChatResponse> {
  const { message, character } = req;

  if (!message || !character) {
    throw new Error('Missing required fields: message, character');
  }

  // Load pipeline inputs
  const pipelineInput = loadPipelineInputs(character, message);

  // Load identity for context retrieval
  const charDir = character.replace(/-/g, '_');
  let identityPath = path.join(RAG_BASE, character, 'identity.json');
  if (!fs.existsSync(identityPath)) {
    identityPath = path.join(RAG_BASE, charDir, 'identity.json');
  }
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
      throw new Error('Both AI providers failed');
    }
  }

  // Apply safety check
  answer = applySafety(answer);

  return {
    answer,
    shouldRefuse: false,
    character,
  };
}
