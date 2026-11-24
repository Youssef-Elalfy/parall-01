import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/dictionaries";
import Experience from "@/components/Experience";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <Experience initialLocale={locale} />;
}
