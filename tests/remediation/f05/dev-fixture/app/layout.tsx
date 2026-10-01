import type { ReactNode } from 'react';
import { ThemeProvider } from '../components/theme-provider';
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body style={{ margin: 24 }}><ThemeProvider>{children}</ThemeProvider></body></html>;
}
