import { z } from 'zod';

const geminiEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash')
});

export const geminiEnv = geminiEnvSchema.parse({
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL
});
