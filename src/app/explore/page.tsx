import type { Metadata } from 'next';
import { TrickExplorer } from '@/features/explorer';
import { searchFromRecord } from '../rootTab';

export const metadata: Metadata = {
  title: 'Trick Explorer · Skate Robot',
  description: 'Watch any skate trick or grind combo in slow motion, from any angle.',
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TrickExplorer initialSearch={searchFromRecord(await searchParams)} />;
}
