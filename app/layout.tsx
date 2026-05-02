import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GuessmyGPA | Honest Student Grade Calculator",
  description: "A polished grade calculator for importing course data, editing assignments, and calculating current, projected, and final-exam outcomes with transparent math."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
