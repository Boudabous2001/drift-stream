import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import '@fontsource-variable/inter';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 2600,
        style: {
          background: 'rgba(20, 23, 34, 0.92)',
          color: '#e8eaf2',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          fontSize: '13.5px',
          fontWeight: 500,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
        },
        success: { iconTheme: { primary: '#34d399', secondary: '#0a0c12' } },
        error: { iconTheme: { primary: '#ff5c7c', secondary: '#0a0c12' } },
      }}
    />
  </StrictMode>,
);
