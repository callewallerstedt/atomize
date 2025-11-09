"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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

  // Generate dots only on client side to avoid hydration mismatch
  const [checkingDots, setCheckingDots] = useState<Array<{
    key: string;
    size: number;
    color: string;
    left: number;
    top: number;
    glowSize: number;
    duration: number;
    delay: number;
    animation: string;
  }>>([]);
  
  const [loginDots, setLoginDots] = useState<Array<{
    key: string;
    size: number;
    color: string;
    left: number;
    top: number;
    glowSize: number;
    duration: number;
    delay: number;
    animation: string;
  }>>([]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCheckingDots(Array.from({ length: 60 }).map((_, i) => {
        const size = Math.random() * 2 + 1;
        const isCyan = Math.random() > 0.5;
        const color = isCyan ? '#00E5FF' : '#FF2D96';
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const glowSize = Math.random() * 4 + 2;
        const duration = Math.random() * 20 + 15;
        const delay = Math.random() * 5;
        return {
          key: `checking-dot-${i}`,
          size,
          color,
          left,
          top,
          glowSize,
          duration,
          delay,
          animation: `float-${i % 3}`,
        };
      }));
      
      setLoginDots(Array.from({ length: 80 }).map((_, i) => {
        const size = Math.random() * 2 + 1;
        const isCyan = Math.random() > 0.5;
        const color = isCyan ? '#00E5FF' : '#FF2D96';
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const glowSize = Math.random() * 4 + 2;
        const duration = Math.random() * 20 + 15;
        const delay = Math.random() * 5;
        return {
          key: `dot-${i}`,
          size,
          color,
          left,
          top,
          glowSize,
          duration,
          delay,
          animation: `float-${i % 3}`,
        };
      }));
    }
  }, []);

  if (checkingAuth) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)]">
        {/* Animated background dots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {checkingDots.map((dot) => (
            <div
              key={dot.key}
              className="absolute rounded-full opacity-40"
              style={{
                width: `${dot.size}px`,
                height: `${dot.size}px`,
                left: `${dot.left}%`,
                top: `${dot.top}%`,
                background: dot.color,
                boxShadow: `0 0 ${dot.glowSize}px ${dot.color}`,
                animation: `${dot.animation} ${dot.duration}s linear infinite`,
                animationDelay: `${dot.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="logo-wrap" style={{ width: 400, aspectRatio: "1 / 1", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img
            src="/spinner.png"
            alt="Spinning logo"
            width={320}
            height={320}
            style={{ width: 320, height: 320, objectFit: "contain", transformOrigin: "center" }}
            className="animate-spin"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)]">
      <style dangerouslySetInnerHTML={{__html: `
        @media (min-width: 768px) {
          .spinner-scale-wrapper {
            transform: scale(0.9) !important;
          }
        }
      `}} />
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {loginDots.map((dot) => (
          <div
            key={dot.key}
            className="absolute rounded-full opacity-40"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              background: dot.color,
              boxShadow: `0 0 ${dot.glowSize}px ${dot.color}`,
              animation: `${dot.animation} ${dot.duration}s linear infinite`,
              animationDelay: `${dot.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Spinning gradient ring */}
      <div className="logo-wrap -mt-40 -mb-[100px]" style={{ width: 240, aspectRatio: "1 / 0.8", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ transform: "scale(1.3)", transformOrigin: "center" }} className="spinner-scale-wrapper">
          <img
            src="/spinner.png"
            alt="Spinning logo"
            width={320}
            height={320}
            style={{ width: 320, height: 320, objectFit: "contain", transformOrigin: "center" }}
            className="animate-spin"
          />
        </div>
      </div>

      {/* SYNAPSE text */}
      <div className="mb-4 text-center">
        <h1 className="text-7xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block" style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}>
          SYNAPSE
          <sup className="text-xl text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-1 left-full ml-1" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>(ALPHA)</sup>
        </h1>
        <p className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] mt-2">
          Studying, Optimized.
        </p>
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
            className="w-full inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-6 text-sm font-medium !text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
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
                  className="underline hover:text-[var(--accent-cyan)] !shadow-none !bg-transparent !border-none outline-none p-0 m-0 font-inherit text-inherit"
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
                  className="underline hover:text-[var(--accent-cyan)] !shadow-none !bg-transparent !border-none outline-none p-0 m-0 font-inherit text-inherit"
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

