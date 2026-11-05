import {
  Cinzel,
  Cormorant_Garamond,
  Great_Vibes,
  Lato,
  Libre_Baskerville,
  Merriweather,
  Montserrat,
  Open_Sans,
  Playfair_Display,
} from "next/font/google";

// Certificate fonts are self-hosted at build time (no runtime requests to Google) and not preloaded, so
// pages that never show a certificate do not download them. The renderer uses regular and bold only.
// next/font needs each options object written out literally (no shared object or spread).
const cinzel = Cinzel({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-cinzel" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-playfair-display" });
const cormorantGaramond = Cormorant_Garamond({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-cormorant-garamond" });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-libre-baskerville" });
const merriweather = Merriweather({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-merriweather" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-montserrat" });
const lato = Lato({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-lato" });
const openSans = Open_Sans({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--cert-font-open-sans" });
const greatVibes = Great_Vibes({ subsets: ["latin"], display: "swap", preload: false, weight: "400", variable: "--cert-font-great-vibes" });

const fonts = {
  cinzel,
  "playfair-display": playfairDisplay,
  "cormorant-garamond": cormorantGaramond,
  "libre-baskerville": libreBaskerville,
  merriweather,
  montserrat,
  lato,
  "open-sans": openSans,
  "great-vibes": greatVibes,
} as const;

/** Class names that define every certificate font variable. Applied only on the certificate page element. */
export const certificateFontClasses = Object.values(fonts).map((font) => font.variable).join(" ");

const FALLBACK_FAMILY = "Georgia, 'Times New Roman', serif";

/**
 * The CSS font-family for a backend font id; an unknown id falls back to a serif font. The variable is only
 * defined inside an element carrying certificateFontClasses, i.e. inside the certificate renderer.
 */
export function certificateFontFamily(fontId: string) {
  return fontId in fonts ? `var(--cert-font-${fontId}), ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
}

/** The loadable family name (without fallbacks), for document.fonts.load before a PDF capture. */
export function certificateFontLoadFamily(fontId: string) {
  return fonts[fontId as keyof typeof fonts]?.style.fontFamily ?? null;
}
