import { create } from "zustand";
import { api, errorMessage, setTokenSource, type SessionOut, type UserOut } from "../api/client.ts";

type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  user: UserOut | null;
  accessToken: string | null;
  /** Restores the session from the httpOnly refresh cookie (page load). */
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string) => Promise<string | null>;
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
}

let inflightRefresh: Promise<string | null> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => {
  const accept = (session: SessionOut) => {
    set({ status: "authenticated", user: session.user, accessToken: session.accessToken });
  };
  const signedOut = () => {
    set({ status: "anonymous", user: null, accessToken: null });
  };

  return {
    status: "unknown",
    user: null,
    accessToken: null,

    async bootstrap() {
      if ((await get().refresh()) === null) signedOut();
    },

    async login(email, password) {
      const { data, error } = await api.POST("/api/auth/login", { body: { email, password } });
      if (data === undefined) return errorMessage(error);
      accept(data);
      return null;
    },

    async register(email, password) {
      const { data, error } = await api.POST("/api/auth/register", { body: { email, password } });
      if (data === undefined) return errorMessage(error);
      accept(data);
      return null;
    },

    refresh() {
      // Single flight: concurrent 401s share one refresh (refresh tokens rotate on use).
      inflightRefresh ??= (async () => {
        try {
          const { data } = await api.POST("/api/auth/refresh");
          if (data === undefined) {
            signedOut();
            return null;
          }
          accept(data);
          return data.accessToken;
        } catch {
          return null;
        } finally {
          inflightRefresh = null;
        }
      })();
      return inflightRefresh;
    },

    async logout() {
      await api.POST("/api/auth/logout").catch(() => undefined);
      signedOut();
    },
  };
});

setTokenSource({
  accessToken: () => useAuthStore.getState().accessToken,
  refresh: () => useAuthStore.getState().refresh(),
});
