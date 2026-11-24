import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter, Syne, Tajawal } from "next/font/google";
import { dictionaries, directionOf, isLocale, locales } from "@/lib/i18n/dictionaries";
import "../globals.css";

const syne = Syne({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-syne", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-inter", display: "swap" });
const tajawal = Tajawal({ subsets: ["arabic", "latin"], weight: ["300", "400", "500", "700", "800"], variable: "--font-tajawal", display: "swap" });

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#0B0E14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/** canonical origin: explicit override, else Vercel's production domain, else local dev */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const loc = isLocale(locale) ? locale : "en";
  const t = dictionaries[loc];
  return {
    title: t.meta.title,
    description: t.meta.description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `/${loc}`, languages: { en: "/en", ar: "/ar" } },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      locale: loc === "ar" ? "ar_AR" : "en_US",
      type: "website",
      images: [{ url: "/images/og-parall-01.jpg", width: 1200, height: 630, alt: "PARALL / 01 — immersive smart eyewear concept" }],
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description, images: ["/images/og-parall-01.jpg"] },
    icons: { icon: "/icon.svg" },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={directionOf(locale)} className={`${syne.variable} ${inter.variable} ${tajawal.variable}`} data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
