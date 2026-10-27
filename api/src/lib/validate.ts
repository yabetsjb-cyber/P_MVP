import type { FastifyReply } from 'fastify';
import { z } from 'zod';

// Returns parsed data, or sends a 400 response and returns null
export function parseBody<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  reply: FastifyReply
): z.infer<S> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.code(400).send({
      error: 'VALIDATION',
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}
