import { useEffect, useState } from 'react';
import { getGames } from '@/lib/api/public';
import useGameStore from '@/store/gameStore';

/**
 * Hook to fetch and manage games
 * @returns {Object} Games data and loading state
 */
export function useGames() {
  const { games, setGames } = useGameStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchGames = async () => {
      if (games.length > 0) return; // Already loaded
      
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await getGames();
        setGames(data);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching games:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGames();
  }, [games.length, setGames]);

  return { games, isLoading, error };
}
