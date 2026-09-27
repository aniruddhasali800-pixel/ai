import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { connectRealtime } from './lib/socket';
import { useAuth } from './store/auth';
import './index.css';

// Boot the realtime socket from any persisted session before first render.
connectRealtime(useAuth.getState().accessToken);
void useAuth.getState().bootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
