import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Data Panel',
  description: 'IoT Data Searching and Visualization',
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
