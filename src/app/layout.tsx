import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Hyperliquid TWAP Explorer',
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

