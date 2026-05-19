'use client';

import dynamic from 'next/dynamic';

const HorrorGame = dynamic(() => import('@/components/HorrorGame'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="bg-black w-full h-screen overflow-hidden">
      <HorrorGame />
    </main>
  );
}
