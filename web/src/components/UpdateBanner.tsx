import { useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { useUpdates } from "../lib/queries";

export const UPDATE_DOCS_URL = "https://docs.mailcow.email/maintenance/update/";
const DISMISS_KEY = "mcui-dismissed-update";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/** Shown on the dashboard when GitHub has a newer mailcow release than the server runs. */
export function UpdateBanner() {
  const updates = useUpdates();
  const [dismissed, setDismissed] = useState(readDismissed);
  const u = updates.data;
  if (!u?.updateAvailable || !u.latest || dismissed === u.latest) return null;

  const published = u.publishedAt ? new Date(u.publishedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="update-banner" role="status">
      <ArrowUpCircle size={22} className="update-icon" />
      <div className="update-text">
        <strong>mailcow {u.latest} is available.</strong> You're running {u.current}.{published && ` Released ${published}.`}
        <div className="update-links">
          {u.releaseUrl && (
            <a className="link" href={u.releaseUrl} target="_blank" rel="noreferrer">
              What's new
            </a>
          )}
          <a className="link" href={UPDATE_DOCS_URL} target="_blank" rel="noreferrer">
            How to update
          </a>
        </div>
      </div>
      <button
        className="icon-btn"
        aria-label="Hide until the next release"
        title="Hide until the next release"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, u.latest!);
          } catch {
            /* ignore */
          }
          setDismissed(u.latest);
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
