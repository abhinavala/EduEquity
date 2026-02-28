import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Tutor — Your Personal STEM Tutor",
  description: "Socratic AI tutoring grounded in your professor's material",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
