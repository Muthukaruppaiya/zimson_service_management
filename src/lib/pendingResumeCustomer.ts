import type { CustomerRecord } from "../types/customer";

const STORAGE_KEY = "zimson_pending_resume_customer";

export function stashPendingResumeCustomer(row: CustomerRecord): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

function parseStoredCustomer(raw: string | null): CustomerRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CustomerRecord;
    return parsed?.id?.trim() ? parsed : null;
  } catch {
    return null;
  }
}

/** Read stashed customer without removing (safe for Strict Mode double-mount). */
export function peekPendingResumeCustomer(): CustomerRecord | null {
  try {
    return parseStoredCustomer(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Read and remove the stashed customer after it is applied on the target page. */
export function takePendingResumeCustomer(): CustomerRecord | null {
  try {
    const row = parseStoredCustomer(sessionStorage.getItem(STORAGE_KEY));
    sessionStorage.removeItem(STORAGE_KEY);
    return row;
  } catch {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearPendingResumeCustomer(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
