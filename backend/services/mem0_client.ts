/**
 * Mem0 Long-Term Memory Client
 * 
 * Provides memory search and storage capabilities for personalized
 * conversations between children and AI characters.
 * 
 * Uses Mem0 Platform API:
 * - Add: POST /v1/memories/ (with user_id in body)
 * - Search: POST /v2/memories/search/ (with filters)
 * - Get All: GET /v1/memories/ (with filters)
 */

const MEM0_API_BASE = 'https://api.mem0.ai';

// Read API key lazily so it picks up .env values loaded by server.ts
function getMem0ApiKey(): string {
  return process.env.MEM0_API_KEY || '';
}

interface Mem0Memory {
  id: string;
  memory: string;
  user_id: string;
  score?: number;
  created_at?: string;
  updated_at?: string;
}

interface Mem0SearchResult {
  results: Mem0Memory[];
}

/**
 * Search for relevant memories for a given user and query.
 * Uses v2 search endpoint which requires filters.
 * Returns formatted memory context string for inclusion in AI prompts.
 */
export async function searchMemories(userId: string, query: string, limit: number = 5): Promise<string> {
  const apiKey = getMem0ApiKey();
  if (!apiKey) {
    console.warn('[Mem0] API key not set, skipping memory search');
    return '';
  }

  try {
    const response = await fetch(`${MEM0_API_BASE}/v2/memories/search/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        filters: { user_id: userId },
        limit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Mem0] Search error: ${response.status} - ${errorText}`);
      return '';
    }

    const rawData = await response.json();
    
    // API may return { results: [...] } or directly [...]
    const memories: Mem0Memory[] = Array.isArray(rawData) ? rawData : (rawData.results || []);
    
    console.log(`[Mem0] Search returned ${memories.length} memories`);
    
    if (memories.length === 0) {
      return '';
    }

    // Format memories into a readable context string
    const memoryLines = memories
      .filter(m => !m.score || m.score >= 0.3) // Include memories with decent relevance
      .map(m => `- ${m.memory}`)
      .join('\n');

    if (!memoryLines) return '';

    return memoryLines;
  } catch (error) {
    console.error('[Mem0] Search failed:', error);
    return '';
  }
}

/**
 * Store a conversation exchange as a memory for the given user.
 * Uses v1 add endpoint with user_id in the request body.
 * This runs asynchronously (fire-and-forget) to not block the response.
 */
export async function addMemory(
  userId: string,
  userMessage: string,
  assistantMessage: string,
  metadata?: Record<string, string>
): Promise<void> {
  const apiKey = getMem0ApiKey();
  if (!apiKey) {
    console.warn('[Mem0] API key not set, skipping memory storage');
    return;
  }

  try {
    const messages = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantMessage },
    ];

    const body: any = {
      messages,
      user_id: userId,
      version: 'v2',
    };

    if (metadata) {
      body.metadata = metadata;
    }

    const response = await fetch(`${MEM0_API_BASE}/v1/memories/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Mem0] Add memory error: ${response.status} - ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log(`[Mem0] Memory stored for user ${userId}:`, JSON.stringify(data).substring(0, 200));
  } catch (error) {
    console.error('[Mem0] Add memory failed:', error);
  }
}

/**
 * Build a composite Mem0 user ID that combines the character and browser user.
 * This ensures memories are separated per character per user.
 * Format: "char_{characterSlug}_user_{browserId}"
 */
export function buildMem0UserId(characterSlug: string, browserId: string): string {
  // Sanitize inputs
  const safeChar = characterSlug.replace(/[^a-z0-9-]/gi, '').substring(0, 50);
  const safeUser = browserId.replace(/[^a-z0-9-]/gi, '').substring(0, 50);
  return `char_${safeChar}_user_${safeUser}`;
}
