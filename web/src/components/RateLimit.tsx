import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mcGet } from "../lib/api";
import { useMailcowMutation } from "../lib/queries";
import { Button, TextInput } from "./ui";

const FRAMES = [
  { value: "s", label: "per second" },
  { value: "m", label: "per minute" },
  { value: "h", label: "per hour" },
  { value: "d", label: "per day" },
];

/** Outgoing message rate limit for a domain or a mailbox. Saves on its own. */
export function RateLimitSection({ kind, id }: { kind: "domain" | "mbox"; id: string }) {
  const key = ["rl", kind, id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => mcGet<{ value?: string | number; frame?: string } | unknown[]>(`rl-${kind}/${encodeURIComponent(id)}`),
  });
  const [value, setValue] = useState("");
  const [frame, setFrame] = useState("h");

  const [loaded, setLoaded] = useState(false);

  // Fill the inputs once when the current limit arrives; don't overwrite what the user typed on later refetches.
  useEffect(() => {
    if (loaded || q.data === undefined) return;
    const d = !Array.isArray(q.data) ? q.data : {};
    setValue(d.value ? String(d.value) : "");
    setFrame(d.frame || "h");
    setLoaded(true);
  }, [q.data, loaded]);

  const save = useMailcowMutation(
    () => ({ path: `edit/rl-${kind}`, body: { items: [id], attr: { rl_value: value || "", rl_frame: frame } } }),
    { invalidate: [key], success: value ? `Rate limit set to ${value} ${FRAMES.find((f) => f.value === frame)?.label}` : "Rate limit removed" },
  );

  return (
    <div className="field">
      <span className="field-label">Sending rate limit</span>
      <div className="inline-row">
        <TextInput type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder={loaded ? "No limit" : "Loading…"} disabled={!loaded} style={{ maxWidth: 140 }} aria-label="Messages" />
        <span className="muted">messages</span>
        <select className="input select-sm" value={frame} onChange={(e) => setFrame(e.target.value)} aria-label="Time frame">
          {FRAMES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={() => save.mutate(undefined)} loading={save.isPending || q.isLoading}>
          Save limit
        </Button>
      </div>
      <span className="field-hint">Leave empty for no limit. This is saved separately from the rest of the form.</span>
    </div>
  );
}
