import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  asArray,
  mcGet,
  mcPost,
  type Alias,
  type ContainerStatus,
  type Dkim,
  type Domain,
  type Mailbox,
  type QuarantineItem,
  type QueueItem,
  type VmailStatus,
} from "./api";
import { useToast } from "../components/Toast";

export const useDomains = () =>
  useQuery({ queryKey: ["domains"], queryFn: async () => asArray<Domain>(await mcGet("domain/all")) });

export const useMailboxes = () =>
  useQuery({ queryKey: ["mailboxes"], queryFn: async () => asArray<Mailbox>(await mcGet("mailbox/all")) });

export const useAliases = () =>
  useQuery({ queryKey: ["aliases"], queryFn: async () => asArray<Alias>(await mcGet("alias/all")) });

export const useDkim = (domain: string) =>
  useQuery({
    queryKey: ["dkim", domain],
    queryFn: async () => {
      const d = await mcGet<Dkim>(`dkim/${encodeURIComponent(domain)}`);
      return d && d.pubkey ? d : null;
    },
  });

export const useQueue = () =>
  useQuery({ queryKey: ["mailq"], queryFn: async () => asArray<QueueItem>(await mcGet("mailq/all")), refetchInterval: 30_000 });

export const useQuarantine = () =>
  useQuery({ queryKey: ["quarantine"], queryFn: async () => asArray<QuarantineItem>(await mcGet("quarantine/all")) });

export const useContainers = () =>
  useQuery({
    queryKey: ["containers"],
    queryFn: async () => {
      const data = await mcGet<Record<string, ContainerStatus>>("status/containers");
      return Object.entries(data ?? {})
        .filter(([, v]) => v && typeof v === "object")
        .map(([key, v]) => ({ ...v, container: v.container || key.replace(/-mailcow$/, "") }))
        .sort((a, b) => a.container.localeCompare(b.container));
    },
    refetchInterval: 60_000,
  });

export const useVersion = () =>
  useQuery({ queryKey: ["version"], queryFn: () => mcGet<{ version: string }>("status/version"), staleTime: 10 * 60_000 });

export const useVmail = () => useQuery({ queryKey: ["vmail"], queryFn: () => mcGet<VmailStatus>("status/vmail") });

export const useLogs = (type: string, count: number) =>
  useQuery({
    queryKey: ["logs", type, count],
    queryFn: async () => asArray<Record<string, unknown>>(await mcGet(`logs/${type}/${count}`)),
  });

/**
 * A mutation that POSTs to mailcow, shows a toast, and refreshes the given query keys.
 */
export function useMailcowMutation<V>(
  build: (vars: V) => { path: string; body: unknown },
  opts: { invalidate: string[][]; success?: string | ((vars: V) => string) },
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (vars: V) => {
      const { path, body } = build(vars);
      return mcPost(path, body);
    },
    onSuccess: (msg, vars) => {
      const text = typeof opts.success === "function" ? opts.success(vars) : opts.success;
      toast.success(text ?? msg);
      for (const key of opts.invalidate) qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });
}

export interface UpdateInfo {
  enabled: boolean;
  current: string | null;
  latest: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  updateAvailable: boolean;
  error: string | null;
}

/** Newer mailcow release check (server caches GitHub for 6 hours). */
export const useUpdates = () =>
  useQuery({
    queryKey: ["updates"],
    queryFn: async () => {
      const r = await fetch("/api/updates", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`Update check failed (${r.status})`);
      return (await r.json()) as UpdateInfo;
    },
    staleTime: 60 * 60_000,
    retry: false,
  });
