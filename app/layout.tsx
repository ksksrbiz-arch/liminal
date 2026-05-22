import type {Metadata} from 'next';
import { Space_Grotesk, Playfair_Display, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono =JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'Liminal: The Web Horror',
  description: 'A psychological 3D horror experience running in the browser.',
  openGraph: {
    title: 'Liminal: The Web Horror',
    description: 'A psychological 3D horror experience running in the browser.',
    images: [{
      url: '/backdrop-reference.jpg',
      width: 1200,
      height: 630,
      alt: 'Liminal Start Screen',
    }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Liminal: The Web Horror',
    description: 'A psychological 3D horror experience running in the browser.',
    images: ['/backdrop-reference.jpg'],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html suppressHydrationWarning lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
      <body suppressHydrationWarning className="font-sans text-white bg-black">{children}</body>
    </html>
  );
}
