import { NavLink, Outlet } from "react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  Globe,
  Inbox,
  Forward,
  Send,
  ShieldAlert,
  ScrollText,
  Server,
  LogOut,
  Menu,
  Moon,
  Sun,
  Monitor,
  Globe2,
  CalendarDays,
  UserCog,
  KeyRound,
  RefreshCcw,
  Route as RouteIcon,
  Server as ServerIcon,
  Lock,
  Copy,
  Replace,
  ArrowRightLeft,
  Ban,
  ShieldCheck,
} from "lucide-react";
import { useQueue, useQuarantine } from "../lib/queries";
import { useTheme } from "../lib/theme";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/domains", label: "Domains", icon: Globe },
  { to: "/mailboxes", label: "Mailboxes", icon: Inbox },
  { to: "/aliases", label: "Aliases", icon: Forward },
  { to: "/alias-domains", label: "Alias domains", icon: Globe2 },
  { to: "/resources", label: "Resources", icon: CalendarDays },
  { section: "Mail flow" },
  { to: "/queue", label: "Queue", icon: Send, count: "queue" },
  { to: "/quarantine", label: "Quarantine", icon: ShieldAlert, count: "quarantine" },
  { to: "/spam-filter", label: "Spam filter", icon: ShieldCheck },
  { to: "/sync-jobs", label: "Sync jobs", icon: RefreshCcw },
  { section: "Routing" },
  { to: "/transports", label: "Transports", icon: RouteIcon },
  { to: "/relay-hosts", label: "Relay hosts", icon: ServerIcon },
  { to: "/tls-policies", label: "TLS policies", icon: Lock },
  { to: "/bcc-maps", label: "BCC maps", icon: Copy },
  { to: "/recipient-maps", label: "Recipient maps", icon: Replace },
  { to: "/forwarding-hosts", label: "Forwarding hosts", icon: ArrowRightLeft },
  { section: "Access" },
  { to: "/domain-admins", label: "Domain admins", icon: UserCog },
  { to: "/app-passwords", label: "App passwords", icon: KeyRound },
  { to: "/fail2ban", label: "Fail2ban", icon: Ban },
  { section: "System" },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/system", label: "Status", icon: Server },
] as const;

export function Layout({ user, mailcowUrl, onLogout }: { user: string; mailcowUrl: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const queue = useQueue();
  const quarantine = useQuarantine();
  const counts: Record<string, number | undefined> = { queue: queue.data?.length, quarantine: quarantine.data?.length };
  const { theme, cycle } = useTheme();
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const host = mailcowUrl.replace(/^https?:\/\//, "");

  return (
    <div className={`shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Inbox size={18} />
          </span>
          <div>
            <div className="brand-name">Mail Admin</div>
            <div className="brand-host" title={mailcowUrl}>
              {host}
            </div>
          </div>
        </div>
        <nav onClick={() => setOpen(false)}>
          {nav.map((item, i) =>
            "section" in item ? (
              <div key={i} className="nav-section">
                {item.section}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={"end" in item} className="nav-link">
                <item.icon size={18} />
                <span>{item.label}</span>
                {"count" in item && !!counts[item.count] && <span className="nav-count">{counts[item.count]}</span>}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-link" onClick={cycle} title={`Theme: ${theme}`}>
            <ThemeIcon size={18} />
            <span>Theme: {theme}</span>
          </button>
          <button className="nav-link" onClick={onLogout}>
            <LogOut size={18} />
            <span>Sign out {user}</span>
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <div className="topbar">
          <button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="brand-name">Mail Admin</span>
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
