// Shared session storage for QR code feature
// In-memory storage (for MVP)
// In production, use database or Redis

export type QRSession = {
  sessionId: string;
  createdAt: number;
  images: Array<{ id: string; data: string; timestamp: number }>;
  expiresAt: number;
};

const sessions = new Map<string, QRSession>();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

export function getSession(sessionId: string): QRSession | undefined {
  return sessions.get(sessionId);
}

export function createSession(sessionId: string, expiresAt: number): QRSession {
  const session: QRSession = {
    sessionId,
    createdAt: Date.now(),
    images: [],
    expiresAt,
  };
  sessions.set(sessionId, session);
  return session;
}

export function addImagesToSession(
  sessionId: string,
  images: Array<{ id: string; data: string; timestamp: number }>
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.images.push(...images);
  return true;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}





