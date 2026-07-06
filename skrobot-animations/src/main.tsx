import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './animations.css';
import '@skrobot/animations/trick-animation-3d.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
