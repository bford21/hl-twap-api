import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Hyperliquid TWAP API',
    description: 'Explore Hyperliquid TWAP data',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

