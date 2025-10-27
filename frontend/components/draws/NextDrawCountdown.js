'use client';

import { Clock, Trophy } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';
import { formatTime } from '@/lib/utils/format';

/**
 * Next draw countdown component
 * @param {Object} props
 * @param {Object} props.draw - Draw object
 */
export default function NextDrawCountdown({ draw }) {
  const { timeLeft, isExpired } = useCountdown(draw?.scheduledAt);

  if (!draw) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-8 text-white shadow-2xl">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative z-10">
        <div className="text-center mb-6">
          <p className="text-sm font-medium opacity-90 mb-2 uppercase tracking-wide">
            Próximo Sorteo
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-2">
            {draw.game.name}
          </h2>
          <div className="flex items-center justify-center gap-2 text-lg opacity-90">
            <Clock className="h-5 w-5" />
            <span>{formatTime(draw.scheduledAt)}</span>
          </div>
        </div>

        {!isExpired && (
          <div className="text-center mb-6">
            <div className="inline-block bg-white/20 backdrop-blur-sm rounded-xl px-8 py-4">
              <p className="text-6xl md:text-7xl font-bold tracking-tight">
                {timeLeft}
              </p>
            </div>
          </div>
        )}

        {draw.preselectedItem && (
          <div className="mt-6 pt-6 border-t border-white/30">
            <div className="text-center">
              <p className="text-sm font-medium opacity-90 mb-3 uppercase tracking-wide">
                Número Preseleccionado
              </p>
              <div className="flex items-center justify-center gap-4">
                <Trophy className="h-8 w-8" />
                <div className="text-left">
                  <p className="text-4xl font-bold">
                    {draw.preselectedItem.number}
                  </p>
                  <p className="text-lg opacity-90">
                    {draw.preselectedItem.name}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isExpired && (
          <div className="text-center">
            <p className="text-xl font-semibold">
              ¡El sorteo está en curso!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
