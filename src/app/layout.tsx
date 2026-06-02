import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/contexts/auth-context';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

export const metadata: Metadata = {
  title: {
    default: 'AI创意工坊 - AI多媒体创作平台',
    template: '%s | AI创意工坊',
  },
  description: 'AI生图、AI视频、AI音乐、AI数字人，一站式AI多媒体创作平台，让创意触手可及。',
  keywords: ['AI创作', 'AI生图', 'AI视频', 'AI音乐', '数字人', 'AI创意工坊'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>
          <AuthProvider>
            <div className="relative flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
