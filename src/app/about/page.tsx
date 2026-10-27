import type { Metadata } from 'next';
import { AboutSkateRobot } from '@/features/explorer';

export const metadata: Metadata = {
  title: 'About & location notice · Skate Robot',
  description: 'About Skate Robot, its independent skate simulation, and its virtual locations.',
};

export default function AboutPage() {
  return <AboutSkateRobot />;
}
