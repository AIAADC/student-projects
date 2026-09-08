export type InterruptAction = 'cancel-running' | 'confirm-exit' | 'exit' | 'back';

export const DEFAULT_EXIT_CONFIRM_WINDOW_MS = 1200;

export interface InterruptInput {
  running: boolean;
  inSubmenu?: boolean;
  now?: number;
}

export interface InterruptResult {
  action: InterruptAction;
}

export interface InterruptController {
  handle(input: InterruptInput): InterruptResult;
}

export interface PendingInputController {
  wait(register: (resolve: (value: string) => void) => void): Promise<string>;
  resolveOnExit(): void;
}

export function formatInterruptedMessage(): string {
  return 'Interrupted · 接下来想做什么？';
}

export function createInterruptController(options: { confirmWindowMs: number }): InterruptController {
  let lastExitConfirmAt = 0;

  return {
    handle(input: InterruptInput): InterruptResult {
      if (input.inSubmenu) {
        lastExitConfirmAt = 0;
        return { action: 'back' };
      }
      if (input.running) {
        lastExitConfirmAt = 0;
        return { action: 'cancel-running' };
      }

      const now = input.now ?? Date.now();
      if (lastExitConfirmAt && now - lastExitConfirmAt <= options.confirmWindowMs) {
        lastExitConfirmAt = 0;
        return { action: 'exit' };
      }

      lastExitConfirmAt = now;
      return { action: 'confirm-exit' };
    },
  };
}

export function createPendingInputController(): PendingInputController {
  let pendingResolve: ((value: string) => void) | null = null;
  let resolved = false;
  let exiting = false;

  return {
    wait(register: (resolve: (value: string) => void) => void): Promise<string> {
      if (exiting) return Promise.resolve('');
      resolved = false;
      return new Promise((resolve) => {
        pendingResolve = (value: string) => {
          if (resolved) return;
          resolved = true;
          pendingResolve = null;
          resolve(value);
        };
        register(pendingResolve);
      });
    },
    resolveOnExit(): void {
      exiting = true;
      pendingResolve?.('');
    },
  };
}
