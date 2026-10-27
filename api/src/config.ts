import 'dotenv/config';
import path from 'node:path';
export const config = {
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  cookieName: 'sid',
  sessionDays: 7,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001')
    .split(',')
    .map((s) => s.trim()),
 documentsDir: path.resolve(process.env.STORAGE_DIR ?? './storage', 'documents'),  
};
