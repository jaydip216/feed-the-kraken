import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './theme.css';
import { Home } from './surfaces/Home.js';
import { TableSurface } from './surfaces/TableSurface.js';
import { PlayerSurface } from './surfaces/PlayerSurface.js';
import { HostSurface } from './surfaces/HostSurface.js';
import { GuideSurface } from './surfaces/GuideSurface.js';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/table" element={<TableSurface />} />
        <Route path="/play" element={<PlayerSurface />} />
        <Route path="/host" element={<HostSurface />} />
        <Route path="/guide" element={<GuideSurface />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
