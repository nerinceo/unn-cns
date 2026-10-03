import { GENERIC_ERROR } from "@/lib/errors";

/**
 * Await a server action from a client component without letting it THROW.
 *
 * Every action here already returns `{ error }` for the failures it expects,
 * and the components render that inline. An unexpected throw (a dropped
 * connection, a deploy that changed the action id, an unhandled server error)
 * skips all of that: a spinner set with useState never clears, and one inside
 * a transition takes the whole section to the error boundary.
 *
 * This turns a throw into the same `{ error }` shape, carrying the generic
 * message, so the component's existing error branch handles it. Only for
 * actions whose result already has an `error` field.
 */
export function settle<T>(action: Promise<T>): Promise<T> {
  return action.catch((err: unknown) => {
    console.error("[action] threw", err);
    return { error: GENERIC_ERROR } as T;
  });
}
