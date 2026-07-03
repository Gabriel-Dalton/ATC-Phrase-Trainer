import { useSyncExternalStore } from "react";
import { session } from "../engine/session";
import type { SessionSnapshot } from "../engine/types";

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
