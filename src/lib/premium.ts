import { getCurrentUser } from "./auth";

export function hasPremiumAccess(subscriptionLevel: string | null | undefined): boolean {
  return (
    subscriptionLevel === "Tester" ||
    subscriptionLevel === "Paid" ||
    subscriptionLevel === "mylittlepwettybebe"
  );
}

export async function requirePremiumAccess(): Promise<{ ok: boolean; error?: string; user?: any }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized. Please log in to use AI features." };
  }
  if (!hasPremiumAccess(user.subscriptionLevel)) {
    return { ok: false, error: "This feature requires Premium access." };
  }
  return { ok: true, user };
}

