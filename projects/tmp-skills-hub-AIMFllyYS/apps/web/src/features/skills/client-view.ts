import type { ClientLinkState } from "./types.js";

export function fallbackClientState(visibleIn: readonly string[], clientId: string): ClientLinkState {
  return visibleIn.includes(clientId) ? "managed" : "off";
}
