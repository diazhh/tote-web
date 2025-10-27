import { BarChart3, TrendingUp, Award } from 'lucide-react';

/**
 * Game statistics component
 * @param {Object} props
 * @param {Object} props.stats - Statistics data
 * @param {Object} props.game - Game object
 */
export default function GameStats({ stats, game }) {
  if (!stats) return null;

  const { totalDraws, mostFrequent, leastFrequent } = stats;

  return (
    <div className="bg-white rounded-xl shadow-md p-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        Estadísticas (Últimos 30 días)
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Draws */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-8 w-8 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Total Sorteos</h3>
          </div>
          <p className="text-4xl font-bold text-blue-600">{totalDraws}</p>
        </div>

        {/* Most Frequent */}
        {mostFrequent && mostFrequent.length > 0 && (
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <Award className="h-8 w-8 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Más Frecuentes</h3>
            </div>
            <div className="space-y-2">
              {mostFrequent.slice(0, 3).map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="font-bold text-2xl text-gray-900">{item.number}</span>
                  <span className="text-sm text-gray-600">{item.count} veces</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Least Frequent */}
        {leastFrequent && leastFrequent.length > 0 && (
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-3">
              <Award className="h-8 w-8 text-orange-600" />
              <h3 className="text-lg font-semibold text-gray-900">Menos Frecuentes</h3>
            </div>
            <div className="space-y-2">
              {leastFrequent.slice(0, 3).map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="font-bold text-2xl text-gray-900">{item.number}</span>
                  <span className="text-sm text-gray-600">{item.count} veces</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
