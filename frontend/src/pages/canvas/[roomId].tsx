import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Toolbar } from '@/components/UI/Toolbar';
import { useStore } from '@/store/useStore';

// PixiJS must not run on the server
const Canvas = dynamic(() => import('@/components/Canvas/Canvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f8f7f4',
        color: '#6b7280',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
      }}
    >
      Initializing canvas…
    </div>
  ),
});

export default function CanvasPage() {
  const router = useRouter();
  const { roomId: routeRoomId } = router.query;
  const { roomId, userId, token, setRoomInfo } = useStore();

  // Auth guard — runs once on mount after hydration
  useEffect(() => {
    // Try to restore from localStorage if the store is empty (e.g. hard refresh)
    if (!token && typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('cc_token');
      const storedRoomId = localStorage.getItem('cc_roomId');
      const storedRoomCode = localStorage.getItem('cc_roomCode');
      const storedUserId = localStorage.getItem('cc_userId');
      const storedUserName = localStorage.getItem('cc_userName');
      const storedUserColor = localStorage.getItem('cc_userColor');

      if (
        storedToken &&
        storedRoomId &&
        storedRoomCode &&
        storedUserId &&
        storedUserName &&
        storedUserColor
      ) {
        setRoomInfo(
          storedRoomId,
          storedRoomCode,
          storedUserId,
          storedUserName,
          storedUserColor,
          storedToken
        );
        return;
      }

      // No credentials at all → send back to lobby
      router.replace('/lobby');
    }
  }, [token, setRoomInfo, router]);

  // If the URL roomId does not match the stored roomId, redirect
  useEffect(() => {
    if (
      roomId &&
      routeRoomId &&
      typeof routeRoomId === 'string' &&
      roomId !== routeRoomId
    ) {
      router.replace('/lobby');
    }
  }, [roomId, routeRoomId, router]);

  // While restoring auth, show nothing (avoids flash)
  if (!userId || !token) return null;

  return (
    <>
      <Head>
        <title>Coffee &amp; Canvas — Drawing Room</title>
        <meta name="description" content="Collaborative drawing canvas" />
      </Head>

      <main
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Drawing surface */}
        <Canvas />

        {/* Floating UI */}
        <div
          id="ui-container"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <Toolbar />
        </div>
      </main>
    </>
  );
}
