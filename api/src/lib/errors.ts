// Throw this anywhere; the error handler (below) turns it into a clean JSON response.
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(code);
  }
}