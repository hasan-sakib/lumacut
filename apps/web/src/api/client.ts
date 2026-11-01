import createClient from "openapi-fetch";
import type { components, paths } from "./generated/schema";

export type AssetOut = components["schemas"]["AssetOut"];
export type SessionOut = components["schemas"]["SessionOut"];
export type UserOut = components["schemas"]["UserOut"];
export type UploadOut = components["schemas"]["UploadOut"];
export type UploadStatus = components["schemas"]["UploadStatus"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type HealthReport = components["schemas"]["HealthReport"];

/** Wired by the auth store: current token, and a way to get a fresh one after a 401. */
export interface TokenSource {
  accessToken(): string | null;
  refresh(): Promise<string | null>;
}

let tokens: TokenSource = { accessToken: () => null, refresh: () => Promise.resolve(null) };

export function setTokenSource(source: TokenSource): void {
  tokens = source;
}

function withToken(request: Request, token: string | null): Request {
  const next = new Request(request);
  if (token !== null) next.headers.set("Authorization", `Bearer ${token}`);
  return next;
}

/** Adds the access token; on 401 refreshes once and retries (never for /api/auth itself). */
export async function authFetch(request: Request): Promise<Response> {
  const retryCopy = request.clone();
  const response = await fetch(withToken(request, tokens.accessToken()));
  if (response.status !== 401 || new URL(request.url).pathname.startsWith("/api/auth/")) {
    return response;
  }
  const fresh = await tokens.refresh();
  return fresh === null ? response : fetch(withToken(retryCopy, fresh));
}

export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  fetch: authFetch,
  credentials: "same-origin",
});

/** The user-facing message from an API error body, with a fallback. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again.",
): string {
  const body = error as Partial<ErrorResponse> | undefined;
  return body?.error?.message ?? fallback;
}
