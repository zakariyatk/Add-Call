import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { InstallPrompt } from './components/InstallPrompt';
import { isNativeApp } from './lib/platform';
import './styles/app.css';

// In the Android app, Capacitor keeps the page clear of the status and navigation
// bars itself, which it does when the page doesn't ask to draw under them.
if (isNativeApp) document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1.0');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <InstallPrompt />
  </StrictMode>,
);
