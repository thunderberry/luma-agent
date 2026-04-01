import { z } from 'zod';

export const FetchLumaEventRequestSchema = z.object({
  url: z.string().url(),
});

export const FetchLumaEventResponseSchema = z.object({
  title: z.string().optional(),
  start_at: z.string().optional(),
  end_at: z.string().optional(),
  url: z.string().url().optional(),
  city: z.string().optional(),
  host_names: z.array(z.string()),
  waitlist: z.string().nullable().optional(),
  ticket_price: z.string().nullable().optional(),
  sold_out: z.boolean().optional(),
  has_available_ticket_types: z.boolean().optional(),
  category_names: z.array(z.string()),
  calendar_name: z.string().optional(),
  calendar_description_short: z.string().optional(),
  description: z.string().optional(),
  page_fetch_status: z.enum(['ok', 'http_error', 'fetch_error']),
  page_fetch_error: z.string().optional(),
  last_verified_at: z.string(),
  content_hash: z.string(),
});

export type FetchLumaEventResponse = z.infer<typeof FetchLumaEventResponseSchema>;
