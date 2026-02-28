import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Multiloterias - Loterias en Linea | Triple Pantera, Animalitos y Mas",
  description: "Juega loterias en linea de forma segura. Triple Pantera, Animalitos y mas juegos. Sorteos cada hora, premios garantizados, resultados en tiempo real.",
  icons: {
    icon: '/images/multiloterias-logo.png',
    apple: '/images/multiloterias-logo.png',
  },
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
