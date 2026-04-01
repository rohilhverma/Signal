import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'


/*
Root Layout File. Everything loaded in this file loads into branches. Contains 
title, website language settings, and fonts. All other react children load in here, 
all under SignalApp. 
*/


const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Signal — Your news, distilled.',
  description: 'A news aggregation and summarization dashboard. Read smarter with AI-powered digests.',
  generator: 'v0.app',
}

export const viewport = {
  themeColor: '#0f0f14',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {children} 
        <Analytics />
      </body>
    </html>
  )
}
