"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";

type Theme = {
  background: string;
  foreground: string;
  accentCyan: string;
  accentPink: string;
  isLightMode?: boolean;
};

const DARK_DEFAULTS: Theme = {
  background: "#0F1216",
  foreground: "#E5E7EB",
  accentCyan: "#00E5FF",
  accentPink: "#FF2D96",
  isLightMode: false,
};

const LIGHT_DEFAULTS: Theme = {
  background: "#F8FAFC",
  foreground: "#1E293B",
  accentCyan: "#0EA5E9",
  accentPink: "#EC4899",
  isLightMode: true,
};

function applyTheme(t: Theme) {
  console.log('Applying theme:', t);
  const root = document.documentElement;
  root.style.setProperty("--background", t.background);
  root.style.setProperty("--foreground", t.foreground);
  root.style.setProperty("--accent-cyan", t.accentCyan);
  root.style.setProperty("--accent-pink", t.accentPink);
  root.style.setProperty("--accent-grad", `linear-gradient(90deg, ${t.accentCyan}, ${t.accentPink})`);

  // Handle light/dark mode class
  if (t.isLightMode) {
    console.log('Adding light-mode class');
    root.classList.add('light-mode');
  } else {
    console.log('Removing light-mode class');
    root.classList.remove('light-mode');
  }
}

export default function SettingsModal({ 
  open, 
  onClose, 
  onLogout,
  isAuthenticated,
  subscriptionLevel: subscriptionLevelProp = "Free",
  onSubscriptionLevelChange
}: { 
  open: boolean; 
  onClose: () => void;
  onLogout?: () => void;
  isAuthenticated?: boolean;
  subscriptionLevel?: string;
  onSubscriptionLevelChange?: (level: string) => void;
}) {
  const [theme, setTheme] = useState<Theme>(DARK_DEFAULTS);
  const [isLightMode, setIsLightMode] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [subscriptionLevel, setSubscriptionLevel] = useState<string>(subscriptionLevelProp);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [code, setCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Update subscription level when prop changes
  useEffect(() => {
    setSubscriptionLevel(subscriptionLevelProp);
  }, [subscriptionLevelProp]);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem("atomicTheme");
      const saved = raw ? (JSON.parse(raw) as Theme) : DARK_DEFAULTS;
      const mode = saved.isLightMode ?? false;
      setIsLightMode(mode);
      setTheme({ ...(mode ? LIGHT_DEFAULTS : DARK_DEFAULTS), ...saved });
    } catch {
      setTheme(DARK_DEFAULTS);
      setIsLightMode(false);
    }
    
    // Fetch user info if authenticated (only for username, subscription level comes from prop)
    if (isAuthenticated) {
      fetch("/api/me", { credentials: "include" })
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          if (data?.user?.username) {
            setUsername(data.user.username);
          }
          // Update subscription level if prop wasn't provided (backwards compatibility)
          if (data?.user?.subscriptionLevel && subscriptionLevelProp === "Free") {
            setSubscriptionLevel(data.user.subscriptionLevel);
          }
        })
        .catch(() => {});
    } else {
      setUsername(null);
      setSubscriptionLevel("Free");
    }
  }, [open, isAuthenticated, subscriptionLevelProp]);

  function toggleLightMode() {
    const newMode = !isLightMode;
    console.log('Toggling to:', newMode ? 'light' : 'dark');
    setIsLightMode(newMode);
    const newTheme = { ...(newMode ? LIGHT_DEFAULTS : DARK_DEFAULTS), isLightMode: newMode };
    console.log('New theme:', newTheme);
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem("atomicTheme", JSON.stringify(newTheme));
  }


  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium !text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]">Close</button>
        </div>
      }
    >
      {/* Logged in user info */}
      {isAuthenticated && username && (
        <div className="mb-6 pb-6 border-b border-[var(--foreground)]/20">
          <p className="text-sm text-[var(--foreground)]">
            Logged in as: <span className="font-medium">{username}</span>
          </p>
        </div>
      )}

      {/* Subscription Level */}
      {isAuthenticated && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Subscription</span>
            <span className={`text-sm font-semibold capitalize ${
              subscriptionLevel === "Tester" ? "text-[var(--accent-cyan)]" :
              subscriptionLevel === "Paid" ? "text-[var(--accent-pink)]" :
              subscriptionLevel === "mylittlepwettybebe" ? "text-[var(--accent-pink)]" :
              "text-[var(--foreground)]/70"
            }`}>
              {subscriptionLevel}
            </span>
          </div>
          {subscriptionLevel === "Free" && (
            <p className="text-xs text-[var(--foreground)]/60 mb-2">
              Upgrade to unlock unlimited courses and premium features
            </p>
          )}
          {subscriptionLevel === "Paid" && (
            <div className="space-y-1 mb-2">
              <p className="text-xs text-[var(--foreground)]/60">
                You have full access to all features
              </p>
              <p className="text-xs text-[var(--foreground)]/50">
                Your subscription will remain active until the end of the billing period
              </p>
            </div>
          )}
          {subscriptionLevel === "Tester" && (
            <div className="space-y-1 mb-2">
              <p className="text-xs text-[var(--foreground)]/60">
                You have full access to all features as a Tester
              </p>
            </div>
          )}
          {subscriptionLevel === "mylittlepwettybebe" && (
            <div className="space-y-1 mb-2">
              <p className="text-xs text-[var(--foreground)]/60">
                You have full access to all features
              </p>
            </div>
          )}
          {(subscriptionLevel === "Tester" || subscriptionLevel === "mylittlepwettybebe") && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const tierName = subscriptionLevel === "Tester" ? "Tester" : "mylittlepwettybebe";
                if (!confirm(`Are you sure you want to remove your ${tierName} subscription? You will be downgraded to Free tier.`)) {
                  return;
                }
                setProcessing(true);
                try {
                  const res = await fetch("/api/subscription/update", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subscriptionLevel: "Free" }),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.ok) {
                    alert(json?.error || "Failed to update subscription");
                    return;
                  }
                  setSubscriptionLevel("Free");
                  onSubscriptionLevelChange?.("Free");
                  alert("Successfully downgraded to Free tier");
                } catch (err: any) {
                  alert(err?.message || "Failed to update subscription");
                } finally {
                  setProcessing(false);
                }
              }}
              disabled={processing}
              className="inline-flex h-6 items-center justify-center rounded px-2 text-xs text-[var(--foreground)]/60 hover:text-red-500 hover:bg-red-500/10 border border-[var(--foreground)]/10 hover:border-red-500/30 disabled:opacity-60 transition-colors"
            >
              {processing ? "Processing..." : "Remove Subscription"}
            </button>
          )}
          {subscriptionLevel !== "Tester" && subscriptionLevel !== "mylittlepwettybebe" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUpgradeModalOpen(true);
              }}
              className="w-full inline-flex h-8 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] hover:opacity-95 !text-white px-3 text-xs font-medium transition-opacity"
            >
              {subscriptionLevel === "Paid" ? "Manage Subscription" : "Upgrade"}
            </button>
          )}
        </div>
      )}

      {/* Light/Dark Mode Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--foreground)]">Theme</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLightMode();
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isLightMode ? 'bg-[#0EA5E9]' : 'bg-[#374151]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isLightMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#A7AFBE]">
          {isLightMode ? 'Light mode' : 'Dark mode'}
        </p>
      </div>

      {/* Logout Button */}
      {isAuthenticated && onLogout && (
        <div className="mb-6 pt-6 border-t border-[var(--foreground)]/20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLogout();
            }}
            className="w-full inline-flex h-8 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 !text-white px-3 text-xs font-medium transition-colors"
          >
            Log out
          </button>
        </div>
      )}

      {/* Upgrade Modal */}
      {upgradeModalOpen && (
        <Modal
          open={upgradeModalOpen}
          onClose={() => {
            setUpgradeModalOpen(false);
            setShowCodeInput(false);
            setCode("");
            setShowCancelConfirm(false);
          }}
          title={subscriptionLevel === "Paid" ? "Cancel Subscription" : "Upgrade Subscription"}
          footer={
            <div className="flex justify-end">
              <button 
                onClick={() => {
                  setUpgradeModalOpen(false);
                  setShowCodeInput(false);
                  setCode("");
                  setShowCancelConfirm(false);
                }} 
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium !text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96]"
              >
                Close
              </button>
            </div>
          }
        >
          {subscriptionLevel === "Paid" ? (
            <div className="space-y-4">
              {!showCancelConfirm ? (
                <>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-sm text-[var(--foreground)] mb-2">
                      <strong>What happens when you cancel:</strong>
                    </p>
                    <ul className="text-xs text-[var(--foreground)]/70 space-y-1 list-disc list-inside">
                      <li>You'll keep access until the end of your current billing period</li>
                      <li>No further charges will be made</li>
                      <li>Your account will revert to Free tier after the period ends</li>
                    </ul>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCancelConfirm(true);
                    }}
                    className="w-full inline-flex h-10 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 !text-white px-4 text-sm font-medium transition-colors"
                  >
                    Cancel Subscription
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-[var(--foreground)]">
                    Are you sure you want to cancel your subscription?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProcessing(true);
                        // TODO: Implement cancel subscription
                        setTimeout(() => {
                          alert("Cancel subscription functionality coming soon");
                          setProcessing(false);
                          setShowCancelConfirm(false);
                        }, 500);
                      }}
                      disabled={processing}
                      className="flex-1 inline-flex h-10 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 !text-white px-4 text-sm font-medium transition-colors disabled:opacity-60"
                    >
                      {processing ? "Processing..." : "Yes, Cancel"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCancelConfirm(false);
                      }}
                      disabled={processing}
                      className="flex-1 inline-flex h-10 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors disabled:opacity-60"
                    >
                      Keep Subscription
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)] mb-2">
                  Choose your subscription plan:
                </p>
                <div className="text-xs text-[var(--foreground)]/60 space-y-1">
                  <div className="flex items-center gap-2">
                    <svg className="h-3 w-3 text-[var(--accent-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Unlimited courses and lessons</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="h-3 w-3 text-[var(--accent-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>All premium features unlocked</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="h-3 w-3 text-[var(--accent-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Priority support</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (processing) return;
                    // TODO: Implement monthly subscription
                    alert("Monthly subscription (99 SEK/month) coming soon");
                  }}
                  disabled={processing}
                  className="w-full p-4 rounded-xl border-2 border-[var(--accent-cyan)]/50 bg-[var(--background)]/60 hover:border-[var(--accent-cyan)] hover:bg-[var(--background)]/80 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <div className="text-sm font-medium text-[var(--foreground)]">Monthly</div>
                      <div className="text-lg font-bold text-[var(--foreground)]">99 SEK</div>
                      <div className="text-xs text-[var(--foreground)]/70">per month</div>
                    </div>
                    <svg className="h-5 w-5 text-[var(--accent-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                <div className="relative">
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                    <span className="text-xs font-semibold text-white bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (processing) return;
                      // TODO: Implement yearly subscription
                      alert("Yearly subscription (1000 SEK/year) coming soon");
                    }}
                    disabled={processing}
                    className="w-full p-4 rounded-xl border-2 border-[var(--accent-cyan)] bg-gradient-to-br from-[var(--accent-cyan)]/10 to-[var(--accent-pink)]/10 hover:border-[var(--accent-cyan)] hover:from-[var(--accent-cyan)]/20 hover:to-[var(--accent-pink)]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-[var(--foreground)]">Yearly</div>
                          <span className="text-xs font-semibold text-[var(--accent-pink)] bg-[var(--accent-pink)]/20 px-2 py-0.5 rounded">
                            Save 16%
                          </span>
                        </div>
                        <div className="text-lg font-bold text-[var(--foreground)]">1000 SEK</div>
                        <div className="text-xs text-[var(--foreground)]/70">per year</div>
                      </div>
                      <svg className="h-5 w-5 text-[var(--accent-cyan)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--foreground)]/20">
                {!showCodeInput ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCodeInput(true);
                    }}
                    className="w-full text-center text-xs text-[var(--foreground)]/60 hover:text-[var(--accent-cyan)] underline !shadow-none !bg-transparent !border-none outline-none p-0 m-0 font-inherit"
                  >
                    Got a code?
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      type="text"
                      placeholder="Enter your code"
                      className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!code.trim() || processing) return;
                          setProcessing(true);
                          try {
                            const res = await fetch("/api/promo-code/redeem", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ code: code.trim() }),
                            });
                            const json = await res.json();
                            if (!res.ok || !json?.ok) {
                              alert(json?.error || "Failed to redeem code");
                              return;
                            }
                            alert(json.message || "Code redeemed successfully!");
                            const newLevel = json.subscriptionLevel;
                            setSubscriptionLevel(newLevel);
                            onSubscriptionLevelChange?.(newLevel);
                            setCode("");
                            setShowCodeInput(false);
                            // Refresh user data
                            const meRes = await fetch("/api/me", { credentials: "include" });
                            const meData = await meRes.json().catch(() => ({}));
                            if (meData?.user?.subscriptionLevel) {
                              const updatedLevel = meData.user.subscriptionLevel;
                              setSubscriptionLevel(updatedLevel);
                              onSubscriptionLevelChange?.(updatedLevel);
                            }
                          } catch (err: any) {
                            alert(err?.message || "Failed to redeem code");
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        disabled={!code.trim() || processing}
                        className="flex-1 inline-flex h-8 items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] to-[#FF2D96] hover:opacity-95 disabled:opacity-60 !text-white px-3 text-xs font-medium transition-opacity"
                      >
                        {processing ? "Processing..." : "Redeem"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCodeInput(false);
                          setCode("");
                        }}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </Modal>
  );
}





