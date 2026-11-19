import { useAliases } from "../lib/queries";
import { Card, PageHeader } from "../components/ui";
import { AliasesView } from "../components/AliasesView";

export function AliasesPage() {
  const aliases = useAliases();
  return (
    <>
      <PageHeader title="Aliases" subtitle={aliases.data ? `${aliases.data.length} aliases` : undefined} />
      <Card pad={false}>
        <AliasesView />
      </Card>
    </>
  );
}
