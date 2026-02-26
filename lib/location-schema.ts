import { z } from 'zod';

export const locationResultSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1),
  place_guess: z.string().min(1).max(160)
});

export type LocationResult = z.infer<typeof locationResultSchema>;
