import { randomBytes } from "crypto";

export type SignalDescription = {
  type: "offer" | "answer";
  sdp: string;
};

type ViewerEntry = {
  id: string;
  offer: SignalDescription;
  answer?: SignalDescription;
  createdAt: number;
};

type ShareSession = {
  id: string;
  createdAt: number;
  lastTouched: number;
  viewers: Map<string, ViewerEntry>;
};

const SESSION_TTL_MS = 1000 * 60 * 60;

const globalStore = globalThis as typeof globalThis & {
  cosolveShareStore?: Map<string, ShareSession>;
};

const store = globalStore.cosolveShareStore ?? new Map<string, ShareSession>();
globalStore.cosolveShareStore = store;

const pruneExpired = () => {
  const now = Date.now();
  for (const [id, session] of store.entries()) {
    if (now - session.lastTouched > SESSION_TTL_MS) {
      store.delete(id);
    }
  }
};

const touch = (session: ShareSession) => {
  session.lastTouched = Date.now();
};

export const createShareSession = () => {
  pruneExpired();
  const id = randomBytes(12).toString("hex");
  const now = Date.now();
  store.set(id, {
    id,
    createdAt: now,
    lastTouched: now,
    viewers: new Map(),
  });
  return id;
};

export const getShareSession = (id: string) => {
  pruneExpired();
  const session = store.get(id) ?? null;
  if (session) {
    touch(session);
  }
  return session;
};

export const deleteShareSession = (id: string) => {
  pruneExpired();
  return store.delete(id);
};

export const addViewerOffer = (sessionId: string, offer: SignalDescription) => {
  const session = getShareSession(sessionId);
  if (!session) return null;
  const viewerId = randomBytes(12).toString("hex");
  session.viewers.set(viewerId, {
    id: viewerId,
    offer,
    createdAt: Date.now(),
  });
  touch(session);
  return viewerId;
};

export const getPendingViewerOffers = (sessionId: string) => {
  const session = getShareSession(sessionId);
  if (!session) return null;
  const offers = Array.from(session.viewers.values())
    .filter((viewer) => !viewer.answer)
    .map((viewer) => ({ viewerId: viewer.id, offer: viewer.offer }));
  touch(session);
  return offers;
};

export const setViewerAnswer = (sessionId: string, viewerId: string, answer: SignalDescription) => {
  const session = getShareSession(sessionId);
  if (!session) return false;
  const viewer = session.viewers.get(viewerId);
  if (!viewer) return false;
  viewer.answer = answer;
  touch(session);
  return true;
};

export const getViewerAnswer = (sessionId: string, viewerId: string) => {
  const session = getShareSession(sessionId);
  if (!session) return undefined;
  const viewer = session.viewers.get(viewerId);
  if (!viewer) return undefined;
  touch(session);
  return viewer.answer ?? null;
};

export const isValidSignalDescription = (value: unknown): value is SignalDescription => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; sdp?: unknown };
  return (candidate.type === "offer" || candidate.type === "answer") && typeof candidate.sdp === "string";
};
