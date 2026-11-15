import { createRoot } from 'react-dom/client';
import { setAssetPath } from '@esri/calcite-components';
import { defineCustomElements } from '@esri/calcite-components/dist/loader';
import App from './App.tsx';
import './index.css';

// Calcite resolves component assets relative to this directory.
setAssetPath('/calcite-assets/');
defineCustomElements(window);

createRoot(document.getElementById('root')!).render(<App />);
