import type { Request, Response } from 'express';
import { appPromise } from '../server.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  const app = await appPromise;
  app(req, res, (error) => {
    if (error) {
      console.error('Vercel API request failed:', error);
      if (!res.headersSent) res.status(500).json({ error: 'The API request could not be completed.' });
      return;
    }
    if (!res.headersSent) res.status(404).json({ error: 'API route not found.' });
  });
}
