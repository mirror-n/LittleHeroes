import { PipelineInput } from './pipeline_runner';
import { AIResponse, parseAIResponse } from './openai_client';

// Read env vars lazily
function getGeminiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'],
  };
}

export async function callGemini(input: PipelineInput, context: string): Promise<AIResponse> {
  const { apiKey: GEMINI_API_KEY, models: GEMINI_MODELS } = getGeminiConfig();
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  // Build language instruction based on selected language
  const langInstruction = input.language === 'ko'
    ? '\n\nIMPORTANT: Respond in Korean using 반말 (casual speech). Do NOT use 존댓말.'
    : '\n\nIMPORTANT: Respond in casual, friendly English suitable for kids.';

  // Suggested replies instruction (same as OpenAI)
  const suggestedRepliesInstruction = input.language === 'ko'
    ? `\n\nRESPONSE FORMAT: You MUST respond in valid JSON with exactly this structure:
{"answer": "your reply here", "suggestedReplies": ["option1", "option2", "option3"]}
- "answer": Your conversational reply (2-3 sentences, casual 반말)
- "suggestedReplies": Exactly 3 short follow-up questions or responses the child might want to say next (each under 20 characters, in Korean 반말)
- Make suggested replies fun, curious, and varied
- Do NOT include any text outside the JSON object.`
    : `\n\nRESPONSE FORMAT: You MUST respond in valid JSON with exactly this structure:
{"answer": "your reply here", "suggestedReplies": ["option1", "option2", "option3"]}
- "answer": Your conversational reply (2-3 sentences, casual friendly English)
- "suggestedReplies": Exactly 3 short follow-up questions or responses the child might want to say next (each under 30 characters)
- Make suggested replies fun, curious, and varied
- Do NOT include any text outside the JSON object.`;

  const systemInstruction = `${input.systemPrompt}\n\n${input.characterPrompt}\n\nSafety Guardrails:\n${input.guardrailsContext}${langInstruction}${suggestedRepliesInstruction}`;
  const userContent = input.answerPrompt
    .replace('{{context}}', context)
    .replace('{{question}}', input.userMessage);

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 400,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini ${model} error: ${response.status} - ${errorText}`);
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return parseAIResponse(text);
    } catch (err) {
      console.error(`Gemini ${model} failed:`, err);
      continue;
    }
  }

  throw new Error('All Gemini models failed');
}
