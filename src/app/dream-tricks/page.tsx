import type { Metadata } from 'next';
import { DreamTricks } from '@/features/explorer';
import { searchFromRecord } from '../rootTab';

export const metadata: Metadata = {
  title: 'Dream Tricks · Skate Robot',
  description: 'Watch any trick land at El Toro, Hollywood 16, Wallenberg, Sunset Car Wash, Lyon 25, Leap of Faith, and the Miami Triangle.',
};

export default async function DreamTricksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <DreamTricks initialSearch={searchFromRecord(await searchParams)} />;
}
