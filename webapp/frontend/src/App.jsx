import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import History from './pages/History';
import APIs from './pages/APIs';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Impuestos from './pages/Impuestos';
import { FileProvider } from './context/FileContext';
import './index.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <FileProvider>
      <div className="app-container" style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <main 
          className="main-content"
          style={{ 
            marginLeft: sidebarOpen ? '260px' : '0px', 
            transition: 'margin-left 0.3s ease-in-out',
            minHeight: '100vh',
            boxSizing: 'border-box'
          }}
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/impuestos" element={<Impuestos />} />
            <Route path="/history" element={<History />} />
            <Route path="/apis" element={<APIs />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </FileProvider>
  );
}


export default App;
