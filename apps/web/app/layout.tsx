import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Naught',
  description: 'Everything decays. Naught shows you where.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Dark is not a preference here. The interface is meant to be left open on a
  // second screen, and a bright one asks to be closed.
  return (
    <html lang="en" className="bp6-dark">
      <body>{children}</body>
    </html>
  );
}
