export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "mailcow-ui",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 && !url.startsWith("/api/auth/login")) {
    window.dispatchEvent(new Event("mcui:unauthorized"));
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && ("error" in data ? (data as { error: string }).error : (data as { msg?: string }).msg)) ||
      `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status);
  }
  return data as T;
}

// ---- auth ----
export const auth = {
  me: () => request<{ user: string; mailcowUrl: string }>("/api/auth/me"),
  login: (username: string, password: string) =>
    request<{ user: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
};

// ---- mailcow ----
interface MailcowResult {
  type: "success" | "danger" | "error" | "warning" | "info";
  msg?: unknown;
  log?: unknown;
}

/** Turns mailcow's message keys like ["domain_exists","a.com"] into readable text. */
export function describeMsg(msg: unknown): string {
  if (msg == null) return "";
  if (Array.isArray(msg)) {
    const [key, ...rest] = msg.map(String);
    return [humanize(key), rest.filter(Boolean).join(", ")].filter(Boolean).join(": ");
  }
  return humanize(String(msg));
}

function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function mcGet<T>(path: string): Promise<T> {
  const data = await request<unknown>(`/api/mailcow/get/${path}`);
  // mailcow sometimes answers errors with HTTP 200 and {type:"error"}
  const r = data as Partial<MailcowResult> | null;
  if (r && typeof r === "object" && !Array.isArray(r) && r.type === "error") {
    throw new ApiError(describeMsg(r.msg) || "mailcow returned an error", 200);
  }
  return data as T;
}

/** POST to add/edit/delete endpoints. Throws if any result item is not a success. */
export async function mcPost(path: string, body: unknown): Promise<string> {
  const data = await request<MailcowResult[] | MailcowResult>(`/api/mailcow/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const results = Array.isArray(data) ? data : [data];
  const failed = results.filter((r) => r && r.type !== "success" && r.type !== "info");
  if (failed.length) throw new ApiError(failed.map((r) => describeMsg(r.msg)).join("; ") || "mailcow rejected the request", 200);
  return results.map((r) => describeMsg(r?.msg)).filter(Boolean).join("; ") || "Done";
}

/** mailcow returns {} for "nothing" and an object for a single item; normalize to arrays. */
export function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Object.keys(data).length) return [data as T];
  return [];
}

// ---- types (only the fields the UI uses) ----
export interface Domain {
  domain_name: string;
  description: string;
  active: number | string;
  max_num_mboxes_for_domain: number;
  mboxes_in_domain: number;
  max_num_aliases_for_domain: number;
  aliases_in_domain: number;
  def_quota_for_mbox: number;
  max_quota_for_mbox: number;
  max_quota_for_domain: number;
  quota_used_in_domain: string | number;
  bytes_total: string | number;
  msgs_total: string | number;
  backupmx: number | string;
  relay_all_recipients: number | string;
  created?: string;
}

export interface Mailbox {
  username: string;
  local_part: string;
  domain: string;
  name: string;
  quota: number;
  quota_used: number;
  percent_in_use: number | string;
  messages: number;
  active: number | string;
  last_imap_login?: number | string;
  last_smtp_login?: number | string;
  attributes?: Record<string, string>;
  created?: string;
}

export interface Alias {
  id: number;
  address: string;
  goto: string;
  domain: string;
  active: number | string;
  is_catch_all?: number;
  public_comment?: string;
  private_comment?: string;
}

export interface Dkim {
  pubkey?: string;
  length?: string;
  dkim_txt?: string;
  dkim_selector?: string;
}

export interface QueueItem {
  queue_name: string;
  queue_id: string;
  arrival_time: number;
  message_size: number;
  sender: string;
  recipients: ({ address: string; delay_reason?: string } | string)[];
}

export interface QuarantineItem {
  id: number;
  qid: string;
  subject: string;
  sender: string;
  rcpt: string;
  score: number;
  action: string;
  created: number;
  virus_flag: number;
}

export interface ContainerStatus {
  container: string;
  state: string;
  started_at: string;
  image: string;
}

export interface VmailStatus {
  disk: string;
  used: string;
  total: string;
  used_percent: string;
}
