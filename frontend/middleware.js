import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Rutas públicas que no requieren autenticación
  const publicPaths = ['/login', '/register', '/'];
  
  // Si es una ruta pública, permitir acceso
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }
  
  // Obtener datos del usuario del localStorage (simulado con cookies)
  const userCookie = request.cookies.get('user');
  const tokenCookie = request.cookies.get('accessToken');
  
  // Si no hay token, redirigir a login
  if (!tokenCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Verificar acceso a rutas de admin
  if (pathname.startsWith('/admin')) {
    try {
      const user = userCookie ? JSON.parse(userCookie.value) : null;
      
      // Rutas específicas de taquilla (solo TAQUILLA_ADMIN y ADMIN)
      const taquillaRoutes = [
        '/admin/depositos',
        '/admin/retiros',
        '/admin/cuentas-sistema',
        '/admin/jugadores',
        '/admin/tickets',
        '/admin/reportes-taquilla'
      ];
      
      const isTaquillaRoute = taquillaRoutes.some(route => pathname.startsWith(route));
      
      if (isTaquillaRoute) {
        // Solo ADMIN y TAQUILLA_ADMIN pueden acceder a rutas de taquilla
        if (!user || (user.role !== 'ADMIN' && user.role !== 'TAQUILLA_ADMIN')) {
          return NextResponse.redirect(new URL('/login', request.url));
        }
      } else {
        // Otras rutas de admin: solo ADMIN y OPERATOR
        if (!user || (user.role !== 'ADMIN' && user.role !== 'OPERATOR')) {
          // Si es TAQUILLA_ADMIN, redirigir a su dashboard
          if (user && user.role === 'TAQUILLA_ADMIN') {
            return NextResponse.redirect(new URL('/admin/depositos', request.url));
          }
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
      }
    } catch (error) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  // Verificar acceso a rutas de jugador
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/depositos') || 
      pathname.startsWith('/retiros') || pathname.startsWith('/cuentas')) {
    try {
      const user = userCookie ? JSON.parse(userCookie.value) : null;
      
      // Solo PLAYER puede acceder a estas rutas
      if (!user || user.role !== 'PLAYER') {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
    } catch (error) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/depositos/:path*',
    '/retiros/:path*',
    '/cuentas/:path*'
  ]
};
