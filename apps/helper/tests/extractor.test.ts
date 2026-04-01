import { describe, expect, it } from 'vitest';

import { translateFetchedPage } from '../src/translate.js';

function fetchedPage(html: string) {
  return {
    requestedUrl: 'https://lu.ma/example-event',
    finalUrl: 'https://lu.ma/example-event',
    status: 200,
    ok: true,
    fetchedAt: '2026-03-31T20:00:00.000Z',
    html,
  };
}

describe('helper translation', () => {
  it('returns the flattened endpoint shape from structured page data', () => {
    const result = translateFetchedPage(
      fetchedPage(`
        <html>
          <head>
            <script id="__NEXT_DATA__" type="application/json">
              {
                "props": {
                  "pageProps": {
                    "initialData": {
                      "data": {
                        "event": {
                          "name": "AI Founder Breakfast",
                          "start_at": "2026-04-05T16:30:00.000Z",
                          "end_at": "2026-04-05T18:00:00.000Z",
                          "url": "ai-founder-breakfast",
                          "waitlist_enabled": true,
                          "waitlist_status": "enabled",
                          "geo_address_info": {
                            "city": "San Francisco",
                            "city_state": "San Francisco, California"
                          }
                        },
                        "hosts": [
                          { "name": "Founders Bay" }
                        ],
                        "registration_questions": [
                          { "label": "Twitter" }
                        ],
                        "ticket_types": [
                          { "name": "Standard", "type": "free" }
                        ],
                        "sold_out": false,
                        "has_available_ticket_types": true,
                        "categories": [
                          { "name": "AI" },
                          { "name": "Wellness" }
                        ],
                        "calendar": {
                          "name": "Founders Bay",
                          "description_short": "Founder events in the Bay Area"
                        },
                        "description_mirror": {
                          "type": "doc",
                          "content": [
                            {
                              "type": "paragraph",
                              "content": [
                                { "type": "text", "text": "A breakfast for AI founders." }
                              ]
                            },
                            {
                              "type": "paragraph",
                              "content": [
                                { "type": "text", "text": "Coffee and conversation." }
                              ]
                            }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            </script>
          </head>
          <body></body>
        </html>
      `),
    );

    expect(result.page_fetch_status).toBe('ok');
    expect(result.title).toBe('AI Founder Breakfast');
    expect(result.start_at).toBe('2026-04-05T16:30:00.000Z');
    expect(result.end_at).toBe('2026-04-05T18:00:00.000Z');
    expect(result.slug).toBe('ai-founder-breakfast');
    expect(result.city).toBe('San Francisco');
    expect(result.host_names).toEqual(['Founders Bay']);
    expect(result.waitlist).toBe('enabled');
    expect(result.ticket_price).toBe('free');
    expect(result.sold_out).toBe(false);
    expect(result.has_available_ticket_types).toBe(true);
    expect(result.category_names).toEqual(['AI', 'Wellness']);
    expect(result.calendar_name).toBe('Founders Bay');
    expect(result.calendar_description_short).toBe('Founder events in the Bay Area');
    expect(result.description).toBe('A breakfast for AI founders.\n\nCoffee and conversation.');
  });

  it('returns only metadata and empty arrays when structured data is missing', () => {
    const result = translateFetchedPage(
      fetchedPage(`
        <html>
          <head></head>
          <body><h1>No embedded payload</h1></body>
        </html>
      `),
    );

    expect(result.page_fetch_status).toBe('ok');
    expect(result.host_names).toEqual([]);
    expect(result.category_names).toEqual([]);
    expect(result.title).toBeUndefined();
    expect(result.description).toBeUndefined();
  });
});
