import type { Metadata } from 'next';
import { Baloo_2, Nunito } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pikmin Postcard',
  description: 'Collect and map Pikmin Bloom postcards'
};

const headingFont = Baloo_2({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-heading'
});

const bodyFont = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body'
});

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
