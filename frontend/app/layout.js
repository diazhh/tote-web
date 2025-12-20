import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Totalizador - Loterías en Línea | Triple Pantera, Animalitos y Más",
  description: "Juega loterías en línea de forma segura. Triple Pantera, Animalitos y más juegos. Sorteos cada hora, premios garantizados, resultados en tiempo real.",
  keywords: "lotería, triple pantera, animalitos, juegos en línea, sorteos, premios",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className={`${inter.variable} antialiased`}>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
