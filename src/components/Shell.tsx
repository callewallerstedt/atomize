"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { LessonBody } from "@/components/LessonBody";
import { sanitizeLessonBody } from "@/lib/sanitizeLesson";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "@/components/SettingsModal";
import Modal from "@/components/Modal";
import GlowSpinner from "@/components/GlowSpinner";
import type { StoredSubjectData } from "@/utils/storage";

// Generate stable dots that don't change on re-render
function generateDots(count: number) {
  return Array.from({ length: count }).map((_, i) => {
    const size = Math.random() * 2 + 1;
    const isCyan = Math.random() > 0.5;
    const color = isCyan ? '#00E5FF' : '#FF2D96';
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const glowSize = Math.random() * 4 + 2;
    const duration = Math.random() * 20 + 15;
    const delay = Math.random() * 5;
    return {
      key: `loading-dot-${i}`,
      size,
      color,
      left,
      top,
      glowSize,
      duration,
      delay,
      animation: `float-${i % 3}`,
    };
  });
}

// Loading Screen Component
function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [loadingDots, setLoadingDots] = useState<ReturnType<typeof generateDots>>([]);
  
  // Generate dots only on client side to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLoadingDots(generateDots(80));
    }
  }, []);

  // Play startup sound when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const audio = new Audio('/startup.mp3');
        audio.volume = 0.3; // Set volume to 30%
        audio.play().catch(err => {
          console.log('Audio play failed:', err);
        });
      } catch (err) {
        console.log('Audio initialization failed:', err);
      }
    }
  }, []);

  useEffect(() => {
    // Start fade-out animation after 2.5 seconds
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 2500);

    // Complete loading after animation
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3000); // Show for 3 seconds total

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)] transition-all duration-500 ease-out ${
      isFadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
    }`}>
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {loadingDots.map((dot) => (
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


      {/* Spinning gradient ring - same as login page */}
      <div className="logo-wrap mb-2" style={{ width: 240, aspectRatio: "1 / 1", overflow: "visible", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "-15vh" }}>
        <div style={{ transform: "scale(1.3)", transformOrigin: "center" }}>
          <img
            src="/spinner.png"
            alt=""
            width={320}
            height={320}
            style={{ width: 320, height: 320, objectFit: "contain", transformOrigin: "center" }}
            className="animate-spin"
            loading="eager"
          />
        </div>
      </div>

      {/* Welcome text */}
      <div className="text-center">
        <h1
          className="text-7xl font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block"
          style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}
        >
          Welcome to Synapse
          <sup className="text-xl text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-1 left-full ml-1" style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>(ALPHA)</sup>
        </h1>
      </div>
    </div>
  );
}

// Feedback Modal Component
function PromoCodeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"promoCodes" | "users">("promoCodes");
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [editingCode, setEditingCode] = useState<any | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userCodeInput, setUserCodeInput] = useState<{ [userId: string]: string }>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingUser, setDeletingUser] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    subscriptionLevel: "Tester" as "Free" | "Paid" | "Tester" | "mylittlepwettybebe",
    expiresAt: "", // When the code itself expires (can't be redeemed after this)
    validityDays: "", // How many days each user gets from when they redeem
    maxUses: "",
  });
  const [userFormData, setUserFormData] = useState({
    subscriptionLevel: "Free" as "Free" | "Paid" | "Tester" | "mylittlepwettybebe",
    subscriptionStart: "",
    subscriptionEnd: "",
  });

  useEffect(() => {
    if (open) {
      if (activeTab === "promoCodes") {
        loadPromoCodes();
      } else if (activeTab === "users") {
        loadUsers();
      }
    }
  }, [open, activeTab]);

  const handleResetAll = async () => {
    if (!confirm("Are you sure you want to reset ALL user subscriptions to Free and delete ALL promo codes? This cannot be undone!")) {
      return;
    }
    if (!confirm("This will affect ALL users. Are you absolutely sure?")) {
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-subscriptions", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        alert(data.summary || `Successfully reset ${data.usersUpdated} users and deleted ${data.promoCodesDeleted} promo codes.`);
        await loadPromoCodes();
      } else {
        alert(data.error || "Failed to reset subscriptions");
      }
    } catch (err) {
      console.error("Error resetting subscriptions:", err);
      alert("Failed to reset subscriptions");
    } finally {
      setResetLoading(false);
    }
  };

  const loadPromoCodes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/promo-code/list", { credentials: "include" });
      const data = await res.json();
      if (data.ok) {
        setPromoCodes(data.promoCodes || []);
      } else {
        alert(data.error || "Failed to load promo codes");
      }
    } catch (err) {
      console.error("Error loading promo codes:", err);
      alert("Failed to load promo codes");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.code.trim()) {
      alert("Code is required");
      return;
    }

    try {
      const res = await fetch("/api/promo-code/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: formData.code.trim().toUpperCase(),
          description: formData.description.trim() || null,
          subscriptionLevel: formData.subscriptionLevel,
          expiresAt: formData.expiresAt || null, // When code itself expires
          validityDays: formData.validityDays && formData.validityDays.trim() && Number(formData.validityDays) > 0 
            ? Number(formData.validityDays) 
            : null, // Days each user gets (null = unlimited)
          maxUses: formData.maxUses && formData.maxUses.trim() ? Number(formData.maxUses) : null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFormData({ code: "", description: "", subscriptionLevel: "Tester", expiresAt: "", validityDays: "", maxUses: "" });
        await loadPromoCodes();
      } else {
        alert(data.error || "Failed to create promo code");
      }
    } catch (err) {
      console.error("Error creating promo code:", err);
      alert("Failed to create promo code");
    }
  };

  const handleUpdate = async () => {
    if (!editingCode) return;

    try {
      const res = await fetch("/api/promo-code/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: editingCode.id,
          code: formData.code.trim().toUpperCase(),
          description: formData.description.trim() || null,
          subscriptionLevel: formData.subscriptionLevel,
          expiresAt: formData.expiresAt || null, // When code itself expires
          validityDays: formData.validityDays && formData.validityDays.trim() && Number(formData.validityDays) > 0 
            ? Number(formData.validityDays) 
            : null, // Days each user gets (null = unlimited)
          maxUses: formData.maxUses && formData.maxUses.trim() ? Number(formData.maxUses) : null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setEditingCode(null);
        setFormData({ code: "", description: "", subscriptionLevel: "Tester", expiresAt: "", validityDays: "", maxUses: "" });
        await loadPromoCodes();
      } else {
        alert(data.error || "Failed to update promo code");
      }
    } catch (err) {
      console.error("Error updating promo code:", err);
      alert("Failed to update promo code");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promo code?")) return;

    try {
      const res = await fetch(`/api/promo-code/delete?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await res.json();
      if (data.ok) {
        await loadPromoCodes();
      } else {
        alert(data.error || "Failed to delete promo code");
      }
    } catch (err) {
      console.error("Error deleting promo code:", err);
      alert("Failed to delete promo code");
    }
  };

  const startEdit = (code: any) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      description: code.description || "",
      subscriptionLevel: code.subscriptionLevel,
      expiresAt: code.expiresAt ? new Date(code.expiresAt).toISOString().slice(0, 16) : "",
      validityDays: code.validityDays ? String(code.validityDays) : "",
      maxUses: code.maxUses ? String(code.maxUses) : "",
    });
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setFormData({ code: "", description: "", subscriptionLevel: "Tester", expiresAt: "", validityDays: "", maxUses: "" });
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (data.ok) {
        setUsers(data.users || []);
      } else {
        alert(data.error || "Failed to load users");
      }
    } catch (err) {
      console.error("Error loading users:", err);
      alert("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  const handleRedeemCodeForUser = async (userId: string, code: string) => {
    if (!code.trim()) {
      alert("Please enter a code");
      return;
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, code: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(data.message || "Code redeemed successfully!");
        setUserCodeInput({ ...userCodeInput, [userId]: "" });
        await loadUsers();
      } else {
        alert(data.error || "Failed to redeem code");
      }
    } catch (err) {
      console.error("Error redeeming code:", err);
      alert("Failed to redeem code");
    }
  };

  const startEditUser = (user: any) => {
    setEditingUser(user);
    setUserFormData({
      subscriptionLevel: user.subscriptionLevel || "Free",
      subscriptionStart: user.subscriptionStart ? new Date(user.subscriptionStart).toISOString().slice(0, 16) : "",
      subscriptionEnd: user.subscriptionEnd ? new Date(user.subscriptionEnd).toISOString().slice(0, 16) : "",
    });
  };

  const cancelEditUser = () => {
    setEditingUser(null);
    setUserFormData({ subscriptionLevel: "Free", subscriptionStart: "", subscriptionEnd: "" });
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: editingUser.id,
          subscriptionLevel: userFormData.subscriptionLevel,
          subscriptionStart: userFormData.subscriptionStart || null,
          subscriptionEnd: userFormData.subscriptionEnd || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert("User updated successfully!");
        setEditingUser(null);
        setUserFormData({ subscriptionLevel: "Free", subscriptionStart: "", subscriptionEnd: "" });
        await loadUsers();
      } else {
        alert(data.error || "Failed to update user");
      }
    } catch (err) {
      console.error("Error updating user:", err);
      alert("Failed to update user");
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    // Verify confirmation text matches username
    if (deleteConfirmText.trim() !== userToDelete.username) {
      alert(`Confirmation text must match the username: ${userToDelete.username}`);
      return;
    }

    setDeletingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: userToDelete.id }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(data.message || "User deleted successfully");
        setDeleteConfirmOpen(false);
        setUserToDelete(null);
        setDeleteConfirmText("");
        loadUsers(); // Refresh the list
      } else {
        alert(data.error || "Failed to delete user");
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert("Failed to delete user");
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Founders Toolbox">
      <div className="space-y-4 pb-4">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--foreground)]/20">
          <button
            onClick={() => setActiveTab("promoCodes")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "promoCodes"
                ? "text-[var(--accent-cyan)] border-b-2 border-[var(--accent-cyan)]"
                : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
            }`}
          >
            Promo Codes
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "users"
                ? "text-[var(--accent-cyan)] border-b-2 border-[var(--accent-cyan)]"
                : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
            }`}
          >
            Users
          </button>
        </div>

        {/* Promo Codes Tab */}
        {activeTab === "promoCodes" && (
          <div className="space-y-4">
        {/* Reset All Button */}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-red-400 mb-1">Danger Zone</h3>
              <p className="text-xs text-[var(--foreground)]/60">
                Reset all user subscriptions to Free and delete all promo codes
              </p>
            </div>
            <button
              onClick={handleResetAll}
              disabled={resetLoading}
              className="px-4 py-2 rounded-full border border-red-500/50 bg-red-500/20 text-sm font-medium text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetLoading ? "Resetting..." : "Reset All"}
            </button>
          </div>
        </div>

        {/* Create/Edit Form */}
        <div className="rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/60 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {editingCode ? "Edit Promo Code" : "Create New Promo Code"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="PROMO123"
                className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Subscription Level</label>
              <select
                value={formData.subscriptionLevel}
                onChange={(e) => setFormData({ ...formData, subscriptionLevel: e.target.value as any })}
                className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
              >
                <option value="Free">Free</option>
                <option value="Paid">Premium</option>
                <option value="Tester">Tester</option>
                <option value="mylittlepwettybebe">mylittlepwettybebe</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Max Uses</label>
              <input
                type="number"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                placeholder="Unlimited"
                className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Validity Days (Per User)</label>
              <input
                type="number"
                value={formData.validityDays}
                onChange={(e) => {
                  setFormData({ ...formData, validityDays: e.target.value });
                }}
                placeholder="e.g., 30 (days each user gets)"
                min="1"
                className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
              />
              <p className="text-[10px] text-[var(--foreground)]/50 mt-1">Each user gets this many days from when they redeem (leave empty for unlimited)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Code Expires At (Optional)</label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => {
                  setFormData({ ...formData, expiresAt: e.target.value });
                }}
                className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
              />
              <p className="text-[10px] text-[var(--foreground)]/50 mt-1">When the code itself expires (can't be redeemed after this date)</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
              className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            {editingCode && (
              <button
                onClick={cancelEdit}
                className="px-4 py-2 rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={editingCode ? handleUpdate : handleCreate}
              disabled={!formData.code.trim()}
              className="synapse-style px-4 py-2 rounded-full text-sm font-medium !text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span style={{ color: '#ffffff', position: 'relative', zIndex: 101, opacity: 1, textShadow: 'none' }}>
                {editingCode ? "Update" : "Create"}
              </span>
            </button>
          </div>
        </div>

        {/* List of Promo Codes */}
        <div className="border-t border-[var(--foreground)]/20 pt-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">All Promo Codes</h3>
          {loading ? (
            <div className="text-sm text-[var(--foreground)]/60 text-center py-4">Loading...</div>
          ) : promoCodes.length === 0 ? (
            <div className="text-sm text-[var(--foreground)]/60 text-center py-4">No promo codes yet</div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {promoCodes.map((code) => (
                <div
                  key={code.id}
                  className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[var(--foreground)] font-mono">{code.code}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
                          {code.subscriptionLevel}
                        </span>
                      </div>
                      {code.description && (
                        <p className="text-xs text-[var(--foreground)]/70 mb-2">{code.description}</p>
                      )}
                      <div className="text-xs text-[var(--foreground)]/60 space-y-0.5">
                        <div>
                          Uses: {code.currentUses || 0}
                          {code.maxUses ? ` / ${code.maxUses}` : " / Unlimited"}
                        </div>
                        {code.validityDays ? (
                          <div>
                            Validity: {code.validityDays} days per user
                          </div>
                        ) : (
                          <div>
                            Validity: <span className="text-[var(--accent-cyan)]">Unlimited</span> per user
                          </div>
                        )}
                        {code.expiresAt ? (() => {
                          const now = new Date();
                          const expires = new Date(code.expiresAt);
                          const diff = expires.getTime() - now.getTime();
                          const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
                          if (daysLeft <= 0) {
                            return (
                              <div>
                                Code expires: <span className="text-red-400">Expired</span>
                              </div>
                            );
                          }
                          return (
                            <div>
                              Code expires: <span className="text-[var(--accent-cyan)]">{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>
                            </div>
                          );
                        })() : (
                          <div>
                            Code expires: <span className="text-[var(--accent-cyan)]">Never</span>
                          </div>
                        )}
                        <div>
                          Created: {new Date(code.createdAt).toLocaleString()}
                        </div>
                        {code.redemptions && code.redemptions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[var(--foreground)]/10">
                            <div className="font-medium mb-1">Redeemed by:</div>
                            {code.redemptions.map((r: any) => (
                              <div key={r.id} className="text-[10px]">
                                {r.user?.username || "Unknown"} ({r.user?.email || "no email"}) - {new Date(r.redeemedAt).toLocaleString()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => startEdit(code)}
                        className="px-3 py-1.5 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/70 text-xs text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(code.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* Edit User Form */}
            {editingUser && (
              <div className="rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/60 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Edit User: {editingUser.username}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Subscription Level</label>
                    <select
                      value={userFormData.subscriptionLevel}
                      onChange={(e) => setUserFormData({ ...userFormData, subscriptionLevel: e.target.value as any })}
                      className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
                    >
                      <option value="Free">Free</option>
                      <option value="Paid">Premium</option>
                      <option value="Tester">Tester</option>
                      <option value="mylittlepwettybebe">mylittlepwettybebe</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Subscription Start</label>
                    <input
                      type="datetime-local"
                      value={userFormData.subscriptionStart}
                      onChange={(e) => setUserFormData({ ...userFormData, subscriptionStart: e.target.value })}
                      className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-1">Subscription End</label>
                    <input
                      type="datetime-local"
                      value={userFormData.subscriptionEnd}
                      onChange={(e) => setUserFormData({ ...userFormData, subscriptionEnd: e.target.value })}
                      className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
                    />
                    <p className="text-[10px] text-[var(--foreground)]/50 mt-1">Leave empty for no expiration</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cancelEditUser}
                    className="px-4 py-2 rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateUser}
                    className="synapse-style px-4 py-2 rounded-full text-sm font-medium !text-white transition-opacity"
                  >
                    <span style={{ color: '#ffffff', position: 'relative', zIndex: 101, opacity: 1, textShadow: 'none' }}>
                      Update User
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Users List */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">All Users</h3>
              {usersLoading ? (
                <div className="text-sm text-[var(--foreground)]/60 text-center py-4">Loading...</div>
              ) : users.length === 0 ? (
                <div className="text-sm text-[var(--foreground)]/60 text-center py-4">No users found</div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-[var(--foreground)]">{user.username}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              user.subscriptionLevel === "Tester" ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" :
                              user.subscriptionLevel === "Paid" ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]" :
                              user.subscriptionLevel === "mylittlepwettybebe" ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]" :
                              "bg-[var(--foreground)]/20 text-[var(--foreground)]/70"
                            }`}>
                              {user.subscriptionLevel === "Paid" ? "Premium" : user.subscriptionLevel}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--foreground)]/60 space-y-0.5">
                            {user.email && (
                              <div>Email: {user.email}</div>
                            )}
                            {user.promoCodeUsed && (
                              <div>Promo Code: <span className="font-mono">{user.promoCodeUsed}</span></div>
                            )}
                            {user.subscriptionStart && (
                              <div>Start: {new Date(user.subscriptionStart).toLocaleString()}</div>
                            )}
                            {user.subscriptionEnd && (
                              <div>Ends: {new Date(user.subscriptionEnd).toLocaleString()}</div>
                            )}
                            {user.lastLoginAt && (
                              <div>Last Online: {new Date(user.lastLoginAt).toLocaleString()}</div>
                            )}
                            <div>Created: {new Date(user.createdAt).toLocaleString()}</div>
                          </div>
                          {/* Redeem Code Input */}
                          <div className="mt-2 pt-2 border-t border-[var(--foreground)]/10">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={userCodeInput[user.id] || ""}
                                onChange={(e) => setUserCodeInput({ ...userCodeInput, [user.id]: e.target.value })}
                                placeholder="Enter promo code"
                                className="flex-1 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--accent-cyan)] focus:outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleRedeemCodeForUser(user.id, userCodeInput[user.id] || "");
                                  }
                                }}
                              />
                              <button
                                onClick={() => handleRedeemCodeForUser(user.id, userCodeInput[user.id] || "")}
                                className="synapse-style px-3 py-1.5 rounded-lg text-xs font-medium !text-white"
                              >
                                <span style={{ color: '#ffffff', position: 'relative', zIndex: 101, opacity: 1, textShadow: 'none' }}>
                                  Redeem
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => startEditUser(user)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/70 text-xs text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setUserToDelete(user);
                              setDeleteConfirmText("");
                              setDeleteConfirmOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-500 hover:bg-red-500/20 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Delete User Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setUserToDelete(null);
          setDeleteConfirmText("");
        }}
        title="⚠️ Delete User Account"
        footer={
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setDeleteConfirmOpen(false);
                setUserToDelete(null);
                setDeleteConfirmText("");
              }}
              className="px-4 py-2 rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
              disabled={deletingUser}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteUser}
              disabled={deleteConfirmText.trim() !== userToDelete?.username || deletingUser}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingUser ? "Deleting..." : "Delete Permanently"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-semibold text-red-500 mb-2">⚠️ WARNING: This action cannot be undone!</p>
            <p className="text-xs text-[var(--foreground)]/80">
              This will permanently delete the user account <strong>{userToDelete?.username}</strong> and ALL associated data including:
            </p>
            <ul className="text-xs text-[var(--foreground)]/70 mt-2 ml-4 list-disc space-y-1">
              <li>All courses and course data</li>
              <li>All lessons and generated content</li>
              <li>All exam snipes</li>
              <li>All flashcards and progress</li>
              <li>All shared courses</li>
              <li>All subscription information</li>
            </ul>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground)] mb-2">
              Type the username <strong>{userToDelete?.username}</strong> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={userToDelete?.username}
              className="w-full rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-4 py-2 text-sm text-[var(--foreground)] focus:border-red-500 focus:outline-none"
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

function FeedbackModal({ 
  open, 
  onClose, 
  subscriptionLevel,
  pathname,
  onFeedbackSent
}: { 
  open: boolean; 
  onClose: () => void;
  subscriptionLevel: string;
  pathname: string;
  onFeedbackSent: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [allFeedback, setAllFeedback] = useState<any[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const isTester = subscriptionLevel === "Tester" || subscriptionLevel === "mylittlepwettybebe";


  useEffect(() => {
    if (open && isTester) {
      // Load all feedback for testers
      setLoadingFeedback(true);
      fetch("/api/feedback")
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) {
            setAllFeedback(data.feedback || []);
          }
          setLoadingFeedback(false);
        })
        .catch((err) => {
          console.error("Error loading feedback:", err);
          setLoadingFeedback(false);
        });
    }
  }, [open, isTester]);

  const handleSubmit = async () => {
    if (!feedback.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: feedback.trim(),
          page: pathname,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFeedback("");
        onClose(); // Close the feedback modal
        onFeedbackSent(); // Trigger thank you modal in parent
        if (isTester) {
          // Reload feedback list
          const refreshRes = await fetch("/api/feedback");
          const refreshData = await refreshRes.json();
          if (refreshData.ok) {
            setAllFeedback(refreshData.feedback || []);
          }
        }
      } else {
        alert(data.error || "Failed to submit feedback");
      }
    } catch (err) {
      console.error("Error submitting feedback:", err);
      alert("Failed to submit feedback");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isTester ? "Feedback" : "Leave Feedback"}
    >
      <div className="space-y-4 pb-4">
        {!isTester ? (
          <>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-2">
                Your feedback
              </label>
              <div className="w-full chat-input-container rounded-xl border border-[var(--foreground)]/20 px-3 py-2">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us what you think, report bugs, or suggest features..."
                  className="w-full bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none resize-none"
                  rows={6}
                  disabled={sending}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-2 md:px-4 pb-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/70 text-sm text-[var(--foreground)] hover:bg-[var(--background)]/50 transition-colors"
                disabled={sending}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!feedback.trim() || sending}
                className="synapse-style px-4 py-2 rounded-full text-sm font-medium !text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ zIndex: 100, position: 'relative' }}
              >
                <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                  {sending ? "Sending..." : "Send Feedback"}
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4 pb-4">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)]/70 mb-2">
                Submit new feedback
              </label>
              <div className="w-full chat-input-container rounded-xl border border-[var(--foreground)]/20 px-3 py-2">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us what you think, report bugs, or suggest features..."
                  className="w-full bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:outline-none resize-none"
                  rows={4}
                  disabled={sending}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-2 md:px-4 pb-2">
              <button
                onClick={handleSubmit}
                disabled={!feedback.trim() || sending}
                className="synapse-style px-4 py-2 rounded-full text-sm font-medium !text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ zIndex: 100, position: 'relative' }}
              >
                <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                  {sending ? "Sending..." : "Send Feedback"}
                </span>
              </button>
            </div>
            <div className="border-t border-[var(--foreground)]/20 pt-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">All Feedback</h3>
              {loadingFeedback ? (
                <div className="text-sm text-[var(--foreground)]/60 text-center py-4">Loading...</div>
              ) : allFeedback.length === 0 ? (
                <div className="text-sm text-[var(--foreground)]/60 text-center py-4">No feedback yet</div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {allFeedback.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 space-y-2 ${
                        item.done 
                          ? "border-[var(--foreground)]/10 bg-[var(--background)]/40 opacity-60" 
                          : "border-[var(--foreground)]/15 bg-[var(--background)]/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="text-xs text-[var(--foreground)]/60 mb-1">
                            <span className="font-medium">{item.user?.username || "Unknown"}</span>
                            {" • "}
                            <span className="font-mono text-[10px]">{item.page}</span>
                            {" • "}
                            <span>{new Date(item.createdAt).toLocaleString()}</span>
                            {item.done && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400">
                                Done
                              </span>
                            )}
                          </div>
                          <p className={`text-sm whitespace-pre-wrap ${item.done ? "text-[var(--foreground)]/50 line-through" : "text-[var(--foreground)]"}`}>
                            {item.message}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.done || false}
                              onChange={async (e) => {
                                const newDone = e.target.checked;
                                // Optimistically update UI immediately
                                setAllFeedback((prev) =>
                                  prev.map((f) =>
                                    f.id === item.id ? { ...f, done: newDone } : f
                                  )
                                );
                                try {
                                  const res = await fetch("/api/feedback", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      id: item.id,
                                      done: newDone,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (!data.ok) {
                                    // Revert on error
                                    setAllFeedback((prev) =>
                                      prev.map((f) =>
                                        f.id === item.id ? { ...f, done: !newDone } : f
                                      )
                                    );
                                    alert(data.error || "Failed to update feedback");
                                  }
                                } catch (err) {
                                  console.error("Error updating feedback:", err);
                                  // Revert on error
                                  setAllFeedback((prev) =>
                                    prev.map((f) =>
                                      f.id === item.id ? { ...f, done: !newDone } : f
                                    )
                                  );
                                  alert("Failed to update feedback");
                                }
                              }}
                              className="sr-only"
                            />
                            <div 
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                item.done 
                                  ? 'bg-[var(--accent-cyan)] border-[var(--accent-cyan)]' 
                                  : 'bg-[var(--background)] border-[var(--foreground)]/40'
                              }`}
                            >
                              {item.done && (
                                <svg 
                                  className="w-3 h-3 text-white" 
                                  fill="none" 
                                  viewBox="0 0 24 24" 
                                  stroke="currentColor" 
                                  strokeWidth="3"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </label>
                          <button
                            onClick={async () => {
                              if (!confirm("Are you sure you want to delete this feedback?")) return;
                              try {
                                const res = await fetch("/api/feedback", {
                                  method: "DELETE",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: item.id }),
                                });
                                const data = await res.json();
                                if (data.ok) {
                                  // Remove from local state
                                  setAllFeedback((prev) => prev.filter((f) => f.id !== item.id));
                                } else {
                                  alert(data.error || "Failed to delete feedback");
                                }
                              } catch (err) {
                                console.error("Error deleting feedback:", err);
                                alert("Failed to delete feedback");
                              }
                            }}
                            className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
                            title="Delete feedback"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Clock Display Component
function ClockDisplay() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  return (
    <div className="flex items-center justify-center">
      <span className="text-lg font-mono font-medium text-[var(--foreground)]">
        {formatTime(time)}
      </span>
    </div>
  );
}

// Temperature Display Component
function TemperatureDisplay() {
  const [temperature, setTemperature] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemperature = async () => {
      try {
        // Get user's location
        if (!navigator.geolocation) {
          setError("Geolocation not supported");
          setLoading(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
              // Using OpenWeatherMap API (free tier)
              // You'll need to add your API key to environment variables
              const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY || '';
              
              if (!apiKey) {
                // Fallback: Use a free weather API that doesn't require key
                const response = await fetch(
                  `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`
                );
                
                if (!response.ok) throw new Error('Weather API failed');
                
                const data = await response.json();
                const temp = Math.round(data.current.temperature_2m);
                setTemperature(temp);
                setLoading(false);
              } else {
                // Use OpenWeatherMap if API key is available
                const response = await fetch(
                  `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`
                );
                
                if (!response.ok) throw new Error('Weather API failed');
                
                const data = await response.json();
                setTemperature(Math.round(data.main.temp));
                setLoading(false);
              }
            } catch (err) {
              console.error('Error fetching weather:', err);
              setError("Failed to fetch");
              setLoading(false);
            }
          },
          (err) => {
            console.error('Geolocation error:', err);
            setError("Location denied");
            setLoading(false);
          },
          { timeout: 10000 }
        );
      } catch (err) {
        console.error('Error:', err);
        setError("Error");
        setLoading(false);
      }
    };

    fetchTemperature();
    
    // Refresh temperature every 10 minutes
    const interval = setInterval(fetchTemperature, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--background)]/60 backdrop-blur-sm border border-[var(--foreground)]/10">
        <svg className="w-4 h-4 text-[var(--foreground)]/70 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-sm text-[var(--foreground)]/50">--°</span>
      </div>
    );
  }

  if (error || temperature === null) {
    return null; // Don't show anything if there's an error
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--background)]/60 backdrop-blur-sm border border-[var(--foreground)]/10">
      <svg className="w-4 h-4 text-[var(--foreground)]/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
      <span className="text-sm font-medium text-[var(--foreground)]">
        {temperature}°C
      </span>
    </div>
  );
}

// Pomodoro Timer Component
function PomodoroTimer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [studyTime, setStudyTime] = useState(25);
  const [breakTime, setBreakTime] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);

  // Play notification sound
  const playNotificationSound = () => {
    if (typeof window !== 'undefined') {
      try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (e) {
        // Fallback: try to play a system beep or just log
        console.log('Could not play notification sound');
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(time => {
          if (time <= 1) {
            // Timer finished
            setIsRunning(false);
            setIsBreak(!isBreak);
            setShowPlayButton(true); // Show the play button

            // Play notification sound
            playNotificationSound();

            // Show browser notification
            if (typeof window !== 'undefined' && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification(isBreak ? 'Break Time!' : 'Study Time!', {
                  body: isBreak ? 'Time for a break!' : 'Time to study!',
                  icon: '/favicon.ico'
                });
              }
            }
            return isBreak ? breakTime * 60 : studyTime * 60;
          }
          return time - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, isBreak, studyTime, breakTime]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettings && !(event.target as Element).closest('.pomodoro-timer')) {
        setShowSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeLeft(studyTime * 60);
    setShowPlayButton(false);
  };

  const toggleTimer = () => {
    setIsRunning(!isRunning);
    setShowPlayButton(false);
  };

  const startNextTimer = () => {
    setIsRunning(true);
    setShowPlayButton(false);
  };

  return (
    <div className="relative pomodoro-timer">
      {/* Icon mode when not running */}
      {!isRunning && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
            }}
            className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                       focus:outline-none focus:ring-0 focus-visible:outline-none
                       transition-all duration-300 ease-out"
            style={{ 
              outline: 'none', 
              WebkitTapHighlightColor: 'transparent', 
              transform: 'none !important',
              borderRadius: '50%',
              margin: 0,
              display: 'flex',
              height: '32px',
              width: '32px',
              boxShadow: 'none',
            }}
            aria-label="Pomodoro Timer"
            title="Pomodoro Timer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
      )}
      
      {/* Expanded mode when running */}
      {isRunning && (
        <div
          className="inline-block rounded-xl transition-all duration-300"
          style={{
            padding: '1.5px',
            background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.9), rgba(255, 45, 150, 0.9))';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(255, 45, 150, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 229, 255, 0.8), rgba(255, 45, 150, 0.8))';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
          }}
        >
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="relative inline-flex items-center justify-between gap-1 px-1.5 py-1.5 min-w-[100px]
                       text-white bg-[var(--background)]/90 backdrop-blur-md
                       transition-all duration-300 ease-out"
            style={{
              borderRadius: 'calc(0.75rem - 1.5px)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-lg sm:text-xl font-bold leading-none">
                {formatTime(timeLeft)}
              </span>
              <span className="text-[10px] sm:text-xs opacity-75">
                {isBreak ? 'BREAK' : 'STUDY'}
              </span>
            </div>
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Next Timer Play Button */}
      {showPlayButton && (
        <button
          onClick={startNextTimer}
          className="synapse-style hidden md:flex md:absolute md:-right-12 md:top-1/2 md:-translate-y-1/2 w-8 h-8 rounded-full
                     text-white
                     flex items-center justify-center shadow-lg hover:shadow-xl
                     transition-all duration-200 hover:scale-110 animate-pulse"
          title={`Start ${isBreak ? 'Break' : 'Study'} Timer`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-[100]">
          <div className="relative rounded-xl p-4
                         bg-[var(--background)]/95 backdrop-blur-md
                         shadow-[0_4px_12px_rgba(0,0,0,0.7)]
                         overflow-hidden">
            <div className="space-y-3 min-w-[220px]">
              <div className="text-center">
                <h3 className="text-[var(--foreground)] font-semibold text-sm">Pomodoro Controls</h3>
              </div>

              {/* Quick Controls */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleTimer}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[#00E5FF]/20 text-[#00E5FF]
                           text-xs hover:bg-[#00E5FF]/30 transition-colors border border-[#00E5FF]/30"
                >
                  {isRunning ? (
                    <>
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                      Play
                    </>
                  )}
                </button>

                <button
                  onClick={resetTimer}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--background)]/60 text-[var(--foreground)]
                           text-xs hover:bg-[var(--background)]/80 transition-colors border border-[var(--accent-cyan)]/20"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
              </div>

              <button
                onClick={() => {
                  setIsBreak(!isBreak);
                  setTimeLeft(isBreak ? studyTime * 60 : breakTime * 60);
                  setIsRunning(false);
                }}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]
                         text-xs hover:bg-[var(--accent-pink)]/30 transition-colors border border-[var(--accent-pink)]/30"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {isBreak ? 'Start Study' : 'Take Break'}
              </button>

              {/* Time Settings */}
              <div className="border-t border-[var(--accent-cyan)]/20 pt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-[var(--foreground)]/70 mb-1">Study (min)</label>
                    <input
                      type="number"
                      value={studyTime}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(60, parseInt(e.target.value) || 25));
                        setStudyTime(val);
                        if (!isBreak && !isRunning) setTimeLeft(val * 60);
                      }}
                      className="w-full px-2 py-1 rounded text-xs bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20
                               text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]
                               transition-colors"
                      min="1"
                      max="60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[var(--foreground)]/70 mb-1">Break (min)</label>
                    <input
                      type="number"
                      value={breakTime}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(30, parseInt(e.target.value) || 5));
                        setBreakTime(val);
                      }}
                      className="w-full px-2 py-1 rounded text-xs bg-[var(--background)]/60 border border-[var(--accent-cyan)]/20
                               text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]
                               transition-colors"
                      min="1"
                      max="30"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1 rounded text-xs bg-[var(--background)]/60 text-[var(--foreground)]/70
                           hover:bg-[var(--background)]/80 hover:text-[var(--foreground)] transition-colors border border-[var(--accent-cyan)]/20"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string; // For identifying messages (e.g., for updating loading states)
  uiElements?: Array<{
    type: 'button' | 'file_upload';
    id: string;
    label?: string;
    action?: string;
    params?: Record<string, string>;
    message?: string;
  }>;
  isLoading?: boolean; // For showing loading spinner
  flashcardGeneration?: { slug: string; topic: string; count: number }; // For flashcard generation state
  flashcardSuccess?: boolean; // For flashcard generation success
  hidden?: boolean; // For messages that should be in context but not displayed
};

type ChatHistory = {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
};

// File upload component
function FileUploadArea({ 
  uploadId, 
  message, 
  files, 
  onFilesChange, 
  onGenerate,
  buttonLabel,
  action,
  status,
  hasPremiumAccess = true
}: { 
  uploadId: string; 
  message?: string; 
  files: File[]; 
  onFilesChange: (files: File[]) => void;
  onGenerate: () => void;
  buttonLabel?: string;
  action?: string;
  status?: 'idle' | 'ready' | 'processing' | 'success';
  hasPremiumAccess?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onFilesChange(droppedFiles);
    }
  };
  
  if (!hasPremiumAccess) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border-2 border-dashed p-4 border-[var(--foreground)]/20 bg-[var(--background)]/40">
          <div className="text-xs text-[var(--foreground)]/50 text-center">
            ⚠️ This feature requires Premium access
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
          isDragging
            ? 'border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10'
            : 'border-[var(--accent-cyan)]/40 bg-[var(--background)]/60 hover:border-[var(--accent-cyan)]/60 hover:bg-[var(--background)]/80'
        }`}
      >
        <div className="text-xs text-[var(--foreground)]/70 text-center">
          {isDragging ? 'Drop files here' : (message || 'Upload files or drag and drop')}
        </div>
        {files.length > 0 && (
          <div className="mt-2 text-xs text-[var(--foreground)]/60">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => {
          if (!hasPremiumAccess) return;
          const selectedFiles = Array.from(e.target.files || []);
          if (selectedFiles.length > 0) {
            onFilesChange(selectedFiles);
          }
        }}
        disabled={!hasPremiumAccess}
      />
      {files.length > 0 && (
        <button
          onClick={onGenerate}
          disabled={!hasPremiumAccess}
          className="synapse-style w-full inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium !text-white transition-opacity disabled:opacity-50"
          style={{ color: 'white', zIndex: 100, position: 'relative' }}
        >
          <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
            {buttonLabel || 'Create'}
          </span>
        </button>
      )}
      {status === 'processing' && (
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--foreground)]/60">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          Starting...
        </div>
      )}
      {status === 'success' && (
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--accent-cyan)]/90">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 011.414-1.414L8.5 11.086l6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Started Exam Analysis
        </div>
      )}
    </div>
  );
}

function ChatDropdown({ fullscreen = false, hasPremiumAccess = true }: { fullscreen?: boolean; hasPremiumAccess?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(fullscreen);
  
  // Don't render chat for free users
  if (!hasPremiumAccess) {
    return null;
  }
  const [showFullChat, setShowFullChat] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'ready' | 'processing' | 'success'>>({});
  const [fetchingContext, setFetchingContext] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 480, h: 460 });
  const [resizing, setResizing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageContentRef = useRef<string>('');
  const chatInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const chatDropdownRef = useRef<HTMLDivElement>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const pathname = usePathname();
  const [preferredAddress, setPreferredAddress] = useState<string | null>(null);
  const homeResetRef = useRef(false);
  const insertedWelcomeRef = useRef(false);
  const lastSavedRef = useRef<string>('');
  const isLoadingFromHistoryRef = useRef<boolean>(false);
  const pendingWelcomeMessageRef = useRef<{ welcomeMessage: string; userMessage: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Don't render anything in fullscreen mode (handled elsewhere)
  if (fullscreen) {
    return null;
  }

  // Load chat history from localStorage (skip when we intentionally reset on the homepage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pathname === '/') {
      setChatHistory([]);
      return;
    }
    try {
      const stored = localStorage.getItem('chatHistory');
      if (stored) {
        setChatHistory(JSON.parse(stored));
      } else {
        setChatHistory([]);
      }
    } catch {
      setChatHistory([]);
    }
  }, [pathname]);

  // Fetch preferred address/prefix for personalized greetings
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!isMounted) return;
        const prefs = data?.user?.preferences || {};
        const customTitle = typeof prefs?.customTitle === 'string' ? prefs.customTitle : null;
        const storedTitle = typeof prefs?.preferredTitle === 'string' ? prefs.preferredTitle : null;
        setPreferredAddress(customTitle || storedTitle || null);
      } catch {
        if (isMounted) {
          setPreferredAddress(null);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const buildWelcomeMessage = useCallback(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const timeStamp = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const hours = now.getHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hours >= 5 && hours < 12) timeOfDay = 'morning';
    else if (hours >= 12 && hours < 17) timeOfDay = 'afternoon';
    else if (hours >= 17 && hours < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';
    const honorific = (preferredAddress?.trim() || 'legend').replace(/\s+/g, ' ');
    const vibeMap: Record<typeof timeOfDay, string> = {
      morning: "let's brew some fresh neurons before the rest of the campus wakes up.",
      afternoon: "perfect time to turn that momentum into a mini breakthrough.",
      evening: "ideal for a focused power session before you log off.",
      night: "the late-night lab lights are glowing just for you."
    };
    return `Welcome Back to Synapse, ${honorific}! It's a ${weekday.toLowerCase()} ${timeOfDay} (${timeStamp}) — ${vibeMap[timeOfDay]}`;
  }, [preferredAddress]);

  const resetHomepageChat = useCallback(() => {
    insertedWelcomeRef.current = true;
    lastSavedRef.current = '';
    setCurrentChatId(null);
    setMessages([{ role: 'assistant', content: buildWelcomeMessage() }]);
    setInput("");
    setChatHistory([]);
    try {
      localStorage.removeItem('chatHistory');
    } catch {}
  }, [buildWelcomeMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pathname === '/') {
      if (!homeResetRef.current) {
        homeResetRef.current = true;
        resetHomepageChat();
      }
    } else {
      homeResetRef.current = false;
      insertedWelcomeRef.current = false;
    }
  }, [pathname, resetHomepageChat]);

  useEffect(() => {
    if (pathname !== '/' || !insertedWelcomeRef.current) return;
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.role === 'assistant') {
        const welcome = buildWelcomeMessage();
        if (prev[0].content === welcome) return prev;
        return [{ ...prev[0], content: welcome }];
      }
      return prev;
    });
  }, [pathname, buildWelcomeMessage]);

  useEffect(() => {
    if (insertedWelcomeRef.current && messages.some((m) => m.role === 'user')) {
      insertedWelcomeRef.current = false;
    }
  }, [messages]);

  useEffect(() => {
    const handleOpenChat = () => {
      // Clear welcome messages when opening chat modal (not on homepage)
      if (pathname !== '/') {
        setMessages(prev => {
          const filtered = prev.filter(msg => {
            if (msg.role === 'assistant' && msg.content) {
              const isWelcomeMessage = msg.content.includes('Welcome Back to Synapse') || 
                                       msg.content.includes('Welcome to Synapse') ||
                                       msg.content.match(/It's a \w+ (morning|afternoon|evening|night)/);
              return !isWelcomeMessage;
            }
            return true;
          });
          return filtered;
        });
      }
      setOpen(true);
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
      });
    };

    const handleToggleChat = () => {
      setOpen(prev => {
        const newState = !prev;
        if (newState) {
          // Clear welcome messages when opening chat modal (not on homepage)
          if (pathname !== '/') {
            setMessages(prevMessages => {
              const filtered = prevMessages.filter(msg => {
                if (msg.role === 'assistant' && msg.content) {
                  const isWelcomeMessage = msg.content.includes('Welcome Back to Synapse') || 
                                           msg.content.includes('Welcome to Synapse') ||
                                           msg.content.match(/It's a \w+ (morning|afternoon|evening|night)/);
                  return !isWelcomeMessage;
                }
                return true;
              });
              return filtered;
            });
          }
          requestAnimationFrame(() => {
            chatInputRef.current?.focus();
          });
        }
        return newState;
      });
    };

    const handleOpenChatWithMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { welcomeMessage, welcomeName, userMessage } = customEvent.detail || {};
      
      if (userMessage) {
        // Set messages with user message only (no welcome message)
        setMessages([
          { role: 'user', content: userMessage }
        ]);
        insertedWelcomeRef.current = false;
        setOpen(true);
        // Store for processing in next effect
        pendingWelcomeMessageRef.current = { welcomeMessage: '', userMessage };
      } else {
        setOpen(true);
      }
      requestAnimationFrame(() => {
        chatInputRef.current?.focus();
      });
    };

    document.addEventListener('synapse:open-chat', handleOpenChat as EventListener);
    document.addEventListener('synapse:toggle-chat', handleToggleChat as EventListener);
    document.addEventListener('synapse:open-chat-with-message', handleOpenChatWithMessage as EventListener);
    return () => {
      document.removeEventListener('synapse:open-chat', handleOpenChat as EventListener);
      document.removeEventListener('synapse:toggle-chat', handleToggleChat as EventListener);
      document.removeEventListener('synapse:open-chat-with-message', handleOpenChatWithMessage as EventListener);
    };
  }, []); // Remove 'open' from dependencies to prevent re-registration

  // ESC key handler - always active when chat is open
  useEffect(() => {
    if (!open) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };

    // Use capture phase to catch ESC before other handlers
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [open]);

  // Global keyboard listener to open chat when typing starts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore special keys and shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape' || e.key === 'Tab') {
        return;
      }

      // Check if user is already in a text input (but allow if it's our chat input)
      const activeElement = document.activeElement;
      const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.getAttribute('contenteditable') === 'true'
      );

      // If already in a text input that's NOT our chat input, don't do anything
      if (isTextInput && activeElement !== chatInputRef.current) {
        return;
      }

      // If it's a printable character, show pill under header (not full chat)
      if (e.key.length === 1 && !e.key.match(/[^\x20-\x7E]/)) {
        if (!open && !showFullChat) {
          setOpen(true);
          setShowFullChat(false); // Show pill, not full chat
          requestAnimationFrame(() => {
            chatInputRef.current?.focus();
            // Set the typed character in the input
            if (chatInputRef.current) {
              chatInputRef.current.value = e.key;
              setInput(e.key);
            }
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Save chat to history when a conversation is complete (not during streaming)
  useEffect(() => {
    // Don't save if we're loading from history
    if (isLoadingFromHistoryRef.current) {
      isLoadingFromHistoryRef.current = false;
      const messagesKey = JSON.stringify(messages);
      lastSavedRef.current = messagesKey;
      return;
    }

    if (messages.length > 0 && !sending && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content) {
      // Filter out welcome messages before saving
      const filteredMessages = messages.filter(msg => {
        if (msg.role === 'assistant' && msg.content) {
          const isWelcomeMessage = msg.content.includes('Welcome Back to Synapse') || 
                                   msg.content.includes('Welcome to Synapse') ||
                                   msg.content.match(/It's a \w+ (morning|afternoon|evening|night)/);
          return !isWelcomeMessage;
        }
        return true;
      });
      
      // Don't save if all messages were filtered out (only welcome messages)
      if (filteredMessages.length === 0) return;
      
      const messagesKey = JSON.stringify(filteredMessages);
      if (messagesKey === lastSavedRef.current) return;
      const now = Date.now();
      if (currentChatId) {
        const updated = chatHistory.map(c => c.id === currentChatId ? { ...c, messages: [...filteredMessages], timestamp: now } : c);
        setChatHistory(updated);
        lastSavedRef.current = messagesKey;
        try { localStorage.setItem('chatHistory', JSON.stringify(updated)); } catch {}
      } else {
        const firstUserMessage = filteredMessages.find(m => m.role === 'user');
        const title = firstUserMessage ? (firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')) : 'Conversation';
        const newChat: ChatHistory = { id: now.toString(), title, messages: [...filteredMessages], timestamp: now };
        const updated = [newChat, ...chatHistory].slice(0, 50);
        setChatHistory(updated);
        setCurrentChatId(newChat.id);
        lastSavedRef.current = messagesKey;
        try { localStorage.setItem('chatHistory', JSON.stringify(updated)); } catch {}
      }
    }
  }, [messages, sending, chatHistory, currentChatId]);

  function startNewChat() {
    insertedWelcomeRef.current = false;
    setMessages([]);
    setInput("");
    lastSavedRef.current = '';
    setCurrentChatId(null);
  }

  const appendTranscriptionText = (text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    setInput((prev) => {
      if (!prev) return trimmed;
      const needsSpace = /\s$/.test(prev) ? '' : ' ';
      return `${prev}${needsSpace}${trimmed}`;
    });
    requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
  };

  const cleanupMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopActiveRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupMediaStream();
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    setVoiceError(null);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice-input.webm');
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Failed to transcribe audio.');
      }
      appendTranscriptionText(String(json.text || '').trim());
    } catch (err: any) {
      setVoiceError(err?.message || 'Voice transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleToggleRecording = async () => {
    if (isTranscribing) return;
    if (isRecording) {
      setIsRecording(false);
      stopActiveRecording();
      return;
    }
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setVoiceError('Voice recording is not available in this environment.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setVoiceError('Microphone recording is not supported in this browser yet.');
      return;
    }
    try {
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        cleanupMediaStream();
        setIsRecording(false);
        const chunks = audioChunksRef.current.splice(0);
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        await transcribeAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Microphone access failed', err);
      cleanupMediaStream();
      setIsRecording(false);
      setVoiceError(
        err?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Unable to access the microphone.'
      );
    }
  };

  useEffect(() => {
    return () => {
      stopActiveRecording();
      cleanupMediaStream();
    };
  }, []);

  function loadChat(chat: ChatHistory) {
    isLoadingFromHistoryRef.current = true;
    insertedWelcomeRef.current = false;
    // Filter out welcome messages when loading chat history
    const filteredMessages = chat.messages.filter(msg => {
      if (msg.role === 'assistant' && msg.content) {
        // Check if it's a welcome message pattern
        const isWelcomeMessage = msg.content.includes('Welcome Back to Synapse') || 
                                 msg.content.includes('Welcome to Synapse') ||
                                 msg.content.match(/It's a \w+ (morning|afternoon|evening|night)/);
        return !isWelcomeMessage;
      }
      return true;
    });
    setMessages(filteredMessages);
    setCurrentChatId(chat.id);
  }

  function deleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = chatHistory.filter(c => c.id !== id);
    setChatHistory(updated);
    try {
      localStorage.setItem('chatHistory', JSON.stringify(updated));
    } catch {}
  }

  // Track message content changes for streaming and new messages
  useEffect(() => {
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const currentContent = lastMessage?.content || '';
    if (currentContent !== lastMessageContentRef.current) {
      lastMessageContentRef.current = currentContent;
      setScrollTrigger(prev => prev + 1);
    }
  }, [messages.length]);
  
  // Also poll during streaming to catch content updates
  useEffect(() => {
    if (!open || !sending) return;
    
    const interval = setInterval(() => {
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const currentContent = lastMessage?.content || '';
      if (currentContent !== lastMessageContentRef.current) {
        lastMessageContentRef.current = currentContent;
        setScrollTrigger(prev => prev + 1);
      }
    }, 100); // Check every 100ms during streaming
    
    return () => clearInterval(interval);
  }, [open, sending, messages.length]);

  // Function to compress course/subject data for context (including exam snipe)
  async function getCompressedCourseContext(): Promise<string> {
    if (typeof window === 'undefined') return '';
    try {
      const subjectsRaw = localStorage.getItem('atomicSubjects');
      if (!subjectsRaw) return '';
      
      const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
      const contextParts: string[] = [];
      
      // Fetch exam snipe history
      let examSnipeData: any[] = [];
      try {
        const examRes = await fetch('/api/exam-snipe/history', { credentials: 'include' });
        const examJson = await examRes.json().catch(() => ({}));
        if (examJson?.ok && Array.isArray(examJson.history)) {
          examSnipeData = examJson.history;
        }
      } catch {}
      
      for (const subject of subjects) {
        if (subject.slug === 'quicklearn') continue;
        
        const subjectDataRaw = localStorage.getItem(`atomicSubjectData:${subject.slug}`);
        const courseInfo: string[] = [];
        
        // Course name, slug, and description - IMPORTANT: slug is needed for navigation
        courseInfo.push(`Course: ${subject.name} (slug: ${subject.slug})`);
        
        if (subjectDataRaw) {
          try {
            const subjectData = JSON.parse(subjectDataRaw);
            if (subjectData.course_context) {
              courseInfo.push(`Description: ${subjectData.course_context.slice(0, 200)}`);
            }
            if (subjectData.course_quick_summary) {
              courseInfo.push(`Summary: ${subjectData.course_quick_summary.slice(0, 200)}`);
            }
            
            // Topics list - use same logic as course page
            let topicNames: string[] = [];
            // Prefer new topics format
            if (subjectData.topics && Array.isArray(subjectData.topics) && subjectData.topics.length > 0) {
              topicNames = subjectData.topics.map((t: any) => {
                if (typeof t === 'string') return t;
                return t.name || String(t);
              });
            } else if (subjectData.tree?.topics && Array.isArray(subjectData.tree.topics)) {
              // Legacy fallback: extract from tree.topics
              topicNames = subjectData.tree.topics.map((t: any) => {
                if (typeof t === 'string') return t;
                return t.name || String(t);
              });
            }
            
            if (topicNames.length > 0) {
              // Remove duplicates and limit to what's actually displayed
              const uniqueTopics = Array.from(new Set(topicNames)).slice(0, 50);
              courseInfo.push(`Topics (${uniqueTopics.length}): ${uniqueTopics.join(', ')}`);
            }
          } catch {}
        }
        
        // Check for matching exam snipe data
        const matchingExamSnipe = examSnipeData.find((exam: any) => exam.slug === subject.slug);
        if (matchingExamSnipe && matchingExamSnipe.results) {
          const results = matchingExamSnipe.results;
          const examInfo: string[] = [];
          
          examInfo.push(`EXAM SNIPE RESULTS:`);
          if (results.totalExams) {
            examInfo.push(`Total exams analyzed: ${results.totalExams}`);
          }
          if (results.gradeInfo) {
            examInfo.push(`Grade info: ${results.gradeInfo.slice(0, 150)}`);
          }
          if (results.patternAnalysis) {
            examInfo.push(`Pattern: ${results.patternAnalysis.slice(0, 200)}`);
          }
          
          // Study order (concepts in priority order)
          if (results.concepts && Array.isArray(results.concepts) && results.concepts.length > 0) {
            const studyOrder = results.concepts.map((c: any, idx: number) => {
              const name = c.name || `Concept ${idx + 1}`;
              const desc = c.description ? ` (${c.description.slice(0, 80)})` : '';
              return `${idx + 1}. ${name}${desc}`;
            }).slice(0, 15).join('\n');
            examInfo.push(`STUDY ORDER (priority):\n${studyOrder}`);
          }
          
          // Common questions (top 5)
          if (results.commonQuestions && Array.isArray(results.commonQuestions) && results.commonQuestions.length > 0) {
            const topQuestions = results.commonQuestions.slice(0, 5).map((q: any) => {
              const question = q.question || '';
              const count = q.examCount || 0;
              const points = q.averagePoints || 0;
              return `- "${question.slice(0, 100)}" (appears in ${count} exams, avg ${points} pts)`;
            }).join('\n');
            examInfo.push(`Common questions:\n${topQuestions}`);
          }
          
          if (examInfo.length > 0) {
            courseInfo.push(examInfo.join('\n'));
          }
        }
        
        if (courseInfo.length > 0) {
          contextParts.push(courseInfo.join('\n'));
        }
      }
      
      return contextParts.join('\n\n');
    } catch {
      return '';
    }
  }

  // Parse UI elements and actions from Chad's messages
  function parseUIElementsAndActions(content: string): { cleanedContent: string; uiElements: ChatMessage['uiElements']; actions: Array<{ name: string; params: Record<string, string> }> } {
    const actionRegex = /ACTION:(\w+)(?:\|([^|]+(?:\|[^|]+)*))?/g;
    const buttonRegex = /BUTTON:(\w+)(?:\|([^|]+(?:\|[^|]+)*))?/g;
    const fileUploadRegex = /FILE_UPLOAD:(\w+)(?:\|([^|]+(?:\|[^|]+)*))?/g;
    
    const uiElements: ChatMessage['uiElements'] = [];
    const actions: Array<{ name: string; params: Record<string, string> }> = [];
    
    // Parse buttons
    let match;
    while ((match = buttonRegex.exec(content)) !== null) {
      const id = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        match[2].split('|').forEach(param => {
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            // Clean value: remove any trailing text after whitespace/newline
            const spaceIndex = value.search(/[\s\n\r]/);
            if (spaceIndex > 0) {
              value = value.slice(0, spaceIndex);
            }
            if (key && value) {
              params[key] = value;
            }
          }
        });
      }
      uiElements.push({
        type: 'button',
        id,
        label: params.label || 'Button',
        action: params.action,
        params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'label' && k !== 'action'))
      });
    }
    
    // Parse file uploads
    while ((match = fileUploadRegex.exec(content)) !== null) {
      const id = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        match[2].split('|').forEach(param => {
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            // For parameters that can contain spaces (topic, name, syllabus, message, label, buttonLabel), keep the full value
            // For other parameters, stop at whitespace to prevent issues when action is in the middle of text
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel'];
            if (!spaceAllowedParams.includes(key)) {
              // Clean value: remove any trailing text after whitespace/newline
              // This prevents issues when action is in the middle of a sentence
              const spaceIndex = value.search(/[\s\n\r]/);
              if (spaceIndex > 0) {
                value = value.slice(0, spaceIndex);
              }
            }
            if (key && value) {
              params[key] = value;
            }
          }
        });
      }
      const buttonLabel = params.buttonLabel || 'Generate';
      const action = params.action || 'generate_course';
      uiElements.push({
        type: 'file_upload',
        id,
        message: params.message || 'Upload files',
        action, // Store action for the generate button
        params: {
          ...Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'message' && k !== 'action' && k !== 'buttonLabel')),
          buttonLabel // Include buttonLabel in params so FileUploadArea can access it
        }
      });
    }
    
    // Parse actions
    while ((match = actionRegex.exec(content)) !== null) {
      const actionName = match[1];
      const params: Record<string, string> = {};
      if (match[2]) {
        match[2].split('|').forEach(param => {
          const colonIndex = param.indexOf(':');
          if (colonIndex > 0) {
            const key = param.slice(0, colonIndex).trim();
            let value = param.slice(colonIndex + 1).trim();
            // For parameters that can contain spaces (topic, name, syllabus, message, etc.), keep the full value
            // For other parameters, stop at whitespace to prevent issues when action is in the middle of text
            const spaceAllowedParams = ['topic', 'name', 'syllabus', 'message', 'label', 'buttonLabel'];
            if (!spaceAllowedParams.includes(key)) {
              // Clean value: remove any trailing text after whitespace/newline
              // This prevents issues when action is in the middle of a sentence
              const spaceIndex = value.search(/[\s\n\r]/);
              if (spaceIndex > 0) {
                value = value.slice(0, spaceIndex);
              }
            }
            // For slug parameters, ensure they're clean (only alphanumeric, hyphens, underscores)
            if (key === 'slug' && value) {
              value = value.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
            }
            if (key && value) {
              params[key] = value;
            }
          }
        });
      }
      actions.push({ name: actionName, params });
    }
    
    // Remove all commands from content for display
    const cleanedContent = content
      .replace(actionRegex, '')
      .replace(buttonRegex, '')
      .replace(fileUploadRegex, '')
      .trim();
    
    return { cleanedContent, uiElements, actions };
  }
  
  // Execute actions
  function executeActions(actions: Array<{ name: string; params: Record<string, string> }>) {
    actions.forEach(action => {
      if (action.name === 'create_course') {
        const name = action.params.name || 'New Course';
        const syllabus = action.params.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course', { detail: { name, syllabus } }));
      } else if (action.name === 'open_course_modal') {
        document.dispatchEvent(new CustomEvent('synapse:open-course-modal'));
      } else if (action.name === 'navigate') {
        const path = action.params.path;
        if (path && typeof window !== 'undefined') {
          router.push(path);
        }
      } else if (action.name === 'navigate_course') {
        let slug = action.params.slug;
        if (slug && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}`);
          }
        }
      } else if (action.name === 'navigate_practice') {
        let slug = action.params.slug;
        if (slug && typeof window !== 'undefined') {
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          slug = slug.trim().replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            router.push(`/subjects/${slug}/practice`);
          }
        }
      } else if (action.name === 'navigate_topic') {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        if (slug && topic && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && topic) {
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}`);
          }
        }
      } else if (action.name === 'navigate_lesson') {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const lessonIndex = action.params.lessonIndex;
        if (slug && topic && lessonIndex !== undefined && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && topic) {
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIndex}`);
          }
        }
      } else if (action.name === 'open_flashcards') {
        let slug = action.params.slug?.trim();
        if (slug && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            // Store flashcard open intent in sessionStorage
            sessionStorage.setItem('__pendingFlashcardOpen', slug);
            // Use router.push for client-side navigation (no full page reload)
            router.push(`/subjects/${slug}`);
          }
        }
      } else if (action.name === 'open_lesson_flashcards') {
        let slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const lessonIndex = action.params.lessonIndex;
        if (slug && topic && lessonIndex !== undefined && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            // This might be a course name, try to find matching slug
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                // Try exact name match first (case-insensitive)
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  // Try partial match
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug to ensure it's valid
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && topic) {
            // Navigate to lesson page first, then trigger flashcard modal
            router.push(`/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lessonIndex}`);
            // Dispatch event to open lesson flashcards modal
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('synapse:open-lesson-flashcards', { detail: { slug, topic, lessonIndex } }));
            }, 500);
          }
        }
      } else if (action.name === 'create_flashcards') {
        const slug = action.params.slug?.trim();
        const topic = action.params.topic?.trim();
        const count = Math.max(1, Math.min(20, parseInt(action.params.count || '5', 10)));
        let content = action.params.content?.trim();
        
        if (!slug || !topic) {
          setMessages((m) => [...m, { role: 'assistant', content: 'I need a course slug and topic name to create flashcards. Please specify them.' }]);
          return;
        }
        
        // If no content provided, try to extract from page
        if (!content || content.length < 50) {
          // Try to get content from lesson-content or similar elements
          const lessonContent = document.querySelector('.lesson-content, .surge-lesson-card, [data-topic]');
          if (lessonContent) {
            content = lessonContent.textContent || '';
          }
        }
        
        if (!content || content.length < 50) {
          setMessages((m) => [...m, { role: 'assistant', content: 'I need content to create flashcards from. Please provide the content or make sure you\'re on a page with lesson content.' }]);
          return;
        }
        
        // Show loading message
        const loadingMessageId = `flashcard-loading-${Date.now()}`;
        setMessages((m) => [...m, { 
          role: 'assistant', 
          content: 'Generating Flashcards',
          id: loadingMessageId,
          isLoading: true,
          flashcardGeneration: { slug, topic, count }
        }]);
        
        // Generate flashcards
        (async () => {
          try {
            const res = await fetch('/api/generate-flashcards', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subject: slug,
                topic,
                content,
                count,
                courseContext: '', // Could be enhanced to get from context
                languageName: '', // Could be enhanced to get from course data
              }),
            });
            
            const json = await res.json().catch(() => ({}));
            
            if (!res.ok || !json?.ok || !Array.isArray(json.flashcards) || json.flashcards.length === 0) {
              throw new Error(json?.error || 'Failed to generate flashcards');
            }
            
            // Save flashcards to topic
            const { loadSubjectData, saveSubjectData } = await import('@/utils/storage');
            const data = loadSubjectData(slug);
            if (!data) {
              throw new Error('Course not found');
            }
            
            // Get or create topic content
            let topicContent = data.nodes[topic];
            if (!topicContent || typeof topicContent === 'string') {
              // Create new topic content with a single lesson
              topicContent = {
                overview: '',
                symbols: [],
                lessons: [{
                  title: topic,
                  body: content.substring(0, 500), // Store first 500 chars as placeholder
                  quiz: [],
                  flashcards: json.flashcards,
                }],
              };
            } else {
              // Add flashcards to first lesson or create a new one
              const lessons = (topicContent as any).lessons || [];
              if (lessons.length > 0) {
                // Add to first lesson
                lessons[0] = {
                  ...lessons[0],
                  flashcards: [...(lessons[0].flashcards || []), ...json.flashcards],
                };
              } else {
                // Create new lesson
                lessons.push({
                  title: topic,
                  body: content.substring(0, 500),
                  quiz: [],
                  flashcards: json.flashcards,
                });
              }
              topicContent = {
                ...topicContent,
                lessons,
              };
            }
            
            // Save updated data
            data.nodes[topic] = topicContent;
            saveSubjectData(slug, data);
            
            // Update message to show success
            setMessages((m) => {
              const copy = [...m];
              const loadingIdx = copy.findIndex(msg => msg.id === loadingMessageId);
              if (loadingIdx >= 0) {
                copy[loadingIdx] = {
                  role: 'assistant',
                  content: `Flashcards Generated. I've created ${json.flashcards.length} flashcards for "${topic}".`,
                  id: loadingMessageId,
                  flashcardGeneration: { slug, topic, count: json.flashcards.length },
                  flashcardSuccess: true,
                };
              }
              return copy;
            });
          } catch (err: any) {
            // Update message to show error
            setMessages((m) => {
              const copy = [...m];
              const loadingIdx = copy.findIndex(msg => msg.id === loadingMessageId);
              if (loadingIdx >= 0) {
                copy[loadingIdx] = {
                  role: 'assistant',
                  content: `Failed to generate flashcards: ${err?.message || 'Unknown error'}`,
                  id: loadingMessageId,
                };
              }
              return copy;
            });
          }
        })();
      } else if (action.name === 'request_files') {
        const message = action.params.message || 'Please upload the files I need.';
        alert(message);
      } else if (action.name === 'start_exam_snipe') {
        // Navigate to exam snipe page
        router.push('/exam-snipe');
      } else if (action.name === 'generate_course') {
        // Open course creation modal
        document.dispatchEvent(new CustomEvent('synapse:open-course-modal'));
      } else if (action.name === 'create_course_from_text') {
        // Create course from text description
        const description = action.params.description || '';
        const courseName = action.params.name || '';
        if (!description.trim()) {
          setMessages((m) => [...m, { role: 'assistant', content: 'Please provide a description of the course you want to create.' }]);
          return;
        }
        // Show loading message
        setMessages((m) => [...m, { role: 'assistant', content: '', isLoading: true }]);
        // Call API to generate course from text
        (async () => {
          try {
            const res = await fetch('/api/course-from-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description, courseName }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json?.ok) {
              // Remove loading message
              setMessages((m) => {
                const copy = [...m];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                  copy.pop();
                }
                return copy;
              });
              // Create course with the generated context
              const finalName = json.courseName || courseName || 'New Course';
              const courseContext = json.courseContext || description;
              // Create empty files array and use the generated context as syllabus
              document.dispatchEvent(new CustomEvent('synapse:create-course-with-text', { 
                detail: { 
                  name: finalName, 
                  syllabus: courseContext,
                  topics: json.topics || []
                } 
              }));
            } else {
              // Remove loading message and show error
              setMessages((m) => {
                const copy = [...m];
                const lastIdx = copy.length - 1;
                if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                  copy.pop();
                }
                copy.push({ role: 'assistant', content: `Failed to create course: ${json?.error || 'Unknown error'}` });
                return copy;
              });
            }
          } catch (err: any) {
            setMessages((m) => {
              const copy = [...m];
              const lastIdx = copy.length - 1;
              if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                copy.pop();
              }
              copy.push({ role: 'assistant', content: `Error creating course: ${err?.message || 'Unknown error'}` });
              return copy;
            });
          }
        })();
      } else if (action.name === 'set_exam_date') {
        let slug = action.params.slug?.trim();
        const dateStr = action.params.date?.trim();
        const examName = action.params.name?.trim();
        if (slug && dateStr && typeof window !== 'undefined') {
          // If slug looks like a course name, try to resolve it to an actual slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug && dateStr) {
            // Validate date format (YYYY-MM-DD)
            const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateMatch) {
              try {
                // Import loadSubjectData and saveSubjectData from storage utils
                const { loadSubjectData, saveSubjectData } = require('@/utils/storage');
                const data = loadSubjectData(slug);
                if (data) {
                  // Replace all existing exam dates with the new one (overwrite behavior)
                  data.examDates = [{ date: dateStr, name: examName }];
                  saveSubjectData(slug, data);
                  // Trigger a custom event to refresh the UI
                  window.dispatchEvent(new CustomEvent('synapse:exam-date-updated', { detail: { slug } }));
                }
              } catch (err) {
                console.error('Failed to set exam date:', err);
              }
            }
          }
        }
      } else if (action.name === 'fetch_practice_logs') {
        let slug = action.params.slug?.trim();
        const originalInput = slug;
        if (slug && typeof window !== 'undefined') {
          // Try to resolve course name to slug
          if (!slug.match(/^[a-z0-9\-_]+$/)) {
            try {
              const subjectsRaw = localStorage.getItem('atomicSubjects');
              if (subjectsRaw) {
                const subjects: Array<{ name: string; slug: string }> = JSON.parse(subjectsRaw);
                const exactMatch = subjects.find(s => s.name.toLowerCase() === slug.toLowerCase());
                if (exactMatch) {
                  slug = exactMatch.slug;
                } else {
                  const partialMatch = subjects.find(s => s.name.toLowerCase().includes(slug.toLowerCase()) || slug.toLowerCase().includes(s.name.toLowerCase()));
                  if (partialMatch) {
                    slug = partialMatch.slug;
                  }
                }
              }
            } catch {}
          }
          // Clean slug
          slug = slug.replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
          if (slug) {
            // Show loading spinner
            setFetchingContext(true);
            setMessages((m) => [...m, { role: 'assistant', content: '', isLoading: true }]);
            
            // Fetch practice logs
            (async () => {
              try {
                const PRACTICE_LOG_PREFIX = "atomicPracticeLog:";
                const practiceLogKey = `${PRACTICE_LOG_PREFIX}${slug}`;
                const stored = localStorage.getItem(practiceLogKey);
                
                if (stored) {
                  try {
                    const practiceLog = JSON.parse(stored);
                    if (Array.isArray(practiceLog) && practiceLog.length > 0) {
                      // Format practice log summary
                      const topicStats: Record<string, { total: number; avgGrade: number; entries: any[] }> = {};
                      
                      practiceLog.forEach((entry: any) => {
                        const topic = entry.topic || "General";
                        if (!topicStats[topic]) {
                          topicStats[topic] = { total: 0, avgGrade: 0, entries: [] };
                        }
                        topicStats[topic].total += 1;
                        topicStats[topic].entries.push(entry);
                      });
                      
                      // Calculate averages
                      Object.keys(topicStats).forEach(topic => {
                        const stats = topicStats[topic];
                        const totalGrade = stats.entries.reduce((sum, e) => sum + (e.grade || e.rating || 0), 0);
                        stats.avgGrade = stats.total > 0 ? totalGrade / stats.total : 0;
                      });
                      
                      const contextData: string[] = [];
                      contextData.push(`PRACTICE LOG DATA FOR ${originalInput.toUpperCase()}:`);
                      contextData.push(`Total practice entries: ${practiceLog.length}`);
                      contextData.push('');
                      
                      // Group by topic
                      Object.entries(topicStats)
                        .sort(([, a], [, b]) => b.total - a.total)
                        .forEach(([topic, stats]) => {
                          contextData.push(`${topic}:`);
                          contextData.push(`  - Questions practiced: ${stats.total}`);
                          contextData.push(`  - Average grade: ${stats.avgGrade.toFixed(1)}/10`);
                          contextData.push('');
                        });
                      
                      // Recent entries (last 10)
                      const recentEntries = practiceLog
                        .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
                        .slice(0, 10);
                      
                      if (recentEntries.length > 0) {
                        contextData.push('RECENT PRACTICE SESSIONS:');
                        recentEntries.forEach((entry: any, idx: number) => {
                          const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown date';
                          const topic = entry.topic || 'General';
                          const grade = entry.grade || entry.rating || 0;
                          contextData.push(`${idx + 1}. [${date}] ${topic} - Grade: ${grade}/10`);
                          if (entry.question) {
                            const qPreview = entry.question.replace(/◊/g, '').replace(/<[^>]*>/g, '').slice(0, 80);
                            contextData.push(`   Q: ${qPreview}${qPreview.length >= 80 ? '...' : ''}`);
                          }
                        });
                      }
                      
                      const contextText = contextData.join('\n');
                      
                      // Remove loading message and add context as system message
                      setMessages((m) => {
                        const copy = [...m];
                        const lastIdx = copy.length - 1;
                        if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                          copy.pop();
                        }
                        const systemEntry: ChatMessage = { role: 'system', content: contextText };
                        const updated: ChatMessage[] = [...copy, systemEntry];
                        
                        // Trigger Chad's response without adding a visible user message
                        // Use a hidden trigger message that won't be displayed
                        const triggerEntry: ChatMessage = { role: 'user', content: 'What did you find?', hidden: true };
                        const messagesWithTrigger: ChatMessage[] = [...updated, triggerEntry];
                        setTimeout(() => {
                          sendMessageWithExistingMessages(messagesWithTrigger);
                        }, 100);
                        
                        return updated;
                      });
                    } else {
                      // No practice logs
                      setMessages((m) => {
                        const copy = [...m];
                        const lastIdx = copy.length - 1;
                        if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                          copy.pop();
                        }
                        copy.push({ role: 'assistant', content: `No practice logs found for "${originalInput}". Start practicing this course to generate logs.` });
                        return copy;
                      });
                    }
                  } catch (err) {
                    console.error('Failed to parse practice logs:', err);
                    setMessages((m) => {
                      const copy = [...m];
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      copy.push({ role: 'assistant', content: 'Failed to parse practice logs.' });
                      return copy;
                    });
                  }
                } else {
                  // No practice logs found
                  setMessages((m) => {
                    const copy = [...m];
                    const lastIdx = copy.length - 1;
                    if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                      copy.pop();
                    }
                    copy.push({ role: 'assistant', content: `No practice logs found for "${originalInput}". Start practicing this course to generate logs.` });
                    return copy;
                  });
                }
              } catch (err) {
                console.error('Failed to fetch practice logs:', err);
                setMessages((m) => {
                  const copy = [...m];
                  const lastIdx = copy.length - 1;
                  if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                    copy.pop();
                  }
                  copy.push({ role: 'assistant', content: 'Error fetching practice logs.' });
                  return copy;
                });
              } finally {
                setFetchingContext(false);
              }
            })();
          }
        }
      } else if (action.name === 'fetch_exam_snipe_data') {
        let slug = action.params.slug?.trim();
        const originalInput = slug; // Store original input for name matching
        if (slug && typeof window !== 'undefined') {
          // For exam snipe data, we match by course name, not slug
          // Don't try to resolve course names to slugs - exam snipe data is stored separately
          // Only clean if it looks like a slug (alphanumeric with hyphens/underscores)
          let cleanedSlug = null;
          if (slug.match(/^[a-z0-9\-_]+$/)) {
            // It's already a slug, use it for slug-based matching as fallback
            cleanedSlug = slug.toLowerCase();
          }
          if (slug) {
            // Show loading spinner
            setFetchingContext(true);
            setMessages((m) => [...m, { role: 'assistant', content: '', isLoading: true }]);
            
            // Fetch exam snipe data
            (async () => {
              try {
                const examRes = await fetch('/api/exam-snipe/history', { credentials: 'include' });
                const examJson = await examRes.json().catch(() => ({}));
                
                if (examJson?.ok && Array.isArray(examJson.history)) {
                  // First, try to match by course name (case-insensitive, partial match)
                  // This is more reliable since exam snipe data might have different slugs
                  let matchingExamSnipe = examJson.history.find((exam: any) => {
                    const examCourseName = (exam.courseName || '').toLowerCase().trim();
                    const inputName = originalInput.toLowerCase().trim();
                    return examCourseName === inputName || 
                           examCourseName.includes(inputName) || 
                           inputName.includes(examCourseName);
                  });
                  
                  // If not found by name, try by slug
                  if (!matchingExamSnipe && cleanedSlug) {
                    matchingExamSnipe = examJson.history.find((exam: any) => {
                      const examSlug = (exam.slug || '').toLowerCase().trim();
                      return examSlug === cleanedSlug;
                    });
                  }
                  
                  if (matchingExamSnipe && matchingExamSnipe.results) {
                    const results = matchingExamSnipe.results;
                    const contextData: string[] = [];
                    
                    contextData.push(`DETAILED EXAM SNIPE DATA FOR ${matchingExamSnipe.courseName || slug.toUpperCase()}:`);
                    contextData.push(`Total exams analyzed: ${results.totalExams || 0}`);
                    
                    if (results.gradeInfo) {
                      contextData.push(`Grade info: ${results.gradeInfo}`);
                    }
                    if (results.patternAnalysis) {
                      contextData.push(`Pattern analysis: ${results.patternAnalysis}`);
                    }
                    
                    // Full study order (all concepts)
                    if (results.concepts && Array.isArray(results.concepts) && results.concepts.length > 0) {
                      const studyOrder = results.concepts.map((c: any, idx: number) => {
                        const name = c.name || `Concept ${idx + 1}`;
                        const desc = c.description ? ` - ${c.description}` : '';
                        return `${idx + 1}. ${name}${desc}`;
                      }).join('\n');
                      contextData.push(`STUDY ORDER (priority, all concepts):\n${studyOrder}`);
                    }
                    
                    // All common questions
                    if (results.commonQuestions && Array.isArray(results.commonQuestions) && results.commonQuestions.length > 0) {
                      const allQuestions = results.commonQuestions.map((q: any, idx: number) => {
                        const question = q.question || '';
                        const count = q.examCount || 0;
                        const points = q.averagePoints || 0;
                        return `${idx + 1}. "${question}" (appears in ${count} exams, avg ${points} pts)`;
                      }).join('\n');
                      contextData.push(`ALL COMMON QUESTIONS:\n${allQuestions}`);
                    }
                    
                    const contextText = contextData.join('\n\n');
                    
                    // Remove loading message and add context as system message
                    setMessages((m) => {
                      const copy = [...m];
                      // Remove the loading message
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      // Add context as system message (hidden from user, but included in API context)
                      const systemEntry: ChatMessage = { role: 'system', content: contextText };
                      const updated: ChatMessage[] = [...copy, systemEntry];
                      
                      // Trigger Chad's response without adding a visible user message
                      // Use a hidden trigger message that won't be displayed
                      const triggerEntry: ChatMessage = { role: 'user', content: 'What did you find?', hidden: true };
                      const messagesWithTrigger: ChatMessage[] = [...updated, triggerEntry];
                      setTimeout(() => {
                        sendMessageWithExistingMessages(messagesWithTrigger);
                      }, 100);
                      
                      return updated;
                    });
                  } else {
                    // No exam snipe data found
                    setMessages((m) => {
                      const copy = [...m];
                      const lastIdx = copy.length - 1;
                      if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                        copy.pop();
                      }
                      copy.push({ role: 'assistant', content: `No exam snipe data found for "${originalInput}". You may need to run Exam Snipe first for this course.` });
                      return copy;
                    });
                  }
                } else {
                  // Error fetching data
                  setMessages((m) => {
                    const copy = [...m];
                    const lastIdx = copy.length - 1;
                    if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                      copy.pop();
                    }
                    copy.push({ role: 'assistant', content: 'Failed to fetch exam snipe data.' });
                    return copy;
                  });
                }
              } catch (err) {
                console.error('Failed to fetch exam snipe data:', err);
                setMessages((m) => {
                  const copy = [...m];
                  const lastIdx = copy.length - 1;
                  if (lastIdx >= 0 && copy[lastIdx].isLoading) {
                    copy.pop();
                  }
                  copy.push({ role: 'assistant', content: 'Error fetching exam snipe data.' });
                  return copy;
                });
              } finally {
                setFetchingContext(false);
              }
            })();
          }
        }
      }
    });
  }
  
  // Handle button click
  function handleButtonClick(action: string | undefined, params: Record<string, string> | undefined, uploadId?: string) {
    if (uploadId && uploadedFiles[uploadId] && uploadedFiles[uploadId].length > 0) {
      // If button is associated with file upload, process the files
      const files = uploadedFiles[uploadId];
      if (uploadId) {
        setUploadStatus(prev => ({ ...prev, [uploadId]: 'processing' }));
      }
      if (action === 'start_exam_snipe') {
        // Navigate to exam snipe with files
        router.push('/exam-snipe');
        // Store files temporarily for exam snipe page to pick up
        (window as any).__pendingExamFiles = files;
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      } else if (action === 'generate_course' || action === 'create_course') {
        // Create course with files - auto-create, don't open modal
        const name = params?.name || 'New Course';
        const syllabus = params?.syllabus || '';
        document.dispatchEvent(new CustomEvent('synapse:create-course-with-files', { detail: { files, name, syllabus } }));
        if (uploadId) {
          setUploadStatus(prev => ({ ...prev, [uploadId]: 'success' }));
        }
      }
      // Always clear files after processing so the upload area resets
      setUploadedFiles(prev => {
        if (!prev[uploadId] || prev[uploadId].length === 0) return prev;
        return { ...prev, [uploadId]: [] };
      });
    } else if (action) {
      // For course creation actions without files, don't open modal - just do nothing or show error
      if (action === 'generate_course' || action === 'create_course') {
        // Don't open modal - user needs to upload files first
        return;
      }
      // Execute other actions normally
      executeActions([{ name: action, params: params || {} }]);
    }
  }
  
  // Handle file upload
  function handleFileUpload(uploadId: string, files: File[]) {
    setUploadedFiles(prev => ({ ...prev, [uploadId]: files }));
    setUploadStatus(prev => ({ ...prev, [uploadId]: files.length > 0 ? 'ready' : 'idle' }));
  }

  function resetFileUploadState(uiElements?: ChatMessage['uiElements']) {
    if (!uiElements || uiElements.length === 0) return;
    const fileUploadIds = uiElements
      .filter((ui) => ui.type === 'file_upload')
      .map((ui) => ui.id)
      .filter(Boolean);
    if (fileUploadIds.length === 0) return;

    setUploadedFiles((prev) => {
      let changed = false;
      const next = { ...prev };

      fileUploadIds.forEach((id) => {
        if (!id) return;
        if (!next[id] || next[id].length > 0) {
          next[id] = [];
          changed = true;
        }
      });

      // Remove any previously stored uploads that are no longer rendered
      Object.keys(next).forEach((id) => {
        if (!fileUploadIds.includes(id) && next[id] && next[id].length === 0 && prev[id] === next[id]) {
          // No change needed; keep empty entries for other active uploaders
        }
      });

      return changed ? next : prev;
    });
    setUploadStatus((prev) => {
      let changed = false;
      const next = { ...prev };
      fileUploadIds.forEach((id) => {
        if (!id) return;
        if (next[id] !== 'idle') {
          next[id] = 'idle';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }

  async function sendMessageWithExistingMessages(existingMessages: ChatMessage[]) {
    if (sending) return;
    try {
      setSending(true);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: true } }));
      const courseContext = await getCompressedCourseContext();
      
      // Gather page context (lesson content or visible text)
      let pageContext = '';
      try {
        const el = document.querySelector('.lesson-content');
        pageContext = el ? (el as HTMLElement).innerText : document.body.innerText;
        pageContext = pageContext.slice(0, 8000);
      } catch {}
      
      // Extract system messages (context data) from existing messages
      const systemMessages = existingMessages.filter(m => m.role === 'system').map(m => m.content);
      const systemContext = systemMessages.join('\n\n---\n\n');
      
      // Combine contexts (system context first, then course context, then page context)
      const fullContext = [systemContext, courseContext, pageContext].filter(Boolean).join('\n\n---\n\n').slice(0, 12000);
      
      // Filter out system messages and loading messages from messages sent to API (they're in context now)
      // Hidden messages are still sent to API (they trigger responses) but won't be displayed
      const messagesForAPI = existingMessages.filter(m => m.role !== 'system' && !m.isLoading);
      
      // Prepare placeholder for streaming
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      const idx = messagesForAPI.length; // assistant index (excluding system messages)
      let accumulatedContent = '';
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: fullContext,
          messages: messagesForAPI,
          path: typeof window !== 'undefined' ? window.location.pathname : ''
        })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      const executedActions = new Set<string>(); // Track executed actions to avoid duplicates
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // After streaming completes, parse UI elements and actions for final cleanup
            if (accumulatedContent) {
              const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
              resetFileUploadState(uiElements);
              // Only show message if there's actual content (not just actions)
              const finalContent = cleanedContent.trim();
              if (finalContent) {
                // Update message with cleaned content and UI elements
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: finalContent, uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined } as ChatMessage;
                  return copy;
                });
                // Execute actions AFTER message is displayed (with a small delay to ensure message renders)
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              } else {
                // No content - remove the empty message
                setMessages((m) => {
                  const copy = [...m];
                  copy.pop();
                  return copy;
                });
                // Still execute actions even if no message
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              }
            } else {
              // If no content was accumulated, remove the empty message
              setMessages((m) => {
                const copy = [...m];
                copy.pop(); // Remove the last empty assistant message
                return copy;
              });
            }
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          chunk.split('\n').forEach((line) => {
            if (!line.startsWith('data: ')) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === 'text') {
                accumulatedContent += obj.content;
                // Parse actions but DON'T execute them during streaming - wait until stream completes
                // This prevents page navigation from interrupting the message stream
                const { cleanedContent: streamCleanedContent } = parseUIElementsAndActions(accumulatedContent);
                // Show cleaned content during streaming (actions removed)
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: streamCleanedContent } as any;
                  return copy;
                });
              } else if (obj.type === 'error') {
                throw new Error(obj.error || 'Streaming error');
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete chunks
              if (parseError instanceof SyntaxError) {
                // This is expected for incomplete JSON chunks, continue
              } else {
                throw parseError;
              }
            }
          });
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages((m) => [...m, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed to send. Please try again.') }]);
    } finally {
      setSending(false);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: false } }));
    }
  }

  // Handle pending welcome message
  useEffect(() => {
    if (pendingWelcomeMessageRef.current && open && !sending) {
      const { userMessage } = pendingWelcomeMessageRef.current;
      pendingWelcomeMessageRef.current = null;
      
      // Send the message without welcome message
      setTimeout(() => {
        sendMessageWithExistingMessages([
          { role: 'user', content: userMessage }
        ]);
      }, 100);
    }
  }, [open, sending]);

  // Auto-scroll to bottom when messages change (especially during streaming)
  useEffect(() => {
    if (!open || !messagesEndRef.current) return;
    
    // Always scroll when messages length changes or when sending state changes
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }, [messages.length, sending, open, scrollTrigger]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    insertedWelcomeRef.current = false;
    setInput("");
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setShowFullChat(true); // Open full chat when sending a message
    try {
      setSending(true);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: true } }));
      const courseContext = await getCompressedCourseContext();
      
      // Gather page context (lesson content or visible text)
      let pageContext = '';
      try {
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const isSurgeLearnPhase = pathname.includes('/surge');
        
        // Check for Surge learn phase lesson content
        if (isSurgeLearnPhase) {
          // Try to find the Surge lesson card
          const surgeLessonCard = document.querySelector('.surge-lesson-card, [data-topic]');
          const lessonContentDiv = document.querySelector('.lesson-content');
          
          if (surgeLessonCard) {
            // Extract structured lesson information
            const currentTopic = surgeLessonCard.getAttribute('data-topic') || '';
            const partIndex = surgeLessonCard.getAttribute('data-part-index') || '';
            const totalParts = surgeLessonCard.getAttribute('data-total-parts') || '';
            
            // Get lesson header
            const headerEl = surgeLessonCard.querySelector('h2');
            const header = headerEl?.textContent?.trim() || '';
            
            // Get lesson content
            const contentEl = lessonContentDiv || surgeLessonCard.querySelector('.lesson-content') || surgeLessonCard;
            const content = (contentEl as HTMLElement)?.innerText || contentEl?.textContent || '';
            
            // Build structured context for Chad
            const surgeContext: string[] = [];
            surgeContext.push('=== CURRENT SURGE LEARN PHASE CONTENT ===');
            if (currentTopic) {
              surgeContext.push(`Topic Being Learned: ${currentTopic}`);
            }
            if (header) {
              surgeContext.push(`Current Lesson Part: ${header}`);
            }
            if (partIndex && totalParts) {
              surgeContext.push(`Progress: Part ${parseInt(partIndex) + 1} of ${totalParts}`);
            }
            surgeContext.push('');
            surgeContext.push('LESSON CONTENT:');
            surgeContext.push(content);
            surgeContext.push('=== END SURGE CONTENT ===');
            
            pageContext = surgeContext.join('\n\n');
          } else {
            // Fallback: try to get any visible lesson text from the page
            const allText = document.body.innerText;
            if (allText) {
              pageContext = `=== SURGE LEARN PHASE ===\n${allText}`;
            }
          }
        } else {
          // For other pages, use existing logic
          const el = document.querySelector('.lesson-content');
          pageContext = el ? (el as HTMLElement).innerText : document.body.innerText;
        }
        
        // Limit size but allow more for Surge content
        pageContext = pageContext.slice(0, 12000);
      } catch {}
      
      // Extract system messages (context data) from messages
      const systemMessages = messages.filter(m => m.role === 'system').map(m => m.content);
      const systemContext = systemMessages.join('\n\n---\n\n');
      
      // Combine contexts (system context first, then course context, then page context)
      const fullContext = [systemContext, courseContext, pageContext].filter(Boolean).join('\n\n---\n\n').slice(0, 12000);
      
      // Filter out system messages from messages sent to API (they're in context now)
      const messagesForAPI = messages.filter(m => m.role !== 'system' && !m.isLoading);
      
      // Prepare placeholder for streaming
      setMessages((m) => [...m, { role: 'assistant', content: '' }]);
      const idx = messagesForAPI.length + 1; // assistant index (excluding system messages)
      let accumulatedContent = '';
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: fullContext,
          messages: [...messagesForAPI, { role: 'user', content: text }],
          path: typeof window !== 'undefined' ? window.location.pathname : ''
        })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      const executedActions = new Set<string>(); // Track executed actions to avoid duplicates
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // After streaming completes, parse UI elements and actions for final cleanup
            if (accumulatedContent) {
              const { cleanedContent, uiElements, actions } = parseUIElementsAndActions(accumulatedContent);
              resetFileUploadState(uiElements);
              // Only show message if there's actual content (not just actions)
              const finalContent = cleanedContent.trim();
              if (finalContent) {
                // Update message with cleaned content and UI elements
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: finalContent, uiElements: uiElements && uiElements.length > 0 ? uiElements : undefined } as ChatMessage;
                  return copy;
                });
                // Execute actions AFTER message is displayed (with a small delay to ensure message renders)
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              } else {
                // No content - remove the empty message
                setMessages((m) => {
                  const copy = [...m];
                  copy.pop();
                  return copy;
                });
                // Still execute actions even if no message
                if (actions.length > 0) {
                  setTimeout(() => {
                    actions.forEach(action => {
                      executeActions([action]);
                    });
                  }, 100);
                }
              }
            } else {
              // If no content was accumulated, remove the empty message
              setMessages((m) => {
                const copy = [...m];
                copy.pop(); // Remove the last empty assistant message
                return copy;
              });
            }
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          chunk.split('\n').forEach((line) => {
            if (!line.startsWith('data: ')) return;
            const payload = line.slice(6);
            if (!payload) return;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === 'text') {
                accumulatedContent += obj.content;
                // Parse actions but DON'T execute them during streaming - wait until stream completes
                // This prevents page navigation from interrupting the message stream
                const { cleanedContent: streamCleanedContent } = parseUIElementsAndActions(accumulatedContent);
                // Show cleaned content during streaming (actions removed)
                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = { role: 'assistant', content: streamCleanedContent } as any;
                  return copy;
                });
              } else if (obj.type === 'error') {
                throw new Error(obj.error || 'Streaming error');
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete chunks
              if (parseError instanceof SyntaxError) {
                // This is expected for incomplete JSON chunks, continue
              } else {
                throw parseError;
              }
            }
          });
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages((m) => [...m, { role: 'assistant', content: 'Error: ' + (e?.message || 'Failed to send. Please try again.') }]);
    } finally {
      setSending(false);
      document.dispatchEvent(new CustomEvent('synapse:chat-sending', { detail: { sending: false } }));
    }
  }

  // Auto-scroll to bottom when messages change (especially during streaming)
  useEffect(() => {
    if (!open || !messagesEndRef.current) return;
    
    // Always scroll when messages length changes, content changes, or when sending state changes
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });
  }, [messages.length, sending, open, scrollTrigger]);

  // Also poll during streaming to catch content updates
  useEffect(() => {
    if (!open || !sending) return;
    
    const interval = setInterval(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, 100); // Check every 100ms during streaming
    
    return () => clearInterval(interval);
  }, [open, sending]);

  // Prevent body scroll when chat is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (open) {
      // Save current scroll position
      const scrollY = window.scrollY;
      // Disable body scroll
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore body scroll
        const scrollY = document.body.style.top;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      };
    }
  }, [open]);

  // Click outside to close chat - but NOT when clicking the toggle button
  useEffect(() => {
    if (!open && !showFullChat) return;
    
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element;
      // Don't close if clicking the chat pill, full chat dropdown, or toggle button
      if (
        target.closest('[data-chat-pill]') ||
        target.closest('[data-chat-input]') ||
        target.closest('button[data-chat-toggle]') ||
        target.closest('[data-chat-dropdown]')
      ) {
        return;
      }
      // Close if clicking outside
      setOpen(false);
      setShowFullChat(false);
    }
    
    // Use a small delay to let button clicks process first
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [open, showFullChat]);

  // Resize handlers (bottom-left grip)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing || !start) return;
      const dx = e.clientX - start.x; // moving right is positive
      const dy = e.clientY - start.y; // moving down is positive
      // Anchored to right edge; dragging bottom-left: decrease x to grow width
      setSize({ w: Math.max(420, start.w - dx), h: Math.max(320, start.h + dy) });
    }
    function onUp() { setResizing(false); setStart(null); }
    if (resizing) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing, start]);

  // Render chat content (shared between fullscreen and dropdown)
  const renderChatContent = () => (
    <>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 p-4">
        {messages.length === 0 && (
          <div className="text-xs text-[var(--foreground)]/60">Ask a question about this page. I'll use the current page content as context.</div>
        )}
        {messages.map((m, i) => {
          // Skip system messages and hidden messages in display (they're context only)
          if (m.role === 'system' || m.hidden) return null;
          
          // Show loading spinner for loading messages
          if (m.isLoading) {
            const isFlashcardGeneration = m.flashcardGeneration;
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[80%]">
                  <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">Chad</div>
                  <div className="rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10 flex items-center gap-2">
                    <GlowSpinner size={16} ariaLabel="Loading" idSuffix={`chat-loading-${i}`} />
                    <span className="text-xs text-[var(--foreground)]/60">
                      {isFlashcardGeneration ? 'Generating Flashcards' : 'Getting info...'}
                    </span>
                  </div>
                </div>
              </div>
            );
          }
          
          // Show flashcard success message with View flashcards button
          if (m.flashcardSuccess && m.flashcardGeneration) {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[80%]">
                  <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">Chad</div>
                  <div className="rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10">
                    <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
                    <button
                      onClick={() => {
                        const { slug } = m.flashcardGeneration!;
                        if (slug && typeof window !== 'undefined') {
                          // Set pending flag and navigate
                          sessionStorage.setItem('__pendingFlashcardOpen', slug);
                          // Also dispatch event to open flashcards if already on the course page
                          document.dispatchEvent(new CustomEvent('synapse:open-flashcards', { detail: { slug } }));
                          router.push(`/subjects/${slug}`);
                        }
                      }}
                      className="synapse-style mt-2 inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium !text-white  transition-opacity"
                      style={{ color: 'white', zIndex: 100, position: 'relative' }}
                    >
                      <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>View Flashcards</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          
          return (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[80%]">
              <div className="text-[10px] text-[var(--foreground)]/60 mb-1 ml-1">{m.role === 'user' ? 'You' : 'Chad'}</div>
              <div className={m.role === 'user' ? 'rounded-xl bg-[var(--accent-cyan)]/20 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--accent-cyan)]/30' : 'rounded-xl bg-[var(--background)]/80 text-[var(--foreground)] px-3 py-2 text-sm border border-[var(--foreground)]/10'}>
              {m.role === 'assistant' ? (
                <>
                  <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
                  {/* Render UI elements */}
                  {m.uiElements && m.uiElements.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {m.uiElements.map((ui, uiIdx) => {
                        if (ui.type === 'button') {
                          return (
                            <button
                              key={uiIdx}
                              onClick={() => handleButtonClick(ui.action, ui.params)}
                              className="synapse-style inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium !text-white  transition-opacity"
                              style={{ color: 'white', zIndex: 100, position: 'relative' }}
                            >
                              <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>{ui.label || 'Button'}</span>
                            </button>
                          );
                        } else if (ui.type === 'file_upload') {
                          const files = uploadedFiles[ui.id] || [];
                          const status = uploadStatus[ui.id] || 'idle';
                          // Extract button label from params if provided
                          const buttonLabel = ui.params?.buttonLabel || 'Generate';
                          return (
                            <FileUploadArea
                              key={uiIdx}
                              uploadId={ui.id}
                              message={ui.message}
                              files={files}
                              buttonLabel={buttonLabel}
                              action={ui.action}
                              status={status}
                              hasPremiumAccess={hasPremiumAccess}
                              onFilesChange={(newFiles) => handleFileUpload(ui.id, newFiles)}
                              onGenerate={() => handleButtonClick(ui.action, ui.params, ui.id)}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </>
              ) : (
                <span>{m.content}</span>
              )}
              </div>
            </div>
          </div>
        );
        })}
        {/* Scroll target for auto-scroll */}
        <div ref={messagesEndRef} />
      </div>
      {/* Input area */}
      <div className="border-t border-[var(--foreground)]/10 p-4 flex-shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !sending) {
              sendMessage();
            }
          }}
          className="flex gap-2"
        >
          <input
            ref={chatInputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]/30"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="synapse-style px-6 py-2 rounded-xl text-white font-medium  disabled:opacity-50 transition-opacity"
            style={{ zIndex: 100, position: 'relative' }}
          >
            <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>Send</span>
          </button>
        </form>
      </div>
    </>
  );

  // In fullscreen mode, always show the chat content without the button
  if (fullscreen) {
    return (
      <div className="h-full flex flex-col">
        {renderChatContent()}
      </div>
    );
  }

  return (
    <>
      {/* Chat pill under header - appears when typing */}
      {typeof document !== 'undefined' && open && !showFullChat ? createPortal(
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setOpen(false);
          }}
        >
          <div 
            className="flex flex-col items-center gap-2 w-full"
            style={{ 
              maxWidth: 'min(910px, calc(100vw - 2rem))',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              data-chat-pill
              className="chat-input-container flex items-center gap-2 px-4 py-3 border border-[var(--foreground)]/10 overflow-hidden w-full"
              style={{ 
                boxShadow: 'none',
                borderRadius: '1.5rem',
                minHeight: '3.5rem',
              }}
            >
            <textarea
              ref={chatInputRef as React.RefObject<HTMLTextAreaElement>}
              data-chat-input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea
                if (chatInputRef.current && 'scrollHeight' in chatInputRef.current) {
                  const textarea = chatInputRef.current as HTMLTextAreaElement;
                  textarea.style.height = 'auto';
                  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
                }
              }}
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Chat with Chad..."
              disabled={sending}
              className="flex-1 bg-transparent border-none outline-none text-base text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none resize-none overflow-hidden"
              style={{ 
                boxShadow: 'none', 
                padding: '0.5rem 0.75rem', 
                minHeight: '2rem', 
                maxHeight: '120px', 
                lineHeight: '1.5rem', 
                borderRadius: '0', 
                backgroundColor: 'transparent',
                fontSize: '1rem',
              }}
              rows={1}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleRecording}
                disabled={sending || isTranscribing}
                aria-pressed={isRecording}
                title={isRecording ? "Stop recording" : "Record voice message"}
                className={`unified-button transition-colors flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full border border-[var(--foreground)]/10 ${
                  isRecording
                    ? 'text-[#FFB347] border-[#FFB347]/60'
                    : ''
                } disabled:opacity-50`}
                style={{ boxShadow: 'none' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15c1.66 0 3-1.34 3-3V7a3 3 0 0 0-6 0v5c0 1.66 1.34 3 3 3z" />
                  <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
                  <path d="M12 19v3" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (input.trim()) {
                    sendMessage();
                  }
                }}
                disabled={sending || !input.trim()}
                className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full border border-[var(--foreground)]/10"
                style={{ 
                  boxShadow: 'none',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
            </div>
            {(voiceError || isRecording || isTranscribing) && (
              <p className={`text-[11px] text-center w-full ${voiceError ? 'text-[#FF8A8A]' : 'text-[var(--foreground)]/60'}`}>
                {voiceError
                  ? voiceError
                  : isRecording
                    ? 'Recording… tap the mic to stop.'
                    : 'Transcribing voice...'}
              </p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
      {/* Floating chat button in bottom right */}
      {typeof document !== 'undefined' && !showFullChat ? createPortal(
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setShowFullChat(true);
            requestAnimationFrame(() => {
              chatInputRef.current?.focus();
            });
          }}
          className="unified-button fixed bottom-6 right-6 z-50 inline-flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 ease-out"
          style={{ 
            boxShadow: 'none',
          }}
          aria-label="Open chat"
          title="Open chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>,
        document.body
      ) : null}
      {/* Full chat dropdown */}
      {typeof document !== 'undefined' && showFullChat ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '0.25rem', paddingBottom: '0.25rem' }}
          onClick={() => {
            setShowFullChat(false);
            setOpen(false);
          }}
        >
          <div 
            ref={chatDropdownRef}
            data-chat-dropdown
            className="relative w-full rounded-2xl border border-[var(--foreground)]/20 bg-[var(--background)]/95 backdrop-blur-md shadow-2xl flex flex-col"
            style={{
              maxWidth: 'min(1000px, calc(100vw - 2rem))',
              maxHeight: 'calc(100vh - 0.5rem)',
              height: 'calc(100vh - 0.5rem)',
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 border-b border-[var(--foreground)]/10" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
              <div className="flex items-center gap-2">
                <div className="synapse-style h-6 w-6 rounded-full" />
                <div className="font-semibold text-[var(--foreground)]" style={{ fontSize: '1.05rem' }}>Chad</div>
              </div>
              <button
                onClick={() => {
                  setShowFullChat(false);
                  setOpen(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/10 transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 space-y-4 min-h-0" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
              {messages.length === 0 && (
                <div className="text-[var(--foreground)]/60" style={{ fontSize: '0.9rem' }}>Ask a question about this page. I'll use the current page content as context.</div>
              )}
              {messages.map((m, i) => {
                if (m.role === 'system' || m.hidden) return null;
                
                if (m.isLoading) {
                  return (
                    <div key={i} className="flex justify-start">
                      <div 
                        className="chat-bubble-assistant max-w-[80%] inline-block px-3 py-1.5 rounded-full border border-[var(--foreground)]/10"
                      >
                        <div className="text-[var(--foreground)]/90 leading-relaxed flex items-center gap-2" style={{ fontSize: '1.05rem' }}>
                          <span className="inline-block w-2 h-2 bg-[var(--foreground)]/60 rounded-full animate-pulse"></span>
                          Thinking...
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    {m.role === 'user' ? (
                      <div 
                        className="chat-bubble-user max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/15"
                      >
                        <div className="text-[var(--foreground)]/90 leading-relaxed" style={{ fontSize: '1.05rem' }}>
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="chat-bubble-assistant max-w-[80%] inline-block px-3 py-1.5 rounded-2xl border border-[var(--foreground)]/10"
                      >
                        <div className="text-[var(--foreground)]/90 leading-relaxed" style={{ fontSize: '1.05rem' }}>
                          {m.role === 'assistant' ? (
                            <>
                              <div className="chat-bubble">
                                <LessonBody body={sanitizeLessonBody(String(m.content || ''))} />
                              </div>
                            </>
                          ) : (
                            m.content
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Chat pill at bottom */}
            <div className="px-6 border-t border-[var(--foreground)]/10 flex-shrink-0" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
              <div 
                data-chat-pill
                className="chat-input-container flex items-center gap-2 px-4 py-2 border border-[var(--foreground)]/10 overflow-hidden"
                style={{ 
                  boxShadow: 'none',
                  borderRadius: '1.5rem',
                }}
              >
                <textarea
                  ref={chatInputRef as React.RefObject<HTMLTextAreaElement>}
                  data-chat-input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize textarea
                    if (chatInputRef.current && 'scrollHeight' in chatInputRef.current) {
                      const textarea = chatInputRef.current as HTMLTextAreaElement;
                      textarea.style.height = 'auto';
                      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
                    }
                  }}
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Chat with Chad..."
                  disabled={sending}
                  className="flex-1 bg-transparent border-none outline-none text-[var(--foreground)] placeholder:text-[var(--foreground)]/60 focus:outline-none resize-none overflow-hidden"
                  style={{ 
                    boxShadow: 'none', 
                    padding: '0.25rem 0.5rem', 
                    minHeight: '1.5rem', 
                    maxHeight: '120px', 
                    lineHeight: '1.5rem', 
                    borderRadius: '0', 
                    backgroundColor: 'transparent',
                    fontSize: '1.05rem'
                  }}
                  rows={1}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleToggleRecording}
                    disabled={sending || isTranscribing}
                    aria-pressed={isRecording}
                    title={isRecording ? "Stop recording" : "Record voice message"}
                    className={`unified-button transition-colors flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--foreground)]/10 ${
                      isRecording
                        ? 'text-[#FFB347] border-[#FFB347]/60'
                        : ''
                    } disabled:opacity-50`}
                    style={{ boxShadow: 'none' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 15c1.66 0 3-1.34 3-3V7a3 3 0 0 0-6 0v5c0 1.66 1.34 3 3 3z" />
                      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
                      <path d="M12 19v3" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (input.trim()) {
                        sendMessage();
                      }
                    }}
                    disabled={sending || !input.trim()}
                    className="unified-button transition-colors disabled:opacity-50 flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border"
                    style={{ boxShadow: 'none' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
              {(voiceError || isRecording || isTranscribing) && (
                <p className={`mt-2 text-[11px] ${voiceError ? 'text-[#FF8A8A]' : 'text-[var(--foreground)]/60'}`}>
                  {voiceError
                    ? voiceError
                    : isRecording
                      ? 'Recording… tap the mic to stop.'
                      : 'Transcribing voice...'}
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

type Subject = { name: string; slug: string };

function getSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("atomicSubjects");
    return raw ? (JSON.parse(raw) as Subject[]) : [];
  } catch {
    return [];
  }
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const pathname = usePathname();
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [subscriptionLevel, setSubscriptionLevel] = useState<string>("Free");
  const [username, setUsername] = useState<string>("");
  const hasPremiumAccess =
    subscriptionLevel === "Tester" ||
    subscriptionLevel === "Paid" ||
    subscriptionLevel === "mylittlepwettybebe";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promoCodeModalOpen, setPromoCodeModalOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uiZoom, setUiZoom] = useState<number>(1.4);
  const [isIOSStandalone, setIsIOSStandalone] = useState<boolean>(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [surgeLogModalOpen, setSurgeLogModalOpen] = useState(false);
  const [surgeLogRefreshKey, setSurgeLogRefreshKey] = useState(0); // Force re-render when data changes
  const [surgeLogData, setSurgeLogData] = useState<any[]>([]); // Store surge log data in state
  const [devToolsModalOpen, setDevToolsModalOpen] = useState(false);
  const [savedDataDump, setSavedDataDump] = useState<Array<{ slug: string; data: StoredSubjectData | null; raw: string | null }>>([]);
  const [savedDataLoading, setSavedDataLoading] = useState(false);
  const [savedDataError, setSavedDataError] = useState<string | null>(null);
  const [copiedSavedDataSlug, setCopiedSavedDataSlug] = useState<string | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [disclaimerModalOpen, setDisclaimerModalOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [expandedSurgeTopics, setExpandedSurgeTopics] = useState<Set<string>>(new Set());
  const [expandedSurgeQuestionTypes, setExpandedSurgeQuestionTypes] = useState<Set<string>>(new Set());
  const [expandedSurgeQuestions, setExpandedSurgeQuestions] = useState<Set<string>>(new Set());
  const [editingDate, setEditingDate] = useState<{ sessionId: string; type: 'topic' | 'question'; questionId?: string } | null>(null);
  const [editingDateValue, setEditingDateValue] = useState<string>("");
  const infoMarkdown = `
  # Welcome to Synapse
  
  Synapse turns your course materials into an adaptive learning system.
  
  ## What it does
  - Reads and analyzes **uploaded files** — lecture slides, old exams, syllabuses, or notes.
  - **Extracts core topics and concepts** that define each course.
  - Builds **structured lessons** that teach every concept from the ground up.
  - Adds **context-aware explanations** — click on any word or formula to get a clear, relevant definition.
  - Generates **interactive quizzes** at the end of each lesson for active recall and mastery.
  - Supports **multiple languages**, following the language used in your materials.
  - Provides **PDF export** and **spaced repetition** scheduling for long-term retention.
  
  ## How to use it
  1. **Upload files** on the home page to create a new course.
  2. Synapse automatically extracts and organizes the main topics.
  3. **Open a topic** to generate a full AI-driven lesson.
  4. **Click any word or paragraph** to get instant, context-aware help.
  5. **Take the quiz** at the end of each lesson to test your understanding.
  6. Revisit topics through the **review planner** to keep knowledge fresh.
  
  Synapse helps you learn smarter — not longer.
  `.trim();

  const loadAllSavedData = () => {
    if (typeof window === "undefined") return;
    setSavedDataLoading(true);
    setSavedDataError(null);
    try {
      const entries: Array<{ slug: string; data: StoredSubjectData | null; raw: string | null }> = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith("atomicSubjectData:")) continue;
        const slug = key.replace("atomicSubjectData:", "");
        const raw = window.localStorage.getItem(key);
        let parsed: StoredSubjectData | null = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw) as StoredSubjectData;
          } catch (err) {
            console.warn("Failed to parse saved data for", slug, err);
          }
        }
        entries.push({ slug, data: parsed, raw: raw ?? null });
      }
      entries.sort((a, b) => a.slug.localeCompare(b.slug));
      setSavedDataDump(entries);
      if (entries.length === 0) {
        setSavedDataError("No saved subject data found in this browser.");
      }
    } catch (err) {
      console.error("Failed to load saved data:", err);
      setSavedDataDump([]);
      setSavedDataError(err instanceof Error ? err.message : "Failed to load saved data.");
    } finally {
      setSavedDataLoading(false);
    }
  };

  // Auto-close thank you modal after 2 seconds
  useEffect(() => {
    if (showThankYou) {
      const timer = setTimeout(() => {
        setShowThankYou(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showThankYou]);

  // Check if user has seen the disclaimer on first visit
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const hasSeenDisclaimer = localStorage.getItem('synapse:disclaimer-seen');
      if (!hasSeenDisclaimer) {
        // Show disclaimer after a short delay to ensure page is loaded
        setTimeout(() => {
          setDisclaimerModalOpen(true);
        }, 500);
      }
    } catch {}
  }, []);

  // Allow other parts of the app (e.g. homepage) to open the pricing/settings modal
  useEffect(() => {
    const handleOpenSubscription = () => {
      setSettingsOpen(true);
    };
    const handleOpenSubscriptionUpgrade = () => {
      setSettingsOpen(true);
      // Let SettingsModal know it should immediately show the upgrade / subscription flow
      document.dispatchEvent(new CustomEvent("synapse:open-upgrade-modal"));
    };
    document.addEventListener("synapse:open-subscription", handleOpenSubscription as EventListener);
    document.addEventListener("synapse:open-subscription-upgrade", handleOpenSubscriptionUpgrade as EventListener);
    return () => {
      document.removeEventListener("synapse:open-subscription", handleOpenSubscription as EventListener);
      document.removeEventListener("synapse:open-subscription-upgrade", handleOpenSubscriptionUpgrade as EventListener);
    };
  }, []);

  const handleCopySavedData = async (slug: string, raw: string | null) => {
    if (!raw) {
      setSavedDataError(`No raw data available to copy for ${slug}.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(raw);
      setCopiedSavedDataSlug(slug);
    } catch (err) {
      console.error("Failed to copy saved data:", err);
      setSavedDataError("Failed to copy data to clipboard.");
    }
  };

  useEffect(() => {
    setSubjects(getSubjects());
    try {
      const raw = localStorage.getItem("atomicTheme");
      if (raw) {
        const t = JSON.parse(raw);
        const root = document.documentElement;
        root.style.setProperty("--background", t.background || "#1a1d23");
        root.style.setProperty("--foreground", t.foreground || "#E5E7EB");
        root.style.setProperty("--accent-cyan", t.accentCyan || "#00E5FF");
        root.style.setProperty("--accent-pink", t.accentPink || "#FF2D96");
        root.style.setProperty("--accent-grad", `linear-gradient(90deg, ${t.accentCyan || '#00E5FF'}, ${t.accentPink || '#FF2D96'})`);
      }
    } catch {}

    // Load initial theme mode
    try {
      const raw = localStorage.getItem("atomicTheme");
      if (raw) {
        const t = JSON.parse(raw);
        console.log('Loading theme from localStorage:', t);
        if (t.isLightMode) {
          console.log('Applying light mode');
          document.documentElement.classList.add('light-mode');
        } else {
          console.log('Applying dark mode');
          document.documentElement.classList.remove('light-mode');
        }
      }
    } catch (e) {
      console.error('Error loading theme:', e);
    }
  }, [pathname]);

  // Listen for chat sending state changes
  useEffect(() => {
    const handleChatSending = (e: Event) => {
      // Chat sending state is handled internally by ChatDropdown
      // No need to track it here
    };

    document.addEventListener('synapse:chat-sending', handleChatSending as EventListener);
    return () => {
      document.removeEventListener('synapse:chat-sending', handleChatSending as EventListener);
    };
  }, []);

  // Avoid CSS zoom on iOS PWA (breaks input focus and text selection)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && isStandalone) {
      setUiZoom(1);
      setIsIOSStandalone(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateLayout = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      setIsMobile(mobile);

      if (isIOSStandalone) {
        setUiZoom(1);
        return;
      }

      if (mobile) {
        setUiZoom(1);
      } else if (width < 1280) {
        setUiZoom(1.2);
      } else {
        setUiZoom(1.35);
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [isIOSStandalone]);

  // Header hide/show on scroll
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDifference = currentScrollY - lastScrollY;
      
      // Show header when scrolling up or at the top
      if (currentScrollY < 10 || scrollDifference < 0) {
        setHeaderVisible(true);
      } 
      // Hide header when scrolling down (only if scrolled past a threshold)
      else if (scrollDifference > 5 && currentScrollY > 100) {
        setHeaderVisible(false);
      }
      
      setLastScrollY(currentScrollY);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Hide header when onboarding is open
  useEffect(() => {
    const handleOnboardingOpen = () => {
      setHeaderVisible(false);
    };
    const handleOnboardingClose = () => {
      setHeaderVisible(true);
    };
    
    window.addEventListener('synapse:onboarding-open', handleOnboardingOpen);
    window.addEventListener('synapse:onboarding-close', handleOnboardingClose);
    return () => {
      window.removeEventListener('synapse:onboarding-open', handleOnboardingOpen);
      window.removeEventListener('synapse:onboarding-close', handleOnboardingClose);
    };
  }, []);

  // Load surge log data when modal opens or refresh key changes
  useEffect(() => {
    if (!surgeLogModalOpen) {
      setSurgeLogData([]);
      return;
    }

    const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
    if (!slugMatch) {
      setSurgeLogData([]);
      return;
    }
    const slug = slugMatch[1];

    try {
      const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
      if (stored) {
        const data = JSON.parse(stored);
        const surgeLog = data?.surgeLog || [];
        console.log("SurgeLog loaded into state:", {
          entryCount: surgeLog.length,
          timestamps: surgeLog.map((e: any) => ({
            sessionId: e.sessionId,
            timestamp: e.timestamp,
            date: new Date(e.timestamp).toISOString()
          }))
        });
        setSurgeLogData(surgeLog);
      } else {
        setSurgeLogData([]);
      }
    } catch (e) {
      console.error("Failed to load surge log:", e);
      setSurgeLogData([]);
    }
  }, [surgeLogModalOpen, surgeLogRefreshKey, pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsOpen && !(event.target as Element).closest('.settings-modal')) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!copiedSavedDataSlug) return;
    const timer = setTimeout(() => setCopiedSavedDataSlug(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedSavedDataSlug]);

  // Determine auth state (used to hide chrome on login page and show Logout)
  useEffect(() => {
    (async () => {
      try {
        const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
        setIsAuthenticated(!!me?.user);
        if (me?.user?.subscriptionLevel) {
          setSubscriptionLevel(me.user.subscriptionLevel);
        } else {
          setSubscriptionLevel("Free");
        }
        if (me?.user?.username) {
          setUsername(me.user.username);
        }
      } catch {
        setIsAuthenticated(false);
        setSubscriptionLevel("Free");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClick = (event: MouseEvent | TouchEvent) => {
      if (!mobileMenuRef.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (!mobileMenuRef.current.contains(target)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [mobileMenuOpen]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    try {
      // Clear client cache of user data
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k === "atomicSubjects" || k.startsWith("atomicSubjectData:"))) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch {}
    // Redirect to login page with full reload
    window.location.href = "/";
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.error("Error attempting to exit fullscreen:", err);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const crumbs = useMemo(() => {
    const parts = (pathname || "/").split("/").filter(Boolean);
    const items: { label: string; href: string }[] = [];
    const idxSubjects = parts.indexOf("subjects");
    const idxNode = parts.indexOf("node");
    const idxLesson = parts.indexOf("lesson");

    // Subject
    if (idxSubjects >= 0 && parts[idxSubjects + 1]) {
      const slug = parts[idxSubjects + 1];
      const subj = subjects.find((s) => s.slug === slug);
      items.push({ label: subj?.name || decodeURIComponent(slug), href: `/subjects/${slug}` });
    }
    // Topic
    if (idxSubjects >= 0 && idxNode >= 0 && parts[idxSubjects + 1] && parts[idxNode + 1]) {
      const slug = parts[idxSubjects + 1];
      const topic = decodeURIComponent(parts[idxNode + 1]);
      items.push({ label: topic, href: `/subjects/${slug}/node/${encodeURIComponent(topic)}` });
    }
    // Lesson
    if (idxSubjects >= 0 && idxNode >= 0 && idxLesson >= 0 && parts[idxSubjects + 1] && parts[idxNode + 1] && parts[idxLesson + 1]) {
      const slug = parts[idxSubjects + 1];
      const topic = decodeURIComponent(parts[idxNode + 1]);
      const lidx = parts[idxLesson + 1];
      const label = `Lesson ${isNaN(Number(lidx)) ? lidx : Number(lidx) + 1}`;
      items.push({ label, href: `/subjects/${slug}/node/${encodeURIComponent(topic)}/lesson/${lidx}` });
    }
    return items;
  }, [pathname, subjects]);

  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  return (
    <>
      {/* Loading Screen - show immediately when authenticated, or while checking auth (assumes will be authenticated after login) */}
      {isLoading && (!authChecked || isAuthenticated) && <LoadingScreen onComplete={handleLoadingComplete} />}
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]" style={!isIOSStandalone && !isMobile ? { zoom: uiZoom } : undefined}>
      {/* Main content */}
      <div className="flex min-h-screen w-full flex-col relative">
        {/* Overlay to hide content above header on iPad */}
        {authChecked && isAuthenticated && (
          <div 
            className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
            style={{ 
              height: 'env(safe-area-inset-top, 0px)', 
              backgroundColor: 'var(--background)',
            }}
          />
        )}
        {authChecked && isAuthenticated && (
        <header 
          className="sticky top-0 z-50 transition-transform duration-300 ease-in-out" 
          style={{ 
            paddingTop: 'env(safe-area-inset-top, 0px)', 
            backgroundColor: 'var(--background)', 
            backdropFilter: 'blur(10px) saturate(180%)', 
            WebkitBackdropFilter: 'blur(10px) saturate(180%)', 
            isolation: 'isolate',
            transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)',
          }}
        >
          <nav className="relative flex h-14 items-center px-3 sm:px-4 gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  router.push('/');
                }}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity !shadow-none pl-0 pr-20 py-2"
              >
                <GlowSpinner size={24} ariaLabel="Synapse" idSuffix="header" />
                <div style={{ transform: "scale(1.2)", transformOrigin: "left center" }}>
                  <h1
                    className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider relative inline-block"
                    style={{ fontFamily: "var(--font-rajdhani), sans-serif" }}
                  >
                    SYNAPSE
                    <sup
                      className="text-xs text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] absolute -top-0.5 left-full ml-1"
                      style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
                    >
                      (ALPHA)
                    </sup>
                  </h1>
                </div>
              </button>
            </div>

            {/* Center: Clock and Temperature */}
            <div className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 items-center gap-4">
              {/* Clock Component */}
              <ClockDisplay />
              {/* Temperature Component */}
              <TemperatureDisplay />
              {/* SURGE text on surge page */}
              {pathname?.includes('/surge') && (
                <h1 
                  className="text-3xl font-bold tracking-wider text-[var(--foreground)]/80" 
                  style={{ 
                    fontFamily: 'var(--font-orbitron), sans-serif',
                    fontWeight: 700,
                    letterSpacing: '0.15em'
                  }}
                >
                  SURGE
                </h1>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {!isMobile && (
                <>
                {/* SurgeLog button - only for Tester subscription on surge page */}
                  {subscriptionLevel === "Tester" && pathname?.includes('/surge') && (
                      <button
                        onClick={() => {
                          setSurgeLogModalOpen(true);
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }}
                        className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                                   focus:outline-none focus:ring-0 focus-visible:outline-none
                                   transition-all duration-300 ease-out"
                        style={{ 
                          outline: 'none', 
                          WebkitTapHighlightColor: 'transparent', 
                          transform: 'none !important',
                          borderRadius: '50%',
                          margin: 0,
                          display: 'flex',
                          height: '32px',
                          width: '32px',
                          boxShadow: 'none',
                        }}
                        aria-label="Surge Log"
                        title="Surge Log"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                  )}
                  {/* DevTools button - only for Tester subscription */}
                  {subscriptionLevel === "Tester" && (
                    <button
                      onClick={() => {
                        setDevToolsModalOpen(true);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }}
                      className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                                 focus:outline-none focus:ring-0 focus-visible:outline-none
                                 transition-all duration-300 ease-out"
                      style={{ 
                        outline: 'none', 
                        WebkitTapHighlightColor: 'transparent', 
                        transform: 'none !important',
                        borderRadius: '50%',
                        margin: 0,
                        display: 'flex',
                        height: '32px',
                        width: '32px',
                        boxShadow: 'none',
                      }}
                      aria-label="DevTools"
                      title="DevTools"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  )}
                  {/* Feedback Button */}
                  <button
                    onClick={() => setFeedbackModalOpen(true)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                               focus:outline-none focus:ring-0 focus-visible:outline-none
                               transition-all duration-300 ease-out"
                    style={{ 
                      outline: 'none', 
                      WebkitTapHighlightColor: 'transparent', 
                      transform: 'none !important',
                      borderRadius: '50%',
                      margin: 0,
                      display: 'flex',
                      height: '32px',
                      width: '32px',
                      boxShadow: 'none',
                    }}
                    aria-label="Feedback"
                    title="Leave Feedback"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </button>
                  {/* Promo Code Management Button - Only for cwallerstedt */}
                  {username === "cwallerstedt" && (
                    <button
                      onClick={() => setPromoCodeModalOpen(true)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }}
                      className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                                 focus:outline-none focus:ring-0 focus-visible:outline-none
                                 transition-all duration-300 ease-out"
                      style={{ 
                        outline: 'none', 
                        WebkitTapHighlightColor: 'transparent', 
                        transform: 'none !important',
                        borderRadius: '50%',
                        margin: 0,
                        display: 'flex',
                        height: '32px',
                        width: '32px',
                        boxShadow: 'none',
                      }}
                      aria-label="Founders Toolbox"
                      title="Founders Toolbox"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </button>
                  )}
                  {/* Pomodoro Timer */}
                  <PomodoroTimer />
                </>
              )}
              <div className="hidden md:flex items-center gap-2">
                {/* Fullscreen button */}
                  <button
                    onClick={toggleFullscreen}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                               focus:outline-none focus:ring-0 focus-visible:outline-none
                               transition-all duration-300 ease-out"
                    style={{ 
                      outline: 'none', 
                      WebkitTapHighlightColor: 'transparent', 
                      transform: 'none !important',
                      borderRadius: '50%',
                      margin: 0,
                      display: 'flex',
                      height: '32px',
                      width: '32px',
                      boxShadow: 'none',
                    }}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFullscreen ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    )}
                  </button>
                {/* Settings button */}
                  <button
                    onClick={() => setSettingsOpen(true)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }}
                    className="unified-button relative inline-flex items-center justify-center px-1.5 py-1.5
                               focus:outline-none focus:ring-0 focus-visible:outline-none
                               transition-all duration-300 ease-out"
                    style={{ 
                      outline: 'none', 
                      WebkitTapHighlightColor: 'transparent', 
                      transform: 'none !important',
                      borderRadius: '50%',
                      margin: 0,
                      display: 'flex',
                      height: '32px',
                      width: '32px',
                      boxShadow: 'none',
                    }}
                    aria-label="Settings"
                    title="Settings"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </button>
              </div>

              <div ref={mobileMenuRef} className="relative md:hidden">
                {/* Mobile menu button - hamburger icon */}
                <button
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  className="unified-button inline-flex items-center justify-center px-3 py-2.5 rounded-lg text-sm transition-colors"
                  aria-expanded={mobileMenuOpen}
                  aria-haspopup="true"
                  aria-label="Menu"
                >
                  <svg className={`h-5 w-5 transition-transform ${mobileMenuOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </svg>
                </button>

                {mobileMenuOpen && isMobile && (
                  <div 
                    className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl bg-[var(--background)]/95 backdrop-blur-md border border-[var(--foreground)]/10 p-3 space-y-4 z-50"
                    style={{
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
                    }}
                  >
                    <div className="border-t border-[var(--foreground)]/10 pt-3">
                      <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/60">Pomodoro</p>
                      <div className="mt-2">
                        <PomodoroTimer />
                      </div>
                    </div>

                    <div className="border-t border-[var(--foreground)]/10 pt-3 space-y-2">
                      {hasPremiumAccess && (
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            document.dispatchEvent(new CustomEvent('synapse:open-chat'));
                          }}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                        >
                          Open Chat
                        </button>
                      )}
                      {/* SurgeLog button - only for Tester subscription on surge page */}
                      {subscriptionLevel === "Tester" && pathname?.includes('/surge') && (
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setSurgeLogModalOpen(true);
                          }}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                        >
                          Surge Log
                        </button>
                      )}
                      {/* DevTools button - only for Tester subscription */}
                      {subscriptionLevel === "Tester" && (
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setDevToolsModalOpen(true);
                          }}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                        >
                          DevTools
                        </button>
                      )}
                      {/* Feedback Button */}
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setFeedbackModalOpen(true);
                        }}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                      >
                        Leave Feedback
                      </button>
                      {/* Promo Code Management Button - Only for cwallerstedt */}
                      {username === "cwallerstedt" && (
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setPromoCodeModalOpen(true);
                          }}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                        >
                          Founders Toolbox
                        </button>
                      )}
                      {/* Fullscreen button */}
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          toggleFullscreen();
                        }}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                      >
                        {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                      </button>
                      <button
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                        className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 bg-[var(--foreground)]/8 hover:bg-[var(--foreground)]/12 border border-[var(--foreground)]/10 hover:border-[var(--foreground)]/20 text-[var(--foreground)]/80 hover:text-[var(--foreground)]"
                      >
                        Settings
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </nav>
          {/* Glowing gradient separator */}
          <div className="relative h-[2px] overflow-hidden">
            {/* Main line */}
            <div className="relative h-[2px] bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] opacity-60 z-10" />
            {/* Glow layer under the line */}
            <div className="absolute left-0 right-0 h-[4px] top-[2px] bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] opacity-90 blur-sm" />
          </div>
        </header>
        )}
        {/* Chat button positioned just below header */}
        {authChecked && isAuthenticated && !isMobile && hasPremiumAccess && (
          <div className="fixed left-1/2 transform -translate-x-1/2 z-40" style={{ top: 'calc(3.5rem + max(3px, calc(env(safe-area-inset-top, 0px) / 2)) - 0.2rem)' }}>
            <ChatDropdown hasPremiumAccess={hasPremiumAccess} />
          </div>
        )}
        <main className="flex-1">{children}</main>
      </div>
      <div className="settings-modal">
        <SettingsModal 
          open={settingsOpen} 
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
          isAuthenticated={isAuthenticated}
          subscriptionLevel={subscriptionLevel}
          onSubscriptionLevelChange={(level) => setSubscriptionLevel(level)}
        />
      </div>
      {/* Disclaimer Modal - shown on first visit */}
      <Modal
        open={disclaimerModalOpen}
        onClose={() => {
          setDisclaimerModalOpen(false);
          try {
            localStorage.setItem('synapse:disclaimer-seen', 'true');
          } catch {}
        }}
      >
        {/* Extra vertical padding so the synapse-style button and its glow never touch the modal border */}
        <div className="space-y-6 pt-1 pb-4">
          {/* Synapse Logo Header */}
          <div className="text-center pb-2">
            <h1 className="text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-pink)] to-[var(--accent-cyan)] bg-[length:200%_200%] animate-[gradient-shift_3s_ease-in-out_infinite] tracking-wider" style={{ fontFamily: 'var(--font-rajdhani), sans-serif' }}>
              SYNAPSE
            </h1>
            <p className="text-sm font-medium text-[var(--foreground)]/70 mt-2">⚠️ In Active Development</p>
          </div>

          {/* Content */}
          <div className="text-sm text-[var(--foreground)] leading-relaxed space-y-4">
            <p>
              <strong>Synapse is still being developed</strong> and contains untested features that may bug or not work as expected.
            </p>
            <p>
              Some features might be incomplete, unstable, or behave unexpectedly. We're actively working to improve stability and add new capabilities.
            </p>
            
            {/* Feedback Section with Icon */}
            <div className="pt-4 border-t border-[var(--foreground)]/20">
              <p className="mb-3">
                <strong>Found a bug or have an idea?</strong> Please report it using the Feedback button in the top right corner.
              </p>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/60">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--foreground)]/10">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--foreground)]">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-xs text-[var(--foreground)]/70">
                  Look for this <strong className="text-[var(--foreground)]">Feedback</strong> icon in the top right corner of the header.
                </p>
              </div>
              <p className="mt-3 text-xs text-[var(--foreground)]/60">
                Your feedback helps us build a better product!
              </p>
            </div>
          </div>

          {/* Button */}
          <div className="flex justify-end gap-2 pt-4 px-2">
            <button
              onClick={() => {
                setDisclaimerModalOpen(false);
                try {
                  localStorage.setItem('synapse:disclaimer-seen', 'true');
                } catch {}
              }}
              className="synapse-style px-6 py-2.5 rounded-full text-sm font-medium !text-white transition-opacity hover:opacity-90"
            >
              <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                Got it
              </span>
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={accountOpen}
        onClose={() => { if (!authLoading) { setAccountOpen(false); setAuthError(null); } }}
        title={authMode === "login" ? "Sign in" : "Create account"}
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="text-xs text-[var(--foreground)]/60">
              {authMode === "login" ? (
                <>No account? <button onClick={() => setAuthMode("signup")} className="underline">Sign up</button></>
              ) : (
                <>Have an account? <button onClick={() => setAuthMode("login")} className="underline">Sign in</button></>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAccountOpen(false)}
                disabled={authLoading}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm"
                style={{ backgroundColor: '#141923', color: 'white' }}
              >
                Close
              </button>
              <button
                onClick={async () => {
                  try {
                    setAuthLoading(true);
                    setAuthError(null);
                    const res = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/signup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username: authUsername.trim(), password: authPassword }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed");
                    setAccountOpen(false);
                    setAuthUsername("");
                    setAuthPassword("");
                    // Fetch user data including subscription level
                    try {
                      const me = await fetch("/api/me").then(r => r.json().catch(() => ({})));
                      setIsAuthenticated(!!me?.user);
                      if (me?.user?.subscriptionLevel) {
                        setSubscriptionLevel(me.user.subscriptionLevel);
                      } else {
                        setSubscriptionLevel("Free");
                      }
                    } catch {}
                    // Reload to pick up server-synced state
                    router.refresh();
                  } catch (e: any) {
                    setAuthError(e?.message || "Something went wrong");
                  } finally {
                    setAuthLoading(false);
                  }
                }}
                disabled={authLoading || !authUsername.trim() || authPassword.length < 6}
                className="synapse-style inline-flex h-9 items-center rounded-full px-4 text-sm font-medium !text-white  disabled:opacity-60 disabled:!text-white"
                style={{ color: 'white', zIndex: 100, position: 'relative' }}
              >
                <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>
                  {authLoading ? (authMode === "login" ? "Signing in..." : "Creating...") : (authMode === "login" ? "Sign in" : "Sign up")}
                </span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          {authError && <div className="text-sm text-[#FFC0DA]">{authError}</div>}
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground)]/70">Username</label>
            <input
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="yourname"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--foreground)]/70">Password</label>
            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              type="password"
              className="w-full rounded-xl border border-[var(--foreground)]/20 bg-[var(--background)]/80 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground)]/50 focus:border-[var(--accent-cyan)] focus:outline-none"
              placeholder="At least 6 characters"
            />
          </div>
          <div className="text-[10px] text-[var(--foreground)]/60">
            Your data will be saved securely to your account.
          </div>
        </div>
      </Modal>
      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="About this app"
        footer={
          <div className="flex items-center justify-end">
            <button
              onClick={() => setInfoOpen(false)}
              className="inline-flex h-9 items-center rounded-full px-4 text-sm"
              style={{ backgroundColor: '#141923', color: 'white' }}
            >
              Close
            </button>
          </div>
        }
      >
        <div className="lesson-content text-sm">
          <LessonBody body={sanitizeLessonBody(infoMarkdown)} />
        </div>
      </Modal>

      {/* SurgeLog Modal */}
      {surgeLogModalOpen && (() => {
        // Extract slug from pathname
        const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
        if (!slugMatch) return null;
        const slug = slugMatch[1];
        
        // Use the surgeLogData state (loaded via useEffect)
        const surgeLog = surgeLogData;

        // Group all quiz results by topic across all sessions
        const allQuizResults: Array<{ entry: any; result: any; sessionDate: string }> = [];
        surgeLog.forEach((entry: any) => {
          if (entry.quizResults && Array.isArray(entry.quizResults) && entry.quizResults.length > 0) {
            entry.quizResults.forEach((result: any) => {
              allQuizResults.push({
                entry,
                result,
                sessionDate: new Date(entry.timestamp).toLocaleDateString(),
              });
            });
          }
        });

        // Group by topic
        const groupedByTopic: Record<string, Array<{ entry: any; result: any; sessionDate: string }>> = {};
        allQuizResults.forEach((item) => {
          const topic = item.result.topic || item.entry.newTopic || "Unknown";
          if (!groupedByTopic[topic]) {
            groupedByTopic[topic] = [];
          }
          groupedByTopic[topic].push(item);
        });

        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
            onClick={() => setSurgeLogModalOpen(false)}
          >
            <div 
              className="w-full max-w-2xl rounded-2xl border border-[var(--foreground)]/30 bg-[var(--background)]/95 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    Surge Log
                  </h2>
                  <p className="text-xs text-[var(--foreground)]/60">
                    Your Surge session history with quiz results. Entries persist per course.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                      if (!slugMatch) return;
                      const slug = slugMatch[1];
                      
                      if (confirm("Are you sure you want to clear all Surge logs for this course? This action cannot be undone.")) {
                        try {
                          const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                          if (stored) {
                            const data = JSON.parse(stored);
                            data.surgeLog = [];
                            localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                            
                            // Also sync to server if authenticated
                            if (isAuthenticated) {
                              try {
                                await fetch(`/api/subject-data?slug=${encodeURIComponent(slug)}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ data })
                                });
                              } catch (serverError) {
                                console.warn("Failed to sync cleared surge log to server:", serverError);
                                // Continue anyway - local clear is done
                              }
                            }
                            
                            setSurgeLogModalOpen(false);
                            // Refresh the page to update the UI
                            window.location.reload();
                          }
                        } catch (e) {
                          console.error("Failed to clear surge log:", e);
                          alert("Failed to clear surge log. Check console for details.");
                        }
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    aria-label="Clear surge logs"
                  >
                    Clear Logs
                  </button>
                  <button
                    onClick={() => setSurgeLogModalOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--background)]/80 text-[var(--foreground)] hover:bg-[var(--background)]/70 transition-colors"
                    aria-label="Close surge log"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4 text-sm leading-relaxed text-[var(--foreground)] space-y-2">
                {Object.keys(groupedByTopic).length > 0 ? (
                  Object.entries(groupedByTopic)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([topicName, items]) => {
                      const isExpanded = expandedSurgeTopics.has(topicName);
                      const avgGrade = items.reduce((sum, item) => sum + (item.result.grade || 0), 0) / items.length;
                      const latestItem = items.sort((a, b) => b.entry.timestamp - a.entry.timestamp)[0];

                      return (
                        <div
                          key={topicName}
                          className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--background)]/80 overflow-hidden"
                        >
                          {/* Topic Header - Clickable */}
                          <button
                            onClick={() => {
                              setExpandedSurgeTopics(prev => {
                                const next = new Set(prev);
                                if (next.has(topicName)) {
                                  next.delete(topicName);
                                } else {
                                  next.add(topicName);
                                }
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-4 hover:bg-[var(--background)]/60 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`text-base font-semibold text-[var(--foreground)]`}>
                                {topicName}
                              </div>
                              <div className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
                                {items.length} question{items.length !== 1 ? 's' : ''}
                              </div>
                              <div className={`px-2 py-1 rounded text-xs font-bold ${
                                avgGrade >= 8 ? 'bg-green-500/20 text-green-400' :
                                avgGrade >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                Avg: {avgGrade.toFixed(1)}/10
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {subscriptionLevel === "Tester" && editingDate?.sessionId === latestItem.entry.sessionId && editingDate?.type === 'topic' ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="date"
                                    value={editingDateValue}
                                    onChange={(e) => setEditingDateValue(e.target.value)}
                                    onBlur={() => {
                                      if (editingDateValue) {
                                        // Parse date string (YYYY-MM-DD) and create UTC date at midnight
                                        const [year, month, day] = editingDateValue.split('-').map(Number);
                                        const newTimestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
                                        const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                                        if (slugMatch) {
                                          const slug = slugMatch[1];
                                          try {
                                            const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                                            if (stored) {
                                              const data = JSON.parse(stored);
                                              const surgeLog = data?.surgeLog || [];
                                              // Update ALL entries with this sessionId (in case there are duplicates)
                                              let updated = false;
                                              surgeLog.forEach((e: any, idx: number) => {
                                                if (e.sessionId === latestItem.entry.sessionId) {
                                                  surgeLog[idx].timestamp = newTimestamp;
                                                  updated = true;
                                                }
                                              });
                                              
                                              if (updated) {
                                                console.log("=== DATE UPDATE DEBUG START ===");
                                                console.log("Editing sessionId:", latestItem.entry.sessionId);
                                                console.log("New timestamp:", newTimestamp, "New date:", new Date(newTimestamp).toISOString());
                                                console.log("1. Before save - surgeLog entries:", JSON.stringify(surgeLog.map((e: any) => ({
                                                  sessionId: e.sessionId,
                                                  timestamp: e.timestamp,
                                                  date: new Date(e.timestamp).toISOString()
                                                })), null, 2));
                                                
                                                localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                                                
                                                // Verify the save by reading it back immediately
                                                const verify = localStorage.getItem(`atomicSubjectData:${slug}`);
                                                if (verify) {
                                                  const verifyData = JSON.parse(verify);
                                                  console.log("2. After save - localStorage contains:", JSON.stringify(verifyData?.surgeLog?.map((e: any) => ({
                                                    sessionId: e.sessionId,
                                                    timestamp: e.timestamp,
                                                    date: new Date(e.timestamp).toISOString()
                                                  })), null, 2));
                                                  
                                                  const verifyEntry = verifyData?.surgeLog?.find((e: any) => e.sessionId === latestItem.entry.sessionId);
                                                  console.log("3. Verified entry:", {
                                                    sessionId: latestItem.entry.sessionId,
                                                    newTimestamp,
                                                    newDate: new Date(newTimestamp).toISOString(),
                                                    verifiedTimestamp: verifyEntry?.timestamp,
                                                    verifiedDate: verifyEntry ? new Date(verifyEntry.timestamp).toISOString() : "not found",
                                                    match: verifyEntry?.timestamp === newTimestamp
                                                  });
                                                  
                                                  // Also check all entries to see if any were affected
                                                  const allEntries = verifyData?.surgeLog || [];
                                                  console.log("4. All entries after save:", JSON.stringify(allEntries.map((e: any, idx: number) => ({
                                                    index: idx,
                                                    sessionId: e.sessionId,
                                                    timestamp: e.timestamp,
                                                    date: new Date(e.timestamp).toISOString(),
                                                    isEdited: e.sessionId === latestItem.entry.sessionId
                                                  })), null, 2));
                                                  
                                                  // Check what getLastSurgeSession would return
                                                  const latest = allEntries.reduce((latest: any, entry: any) => {
                                                    return entry.timestamp > latest.timestamp ? entry : latest;
                                                  }, allEntries[0]);
                                                  console.log("5. What getLastSurgeSession would return:", {
                                                    sessionId: latest?.sessionId,
                                                    timestamp: latest?.timestamp,
                                                    date: latest ? new Date(latest.timestamp).toISOString() : "none",
                                                    isEdited: latest?.sessionId === latestItem.entry.sessionId
                                                  });
                                                } else {
                                                  console.error("5. Failed to read back from localStorage!");
                                                }
                                                
                                                console.log("=== DATE UPDATE DEBUG END ===");
                                                
                                                // Dispatch event to notify surge page to reload lastSurge
                                                window.dispatchEvent(new CustomEvent('surgeLogDateUpdated', { detail: { slug } }));
                                                // Force a re-render by incrementing the refresh key
                                                setSurgeLogRefreshKey(prev => prev + 1);
                                              } else {
                                                console.error("Failed to find entry with sessionId:", latestItem.entry.sessionId);
                                              }
                                            }
                                          } catch (e) {
                                            console.error("Failed to update date:", e);
                                          }
                                        }
                                        setEditingDate(null);
                                        setEditingDateValue("");
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.currentTarget.blur();
                                      } else if (e.key === "Escape") {
                                        setEditingDate(null);
                                        setEditingDateValue("");
                                      }
                                    }}
                                    className="text-xs px-2 py-1 rounded border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]"
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <div 
                                  className={`text-xs text-[var(--foreground)]/50 ${subscriptionLevel === "Tester" ? "cursor-pointer hover:text-[var(--accent-cyan)]/70 transition-colors" : ""}`}
                                  onClick={() => {
                                    if (subscriptionLevel === "Tester") {
                                      const dateValue = new Date(latestItem.entry.timestamp).toISOString().split('T')[0];
                                      setEditingDate({ sessionId: latestItem.entry.sessionId, type: 'topic' });
                                      setEditingDateValue(dateValue);
                                    }
                                  }}
                                  title={subscriptionLevel === "Tester" ? "Click to edit date" : ""}
                                >
                                  {latestItem.sessionDate}
                                </div>
                              )}
                              <svg
                                className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {/* Questions List - Grouped by Type */}
                          {isExpanded && (() => {
                            // Group items by question type (MC vs Harder)
                            const mcQuestions = items.filter(item => item.result.stage === "mc");
                            const harderQuestions = items.filter(item => item.result.stage === "harder");
                            
                            return (
                              <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                {/* Multiple Choice Questions */}
                                {mcQuestions.length > 0 && (() => {
                                  const questionTypeKey = `${topicName}-mc`;
                                  const isTypeExpanded = expandedSurgeQuestionTypes.has(questionTypeKey);
                                  const mcAvgGrade = mcQuestions.reduce((sum, item) => sum + (item.result.grade || 0), 0) / mcQuestions.length;
                                  
                                  return (
                                    <div className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/60 overflow-hidden">
                                      <button
                                        onClick={() => {
                                          setExpandedSurgeQuestionTypes(prev => {
                                            const next = new Set(prev);
                                            if (next.has(questionTypeKey)) {
                                              next.delete(questionTypeKey);
                                            } else {
                                              next.add(questionTypeKey);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/80 transition-colors text-left"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="text-sm font-semibold text-[var(--foreground)]">
                                            Multiple Choice Questions
                                          </div>
                                          <div className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]">
                                            {mcQuestions.length} question{mcQuestions.length !== 1 ? 's' : ''}
                                          </div>
                                          <div className={`px-2 py-1 rounded text-xs font-bold ${
                                            mcAvgGrade >= 8 ? 'bg-green-500/20 text-green-400' :
                                            mcAvgGrade >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                          }`}>
                                            Avg: {mcAvgGrade.toFixed(1)}/10
                                          </div>
                                        </div>
                                        <svg
                                          className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform ${isTypeExpanded ? 'rotate-180' : ''}`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                      
                                      {isTypeExpanded && (
                                        <div className="border-t border-[var(--foreground)]/10 p-3 space-y-2">
                                          {mcQuestions
                                            .sort((a, b) => b.entry.timestamp - a.entry.timestamp)
                                            .map((item, idx) => {
                                              const questionId = `${topicName}-mc-${idx}-${item.result.question}`;
                                              const isQuestionExpanded = expandedSurgeQuestions.has(questionId);
                                              const questionPreview = item.result.question
                                                ? item.result.question
                                                    .replace(/◊/g, '')
                                                    .replace(/<[^>]*>/g, '')
                                                    .replace(/\*\*/g, '')
                                                    .replace(/#{1,6}\s/g, '')
                                                    .trim()
                                                    .slice(0, 100)
                                                : 'No question recorded';
                                              
                                              return (
                                                <div
                                                  key={questionId}
                                                  className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50 overflow-hidden"
                                                >
                                                  <button
                                                    onClick={() => {
                                                      setExpandedSurgeQuestions(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(questionId)) {
                                                          next.delete(questionId);
                                                        } else {
                                                          next.add(questionId);
                                                        }
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/70 transition-colors text-left"
                                                  >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                      <div className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${
                                                        (item.result.grade || 0) >= 8 ? 'bg-green-500/20 text-green-400' :
                                                        (item.result.grade || 0) >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'
                                                      }`}>
                                                        {(item.result.grade || 0)}/10
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-[var(--foreground)]/90 truncate">
                                                          {questionPreview}
                                                          {questionPreview.length >= 100 && '...'}
                                                        </div>
                                                      </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                      {subscriptionLevel === "Tester" && editingDate?.sessionId === item.entry.sessionId && editingDate?.type === 'question' && editingDate?.questionId === questionId ? (
                                                        <div className="flex items-center gap-1">
                                                          <input
                                                            type="date"
                                                            value={editingDateValue}
                                                            onChange={(e) => setEditingDateValue(e.target.value)}
                                                            onBlur={() => {
                                                              if (editingDateValue) {
                                                                // Parse date string (YYYY-MM-DD) and create UTC date at midnight
                                        const [year, month, day] = editingDateValue.split('-').map(Number);
                                        const newTimestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
                                                                const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                                                                if (slugMatch) {
                                                                  const slug = slugMatch[1];
                                                                  try {
                                                                    const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                                                                    if (stored) {
                                                                      const data = JSON.parse(stored);
                                                                      const surgeLog = data?.surgeLog || [];
                                                                      // Update ALL entries with this sessionId
                                                                      let updated = false;
                                                                      surgeLog.forEach((e: any, idx: number) => {
                                                                        if (e.sessionId === item.entry.sessionId) {
                                                                          surgeLog[idx].timestamp = newTimestamp;
                                                                          updated = true;
                                                                        }
                                                                      });
                                                                      
                                                                      if (updated) {
                                                                        localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                                                                        // Dispatch event to notify surge page to reload lastSurge
                                                                        window.dispatchEvent(new CustomEvent('surgeLogDateUpdated', { detail: { slug } }));
                                                                        // Force a re-render by incrementing the refresh key
                                                                        setSurgeLogRefreshKey(prev => prev + 1);
                                                                      }
                                                                    }
                                                                  } catch (e) {
                                                                    console.error("Failed to update date:", e);
                                                                  }
                                                                }
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            onKeyDown={(e) => {
                                                              if (e.key === "Enter") {
                                                                e.currentTarget.blur();
                                                              } else if (e.key === "Escape") {
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            className="text-xs px-2 py-1 rounded border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]"
                                                            autoFocus
                                                          />
                                                        </div>
                                                      ) : (
                                                        <div 
                                                          className={`text-xs text-[var(--foreground)]/50 ${subscriptionLevel === "Tester" ? "cursor-pointer hover:text-[var(--accent-cyan)]/70 transition-colors" : ""}`}
                                                          onClick={() => {
                                                            if (subscriptionLevel === "Tester") {
                                                              const dateValue = new Date(item.entry.timestamp).toISOString().split('T')[0];
                                                              setEditingDate({ sessionId: item.entry.sessionId, type: 'question', questionId });
                                                              setEditingDateValue(dateValue);
                                                            }
                                                          }}
                                                          title={subscriptionLevel === "Tester" ? "Click to edit date" : ""}
                                                        >
                                                          {item.sessionDate}
                                                        </div>
                                                      )}
                                                      <svg
                                                        className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform flex-shrink-0 ${isQuestionExpanded ? 'rotate-180' : ''}`}
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                      >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                      </svg>
                                                    </div>
                                                  </button>
                                                  
                                                  {isQuestionExpanded && (
                                                    <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                                      {item.result.question && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Question
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.question)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.explanation && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Explanation
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.explanation)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                
                                {/* Harder/Quiz Questions */}
                                {harderQuestions.length > 0 && (() => {
                                  const questionTypeKey = `${topicName}-harder`;
                                  const isTypeExpanded = expandedSurgeQuestionTypes.has(questionTypeKey);
                                  const harderAvgGrade = harderQuestions.reduce((sum, item) => sum + (item.result.grade || 0), 0) / harderQuestions.length;
                                  
                                  return (
                                    <div className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/60 overflow-hidden">
                                      <button
                                        onClick={() => {
                                          setExpandedSurgeQuestionTypes(prev => {
                                            const next = new Set(prev);
                                            if (next.has(questionTypeKey)) {
                                              next.delete(questionTypeKey);
                                            } else {
                                              next.add(questionTypeKey);
                                            }
                                            return next;
                                          });
                                        }}
                                        className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/80 transition-colors text-left"
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="text-sm font-semibold text-[var(--foreground)]">
                                            Quiz Questions
                                          </div>
                                          <div className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]">
                                            {harderQuestions.length} question{harderQuestions.length !== 1 ? 's' : ''}
                                          </div>
                                          <div className={`px-2 py-1 rounded text-xs font-bold ${
                                            harderAvgGrade >= 8 ? 'bg-green-500/20 text-green-400' :
                                            harderAvgGrade >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                          }`}>
                                            Avg: {harderAvgGrade.toFixed(1)}/10
                                          </div>
                                        </div>
                                        <svg
                                          className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform ${isTypeExpanded ? 'rotate-180' : ''}`}
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                        >
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                      
                                      {isTypeExpanded && (
                                        <div className="border-t border-[var(--foreground)]/10 p-3 space-y-2">
                                          {harderQuestions
                                            .sort((a, b) => b.entry.timestamp - a.entry.timestamp)
                                            .map((item, idx) => {
                                              const questionId = `${topicName}-harder-${idx}-${item.result.question}`;
                                              const isQuestionExpanded = expandedSurgeQuestions.has(questionId);
                                              const questionPreview = item.result.question
                                                ? item.result.question
                                                    .replace(/◊/g, '')
                                                    .replace(/<[^>]*>/g, '')
                                                    .replace(/\*\*/g, '')
                                                    .replace(/#{1,6}\s/g, '')
                                                    .trim()
                                                    .slice(0, 100)
                                                : 'No question recorded';
                                              
                                              return (
                                                <div
                                                  key={questionId}
                                                  className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--background)]/50 overflow-hidden"
                                                >
                                                  <button
                                                    onClick={() => {
                                                      setExpandedSurgeQuestions(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(questionId)) {
                                                          next.delete(questionId);
                                                        } else {
                                                          next.add(questionId);
                                                        }
                                                        return next;
                                                      });
                                                    }}
                                                    className="w-full flex items-center justify-between p-3 hover:bg-[var(--background)]/70 transition-colors text-left"
                                                  >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                      <div className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${
                                                        (item.result.grade || 0) >= 8 ? 'bg-green-500/20 text-green-400' :
                                                        (item.result.grade || 0) >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'
                                                      }`}>
                                                        {(item.result.grade || 0)}/10
                                                      </div>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-[var(--foreground)]/90 truncate">
                                                          {questionPreview}
                                                          {questionPreview.length >= 100 && '...'}
                                                        </div>
                                                      </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                      {subscriptionLevel === "Tester" && editingDate?.sessionId === item.entry.sessionId && editingDate?.type === 'question' && editingDate?.questionId === questionId ? (
                                                        <div className="flex items-center gap-1">
                                                          <input
                                                            type="date"
                                                            value={editingDateValue}
                                                            onChange={(e) => setEditingDateValue(e.target.value)}
                                                            onBlur={() => {
                                                              if (editingDateValue) {
                                                                // Parse date string (YYYY-MM-DD) and create UTC date at midnight
                                        const [year, month, day] = editingDateValue.split('-').map(Number);
                                        const newTimestamp = new Date(Date.UTC(year, month - 1, day)).getTime();
                                                                const slugMatch = pathname?.match(/\/subjects\/([^\/]+)\/surge/);
                                                                if (slugMatch) {
                                                                  const slug = slugMatch[1];
                                                                  try {
                                                                    const stored = localStorage.getItem(`atomicSubjectData:${slug}`);
                                                                    if (stored) {
                                                                      const data = JSON.parse(stored);
                                                                      const surgeLog = data?.surgeLog || [];
                                                                      // Update ALL entries with this sessionId
                                                                      let updated = false;
                                                                      surgeLog.forEach((e: any, idx: number) => {
                                                                        if (e.sessionId === item.entry.sessionId) {
                                                                          surgeLog[idx].timestamp = newTimestamp;
                                                                          updated = true;
                                                                        }
                                                                      });
                                                                      
                                                                      if (updated) {
                                                                        localStorage.setItem(`atomicSubjectData:${slug}`, JSON.stringify(data));
                                                                        // Dispatch event to notify surge page to reload lastSurge
                                                                        window.dispatchEvent(new CustomEvent('surgeLogDateUpdated', { detail: { slug } }));
                                                                        // Force a re-render by incrementing the refresh key
                                                                        setSurgeLogRefreshKey(prev => prev + 1);
                                                                      }
                                                                    }
                                                                  } catch (e) {
                                                                    console.error("Failed to update date:", e);
                                                                  }
                                                                }
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            onKeyDown={(e) => {
                                                              if (e.key === "Enter") {
                                                                e.currentTarget.blur();
                                                              } else if (e.key === "Escape") {
                                                                setEditingDate(null);
                                                                setEditingDateValue("");
                                                              }
                                                            }}
                                                            className="text-xs px-2 py-1 rounded border border-[var(--accent-cyan)]/30 bg-[var(--background)]/80 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-cyan)]"
                                                            autoFocus
                                                          />
                                                        </div>
                                                      ) : (
                                                        <div 
                                                          className={`text-xs text-[var(--foreground)]/50 ${subscriptionLevel === "Tester" ? "cursor-pointer hover:text-[var(--accent-cyan)]/70 transition-colors" : ""}`}
                                                          onClick={() => {
                                                            if (subscriptionLevel === "Tester") {
                                                              const dateValue = new Date(item.entry.timestamp).toISOString().split('T')[0];
                                                              setEditingDate({ sessionId: item.entry.sessionId, type: 'question', questionId });
                                                              setEditingDateValue(dateValue);
                                                            }
                                                          }}
                                                          title={subscriptionLevel === "Tester" ? "Click to edit date" : ""}
                                                        >
                                                          {item.sessionDate}
                                                        </div>
                                                      )}
                                                      <svg
                                                        className={`w-4 h-4 text-[var(--foreground)]/60 transition-transform flex-shrink-0 ${isQuestionExpanded ? 'rotate-180' : ''}`}
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                      >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                      </svg>
                                                    </div>
                                                  </button>
                                                  
                                                  {isQuestionExpanded && (
                                                    <div className="border-t border-[var(--foreground)]/10 p-4 space-y-3">
                                                      {item.result.question && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Question
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.question)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.answer && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Your Answer
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5 italic">
                                                            {item.result.answer}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.correctAnswer && (
                                                        <div>
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Correct Answer
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            {item.result.correctAnswer}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.explanation && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Explanation
                                                          </div>
                                                          <div className="text-sm bg-[var(--background)]/80 p-3 rounded border border-[var(--foreground)]/5">
                                                            <LessonBody body={sanitizeLessonBody(item.result.explanation)} />
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.assessment && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            Assessment
                                                          </div>
                                                          <div className="text-sm text-[var(--foreground)]/80">
                                                            {item.result.assessment}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.whatsGood && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            What's Good
                                                          </div>
                                                          <div className="text-sm text-green-400/80">
                                                            {item.result.whatsGood}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {item.result.whatsBad && (
                                                        <div className="pt-2 border-t border-[var(--foreground)]/10">
                                                          <div className="text-xs font-medium text-[var(--foreground)]/70 uppercase tracking-wide mb-2">
                                                            What Needs Improvement
                                                          </div>
                                                          <div className="text-sm text-red-400/80">
                                                            {item.result.whatsBad}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-8 text-[var(--foreground)]/60">
                    <div className="text-lg mb-2">🧠</div>
                    <div className="font-medium mb-1">No Surge Data Yet</div>
                    <div className="text-sm">
                      Complete a Surge session to see your quiz results and history here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* DevTools Modal */}
      <Modal
        open={devToolsModalOpen}
        onClose={() => setDevToolsModalOpen(false)}
        title="DevTools"
        footer={
          <div className="flex items-center justify-end">
            <button
              onClick={() => setDevToolsModalOpen(false)}
              className="synapse-style inline-flex h-9 items-center rounded-full px-4 text-sm font-medium !text-white"
              style={{ zIndex: 100, position: 'relative' }}
            >
              <span style={{ color: '#ffffff', zIndex: 101, position: 'relative', opacity: 1, textShadow: 'none' }}>Close</span>
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Tools</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('synapse:tutorial-trigger'));
                  setDevToolsModalOpen(false);
                  if (pathname !== '/') {
                    router.push('/');
                  }
                }}
                className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-white/30 hover:bg-white/5 transition-colors"
              >
                Tutorial
              </button>
              <button
                onClick={() => {
                  // Clear the disclaimer seen flag and open the modal
                  try {
                    localStorage.removeItem('synapse:disclaimer-seen');
                  } catch {}
                  setDevToolsModalOpen(false);
                  setDisclaimerModalOpen(true);
                }}
                className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-white/30 hover:bg-white/5 transition-colors"
              >
                Show Disclaimer Modal
              </button>
              <button
                onClick={() => {
                  // Clear onboarding completion and trigger onboarding
                  window.dispatchEvent(new CustomEvent('synapse:onboarding-trigger'));
                  setDevToolsModalOpen(false);
                  // Navigate to homepage if not already there
                  if (pathname !== '/') {
                    router.push('/');
                  }
                }}
                className="inline-flex items-center rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:border-white/30 hover:bg-white/5 transition-colors"
              >
                Show Onboarding
              </button>
            </div>
          </div>

          {subscriptionLevel === "Tester" && (
            <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)]/70 p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Saved data viewer</h3>
                  <p className="text-xs text-[var(--foreground)]/60">
                    Inspect local practice logs, Surge sessions, and all course storage on this device.
                  </p>
                </div>
                <button
                  onClick={loadAllSavedData}
                  disabled={savedDataLoading}
                  className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--foreground)]/10 disabled:opacity-50"
                >
                  {savedDataLoading ? "Loading…" : "Load data"}
                </button>
              </div>

              {savedDataError && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {savedDataError}
                </div>
              )}

              {savedDataLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60">
                  <GlowSpinner size={16} ariaLabel="Loading saved data" idSuffix="saved-data-loading" />
                  Loading saved logs…
                </div>
              )}

              {!savedDataLoading && savedDataDump.length > 0 && (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {savedDataDump.map((entry) => {
                    const practiceCount = entry.data?.practiceLogs?.length ?? 0;
                    const surgeCount = entry.data?.surgeLog?.length ?? 0;
                    const reviewCount = entry.data?.reviewSchedules ? Object.keys(entry.data.reviewSchedules).length : 0;
                    const filesCount = entry.data?.files?.length ?? 0;
                    const subjectName = entry.data?.subject || entry.slug;
                    const preview = entry.raw
                      ? entry.raw.length > 4000
                        ? `${entry.raw.slice(0, 4000)}\n… (truncated)`
                        : entry.raw
                      : "No raw data saved.";
                    return (
                      <div
                        key={entry.slug}
                        className="rounded-xl border border-[var(--foreground)]/15 bg-[var(--background)]/60 p-3 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-[var(--foreground)]">
                              {subjectName}
                            </div>
                            <div className="text-[10px] text-[var(--foreground)]/60 mt-0.5">
                              slug: <span className="font-mono">{entry.slug}</span> • files {filesCount} • practice logs {practiceCount} • surge logs {surgeCount} • review items {reviewCount}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCopySavedData(entry.slug, entry.raw)}
                            className="inline-flex items-center rounded-full border border-[var(--foreground)]/20 px-3 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--foreground)]/10"
                          >
                            {copiedSavedDataSlug === entry.slug ? "Copied!" : "Copy JSON"}
                          </button>
                        </div>
                        <details className="text-xs text-[var(--foreground)]/80 rounded-lg border border-[var(--foreground)]/10">
                          <summary className="cursor-pointer select-none px-3 py-2 text-[var(--foreground)]/70">
                            Preview raw data
                          </summary>
                          <pre className="px-3 py-2 max-h-60 overflow-auto whitespace-pre-wrap text-[10px] text-[var(--foreground)]/80">
                            {preview}
                          </pre>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}

              {!savedDataLoading && savedDataDump.length === 0 && !savedDataError && (
                <div className="text-xs text-[var(--foreground)]/50">
                  Load to inspect localStorage course data.
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Promo Code Management Modal */}
      <PromoCodeModal
        open={promoCodeModalOpen}
        onClose={() => setPromoCodeModalOpen(false)}
      />
      {/* Feedback Modal */}
      <FeedbackModal 
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        subscriptionLevel={subscriptionLevel}
        pathname={pathname || ""}
        onFeedbackSent={() => setShowThankYou(true)}
      />
      {/* Thank You Confirmation Modal */}
      <Modal
        open={showThankYou}
        onClose={() => setShowThankYou(false)}
      >
        <div className="flex flex-col items-center justify-center py-8 px-6 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg 
              className="w-10 h-10 text-green-500" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth="3"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-[var(--foreground)]">Thank you!</h3>
          <p className="text-sm text-[var(--foreground)]/70 text-center">
            Your feedback has been submitted successfully.
          </p>
        </div>
      </Modal>
    </div>
    </>
  );
}