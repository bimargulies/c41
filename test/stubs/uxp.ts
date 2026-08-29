// Alias target for the 'uxp' bare specifier, which only resolves inside the real UXP runtime.
// This lets Vite/Vitest resolve the import at all; tests then override its contents with
// vi.mock('uxp', ...).
export const storage: unknown = undefined;
export const entrypoints: unknown = undefined;
