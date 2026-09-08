import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodexShell } from './codex-shell/CodexShell';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(<CodexShell />);
