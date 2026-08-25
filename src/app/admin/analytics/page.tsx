import type { Metadata } from 'next';
import { AnalyticsDashboard } from '@/features/analytics';

export const metadata: Metadata = {
  title: 'Analytics · Skate Robot',
  robots: { index: false, follow: false },
};

export default function AnalyticsPage() {
  return <AnalyticsDashboard />;
}
