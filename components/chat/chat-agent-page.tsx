"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dice5 } from "lucide-react";
import { apiSendChatMessage } from "@/lib/client/chat-agent";
import { apiGetExampleQueries } from "@/lib/client/example-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type Message = {
  role: "user" | "assistant";
  text: string;
};

type HistoryPoint = {
  value: number | null;
  timestamp: string;
};

type SensorMeta = {
  deviceName?: string;
  sensorName?: string;
  sensorDescription?: string;
  unit?: string;
};

function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.trim();
  if (!s) return value;
  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

function parsePossiblyStringifiedJson(value: unknown): unknown {
  let cur: unknown = value;
  for (let i = 0; i < 3; i++) {
    const next = tryParseJson(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

function pickValueAndTimestamp(value: unknown): HistoryPoint[] | null {
  const parsed = parsePossiblyStringifiedJson(value);
  const arr = Array.isArray(parsed) ? parsed : null;
  if (!arr) return null;

  return arr
    .map((p: any) => ({
      value: (() => {
        const v = p?.value;
        if (v == null) return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      timestamp: String(p?.timestamp ?? "")
    }))
    .filter((p) => p.timestamp.trim().length > 0);
}

function inferUnitFromDescription(desc?: string): string | undefined {
  if (!desc) return undefined;
  const parts = desc
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : undefined;
}

function getSensorMeta(raw: unknown): SensorMeta | null {
  const parsed = tryParseJson(raw) as any;

  const steps =
    parsed?.intermediateSteps ??
    parsed?.output?.intermediateSteps ??
    parsed?.data?.intermediateSteps ??
    (Array.isArray(parsed) ? parsed : null);

  if (!Array.isArray(steps)) return null;

  const nameSteps = steps.filter((s: any) => s?.action?.tool === "getSensorName");
  if (nameSteps.length === 0) return null;

  const first = nameSteps[0];
  const obs = first?.observation;
  const firstObs = Array.isArray(obs) ? obs[0] : obs;

  const obsParsed = parsePossiblyStringifiedJson(firstObs) as any;
  const firstItem = Array.isArray(obsParsed) ? obsParsed[0] : obsParsed;
  const output = firstItem?.output ?? null;

  if (!output || typeof output !== "object") return null;

  const deviceName = output.device_name ? String(output.device_name) : undefined;
  const sensorName = output.sensor_name ? String(output.sensor_name) : undefined;
  const sensorDescription = output.sensor_description ? String(output.sensor_description) : undefined;
  const unit = inferUnitFromDescription(sensorDescription);

  return { deviceName, sensorName, sensorDescription, unit };
}

function getFirstHistoryObservation(raw: unknown): HistoryPoint[] | null {
  const parsed = tryParseJson(raw) as any;

  const steps =
    parsed?.intermediateSteps ??
    parsed?.output?.intermediateSteps ??
    parsed?.data?.intermediateSteps ??
    (Array.isArray(parsed) ? parsed : null);

  if (!Array.isArray(steps)) return null;

  const historySteps = steps.filter((s: any) => s?.action?.tool === "getHistoryData");
  if (historySteps.length === 0) return null;

  const first = historySteps[0];
  const obs = first?.observation;
  const firstObs = Array.isArray(obs) ? obs[0] : obs;

  const cleaned = pickValueAndTimestamp(firstObs);
  return cleaned;
}

const PT_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function fmtPacificTime(ms: number) {
  const parts = PT_FMT.formatToParts(new Date(ms));
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  return `${month} ${day}, ${hour}:${minute}`;
}

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
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMeta, setHistoryMeta] = useState<SensorMeta | null>(null);
  const [historyHover, setHistoryHover] = useState<{ ts: number; value: number | null } | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Connected to chat agent. Ask about devices, sensors, trends, or latest data."
    }
  ]);

  const exampleQueriesQuery = useQuery({
    queryKey: ["example-queries"],
    queryFn: apiGetExampleQueries,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY
  });
  const exampleQueries = exampleQueriesQuery.data?.queries ?? [];

  const historyChartData = useMemo(() => {
    if (!history) return [];
    return history
      .map((p) => {
        const ts = Date.parse(p.timestamp);
        return Number.isFinite(ts) ? { ts, value: p.value } : null;
      })
      .filter(Boolean) as Array<{ ts: number; value: number | null }>;
  }, [history]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiSendChatMessage({ message, sessionId });
    },
    onSuccess: (data) => {
      const cleaned = getFirstHistoryObservation(data.raw);
      const meta = getSensorMeta(data.raw);
      if (cleaned && cleaned.length > 0) {
        setHistory(cleaned);
        setHistoryMeta(meta);
        setHistoryOpen(true);
        // Debug helper: surface tool output in browser console.
        console.log("getHistoryData observation[0] cleaned:", cleaned);
      }
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

  useEffect(() => {
    // Keep the chat pinned to latest messages / typing indicator.
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sendMutation.isPending]);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-zinc-50">
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
              <span className="font-medium text-zinc-900">🤖 Agent Preview</span>
            </nav>
          </div>
          <div className="text-xs text-zinc-600">
            Session: <span className="font-mono">{sessionId.slice(0, 8)}</span> · {statusText}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-screen-2xl flex-1 min-h-0 flex-col px-2 py-2 sm:px-3 lg:px-4">
        <Card className="flex flex-1 min-h-0 flex-col">
          <CardHeader>
            <CardTitle>Agent</CardTitle>
          </CardHeader>
          <CardContent className="relative flex flex-1 min-h-0 gap-3 overflow-hidden">
            {/* Collapsible history chart panel */}
            {history ? (
              <button
                type="button"
                className="absolute left-2 top-2 z-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50"
                onClick={() => setHistoryOpen((v) => !v)}
                title={historyOpen ? "Hide graph" : "Show graph"}
              >
                {historyOpen ? "<" : ">"}
              </button>
            ) : null}
            <div
              className={cn(
                "relative min-h-0 min-w-0 transition-all",
                history && historyOpen ? "flex-7 opacity-100" : "flex-0 w-0 opacity-0 pointer-events-none"
              )}
            >
              <div
                className={cn(
                  "h-full min-h-0 overflow-hidden rounded-md border border-zinc-200 bg-white"
                )}
              >
                {history ? (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-zinc-200 pl-6 px-3 py-2 text-xs font-semibold text-zinc-900">
                      History Graph
                      {historyMeta?.sensorName ? (
                        <span className="font-normal text-zinc-600">
                          {" "}
                          · {historyMeta.sensorName}
                          {historyMeta.unit ? ` (${historyMeta.unit})` : ""}
                        </span>
                      ) : null}
                      {historyHover ? (
                        <span className="ml-2 font-normal text-zinc-600">
                          · {fmtPacificTime(historyHover.ts)}:{" "}
                          <span className="font-medium text-zinc-900">
                            {historyHover.value ?? "—"}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <div className="flex-1 min-h-0 p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={historyChartData as any}
                          margin={{ top: 10, right: 12, left: 0, bottom: 10 }}
                          onMouseMove={(e: any) => {
                            const payload = e?.activePayload?.[0]?.payload;
                            if (payload && typeof payload.ts === "number") {
                              setHistoryHover({ ts: payload.ts, value: payload.value ?? null });
                            }
                          }}
                          onMouseLeave={() => setHistoryHover(null)}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                          <XAxis
                            dataKey="ts"
                            type="number"
                            domain={["dataMin", "dataMax"]}
                            scale="time"
                            tickCount={5}
                            interval="preserveStartEnd"
                            minTickGap={20}
                            tickFormatter={(v) => fmtPacificTime(Number(v))}
                          />
                          <YAxis
                            width={54}
                            label={
                              historyMeta?.unit
                                ? {
                                    value: historyMeta.unit,
                                    angle: -90,
                                    position: "insideLeft",
                                    offset: 10
                                  }
                                : undefined
                            }
                          />
                          <Tooltip
                            wrapperStyle={{ pointerEvents: "none" }}
                            cursor={{ stroke: "#a1a1aa", strokeDasharray: "3 3" }}
                            labelFormatter={(label) => fmtPacificTime(Number(label))}
                            formatter={(value: any) => [value, historyMeta?.unit ? `Value (${historyMeta.unit})` : "Value"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#18181b"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Chat panel */}
            <div className="flex min-w-0 flex-3 min-h-0 flex-col gap-3">
              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto rounded-md border border-zinc-200 bg-white p-3">
                {messages.map((message, idx) => (
                  <div
                    key={`${message.role}-${idx}`}
                    className={
                      message.role === "user"
                        ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
                        : "mr-auto w-fit max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-900"
                    }
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => (
                            <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
                          ),
                          li: ({ children }) => <li className="mb-1">{children}</li>,
                          code: ({ children }) => (
                            <code className="rounded bg-zinc-200 px-1 py-0.5 text-[0.9em]">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="mb-2 overflow-x-auto rounded bg-zinc-200 p-2 text-[0.9em]">
                              {children}
                            </pre>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-700"
                            >
                              {children}
                            </a>
                          )
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    ) : (
                      message.text
                    )}
                  </div>
                ))}

                {sendMutation.isPending ? (
                  <div className="mr-auto w-fit max-w-[85%] rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-900">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
                    </span>
                  </div>
                ) : null}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Send a prompt to your local agent…"
                  disabled={sendMutation.isPending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={sendMutation.isPending || exampleQueries.length === 0}
                  title={
                    exampleQueries.length > 0
                      ? "Fill a random example query"
                      : "No example queries found (data/mock/example_query/example_queries.txt)"
                  }
                  onClick={() => {
                    if (exampleQueries.length === 0) return;
                    const idx = Math.floor(Math.random() * exampleQueries.length);
                    setDraft(exampleQueries[idx] ?? "");
                  }}
                >
                  <Dice5 className="h-4 w-4" />
                </Button>
                <Button onClick={() => void handleSend()} disabled={!canSend}>
                  {sendMutation.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                      Sending
                    </span>
                  ) : (
                    "Send"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
