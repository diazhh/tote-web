'use client';
import { useState, useEffect } from 'react';
import { DollarSign, Gift, Lock, Wallet, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminPlayersApi } from '@/lib/api/admin-players';
import { depositsApi } from '@/lib/api/deposits';
import { withdrawalsApi } from '@/lib/api/withdrawals';
import AdjustmentModal from './AdjustmentModal';
import BonusModal from './BonusModal';

export default function FinancesTab({ player, onRefresh }) {
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loadingDeposits, setLoadingDeposits] = useState(true);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const balance = parseFloat(player.balance || 0);
  const blocked = parseFloat(player.blockedBalance || 0);
  const bonus = parseFloat(player.bonusBalance || 0);
  const available = balance - blocked;

  useEffect(() => {
    loadDeposits();
    loadWithdrawals();
  }, [player.id]);

  const loadDeposits = async () => {
    try {
      setLoadingDeposits(true);
      const res = await adminPlayersApi.getPlayerDeposits(player.id, { limit: 20 });
      setDeposits(res.data.deposits || []);
    } catch { /* ignore */ } finally { setLoadingDeposits(false); }
  };

  const loadWithdrawals = async () => {
    try {
      setLoadingWithdrawals(true);
      const res = await adminPlayersApi.getPlayerWithdrawals(player.id, { limit: 20 });
      setWithdrawals(res.data.withdrawals || []);
    } catch { /* ignore */ } finally { setLoadingWithdrawals(false); }
  };

  const handleAdjustment = async (data) => {
    try {
      setActionLoading(true);
      await adminPlayersApi.adjustBalance(player.id, data);
      toast.success('Ajuste aplicado');
      setShowAdjustment(false);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error');
    } finally { setActionLoading(false); }
  };

  const handleBonus = async (data) => {
    try {
      setActionLoading(true);
      await adminPlayersApi.giveBonus(player.id, data);
      toast.success('Bono aplicado');
      setShowBonus(false);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error');
    } finally { setActionLoading(false); }
  };

  const handleApproveDeposit = async (id) => {
    if (!confirm('¿Aprobar este depósito?')) return;
    try {
      await depositsApi.approveDeposit(id);
      toast.success('Depósito aprobado');
      loadDeposits();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al aprobar');
    }
  };

  const handleRejectDeposit = async (id) => {
    const reason = prompt('Razón del rechazo:');
    if (reason === null) return;
    try {
      await depositsApi.rejectDeposit(id, { reason });
      toast.success('Depósito rechazado');
      loadDeposits();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al rechazar');
    }
  };

  const handleProcessWithdrawal = async (id) => {
    if (!confirm('¿Marcar retiro como en proceso?')) return;
    try {
      await withdrawalsApi.processWithdrawal(id);
      toast.success('Retiro en proceso');
      loadWithdrawals();
    } catch (error) { toast.error(error.response?.data?.error || 'Error'); }
  };

  const handleCompleteWithdrawal = async (id) => {
    const reference = prompt('Referencia de pago:');
    if (reference === null) return;
    try {
      await withdrawalsApi.completeWithdrawal(id, { reference });
      toast.success('Retiro completado');
      loadWithdrawals();
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.error || 'Error'); }
  };

  const handleRejectWithdrawal = async (id) => {
    const reason = prompt('Razón del rechazo:');
    if (reason === null) return;
    try {
      await withdrawalsApi.rejectWithdrawal(id, { reason });
      toast.success('Retiro rechazado');
      loadWithdrawals();
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.error || 'Error'); }
  };

  const fmt = (amount) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(amount);
  const fmtDate = (d) => new Date(d).toLocaleString('es-VE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const statusBadge = (status) => {
    const map = {
      PENDING: { cls: 'bg-yellow-100 text-yellow-800', icon: Clock },
      APPROVED: { cls: 'bg-green-100 text-green-800', icon: CheckCircle },
      REJECTED: { cls: 'bg-red-100 text-red-800', icon: XCircle },
      PROCESSING: { cls: 'bg-blue-100 text-blue-800', icon: Loader2 },
      COMPLETED: { cls: 'bg-green-100 text-green-800', icon: CheckCircle },
    };
    const s = map[status] || map.PENDING;
    const Icon = s.icon;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${s.cls}`}><Icon className="w-3 h-3" />{status}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs uppercase font-medium">Disponible</span></div>
          <p className="text-2xl font-bold text-green-700">{fmt(available)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-orange-700 mb-1"><Lock className="w-4 h-4" /><span className="text-xs uppercase font-medium">Bloqueado</span></div>
          <p className="text-2xl font-bold text-orange-700">{fmt(blocked)}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-700 mb-1"><Gift className="w-4 h-4" /><span className="text-xs uppercase font-medium">Bono</span></div>
          <p className="text-2xl font-bold text-purple-700">{fmt(bonus)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs uppercase font-medium">Balance Total</span></div>
          <p className="text-2xl font-bold text-blue-700">{fmt(balance)}</p>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="flex gap-3">
        <button onClick={() => setShowAdjustment(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Ajuste Manual</button>
        <button onClick={() => setShowBonus(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Dar Bono</button>
      </div>

      {/* Deposits */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Depósitos</h3>
        {loadingDeposits ? (
          <div className="text-center py-4 text-gray-500">Cargando...</div>
        ) : deposits.length === 0 ? (
          <div className="text-center py-4 text-gray-500">Sin depósitos</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Referencia</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {deposits.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{fmtDate(d.createdAt)}</td>
                    <td className="px-4 py-2 text-right font-medium text-green-600">{fmt(d.amount)}</td>
                    <td className="px-4 py-2 text-gray-900">{d.reference || '-'}</td>
                    <td className="px-4 py-2 text-center">{statusBadge(d.status)}</td>
                    <td className="px-4 py-2 text-center">
                      {d.status === 'PENDING' && (
                        <div className="flex justify-center gap-1">
                          <button onClick={() => handleApproveDeposit(d.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">Aprobar</button>
                          <button onClick={() => handleRejectDeposit(d.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Rechazar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Withdrawals */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Retiros</h3>
        {loadingWithdrawals ? (
          <div className="text-center py-4 text-gray-500">Cargando...</div>
        ) : withdrawals.length === 0 ? (
          <div className="text-center py-4 text-gray-500">Sin retiros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cuenta</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {withdrawals.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{fmtDate(w.createdAt)}</td>
                    <td className="px-4 py-2 text-right font-medium text-red-600">{fmt(w.amount)}</td>
                    <td className="px-4 py-2 text-gray-900">{w.pagoMovilAccount?.bank} - {w.pagoMovilAccount?.phone}</td>
                    <td className="px-4 py-2 text-center">{statusBadge(w.status)}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        {w.status === 'PENDING' && (
                          <>
                            <button onClick={() => handleProcessWithdrawal(w.id)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">Procesar</button>
                            <button onClick={() => handleRejectWithdrawal(w.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Rechazar</button>
                          </>
                        )}
                        {w.status === 'PROCESSING' && (
                          <>
                            <button onClick={() => handleCompleteWithdrawal(w.id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">Completar</button>
                            <button onClick={() => handleRejectWithdrawal(w.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Rechazar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdjustment && <AdjustmentModal player={player} onClose={() => setShowAdjustment(false)} onSubmit={handleAdjustment} loading={actionLoading} />}
      {showBonus && <BonusModal player={player} onClose={() => setShowBonus(false)} onSubmit={handleBonus} loading={actionLoading} />}
    </div>
  );
}
