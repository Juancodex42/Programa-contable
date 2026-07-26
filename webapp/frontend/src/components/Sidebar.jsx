import { Home, FileClock, Plug, TrendingUp, Menu, X, Settings as SettingsIcon, BarChart, Calculator, Calendar as CalendarIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';

const Sidebar = ({ isOpen, setIsOpen }) => {
    const location = useLocation();

    const menuItems = [
        { name: 'Inicio', icon: <Home size={20} />, path: '/' },
        { name: 'Dashboard', icon: <BarChart size={20} />, path: '/dashboard' },
        { name: 'Calendario', icon: <CalendarIcon size={20} />, path: '/calendar' },
        { name: 'Impuestos (IMP)', icon: <Calculator size={20} />, path: '/impuestos' },
        { name: 'Archivos Generados', icon: <FileClock size={20} />, path: '/history' },
        { name: 'APIs', icon: <Plug size={20} />, path: '/apis' },
        { name: 'Reportes Continuos', icon: <TrendingUp size={20} />, path: '/reports' },
        { name: 'Configuraciones', icon: <SettingsIcon size={20} />, path: '/settings' },
    ];


    return (
        <>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed', top: '1.25rem', left: '1.25rem', zIndex: 1001,
                    background: 'rgba(30, 41, 59, 0.9)', backdropFilter: 'blur(8px)',
                    border: '1px solid var(--border-color)', padding: '0.6rem',
                    borderRadius: '0.6rem', color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.2s'
                }}
                title={isOpen ? "Cerrar menú" : "Abrir menú"}
            >
                {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ x: -260 }}
                        animate={{ x: 0 }}
                        exit={{ x: -260 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        style={{
                            position: 'fixed', left: 0, top: 0, bottom: 0, width: '260px',
                            background: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(16px)',
                            borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 1000,
                            padding: '5rem 1.25rem 2rem 1.25rem', boxShadow: '5px 0 25px rgba(0,0,0,0.5)',
                            display: 'flex', flexDirection: 'column'
                        }}
                    >
                        <div style={{ marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-cyan)', margin: 0 }}>CryptoTax Pro</h2>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>Panel de Control</p>
                        </div>

                        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                            {menuItems.map((item) => (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setIsOpen(false)}
                                    className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
                                >
                                    {item.icon}
                                    {item.name}
                                </Link>
                            ))}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default Sidebar;
