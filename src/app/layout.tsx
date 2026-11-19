import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SnapQueue — Photobooth Workspace",
  description: "Capture. Queue. Print. Deliver.",
  icons: { icon: "/images/snapqueue-icon.png", apple: "/images/snapqueue-icon-512.png" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}