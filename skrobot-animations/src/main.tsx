import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './animations.css';
import '@skrobot/animations/trick-scene-3d.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
