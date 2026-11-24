"use client";

import { createContext, useContext } from "react";
import { dictionaries, type Dictionary, type Locale } from "./dictionaries";

interface LocaleValue {
  locale: Locale;
  t: Dictionary;
  dir: "ltr" | "rtl";
  toggleLocale: () => void;
}

export const LocaleContext = createContext<LocaleValue>({
  locale: "en",
  t: dictionaries.en,
  dir: "ltr",
  toggleLocale: () => undefined,
});

export const useLocale = () => useContext(LocaleContext);
