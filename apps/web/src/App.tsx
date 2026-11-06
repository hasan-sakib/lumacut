import { Tooltip } from "radix-ui";
import { Suspense, lazy, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthPage } from "./pages/AuthPage.tsx";
import { LibraryPage } from "./pages/LibraryPage.tsx";
import { useAuthStore } from "./stores/auth.ts";

// The developer player bench carries the whole engine; load it only when someone opens /dev/player.
const PlayerPage = lazy(() =>
  import("./pages/dev/PlayerPage.tsx").then((m) => ({ default: m.PlayerPage })),
);

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === "unknown") return <p className="p-10 text-neutral-400">Loading…</p>;
  return status === "authenticated" ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  return status === "authenticated" ? <Navigate to="/" replace /> : children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <AuthPage mode="login" />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <AuthPage mode="register" />
          </GuestOnly>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <LibraryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/dev/player"
        element={
          <RequireAuth>
            <Suspense fallback={<p className="p-10 text-neutral-400">Loading player…</p>}>
              <PlayerPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return (
    <Tooltip.Provider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Tooltip.Provider>
  );
}
