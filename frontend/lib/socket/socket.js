import { io } from 'socket.io-client';
import useDrawStore from '@/store/drawStore';
import { toast } from 'sonner';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.socket?.connected) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    
    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:10000', {
      auth: {
        token
      },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // Listen to draw events
    this.setupDrawListeners();
  }

  /**
   * Setup draw event listeners
   */
  setupDrawListeners() {
    if (!this.socket) return;

    // Draw closed event
    this.socket.on('draw:closed', (data) => {
      console.log('🔒 Draw closed:', data);
      useDrawStore.getState().updateDraw(data.drawId, {
        status: 'CLOSED',
        preselectedItemId: data.preselectedItemId,
        preselectedItem: data.preselectedItem,
        closedAt: data.closedAt
      });

      toast.info(`Sorteo cerrado: ${data.preselectedItem.number} - ${data.preselectedItem.name}`, {
        duration: 5000
      });
    });

    // Winner selected event
    this.socket.on('draw:winner-selected', (data) => {
      console.log('🏆 Winner selected:', data);
      useDrawStore.getState().updateDraw(data.drawId, {
        status: 'DRAWN',
        winnerItemId: data.winnerItemId,
        winnerItem: data.winnerItem,
        drawnAt: data.drawnAt
      });

      toast.success(`¡Ganador! ${data.winnerItem.number} - ${data.winnerItem.name}`, {
        duration: 10000
      });
    });

    // Draw published event
    this.socket.on('draw:published', (data) => {
      console.log('📢 Draw published:', data);
      useDrawStore.getState().updateDraw(data.drawId, {
        status: 'PUBLISHED',
        imageUrl: data.imageUrl,
        publishedAt: data.publishedAt
      });

      toast.success('Sorteo publicado en todos los canales', {
        duration: 5000
      });
    });

    // Publication success event
    this.socket.on('publication:success', (data) => {
      console.log('✅ Publication success:', data);
      toast.success(`Publicado en ${data.channel}`, {
        duration: 3000
      });
    });

    // Publication failed event
    this.socket.on('publication:failed', (data) => {
      console.error('❌ Publication failed:', data);
      toast.error(`Error al publicar en ${data.channel}: ${data.error}`, {
        duration: 5000
      });
    });

    // Draw created event
    this.socket.on('draw:created', (data) => {
      console.log('➕ Draw created:', data);
      useDrawStore.getState().addDraw(data.draw);
    });

    // Draw updated event
    this.socket.on('draw:updated', (data) => {
      console.log('🔄 Draw updated:', data);
      useDrawStore.getState().updateDraw(data.drawId, data.updates);
    });
  }

  /**
   * Join a game room
   * @param {string} gameSlug - Game slug
   */
  joinGameRoom(gameSlug) {
    if (this.socket?.connected) {
      this.socket.emit('join:game', gameSlug);
      console.log(`Joined game room: ${gameSlug}`);
    }
  }

  /**
   * Leave a game room
   * @param {string} gameSlug - Game slug
   */
  leaveGameRoom(gameSlug) {
    if (this.socket?.connected) {
      this.socket.emit('leave:game', gameSlug);
      console.log(`Left game room: ${gameSlug}`);
    }
  }

  /**
   * Join admin room
   */
  joinAdminRoom() {
    if (this.socket?.connected) {
      this.socket.emit('join:admin');
      console.log('Joined admin room');
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('WebSocket disconnected');
    }
  }

  /**
   * Check if socket is connected
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;
