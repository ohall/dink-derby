import type { IncomingMessage, ServerResponse } from 'node:http';

import { buildServer } from '../src';

const app = buildServer();
const ready = app.ready();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await ready;
  app.server.emit('request', request, response);
}
