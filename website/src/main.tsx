import { hydrateRoot, createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
const root=document.getElementById('root')!;
if(root.hasChildNodes()) hydrateRoot(root,<App/>); else createRoot(root).render(<App/>);
