import { useMailboxes } from "../lib/queries";
import { bytes } from "../lib/format";
import { Card, PageHeader } from "../components/ui";
import { MailboxesView } from "../components/MailboxesView";

export function MailboxesPage() {
  const mailboxes = useMailboxes();
  const used = (mailboxes.data ?? []).reduce((s, m) => s + Number(m.quota_used || 0), 0);
  return (
    <>
      <PageHeader title="Mailboxes" subtitle={mailboxes.data ? `${mailboxes.data.length} mailboxes · ${bytes(used)} stored` : undefined} />
      <Card pad={false}>
        <MailboxesView />
      </Card>
    </>
  );
}
