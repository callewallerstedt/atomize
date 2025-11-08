"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Check if already logged in
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data?.user) {
          window.location.href = "/";
        } else {
          setCheckingAuth(false);
        }
      })
      .catch(() => setCheckingAuth(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: "include", // Ensure cookies are sent/received
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
      
      // Wait a moment for cookie to be set, then verify auth
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify auth is working
      const verifyRes = await fetch("/api/me", { credentials: "include" });
      const verifyData = await verifyRes.json().catch(() => ({}));
      
      if (verifyData?.user) {
        // Success - do a full page reload to ensure everything is synced
        window.location.href = "/";
      } else {
        throw new Error("Authentication verification failed");
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)]">
        <div className="relative w-24 h-24">
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-spin"
            style={{
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)]">
      {/* Spinning gradient ring */}
      <div className="relative w-24 h-24 mb-8">
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] animate-spin"
          style={{
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 8px), white 0)",
          }}
        />
      </div>

      {/* SYNAPSE text */}
      <div className="mb-12 text-center">
        <span className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider font-mono">
          SYNAPSE
        </span>
      </div>

      {/* Login form */}
      <div className="w-full max-w-md px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-[#FF2D96]/30 bg-[#FF2D96]/10 px-4 py-3 text-sm text-[#FFC0DA]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-[var(--foreground)]/80">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="yourname"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[var(--foreground)]/80">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="At least 6 characters"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || password.length < 6}
            className="w-full inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? (authMode === "login" ? "Signing in..." : "Creating account...") : authMode === "login" ? "Sign in" : "Sign up"}
          </button>

          <div className="text-center text-xs text-[var(--foreground)]/60">
            {authMode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                  }}
                  className="underline hover:text-[var(--accent-cyan)]"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                  }}
                  className="underline hover:text-[var(--accent-cyan)]"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="text-center text-[10px] text-[var(--foreground)]/50 pt-2">
            Your data will be saved securely to your account.
          </div>
        </form>
      </div>
    </div>
  );
}

