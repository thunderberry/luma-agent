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
  it('extracts a free open event', () => {
    const result = translateFetchedPage(
      fetchedPage(`
        <html>
          <head>
            <title>AI Founder Breakfast</title>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Event",
                "name": "AI Founder Breakfast",
                "startDate": "2026-04-05T09:30:00-07:00",
                "description": "Meet serious founders and investors building in AI.",
                "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
                "isAccessibleForFree": true,
                "location": {
                  "@type": "Place",
                  "name": "Frontier Tower",
                  "address": {
                    "@type": "PostalAddress",
                    "addressLocality": "San Francisco",
                    "addressRegion": "CA"
                  }
                },
                "organizer": {
                  "@type": "Organization",
                  "name": "Founders Bay"
                }
              }
            </script>
          </head>
          <body>
            <h1>AI Founder Breakfast</h1>
            <button>Register</button>
            <div>245 attending</div>
          </body>
        </html>
      `),
    );

    expect(result.price_type).toBe('free');
    expect(result.registration_status).toBe('open');
    expect(result.city).toBe('San Francisco');
  });

  it('extracts a paid event', () => {
    const result = translateFetchedPage(
      fetchedPage(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Event",
                "name": "Applied AI Summit",
                "offers": {
                  "@type": "Offer",
                  "price": "149",
                  "priceCurrency": "USD"
                }
              }
            </script>
          </head>
          <body><button>Register</button></body>
        </html>
      `),
    );

    expect(result.price_type).toBe('paid');
    expect(result.price_text).toBe('USD 149');
  });

  it('classifies waitlist events', () => {
    const result = translateFetchedPage(
      fetchedPage('<html><body><button>Join waitlist</button></body></html>'),
    );

    expect(result.registration_status).toBe('waitlist');
  });

  it('classifies approval-required events', () => {
    const result = translateFetchedPage(
      fetchedPage('<html><body><button>Request to join</button></body></html>'),
    );

    expect(result.registration_status).toBe('approval_required');
  });

  it('classifies closed events', () => {
    const result = translateFetchedPage(
      fetchedPage('<html><body><div>Registration closed</div></body></html>'),
    );

    expect(result.registration_status).toBe('closed');
  });
});
