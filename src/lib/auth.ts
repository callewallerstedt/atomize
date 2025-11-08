import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE_NAME = "atom_auth";
const SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";
const encoder = new TextEncoder();

export type AuthUser = { id: string; username: string };

export async function createSession(userId: string) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days
  await prisma.session.create({ data: { userId, token, expiresAt } });

  const jwt = await new SignJWT({ token })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(encoder.encode(SECRET));
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME)?.value;
    if (!cookie) return;
    const { payload } = await jwtVerify(cookie, encoder.encode(SECRET));
    const token = String((payload as any).token || "");
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
  } catch {}
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME)?.value;
    if (!cookie) return null;
    const { payload } = await jwtVerify(cookie, encoder.encode(SECRET));
    const token = String((payload as any).token || "");
    if (!token) return null;
    const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) return null;
    return { id: session.user.id, username: session.user.username };
  } catch {
    return null;
  }
}


