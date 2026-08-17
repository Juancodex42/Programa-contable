import { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';
import { Link } from 'react-router-dom';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    Activity, TrendingUp, TrendingDown, Layers, Loader2, AlertTriangle,
    Percent, Calendar, Filter, RefreshCw, CheckSquare, Square,
    ShieldCheck, ArrowUpRight, ArrowDownRight, Scale, CheckCircle2,
    ChevronRight, FileCheck, ArrowRight, ShieldAlert
} from 'lucide-react';

const PIE_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#06B6D4', '#818CF8', '#FB7185', '#64748B'];

const ORIGIN_OPTIONS = [
    'Capital Inicial / Años Anteriores',
    'Exchange Externo / Billetera Fría',
    'P2P / Efectivo'
];

// Custom Institutional Tooltip for Equity Curve
const CustomAreaTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const val = payload[0].value;
        return (
            <div style={{
                backgroundColor: '#182238',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.55)',
                fontSize: '13px'
            }}>
                <div style={{ color: '#94A3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', fontWeight: 600 }}>
                    Período: {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#F8FAFC', fontSize: '14px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#818CF8', display: 'inline-block' }} />
                    <span style={{ color: '#94A3B8', fontWeight: 500 }}>Capital Acumulado:</span>
                    <span style={{ color: val >= 0 ? '#34D399' : '#FB7185' }} className="tabular-nums">
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)}
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

// Custom Institutional Tooltip for Daily Volume (Buys vs Sells)
const CustomBarTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const buys = payload.find(p => p.dataKey === 'buys')?.value || 0;
        const sells = payload.find(p => p.dataKey === 'sells')?.value || 0;
        const net = sells - buys;
        return (
            <div style={{
                backgroundColor: '#182238',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.55)',
                fontSize: '13px',
                minWidth: '220px'
            }}>
                <div style={{ color: '#94A3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 600 }}>
                    Fecha: {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                            Compras:
                        </span>
                        <strong style={{ color: '#F8FAFC' }} className="tabular-nums">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(buys)}
                        </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#818CF8', display: 'inline-block' }} />
                            Ventas:
                        </span>
                        <strong style={{ color: '#F8FAFC' }} className="tabular-nums">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(sells)}
                        </strong>
                    </div>
                    <div style={{ marginTop: '0.25rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                        <span style={{ color: '#94A3B8', fontSize: '12px' }}>Flujo Neto:</span>
                        <strong style={{ color: net >= 0 ? '#34D399' : '#FB7185' }} className="tabular-nums">
                            {net >= 0 ? '+' : ''}{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(net)}
                        </strong>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

// Custom Institutional Tooltip for Pie Chart
const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const item = payload[0];
        return (
            <div style={{
                backgroundColor: '#182238',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '0.65rem 0.9rem',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.55)',
                fontSize: '13px'
            }}>
                <div style={{ color: '#94A3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem', fontWeight: 600 }}>
                    {item.name}
                </div>
                <div style={{ fontWeight: 700, color: '#F8FAFC' }} className="tabular-nums">
                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.value)}
                </div>
            </div>
        );
    }
    return null;
};

function Dashboard() {
    const [kpis, setKpis] = useState(null);
    const [dailyVol, setDailyVol] = useState([]);
    const [exchangeDist, setExchangeDist] = useState([]);
    const [equityCurve, setEquityCurve] = useState([]);
    const [modalSpread, setModalSpread] = useState(null);
    const [anomalies, setAnomalies] = useState([]);
    const [availableExchanges, setAvailableExchanges] = useState([]);
    const [gaps, setGaps] = useState([]);

    // Filters State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedExchanges, setSelectedExchanges] = useState([]);
    const [equityInterval, setEquityInterval] = useState('daily');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'certified', 'uncertified'

    // UI Loading States
    const [loading, setLoading] = useState(true);
    const [classifying, setClassifying] = useState({});
    const [selectedOrigins, setSelectedOrigins] = useState({});

    // Fetch initial list of exchanges
    useEffect(() => {
        axios.get(`${config.API_URL}/api/stats/available_exchanges`)
            .then(res => {
                const exchs = res.data || [];
                setAvailableExchanges(exchs);
                setSelectedExchanges(exchs); // Default to all selected
            })
            .catch(err => console.error("Error fetching exchanges:", err));
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const exchParam = selectedExchanges.length > 0 ? selectedExchanges.join(',') : '';
            const params = {
                start: startDate,
                end: endDate,
                exchanges: exchParam,
                status: statusFilter !== 'all' ? statusFilter : undefined
            };

            const [kh, dh, eh, eq, sp, ah, gp] = await Promise.all([
                axios.get(`${config.API_URL}/api/stats/kpi`, { params }),
                axios.get(`${config.API_URL}/api/stats/daily_volume`, { params }),
                axios.get(`${config.API_URL}/api/stats/exchange_distribution`, { params }),
                axios.get(`${config.API_URL}/api/stats/equity`, { params: { ...params, interval: equityInterval } }),
                axios.get(`${config.API_URL}/api/stats/spread`, { params }),
                axios.get(`${config.API_URL}/api/audit/reconciliation`).catch(() => ({ data: { anomalies: [] } })),
                axios.get(`${config.API_URL}/api/reports/gaps`).catch(() => ({ data: { gaps: [] } }))
            ]);

            setKpis(kh.data);
            setDailyVol(dh.data);
            setExchangeDist(eh.data);
            setEquityCurve(eq.data);
            setModalSpread(sp.data);
            setAnomalies(ah.data.anomalies || []);
            setGaps(gp.data.gaps || []);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate, selectedExchanges, equityInterval, statusFilter]);

    const handleToggleExchange = (exch) => {
        if (selectedExchanges.includes(exch)) {
            setSelectedExchanges(selectedExchanges.filter(e => e !== exch));
        } else {
            setSelectedExchanges([...selectedExchanges, exch]);
        }
    };

    const handleSelectAllExchanges = () => {
        if (selectedExchanges.length === availableExchanges.length) {
            setSelectedExchanges([]);
        } else {
            setSelectedExchanges([...availableExchanges]);
        }
    };

    const handleClassifyAnomaly = async (a, idx) => {
        const origin = selectedOrigins[idx] || ORIGIN_OPTIONS[0];
        setClassifying(prev => ({ ...prev, [idx]: true }));
        try {
            const res = await axios.post(`${config.API_URL}/api/audit/classify_anomaly`, {
                date: a.date,
                exchange: a.exchange,
                crypto: a.crypto,
                missing: a.missing,
                origin_type: origin
            });
            alert(res.data.message || "Operación clasificada y registrada correctamente.");
            await fetchData();
        } catch (error) {
            console.error("Error classifying anomaly:", error);
            alert("Error al clasificar el origen de la operación.");
        } finally {
            setClassifying(prev => ({ ...prev, [idx]: false }));
        }
    };

    const formatCurrency = (val) => {
        if (val === undefined || val === null) return "$ 0,00";
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
    };

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.75rem 2rem', color: 'var(--text-primary)' }}>
            
            {/* INSTITUTIONAL HEADER */}
            <header style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <h1 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC' }}>
                            Panel Analítico de Métricas
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                        Trazabilidad de fondos, curvas de rendimiento neto y conciliación contable multi-exchange.
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="btn-primary"
                    style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem' }}
                >
                    <RefreshCw size={16} className={loading ? "spin" : ""} />
                    <span>Actualizar Métricas</span>
                </button>
            </header>

            {/* CRITICAL GAP WARNING BANNER */}
            {gaps && gaps.length > 0 && (
                <div style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid var(--accent-amber-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.1rem 1.4rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.92rem', color: '#FDE68A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={18} color="#F59E0B" /> Inconsistencia de Trazabilidad: Huecos de Historial ({gaps.length})
                        </span>
                        <Link to="/" style={{ color: '#38BDF8', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            Cargar compras faltantes en Inicio <ArrowRight size={14} />
                        </Link>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#CBD5E1', margin: 0, lineHeight: 1.5 }}>
                        Se detectaron ventas de criptoactivos sin compras previas registradas. Las métricas de rentabilidad y saldos pueden presentar desviaciones:
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.5rem', marginTop: '0.25rem' }}>
                        {gaps.slice(0, 3).map((gap, idx) => (
                            <div key={idx} style={{ background: 'rgba(13, 19, 31, 0.7)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.82rem' }}>
                                <span style={{ color: '#FBBF24', fontWeight: 700 }}>{gap.exchange}:</span> Venta de <span className="tabular-nums font-semibold">{gap.sold_qty} {gap.coin}</span> ({gap.date.split(' ')[0]}) — Déficit: <span className="tabular-nums text-rose" style={{ color: '#FB7185' }}>{gap.deficit.toFixed(4)} {gap.coin}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* LEGAL COVERAGE & CERTIFICATION BACKING BANNER */}
            {kpis && (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.2rem 1.5rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1.25rem',
                    boxShadow: 'var(--shadow-md)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '10px',
                            background: 'var(--brand-indigo-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--brand-indigo-border)'
                        }}>
                            <ShieldCheck size={24} color="#818CF8" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                Respaldo Contable Legal (Certificaciones C.P.N.)
                                <span className={kpis.certified_pct > 50 ? "badge badge-emerald" : "badge badge-amber"}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: kpis.certified_pct > 50 ? '#10B981' : '#F59E0B', display: 'inline-block' }} />
                                    {kpis.certified_pct}% Auditado
                                </span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                {kpis.certified_count > 0 ? (
                                    <>
                                        Volumen Auditado: <strong style={{ color: '#38BDF8' }} className="tabular-nums">${(kpis.certified_volume_ars || 0).toLocaleString()} ARS</strong> ({kpis.certified_count} txs) • Provisorio al Día: <strong style={{ color: '#FBBF24' }} className="tabular-nums">${(kpis.provisional_volume_ars || 0).toLocaleString()} ARS</strong> ({kpis.provisional_count} txs)
                                    </>
                                ) : (
                                    <>Aún no se registran transacciones firmadas por certificación en este rango. Vincúlalas en el Calendario FIFO.</>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Layer Filter Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-panel)', padding: '0.3rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capa:</span>
                        <button
                            onClick={() => setStatusFilter('all')}
                            style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                border: statusFilter === 'all' ? '1px solid var(--brand-indigo)' : '1px solid transparent',
                                background: statusFilter === 'all' ? 'var(--brand-indigo-subtle)' : 'transparent',
                                color: statusFilter === 'all' ? '#FFFFFF' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 150ms ease'
                            }}
                        >
                            Consolidado (Todos)
                        </button>
                        <button
                            onClick={() => setStatusFilter('certified')}
                            style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                border: statusFilter === 'certified' ? '1px solid var(--accent-emerald)' : '1px solid transparent',
                                background: statusFilter === 'certified' ? 'var(--accent-emerald-subtle)' : 'transparent',
                                color: statusFilter === 'certified' ? '#34D399' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 150ms ease'
                            }}
                        >
                            Verdad Legal (Certificado)
                        </button>
                        <button
                            onClick={() => setStatusFilter('uncertified')}
                            style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                border: statusFilter === 'uncertified' ? '1px solid var(--accent-amber)' : '1px solid transparent',
                                background: statusFilter === 'uncertified' ? 'var(--accent-amber-subtle)' : 'transparent',
                                color: statusFilter === 'uncertified' ? '#FBBF24' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 150ms ease'
                            }}
                        >
                            Provisorio (Al Día)
                        </button>
                    </div>
                </div>
            )}

            {/* FILTER PANEL */}
            <div className="panel-surface" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--brand-indigo-light)', fontWeight: 600, fontSize: '0.9rem', minWidth: '160px' }}>
                        <Filter size={16} />
                        <span>Filtros de Análisis</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                        {/* Dates */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                <Calendar size={14} style={{ display: 'inline', marginRight: '3px', verticalAlign: '-2px' }} /> Desde:
                            </span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="input-field"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', width: 'auto' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                <Calendar size={14} style={{ display: 'inline', marginRight: '3px', verticalAlign: '-2px' }} /> Hasta:
                            </span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="input-field"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem', width: 'auto' }}
                            />
                        </div>

                        {/* Exchanges */}
                        {availableExchanges.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Exchanges:</span>
                                {availableExchanges.map((exch) => {
                                    const isChecked = selectedExchanges.includes(exch);
                                    return (
                                        <button
                                            key={exch}
                                            onClick={() => handleToggleExchange(exch)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.3rem 0.65rem',
                                                borderRadius: 'var(--radius-sm)',
                                                border: isChecked ? '1px solid var(--brand-indigo)' : '1px solid var(--border-color)',
                                                background: isChecked ? 'var(--brand-indigo-subtle)' : 'var(--bg-card)',
                                                color: isChecked ? '#FFFFFF' : 'var(--text-secondary)',
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                transition: 'all 150ms ease'
                                            }}
                                        >
                                            {isChecked ? <CheckSquare size={13} color="#818CF8" /> : <Square size={13} />}
                                            <span>{exch}</span>
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={handleSelectAllExchanges}
                                    style={{ background: 'none', border: 'none', color: 'var(--brand-indigo-light)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', fontWeight: 600, paddingLeft: '0.3rem' }}
                                >
                                    {selectedExchanges.length === availableExchanges.length ? 'Desmarcar' : 'Todos'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RECONCILIATION ANOMALIES (LEDGER FORMAT) */}
            {anomalies.length > 0 && (
                <div style={{
                    marginBottom: '1.75rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--accent-rose-border)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-md)'
                }}>
                    <div style={{
                        padding: '1rem 1.25rem',
                        background: 'rgba(244, 63, 94, 0.08)',
                        borderBottom: '1px solid var(--accent-rose-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <ShieldAlert color="#FB7185" size={20} />
                            <div>
                                <h3 style={{ color: '#FB7185', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                    Conciliación de Fondos sin Origen Registrado ({anomalies.length})
                                </h3>
                                <p style={{ fontSize: '0.82rem', color: '#CBD5E1', margin: '0.15rem 0 0 0' }}>
                                    Ventas registradas sin compra previa vinculada. Clasifica el origen para garantizar la trazabilidad legal:
                                </p>
                            </div>
                        </div>
                        <span className="badge badge-rose">
                            Acción Requerida
                        </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table className="table-ledger">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Exchange</th>
                                    <th>Activo</th>
                                    <th>Faltante a Justificar</th>
                                    <th>Procedencia Declarada</th>
                                    <th style={{ textAlign: 'right' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {anomalies.map((a, idx) => (
                                    <tr key={idx}>
                                        <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{a.date}</td>
                                        <td style={{ fontWeight: 600, color: '#F8FAFC' }}>{a.exchange}</td>
                                        <td>
                                            <span className="badge badge-slate">{a.crypto}</span>
                                        </td>
                                        <td>
                                            <span style={{ color: '#FB7185', fontWeight: 700 }} className="tabular-nums">
                                                {a.missing} {a.crypto}
                                            </span>
                                        </td>
                                        <td>
                                            <select
                                                value={selectedOrigins[idx] || ORIGIN_OPTIONS[0]}
                                                onChange={(e) => setSelectedOrigins({ ...selectedOrigins, [idx]: e.target.value })}
                                                className="input-field"
                                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', width: 'auto', minWidth: '220px' }}
                                            >
                                                {ORIGIN_OPTIONS.map((opt, i) => (
                                                    <option key={i} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleClassifyAnomaly(a, idx)}
                                                disabled={classifying[idx]}
                                                className="btn-primary"
                                                style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                                            >
                                                {classifying[idx] ? <Loader2 className="spin" size={14} /> : "Asignar Origen"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* KPI GRID - HIGH FIDELITY Z-PATTERN */}
            {kpis && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
                    
                    {/* KPI 1: Volumen Total Operado */}
                    <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Volumen Total Movido
                            </span>
                            <div style={{ background: 'var(--brand-indigo-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity color="#818CF8" size={18} />
                            </div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }} className="tabular-nums">
                                {formatCurrency(kpis.total_volume_ars)}
                            </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                            <span className="badge badge-indigo">Consolidado</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }} className="tabular-nums">
                                {kpis.tx_count} operaciones
                            </span>
                        </div>
                    </div>

                    {/* KPI 2: Compras Fiat (Egresos) */}
                    <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Compras Fiat (Egresos)
                            </span>
                            <div style={{ background: 'var(--accent-amber-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArrowDownRight color="#FBBF24" size={18} />
                            </div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#FBBF24', letterSpacing: '-0.02em' }} className="tabular-nums">
                                - {formatCurrency(kpis.total_buys_ars)}
                            </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                            <span className="badge badge-amber">Capital Invertido</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Costo base FIFO</span>
                        </div>
                    </div>

                    {/* KPI 3: Ventas Fiat (Ingresos) */}
                    <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Ventas Fiat (Ingresos)
                            </span>
                            <div style={{ background: 'var(--accent-emerald-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArrowUpRight color="#34D399" size={18} />
                            </div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#34D399', letterSpacing: '-0.02em' }} className="tabular-nums">
                                + {formatCurrency(kpis.total_sells_ars)}
                            </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                            <span className="badge badge-emerald">Flujo Realizado</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ingreso devengado</span>
                        </div>
                    </div>

                    {/* KPI 4: Spread Modal (Moda) */}
                    {modalSpread && (
                        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    Spread Más Frecuente
                                </span>
                                <div style={{ background: 'var(--brand-indigo-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Percent color="#818CF8" size={18} />
                                </div>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#818CF8', letterSpacing: '-0.02em' }} className="tabular-nums">
                                    +{modalSpread.modal_spread}%
                                </h3>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                                <span className="badge badge-indigo">Moda Estadística</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Margen típico</span>
                            </div>
                        </div>
                    )}

                    {/* KPI 5: Total Operaciones */}
                    <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Registros en Ledger
                            </span>
                            <div style={{ background: 'rgba(148, 163, 184, 0.12)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Layers color="#94A3B8" size={18} />
                            </div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }} className="tabular-nums">
                                {kpis.tx_count.toLocaleString()}
                            </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                            <span className="badge badge-slate">FIFO Estricto</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auditabilidad continua</span>
                        </div>
                    </div>

                </div>
            )}

            {/* EQUITY CURVE CHART (AREA WITH GRADIENT) */}
            <div className="card-surface" style={{ padding: '1.5rem', marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#818CF8' }} />
                            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#F8FAFC', fontWeight: 700 }}>
                                Curva de Equity (Ganancia Acumulada)
                            </h2>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                            Evolución continua del capital neto obtenido en pesos argentinos.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Intervalo:</span>
                        <select
                            value={equityInterval}
                            onChange={(e) => setEquityInterval(e.target.value)}
                            className="input-field"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', width: 'auto', fontWeight: 600 }}
                        >
                            <option value="daily">Diario</option>
                            <option value="weekly">Semanal</option>
                            <option value="monthly">Mensual</option>
                            <option value="yearly">Anual</option>
                        </select>
                    </div>
                </div>

                {equityCurve.length > 0 ? (
                    <div style={{ height: '320px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={equityCurve} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.35} />
                                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                                <XAxis dataKey="period" stroke="#64748B" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                <YAxis stroke="#64748B" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                <Tooltip content={<CustomAreaTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="equity"
                                    name="Capital Neto Acumulado (ARS)"
                                    stroke="#818CF8"
                                    strokeWidth={2.5}
                                    fill="url(#equityGradient)"
                                    activeDot={{ r: 6, fill: '#818CF8', stroke: '#090D14', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                            Sin datos suficientes para proyectar la curva de equity en el período seleccionado.
                        </p>
                    </div>
                )}
            </div>

            {/* CHARTS GRID (2 COLUMNS: VOLUME COMPARISON & EXCHANGE DISTRIBUTION) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                
                {/* BAR CHART: COMPRAS VS VENTAS */}
                <div className="card-surface" style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#F8FAFC', fontWeight: 700 }}>
                                Volumen de Compras vs Ventas (ARS)
                            </h2>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                            Comparativa de flujos operativos por fecha.
                        </p>
                    </div>

                    {dailyVol.length > 0 ? (
                        <div style={{ height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyVol} margin={{ top: 15, right: 15, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                                    <XAxis dataKey="day" stroke="#64748B" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <YAxis stroke="#64748B" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <Tooltip content={<CustomBarTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '12px', color: '#94A3B8', paddingTop: '10px' }} />
                                    <Bar dataKey="buys" name="Compras Fiat" fill="#10B981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="sells" name="Ventas Fiat" fill="#818CF8" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Sin datos diarios registrados.</p>
                        </div>
                    )}
                </div>

                {/* PIE / DONUT CHART: DISTRIBUCIÓN POR EXCHANGE */}
                <div className="card-surface" style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#06B6D4' }} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#F8FAFC', fontWeight: 700 }}>
                                Distribución por Plataforma / Exchange
                            </h2>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                            Concentración de volumen operado en pesos.
                        </p>
                    </div>

                    {exchangeDist.length > 0 ? (
                        <div style={{ height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={exchangeDist}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={85}
                                        paddingAngle={4}
                                        dataKey="value"
                                    >
                                        {exchangeDist.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="#121A2B" strokeWidth={2} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '12px', color: '#94A3B8', paddingTop: '10px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ padding: '3rem 1rem', textAlign: 'center', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Sin exchanges registrados.</p>
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
}

export default Dashboard;
