import type { AppProps } from 'next/app';
import '../styles/globals.css';
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Coffee & Canvas | Real-time Collaborative Art</title>
        <meta
          name="description"
          content="Collaborate in real-time on an infinite digital canvas with physics-based fluid effects."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
