import { t } from "./locale.ts";
export interface BindingOperationApi {
  resume(): Promise<void>;
  bind(id: string, physicalInput: string): Promise<void>;
  refresh(): Promise<void>;
}

export class BindingOperationError extends Error {
  readonly committed: boolean;
  constructor(message: string, committed: boolean) {
    super(message);
    this.committed = committed;
  }
}

// Conflict resolution, registration, persistence and rollback belong to Rust bind_key.
// Both UI entry points resume capture, bind, and refresh through this operation.
export async function performBinding(api: BindingOperationApi, id: string, input: string) {
  let committed = false;
  let failure: unknown;
  try {
    await api.resume();
    await api.bind(id, input);
    committed = true;
  } catch (error) {
    failure = error;
  }
  try {
    await api.refresh();
  } catch (error) {
    throw new BindingOperationError(
      (committed
        ? t("boundRefreshFailed")
        : `${t("bindFailed")}${String(failure)}${t("refreshFailedSuffix")}`) + String(error),
      committed,
    );
  }
  if (!committed) throw new BindingOperationError(t("bindFailed") + String(failure), false);
}
