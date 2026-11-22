import { fetchJson } from "@/lib/client/api-client";

export type ChatAgentResponse = {
  reply: string;
  raw?: unknown;
};

export async function apiSendChatMessage(input: { message: string; sessionId: string }) {
  return await fetchJson<ChatAgentResponse>("/api/chat-agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
