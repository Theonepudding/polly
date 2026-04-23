import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'https://polly.pudding.vip'),
  title: { default: 'Polly — Discord Poll Bot', template: '%s · Polly' },
  description: 'Create, share, and track polls across your Discord servers.',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
    other: { rel: 'manifest', url: '/site.webmanifest' },
  },
  openGraph: {
    type: 'website',
    title: 'Polly — Discord Poll Bot',
    description: 'Create, share, and track polls across your Discord servers.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Polly — Discord Poll Bot' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Polly — Discord Poll Bot',
    description: 'Create, share, and track polls across your Discord servers.',
    images: ['/opengraph-image'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
