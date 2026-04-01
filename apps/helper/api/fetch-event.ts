import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleFetchEventRequest } from '../src/server.js';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  await handleFetchEventRequest(req, res);
}
