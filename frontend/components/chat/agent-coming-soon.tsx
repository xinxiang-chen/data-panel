"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGetExampleQueries } from "@/lib/client/example-queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AgentComingSoon() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Demo Hall Dashboard";
  const examples = useQuery({
    queryKey: ["example-queries"],
    queryFn: apiGetExampleQueries,
    staleTime: Number.POSITIVE_INFINITY
  });
  const queries = examples.data?.queries ?? [];

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
              <span className="font-medium text-zinc-900">🤖 Agent Preview</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Card>
          <CardHeader>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Coming soon</div>
            <CardTitle>Ask the building in plain English</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-zinc-700">
            <p>
              A chat agent that answers questions about Demo Hall&apos;s sensors. It will look up devices, pull
              raw readings and roll-ups through the same API as the dashboard, and explain what the data shows.
            </p>

            {queries.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-900">Questions it will handle</div>
                <ul className="space-y-1.5">
                  {queries.map((q) => (
                    <li key={q} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-zinc-600">
              In the meantime, explore the data on the{" "}
              <Link className="font-medium text-zinc-900 underline underline-offset-2" href="/">
                Dashboard
              </Link>{" "}
              or the{" "}
              <Link className="font-medium text-zinc-900 underline underline-offset-2" href="/latest-data">
                Latest Data
              </Link>{" "}
              table.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
