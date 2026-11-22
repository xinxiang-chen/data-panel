import { connection } from "next/server";
import { AgentComingSoon } from "@/components/chat/agent-coming-soon";
import { ChatAgentPage } from "@/components/chat/chat-agent-page";
import { isChatAgentConfigured } from "@/lib/server/agent-config";

export default async function Page() {
  // Render per request so the env check reflects the running server's config,
  // not whatever was set at build time.
  await connection();
  return isChatAgentConfigured() ? <ChatAgentPage /> : <AgentComingSoon />;
}
