import type { IncomingMessage, ServerResponse } from 'http';
import app from '../server';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/';

  if (rawUrl.startsWith('/api/index')) {
    const urlObj = new URL(rawUrl, 'http://localhost');
    const apiPath = urlObj.searchParams.get('__api_path');
    if (apiPath !== null) {
      urlObj.searchParams.delete('__api_path');
      const qs = urlObj.searchParams.toString();
      const cleaned = apiPath.replace(/^\/+/, '');
      req.url = `/api${cleaned ? `/${cleaned}` : ''}${qs ? `?${qs}` : ''}`;
    } else {
      req.url = '/api/health';
    }
  } else if (rawUrl === '/api' || rawUrl === '/api/') {
    req.url = '/api/health';
  }

  return app(
    req as Parameters<typeof app>[0],
    res as Parameters<typeof app>[1]
  );
}
