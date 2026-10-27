import { HttpError } from './errors';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { normalizeEthiopianPhone } from './phone';

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

export const requiredEthiopianPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizeEthiopianPhone(v);
    if (!p) {
      ctx.addIssue({ code: 'custom', message: 'Invalid Ethiopian mobile number' });
      return z.NEVER;
    }
    return p;
  });

  // Like parseBody, but throws instead of replying. This removes the
// "two replies" risk when you validate several things in one handler.
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, 'VALIDATION', {
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

const isRealDate = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  return !isNaN(+t) && t.toISOString().slice(0, 10) === d; // rejects 2026-02-31
};

export const priceEtb = z
  .number()
  .positive()
  .max(1_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimal places');

export const quantity = z.number().int().min(0).max(100_000);

export const gregorianFutureDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD (Gregorian, as printed on the pack)')
  .refine(isRealDate, 'Not a real date')
  .refine((d) => Date.parse(d) > Date.now(), 'Already expired');