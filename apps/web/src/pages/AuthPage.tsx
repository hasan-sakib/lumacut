import { useState, type SyntheticEvent } from "react";
import { Link, useNavigate } from "react-router";
import { HealthStatus } from "../components/HealthStatus.tsx";
import { ThemeSwitch } from "../components/home/ThemeSwitch.tsx";
import { Icon } from "../components/Icon.tsx";
import { Logo } from "../components/Logo.tsx";
import { useHealth } from "../lib/useHealth.ts";
import { useAuthStore } from "../stores/auth.ts";
import { usePrefsStore } from "../stores/prefs.ts";

const POINTS: { icon: string; title: string; text: string }[] = [
  {
    icon: "video",
    title: "Video and motion",
    text: "A multi-track timeline, keyframes, effects and titles.",
  },
  { icon: "image", title: "Photo", text: "Layers, masks, retouching and colour in the same tool." },
  {
    icon: "template",
    title: "Templates",
    text: "Start from a finished reel, intro or slideshow and make it yours.",
  },
];

const FIELD =
  "h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20";

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
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const message = await (isLogin ? login : register)(email, password);
    setBusy(false);
    if (message === null) void navigate("/", { replace: true });
    else setError(message);
  };

  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[44%] max-w-2xl flex-col justify-between overflow-hidden bg-linear-to-br from-sky-600 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        <Logo markClassName="h-10 w-10" className="[&>span]:text-2xl" />
        <div>
          <p className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Video, motion graphics and photo editing in one studio.
          </p>
          <ul className="mt-10 flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-white/75">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">
          Runs in your browser. Your projects save as you work.
        </p>
      </aside>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="absolute right-5 top-5">
          <ThemeSwitch theme={theme} onPick={setTheme} />
        </div>
        <header className="text-center lg:hidden">
          <h1>
            <Logo markClassName="h-10 w-10" className="[&>span]:text-2xl" />
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Video, motion graphics and photo editing in one studio.
          </p>
        </header>
        <form
          onSubmit={(e) => void submit(e)}
          className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-7 shadow-xl"
          aria-labelledby="auth-heading"
        >
          <div>
            <h2 id="auth-heading" className="text-xl font-semibold tracking-tight">
              {isLogin ? "Log in" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {isLogin ? "Welcome back to Lumacut." : "Start editing in a minute."}
            </p>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className={FIELD}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
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
              className={FIELD}
            />
            {!isLogin && (
              <span className="block text-xs font-normal text-neutral-500">
                At least 10 characters.
              </span>
            )}
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-lg bg-sky-600 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
          </button>
          <p className="text-center text-sm text-neutral-400">
            {isLogin ? "New to Lumacut? " : "Already have an account? "}
            <Link
              to={isLogin ? "/register" : "/login"}
              className="font-medium text-sky-400 hover:underline"
            >
              {isLogin ? "Create an account" : "Log in"}
            </Link>
          </p>
        </form>
        <details className="w-full max-w-sm text-sm text-neutral-400">
          <summary className="cursor-pointer select-none text-center text-xs text-neutral-500 hover:text-neutral-300">
            System status
          </summary>
          <div className="mt-3">
            <HealthStatus state={health} />
          </div>
        </details>
      </main>
    </div>
  );
}
