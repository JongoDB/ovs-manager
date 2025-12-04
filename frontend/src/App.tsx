import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import HostDetail from './components/HostDetail';
import StatisticsDashboard from './components/StatisticsDashboard';
import BridgeManagement from './components/BridgeManagement';
import PortManagement from './components/PortManagement';
import MirrorManagement from './components/MirrorManagement';
import FlowExportConfig from './components/FlowExportConfig';
import NetworkTopology from './components/NetworkTopology';
import Diagnostics from './components/Diagnostics';
import DemoBanner from './components/DemoBanner';

function App() {
  return (
    <ThemeProvider>
      <DemoBanner />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hosts/:hostId" element={<HostDetail />} />
            <Route path="/bridges" element={<BridgeManagement />} />
            <Route path="/ports" element={<PortManagement />} />
            <Route path="/mirrors" element={<MirrorManagement />} />
            <Route path="/statistics" element={<StatisticsDashboard />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route path="/topology" element={<NetworkTopology />} />
            <Route path="/flow-export" element={<FlowExportConfig />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;

