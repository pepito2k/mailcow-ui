import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "./lib/api";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { DomainsPage } from "./pages/Domains";
import { DomainDetailPage } from "./pages/DomainDetail";
import { MailboxesPage } from "./pages/Mailboxes";
import { AliasesPage } from "./pages/Aliases";
import { QueuePage } from "./pages/Queue";
import { QuarantinePage } from "./pages/Quarantine";
import { LogsPage } from "./pages/Logs";
import { SystemPage } from "./pages/System";
import { AppPasswordsPage } from "./pages/AppPasswords";
import { Fail2banPage } from "./pages/Fail2ban";
import { SpamFilterPage } from "./pages/SpamFilter";
import { SharedMailboxesPage } from "./pages/SharedMailboxes";
import { ResourcePage } from "./components/ResourcePage";
import * as defs from "./resources";

type AuthState = { status: "loading" } | { status: "out" } | { status: "in"; user: string; mailcowUrl: string };

export function App() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const qc = useQueryClient();

  const refresh = () =>
    auth
      .me()
      .then((r) => setState({ status: "in", user: r.user, mailcowUrl: r.mailcowUrl }))
      .catch(() => setState({ status: "out" }));

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      qc.clear();
      setState({ status: "out" });
    };
    window.addEventListener("mcui:unauthorized", onUnauthorized);
    return () => window.removeEventListener("mcui:unauthorized", onUnauthorized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "loading") return <Loading />;
  if (state.status === "out") return <LoginPage onLoggedIn={refresh} />;

  const logout = async () => {
    await auth.logout().catch(() => undefined);
    qc.clear();
    setState({ status: "out" });
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={state.user} mailcowUrl={state.mailcowUrl} onLogout={logout} />}>
          <Route index element={<DashboardPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="domains/:domain" element={<DomainDetailPage mailcowUrl={state.mailcowUrl} />} />
          <Route path="mailboxes" element={<MailboxesPage />} />
          <Route path="aliases" element={<AliasesPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="quarantine" element={<QuarantinePage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="system" element={<SystemPage />} />
          <Route path="alias-domains" element={<ResourcePage key="ad" def={defs.aliasDomains} />} />
          <Route path="resources" element={<ResourcePage key="res" def={defs.resources} />} />
          <Route path="domain-admins" element={<ResourcePage key="da" def={defs.domainAdmins} />} />
          <Route path="sync-jobs" element={<ResourcePage key="sj" def={defs.syncJobs} />} />
          <Route path="transports" element={<ResourcePage key="tr" def={defs.transports} />} />
          <Route path="relay-hosts" element={<ResourcePage key="rh" def={defs.relayHosts} />} />
          <Route path="tls-policies" element={<ResourcePage key="tls" def={defs.tlsPolicies} />} />
          <Route path="bcc-maps" element={<ResourcePage key="bcc" def={defs.bccMaps} />} />
          <Route path="recipient-maps" element={<ResourcePage key="rm" def={defs.recipientMaps} />} />
          <Route path="forwarding-hosts" element={<ResourcePage key="fh" def={defs.forwardingHosts} />} />
          <Route path="app-passwords" element={<AppPasswordsPage />} />
          <Route path="fail2ban" element={<Fail2banPage />} />
          <Route path="spam-filter" element={<SpamFilterPage />} />
          <Route path="shared-mailboxes" element={<SharedMailboxesPage mailcowUrl={state.mailcowUrl} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
