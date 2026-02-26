import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth-provider';
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pikmin Postcard',
  description: 'Collect and map Pikmin Bloom postcards'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
