import { useAtomValue } from "@effect/atom-react";
import {
  createEnvironmentSessionAtoms,
  sessionDeniesScope,
  sessionHasScope,
} from "@t3tools/client-runtime/state/session";
import type { AuthEnvironmentScope, AuthSessionState, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "./atom-registry";

export { sessionHasScope };
export const environmentSession = createEnvironmentSessionAtoms(connectionAtomRuntime);

const EMPTY_SESSION_STATE_ATOM = Atom.make(AsyncResult.initial<AuthSessionState>());

function useSessionState(environmentId: EnvironmentId | null) {
  return useAtomValue(
    environmentId === null
      ? EMPTY_SESSION_STATE_ATOM
      : environmentSession.sessionStateAtom(environmentId),
  );
}

export function useEnvironmentScope(
  environmentId: EnvironmentId | null,
  scope: AuthEnvironmentScope,
): boolean {
  return sessionHasScope(useSessionState(environmentId), scope);
}

/** Unlike `!useEnvironmentScope`, stays false while the grants are still loading. */
export function useEnvironmentScopeDenied(
  environmentId: EnvironmentId | null,
  scope: AuthEnvironmentScope,
): boolean {
  return sessionDeniesScope(useSessionState(environmentId), scope);
}

export function useEnvironmentsWithScope(
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId }>,
  scope: AuthEnvironmentScope,
): ReadonlySet<EnvironmentId> {
  const permittedEnvironments = useMemo(
    () =>
      Atom.make((get) => {
        const permitted = new Set<EnvironmentId>();
        for (const { environmentId } of environments) {
          if (sessionHasScope(get(environmentSession.sessionStateAtom(environmentId)), scope)) {
            permitted.add(environmentId);
          }
        }
        return permitted;
      }),
    [environments, scope],
  );
  return useAtomValue(permittedEnvironments);
}

export function readEnvironmentScope(
  environmentId: EnvironmentId,
  scope: AuthEnvironmentScope,
): boolean {
  const result = appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId));
  return sessionHasScope(result, scope);
}

const EMPTY_PREPARED_CONNECTION_ATOM = Atom.make(Option.none()).pipe(
  Atom.withLabel("mobile-prepared-connection:empty"),
);

export function usePreparedConnection(environmentId: EnvironmentId | null) {
  return useAtomValue(
    environmentId === null
      ? EMPTY_PREPARED_CONNECTION_ATOM
      : environmentSession.preparedConnectionValueAtom(environmentId),
  );
}
