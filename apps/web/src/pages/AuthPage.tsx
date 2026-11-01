import { useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router";
import { HealthStatus } from "../components/HealthStatus.tsx";
import { useHealth } from "../lib/useHealth.ts";
import { useAuthStore } from "../stores/auth.ts";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const health = useHealth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const message = await (isLogin ? login : register)(email, password);
    setBusy(false);
    if (message === null) void navigate("/", { replace: true });
    else setError(message);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-10 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Lumacut</h1>
        <p className="text-neutral-400">Video, motion graphics and photo editing in one studio.</p>
      </header>
      <form
        onSubmit={(e) => void submit(e)}
        className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6"
        aria-labelledby="auth-heading"
      >
        <h2 id="auth-heading" className="text-lg font-semibold">
          {isLogin ? "Log in" : "Create your account"}
        </h2>
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={isLogin ? 1 : 10}
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-sky-500"
          />
          {!isLogin && <span className="text-xs text-neutral-500">At least 10 characters.</span>}
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>
        <p className="text-center text-sm text-neutral-400">
          {isLogin ? "New to Lumacut? " : "Already have an account? "}
          <Link to={isLogin ? "/register" : "/login"} className="text-sky-400 hover:underline">
            {isLogin ? "Create an account" : "Log in"}
          </Link>
        </p>
      </form>
      <HealthStatus state={health} />
    </main>
  );
}
