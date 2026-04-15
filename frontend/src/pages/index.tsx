import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Root route — redirects immediately to the lobby.
 * The actual canvas is at /canvas/[roomId].
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/lobby');
  }, [router]);

  return null;
}
