// Ambient shims so test files can use a couple of Node APIs (reading the shipped CSS to
// pin the palette) without pulling @types/node into the app tsconfig. Type-only — no
// runtime effect; the Node-based vitest runtime provides the real implementations.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare const process: { cwd(): string };
