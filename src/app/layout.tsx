import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'HL TWAP API',
  description: 'TWAP data API with Supabase and S3 integration',
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

