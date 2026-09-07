import { action, app } from "adobe:photoshop";

export type ActionDescriptor = Parameters<typeof action.batchPlay>[0][number];

/** Raised for a condition the user can fix (wrong bit depth, missing profile
 *  name, ...); command handlers show its `message` to the user verbatim
 *  instead of just logging. */
export class UserError extends Error {}

/**
 * Run `fn` as a single undoable step on the active document. suspendHistory
 * (a thin wrapper over core.executeAsModal) coalesces every change made in the
 * callback into one named history state. A throw inside the callback can
 * surface as an opaque wrapper that loses the original error, so capture and
 * rethrow it.
 */
export async function asSingleHistoryStep(name: string, fn: () => Promise<void>): Promise<void> {
  let error: unknown;
  await app.activeDocument.suspendHistory(async () => {
    try {
      await fn();
    } catch (e) {
      error = e;
    }
  }, name);
  if (error) throw error;
}

/**
 * Run one modifying batchPlay descriptor, turning a returned error descriptor
 * into a real thrown Error. Must be called inside a modal scope
 * (asSingleHistoryStep).
 */
export async function batchPlayModifying(descriptor: ActionDescriptor): Promise<void> {
  const [result] = await action.batchPlay([descriptor], {
    modalBehavior: "execute",
    dialogOptions: "silent",
  });
  if (result?._obj === "error") {
    console.error("[c41] batchPlay error descriptor:", result);
    throw new Error(`batchPlay command failed: ${result.message ?? "unknown error"}`);
  }
}
