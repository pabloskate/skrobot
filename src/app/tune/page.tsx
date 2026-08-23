import type { Metadata } from 'next';
import { TuneScreen } from '@/features/robots';

export const metadata: Metadata = {
  title: 'Tune robots · S.K.A.T.E.',
  robots: { index: false },
};

export default function TunePage() {
  return <TuneScreen />;
}
