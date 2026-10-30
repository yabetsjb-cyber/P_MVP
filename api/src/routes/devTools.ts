import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { parse } from '../lib/validate';
import { handleMessage } from '../services/telegramBot';

const Body = z
  .object({ chatId: z.number().int(), text: z.string().min(1).max(500), name: z.string().max(80).default('Dev user') })
  .strict();

export async function devRoutes(app: FastifyInstance) {
  if (config.isProd) return;   // never exists in production

  // Pretends a Telegram user sent a message to the bot, and returns the bot's reply
  app.post('/v1/dev/telegram/message', async (req) => {
    const b = parse(Body, req.body);
    return { reply: await handleMessage({ chatId: b.chatId, chatType: 'private', text: b.text, name: b.name }) };
  });
}