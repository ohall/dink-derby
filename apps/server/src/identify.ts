import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'catch-photos';

const storage = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage
  : undefined;

const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
const visionModel = process.env.OPENROUTER_VISION_MODEL || 'google/gemini-2.5-flash';
const apiUrl = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';

export type IdentifyResult = {
  isFish: boolean;
  species?: string;
  guessLengthInInches?: number;
  guessWeightInPounds?: number;
  confidence?: 'low' | 'medium' | 'high';
  reason?: string;
};

export function isIdentifyConfigured() {
  return Boolean(storage && openRouterKey);
}

async function imageToBase64(imagePath: string) {
  if (!storage) throw new Error('Storage is not configured for fish identification.');
  const { data, error } = await storage.from(bucket).download(imagePath);
  if (error || !data) throw new Error(`Could not load photo for identification: ${error?.message ?? 'unknown'}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

export async function identifyCatch(imagePath: string): Promise<IdentifyResult> {
  if (!openRouterKey) throw new Error('OpenRouter fish ID is not configured on the server.');

  const imageDataUrl = await imageToBase64(imagePath);

  const body = {
    model: visionModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Look at this photo. Decide whether the subject is a fish. If yes, guess the species and estimate length and weight. If not a fish, say isFish=false and explain why. Always reply with the required JSON only, no more text.',
          },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'catch_identification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            isFish: { type: 'boolean' },
            species: { type: 'string' },
            guessLengthInInches: { type: 'number' },
            guessWeightInPounds: { type: 'number' },
            confidence: { enum: ['low', 'medium', 'high'] },
            reason: { type: 'string' },
          },
          required: ['isFish'],
          additionalProperties: false,
        },
      },
    },
    max_tokens: 500,
    temperature: 0.2,
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://dinkderby.com',
      'X-OpenRouter-Title': 'Dink Derby',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const failure = await response.text().catch(() => '');
    throw new Error(`OpenRouter returned ${response.status}: ${failure || response.statusText}`);
  }

  const json = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned no fish verdict.');

  const parsed = JSON.parse(content) as IdentifyResult;
  return parsed;
}

export { bucket };
