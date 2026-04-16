'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ProviderHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/proveedor/tickets'); }, [router]);
  return null;
}
