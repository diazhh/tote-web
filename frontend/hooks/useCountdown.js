import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Hook to create a countdown timer
 * @param {Date|string} targetDate - Target date for countdown
 * @returns {Object} Countdown data
 */
export function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft('');
      setIsExpired(false);
      return;
    }

    const updateCountdown = () => {
      const target = new Date(targetDate);
      const now = new Date();
      
      if (target <= now) {
        setIsExpired(true);
        setTimeLeft('Expirado');
        return;
      }

      const distance = formatDistanceToNow(target, {
        locale: es,
        addSuffix: true
      });
      
      setTimeLeft(distance);
      setIsExpired(false);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return { timeLeft, isExpired };
}

/**
 * Hook to get precise time remaining
 * @param {Date|string} targetDate - Target date
 * @returns {Object} Time components
 */
export function useTimeRemaining(targetDate) {
  const [timeRemaining, setTimeRemaining] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });

  useEffect(() => {
    if (!targetDate) {
      return;
    }

    const updateTime = () => {
      const target = new Date(targetDate);
      const now = new Date();
      const diff = target - now;

      if (diff <= 0) {
        setTimeRemaining({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return timeRemaining;
}
