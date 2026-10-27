import type { Metadata } from 'next';
import { DreamTricks } from '@/features/explorer';
import { searchFromRecord } from '../rootTab';

export const metadata: Metadata = {
  title: 'Dream Tricks · Skate Robot',
  description: 'Watch skate tricks at classic street spots and redesigned settings, including Roof to Bank, 25 Stair, and Triangle Bank.',
};

export default async function DreamTricksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <DreamTricks initialSearch={searchFromRecord(await searchParams)} />;
}
