import { z } from 'zod';

export const RegistrationStatusSchema = z.enum([
  'open',
  'approval_required',
  'waitlist',
  'closed',
  'unknown',
]);

export const PriceTypeSchema = z.enum(['free', 'paid', 'unknown']);
export const LocationTypeSchema = z.enum(['in_person', 'virtual', 'hybrid', 'unknown']);

export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>;
export type PriceType = z.infer<typeof PriceTypeSchema>;
export type LocationType = z.infer<typeof LocationTypeSchema>;

export const FetchLumaEventRequestSchema = z.object({
  url: z.string().url(),
});

export const FetchLumaEventResponseSchema = z.object({
  url: z.string().url(),
  canonical_url: z.string().url(),
  final_url: z.string().url().optional(),
  title: z.string().optional(),
  starts_at: z.string().optional(),
  city: z.string().optional(),
  venue: z.string().optional(),
  location_type: LocationTypeSchema,
  price_type: PriceTypeSchema,
  price_text: z.string().optional(),
  registration_status: RegistrationStatusSchema,
  organizer_names: z.array(z.string()),
  speaker_names: z.array(z.string()),
  description_excerpt: z.string().optional(),
  popularity_signals: z.array(z.string()),
  page_fetch_status: z.enum(['ok', 'http_error', 'fetch_error']),
  page_fetch_error: z.string().optional(),
  last_verified_at: z.string(),
  content_hash: z.string(),
});

export type FetchLumaEventResponse = z.infer<typeof FetchLumaEventResponseSchema>;
