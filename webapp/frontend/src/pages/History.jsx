import React, { useState, useEffect, useMemo } from 'react';
import {
    Database, FileText, Calendar, Loader2, AlertTriangle, CheckSquare,
    ShieldCheck, Filter, Trash2, Sparkles, Copy, Check, Search, Download,
    ArrowUpRight, ArrowDownLeft, Layers, RefreshCw, X
} from 'lucide-react';
import axios from 'axios';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import config from '../config';
import { useNavigate } from 'react-router-dom';

function History() {
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState('transactions'); // 'transactions' or 'files'
    const [history, setHistory] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [gaps, setGaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'certified', 'uncertified'
    const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL', 'Compra', 'Venta'
    const [selectedExchange, setSelectedExchange] = useState('ALL');
    const [txSearch, setTxSearch] = useState('');
    const [copiedHash, setCopiedHash] = useState(null);
    const [downloadingFile, setDownloadingFile] = useState(null);
    const [deletingBatch, setDeletingBatch] = useState(null);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [hRes, gRes, tRes] = await Promise.all([
                axios.get(`${config.API_URL}/api/history`),
                axios.get(`${config.API_URL}/api/reports/gaps`),
                axios.get(`${config.API_URL}/api/transactions`)
            ]);
            setHistory(hRes.data || []);
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

    const deleteExchangeBatch = async (exchangeName) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar TODAS las transacciones de ${exchangeName}? Esta acción no se puede deshacer.`)) {
            return;
        }
        setDeletingBatch(exchangeName);
        try {
            const res = await axios.delete(`${config.API_URL}/api/history/exchange/${encodeURIComponent(exchangeName)}`);
            if (res.data && res.data.success) {
                alert(`Se eliminaron ${res.data.deleted_count} transacciones de ${exchangeName}.`);
                await fetchAllData();
            } else {
                alert("Error al eliminar los registros.");
            }
        } catch (err) {
            console.error("Error al eliminar intercambio", err);
            alert("Error de conexión al eliminar los registros.");
        } finally {
            setDeletingBatch(null);
        }
    };

    const downloadOriginal = async (filename) => {
        setDownloadingFile(filename);
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
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch {
            alert("Error al descargar. Archivo no encontrado en DB.");
        } finally {
            setDownloadingFile(null);
        }
    };

    const copyToClipboard = (text, id) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedHash(id);
        setTimeout(() => {
            setCopiedHash(null);
        }, 2000);
    };

    // Unique exchanges list from transactions
    const availableExchanges = useMemo(() => {
        const set = new Set();
        transactions.forEach(t => {
            const ex = t.exchange || t.Exchange;
            if (ex) set.add(ex);
        });
        return Array.from(set).sort();
    }, [transactions]);

    // Summary counts
    const allCount = transactions.length;
    const certifiedCount = transactions.filter(t => t.is_certified === 1).length;
    const uncertifiedCount = transactions.filter(t => t.is_certified !== 1).length;

    // Filtered transactions
    const filteredTxs = useMemo(() => {
        return transactions.filter(t => {
            // Legal filter
            if (statusFilter === 'certified' && t.is_certified !== 1) return false;
            if (statusFilter === 'uncertified' && t.is_certified === 1) return false;

            // Exchange filter
            const exch = (t.exchange || t.Exchange || '');
            if (selectedExchange !== 'ALL' && exch.toLowerCase() !== selectedExchange.toLowerCase()) {
                return false;
            }

            // Operation type filter
            const tipo = (t.tipo_operacion || t['Tipo de Operación'] || '');
            if (typeFilter !== 'ALL') {
                if (typeFilter === 'Compra' && !tipo.toLowerCase().includes('compra') && !tipo.toLowerCase().includes('buy')) return false;
                if (typeFilter === 'Venta' && !tipo.toLowerCase().includes('venta') && !tipo.toLowerCase().includes('sell')) return false;
            }

            // Search query
            if (!txSearch.trim()) return true;
            const q = txSearch.toLowerCase();
            const mon = (t.moneda || t.Moneda || '').toLowerCase();
            const fec = (t.fecha || t.Fecha || '').toLowerCase();
            const hash = (t.tx_hash || t.id || t.order_id || t['ID Transacción'] || '').toLowerCase();

            return exch.toLowerCase().includes(q) ||
                mon.includes(q) ||
                tipo.toLowerCase().includes(q) ||
                fec.includes(q) ||
                hash.includes(q);
        });
    }, [transactions, statusFilter, selectedExchange, typeFilter, txSearch]);

    // Financial totals of filtered items
    const filteredTotalARS = useMemo(() => {
        return filteredTxs.reduce((acc, t) => acc + (Number(t.monto_ars ?? t['Monto ARS'] ?? 0) || 0), 0);
    }, [filteredTxs]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 2
        }).format(val || 0);
    };

    const formatCryptoQty = (qty) => {
        if (qty === undefined || qty === null || qty === '') return '-';
        const num = Number(qty);
        if (isNaN(num)) return qty;
        return num.toLocaleString('es-AR', { maximumFractionDigits: 8 });
    };

    if (loading) {
        return (
            <div style={{ padding: '3rem', maxWidth: '1400px', margin: '0 auto', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <RefreshCw size={36} className="spin" style={{ color: 'var(--brand-indigo-light)', marginBottom: '1rem' }} />
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0 }}>Cargando historial de transacciones...</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Recuperando registros auditados y estado de consistencia FIFO.</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '1.75rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header with Title & View Switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: 'var(--brand-indigo-subtle)',
                            border: '1px solid var(--brand-indigo-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--brand-indigo-light)'
                        }}>
                            <Database size={20} />
                        </div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F8FAFC', margin: 0, letterSpacing: '-0.02em' }}>
                            Historial & Respaldo Legal de Operaciones
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.35rem 0 0 0', fontSize: '0.88rem', paddingLeft: '2.85rem' }}>
                        Historial contable: transacciones auditadas por Certificación C.P.N. vs operaciones provisorias en vivo.
                    </p>
                </div>

                {/* View Mode Segmented Switch */}
                <div style={{
                    display: 'inline-flex',
                    background: '#0D131F',
                    padding: '0.25rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <button
                        onClick={() => setViewMode('transactions')}
                        style={{
                            padding: '0.45rem 0.95rem',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: viewMode === 'transactions' ? 'var(--brand-indigo)' : 'transparent',
                            color: viewMode === 'transactions' ? '#FFFFFF' : 'var(--text-secondary)',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <Layers size={14} />
                        Detalle de Transacciones ({transactions.length})
                    </button>
                    <button
                        onClick={() => setViewMode('files')}
                        style={{
                            padding: '0.45rem 0.95rem',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: viewMode === 'files' ? 'var(--brand-indigo)' : 'transparent',
                            color: viewMode === 'files' ? '#FFFFFF' : 'var(--text-secondary)',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <FileText size={14} />
                        Archivos por Exchange ({history.length})
                    </button>
                </div>
            </div>

            {/* FIFO Gaps Alert Notification */}
            {gaps && gaps.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.05))',
                    border: '1px solid var(--accent-amber-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0.9rem 1.25rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            background: 'var(--accent-amber-subtle)',
                            padding: '0.45rem',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--accent-amber-light)',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.92rem', color: '#FDE68A', fontWeight: 700 }}>
                                Se detectaron {gaps.length} faltante(s) de historial (huecos FIFO)
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                Faltan comprobantes de compra para calcular el costo de adquisición de forma exacta.
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/calendar?tab=warnings')}
                        style={{
                            background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.5rem 1rem',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                            transition: 'all 150ms ease'
                        }}
                    >
                        <Sparkles size={15} /> Resolver en Calendario →
                    </button>
                </div>
            )}

            {viewMode === 'transactions' ? (
                <div>
                    {/* KPI Quick Banner */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1.25rem'
                    }}>
                        <div className="card-surface" style={{ padding: '0.85rem 1.15rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Total Registros
                            </span>
                            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F8FAFC', marginTop: '0.2rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                {filteredTxs.length} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>de {allCount}</span>
                            </div>
                        </div>

                        <div className="card-surface" style={{ padding: '0.85rem 1.15rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Volumen Filtrado (ARS)
                            </span>
                            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--brand-indigo-light)', marginTop: '0.2rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                {formatCurrency(filteredTotalARS)}
                            </div>
                        </div>

                        <div className="card-surface" style={{ padding: '0.85rem 1.15rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Auditado vs Provisorio
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                                <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                                    <ShieldCheck size={12} /> {certifiedCount} C.P.N.
                                </span>
                                <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                                    {uncertifiedCount} Provisorias
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Filter & Search Bar with Minimalist Chips */}
                    <div className="card-surface" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {/* Search row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar por exchange, criptomoneda (BTC, USDT), hash o fecha..."
                                    value={txSearch}
                                    onChange={(e) => setTxSearch(e.target.value)}
                                    className="input-field"
                                    style={{ paddingLeft: '2.35rem', paddingRight: txSearch ? '2rem' : '0.875rem' }}
                                />
                                {txSearch && (
                                    <button
                                        onClick={() => setTxSearch('')}
                                        style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        title="Limpiar búsqueda"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Legal Layer Status Filter Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginRight: '0.2rem' }}>
                                    Respaldo:
                                </span>
                                <button
                                    onClick={() => setStatusFilter('all')}
                                    className={`chip ${statusFilter === 'all' ? 'active' : ''}`}
                                >
                                    Todas ({allCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('certified')}
                                    className={`chip ${statusFilter === 'certified' ? 'active-emerald' : ''}`}
                                >
                                    <ShieldCheck size={13} /> Certificadas ({certifiedCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('uncertified')}
                                    className={`chip ${statusFilter === 'uncertified' ? 'active-amber' : ''}`}
                                >
                                    Provisorias ({uncertifiedCount})
                                </button>
                            </div>
                        </div>

                        {/* Secondary Filter Chips Row: Exchanges & Type */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border-subtle)' }}>
                            {/* Exchange Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    Exchange:
                                </span>
                                <button
                                    onClick={() => setSelectedExchange('ALL')}
                                    className={`chip ${selectedExchange === 'ALL' ? 'active' : ''}`}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                                >
                                    Todos
                                </button>
                                {availableExchanges.map(ex => (
                                    <button
                                        key={ex}
                                        onClick={() => setSelectedExchange(ex)}
                                        className={`chip ${selectedExchange === ex ? 'active' : ''}`}
                                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>

                            {/* Type Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    Tipo:
                                </span>
                                <button
                                    onClick={() => setTypeFilter('ALL')}
                                    className={`chip ${typeFilter === 'ALL' ? 'active' : ''}`}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                                >
                                    Todos
                                </button>
                                <button
                                    onClick={() => setTypeFilter('Compra')}
                                    className={`chip ${typeFilter === 'Compra' ? 'active-emerald' : ''}`}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                                >
                                    <ArrowDownLeft size={12} /> Compras
                                </button>
                                <button
                                    onClick={() => setTypeFilter('Venta')}
                                    className={`chip ${typeFilter === 'Venta' ? 'active-amber' : ''}`}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                                >
                                    <ArrowUpRight size={12} /> Ventas
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Dense Accounting Table with Sticky Header */}
                    <div className="sticky-table-container">
                        <table className="table-ledger">
                            <thead>
                                <tr>
                                    <th style={{ width: '135px' }}>Fecha & Hora</th>
                                    <th style={{ width: '110px' }}>Exchange</th>
                                    <th style={{ width: '90px' }}>Tipo</th>
                                    <th style={{ width: '80px' }}>Moneda</th>
                                    <th style={{ textAlign: 'right', width: '130px' }}>Cantidad</th>
                                    <th style={{ textAlign: 'right', width: '150px' }}>Monto (ARS)</th>
                                    <th style={{ width: '150px' }}>Hash / Referencia</th>
                                    <th style={{ textAlign: 'center', width: '140px' }}>Capa Legal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTxs.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <Filter size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                                            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                No se encontraron transacciones
                                            </div>
                                            <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                                                Probá ajustando los filtros de búsqueda, exchange o capa de certificación.
                                            </div>
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
                                        const rawQty = t.monto_compra_cripto || t.monto_venta_cripto || t.cantidad || t.Cantidad || '';
                                        const txHash = t.tx_hash || t.id || t.order_id || t['ID Transacción'] || (t.hash ? t.hash : `tx_${idx}_${moneda}`);
                                        const shortHash = txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : '-';
                                        const isBuy = tipo.toLowerCase().includes('compra') || tipo.toLowerCase().includes('buy');
                                        const isCopied = copiedHash === `hash-${idx}`;

                                        return (
                                            <tr
                                                key={idx}
                                                style={{
                                                    backgroundColor: isCert ? 'rgba(16, 185, 129, 0.02)' : 'transparent'
                                                }}
                                            >
                                                {/* Date */}
                                                <td style={{ whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--text-primary)' }} className="font-mono">
                                                    {fecha}
                                                </td>

                                                {/* Exchange */}
                                                <td>
                                                    <span className="badge badge-indigo" style={{ fontSize: '0.72rem' }}>
                                                        {exchange}
                                                    </span>
                                                </td>

                                                {/* Type */}
                                                <td>
                                                    <span
                                                        className={isBuy ? 'badge badge-emerald' : 'badge badge-rose'}
                                                        style={{ fontSize: '0.72rem' }}
                                                    >
                                                        {isBuy ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                                                        {tipo}
                                                    </span>
                                                </td>

                                                {/* Coin */}
                                                <td>
                                                    <span style={{ fontWeight: 700, color: '#F1F5F9' }}>
                                                        {moneda}
                                                    </span>
                                                </td>

                                                {/* Crypto Qty (Right Aligned, Monospace) */}
                                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }} className="font-mono">
                                                    {formatCryptoQty(rawQty)}
                                                </td>

                                                {/* ARS Amount (Right Aligned, Monospace) */}
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: '#F8FAFC' }} className="font-mono">
                                                    {formatCurrency(montoArs)}
                                                </td>

                                                {/* Truncated Hash with Monospace & Copy Button */}
                                                <td>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        <span
                                                            className="font-mono"
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                color: 'var(--text-muted)',
                                                                background: 'rgba(255, 255, 255, 0.04)',
                                                                padding: '0.15rem 0.4rem',
                                                                borderRadius: 'var(--radius-sm)',
                                                                border: '1px solid var(--border-subtle)'
                                                            }}
                                                            title={txHash}
                                                        >
                                                            {shortHash}
                                                        </span>
                                                        <button
                                                            className="btn-copy"
                                                            onClick={() => copyToClipboard(txHash, `hash-${idx}`)}
                                                            title="Copiar Hash / Identificador completo"
                                                        >
                                                            {isCopied ? <Check size={12} color="#34D399" /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Legal Layer Badge */}
                                                <td style={{ textAlign: 'center' }}>
                                                    {isCert ? (
                                                        <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                                                            <ShieldCheck size={12} /> Certificado C.P.N.
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
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

                    {/* Table Footer Stats */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', padding: '0 0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span>
                            Mostrando <strong>{filteredTxs.length}</strong> de <strong>{allCount}</strong> operaciones
                        </span>
                        <span>
                            Historial sincronizado con SQLite local
                        </span>
                    </div>
                </div>
            ) : (
                /* Files per Exchange View */
                <div>
                    {history.length === 0 ? (
                        <div className="card-surface" style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <FileText size={42} style={{ margin: '0 auto 1rem', opacity: 0.6, color: 'var(--brand-indigo-light)' }} />
                            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>No hay archivos procesados</h3>
                            <p style={{ fontSize: '0.88rem', margin: '0 0 1.25rem' }}>Importá planillas CSV o Excel desde la sección de Inicio o sincronizá tus APIs.</p>
                            <button onClick={() => navigate('/')} className="btn-primary">
                                Ir a Cargar Archivos →
                            </button>
                        </div>
                    ) : (
                        <div className="sticky-table-container">
                            <table className="table-ledger">
                                <thead>
                                    <tr>
                                        <th>Archivo Origen</th>
                                        <th>Exchange / Fuente</th>
                                        <th style={{ textAlign: 'center' }}>Registros</th>
                                        <th style={{ textAlign: 'right' }}>Rango Temporal Cubierto</th>
                                        <th style={{ textAlign: 'center', width: '220px' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item, idx) => (
                                        <motion.tr
                                            key={idx}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                        >
                                            <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                <FileText size={16} color="var(--brand-indigo-light)" style={{ flexShrink: 0 }} />
                                                <span style={{ wordBreak: 'break-all' }}>{item.filename}</span>
                                            </td>
                                            <td>
                                                <span className="badge badge-indigo" style={{ fontSize: '0.72rem' }}>
                                                    {item.exchange}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700 }} className="font-mono">
                                                {item.count}
                                            </td>
                                            <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)' }} className="font-mono">
                                                {item.date_range}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn-secondary"
                                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                                                        onClick={() => downloadOriginal(item.filename)}
                                                        disabled={downloadingFile === item.filename}
                                                    >
                                                        {downloadingFile === item.filename ? (
                                                            <RefreshCw size={12} className="spin" />
                                                        ) : (
                                                            <Download size={12} />
                                                        )}
                                                        Descargar
                                                    </button>
                                                    <button
                                                        style={{
                                                            padding: '0.35rem 0.75rem',
                                                            fontSize: '0.75rem',
                                                            background: 'var(--accent-rose-subtle)',
                                                            color: 'var(--accent-rose-light)',
                                                            border: '1px solid var(--accent-rose-border)',
                                                            borderRadius: 'var(--radius-md)',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            transition: 'all 150ms ease'
                                                        }}
                                                        onClick={() => deleteExchangeBatch(item.exchange)}
                                                        disabled={deletingBatch === item.exchange}
                                                    >
                                                        {deletingBatch === item.exchange ? (
                                                            <RefreshCw size={12} className="spin" />
                                                        ) : (
                                                            <Trash2 size={12} />
                                                        )}
                                                        Eliminar Lote
                                                    </button>
                                                </div>
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
