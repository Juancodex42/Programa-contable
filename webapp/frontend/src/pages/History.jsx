import { useState, useEffect } from 'react';
import { Database, FileText, Calendar, Loader2, AlertTriangle, CheckSquare, ShieldCheck, Filter, Trash2, Sparkles } from 'lucide-react';
import axios from 'axios';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import config from '../config';
import { Link, useNavigate } from 'react-router-dom';

function History() {
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState('transactions'); // 'transactions' or 'files'
    const [history, setHistory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [gaps, setGaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'certified', 'uncertified'
    const [txSearch, setTxSearch] = useState('');

    const deleteExchangeBatch = async (exchangeName) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar TODAS las transacciones de ${exchangeName}? Esta acción no se puede deshacer.`)) {
            return;
        }
        try {
            const res = await axios.delete(`${config.API_URL}/api/history/exchange/${encodeURIComponent(exchangeName)}`);
            if (res.data && res.data.success) {
                alert(`Se eliminaron ${res.data.deleted_count} transacciones de ${exchangeName}.`);
                fetchAllData();
            } else {
                alert("Error al eliminar los registros.");
            }
        } catch (err) {
            console.error("Error al eliminar intercambio", err);
            alert("Error de conexión al eliminar los registros.");
        }
    };


    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [hRes, gRes, tRes] = await Promise.all([
                axios.get(`${config.API_URL}/api/history`),
                axios.get(`${config.API_URL}/api/reports/gaps`),
                axios.get(`${config.API_URL}/api/transactions`)
            ]);
            setHistory(hRes.data);
            setGaps(gRes.data.gaps || []);
            setTransactions(tRes.data || []);
        } catch (err) {
            console.error("Error fetching history or transactions", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const downloadOriginal = async (filename) => {
        try {
            const res = await axios.post(`${config.API_URL}/download`, { filenames: [filename] }, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Reporte_${filename}.xlsx`);
            document.body.appendChild(link);
            link.click();
        } catch {
            alert("Error al descargar. Archivo no encontrado en DB.");
        }
    };

    const allCount = transactions.length;
    const certifiedCount = transactions.filter(t => t.is_certified === 1).length;
    const uncertifiedCount = transactions.filter(t => t.is_certified !== 1).length;

    const filteredTxs = transactions.filter(t => {
        if (statusFilter === 'certified' && t.is_certified !== 1) return false;
        if (statusFilter === 'uncertified' && (t.is_certified === 1)) return false;

        if (!txSearch) return true;
        const q = txSearch.toLowerCase();
        const exch = (t.exchange || t.Exchange || '').toLowerCase();
        const mon = (t.moneda || t.Moneda || '').toLowerCase();
        const tipo = (t.tipo_operacion || t['Tipo de Operación'] || '').toLowerCase();
        const fec = (t.fecha || t.Fecha || '').toLowerCase();
        return exch.includes(q) || mon.includes(q) || tipo.includes(q) || fec.includes(q);
    });

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Cargando historial de operaciones...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ color: 'var(--accent-cyan)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.8rem', fontWeight: 800 }}>
                        <Database /> Historial & Respaldo Legal de Operaciones
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.3rem 0 0 0', fontSize: '0.9rem' }}>
                        Visualización de transacciones auditadas por Certificación Contable C.P.N. vs Operaciones Provisorias en Vivo.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '8px', border: '1px solid #334155' }}>
                    <button
                        onClick={() => setViewMode('transactions')}
                        style={{
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            border: 'none',
                            background: viewMode === 'transactions' ? '#38bdf8' : 'transparent',
                            color: viewMode === 'transactions' ? '#0f172a' : '#94a3b8',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        Detalle de Transacciones ({transactions.length})
                    </button>
                    <button
                        onClick={() => setViewMode('files')}
                        style={{
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            border: 'none',
                            background: viewMode === 'files' ? '#38bdf8' : 'transparent',
                            color: viewMode === 'files' ? '#0f172a' : '#94a3b8',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        Archivos por Exchange ({history.length})
                    </button>
                </div>
            </div>

            {gaps && gaps.length > 0 && (
                <div style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: '0.75rem',
                    padding: '0.85rem 1.25rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <AlertTriangle size={20} color="#fbbf24" style={{ flexShrink: 0 }} />
                        <div>
                            <div style={{ fontSize: '0.95rem', color: '#fde68a', fontWeight: '700' }}>
                                Se detectaron {gaps.length} faltante(s) de historial (huecos FIFO)
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                                Faltan comprobantes de compra para un cálculo preciso. Podés revisarlos y resolverlos en la sección Calendario.
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/calendar?tab=warnings')}
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '0.5rem',
                            padding: '0.5rem 1rem',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Sparkles size={16} /> Resolver en Calendario →
                    </button>
                </div>
            )}

            {viewMode === 'transactions' ? (
                <div>
                    {/* FILTER & SEARCH CONTROL BAR */}
                    <div className="glass-card" style={{ padding: '0.9rem 1.2rem', marginBottom: '1.25rem', background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '240px' }}>
                            <Filter size={18} color="#38bdf8" />
                            <input
                                type="text"
                                placeholder="Buscar por exchange, cripto (BTC, ETH), tipo..."
                                value={txSearch}
                                onChange={(e) => setTxSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.45rem 0.8rem',
                                    borderRadius: '6px',
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    border: '1px solid #334155',
                                    color: '#fff',
                                    fontSize: '0.88rem'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Capa Legal:</span>
                            <button
                                onClick={() => setStatusFilter('all')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    border: statusFilter === 'all' ? '1px solid #38bdf8' : '1px solid #334155',
                                    background: statusFilter === 'all' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                                    color: statusFilter === 'all' ? '#e0f2fe' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                Todas ({allCount})
                            </button>
                            <button
                                onClick={() => setStatusFilter('certified')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    border: statusFilter === 'certified' ? '1px solid #34d399' : '1px solid #334155',
                                    background: statusFilter === 'certified' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                                    color: statusFilter === 'certified' ? '#a7f3d0' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                Certificadas C.P.N. ({certifiedCount})
                            </button>
                            <button
                                onClick={() => setStatusFilter('uncertified')}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    border: statusFilter === 'uncertified' ? '1px solid #fbbf24' : '1px solid #334155',
                                    background: statusFilter === 'uncertified' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                                    color: statusFilter === 'uncertified' ? '#fef3c7' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                Provisorias (API/CSV) ({uncertifiedCount})
                            </button>
                        </div>
                    </div>

                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.8rem 1rem', color: 'var(--accent-cyan)' }}>Fecha</th>
                                    <th style={{ textAlign: 'left', padding: '0.8rem 1rem', color: 'var(--text-secondary)' }}>Exchange</th>
                                    <th style={{ textAlign: 'left', padding: '0.8rem 1rem', color: 'var(--text-secondary)' }}>Tipo</th>
                                    <th style={{ textAlign: 'left', padding: '0.8rem 1rem', color: 'var(--text-secondary)' }}>Moneda</th>
                                    <th style={{ textAlign: 'right', padding: '0.8rem 1rem', color: 'var(--text-secondary)' }}>Monto ARS</th>
                                    <th style={{ textAlign: 'center', padding: '0.8rem 1rem', color: 'var(--accent-cyan)' }}>Respaldo Legal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTxs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No se encontraron transacciones registradas para este filtro.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTxs.map((t, idx) => {
                                        const isCert = t.is_certified === 1;
                                        const fecha = t.fecha || t.Fecha || '-';
                                        const exchange = t.exchange || t.Exchange || '-';
                                        const tipo = t.tipo_operacion || t['Tipo de Operación'] || '-';
                                        const moneda = t.moneda || t.Moneda || '-';
                                        const montoArs = t.monto_ars ?? t['Monto ARS'] ?? 0;
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isCert ? 'rgba(52, 211, 153, 0.02)' : 'transparent' }}>
                                                <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontWeight: 500, color: '#f1f5f9' }}>
                                                    {fecha}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{exchange}</span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: tipo === 'Compra' ? '#34d399' : '#f87171', fontWeight: 600 }}>
                                                    {tipo}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#cbd5e1' }}>
                                                    {moneda}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                                                    ${montoArs.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                    {isCert ? (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            padding: '0.2rem 0.6rem',
                                                            borderRadius: '12px',
                                                            background: 'rgba(52, 211, 153, 0.18)',
                                                            color: '#34d399',
                                                            border: '1px solid rgba(52, 211, 153, 0.4)',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700
                                                        }}>
                                                            <ShieldCheck size={14} /> Certificado C.P.N.
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            padding: '0.2rem 0.6rem',
                                                            borderRadius: '12px',
                                                            background: 'rgba(251, 191, 36, 0.18)',
                                                            color: '#fbbf24',
                                                            border: '1px solid rgba(251, 191, 36, 0.4)',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700
                                                        }}>
                                                            Provisorio (API/CSV)
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div>
                    {history.length === 0 ? (
                        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
                            <p style={{ color: 'var(--text-secondary)' }}>Aún no has procesado ningún archivo.</p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
                                        <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--accent-cyan)' }}>Archivo</th>
                                        <th style={{ textAlign: 'left', padding: '1rem', color: 'var(--text-secondary)' }}>Exchange</th>
                                        <th style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>Registros</th>
                                        <th style={{ textAlign: 'right', padding: '1rem', color: 'var(--text-secondary)' }}>Rango de Fechas</th>
                                        <th style={{ textAlign: 'center', padding: '1rem' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item, idx) => (
                                        <motion.tr
                                            key={idx}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                        >
                                            <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <FileText size={16} color="var(--text-secondary)" />
                                                {item.filename}
                                            </td>
                                            <td style={{ padding: '1rem' }}>
                                                <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{item.exchange}</span>
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold' }}>
                                                {item.count}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {item.date_range}
                                            </td>
                                            <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                <button
                                                    className="btn-primary"
                                                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}
                                                    onClick={() => downloadOriginal(item.filename)}
                                                >
                                                    Descargar
                                                </button>
                                                <button
                                                    style={{
                                                        padding: '0.3rem 0.8rem',
                                                        fontSize: '0.75rem',
                                                        background: 'rgba(239, 68, 68, 0.2)',
                                                        color: '#f87171',
                                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem'
                                                    }}
                                                    onClick={() => deleteExchangeBatch(item.exchange)}
                                                >
                                                    <Trash2 size={13} /> Eliminar Lote
                                                </button>
                                            </td>

                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default History;
