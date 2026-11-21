import { NextResponse } from "next/server";

type N8nSendMessageRequest = {
  action: "sendMessage";
  sessionId: string;
  chatInput: string;
};

function resolveWebhookUrl() {
  const url = process.env.N8N_CHAT_WEBHOOK_URL;
  return url && url.trim().length ? url.trim() : null;
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred =
      obj.output ??
      obj.text ??
      obj.message ??
      obj.answer ??
      obj.response ??
      obj.reply ??
      obj.data;
    if (preferred !== undefined) return toText(preferred);
    return JSON.stringify(obj);
  }
  return "";
}

export async function POST(req: Request) {
  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_CHAT_WEBHOOK_URL is not configured in .env.local" },
      { status: 500 }
    );
  }

  let input: { message?: string; sessionId?: string };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (input.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const payload: N8nSendMessageRequest = {
    action: "sendMessage",
    sessionId: input.sessionId && input.sessionId.trim() ? input.sessionId.trim() : "dashboard-session",
    chatInput: message
  };

  try {
    const controller = new AbortController();
    const timeoutMs = 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeout);

    const rawText = await upstream.text();
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : "";
    } catch {
      // Keep plain-text responses as-is.
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `n8n request failed (${upstream.status})`,
          upstreamBody: parsed
        },
        { status: 502 }
      );
    }

    const reply = toText(parsed);
    return NextResponse.json({
      reply: reply || "Agent replied with an empty response.",
      raw: parsed
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "n8n request timed out (30s)" },
        { status: 504 }
      );
    }
    const messageText = error instanceof Error ? error.message : "Failed to connect to n8n webhook";
    return NextResponse.json({ error: messageText }, { status: 502 });
  }
}
