// Server-only: where the chat agent lives, if anywhere.
// Until the agent is migrated (roadmap Phase 4), the only backend is an n8n
// webhook. When none is configured (e.g. the public demo), the Agent page shows
// "Coming soon" and /api/chat-agent answers 503 instead of failing.

export function getChatWebhookUrl(): string | null {
  const url = process.env.N8N_CHAT_WEBHOOK_URL?.trim();
  return url ? url : null;
}

export function isChatAgentConfigured(): boolean {
  return getChatWebhookUrl() !== null;
}
