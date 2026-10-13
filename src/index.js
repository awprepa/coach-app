import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { register } from './serviceWorkerRegistration';
import { installerAccessibilite } from './utils/a11y';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

register();
reportWebVitals();
installerAccessibilite();

// iPhone : à la fermeture du clavier, les éléments fixes (barre du bas) peuvent
// rester décalés jusqu'au prochain défilement. On force un recalcul.
document.addEventListener('focusout', e => {
  if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) {
    setTimeout(() => window.scrollTo(window.scrollX, window.scrollY), 60)
  }
});
