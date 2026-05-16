import { create } from "zustand"
import { persist } from "zustand/middleware"
import { translations, type Lang } from "./translations"

interface LangStore {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      lang: "ru" as Lang,
      setLang: (lang: Lang) => set({ lang }),
    }),
    {
      name: "coworkwise-lang",
      // persist only lang — never the translations object itself
      partialize: (state) => ({ lang: state.lang }),
    },
  ),
)

export function useT() {
  const lang = useLangStore((s) => s.lang)
  return translations[lang]
}