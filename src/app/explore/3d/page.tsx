import { redirect } from 'next/navigation';
import { searchFromRecord } from '../../rootTab';

/** The 3D preview became the Trick Explorer itself; old links land there with their trick and camera. */
export default async function Explore3DPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams(searchFromRecord(await searchParams));
  params.delete('view');
  const search = params.toString();
  redirect(`/explore${search ? `?${search}` : ''}`);
}
