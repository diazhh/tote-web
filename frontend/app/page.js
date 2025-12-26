'use client';

import { useState, useEffect } from 'react';
import { useDrawsByDate, useNextDraws } from '@/hooks/useDraws';
import { useGames } from '@/hooks/useGames';
import { useCountdown } from '@/hooks/useCountdown';
import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';
import { getTodayVenezuela } from '@/lib/dateUtils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorMessage from '@/components/common/ErrorMessage';
import ImageModal from '@/components/common/ImageModal';
import { Calendar, Clock, Trophy, Menu, X, ChevronRight, Play, Users, Shield, Zap, ArrowRight, Star, CheckCircle, TrendingUp } from 'lucide-react';
import { formatTime, formatDate } from '@/lib/utils/format';
import { extractTimeFromCaracasString, extractDateFromCaracasString, getDrawDateTimeForCountdown, formatDrawDate, formatDrawTime } from '@/lib/utils/dateUtils';
import Link from 'next/link';

function NavigationHeader({ onOpenMobileMenu }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white shadow-lg' : 'bg-white/95 backdrop-blur-sm'
    }`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Totalizador
              </h1>
              <p className="text-xs text-gray-500">Loterías en línea</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <a href="#inicio" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition">Inicio</a>
            <a href="#juegos" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition">Juegos</a>
            <a href="#como-jugar" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition">Cómo Jugar</a>
            <a href="#horarios" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition">Horarios</a>
            <a href="#resultados" className="text-sm font-medium text-gray-700 hover:text-blue-600 transition">Resultados</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition">
              Iniciar Sesión
            </Link>
            <Link href="/login" className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition">
              Registrarse
            </Link>
          </div>

          <button onClick={onOpenMobileMenu} className="md:hidden p-2">
            <Menu className="h-6 w-6 text-gray-700" />
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-64 bg-white shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-gray-900">Menú</h2>
          <button onClick={onClose} className="p-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-4 space-y-4">
          <a href="#inicio" onClick={onClose} className="block py-2 text-gray-700 hover:text-blue-600 transition">Inicio</a>
          <a href="#juegos" onClick={onClose} className="block py-2 text-gray-700 hover:text-blue-600 transition">Juegos</a>
          <a href="#como-jugar" onClick={onClose} className="block py-2 text-gray-700 hover:text-blue-600 transition">Cómo Jugar</a>
          <a href="#horarios" onClick={onClose} className="block py-2 text-gray-700 hover:text-blue-600 transition">Horarios</a>
          <a href="#resultados" onClick={onClose} className="block py-2 text-gray-700 hover:text-blue-600 transition">Resultados</a>
          <div className="pt-4 border-t space-y-2">
            <Link href="/login" className="block w-full px-4 py-2 text-center text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
              Iniciar Sesión
            </Link>
            <Link href="/login" className="block w-full px-4 py-2 text-center bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition">
              Registrarse
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}

function HeroSection({ nextDraws, games }) {
  const nextDraw = nextDraws?.[0];
  const drawDateTime = nextDraw ? getDrawDateTimeForCountdown(nextDraw) : null;
  const { timeLeft } = useCountdown(drawDateTime);

  return (
    <section id="inicio" className="relative pt-24 pb-20 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full mb-6">
            <Star className="h-4 w-4 text-yellow-300" />
            <span className="text-sm font-medium">Sistema de Loterías en Línea</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Juega y Gana con las
            <span className="block bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
              Mejores Loterías
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Triple Pantera, Animalitos y más. Resultados en tiempo real, sorteos cada hora, premios garantizados.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/login" className="px-8 py-4 bg-white text-blue-600 font-bold rounded-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2">
              <Play className="h-5 w-5" />
              Jugar Ahora
            </Link>
            <a href="#como-jugar" className="px-8 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white font-bold rounded-lg hover:bg-white/20 transition flex items-center justify-center gap-2">
              Cómo Jugar
              <ChevronRight className="h-5 w-5" />
            </a>
          </div>

          {nextDraw && (
            <div className="inline-block bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <p className="text-sm font-medium text-white/80">Próximo Sorteo</p>
              </div>
              <h3 className="text-2xl font-bold mb-2">{nextDraw.game?.name}</h3>
              <div className="flex items-center justify-center gap-2 text-yellow-300">
                <Clock className="h-5 w-5" />
                <span className="text-xl font-bold">{timeLeft}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50 to-transparent" />
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: Zap,
      title: 'Resultados Instantáneos',
      description: 'Conoce los ganadores en tiempo real apenas se publican los sorteos'
    },
    {
      icon: Shield,
      title: 'Seguro y Confiable',
      description: 'Sistema encriptado y auditable. Tus datos y transacciones están protegidos'
    },
    {
      icon: Users,
      title: 'Soporte 24/7',
      description: 'Estamos disponibles para ayudarte en cualquier momento del día'
    },
    {
      icon: TrendingUp,
      title: 'Premios Garantizados',
      description: 'Pagos rápidos y seguros. Retira tus ganancias cuando quieras'
    }
  ];

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, idx) => (
            <div key={idx} className="text-center p-6 rounded-xl hover:bg-gray-50 transition">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <feature.icon className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GamesSection({ games }) {
  const gameInfo = {
    'triple-pantera': {
      description: 'Juego de 3 cifras del 000 al 999. Elige tu número de la suerte y gana grandes premios.',
      icon: '🎯',
      color: 'from-blue-500 to-blue-700'
    },
    'lotoanimalito': {
      description: 'Juego de animalitos del 00 al 36. Cada número representa un animal diferente.',
      icon: '🦁',
      color: 'from-green-500 to-green-700'
    },
    'lottopantera': {
      description: 'Lotería clásica con números del 0 al 99. Simple, rápido y emocionante.',
      icon: '🎲',
      color: 'from-purple-500 to-purple-700'
    }
  };

  return (
    <section id="juegos" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Nuestros Juegos</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Elige tu juego favorito y comienza a ganar. Sorteos cada hora con premios garantizados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {games.map((game) => {
            const info = gameInfo[game.slug] || { description: game.description, icon: '🎰', color: 'from-gray-500 to-gray-700' };
            return (
              <div key={game.id} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1">
                <div className={`h-32 bg-gradient-to-br ${info.color} flex items-center justify-center text-6xl`}>
                  {info.icon}
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{game.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{info.description}</p>
                  <Link href="/login" className="inline-flex items-center gap-2 text-blue-600 font-medium hover:gap-3 transition-all">
                    Jugar Ahora
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HowToPlaySection() {
  const steps = [
    { title: 'Regístrate', description: 'Crea tu cuenta en menos de 2 minutos. Es gratis y seguro.' },
    { title: 'Recarga Saldo', description: 'Deposita desde Bs. 10 usando Pago Móvil o transferencia bancaria.' },
    { title: 'Elige tu Juego', description: 'Selecciona entre Triple Pantera, Animalitos u otros juegos disponibles.' },
    { title: 'Selecciona Números', description: 'Elige tus números de la suerte y el monto que deseas apostar.' },
    { title: 'Confirma tu Jugada', description: 'Revisa tu ticket y confirma. Recibirás un comprobante digital.' },
    { title: '¡Gana Premios!', description: 'Espera el sorteo y si ganas, el premio se acredita automáticamente.' }
  ];

  return (
    <section id="como-jugar" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">¿Cómo Jugar?</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Jugar es muy fácil. Sigue estos simples pasos y comienza a ganar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {steps.map((step, idx) => (
            <div key={idx} className="relative p-6 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 hover:border-blue-300 transition">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-lg">
                {idx + 1}
              </div>
              <h3 className="font-bold text-gray-900 mb-2 mt-2">{step.title}</h3>
              <p className="text-sm text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link href="/login" className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-lg hover:shadow-xl hover:scale-105 transition-all">
            <Play className="h-5 w-5" />
            Comenzar Ahora
          </Link>
        </div>
      </div>
    </section>
  );
}

function ScheduleSection({ games }) {
  return (
    <section id="horarios" className="py-20 bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Horarios de Sorteos</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Sorteos cada hora, todos los días. No te pierdas ninguna oportunidad de ganar.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {games.map((game) => (
              <div key={game.id} className="border-l-4 border-blue-600 pl-6">
                <h3 className="text-xl font-bold text-gray-900 mb-3">{game.name}</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">Sorteos cada hora</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">Lunes a Domingo</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Activo ahora</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <strong>Nota:</strong> Los horarios pueden variar según el juego. Consulta los próximos sorteos en tiempo real desde tu panel de usuario.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  usePageVisit(PAGE_TYPES.LANDING, '/');
  
  const [selectedDate, setSelectedDate] = useState(getTodayVenezuela());
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { games, isLoading: gamesLoading, error: gamesError } = useGames();
  const { draws: dateDraws, isLoading: drawsLoading, error: drawsError } = useDrawsByDate(selectedDate);
  const { nextDraws } = useNextDraws(10);

  if (gamesLoading || drawsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (gamesError || drawsError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ErrorMessage message={gamesError || drawsError} />
      </div>
    );
  }

  // Group draws by game
  const drawsByGame = (dateDraws || []).reduce((acc, draw) => {
    const gameId = draw.game?.id;
    if (!gameId) return acc;
    if (!acc[gameId]) {
      acc[gameId] = {
        game: draw.game,
        draws: []
      };
    }
    acc[gameId].draws.push(draw);
    return acc;
  }, {});

  // Get next draw per game
  const nextDrawPerGame = {};
  (nextDraws || []).forEach(draw => {
    const gameId = draw.game?.id;
    if (gameId && !nextDrawPerGame[gameId]) {
      nextDrawPerGame[gameId] = draw;
    }
  });

  const filteredDraws = selectedGame 
    ? drawsByGame[selectedGame]?.draws || []
    : dateDraws || [];

  // Debug: Ver qué datos tenemos
  console.log('Filtered draws:', filteredDraws.length);
  console.log('Sample draw:', filteredDraws[0]);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      
      <HeroSection nextDraws={nextDraws} games={games} />
      <FeaturesSection />
      <GamesSection games={games} />
      <HowToPlaySection />
      <ScheduleSection games={games} />

      <section id="resultados" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Resultados Recientes</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Consulta los últimos sorteos y verifica si eres ganador.
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-6 mb-8 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => setSelectedDate(getTodayVenezuela())}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 hover:bg-gray-100 transition border border-gray-300"
                >
                  Hoy
                </button>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button
                  onClick={() => setSelectedGame(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    !selectedGame 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg' 
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                  }`}
                >
                  Todos
                </button>
                {games.map(game => (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGame(game.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      selectedGame === game.id
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    {game.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {filteredDraws.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl shadow-lg p-12 text-center">
                <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No hay sorteos para mostrar en esta fecha</p>
              </div>
            ) : (
            filteredDraws.map((draw) => {
              const isDrawn = draw.status === 'DRAWN' || draw.status === 'PUBLISHED';
              // Mostrar imágenes para todos los juegos que tengan imageUrl
              const hasImages = draw.game?.slug === 'lotoanimalito' || draw.game?.slug === 'lottopantera' || draw.game?.slug === 'triple-pantera';
              const drawImageUrl = draw.imageUrl && hasImages
                ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}${draw.imageUrl}`
                : null;
              
              // Debug URL construction
              if (isDrawn && draw.imageUrl) {
                console.log('Image URL:', {
                  slug: draw.game?.slug,
                  hasImages,
                  imageUrl: draw.imageUrl,
                  finalUrl: drawImageUrl
                });
              }
              
              return (
                <div key={draw.id} className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 overflow-hidden">
                  <div className="p-5 border-b bg-gradient-to-r from-blue-50 to-purple-50">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm text-gray-900">{draw.game?.name}</h3>
                      {isDrawn ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Finalizado
                        </span>
                      ) : draw.status === 'CLOSED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Cerrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Programado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Calendar className="h-3 w-3" />
                      <span>{draw.scheduledAtCaracas ? extractDateFromCaracasString(draw.scheduledAtCaracas) : formatDrawDate(draw)}</span>
                      <Clock className="h-3 w-3 ml-2" />
                      <span className="font-semibold">{draw.scheduledAtCaracas ? extractTimeFromCaracasString(draw.scheduledAtCaracas) : formatDrawTime(draw)}</span>
                    </div>
                  </div>

                  <div className="p-5">
                    {isDrawn && draw.winnerItem ? (
                      <div className="space-y-3">
                        {drawImageUrl && (
                          <div 
                            className="relative w-full rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity" 
                            style={{ maxHeight: '250px' }}
                            onClick={() => {
                              setSelectedDraw(draw);
                              setSelectedImageUrl(drawImageUrl);
                            }}
                            title="Click para ver imagen completa"
                          >
                            <img
                              src={drawImageUrl}
                              alt={`Resultado ${draw.winnerItem.number}`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                            <div className="hidden absolute inset-0 items-center justify-center bg-gray-100">
                              <Trophy className="h-12 w-12 text-gray-300" />
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-center gap-2 bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                          <Trophy className="h-5 w-5 text-yellow-600" />
                          <div className="text-center">
                            <div className="font-bold text-2xl text-gray-900">
                              {draw.winnerItem.number}
                            </div>
                            {draw.winnerItem.name && (
                              <div className="text-sm text-gray-600">
                                {draw.winnerItem.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : draw.preselectedItem ? (
                      <div className="text-center py-8">
                        <div className="text-sm text-gray-500 mb-2">Preseleccionado</div>
                        <div className="font-bold text-3xl text-gray-700">
                          {draw.preselectedItem.number}
                        </div>
                        {draw.preselectedItem.name && (
                          <div className="text-sm text-gray-600 mt-1">
                            {draw.preselectedItem.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <div className="text-sm">Pendiente</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>
      </section>

      <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Trophy className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Totalizador</h3>
                  <p className="text-sm text-gray-400">Loterías en línea</p>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                La plataforma más confiable para jugar loterías en línea. Sorteos cada hora, premios garantizados y pagos instantáneos.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4">Enlaces Rápidos</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#juegos" className="hover:text-white transition">Juegos</a></li>
                <li><a href="#como-jugar" className="hover:text-white transition">Cómo Jugar</a></li>
                <li><a href="#horarios" className="hover:text-white transition">Horarios</a></li>
                <li><a href="#resultados" className="hover:text-white transition">Resultados</a></li>
                <li><Link href="/login" className="hover:text-white transition">Iniciar Sesión</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Soporte</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition">Centro de Ayuda</a></li>
                <li><a href="#" className="hover:text-white transition">Términos y Condiciones</a></li>
                <li><a href="#" className="hover:text-white transition">Política de Privacidad</a></li>
                <li><a href="#" className="hover:text-white transition">Contacto</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-400">
                © {new Date().getFullYear()} Totalizador de Loterías. Todos los derechos reservados.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition">
                  <span className="text-sm">📱</span>
                </a>
                <a href="#" className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition">
                  <span className="text-sm">📧</span>
                </a>
                <a href="#" className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition">
                  <span className="text-sm">💬</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Image Modal */}
      {selectedDraw && selectedImageUrl && (
        <ImageModal
          draw={selectedDraw}
          imageUrl={selectedImageUrl}
          onClose={() => {
            setSelectedDraw(null);
            setSelectedImageUrl(null);
          }}
        />
      )}
    </div>
  );
}
