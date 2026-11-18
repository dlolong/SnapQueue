import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SnapQueue — Photobooth Workspace",
  description: "Capture. Queue. Print. Deliver."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}