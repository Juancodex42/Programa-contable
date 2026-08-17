import { useState, useEffect } from 'react';
import {
  Calculator, Settings as SettingsIcon, ShieldCheck, TrendingUp,
  DollarSign, FileText, ChevronDown, Check, RefreshCw, AlertCircle,
  Layers, AlertTriangle, ArrowUpRight, ArrowDownRight, Lock, Landmark,
  Percent, ShieldAlert, ArrowRight, CheckCircle2
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

  const fetchTaxReport = async (year) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/taxes/report?year=${year}`);
      const data = await res.json();
      
      setReport(data);
      
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

  const tramo1Pct = report && report.settings && report.settings.iibb_tramo1_limite > 0
    ? Math.min(100, (report.total_sells_ars / report.settings.iibb_tramo1_limite) * 100)
    : 0;

  return (
    <div style={{ padding: '1.75rem 2rem', color: 'var(--text-primary)', maxWidth: '1440px', margin: '0 auto' }}>

      {/* INSTITUTIONAL HEADER & FISCAL CONTROLS */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#4F46E5', boxShadow: '0 0 10px rgba(79, 70, 229, 0.7)' }} />
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              Liquidación Impositiva & Ganancias (IMP)
            </h1>
            <span className="badge badge-indigo" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              DDJJ Oficial
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Determinación fiscal para Declaración Jurada Anual • AFIP / ARCA & Rentas Provinciales ({report?.settings?.iibb_provincia || 'Catamarca'})
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Year selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-panel)',
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginRight: '0.5rem', fontWeight: 500 }}>
              Ejercicio:
            </span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                background: 'transparent',
                color: '#818CF8',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                outline: 'none',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {Array.from({ length: (new Date().getFullYear() + 5) - 2020 + 1 }, (_, i) => 2020 + i).map((yr) => (
                <option key={yr} value={yr} style={{ background: '#0D131F', color: '#F8FAFC' }}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowConfigModal(true)}
            className="btn-secondary"
            style={{ padding: '0.55rem 1.1rem', fontSize: '0.85rem' }}
          >
            <SettingsIcon size={15} />
            <span>Parámetros Fiscales</span>
          </button>

          <button
            onClick={() => fetchTaxReport(selectedYear)}
            className="btn-outline"
            style={{ padding: '0.55rem 0.75rem' }}
            title="Recalcular liquidación"
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '5rem 2rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <RefreshCw size={36} color="#818CF8" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>
            Calculando liquidación y determinaciones impositivas para el ejercicio fiscal {selectedYear}...
          </p>
        </div>
      ) : report ? (
        <>
          {report.has_certifications ? (
            <>
              {/* IMMUTABLE CERTIFICATION BANNER */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--accent-emerald-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.1rem 1.4rem',
                marginBottom: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: 'var(--shadow-md)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'var(--accent-emerald-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--accent-emerald-border)'
                  }}>
                    <ShieldCheck size={22} color="#34D399" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1rem', color: '#F8FAFC', fontWeight: 700 }}>
                        Liquidación Auditada Respaldada por Certificaciones C.P.N.
                      </span>
                      <span className="badge badge-emerald">
                        <Lock size={12} />
                        Inmutable
                      </span>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.15rem', display: 'block' }}>
                      Incluye {report.certifications_included.length} certificación(es) firmada(s): {report.certifications_included.map(c => c.title || `${c.start_date} al ${c.end_date}`).join(' • ')}
                    </span>
                  </div>
                </div>
                <Link
                  to="/calendar"
                  className="btn-outline"
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.9rem', gap: '0.35rem', color: '#34D399', borderColor: 'var(--accent-emerald-border)' }}
                >
                  <span>Ver en Calendario FIFO</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              {/* CERTIFIED VS PROVISIONAL TAX BREAKDOWN COMPARISON */}
              {report.certified && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '1.25rem',
                  marginBottom: '1.75rem'
                }}>
                  {/* Certified Tax Card */}
                  <div className="card-surface" style={{
                    padding: '1.35rem',
                    border: '1px solid var(--accent-emerald-border)',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(18, 26, 43, 0.95) 100%)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#34D399', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <ShieldCheck size={17} /> Liquidación Certificada (Firmada C.P.N.)
                      </span>
                      <span className="badge badge-emerald">
                        Verdad Legal
                      </span>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#F8FAFC', marginBottom: '0.5rem', letterSpacing: '-0.02em' }} className="tabular-nums">
                      {formatARS(report.certified.impuesto_ganancias)} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Ganancias</span>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Ventas Certificadas:</span>
                        <strong className="tabular-nums">{formatARS(report.certified.sells_ars)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Ganancia Neta Auditada:</span>
                        <strong style={{ color: '#34D399' }} className="tabular-nums">{formatARS(report.certified.ganancia_neta)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Provisional Tax Card */}
                  <div className="card-surface" style={{
                    padding: '1.35rem',
                    border: '1px solid var(--accent-amber-border)',
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(18, 26, 43, 0.95) 100%)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#FBBF24', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <DollarSign size={17} /> Provisión de Impuesto (Período Abierto)
                      </span>
                      <span className="badge badge-amber">
                        Al Día (API/CSV)
                      </span>
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#F8FAFC', marginBottom: '0.5rem', letterSpacing: '-0.02em' }} className="tabular-nums">
                      {formatARS(report.provisional.impuesto_ganancias)} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Estimado</span>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#CBD5E1', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Ventas en Vivo:</span>
                        <strong className="tabular-nums">{formatARS(report.provisional.sells_ars)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Ganancia Neta Provisoria:</span>
                        <strong style={{ color: '#FBBF24' }} className="tabular-nums">{formatARS(report.provisional.ganancia_neta)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MAIN DETERMINATION KPI CARDS (Z-PATTERN) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>

                {/* KPI 1: Ganancia Neta (Base Imponible) */}
                <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Base Imponible Ganancias (PnL)
                    </span>
                    <div style={{ background: report.ganancia_neta >= 0 ? 'var(--accent-emerald-subtle)' : 'var(--accent-rose-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TrendingUp size={17} color={report.ganancia_neta >= 0 ? '#34D399' : '#FB7185'} />
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: report.ganancia_neta >= 0 ? '#34D399' : '#FB7185', letterSpacing: '-0.02em' }} className="tabular-nums">
                      {report.ganancia_neta >= 0 ? '+' : ''}{formatARS(report.ganancia_neta)}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                    <span className={report.ganancia_neta >= 0 ? "badge badge-emerald" : "badge badge-rose"}>
                      Resultado Neto
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cálculo FIFO</span>
                  </div>
                </div>

                {/* KPI 2: Impuesto Ganancias Determinado */}
                <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#FBBF24', fontWeight: 600 }}>
                      Impuesto Cedular / Ganancias
                    </span>
                    <div style={{ background: 'var(--accent-amber-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Percent size={17} color="#FBBF24" />
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#FBBF24', letterSpacing: '-0.02em' }} className="tabular-nums">
                      {formatARS(report.impuesto_ganancias)}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                    <span className="badge badge-amber">
                      Alícuota {report.settings.ganancias_alicuota}%
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Deduc: {formatARS(report.settings.ganancias_deduccion)}
                    </span>
                  </div>
                </div>

                {/* KPI 3: Impuesto IIBB Determinado */}
                <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#818CF8', fontWeight: 600 }}>
                      IIBB {report ? report.settings.iibb_provincia : 'Catamarca'}
                    </span>
                    <div style={{ background: 'var(--brand-indigo-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Layers size={17} color="#818CF8" />
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#818CF8', letterSpacing: '-0.02em' }} className="tabular-nums">
                      {formatARS(report.impuesto_iibb)}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                    <span className="badge badge-indigo">
                      Tramo #{report.tramo_iibb} ({report.alicuota_iibb}%)
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Base: {report.settings.iibb_base_calculo === 'diferencial' ? 'Ganancia' : 'Ventas'}
                    </span>
                  </div>
                </div>

                {/* KPI 4: Ventas vs Compras Brutas */}
                <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Volumen Bruto de Ventas
                    </span>
                    <div style={{ background: 'rgba(148, 163, 184, 0.12)', padding: '0.45rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DollarSign size={17} color="#94A3B8" />
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.55rem', margin: 0, fontWeight: 800, color: '#F8FAFC', letterSpacing: '-0.02em' }} className="tabular-nums">
                      {formatARS(report.total_sells_ars)}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.25rem' }}>
                    <span className="badge badge-slate">Compras:</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} className="tabular-nums">
                      {formatARS(report.total_buys_ars)}
                    </span>
                  </div>
                </div>

              </div>

              {/* IIBB THRESHOLD & SCALE MONITOR */}
              <div className="card-surface" style={{ padding: '1.5rem', marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#818CF8' }} />
                    <h3 style={{ fontSize: '1.1rem', color: '#F8FAFC', margin: 0, fontWeight: 700 }}>
                      Monitor de Tramos y Alícuotas IIBB ({report.settings.iibb_provincia} {selectedYear})
                    </h3>
                  </div>
                  <span className="badge badge-indigo">
                    Escala Progresiva Activa
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                  <span>Ventas Brutas Acumuladas: <strong style={{ color: '#F8FAFC' }} className="tabular-nums">{formatARS(report.total_sells_ars)}</strong></span>
                  <span>Tope Tramo 1: <strong style={{ color: '#818CF8' }} className="tabular-nums">{formatARS(report.settings.iibb_tramo1_limite)}</strong></span>
                </div>

                {/* Progress Bar */}
                <div style={{ width: '100%', height: '10px', background: 'var(--bg-panel)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
                  <div
                    style={{
                      width: `${Math.min(100, tramo1Pct)}%`,
                      height: '100%',
                      background: tramo1Pct < 80 ? 'linear-gradient(90deg, #10B981, #818CF8)' : 'linear-gradient(90deg, #F59E0B, #F43F5E)',
                      borderRadius: 'var(--radius-full)',
                      transition: 'width 0.8s ease-in-out'
                    }}
                  />
                </div>

                {/* Scale Footnotes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.85rem' }}>
                  <div style={{ background: 'var(--bg-panel)', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: report.tramo_iibb === 1 ? '1px solid var(--brand-indigo)' : '1px solid var(--border-subtle)' }}>
                    <strong style={{ color: report.tramo_iibb === 1 ? '#818CF8' : '#F8FAFC' }}>Tramo 1 ({report.settings.iibb_tramo1_alicuota}%):</strong> Hasta {formatARS(report.settings.iibb_tramo1_limite)}
                  </div>
                  <div style={{ background: 'var(--bg-panel)', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: report.tramo_iibb === 2 ? '1px solid var(--brand-indigo)' : '1px solid var(--border-subtle)' }}>
                    <strong style={{ color: report.tramo_iibb === 2 ? '#818CF8' : '#F8FAFC' }}>Tramo 2 ({report.settings.iibb_tramo2_alicuota}%):</strong> Hasta {formatARS(report.settings.iibb_tramo2_limite)}
                  </div>
                  <div style={{ background: 'var(--bg-panel)', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: report.tramo_iibb === 3 ? '1px solid var(--brand-indigo)' : '1px solid var(--border-subtle)' }}>
                    <strong style={{ color: report.tramo_iibb === 3 ? '#818CF8' : '#F8FAFC' }}>Tramo 3 ({report.settings.iibb_tramo3_alicuota}%):</strong> &gt; {formatARS(report.settings.iibb_tramo2_limite)}
                  </div>
                </div>
              </div>

              {/* MONTHLY BREAKDOWN LEDGER TABLE */}
              <div className="card-surface" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                    <h3 style={{ fontSize: '1.1rem', color: '#F8FAFC', margin: 0, fontWeight: 700 }}>
                      Desglose Mensual para Declaración Jurada (DDJJ)
                    </h3>
                  </div>
                  <span className="badge badge-slate">
                    {report.monthly_data.length} meses computados
                  </span>
                </div>

                {report.monthly_data.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '3rem 1.5rem', margin: 0 }}>
                    No se registraron operaciones certificadas para el ejercicio fiscal {selectedYear}.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table-ledger">
                      <thead>
                        <tr>
                          <th>Período</th>
                          <th style={{ textAlign: 'right' }}>Compras (ARS)</th>
                          <th style={{ textAlign: 'right' }}>Ventas (ARS)</th>
                          <th style={{ textAlign: 'right' }}>Ganancia Neta (PnL)</th>
                          <th style={{ textAlign: 'right' }}>Est. Ganancias (ARS)</th>
                          <th style={{ textAlign: 'right' }}>Est. IIBB (ARS)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.monthly_data.map((m, idx) => {
                          const m_base_iibb = report.settings.iibb_base_calculo === 'diferencial' ? m.pnl_ars : m.sells_ars;
                          const m_iibb = Math.max(0, m_base_iibb * (report.alicuota_iibb / 100));
                          const m_ganancias = Math.max(0, m.pnl_ars * (report.settings.ganancias_alicuota / 100));

                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600, color: '#818CF8' }}>{m.month}</td>
                              <td style={{ textAlign: 'right' }} className="tabular-nums">{formatARS(m.buys_ars)}</td>
                              <td style={{ textAlign: 'right' }} className="tabular-nums">{formatARS(m.sells_ars)}</td>
                              <td style={{ textAlign: 'right', color: m.pnl_ars >= 0 ? '#34D399' : '#FB7185', fontWeight: 600 }} className="tabular-nums">
                                {m.pnl_ars >= 0 ? '+' : ''}{formatARS(m.pnl_ars)}
                              </td>
                              <td style={{ textAlign: 'right', color: '#FBBF24' }} className="tabular-nums">{formatARS(m_ganancias)}</td>
                              <td style={{ textAlign: 'right', color: '#818CF8' }} className="tabular-nums">{formatARS(m_iibb)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--bg-panel)', borderTop: '2px solid var(--border-strong)', fontWeight: 700 }}>
                          <td style={{ padding: '0.85rem 1rem', color: '#F8FAFC' }}>Total Ejercicio {selectedYear}</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }} className="tabular-nums">{formatARS(report.total_buys_ars)}</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }} className="tabular-nums">{formatARS(report.total_sells_ars)}</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: report.ganancia_neta >= 0 ? '#34D399' : '#FB7185' }} className="tabular-nums">
                            {report.ganancia_neta >= 0 ? '+' : ''}{formatARS(report.ganancia_neta)}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#FBBF24' }} className="tabular-nums">{formatARS(report.impuesto_ganancias)}</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#818CF8' }} className="tabular-nums">{formatARS(report.impuesto_iibb)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* EMPTY STATE: NO CERTIFICATIONS */
            <div className="card-surface" style={{ padding: '3.5rem 2rem', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: 'var(--brand-indigo-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem auto',
                border: '1px solid var(--brand-indigo-border)'
              }}>
                <ShieldAlert size={30} color="#818CF8" />
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#F8FAFC', fontSize: '1.25rem', fontWeight: 700 }}>
                No hay certificaciones contables registradas para el ejercicio {selectedYear}
              </h3>
              <p style={{ margin: '0 auto 1.5rem auto', color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '620px', lineHeight: 1.6 }}>
                El Módulo de Impuestos computa exclusivamente operaciones respaldadas por <strong>Certificaciones Contables auditadas (C.P.N.)</strong> para prevenir distorsiones impositivas y multas de AFIP/ARCA. Registra o importa tus certificaciones en el Calendario FIFO.
              </p>
              <Link
                to="/calendar"
                className="btn-primary"
                style={{ padding: '0.65rem 1.5rem', fontSize: '0.9rem' }}
              >
                <span>Registrar Certificación en Calendario</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </>
      ) : null}

      {/* TAX CONFIGURATION MODAL */}
      <AnimatePresence>
        {showConfigModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="card-surface"
              style={{
                width: '100%', maxWidth: '680px',
                padding: '1.75rem 2rem', boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-strong)',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#818CF8' }} />
                  <h2 style={{ fontSize: '1.25rem', color: '#F8FAFC', margin: 0, fontWeight: 700 }}>
                    Parámetros Fiscales ({settingsForm.year})
                  </h2>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveSettings}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem', marginBottom: '1.75rem' }}>

                  {/* General Config Section */}
                  <div className="panel-surface" style={{ padding: '1.1rem' }}>
                    <h4 style={{ color: '#818CF8', margin: '0 0 0.85rem 0', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Configuración General & Tipo de Cambio
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
                          Tipo de Cambio USD/ARS ($)
                        </label>
                        <input
                          type="number"
                          value={settingsForm.usd_ars_exchange_rate}
                          onChange={(e) => setSettingsForm({ ...settingsForm, usd_ars_exchange_rate: Number(e.target.value) })}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
                          Margen Fallback Estimado (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={settingsForm.ganancias_estimadas_fallback_pct}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ganancias_estimadas_fallback_pct: Number(e.target.value) })}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ganancias Section */}
                  <div className="panel-surface" style={{ padding: '1.1rem', border: '1px solid var(--accent-amber-border)' }}>
                    <h4 style={{ color: '#FBBF24', margin: '0 0 0.85rem 0', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Impuesto Cedular / Ganancias
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
                          Deducción Especial / MNI ($)
                        </label>
                        <input
                          type="number"
                          value={settingsForm.ganancias_deduccion}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ganancias_deduccion: Number(e.target.value) })}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>
                          Alícuota Impositiva (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={settingsForm.ganancias_alicuota}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ganancias_alicuota: Number(e.target.value) })}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>

                  {/* IIBB Section */}
                  <div className="panel-surface" style={{ padding: '1.1rem', border: '1px solid var(--brand-indigo-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                      <h4 style={{ color: '#818CF8', margin: 0, fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Ingresos Brutos (IIBB)
                      </h4>
                      <select
                        value={settingsForm.iibb_provincia}
                        onChange={(e) => setSettingsForm({ ...settingsForm, iibb_provincia: e.target.value })}
                        className="input-field"
                        style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.8rem', fontWeight: 600, color: '#818CF8' }}
                      >
                        <option value="Catamarca">Catamarca (Escala Progresiva)</option>
                        <option value="General">Régimen Simplificado (Flat Rate)</option>
                      </select>
                    </div>

                    {settingsForm.iibb_provincia === 'Catamarca' ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Límite Tramo 1 ($)</label>
                            <input
                              type="number"
                              value={settingsForm.iibb_tramo1_limite}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo1_limite: Number(e.target.value) })}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Alícuota Tramo 1 (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={settingsForm.iibb_tramo1_alicuota}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo1_alicuota: Number(e.target.value) })}
                              className="input-field"
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Límite Tramo 2 ($)</label>
                            <input
                              type="number"
                              value={settingsForm.iibb_tramo2_limite}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo2_limite: Number(e.target.value) })}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Alícuota Tramo 2 (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={settingsForm.iibb_tramo2_alicuota}
                              onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo2_alicuota: Number(e.target.value) })}
                              className="input-field"
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: '0.75rem' }}>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Alícuota Tramo 3 (&gt; Tramo 2) (%)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={settingsForm.iibb_tramo3_alicuota}
                            onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo3_alicuota: Number(e.target.value) })}
                            className="input-field"
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Alícuota Plana / Única (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={settingsForm.iibb_tramo1_alicuota}
                          onChange={(e) => setSettingsForm({ ...settingsForm, iibb_tramo1_alicuota: Number(e.target.value) })}
                          className="input-field"
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: 500 }}>Base de Cálculo IIBB</label>
                      <select
                        value={settingsForm.iibb_base_calculo}
                        onChange={(e) => setSettingsForm({ ...settingsForm, iibb_base_calculo: e.target.value })}
                        className="input-field"
                      >
                        <option value="diferencial">Base Imponible Diferencial (Ganancia Neta / Spread)</option>
                        <option value="bruto">Monto Bruto de Ventas Total</option>
                      </select>
                    </div>

                  </div>

                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="btn-primary"
                  >
                    {savingSettings ? 'Guardando...' : 'Guardar Parámetros'}
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
