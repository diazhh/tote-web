'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import playerApi from '@/lib/api/player';
import BalanceCard from '@/components/player/BalanceCard';
import StatisticsCard from '@/components/player/StatisticsCard';
import RecentTickets from '@/components/player/RecentTickets';
import { toast } from 'sonner';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    
    const userObj = JSON.parse(userData);
    if (userObj.role === 'ADMIN' || userObj.role === 'OPERATOR') {
      router.push('/admin');
      return;
    }
    
    setUser(userObj);
    loadDashboardData();
  }, [router]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [balanceData, statsData] = await Promise.all([
        playerApi.getBalance(),
        playerApi.getStatistics()
      ]);

      if (balanceData.success) {
        setBalance(balanceData.data);
      }

      if (statsData.success) {
        setStatistics(statsData.data);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-600">Bienvenido, {user?.username}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/jugar')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Jugar
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Balance Section */}
        <div className="mb-8">
          <BalanceCard balance={balance} onRefresh={loadDashboardData} />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => router.push('/jugar')}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center justify-center gap-3"
          >
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-3xl font-bold">JUGAR</span>
          </button>
          <button
            onClick={() => router.push('/balance-historico')}
            className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center justify-center gap-3"
          >
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-3xl font-bold">BALANCE / HISTÓRICO</span>
          </button>
        </div>

        {/* Recent Tickets Section */}
        <div>
          <RecentTickets 
            tickets={statistics?.recentTickets || []} 
            onRefresh={loadDashboardData}
          />
        </div>
      </main>
    </div>
  );
}
