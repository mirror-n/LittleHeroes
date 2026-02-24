import { PipelineInput } from './pipeline_runner';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];

export async function callGemini(input: PipelineInput, context: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  // Build language instruction based on selected language
  const langInstruction = input.language === 'ko'
    ? '\n\nIMPORTANT: Respond in Korean using 반말 (casual speech). Do NOT use 존댓말.'
    : '\n\nIMPORTANT: Respond in casual, friendly English suitable for kids.';

  const systemInstruction = `${input.systemPrompt}\n\n${input.characterPrompt}\n\nSafety Guardrails:\n${input.guardrailsContext}${langInstruction}`;
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
            maxOutputTokens: 300,
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
      if (text) return text;
    } catch (err) {
      console.error(`Gemini ${model} failed:`, err);
      continue;
    }
  }

  throw new Error('All Gemini models failed');
}
