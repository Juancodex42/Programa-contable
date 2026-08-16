import { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';
import { Link } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Layers, Loader2, AlertTriangle, Percent, Calendar, Filter, RefreshCw, CheckSquare, Square } from 'lucide-react';

const COLORS = ['#60a5fa', '#c084fc', '#34d399', '#fbbf24', '#f87171', '#818cf8'];

const ORIGIN_OPTIONS = [
    'Capital Inicial / Años Anteriores',
    'Exchange Externo / Billetera Fría',
    'P2P / Efectivo'
];

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
        if (val === undefined || val === null) return "$0,00";
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.2rem 1.5rem' }}>
            {/* HEADER */}
            <header style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#f8fafc' }}>
                        Panel Analítico
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.2rem 0 0 0', fontSize: '0.95rem' }}>
                        Métricas de rendimiento, curva de equity y conciliación de trazabilidad.
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="btn-primary"
                    style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: 600, borderRadius: '8px' }}
                >
                    <RefreshCw size={18} className={loading ? "spin" : ""} /> Actualizar Datos
                </button>
            </header>

            {gaps && gaps.length > 0 && (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#fde68a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={18} color="#f59e0b" /> Advertencia: Faltantes de Historial (Huecos)
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        Se detectaron ventas de criptomonedas sin compras previas registradas. El balance del panel analítico podría ser incorrecto.
                        <ul style={{ margin: '0.2rem 0 0.4rem 0', paddingLeft: '1.2rem' }}>
                            {gaps.slice(0, 3).map((gap, idx) => (
                                <li key={idx}>
                                    <strong>{gap.exchange}:</strong> Venta de {gap.sold_qty} {gap.coin} el {gap.date.split(' ')[0]} (Falta comprar {gap.deficit.toFixed(4)} {gap.coin}).
                                </li>
                            ))}
                            {gaps.length > 3 && <li>... y {gaps.length - 3} inconsistencias más.</li>}
                        </ul>
                        <Link to="/" style={{ color: '#38bdf8', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            Ir a Inicio para cargar archivos de compras →
                        </Link>
                    </span>
                </div>
            )}

            {/* LEGAL COVERAGE & CERTIFICATION BACKING BANNER */}
            {kpis && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95))',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '0.85rem',
                    padding: '1rem 1.4rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '10px',
                            background: 'rgba(56, 189, 248, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(56, 189, 248, 0.3)'
                        }}>
                            <CheckSquare size={26} color="#38bdf8" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Respaldo Contable Legal (Certificaciones C.P.N.)
                                <span style={{
                                    fontSize: '0.75rem',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '12px',
                                    background: kpis.certified_pct > 50 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                                    color: kpis.certified_pct > 50 ? '#34d399' : '#fbbf24',
                                    border: `1px solid ${kpis.certified_pct > 50 ? '#34d399' : '#fbbf24'}`,
                                    fontWeight: 700
                                }}>
                                    {kpis.certified_pct}% Auditado
                                </span>
                            </div>
                            <div style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                {kpis.certified_count > 0 ? (
                                    <>Volumen Auditado: <strong style={{ color: '#38bdf8' }}>${(kpis.certified_volume_ars || 0).toLocaleString()} ARS</strong> ({kpis.certified_count} txs) • Provisorio al Día: <strong style={{ color: '#fbbf24' }}>${(kpis.provisional_volume_ars || 0).toLocaleString()} ARS</strong> ({kpis.provisional_count} txs)</>
                                ) : (
                                    <>Aún no hay transacciones auditadas por certificación en este filtro. Regístrala en Calendario.</>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Capa:</span>
                        <button
                            onClick={() => setStatusFilter('all')}
                            style={{
                                padding: '0.4rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                border: statusFilter === 'all' ? '1px solid #38bdf8' : '1px solid #334155',
                                background: statusFilter === 'all' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                                color: statusFilter === 'all' ? '#e0f2fe' : '#94a3b8',
                                cursor: 'pointer'
                            }}
                        >
                            Consolidado (Todos)
                        </button>
                        <button
                            onClick={() => setStatusFilter('certified')}
                            style={{
                                padding: '0.4rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                border: statusFilter === 'certified' ? '1px solid #34d399' : '1px solid #334155',
                                background: statusFilter === 'certified' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                                color: statusFilter === 'certified' ? '#a7f3d0' : '#94a3b8',
                                cursor: 'pointer'
                            }}
                        >
                            Verdad Legal (Certificado)
                        </button>
                        <button
                            onClick={() => setStatusFilter('uncertified')}
                            style={{
                                padding: '0.4rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                border: statusFilter === 'uncertified' ? '1px solid #fbbf24' : '1px solid #334155',
                                background: statusFilter === 'uncertified' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                                color: statusFilter === 'uncertified' ? '#fef3c7' : '#94a3b8',
                                cursor: 'pointer'
                            }}
                        >
                            Provisorio (Al Día)
                        </button>
                    </div>
                </div>
            )}

            {/* FILTER PANEL */}
            <div className="glass-card" style={{ padding: '1rem 1.2rem', marginBottom: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '1rem', minWidth: '180px' }}>
                        <Filter size={20} />
                        <span>Filtros de Análisis</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                        {/* Dates */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                <Calendar size={15} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} /> Desde:
                            </span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{
                                    padding: '0.45rem 0.7rem',
                                    borderRadius: '6px',
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    border: '1px solid #334155',
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    fontWeight: 500
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                <Calendar size={15} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} /> Hasta:
                            </span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{
                                    padding: '0.45rem 0.7rem',
                                    borderRadius: '6px',
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    border: '1px solid #334155',
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    fontWeight: 500
                                }}
                            />
                        </div>

                        {/* Exchanges */}
                        {availableExchanges.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Exchanges:</span>
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
                                                padding: '0.35rem 0.7rem',
                                                borderRadius: '6px',
                                                border: isChecked ? '1px solid #38bdf8' : '1px solid #334155',
                                                background: isChecked ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                                                color: isChecked ? '#e0f2fe' : 'var(--text-secondary)',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {isChecked ? <CheckSquare size={15} color="#38bdf8" /> : <Square size={15} />}
                                            <span>{exch}</span>
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={handleSelectAllExchanges}
                                    style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline', fontWeight: 600 }}
                                >
                                    {selectedExchanges.length === availableExchanges.length ? 'Desmarcar' : 'Todos'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* INTEGRITY ALERTS */}
            {anomalies.length > 0 && (
                <div style={{ marginBottom: '1.5rem', padding: '1rem 1.2rem', background: 'rgba(248, 113, 113, 0.1)', borderLeft: '4px solid #f87171', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.6rem' }}>
                        <AlertTriangle color="#f87171" size={24} />
                        <h3 style={{ color: '#f87171', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                            Conciliación de Fondos sin Origen Registrado ({anomalies.length})
                        </h3>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '0.8rem' }}>
                        Se detectaron ventas de criptomonedas cuyo ingreso no figura en los archivos cargados. Clasifica la procedencia real de los fondos:
                    </p>
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                        {anomalies.map((a, idx) => (
                            <div key={idx} style={{ padding: '0.7rem 1rem', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '6px', fontSize: '0.9rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                                <div>
                                    <strong style={{ color: '#fbbf24', fontSize: '0.95rem' }}>{a.date} | {a.exchange}</strong>
                                    <span style={{ marginLeft: '0.8rem', color: '#f8fafc', fontWeight: 600 }}>
                                        Faltan justificar <span style={{ color: '#38bdf8' }}>{a.missing} {a.crypto}</span>
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                    <select
                                        value={selectedOrigins[idx] || ORIGIN_OPTIONS[0]}
                                        onChange={(e) => setSelectedOrigins({ ...selectedOrigins, [idx]: e.target.value })}
                                        style={{
                                            padding: '0.45rem 0.7rem',
                                            borderRadius: '6px',
                                            background: '#0f172a',
                                            border: '1px solid #334155',
                                            color: '#fff',
                                            fontSize: '0.85rem',
                                            fontWeight: 500
                                        }}
                                    >
                                        {ORIGIN_OPTIONS.map((opt, i) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleClassifyAnomaly(a, idx)}
                                        disabled={classifying[idx]}
                                        className="btn-primary"
                                        style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', fontWeight: 600 }}
                                    >
                                        {classifying[idx] ? <Loader2 className="spin" size={16} /> : "Clasificar Origen"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* KPI GRID - COMPACT & PROPORTIONAL */}
            {kpis && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {/* KPI 1 */}
                    <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.8rem' }}>
                        <div style={{ background: 'rgba(96, 165, 250, 0.15)', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Activity color="#60a5fa" size={20} />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.2rem 0', fontWeight: 600 }}>Volumen Total Movido</p>
                            <h3 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em', wordBreak: 'break-all' }}>{formatCurrency(kpis.total_volume_ars)}</h3>
                        </div>
                    </div>

                    {/* KPI 2 */}
                    <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.8rem' }}>
                        <div style={{ background: 'rgba(52, 211, 153, 0.15)', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingUp color="#34d399" size={20} />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.2rem 0', fontWeight: 600 }}>Compras Fiat (Egreso)</p>
                            <h3 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800, color: '#34d399', letterSpacing: '-0.01em', wordBreak: 'break-all' }}>{formatCurrency(kpis.total_buys_ars)}</h3>
                        </div>
                    </div>

                    {/* KPI 3 */}
                    <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.8rem' }}>
                        <div style={{ background: 'rgba(248, 113, 113, 0.15)', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingDown color="#f87171" size={20} />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.2rem 0', fontWeight: 600 }}>Ventas Fiat (Ingreso)</p>
                            <h3 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800, color: '#f87171', letterSpacing: '-0.01em', wordBreak: 'break-all' }}>{formatCurrency(kpis.total_sells_ars)}</h3>
                        </div>
                    </div>

                    {/* KPI 4 - SPREAD MODA */}
                    {modalSpread && (
                        <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.8rem' }}>
                            <div style={{ background: 'rgba(251, 191, 36, 0.15)', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Percent color="#fbbf24" size={20} />
                            </div>
                            <div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.2rem 0', fontWeight: 600 }}>Spread Más Repetido (Moda)</p>
                                <h3 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.01em' }}>+{modalSpread.modal_spread}%</h3>
                            </div>
                        </div>
                    )}

                    {/* KPI 5 */}
                    <div className="glass-card" style={{ padding: '1.2rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.8rem' }}>
                        <div style={{ background: 'rgba(192, 132, 252, 0.15)', padding: '0.6rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers color="#c084fc" size={20} />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.2rem 0', fontWeight: 600 }}>Total Operaciones</p>
                            <h3 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>{kpis.tx_count}</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* EQUITY CURVE CHART */}
            <div className="glass-card" style={{ padding: '1.2rem 1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                            Curva de Equity (Ganancia Acumulada)
                        </h2>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0.1rem 0 0 0' }}>
                            Evolución continua del capital neto obtenido en pesos.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Segmentar por:</span>
                        <select
                            value={equityInterval}
                            onChange={(e) => setEquityInterval(e.target.value)}
                            style={{
                                padding: '0.45rem 0.8rem',
                                borderRadius: '6px',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                color: '#38bdf8',
                                fontWeight: 'bold',
                                fontSize: '0.9rem',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="daily">Diario</option>
                            <option value="weekly">Semanal</option>
                            <option value="monthly">Mensual</option>
                            <option value="yearly">Anual</option>
                        </select>
                    </div>
                </div>

                {equityCurve.length > 0 ? (
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={equityCurve} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                                <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.9rem' }}
                                    formatter={(value) => [formatCurrency(value), "Equity Acumulado"]}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.9rem' }} />
                                <Line type="monotone" dataKey="equity" name="Capital Neto Acumulado (ARS)" stroke="#38bdf8" strokeWidth={3} dot={false} activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', border: '1px stroke #334155' }}>
                        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>Sin datos suficientes para proyectar la curva de equity en el período seleccionado.</p>
                    </div>
                )}
            </div>

            {/* CHARTS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                {/* SEPARATED BAR CHART */}
                <div className="glass-card" style={{ padding: '1.2rem 1.5rem' }}>
                    <h2 style={{ margin: '0 0 0.2rem 0', fontSize: '1.2rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                        Volumen de Compras vs Ventas (ARS)
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>Comparativa de flujos operativos por fecha.</p>
                    {dailyVol.length > 0 ? (
                        <div style={{ height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyVol} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                                    <YAxis stroke="#94a3b8" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.9rem' }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.9rem' }} />
                                    <Bar dataKey="buys" name="Compras Fiat" fill="#34d399" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="sells" name="Ventas Fiat" fill="#c084fc" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px' }}>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>Sin datos diarios registrados para mostrar.</p>
                        </div>
                    )}
                </div>

                {/* PIE CHART */}
                <div className="glass-card" style={{ padding: '1.2rem 1.5rem' }}>
                    <h2 style={{ margin: '0 0 0.2rem 0', fontSize: '1.2rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                        Distribución Exchange
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>Volumen por plataforma</p>

                    {exchangeDist.length > 0 ? (
                        <div style={{ height: '260px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={exchangeDist}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {exchangeDist.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.9rem' }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px' }}>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>Sin exchanges registrados.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
