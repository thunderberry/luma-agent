import { describe, expect, it } from 'vitest';

import { extractEventPageFactsFromHtml } from '../../src/checker/http-event-extractor.js';

describe('http event extractor', () => {
  it('extracts structured event facts from html', () => {
    const html = `
      <html>
        <head>
          <title>AI Founder Breakfast</title>
          <meta name="description" content="Breakfast with founders and investors in SF." />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Event",
              "name": "AI Founder Breakfast",
              "startDate": "2026-04-05T09:30:00-07:00",
              "description": "Meet serious founders and investors building in AI.",
              "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
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
              },
              "offers": {
                "@type": "Offer",
                "price": "20",
                "priceCurrency": "USD"
              }
            }
          </script>
        </head>
        <body>
          <h1>AI Founder Breakfast</h1>
          <a>Register</a>
          <div>245 attending</div>
        </body>
      </html>
    `;

    const facts = extractEventPageFactsFromHtml(html);

    expect(facts.title).toBe('AI Founder Breakfast');
    expect(facts.startsAt).toContain('2026-04-05');
    expect(facts.organizerName).toBe('Founders Bay');
    expect(facts.priceType).toBe('paid');
    expect(facts.priceText).toBe('USD 20');
    expect(facts.venueName).toBe('Frontier Tower');
    expect(facts.city).toBe('San Francisco');
    expect(facts.locationType).toBe('in_person');
    expect(facts.ctaTexts).toContain('Register');
    expect(facts.popularitySignals).toContain('245 attending');
  });
});
