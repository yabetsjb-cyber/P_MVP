// Ambient module declaration for CSS imports.
// Next.js normally declares these in next-env.d.ts, but that file is
// only generated after the first `next dev` / `next build`. This file
// makes `tsc --noEmit` work on a fresh checkout before the first run.
declare module '*.css';
declare module '*.scss';
declare module '*.sass';