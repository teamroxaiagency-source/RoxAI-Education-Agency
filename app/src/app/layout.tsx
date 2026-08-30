import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admissions — RoxAI Inquiry-to-Enrollment",
  description: "Inquiry-to-enrollment automation for RoxAI school clients.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
