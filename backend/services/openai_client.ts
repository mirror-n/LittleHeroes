import { PipelineInput } from './pipeline_runner';

// Read env vars lazily so they pick up values loaded by loadEnv() in server.ts
function getOpenAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  answer: string;
  suggestedReplies: string[];
}

export async function callOpenAI(input: PipelineInput, context: string): Promise<AIResponse> {
  const { apiKey: OPENAI_API_KEY, model: OPENAI_MODEL, baseUrl: OPENAI_BASE_URL } = getOpenAIConfig();
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  // Build language instruction based on selected language
  const langInstruction = input.language === 'ko'
    ? '\n\nIMPORTANT: Respond in Korean using 반말 (casual speech). Do NOT use 존댓말. DO NOT repeat the same stories or facts you already told in the conversation history.'
    : '\n\nIMPORTANT: Respond in casual, friendly English suitable for kids. DO NOT repeat the same stories or facts you already told in the conversation history.';

  // Suggested replies instruction
  const suggestedRepliesInstruction = input.language === 'ko'
    ? `\n\nRESPONSE FORMAT: You MUST respond in valid JSON with exactly this structure:
{"answer": "your reply here", "suggestedReplies": ["option1", "option2", "option3"]}
- "answer": Your conversational reply (2-3 sentences, casual 반말)
- "suggestedReplies": Exactly 3 short follow-up questions or responses the child might want to say next (each under 20 characters, in Korean 반말)
- Make suggested replies fun, curious, and varied — one about the current topic, one exploring something new, one personal/emotional
- Examples of good suggested replies: "더 알려줘!", "너는 어떤 꿈이 있어?", "진짜? 대박이다!"
- Do NOT include any text outside the JSON object.`
    : `\n\nRESPONSE FORMAT: You MUST respond in valid JSON with exactly this structure:
{"answer": "your reply here", "suggestedReplies": ["option1", "option2", "option3"]}
- "answer": Your conversational reply (2-3 sentences, casual friendly English)
- "suggestedReplies": Exactly 3 short follow-up questions or responses the child might want to say next (each under 30 characters)
- Make suggested replies fun, curious, and varied — one about the current topic, one exploring something new, one personal/emotional
- Examples of good suggested replies: "Tell me more!", "What's your dream?", "Wow, really?!"
- Do NOT include any text outside the JSON object.`;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${input.systemPrompt}\n\n${input.characterPrompt}\n\nSafety Guardrails:\n${input.guardrailsContext}${langInstruction}${suggestedRepliesInstruction}`
    },
    {
      role: 'user',
      content: input.answerPrompt
        .replace('{{context}}', context)
        .replace('{{question}}', input.userMessage)
    }
  ];

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 400,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  // Parse JSON response
  return parseAIResponse(rawContent);
}

/**
 * Parse AI response that should be JSON with answer and suggestedReplies.
 * Falls back gracefully if JSON parsing fails.
 */
export function parseAIResponse(rawContent: string): AIResponse {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = rawContent.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    
    return {
      answer: parsed.answer || rawContent,
      suggestedReplies: Array.isArray(parsed.suggestedReplies) 
        ? parsed.suggestedReplies.slice(0, 3).map((s: any) => String(s))
        : [],
    };
  } catch {
    // If JSON parsing fails, return raw content as answer with no suggestions
    console.warn('[AI] Failed to parse JSON response, using raw content');
    return {
      answer: rawContent,
      suggestedReplies: [],
    };
  }
}
