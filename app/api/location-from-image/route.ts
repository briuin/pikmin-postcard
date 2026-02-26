import { NextResponse } from 'next/server';
import { locationResultSchema } from '@/lib/location-schema';
import { geminiEnv } from '@/lib/env';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function extractJsonObject(rawText: string): string {
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

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('image');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'Image exceeds max size of 8MB.' },
      { status: 400 }
    );
  }

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const base64Image = fileBuffer.toString('base64');

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiEnv.GEMINI_MODEL}:generateContent?key=${geminiEnv.GOOGLE_GENERATIVE_AI_API_KEY}`,
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
                { text: prompt },
                {
                  inlineData: {
                    mimeType: file.type,
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return NextResponse.json(
        {
          error: 'Gemini request failed.',
          details: errorBody
        },
        { status: 502 }
      );
    }

    const json = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const modelText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!modelText) {
      return NextResponse.json(
        { error: 'Gemini response did not include text output.' },
        { status: 502 }
      );
    }

    const parsedJsonText = extractJsonObject(modelText);
    const parsed = locationResultSchema.parse(JSON.parse(parsedJsonText));

    return NextResponse.json(parsed, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to detect location from image.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
