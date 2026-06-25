import { Open_Sans, Roboto } from "next/font/google";
import "./globals.css";

const display = Open_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
});

const body = Roboto({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "700"],
});

export const metadata = {
  title: "News Pulse",
  description: "Live news timeline visualization.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      {/* Shifted to a clean light background with dark gray text */}
      <body className="bg-background text-text-primary font-body antialiased">
        {children}
      </body>
    </html>
  );
}