'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import gamesAPI from '@/lib/api/games';
import drawsAPI from '@/lib/api/draws';
import ticketsAPI from '@/lib/api/tickets';
import playerApi from '@/lib/api/player';
import { toast } from 'sonner';
import { ArrowLeft, Wallet, ShoppingCart } from 'lucide-react';
import GameSelector from '@/components/player/GameSelector';
import DrawSelector from '@/components/player/DrawSelector';
import AmountSelector from '@/components/player/AmountSelector';
import NumberPad from '@/components/player/NumberPad';
import SelectedItems from '@/components/player/SelectedItems';
import TicketModal from '@/components/player/TicketModal';

export default function JugarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [games, setGames] = useState([]);
  const [allDraws, setAllDraws] = useState([]);
  const [balance, setBalance] = useState(null);
  
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [showDrawModal, setShowDrawModal] = useState(false);
  const [amount, setAmount] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [selections, setSelections] = useState([]);
  
  const [ticketResult, setTicketResult] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    loadInitialData();
  }, [router]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [gamesRes, drawsRes, balanceRes] = await Promise.all([
        gamesAPI.getAll(),
        drawsAPI.today(),
        playerApi.getBalance()
      ]);

      if (gamesRes.success && gamesRes.data.length > 0) {
        setGames(gamesRes.data);
        setSelectedGame(gamesRes.data[0]);
      }

      if (drawsRes.success) {
        const activeDraws = drawsRes.data.filter(d => d.status === 'SCHEDULED');
        const drawsWithItems = await Promise.all(
          activeDraws.map(async (draw) => {
            const game = gamesRes.data.find(g => g.id === draw.gameId);
            const itemsRes = await gamesAPI.getItems(draw.gameId);
            
            const scheduledTime = new Date(draw.scheduledAt);
            const closeMinutes = game?.config?.closeMinutesBefore || 5;
            const closeTime = new Date(scheduledTime.getTime() - closeMinutes * 60000);
            
            // Extract items array from API response
            // API returns: {success: true, data: {items: [...], total: X}}
            let items = [];
            if (itemsRes?.success && itemsRes?.data?.items) {
              items = Array.isArray(itemsRes.data.items) ? itemsRes.data.items : [];
            }
            
            return {
              ...draw,
              game,
              items: items,
              drawTime: draw.scheduledAt,
              closeTime: closeTime.toISOString()
            };
          })
        );
        setAllDraws(drawsWithItems);
      }

      if (balanceRes.success) {
        setBalance(balanceRes.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setSelectedDraw(null);
    setInputValue('');
  };

  const getGameDraws = () => {
    if (!selectedGame) return [];
    return allDraws.filter(d => d.gameId === selectedGame.id);
  };

  const handleNumberInput = (digit) => {
    const maxLength = selectedGame?.type === 'TRIPLE' ? 3 : 2;
    if (inputValue.length < maxLength) {
      setInputValue(prev => prev + digit);
    }
  };

  const handleDelete = () => {
    setInputValue(prev => prev.slice(0, -1));
  };

  const handleEnter = () => {
    if (!selectedDraw) {
      toast.error('Selecciona un sorteo primero');
      return;
    }

    if (inputValue.length === 0) {
      toast.error('Ingresa un número');
      return;
    }

    const padLength = selectedGame?.type === 'TRIPLE' ? 3 : 2;
    const number = inputValue.padStart(padLength, '0');
    
    // Buscar el draw completo con items en allDraws
    const fullDraw = allDraws.find(d => d.id === selectedDraw.id);
    
    if (!fullDraw || !fullDraw.items || !Array.isArray(fullDraw.items) || fullDraw.items.length === 0) {
      toast.error('Error al cargar números del sorteo');
      return;
    }
    
    const item = fullDraw.items.find(i => i.number === number);
    
    if (!item) {
      toast.error('Número no disponible');
      setInputValue('');
      return;
    }

    const existing = selections.find(
      s => s.drawId === selectedDraw.id && s.itemId === item.id
    );

    if (existing) {
      toast.info('Este número ya está seleccionado');
      setInputValue('');
      return;
    }

    setSelections([...selections, {
      drawId: selectedDraw.id,
      drawTime: selectedDraw.drawTime || selectedDraw.scheduledAt,
      gameName: selectedDraw.game?.name,
      gameMultiplier: selectedDraw.game?.multiplier || 1,
      itemId: item.id,
      itemNumber: item.number,
      amount: amount
    }]);

    toast.success(`${number} agregado`);
    setInputValue('');
  };

  const removeSelection = (drawId, itemId) => {
    setSelections(selections.filter(s => 
      !(s.drawId === drawId && s.itemId === itemId)
    ));
  };

  const getTotalAmount = () => {
    return selections.reduce((sum, s) => sum + s.amount, 0);
  };

  const groupSelectionsByDraw = () => {
    const grouped = {};
    selections.forEach(s => {
      if (!grouped[s.drawId]) {
        grouped[s.drawId] = {
          drawTime: s.drawTime,
          gameName: s.gameName,
          items: []
        };
      }
      grouped[s.drawId].items.push(s);
    });
    return grouped;
  };

  const handleSubmit = async () => {
    if (selections.length === 0) {
      toast.error('Agrega al menos un número');
      return;
    }

    const total = getTotalAmount();
    if (total > balance.availableBalance) {
      toast.error('Saldo insuficiente');
      return;
    }

    const groupedByDraw = groupSelectionsByDraw();
    const drawIds = Object.keys(groupedByDraw);

    try {
      setSubmitting(true);
      const tickets = [];

      for (const drawId of drawIds) {
        const draw = allDraws.find(d => d.id === drawId);
        
        if (!draw || draw.status !== 'SCHEDULED') {
          toast.error(`El sorteo de ${groupedByDraw[drawId].gameName} ya cerró`);
          continue;
        }

        const closeTime = new Date(draw.closeTime);
        if (closeTime <= new Date()) {
          toast.error(`El sorteo de ${groupedByDraw[drawId].gameName} ya cerró`);
          continue;
        }

        const response = await ticketsAPI.create({
          drawId: drawId,
          details: groupedByDraw[drawId].items.map(item => ({
            gameItemId: item.itemId,
            amount: item.amount
          }))
        });

        if (response.success) {
          tickets.push({
            ...response.data,
            gameName: groupedByDraw[drawId].gameName,
            drawTime: groupedByDraw[drawId].drawTime
          });
        }
      }

      if (tickets.length > 0) {
        setTicketResult(tickets);
        setShowTicketModal(true);
        setSelections([]);
        
        const balanceRes = await playerApi.getBalance();
        if (balanceRes.success) {
          setBalance(balanceRes.data);
        }
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error(error.response?.data?.error || 'Error al crear ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  const canAddNumber = selectedGame && selectedDraw;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Jugar</h1>
            </div>
            {balance && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
                <Wallet className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-blue-600">
                  Bs. {balance.availableBalance.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* 1. Game Selector */}
        <GameSelector
          games={games}
          selectedGame={selectedGame}
          onSelectGame={handleGameSelect}
        />

        {/* 2. Draw Selector */}
        {selectedGame && (
          <DrawSelector
            draws={getGameDraws()}
            selectedDraw={selectedDraw}
            onSelectDraw={setSelectedDraw}
            isOpen={showDrawModal}
            onToggle={() => setShowDrawModal(!showDrawModal)}
          />
        )}

        {/* 3. Amount Selector */}
        {selectedDraw && (
          <AmountSelector
            amount={amount}
            onChangeAmount={setAmount}
          />
        )}

        {/* 4. Number Pad */}
        {selectedDraw && (
          <>
            <NumberPad
              inputValue={inputValue}
              onInput={handleNumberInput}
              onDelete={handleDelete}
              onEnter={handleEnter}
              disabled={!canAddNumber}
              maxDigits={selectedGame?.type === 'TRIPLE' ? 3 : 2}
            />

            {/* 5. Selected Items - Debajo del pad */}
            {selections.length > 0 && (
              <SelectedItems
                selections={selections}
                onRemove={removeSelection}
              />
            )}
          </>
        )}
      </main>

      {/* Checkout Bar */}
      {selections.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-600">Total</p>
              <p className="text-xl font-bold text-gray-900">Bs. {getTotalAmount().toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Saldo después</p>
              <p className="text-sm font-semibold text-gray-700">
                Bs. {(balance?.availableBalance - getTotalAmount()).toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Procesando...
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                Comprar ({selections.length} números)
              </>
            )}
          </button>
        </div>
      )}

      {/* Ticket Modal */}
      {showTicketModal && ticketResult && (
        <TicketModal
          tickets={ticketResult}
          onClose={() => setShowTicketModal(false)}
          onGoToDashboard={() => {
            setShowTicketModal(false);
            router.push('/dashboard');
          }}
        />
      )}
    </div>
  );
}
