import Script from 'next/script';

export const metadata = { title: 'Monitor — Admin' };

export default function TgLayout({ children }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div style={{ minHeight: '100vh', background: '#17212b', color: '#fff' }}>{children}</div>
    </>
  );
}
