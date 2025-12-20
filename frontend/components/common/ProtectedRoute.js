'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const router = useRouter();

  useEffect(() => {
    const checkAccess = () => {
      const userData = localStorage.getItem('user');
      const token = localStorage.getItem('accessToken');

      if (!token || !userData) {
        router.push('/login');
        return;
      }

      try {
        const user = JSON.parse(userData);
        
        if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
          if (user.role === 'PLAYER') {
            router.push('/dashboard');
          } else if (user.role === 'ADMIN' || user.role === 'OPERATOR') {
            router.push('/admin');
          } else {
            router.push('/login');
          }
        }
      } catch (error) {
        router.push('/login');
      }
    };

    checkAccess();
  }, [router, allowedRoles]);

  return <>{children}</>;
}
