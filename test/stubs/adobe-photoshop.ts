// Alias target for the 'adobe:photoshop' bare specifier, which only resolves inside the real
// UXP runtime. This lets Vite/Vitest resolve the import at all; tests then override its contents
// with vi.mock('adobe:photoshop', ...).
export const app: unknown = undefined;
export const action: unknown = undefined;
