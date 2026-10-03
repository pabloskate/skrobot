import type { Metadata } from 'next';
import { TrickExplorer3D } from '@/features/explorer3d';
import { searchFromRecord } from '../../rootTab';

export const metadata: Metadata = {
  title: 'Trick Explorer 3D · Skate Robot',
  description: 'Preview: the Trick Explorer drawn in 3D with three.js.',
};

export default async function Explore3DPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TrickExplorer3D initialSearch={searchFromRecord(await searchParams)} />;
}
