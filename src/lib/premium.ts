import { getCurrentUser } from "./auth";
import { prisma } from "./db";

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
  
  // Check if subscription has expired
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { subscriptionEnd: true },
  });
  
  if (dbUser?.subscriptionEnd && dbUser.subscriptionEnd < new Date()) {
    return { ok: false, error: "Your subscription has expired. Please renew to continue using premium features." };
  }
  
  return { ok: true, user };
}

