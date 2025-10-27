import { useEffect, useState } from 'react';
import { getTodayDraws, getDrawsByDate, getNextDraws } from '@/lib/api/public';
import useDrawStore from '@/store/drawStore';

/**
 * Hook to fetch today's draws
 * @returns {Object} Today's draws and loading state
 */
export function useTodayDraws() {
  const { todayDraws, setTodayDraws } = useDrawStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTodayDraws = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getTodayDraws();
      setTodayDraws(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching today draws:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayDraws();
  }, []);

  return { todayDraws, isLoading, error, refetch: fetchTodayDraws };
}

/**
 * Hook to fetch next upcoming draws
 * @param {number} limit - Number of draws to fetch
 * @returns {Object} Next draws and loading state
 */
export function useNextDraws(limit = 5) {
  const { nextDraw, setNextDraw } = useDrawStore();
  const [nextDraws, setNextDraws] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNextDraws = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getNextDraws(limit);
      setNextDraws(data);
      if (data.length > 0) {
        setNextDraw(data[0]); // Set the first one as next draw
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching next draws:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNextDraws();
    
    // Refresh every minute
    const interval = setInterval(fetchNextDraws, 60000);
    
    return () => clearInterval(interval);
  }, [limit]);

  return { nextDraw, nextDraws, isLoading, error, refetch: fetchNextDraws };
}

/**
 * Hook to fetch draws by date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Object} Draws for the specified date and loading state
 */
export function useDrawsByDate(date) {
  const [draws, setDraws] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDrawsByDate = async (targetDate) => {
    if (!targetDate) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getDrawsByDate(targetDate);
      setDraws(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching draws by date:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrawsByDate(date);
  }, [date]);

  return { draws, isLoading, error, refetch: () => fetchDrawsByDate(date) };
}
