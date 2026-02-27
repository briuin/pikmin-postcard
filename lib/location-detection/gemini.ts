import { locationResultSchema } from '@/lib/location-schema';
import { getGeminiEnv } from '@/lib/env';

export type GeminiLocationResult = {
  latitude: number;
  longitude: number;
  confidence: number;
  place_guess: string;
};

export type GeminiDetectionSuccess = {
  location: GeminiLocationResult;
  modelVersion: string;
};

export type GeminiTextResult = {
  text: string;
  modelVersion: string;
};

type GenerateGeminiTextParams = {
  mimeType: string;
  fileBytes: Buffer;
  prompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
};

export function extractJsonObject(rawText: string): string {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return rawText.slice(start, end + 1);
  }

  throw new Error('Model output did not contain a JSON object.');
}

export async function generateGeminiText(params: GenerateGeminiTextParams): Promise<GeminiTextResult> {
  const geminiEnv = getGeminiEnv();
  const base64Image = params.fileBytes.toString('base64');
  const modelsToTry = Array.from(
    new Set([geminiEnv.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])
  );

  let lastError: Error | null = null;

  for (let i = 0; i < modelsToTry.length; i += 1) {
    const model = modelsToTry[i] as string;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiEnv.GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: params.prompt },
                {
                  inlineData: {
                    mimeType: params.mimeType,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: params.responseMimeType ?? 'application/json'
          }
        })
      }
    );

    if (response.ok) {
      const json = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const modelText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!modelText) {
        throw new Error('Gemini response did not include text output.');
      }

      return {
        text: modelText,
        modelVersion: model
      };
    }

    const errorBody = await response.text();
    const shouldTryNextModel = response.status === 404 && i < modelsToTry.length - 1;

    if (shouldTryNextModel) {
      console.warn('Gemini model unavailable, trying fallback model', {
        model,
        responseStatus: response.status
      });
      continue;
    }

    lastError = new Error(`Gemini request failed: ${errorBody}`);
    break;
  }

  throw lastError ?? new Error('Gemini request failed with unknown error.');
}

export async function detectWithGemini(mimeType: string, fileBytes: Buffer): Promise<GeminiDetectionSuccess> {
  const prompt = [
    'You are a geolocation inference model for postcard photos.',
    'Estimate where this photo was likely taken and return only strict JSON.',
    'Schema:',
    '{',
    '  "latitude": number (-90 to 90),',
    '  "longitude": number (-180 to 180),',
    '  "confidence": number (0 to 1),',
    '  "place_guess": string',
    '}',
    'No markdown, no explanation.'
  ].join('\n');

  const result = await generateGeminiText({
    mimeType,
    fileBytes,
    prompt,
    responseMimeType: 'application/json'
  });

  const parsedJsonText = extractJsonObject(result.text);
  return {
    location: locationResultSchema.parse(JSON.parse(parsedJsonText)),
    modelVersion: result.modelVersion
  };
}
