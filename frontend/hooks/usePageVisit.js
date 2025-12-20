'use client';

import { useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const generateSessionId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

const getSessionId = () => {
  if (typeof window === 'undefined') return null;
  
  let sessionId = sessionStorage.getItem('visit_session_id');
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem('visit_session_id', sessionId);
  }
  return sessionId;
};

const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
};

export const usePageVisit = (pageType, pagePath) => {
  const visitIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (!pageType || !pagePath || hasTrackedRef.current) return;

    const trackVisit = async () => {
      try {
        const sessionId = getSessionId();
        const token = getAuthToken();
        const referrer = document.referrer || null;

        const headers = {
          'Content-Type': 'application/json',
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${API_URL}/api/page-visits/track`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            pageType,
            pagePath,
            sessionId,
            referrer,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          visitIdRef.current = data.visitId;
          startTimeRef.current = Date.now();
          hasTrackedRef.current = true;
        }
      } catch (error) {
        console.error('Error tracking page visit:', error);
      }
    };

    trackVisit();

    return () => {
      if (visitIdRef.current && startTimeRef.current) {
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        if (duration > 0) {
          navigator.sendBeacon(
            `${API_URL}/api/page-visits/${visitIdRef.current}/duration`,
            JSON.stringify({ duration })
          );
        }
      }
    };
  }, [pageType, pagePath]);

  return { visitId: visitIdRef.current };
};

export const PAGE_TYPES = {
  LANDING: 'LANDING',
  ADMIN_DASHBOARD: 'ADMIN_DASHBOARD',
  ADMIN_SORTEOS: 'ADMIN_SORTEOS',
  ADMIN_JUEGOS: 'ADMIN_JUEGOS',
  ADMIN_USUARIOS: 'ADMIN_USUARIOS',
  ADMIN_JUGADORES: 'ADMIN_JUGADORES',
  ADMIN_DEPOSITOS: 'ADMIN_DEPOSITOS',
  ADMIN_RETIROS: 'ADMIN_RETIROS',
  ADMIN_TICKETS: 'ADMIN_TICKETS',
  ADMIN_REPORTES: 'ADMIN_REPORTES',
  ADMIN_TELEGRAM: 'ADMIN_TELEGRAM',
  ADMIN_WHATSAPP: 'ADMIN_WHATSAPP',
  ADMIN_FACEBOOK: 'ADMIN_FACEBOOK',
  ADMIN_INSTAGRAM: 'ADMIN_INSTAGRAM',
  ADMIN_TIKTOK: 'ADMIN_TIKTOK',
  ADMIN_BOTS: 'ADMIN_BOTS',
  ADMIN_PAUSAS: 'ADMIN_PAUSAS',
  ADMIN_CONFIG: 'ADMIN_CONFIG',
  ADMIN_PERFIL: 'ADMIN_PERFIL',
  ADMIN_CUENTAS: 'ADMIN_CUENTAS',
  ADMIN_PAGO_MOVIL: 'ADMIN_PAGO_MOVIL',
  PLAYER_DASHBOARD: 'PLAYER_DASHBOARD',
  PLAYER_JUGAR: 'PLAYER_JUGAR',
  PLAYER_BALANCE: 'PLAYER_BALANCE',
  PLAYER_CUENTAS: 'PLAYER_CUENTAS',
  PLAYER_DEPOSITOS: 'PLAYER_DEPOSITOS',
  PLAYER_RETIROS: 'PLAYER_RETIROS',
};
