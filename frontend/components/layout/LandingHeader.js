import Link from 'next/link';
import { Trophy } from 'lucide-react';

export default function LandingHeader() {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Totalizador
              </h1>
              <p className="text-xs text-gray-500">Resultados en tiempo real</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/" 
              className="text-gray-700 hover:text-primary transition-colors"
            >
              Inicio
            </Link>
            <Link 
              href="/resultados" 
              className="text-gray-700 hover:text-primary transition-colors"
            >
              Resultados
            </Link>
            <Link 
              href="/admin" 
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Administración
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
