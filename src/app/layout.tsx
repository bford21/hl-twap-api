import type { Metadata } from 'next'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
    title: 'Hyperliquid TWAP Explorer',
    description: 'Explore Hyperliquid TWAP data',
    viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ 
        margin: 0, 
        padding: 0, 
        minHeight: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
        <Footer />
      </body>
    </html>
  )
}

