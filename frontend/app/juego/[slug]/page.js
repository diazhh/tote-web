'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getGameTodayDraws, getGameHistory, getGameStats } from '@/lib/api/public';
import LandingHeader from '@/components/layout/LandingHeader';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import EmptyState from '@/components/common/EmptyState';
import GameHeader from '@/components/games/GameHeader';
import GameTodayResults from '@/components/games/GameTodayResults';
import GameHistory from '@/components/games/GameHistory';
import GameStats from '@/components/games/GameStats';

export default function GameDetailPage() {
  const params = useParams();
  const slug = params.slug;

  const [todayDraws, setTodayDraws] = useState([]);
  const [history, setHistory] = useState({ draws: [], pagination: {} });
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [todayData, historyData, statsData] = await Promise.all([
          getGameTodayDraws(slug),
          getGameHistory(slug, { page: currentPage, limit: 10 }),
          getGameStats(slug, { days: 30 })
        ]);

        setTodayDraws(todayData);
        setHistory(historyData);
        setStats(statsData);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching game data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (slug) {
      fetchData();
    }
  }, [slug, currentPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <LandingHeader />
        <div className="container mx-auto px-4 py-16 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <LandingHeader />
        <div className="container mx-auto px-4 py-16">
          <EmptyState 
            title="Error al cargar el juego"
            description={error}
          />
        </div>
      </div>
    );
  }

  const game = todayDraws[0]?.game || history.draws[0]?.game;

  if (!game) {
    return (
      <div className="min-h-screen">
        <LandingHeader />
        <div className="container mx-auto px-4 py-16">
          <EmptyState 
            title="Juego no encontrado"
            description="No se encontró información para este juego"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <LandingHeader />
      
      <main className="container mx-auto px-4 py-8 space-y-8">
        <GameHeader game={game} />
        
        <GameTodayResults draws={todayDraws} />
        
        {stats && <GameStats stats={stats} game={game} />}
        
        <GameHistory 
          history={history} 
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </main>
    </div>
  );
}
