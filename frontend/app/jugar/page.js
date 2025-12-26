'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gamesAPI from '@/lib/api/games';
import drawsAPI from '@/lib/api/draws';
import ticketsAPI from '@/lib/api/tickets';
import playerApi from '@/lib/api/player';
import { toast } from 'sonner';
import { ArrowLeft, Wallet, ShoppingCart, Keyboard, Trophy } from 'lucide-react';
import GameSelector from '@/components/player/GameSelector';
import DrawSelector from '@/components/player/DrawSelector';
import AmountSelector from '@/components/player/AmountSelector';
import NumberPad from '@/components/player/NumberPad';
import SelectedItems from '@/components/player/SelectedItems';
import TicketModal from '@/components/player/TicketModal';
import TripletaBetModal from '@/components/player/TripletaBetModal';

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
  const [showTripletaModal, setShowTripletaModal] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    loadInitialData();
  }, [router]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!selectedDraw || showTicketModal) return;
      
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumberInput(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleEnter();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedDraw, inputValue, selectedGame, showTicketModal]);

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
            
            // Extract items array from API response
            // API returns: {success: true, data: {items: [...], total: X}}
            let items = [];
            if (itemsRes?.success && itemsRes?.data?.items) {
              items = Array.isArray(itemsRes.data.items) ? itemsRes.data.items : [];
            }
            
            // drawTime ya viene en hora Venezuela (ej: "08:00" o "08:00:00")
            // No necesitamos calcular closeTime ya que se verifica en DrawSelector
            return {
              ...draw,
              game,
              items: items,
              // Mantener drawTime como viene del backend (hora Venezuela)
              drawTime: draw.drawTime
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
      drawTime: selectedDraw.drawTime,
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

        // Verificar cierre usando hora Venezuela (5 minutos antes del sorteo)
        const now = new Date();
        const venezuelaTime = now.toLocaleTimeString('es-VE', {
          timeZone: 'America/Caracas',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        const drawTime = draw.drawTime;
        if (drawTime) {
          const [hours, mins] = drawTime.split(':').map(Number);
          const totalMinutes = hours * 60 + mins - 5; // 5 minutos antes
          const closeHour = Math.floor(totalMinutes / 60);
          const closeMin = totalMinutes % 60;
          const closeTimeStr = `${closeHour.toString().padStart(2, '0')}:${closeMin.toString().padStart(2, '0')}:00`;
          
          if (venezuelaTime >= closeTimeStr) {
            toast.error(`El sorteo de ${groupedByDraw[drawId].gameName} ya cerró`);
            continue;
          }
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
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-0">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 lg:px-6 py-3 lg:py-4 max-w-7xl mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Jugar</h1>
              {selectedDraw && (
                <div className="hidden lg:flex items-center gap-2 ml-4 px-3 py-1.5 bg-green-50 rounded-lg">
                  <Keyboard className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-green-700 font-medium">Usa tu teclado</span>
                </div>
              )}
            </div>
            {balance && (
              <div className="flex items-center gap-2 px-3 lg:px-4 py-1.5 lg:py-2 bg-blue-50 rounded-lg">
                <Wallet className="w-4 h-4 lg:w-5 lg:h-5 text-blue-600" />
                <span className="text-sm lg:text-base font-bold text-blue-600">
                  Bs. {balance.availableBalance.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Layout (< lg) */}
      <main className="lg:hidden px-4 py-4 space-y-4">
        {/* 1. Game Selector */}
        <GameSelector
          games={games}
          selectedGame={selectedGame}
          onSelectGame={handleGameSelect}
        />

        {/* Tripleta Button */}
        {selectedGame && selectedGame.config?.tripleta?.enabled && (
          <button
            onClick={() => setShowTripletaModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg font-semibold hover:from-yellow-600 hover:to-yellow-700 transition shadow-md"
          >
            <Trophy className="w-5 h-5" />
            Jugar Tripleta
          </button>
        )}

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

      {/* Desktop Layout (>= lg) */}
      <main className="hidden lg:block px-6 py-6 max-w-[1600px] mx-auto">
        <div className="space-y-6">
          {/* Top Section - Game & Controls in One Card */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="grid grid-cols-12 gap-6">
              {/* Game Selection */}
              <div className="col-span-3">
                <h2 className="text-base font-bold text-gray-900 mb-3">Juego</h2>
                <GameSelector
                  games={games}
                  selectedGame={selectedGame}
                  onSelectGame={handleGameSelect}
                />
                {/* Tripleta Button */}
                {selectedGame && selectedGame.config?.tripleta?.enabled && (
                  <button
                    onClick={() => setShowTripletaModal(true)}
                    className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg font-semibold hover:from-yellow-600 hover:to-yellow-700 transition shadow-md"
                  >
                    <Trophy className="w-5 h-5" />
                    Jugar Tripleta
                  </button>
                )}
              </div>

              {/* Draw Selection */}
              {selectedGame && (
                <div className="col-span-4">
                  <h2 className="text-base font-bold text-gray-900 mb-3">Sorteo</h2>
                  <DrawSelector
                    draws={getGameDraws()}
                    selectedDraw={selectedDraw}
                    onSelectDraw={setSelectedDraw}
                    isOpen={showDrawModal}
                    onToggle={() => setShowDrawModal(!showDrawModal)}
                  />
                </div>
              )}

              {/* Amount Selection */}
              {selectedDraw && (
                <div className="col-span-5">
                  <AmountSelector
                    amount={amount}
                    onChangeAmount={setAmount}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bottom Section - Number Pad & Selected Items */}
          {selectedDraw && (
            <div className="grid grid-cols-12 gap-6">
              {/* Number Pad */}
              <div className="col-span-5">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="text-base font-bold text-gray-900 mb-4">Ingresa el Número</h2>
                  <NumberPad
                    inputValue={inputValue}
                    onInput={handleNumberInput}
                    onDelete={handleDelete}
                    onEnter={handleEnter}
                    disabled={!canAddNumber}
                    maxDigits={selectedGame?.type === 'TRIPLE' ? 3 : 2}
                  />
                </div>
              </div>

              {/* Selected Items & Checkout */}
              <div className="col-span-7">
                {selections.length > 0 ? (
                  <div className="space-y-4">
                    <SelectedItems
                      selections={selections}
                      onRemove={removeSelection}
                    />
                    
                    {/* Desktop Checkout Card */}
                    <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200 p-6">
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex items-center gap-8">
                          <div>
                            <p className="text-sm text-gray-600">Total a Pagar</p>
                            <p className="text-3xl font-bold text-gray-900">Bs. {getTotalAmount().toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Saldo Después</p>
                            <p className="text-xl font-semibold text-gray-700">
                              Bs. {(balance?.availableBalance - getTotalAmount()).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        
                        <button
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg whitespace-nowrap"
                        >
                          {submitting ? (
                            <>
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                              Procesando...
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-6 h-6" />
                              Comprar {selections.length}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center h-full flex flex-col items-center justify-center">
                    <ShoppingCart className="w-16 h-16 text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Sin números seleccionados</h3>
                    <p className="text-sm text-gray-500">Agrega números para comenzar</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Checkout Bar - Mobile Only */}
      {selections.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-20">
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

      {/* Tripleta Modal */}
      {showTripletaModal && selectedGame && (
        <TripletaBetModal
          game={selectedGame}
          onClose={() => setShowTripletaModal(false)}
          onSuccess={async () => {
            const balanceRes = await playerApi.getBalance();
            if (balanceRes.success) {
              setBalance(balanceRes.data);
            }
          }}
        />
      )}
    </div>
  );
}
