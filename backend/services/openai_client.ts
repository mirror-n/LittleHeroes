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

export async function callOpenAI(input: PipelineInput, context: string): Promise<string> {
  const { apiKey: OPENAI_API_KEY, model: OPENAI_MODEL, baseUrl: OPENAI_BASE_URL } = getOpenAIConfig();
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  // Build language instruction based on selected language
  const langInstruction = input.language === 'ko'
    ? '\n\nIMPORTANT: Respond in Korean using 반말 (casual speech). Do NOT use 존댓말.'
    : '\n\nIMPORTANT: Respond in casual, friendly English suitable for kids.';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${input.systemPrompt}\n\n${input.characterPrompt}\n\nSafety Guardrails:\n${input.guardrailsContext}${langInstruction}`
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
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
