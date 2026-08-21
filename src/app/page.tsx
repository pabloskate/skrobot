import AppShell from './AppShell';
import { searchFromRecord } from './rootTab';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <AppShell initialSearch={searchFromRecord(params)} />;
}
