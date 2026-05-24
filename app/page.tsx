import HorrorGame from "../components/HorrorGame";

export default function Home() {
  return (
    <main className="min-h-screen bg-black overflow-hidden relative selection:bg-red-950 selection:text-red-200">
      <HorrorGame />
    </main>
  );
}
