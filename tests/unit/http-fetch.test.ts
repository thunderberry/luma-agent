import { describe, expect, it, vi } from 'vitest';

import { buildFetchSlug, buildHtmlExcerpt, fetchEventPageHtml } from '../../src/retrieval/http-fetch.js';

describe('http fetch', () => {
  it('builds a compact excerpt from raw html', () => {
    const excerpt = buildHtmlExcerpt('<html>\n  <body>  Hello   world  </body>\n</html>', 32);

    expect(excerpt).toBe('<html> <body> Hello world </bod…');
  });

  it('returns fetch metadata and raw html', async () => {
    const mockFetch = vi.fn(async () => ({
      url: 'https://lu.ma/demo-event',
      status: 200,
      ok: true,
      headers: new Headers({
        'content-type': 'text/html; charset=utf-8',
        'content-length': '27',
      }),
      text: async () => '<html><body>Hello</body></html>',
    })) as unknown as typeof fetch;

    const result = await fetchEventPageHtml('https://lu.ma/demo-event?utm_source=test', 2500, mockFetch);

    expect(result.requestedUrl).toBe('https://lu.ma/demo-event?utm_source=test');
    expect(result.finalUrl).toBe('https://lu.ma/demo-event');
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(result.contentLength).toBe(27);
    expect(result.contentLengthSource).toBe('header');
    expect(result.html).toBe('<html><body>Hello</body></html>');
    expect(result.htmlExcerpt).toContain('Hello');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('falls back to body length when content-length is absent', async () => {
    const html = '<html><body>Phase 0</body></html>';
    const mockFetch = vi.fn(async () => ({
      url: 'https://lu.ma/demo-event',
      status: 200,
      ok: true,
      headers: new Headers({
        'content-type': 'text/html',
      }),
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchEventPageHtml('https://lu.ma/demo-event', 2500, mockFetch);

    expect(result.contentLength).toBe(Buffer.byteLength(html, 'utf8'));
    expect(result.contentLengthSource).toBe('body_bytes');
  });

  it('builds stable slugs for persisted proof files', () => {
    expect(buildFetchSlug('https://lu.ma/My Event/?utm_source=test')).toMatch(
      /^lu-ma-my-event-[a-f0-9]{8}$/,
    );
  });
});
