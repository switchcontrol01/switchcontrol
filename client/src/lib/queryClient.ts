import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getPollingProfile, subscribeToAppMode } from "@/lib/appModeStore";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      // gcTime (how long an inactive query stays cached in RAM) obeys
      // ApplicationMode — Normal keeps the library default (5min), Light
      // evicts inactive query results after 30s to release memory.
      gcTime: getPollingProfile().cacheLifetimeMs,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Apply the new gcTime immediately on mode switch (new default only affects
// queries created afterward otherwise) and proactively evict any query with
// zero active observers so Light Mode's RAM-release intent isn't stuck
// waiting on the old gcTime timer of already-cached queries.
subscribeToAppMode((mode) => {
  const gcTime = getPollingProfile().cacheLifetimeMs;
  queryClient.setDefaultOptions({
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime,
      retry: false,
    },
    mutations: { retry: false },
  });
  if (mode === "light") {
    queryClient.getQueryCache().getAll().forEach((q) => {
      if (q.getObserversCount() === 0) {
        queryClient.getQueryCache().remove(q);
      }
    });
  }
});
