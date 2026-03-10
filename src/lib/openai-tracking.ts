import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { recordModelUsage } from "@/lib/usage-tracking";

type UsageSnapshot = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function extractCachedTokens(usage: any): number {
  return toNumber(
    usage?.input_tokens_details?.cached_tokens ??
      usage?.prompt_tokens_details?.cached_tokens ??
      usage?.cached_input_tokens
  );
}

function usageFromChat(model: string, usage: any): UsageSnapshot {
  return {
    model,
    inputTokens: toNumber(usage?.prompt_tokens ?? usage?.input_tokens),
    outputTokens: toNumber(usage?.completion_tokens ?? usage?.output_tokens),
    cachedInputTokens: extractCachedTokens(usage),
  };
}

function usageFromResponse(model: string, usage: any): UsageSnapshot {
  return {
    model,
    inputTokens: toNumber(usage?.input_tokens ?? usage?.prompt_tokens),
    outputTokens: toNumber(usage?.output_tokens ?? usage?.completion_tokens),
    cachedInputTokens: extractCachedTokens(usage),
  };
}

function trackLater(userId: string | null | undefined, snapshot: UsageSnapshot | null) {
  if (!userId || !snapshot) return;
  const hasUsage =
    snapshot.inputTokens > 0 || snapshot.outputTokens > 0 || snapshot.cachedInputTokens > 0;
  if (!hasUsage) return;
  void recordModelUsage({
    userId,
    model: snapshot.model,
    inputTokens: snapshot.inputTokens,
    outputTokens: snapshot.outputTokens,
    cachedInputTokens: snapshot.cachedInputTokens,
  });
}

function withStreamUsage<T>(
  iterable: AsyncIterable<T>,
  resolveUsage: (event: T) => UsageSnapshot | null,
  userId: string | null | undefined
): AsyncIterable<T> {
  let recorded = false;
  return {
    [Symbol.asyncIterator]() {
      const iterator = iterable[Symbol.asyncIterator]();
      return {
        async next() {
          const result = await iterator.next();
          if (!result.done && !recorded) {
            const snapshot = resolveUsage(result.value);
            if (snapshot) {
              recorded = true;
              trackLater(userId, snapshot);
            }
          }
          return result;
        },
        async return(value?: unknown) {
          if (typeof iterator.return === "function") {
            return iterator.return(value as T);
          }
          return { done: true, value: value as T };
        },
        async throw(error?: unknown) {
          if (typeof iterator.throw === "function") {
            return iterator.throw(error);
          }
          throw error;
        },
      };
    },
  };
}

function maybeAddChatStreamUsage(body: any) {
  if (!body || body.stream !== true) return body;
  return {
    ...body,
    stream_options: {
      ...(body.stream_options || {}),
      include_usage: true,
    },
  };
}

export function createTrackedOpenAI({
  apiKey,
  userId,
}: {
  apiKey: string;
  userId?: string | null;
}) {
  const client = new OpenAI({ apiKey });
  const chatCreate = client.chat.completions.create.bind(client.chat.completions);
  const responsesCreate = client.responses.create.bind(client.responses);

  client.chat.completions.create = (async (...args: any[]) => {
    const request = maybeAddChatStreamUsage(args[0]);
    const response = await chatCreate(request, args[1]);
    const model = String(request?.model || "unknown");

    if (request?.stream) {
      return withStreamUsage(
        response as unknown as AsyncIterable<any>,
        (event) => {
          if (!event?.usage) return null;
          return usageFromChat(String(event?.model || model), event.usage);
        },
        userId
      ) as any;
    }

    trackLater(userId, usageFromChat(String((response as any)?.model || model), (response as any)?.usage));
    return response;
  }) as typeof client.chat.completions.create;

  client.responses.create = (async (...args: any[]) => {
    const request = args[0];
    const response = await responsesCreate(request, args[1]);
    const model = String(request?.model || "unknown");

    if (request?.stream) {
      return withStreamUsage(
        response as unknown as AsyncIterable<any>,
        (event) => {
          const usage = event?.response?.usage || event?.usage;
          if (!usage) return null;
          return usageFromResponse(String(event?.response?.model || model), usage);
        },
        userId
      ) as any;
    }

    trackLater(
      userId,
      usageFromResponse(String((response as any)?.model || model), (response as any)?.usage)
    );
    return response;
  }) as typeof client.responses.create;

  return client;
}

export async function getTrackedOpenAIClient({
  apiKey,
  userId,
}: {
  apiKey?: string;
  userId?: string | null;
} = {}) {
  const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || "";
  const resolvedUserId =
    userId !== undefined ? userId : (await getCurrentUser())?.id ?? null;

  return createTrackedOpenAI({
    apiKey: resolvedApiKey,
    userId: resolvedUserId,
  });
}
