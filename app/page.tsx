'use client';

import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';

const HorrorGame = dynamic(() => import('@/components/HorrorGame'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="bg-black w-full h-screen overflow-hidden">
      <ErrorBoundary>
        <HorrorGame />
      </ErrorBoundary>
    </main>
  );
}

