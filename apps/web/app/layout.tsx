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
  return (
    <html lang="en" className="bp6-dark">
      <body>{children}</body>
    </html>
  );
}
