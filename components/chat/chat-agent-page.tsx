"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiSendChatMessage } from "@/lib/client/chat-agent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Message = {
  role: "user" | "assistant";
  text: string;
};

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

export function ChatAgentPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Data Panel";
  const [sessionId] = useState(() => createSessionId());
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Connected to chat agent. Ask about devices, sensors, trends, or latest data."
    }
  ]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiSendChatMessage({ message, sessionId });
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to send message to chat agent";
      setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${message}` }]);
    }
  });

  const canSend = draft.trim().length > 0 && !sendMutation.isPending;

  const statusText = useMemo(() => {
    if (sendMutation.isPending) return "Sending…";
    if (sendMutation.isError) return "Last request failed";
    return "Ready";
  }, [sendMutation.isError, sendMutation.isPending]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sendMutation.isPending) return;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    await sendMutation.mutateAsync(text);
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-2 py-2 sm:px-3 lg:px-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-zinc-900" />
            <div className="text-sm font-semibold">{appName}</div>
            <nav className="ml-3 flex items-center gap-3 text-xs text-zinc-600">
              <Link className="hover:text-zinc-900" href="/">
                Dashboard
              </Link>
              <span className="text-zinc-300">/</span>
              <Link className="hover:text-zinc-900" href="/latest-data">
                Latest Data
              </Link>
              <span className="text-zinc-300">/</span>
              <span className="font-medium text-zinc-900">Chat Agent</span>
            </nav>
          </div>
          <div className="text-xs text-zinc-600">
            Session: <span className="font-mono">{sessionId.slice(0, 8)}</span> · {statusText}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-2 py-2 sm:px-3 lg:px-4">
        <Card className="flex min-h-[70vh] flex-1 flex-col">
          <CardHeader>
            <CardTitle>n8n Chat Agent</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex-1 space-y-3 overflow-y-auto rounded-md border border-zinc-200 bg-white p-3">
              {messages.map((message, idx) => (
                <div
                  key={`${message.role}-${idx}`}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[85%] rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
                      : "mr-auto max-w-[85%] rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-900"
                  }
                >
                  {message.text}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Send a prompt to your local n8n chat workflow…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button onClick={() => void handleSend()} disabled={!canSend}>
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
