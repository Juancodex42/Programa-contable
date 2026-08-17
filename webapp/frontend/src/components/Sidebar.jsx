import { Home, FileClock, Plug, TrendingUp, Menu, X, Settings as SettingsIcon, BarChart3, Calculator, Calendar as CalendarIcon, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';

const Sidebar = ({ isOpen, setIsOpen }) => {
    const location = useLocation();

    const menuItems = [
        { name: 'Inicio & Carga', icon: <Home size={18} strokeWidth={2} />, path: '/' },
        { name: 'Dashboard', icon: <BarChart3 size={18} strokeWidth={2} />, path: '/dashboard' },
        { name: 'Calendario FIFO', icon: <CalendarIcon size={18} strokeWidth={2} />, path: '/calendar' },
        { name: 'Impuestos (IMP)', icon: <Calculator size={18} strokeWidth={2} />, path: '/impuestos' },
        { name: 'Archivos Generados', icon: <FileClock size={18} strokeWidth={2} />, path: '/history' },
        { name: 'Conectores API', icon: <Plug size={18} strokeWidth={2} />, path: '/apis' },
        { name: 'Reportes Continuos', icon: <TrendingUp size={18} strokeWidth={2} />, path: '/reports' },
        { name: 'Configuraciones', icon: <SettingsIcon size={18} strokeWidth={2} />, path: '/settings' },
    ];

    return (
        <>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    top: '1.25rem',
                    left: '1.25rem',
                    zIndex: 1001,
                    background: '#0D131F',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '0.55rem',
                    borderRadius: '0.5rem',
                    color: '#F8FAFC',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    transition: 'all 150ms ease'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(79, 70, 229, 0.4)';
                    e.currentTarget.style.backgroundColor = '#182238';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.backgroundColor = '#0D131F';
                }}
                title={isOpen ? "Cerrar menú lateral" : "Abrir menú lateral"}
            >
                {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Sidebar Drawer */}
            <AnimatePresence>
                {isOpen && (
                    <motion.aside
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        style={{
                            position: 'fixed',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '270px',
                            background: '#0D131F',
                            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                            zIndex: 1000,
                            padding: '4.75rem 1.25rem 1.75rem 1.25rem',
                            boxShadow: '8px 0 24px rgba(0, 0, 0, 0.55)',
                            display: 'flex',
                            flexDirection: 'column',
                            boxSizing: 'border-box'
                        }}
                    >
                        {/* Branding Header */}
                        <div style={{ marginBottom: '1.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#F8FAFC', margin: 0, letterSpacing: '-0.02em' }}>
                                    CryptoTax <span style={{ color: '#818CF8', fontWeight: '500' }}>Pro</span>
                                </h2>
                            </div>
                            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                                Motor Impositivo & Contabilidad
                            </p>
                        </div>

                        {/* Navigation Section */}
                        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', fontWeight: '600', padding: '0 0.5rem 0.35rem 0.5rem' }}>
                                Módulos Principales
                            </div>
                            {menuItems.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setIsOpen(false)}
                                        className={`sidebar-link ${isActive ? 'active' : ''}`}
                                    >
                                        <span style={{ color: isActive ? '#818CF8' : 'inherit', display: 'flex', alignItems: 'center' }}>
                                            {item.icon}
                                        </span>
                                        <span style={{ fontSize: '13.5px' }}>{item.name}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Institutional System Status Footer */}
                        <div style={{
                            marginTop: 'auto',
                            padding: '0.85rem 1rem',
                            background: '#121A2B',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem'
                        }}>
                            <ShieldCheck size={16} color="#10B981" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11.5px', color: '#F8FAFC', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Motor Contable Activo
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                                    Algoritmo FIFO estricto
                                </div>
                            </div>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        </>
    );
};

export default Sidebar;
