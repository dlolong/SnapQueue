import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SnapQueue — Photo Booth Print Queue",
  description: "Give guests a simple photo flow and your team one clear place to review, prepare, and print every order.",
  icons: { icon: "/images/snapqueue-icon.png", apple: "/images/snapqueue-icon-512.png" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
