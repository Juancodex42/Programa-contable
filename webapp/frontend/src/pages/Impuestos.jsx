import React, { useState, useEffect } from 'react';
import {
  Calculator, Settings as SettingsIcon, ShieldCheck, TrendingUp,
  DollarSign, FileText, ChevronDown, Check, RefreshCw, AlertCircle, Layers, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import config from '../config';
import { Link } from 'react-router-dom';

const API_BASE = `${config.API_URL}/api`;

const Impuestos = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState({
    year: new Date().getFullYear(),
    ganancias_deduccion: 0,
    ganancias_alicuota: 15,
    iibb_tramo1_limite: 3255000000,
    iibb_tramo1_alicuota: 5.0,
    iibb_tramo2_limite: 26970000000,
    iibb_tramo2_alicuota: 6.0,
    iibb_tramo3_alicuota: 7.0,
    iibb_base_calculo: 'diferencial',
    iibb_provincia: 'Catamarca',
    ganancias_estimadas_fallback_pct: 15.0,
    usd_ars_exchange_rate: 1000.0
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [gaps, setGaps] = useState([]);

  const fetchTaxReport = async (year) => {
    setLoading(true);
    try {
      const [taxRes, gapsRes] = await Promise.all([
        fetch(`${API_BASE}/taxes/report?year=${year}`),
        fetch(`${config.API_URL}/api/reports/gaps`).catch(() => ({ json: () => ({ gaps: [] }) }))
      ]);
      
      const data = await taxRes.json();
      let gapsData = { gaps: [] };
      try {
        gapsData = await gapsRes.json();
      } catch (e) {
        gapsData = gapsRes.data || { gaps: [] };
      }
      
      setReport(data);
      setGaps(gapsData.gaps || []);
      
      if (data.settings) {
        setSettingsForm(data.settings);
      }
    } catch (err) {
      console.error('Error fetching tax report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxReport(selectedYear);
  }, [selectedYear]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch(`${API_BASE}/taxes/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      });
      if (res.ok) {
        setShowConfigModal(false);
        fetchTaxReport(selectedYear);
      }
    } catch (err) {
      console.error('Error saving tax settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const formatARS = (val) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2
    }).format(val || 0);
  };

  const tramo1Pct = report && report.settings.iibb_tramo1_limite > 0
    ? Math.min(100, (report.total_sells_ars / report.settings.iibb_tramo1_limite) * 100)
    : 0;

  return (
    <div style={{ padding: '2rem', color: '#f8fafc', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <Calculator size={32} color="#38bdf8" /> Módulo de Impuestos (IMP)
          </h1>
          <p style={{ color: '#94a3b8', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>
            Liquidación estimada para Declaración Jurada (DDJJ) - Argentina / {report ? report.settings.iibb_provincia : 'Catamarca'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Year selector */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(30, 41, 59, 0.8)', padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', marginRight: '0.5rem' }}>Ejercicio Fiscal:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{ background: 'transparent', color: '#38bdf8', border: 'none', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', outline: 'none' }}
            >
              {Array.from({ length: (new Date().getFullYear() + 5) - 2020 + 1 }, (_, i) => 2020 + i).map((yr) => (
                <option key={yr} value={yr} style={{ background: '#1e293b', color: 'white' }}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowConfigModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: 'white', border: 'none', padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)', transition: 'all 0.2s'
            }}
          >
            <SettingsIcon size={18} /> Configurar Umbrales y Alícuotas
          </button>

          <button
            onClick={() => fetchTaxReport(selectedYear)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'rgba(30, 41, 59, 0.8)', color: '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1rem',
              borderRadius: '0.5rem', cursor: 'pointer'
            }}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <RefreshCw size={40} color="#06b6d4" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Calculando liquidación impositiva para {selectedYear}...</p>
        </div>
      ) : report ? (
        <>
          {gaps && gaps.length > 0 && (
            <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.9rem', color: '#fde68a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={18} color="#f59e0b" /> Advertencia de Liquidación: Historial Incompleto
              </span>
              <span style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                Faltan registrar compras en tu historial. El impuesto calculado a continuación asume un **costo de adquisición de $0.0** para las porciones de venta huérfanas, lo que **aumenta la base imponible y el impuesto resultante**.
                <ul style={{ margin: '0.2rem 0 0.4rem 0', paddingLeft: '1.2rem' }}>
                  {gaps.slice(0, 3).map((gap, idx) => (
                    <li key={idx}>
                      <strong>{gap.exchange}:</strong> Venta de {gap.sold_qty} {gap.coin} el {gap.date.split(' ')[0]} (Faltan comprar {gap.deficit.toFixed(4)} {gap.coin}).
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
          {/* Main KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>

            {/* Total Sells Card */}
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <span>Ventas Brutas Anuales</span>
                <DollarSign size={18} color="#38bdf8" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#f8fafc' }}>
                {formatARS(report.total_sells_ars)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Compras Brutas: {formatARS(report.total_buys_ars)}
              </div>
            </div>

            {/* Ganancia Neta Card */}
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <span>Ganancia Neta (PnL Realizado)</span>
                <TrendingUp size={18} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '700', color: report.ganancia_neta >= 0 ? '#10b981' : '#ef4444' }}>
                {formatARS(report.ganancia_neta)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                Base Imponible Impositiva
              </div>
            </div>

            {/* Impuesto Ganancias / Cedular Card */}
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f59e0b', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                <span>Impuesto Cedular / Ganancias</span>
                <ShieldCheck size={18} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#fbbf24' }}>
                {formatARS(report.impuesto_ganancias)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                Alícuota: <strong>{report.settings.ganancias_alicuota}%</strong> | Deducción: {formatARS(report.settings.ganancias_deduccion)}
              </div>
            </div>

            {/* IIBB Card */}
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', backdropFilter: 'blur(12px)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c084fc', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                <span>IIBB {report ? report.settings.iibb_provincia : 'Catamarca'} (Estimado)</span>
                <Layers size={18} color="#c084fc" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#e9d5ff' }}>
                {formatARS(report.impuesto_iibb)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                Tramo <strong>#{report.tramo_iibb}</strong> ({report.alicuota_iibb}%) | Base: {report.settings.iibb_base_calculo === 'diferencial' ? 'Ganancia' : 'Ventas'}
              </div>
            </div>

          </div>

          {/* IIBB Threshold Visualizer */}
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={20} color="#a855f7" /> Monitor de Tramos de Ingresos Brutos (Catamarca {selectedYear})
            </h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              <span>Ventas Actuales: <strong>{formatARS(report.total_sells_ars)}</strong></span>
              <span>Límite Tramo 1: <strong>{formatARS(report.settings.iibb_tramo1_limite)}</strong></span>
            </div>

            <div style={{ width: '100%', height: '12px', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
              <div
                style={{
                  width: `${Math.min(100, tramo1Pct)}%`,
                  height: '100%',
                  background: tramo1Pct < 80 ? 'linear-gradient(90deg, #10b981, #06b6d4)' : 'linear-gradient(90deg, #f59e0b, #ef4444)',
                  transition: 'width 0.8s ease-in-out'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
              <span>Tramo 1 (Hasta {formatARS(report.settings.iibb_tramo1_limite)} - {report.settings.iibb_tramo1_alicuota}%)</span>
              <span>Tramo 2 (Hasta {formatARS(report.settings.iibb_tramo2_limite)} - {report.settings.iibb_tramo2_alicuota}%)</span>
              <span>Tramo 3 (&gt; {formatARS(report.settings.iibb_tramo2_limite)} - {report.settings.iibb_tramo3_alicuota}%)</span>
            </div>
          </div>

          {/* Monthly Breakdown Table */}
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.75rem', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#e2e8f0', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} color="#06b6d4" /> Desglose Mensual para Declaración Jurada
            </h3>

            {report.monthly_data.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
                No se registraron operaciones para el año {selectedYear}.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Período</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Compras (ARS)</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Ventas (ARS)</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Ganancia Neta</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Est. Ganancias</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Est. IIBB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthly_data.map((m, idx) => {
                      const m_base_iibb = report.settings.iibb_base_calculo === 'diferencial' ? m.pnl_ars : m.sells_ars;
                      const m_iibb = Math.max(0, m_base_iibb * (report.alicuota_iibb / 100));
                      const m_ganancias = Math.max(0, m.pnl_ars * (report.settings.ganancias_alicuota / 100));

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: '600', color: '#38bdf8' }}>{m.month}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>{formatARS(m.buys_ars)}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>{formatARS(m.sells_ars)}</td>
                          <td style={{ padding: '0.75rem 1rem', color: m.pnl_ars >= 0 ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                            {formatARS(m.pnl_ars)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#f59e0b' }}>{formatARS(m_ganancias)}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#c084fc' }}>{formatARS(m_iibb)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Config Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '1rem', width: '100%', maxWidth: '650px',
                padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.3rem', color: '#38bdf8', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <SettingsIcon size={22} /> Parámetros Fiscales ({settingsForm.year})
                </h2>
                <button
                  onClick={() => setShowConfigModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveSettings}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

                  {/* General Config Section */}
                  <div style={{ gridColumn: 'span 2', background: 'rgba(30, 41, 59, 0.5)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                    <h4 style={{ color: '#38bdf8', margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>Configuración General</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Tipo de Cambio USD/ARS ($)</label>
                        <input
                          type="number"
                          value={settingsForm.usd_ars_exchange_rate}
                          onChange={(e) => setSettingsForm({ ...settingsForm, usd_ars_exchange_rate: Number(e.target.value) })}
                          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Margen Estimación Fallback (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={settingsForm.ganancias_estimadas_fallback_pct}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ganancias_estimadas_fallback_pct: Number(e.target.value) })}
                          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ganancias Section */}
                  <div style={{ gridColumn: 'span 2', background: 'rgba(30, 41, 59, 0.5)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <h4 style={{ color: '#f59e0b', margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>Impuesto Cedular / Ganancias</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Deducción / Umbral ($)</label>
                        <input
                          type="number"
                          value={settingsForm.ganancias_deduccion}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ganancias_deduccion: Number(e.target.value) })}
                          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Alícuota (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={settingsForm.ganancias_alicuota}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ganancias_alicuota: Number(e.target.value) })}
                          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* IIBB Section */}
                  <div style={{ gridColumn: 'span 2', background: 'rgba(30, 41, 59, 0.5)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ color: '#c084fc', margin: 0, fontSize: '0.95rem' }}>Ingresos Brutos (IIBB)</h4>
                      <div>
                        <select
                          value={settingsForm.iibb_provincia}
                          onChange={(e) => setSettingsForm({ ...settingsForm, iibb_provincia: e.target.value })}
                          style={{ background: '#1e293b', border: '1px solid #334155', color: '#c084fc', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.8rem', fontWeight: 'bold', outline: 'none' }}
                        >
                          <option value="Catamarca">Catamarca (Escalas)</option>
                          <option value="General">Régimen Simplificado (Flat Rate)</option>
                        </select>
                      </div>
                    </div>

                    {settingsForm.iibb_provincia === 'Catamarca' ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Límite Tramo 1 ($)</label>
                            <input
                              type="number"
                              value={settingsForm.iibb_tramo1_limite}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo1_limite: Number(e.target.value) })}
                              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Alícuota Tramo 1 (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={settingsForm.iibb_tramo1_alicuota}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo1_alicuota: Number(e.target.value) })}
                              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Límite Tramo 2 ($)</label>
                            <input
                              type="number"
                              value={settingsForm.iibb_tramo2_limite}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo2_limite: Number(e.target.value) })}
                              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Alícuota Tramo 2 (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={settingsForm.iibb_tramo2_alicuota}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo2_alicuota: Number(e.target.value) })}
                              style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                          <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Alícuota Tramo 3 (&gt; Tramo 2) (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={settingsForm.iibb_tramo3_alicuota}
                            onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo3_alicuota: Number(e.target.value) })}
                            style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Alícuota Plana / Única (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={settingsForm.iibb_tramo1_alicuota}
                          onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo1_alicuota: Number(e.target.value) })}
                          style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem' }}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Base de Cálculo IIBB</label>
                      <select
                        value={settingsForm.iibb_base_calculo}
                        onChange={(e) => setSettingsForm({ ...settingsForm, iibb_base_calculo: e.target.value })}
                        style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '0.5rem', borderRadius: '0.375rem', outline: 'none' }}
                      >
                        <option value="diferencial">Base Imponible Diferencial (Ganancia Neta / Spread)</option>
                        <option value="bruto">Monto Bruto de Ventas Total</option>
                      </select>
                    </div>

                  </div>

                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    style={{ background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '0.375rem', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    style={{ background: '#0284c7', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '0.375rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    {savingSettings ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Impuestos;
