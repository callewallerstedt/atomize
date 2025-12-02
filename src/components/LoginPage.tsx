"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type LoginPageProps = {
  defaultMode?: "login" | "signup";
  defaultShowCode?: boolean;
  defaultCode?: string;
};

export default function LoginPage({
  defaultMode = "login",
  defaultShowCode = false,
  defaultCode = "",
}: LoginPageProps = {}) {
  const [authMode, setAuthMode] = useState<"login" | "signup">(defaultMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(defaultShowCode);
  const [code, setCode] = useState(defaultCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Ensure scrolling is enabled when login page is active
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = {
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      htmlOverflow: document.documentElement.style.overflow,
    };
    document.body.style.overflow = "auto";
    document.body.style.position = "";
    document.body.style.top = "";
    document.documentElement.style.overflow = "auto";
    return () => {
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.position = previous.bodyPosition;
      document.body.style.top = previous.bodyTop;
      document.documentElement.style.overflow = previous.htmlOverflow;
    };
  }, []);

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
      
      // Validate password confirmation for signup
      if (authMode === "signup" && password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }

      // Validate email format if provided
      if (authMode === "signup" && email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          setError("Please enter a valid email address");
          setLoading(false);
          return;
        }
      }
      
      const res = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: username.trim(), 
          email: authMode === "signup" ? email.trim() : undefined,
          password,
          ...(authMode === "signup" && code.trim() ? { code: code.trim() } : {}),
        }),
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
        // Check for redirect parameters
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get("redirect");
        const shareId = urlParams.get("shareId");
        
        if (redirect === "share" && shareId) {
          // Redirect to share page with autoSave parameter
          window.location.href = `/share/${shareId}?autoSave=true`;
        } else {
          // Success - do a full page reload to ensure everything is synced
          window.location.href = "/";
        }
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
      <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[var(--background)] overflow-hidden">
        {/* Animated background dots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
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

        <div className="logo-wrap" style={{ width: 400, aspectRatio: "1 / 1", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "-15vh" }}>
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
    <div 
      className="fixed z-[10000] overflow-y-auto" 
      style={{ 
        WebkitOverflowScrolling: 'touch', 
        margin: 0, 
        padding: 0, 
        border: 'none',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--background)',
        background: 'var(--background)',
      }}
    >
      <div
        className="relative min-h-screen w-full flex flex-col items-center justify-start pb-12 px-4"
        style={{
          paddingBottom: 'max(25vh, 180px)',
          paddingTop: 0,
          marginTop: 0,
          margin: 0,
          transform: 'scale(0.75)',
          transformOrigin: 'top center',
          top: 0,
          backgroundColor: 'var(--background)',
        }}
      >
      <style dangerouslySetInnerHTML={{__html: `
        body {
          overflow: auto !important;
        }
        html {
          overflow: auto !important;
        }
        .spinner-scale-wrapper {
          transform: scale(0.9) !important;
        }
        .logo-wrap {
          margin-top: 0 !important;
          padding-top: 0 !important;
          top: 0 !important;
        }
        @media (max-width: 767px) {
          .logo-wrap {
            margin-top: -70px !important;
            margin-bottom: -50px !important;
          }
          .synapse-header h1 {
            display: block;
            text-align: center;
          }
          .synapse-header h1 sup {
            position: static !important;
            display: block;
            margin-top: -0.3rem;
            margin-left: 0 !important;
            text-align: center;
            width: 100%;
          }
        }
      `}} />
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
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
      <div className="logo-wrap -mb-[100px] pointer-events-none" style={{ width: 240, aspectRatio: "1 / 0.8", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginTop: 0, paddingTop: 0 }}>
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
      <div className="mb-4 text-center synapse-header">
        <h1 className="text-7xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block" style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}>
          SYNAPSE
          <sup className="text-xl text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-1 left-full ml-1" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>(ALPHA)</sup>
        </h1>
        <p className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] mt-2">
          Studying, Optimized.
        </p>
      </div>

      {/* Login form */}
      <div className="w-full max-w-md px-6 pb-32 relative z-10">
        <h2 className="text-2xl font-semibold text-[var(--foreground)] mb-2 text-center">
          {authMode === "login" ? "Sign in" : "Sign up"}
        </h2>
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
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="yourname"
              autoComplete="username"
              required
            />
          </div>

          {authMode === "signup" && (
            <div>
              <label className="mb-2 block text-sm text-[var(--foreground)]/80">Email (Optional)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
                placeholder="your.email@example.com"
                autoComplete="email"
              />
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-[var(--foreground)]/80">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="At least 6 characters"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </div>

          {authMode === "signup" && (
            <div>
              <label className="mb-2 block text-sm text-[var(--foreground)]/80">Confirm Password</label>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
                placeholder="Re-enter your password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          )}

          {authMode === "signup" && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setShowCodeInput(!showCodeInput);
                  setCode("");
                }}
                className="text-xs text-[var(--foreground)]/60 hover:text-[var(--accent-cyan)] underline !shadow-none !bg-transparent !border-none outline-none p-0 m-0 font-inherit"
              >
                Got a code?
              </button>
            </div>
          )}

          {authMode === "signup" && showCodeInput && (
            <div>
              <label className="mb-2 block text-sm text-[var(--foreground)]/80">Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                type="text"
                className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
                placeholder="Enter your code"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || password.length < 6 || (authMode === "signup" && password !== confirmPassword)}
            className="w-full inline-flex h-12 items-center justify-center rounded-full synapse-style px-6 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
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
                    setEmail("");
                    setConfirmPassword("");
                    setShowCodeInput(false);
                    setCode("");
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
                    setEmail("");
                    setConfirmPassword("");
                    setShowCodeInput(false);
                    setCode("");
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
    </div>
  );
}

