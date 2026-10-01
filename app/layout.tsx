import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "SplitFlow — Group payments on Arc",
  description: "Smart USDC group settlements on Arc.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
