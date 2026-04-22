'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { todayInCaracas } from '@/lib/utils/dateUtils';
import conciliacionApi from '@/lib/api/conciliacion';
import ConciliacionFilters from '@/components/admin/conciliacion/ConciliacionFilters';
import ConciliacionTable from '@/components/admin/conciliacion/ConciliacionTable';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export default function ConciliacionPage() {
  const [filters, setFilters] = useState({
    dateFrom: todayInCaracas(),
    dateTo:   todayInCaracas(),
    gameIds:  [],
  });
  const [games, setGames]   = useState([]);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);

  // Load games for the filter
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    fetch(`${API_URL}/games`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(res => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setGames(list.filter(g => g.isActive));
      })
      .catch(() => toast.error('Error cargando juegos'));
  }, []);

  const fetchReport = async () => {
    if (!filters.dateFrom || !filters.dateTo) {
      toast.error('Selecciona un rango de fechas');
      return;
    }
    setLoading(true);
    try {
      const result = await conciliacionApi.getReport({
        dateFrom: filters.dateFrom,
        dateTo:   filters.dateTo,
        gameIds:  filters.gameIds,
      });
      if (result?.success) {
        setData(result.data);
        if (result.data.length === 0) toast.info('Sin datos para el período seleccionado');
      } else {
        toast.error('Error en la respuesta del servidor');
      }
    } catch {
      toast.error('Error cargando conciliación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Conciliación</h1>
        <p className="text-sm text-gray-500">Venta, premios y utilidad por juego y proveedor</p>
      </div>

      <ConciliacionFilters
        filters={filters}
        games={games}
        onChange={setFilters}
        onSearch={fetchReport}
        loading={loading}
      />

      {data !== null && <ConciliacionTable data={data} />}
    </div>
  );
}
