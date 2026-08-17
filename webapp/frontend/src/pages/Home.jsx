import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from '../context/FileContext';
import config from '../config';
import { 
    UploadCloud, 
    FileSpreadsheet, 
    CheckCircle2, 
    Loader2, 
    AlertTriangle, 
    ArrowRight, 
    ShieldCheck, 
    FileText, 
    Trash2, 
    Download, 
    RefreshCw,
    Filter
} from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

function Home() {
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [gaps, setGaps] = useState([]);
    const [selectedExchanges, setSelectedExchanges] = useState({});
    const [uploadProgress, setUploadProgress] = useState(0);
    
    // Lifted State from Context
    const {
        fileList, addFiles, clearFiles,
        processing, setProcessing,
        results, setResults,
        error, setError
    } = useFileContext();

    const fetchGaps = async () => {
        try {
            const res = await axios.get(`${config.API_URL}/api/reports/gaps`);
            setGaps(res.data.gaps || []);
        } catch (err) {
            console.error("Error fetching gaps in Home page:", err);
        }
    };

    useEffect(() => {
        fetchGaps();
    }, []);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            addFiles(Array.from(e.target.files));
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const detectExchangeHint = (filename) => {
        const lower = filename.toLowerCase();
        if (lower.includes('binance') && lower.includes('p2p')) return 'Binance P2P';
        if (lower.includes('binance')) return 'Binance Spot';
        if (lower.includes('bitso')) return 'Bitso Alpha';
        if (lower.includes('fiwind')) return 'Fiwind';
        if (lower.includes('ripio') && lower.includes('trade')) return 'Ripio Trade';
        if (lower.includes('ripio')) return 'Ripio Classic';
        if (lower.includes('consolidada') || lower.includes('manual')) return 'Planilla Consolidada';
        return 'CSV / Excel Estándar';
    };

    const processFiles = async () => {
        setProcessing(true);
        setError(null);
        setUploadProgress(0);
        const formData = new FormData();
        fileList.forEach(f => formData.append('files', f));

        try {
            const res = await axios.post(`${config.API_URL}/process`, formData, {
                onUploadProgress: (progressEvent) => {
                    const total = progressEvent.total || 1;
                    const percent = Math.round((progressEvent.loaded * 100) / total);
                    setUploadProgress(percent);
                }
            });
            setResults(res.data);
            fetchGaps(); // Refresh gaps after processing uploads!
        } catch (err) {
            if (err.response && err.response.data && err.response.data.error === 'missing_columns') {
                setError({
                    type: 'config',
                    msg: `¡Formato modificado en ${err.response.data.filename}!`,
                    details: `Faltan las columnas requeridas: ${err.response.data.missing.join(', ')}.`,
                    exchange: err.response.data.exchange
                });
            } else {
                setError({ 
                    type: 'general', 
                    msg: "Error al procesar los archivos. Verifique la conexión con el motor contable." 
                });
            }
            console.error(err);
        } finally {
            setProcessing(false);
        }
    };

    const downloadExcel = async () => {
        if (!results) return;
        const filenames = results.files.map(f => f.filename);
        const year = new Date().getFullYear();

        try {
            const res = await axios.post(`${config.API_URL}/download`, { filenames, year }, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Certificacion_Ingresos_${year}.xlsx`);
            document.body.appendChild(link);
            link.click();
        } catch {
            alert("Error al descargar el archivo de certificación. Verifique que existan registros en la base de datos.");
        }
    };

    return (
        <div style={{ 
            maxWidth: '1440px', 
            margin: '0 auto', 
            padding: '1.5rem 2rem 2.5rem 2rem', 
            minHeight: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            boxSizing: 'border-box' 
        }}>
            
            {/* INSTITUTIONAL HEADER */}
            <header style={{ 
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: '1.5rem', 
                paddingLeft: '3.75rem', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                borderBottom: '1px solid var(--border-subtle)', 
                paddingBottom: '1rem' 
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h1 style={{ fontSize: '1.6rem', margin: 0, color: 'var(--text-primary)', fontWeight: '700', letterSpacing: '-0.02em' }}>
                            CryptoTax <span style={{ color: 'var(--brand-indigo-light)', fontWeight: '500' }}>Pro</span>
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: 'var(--text-xs)', letterSpacing: '0.2px' }}>
                        Motor de Conciliación y Liquidación Fiscal Multiexchange
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: '500' }}>
                            Régimen Impositivo
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: '600' }}>
                            Método FIFO / Ganancias & IIBB
                        </div>
                    </div>
                </div>
            </header>

            {/* BALANCE GAPS INSTITUTIONAL WARNING BANNER */}
            {!results && gaps && gaps.length > 0 && (
                <div style={{
                    backgroundColor: 'var(--accent-amber-subtle)',
                    border: '1px solid var(--accent-amber-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.875rem 1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{
                            padding: '0.4rem',
                            borderRadius: '0.375rem',
                            backgroundColor: 'rgba(245, 158, 11, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <AlertTriangle size={18} color="var(--accent-amber-light)" />
                        </div>
                        <div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-amber-light)', fontWeight: '700' }}>
                                Se detectaron {gaps.length} faltante(s) de adquisición previa (Huecos FIFO)
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                Existen ventas sin lote de compra registrado en la base contable. Puedes revisar y conciliar estos saldos en el Calendario.
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/calendar?tab=warnings')}
                        className="btn-secondary"
                        style={{
                            borderColor: 'var(--accent-amber-border)',
                            color: 'var(--accent-amber-light)',
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            padding: '0.45rem 0.85rem',
                            fontSize: 'var(--text-xs)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Revisar Huecos en Calendario <ArrowRight size={14} />
                    </button>
                </div>
            )}

            {/* UPLOAD SECTION (2-COLUMN GRID) */}
            <AnimatePresence mode="wait">
                {!results && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1.15fr', 
                            gap: '1.5rem', 
                            alignItems: 'stretch', 
                            flex: 1 
                        }}
                    >
                        {/* LEFT COLUMN: INSTITUTIONAL INSTRUCTIONS & ECOSYSTEM */}
                        <div className="card-surface" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <h2 style={{ fontSize: '1.35rem', fontWeight: '700', margin: '0 0 0.5rem 0', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                                    Carga y Conciliación Contable
                                </h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 1.5rem 0', lineHeight: '1.5' }}>
                                    Importe los extractos oficiales de sus cuentas para liquidación y certificación fiscal con método FIFO estricto.
                                </p>

                                {/* 3 Steps Institutional Cards */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.75rem' }}>
                                    
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.15rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-panel)' }}>
                                        <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-indigo-subtle)', border: '1px solid var(--brand-indigo-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--brand-indigo-light)' }}>
                                            <UploadCloud size={20} />
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: '0 0 0.2rem 0', color: 'var(--text-primary)' }}>
                                                1. Carga de Extractos
                                            </h4>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                                                Arrastre reportes exportados en formato .xlsx o .csv desde cualquier exchange o billetera.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.15rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-panel)' }}>
                                        <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(148, 163, 184, 0.1)', border: '1px solid rgba(148, 163, 184, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
                                            <FileText size={20} />
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: '0 0 0.2rem 0', color: 'var(--text-primary)' }}>
                                                2. Conciliación & Anti-Duplicados
                                            </h4>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                                                Normalización automática de fechas, pares cripto/fiat y hash criptográfico anti-duplicados.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem 1.15rem', border: '1px solid var(--accent-emerald-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--accent-emerald-subtle)' }}>
                                        <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--accent-emerald-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--accent-emerald-light)' }}>
                                            <CheckCircle2 size={20} />
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: '0 0 0.2rem 0', color: 'var(--text-primary)' }}>
                                                3. Asignación FIFO & Certificación
                                            </h4>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.4' }}>
                                                Generación de planilla de ganancias de capital lista para presentación contable.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* COMPATIBILITY CHIPS */}
                            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '0.75rem' }}>
                                    <ShieldCheck size={14} color="var(--brand-indigo-light)" /> Formatos Homologados
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {['Binance Spot', 'Binance P2P', 'Bitso Alpha', 'Fiwind', 'Ripio Classic', 'Ripio Trade', 'Planilla Consolidada'].map(ex => (
                                        <span 
                                            key={ex} 
                                            className="badge badge-slate"
                                            style={{ fontSize: 'var(--text-2xs)', padding: '0.25rem 0.55rem' }}
                                        >
                                            {ex}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: DROPZONE & QUEUE */}
                        <div className="card-surface" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                {/* MODE TABS */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', backgroundColor: 'var(--bg-panel)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                                    <button
                                        type="button"
                                        style={{
                                            flex: 1,
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: 'var(--radius-sm)',
                                            border: 'none',
                                            backgroundColor: 'var(--bg-elevated)',
                                            color: '#FFFFFF',
                                            fontWeight: '600',
                                            fontSize: 'var(--text-xs)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            cursor: 'default',
                                            borderLeft: '2px solid var(--brand-indigo)'
                                        }}
                                    >
                                        <UploadCloud size={15} color="var(--brand-indigo-light)" /> Importar Operaciones
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/reports')}
                                        style={{
                                            flex: 1,
                                            padding: '0.55rem 0.75rem',
                                            borderRadius: 'var(--radius-sm)',
                                            border: 'none',
                                            backgroundColor: 'transparent',
                                            color: 'var(--text-secondary)',
                                            fontWeight: '500',
                                            fontSize: 'var(--text-xs)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            cursor: 'pointer',
                                            transition: 'color 150ms ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                                    >
                                        <FileSpreadsheet size={15} /> Generar Reporte Continuo
                                    </button>
                                </div>

                                {/* DROPZONE */}
                                <div 
                                    className="upload-zone-refined"
                                    onClick={() => document.getElementById('fileInput').click()}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setIsDragging(true);
                                    }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                            addFiles(Array.from(e.dataTransfer.files));
                                        }
                                    }}
                                    style={{
                                        borderColor: isDragging ? 'var(--brand-indigo)' : undefined,
                                        backgroundColor: isDragging ? 'var(--brand-indigo-subtle)' : undefined
                                    }}
                                >
                                    <input type="file" id="fileInput" multiple hidden onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-color)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: '0.85rem',
                                        color: 'var(--brand-indigo-light)'
                                    }}>
                                        <UploadCloud size={24} />
                                    </div>
                                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
                                        Arrastra tus archivos de reporte aquí
                                    </h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', margin: '0 0 0.85rem 0', maxWidth: '380px', marginInline: 'auto', lineHeight: '1.4' }}>
                                        Soporta planillas <strong>.xlsx / .csv</strong> exportadas directamente de exchanges o plantillas personalizadas.
                                    </p>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: 'var(--text-2xs)', color: 'var(--brand-indigo-light)', backgroundColor: 'var(--brand-indigo-subtle)', border: '1px solid var(--brand-indigo-border)', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', fontWeight: '600' }}>
                                        <ShieldCheck size={13} /> Detección de duplicados automática por Hash
                                    </div>
                                </div>
                            </div>

                            {/* QUEUE OF UPLOADED FILES */}
                            {fileList.length > 0 && (
                                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-primary)' }}>
                                            Cola de procesamiento ({fileList.length} archivo{fileList.length > 1 ? 's' : ''}):
                                        </span>
                                        <button 
                                            onClick={clearFiles}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-muted)',
                                                fontSize: 'var(--text-2xs)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                padding: '0.2rem 0.4rem',
                                                borderRadius: '0.25rem'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-rose-light)'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            <Trash2 size={12} /> Limpiar cola
                                        </button>
                                    </div>

                                    <div style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {fileList.map((f, i) => (
                                            <div 
                                                key={i} 
                                                style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between', 
                                                    padding: '0.45rem 0.75rem', 
                                                    backgroundColor: 'var(--bg-panel)', 
                                                    borderRadius: 'var(--radius-sm)', 
                                                    border: '1px solid var(--border-subtle)',
                                                    fontSize: 'var(--text-xs)' 
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                    <FileSpreadsheet size={15} color="var(--brand-indigo-light)" style={{ flexShrink: 0 }} />
                                                    <span style={{ color: 'var(--text-primary)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                                                        {f.name}
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}>
                                                        ({formatFileSize(f.size)})
                                                    </span>
                                                </div>
                                                <span className="badge badge-indigo" style={{ fontSize: '10.5px' }}>
                                                    {detectExchangeHint(f.name)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* PROGRESS BAR */}
                                    {processing && (
                                        <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--brand-indigo-light)', marginBottom: '0.35rem', fontWeight: '600' }}>
                                                <span>Importando y calculando lotes FIFO...</span>
                                                <span className="mono">{uploadProgress}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-panel)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                                <div 
                                                    style={{ 
                                                        width: `${uploadProgress}%`, 
                                                        height: '100%', 
                                                        backgroundColor: 'var(--brand-indigo)', 
                                                        transition: 'width 150ms ease' 
                                                    }} 
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* PROCESS SUBMIT BUTTON */}
                                    <button
                                        className="btn-primary"
                                        style={{ width: '100%', marginTop: '0.85rem', padding: '0.75rem 1rem' }}
                                        onClick={processFiles}
                                        disabled={processing}
                                    >
                                        {processing ? (
                                            <>
                                                <Loader2 className="spin" size={18} /> Procesando e importando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={18} /> Procesar e Importar Operaciones
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* ERROR MESSAGE BOX */}
                            {error && (
                                <div style={{ 
                                    marginTop: '1rem', 
                                    padding: '0.85rem 1rem', 
                                    borderRadius: 'var(--radius-md)', 
                                    backgroundColor: 'var(--accent-rose-subtle)', 
                                    border: '1px solid var(--accent-rose-border)' 
                                }}>
                                    <p style={{ color: 'var(--accent-rose-light)', margin: 0, fontWeight: '600', fontSize: 'var(--text-xs)' }}>
                                        {error.msg}
                                    </p>
                                    {error.type === 'config' && (
                                        <div style={{ marginTop: '0.5rem' }}>
                                            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>{error.details}</p>
                                            <button
                                                onClick={() => navigate('/settings')}
                                                className="btn-secondary"
                                                style={{ fontSize: 'var(--text-2xs)', padding: '0.35rem 0.75rem', borderColor: 'var(--accent-rose-border)', color: 'var(--accent-rose-light)' }}
                                            >
                                                Configurar Mapeo de Columnas
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* RESULTS VIEW */}
            {results && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                    {/* RESULTS TOOLBAR */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <h2 style={{ fontSize: '1.35rem', margin: 0, color: 'var(--text-primary)', fontWeight: '700' }}>
                                    Resultado de la Importación
                                </h2>
                                <span className="badge badge-emerald">
                                    {results.total_transactions} operaciones procesadas
                                </span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', margin: '0.2rem 0 0 0' }}>
                                Transacciones normalizadas e incorporadas a la base contable para cálculo FIFO.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button 
                                className="btn-secondary" 
                                style={{ fontSize: 'var(--text-xs)', padding: '0.55rem 1rem' }} 
                                onClick={() => { setResults(null); clearFiles(); }}
                            >
                                <RefreshCw size={14} /> Cargar Nuevos Archivos
                            </button>
                            <button 
                                className="btn-primary" 
                                style={{ fontSize: 'var(--text-xs)', padding: '0.55rem 1.15rem' }} 
                                onClick={downloadExcel}
                            >
                                <Download size={15} /> Descargar Certificación Excel
                            </button>
                        </div>
                    </div>

                    {/* WARNINGS IN RESULTS */}
                    {results.warnings && results.warnings.length > 0 && (
                        <div style={{ 
                            backgroundColor: 'var(--accent-amber-subtle)', 
                            border: '1px solid var(--accent-amber-border)', 
                            borderRadius: 'var(--radius-md)', 
                            padding: '0.85rem 1.25rem', 
                            marginBottom: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <AlertTriangle size={18} color="var(--accent-amber-light)" style={{ flexShrink: 0 }} />
                                <div>
                                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-amber-light)', fontWeight: '700', display: 'block' }}>
                                        Se detectaron {results.warnings.length} hueco(s) FIFO en el balance acumulado
                                    </span>
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                        Algunas ventas no tienen lote de adquisición previo coincidente. Puedes conciliar en el módulo Calendario.
                                    </span>
                                </div>
                            </div>
                            <button 
                                className="btn-secondary" 
                                style={{ 
                                    borderColor: 'var(--accent-amber-border)', 
                                    color: 'var(--accent-amber-light)', 
                                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                    fontSize: 'var(--text-xs)',
                                    padding: '0.45rem 0.85rem'
                                }}
                                onClick={() => navigate('/calendar?tab=warnings')}
                            >
                                Resolver en Calendario <ArrowRight size={14} />
                            </button>
                        </div>
                    )}

                    {/* PROCESSED FILES CARDS */}
                    <div style={{ display: 'grid', gap: '1.25rem', flex: 1 }}>
                        {results.files.map((file, idx) => {
                            const getTxExchange = tx => {
                                const ex = (tx.Exchange || tx.exchange || '').toString().trim();
                                if (!ex || ex.toLowerCase() === 'nan' || ex.toLowerCase() === 'none' || ex.toLowerCase() === 'null') {
                                    return 'Otros';
                                }
                                return ex;
                            };
                            const uniqueExchanges = file.processed_sample
                                ? Array.from(new Set(file.processed_sample.map(getTxExchange)))
                                : [];
                            const currentFilter = selectedExchanges[idx] || 'ALL';
                            const displaySample = file.processed_sample
                                ? (currentFilter === 'ALL'
                                    ? file.processed_sample
                                    : file.processed_sample.filter(tx => getTxExchange(tx) === currentFilter))
                                : [];

                            return (
                                <div key={idx} className="card-surface" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <FileSpreadsheet size={18} color="var(--brand-indigo-light)" />
                                            <h3 style={{ fontSize: 'var(--text-sm)', margin: 0, color: 'var(--text-primary)', fontWeight: '700' }}>
                                                {file.filename}
                                            </h3>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.45rem' }}>
                                            <span className="badge badge-indigo">{file.count} Ops Detectadas</span>
                                            {file.inserted > 0 && <span className="badge badge-emerald">+{file.inserted} Nuevas</span>}
                                            {file.skipped > 0 && <span className="badge badge-amber">{file.skipped} Duplicadas</span>}
                                        </div>
                                    </div>

                                    {/* DUAL COMPARISON GRID */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                                        {/* ORIGINAL RAW PREVIEW */}
                                        <div style={{ backgroundColor: 'var(--bg-panel)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                                <h5 style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600' }}>
                                                    Estructura Original (Extracto)
                                                </h5>
                                                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                                                    Muestra {file.raw_sample ? file.raw_sample.length : 0} filas
                                                </span>
                                            </div>
                                            <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
                                                {file.raw_sample && file.raw_sample.length > 0 ? (
                                                    <table className="table-ledger" style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>
                                                        <thead>
                                                            <tr>
                                                                {Object.keys(file.raw_sample[0]).map((key) => (
                                                                    <th key={key} style={{ padding: '0.45rem 0.65rem' }}>{key}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {file.raw_sample.map((row, rIdx) => (
                                                                <tr key={rIdx}>
                                                                    {Object.values(row).map((val, cIdx) => (
                                                                        <td key={cIdx} style={{ padding: '0.4rem 0.65rem', color: 'var(--text-secondary)' }}>
                                                                            {String(val).substring(0, 32)}{String(val).length > 32 ? '...' : ''}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, padding: '1rem' }}>
                                                        Sin datos en la muestra original
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* PROCESSED SUB-LEDGER VIEW */}
                                        <div style={{ backgroundColor: 'var(--bg-panel)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <h5 style={{ color: 'var(--brand-indigo-light)', fontSize: 'var(--text-xs)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '700' }}>
                                                        Normalizado (Base Contable)
                                                    </h5>
                                                </div>

                                                {/* EXCHANGE FILTERS */}
                                                {uniqueExchanges.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <Filter size={12} color="var(--text-muted)" />
                                                        <button
                                                            onClick={() => setSelectedExchanges(prev => ({ ...prev, [idx]: 'ALL' }))}
                                                            style={{
                                                                padding: '0.15rem 0.5rem',
                                                                fontSize: 'var(--text-2xs)',
                                                                borderRadius: 'var(--radius-sm)',
                                                                border: '1px solid',
                                                                borderColor: currentFilter === 'ALL' ? 'var(--brand-indigo)' : 'var(--border-subtle)',
                                                                cursor: 'pointer',
                                                                backgroundColor: currentFilter === 'ALL' ? 'var(--brand-indigo-subtle)' : 'transparent',
                                                                color: currentFilter === 'ALL' ? 'var(--brand-indigo-light)' : 'var(--text-secondary)',
                                                                fontWeight: '600'
                                                            }}
                                                        >
                                                            Todos ({file.count || file.processed_sample.length})
                                                        </button>
                                                        {uniqueExchanges.map(ex => {
                                                            const count = file.exchange_counts ? file.exchange_counts[ex] : file.processed_sample.filter(tx => getTxExchange(tx) === ex).length;
                                                            const isActive = currentFilter === ex;
                                                            return (
                                                                <button
                                                                    key={ex}
                                                                    onClick={() => setSelectedExchanges(prev => ({ ...prev, [idx]: ex }))}
                                                                    style={{
                                                                        padding: '0.15rem 0.5rem',
                                                                        fontSize: 'var(--text-2xs)',
                                                                        borderRadius: 'var(--radius-sm)',
                                                                        border: '1px solid',
                                                                        borderColor: isActive ? 'var(--brand-indigo)' : 'var(--border-subtle)',
                                                                        cursor: 'pointer',
                                                                        backgroundColor: isActive ? 'var(--brand-indigo-subtle)' : 'transparent',
                                                                        color: isActive ? 'var(--brand-indigo-light)' : 'var(--text-secondary)',
                                                                        fontWeight: '600'
                                                                    }}
                                                                >
                                                                    {ex} ({count})
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
                                                {displaySample && displaySample.length > 0 ? (
                                                    <table className="table-ledger" style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>
                                                        <thead>
                                                            <tr>
                                                                {Object.keys(displaySample[0]).map((key) => (
                                                                    <th key={key} style={{ padding: '0.45rem 0.65rem' }}>{key}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {displaySample.map((tx, i) => (
                                                                <tr key={i}>
                                                                    {Object.values(tx).map((val, cIdx) => (
                                                                        <td key={cIdx} style={{ padding: '0.4rem 0.65rem', fontWeight: typeof val === 'number' ? '600' : 'normal' }}>
                                                                            {val}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0, padding: '1rem' }}>
                                                        No se detectaron operaciones fiscales en la muestra para el filtro seleccionado.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </div>
    );
}

export default Home;
