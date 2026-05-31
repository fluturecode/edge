import type { Metadata } from "next";
import "./globals.css";
import { EnokiProvider } from "@/lib/providers/enoki-provider";

export const metadata: Metadata = {
  title: "Edge",
  description: "Programmable trust for autonomous onchain systems",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <EnokiProvider>
          {children}
        </EnokiProvider>
      </body>
    </html>
  );
}