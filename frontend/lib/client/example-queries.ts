import { fetchJson } from "@/lib/client/api-client";

export type ExampleQueriesResponse = {
  queries: string[];
  error?: string;
};

export async function apiGetExampleQueries() {
  return await fetchJson<ExampleQueriesResponse>("/api/example-queries");
}

