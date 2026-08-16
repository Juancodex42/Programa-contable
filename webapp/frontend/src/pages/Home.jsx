import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFileContext } from '../context/FileContext';
import config from '../config';
import { UploadCloud, FileText, CheckCircle, Loader2, AlertTriangle, Sparkles } from 'lucide-react';
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
        addFiles(Array.from(e.target.files));
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
                    msg: `¡Formato Cambiado en ${err.response.data.filename}!`,
                    details: `Faltan las columnas: ${err.response.data.missing.join(', ')}.`,
                    exchange: err.response.data.exchange
                });
            } else {
                setError({ type: 'general', msg: "Error processing files. Ensure backend is running." });
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
            alert("Error downloading file. Ensure data exists in DB.");
        }
    };

    return (
        <div style={{ maxWidth: '1450px', margin: '0 auto', padding: '1.25rem 2rem', minHeight: 'calc(100vh - 2.5rem)', display: 'flex', flexDirection: 'column' }}>
            
            {/* HEADER WITH PADDING FOR HAMBURGER BUTTON */}
            <header style={{ 
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: '1.25rem', 
                paddingLeft: '3.5rem', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                borderBottom: '1px solid rgba(255,255,255,0.08)', 
                paddingBottom: '0.85rem' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <h1 style={{ fontSize: '1.8rem', margin: 0, background: 'linear-gradient(to right, #38bdf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '700' }}>
                        CryptoTax <span style={{ fontWeight: 300 }}>Pro</span>
                    </h1>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.95rem', fontWeight: '500', letterSpacing: '0.5px' }}>
                        Procesador Impositivo Inteligente
                    </p>
                </div>
            </header>

            {!results && gaps && gaps.length > 0 && (
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
                                Faltan comprobantes de compra para un cálculo preciso en la base de datos del sistema. Podés revisarlos y resolverlos en la sección Calendario.
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

            {/* UPLOAD SECTION (WELL-PROPORTIONED 2-COLUMN GRID) */}
            <AnimatePresence>
                {!results && (
                    <motion.div
                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '1.5rem', alignItems: 'stretch', flex: 1 }}
                    >
                        {/* LEFT COLUMN: GUIDELINES & SUPPORTED EXCHANGES */}
                        <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '1rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginBottom: '0.6rem', background: 'linear-gradient(to right, #ffffff, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                    ¡Hola! Simplifiquemos tus Impuestos 🚀
                                </h2>
                                <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                    Tu asistente inteligente para consolidar y procesar reportes de exchanges.
                                </p>

                                {/* 3 STEPS VERTICAL RECTANGLES (TALLER & WELL FILLED) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.35rem 1.5rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.75rem', background: 'rgba(30, 41, 59, 0.45)' }}>
                                        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(6,182,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <UploadCloud size={26} color="#38bdf8" />
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: '#f8fafc' }}>1. Sube</h4>
                                            <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>Arrastra tus archivos de reporte de cualquier exchange.</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.35rem 1.5rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.75rem', background: 'rgba(30, 41, 59, 0.45)' }}>
                                        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <FileText size={26} color="#a855f7" />
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: '#f8fafc' }}>2. Revisa</h4>
                                            <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>Compara y valida automáticamente los datos procesados.</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.35rem 1.5rem', border: '1px solid rgba(74,222,128,0.25)', borderRadius: '0.75rem', background: 'rgba(74,222,128,0.09)' }}>
                                        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <CheckCircle size={26} color="#4ade80" />
                                        </div>
                                        <div>
                                            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: '#f8fafc' }}>3. Descarga</h4>
                                            <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>Obtén el Excel final directo para la certificación impositiva.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* OPTIMIZED FOR SECTION */}
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
                                <p style={{ color: '#38bdf8', fontSize: '0.85rem', marginBottom: '0.75rem', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: '600' }}>
                                    🔹 Optimizado para
                                </p>
                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                    {['Binance Spot', 'Binance P2P', 'Bitso Alpha', 'Fiwind', 'Ripio Classic', 'Ripio Trade', 'Planilla Consolidada / Manuales'].map(ex => (
                                        <span key={ex} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '500', background: ex.includes('Consolidada') ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.1)', color: ex.includes('Consolidada') ? '#d8b4fe' : '#f1f5f9', padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: ex.includes('Consolidada') ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(56, 189, 248, 0.25)' }}>
                                            <CheckCircle size={14} color={ex.includes('Consolidada') ? '#c084fc' : '#38bdf8'} /> {ex}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: DROPZONE & ACTIONS */}
                        <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '1rem' }}>
                            <div>
                                {/* MODE SELECTOR TABS */}
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.3rem', borderRadius: '0.65rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                    <button
                                        type="button"
                                        style={{
                                            flex: 1,
                                            padding: '0.6rem 0.75rem',
                                            borderRadius: '0.5rem',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                            color: '#ffffff',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <UploadCloud size={16} /> Subir al Sistema
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/reports')}
                                        style={{
                                            flex: 1,
                                            padding: '0.6rem 0.75rem',
                                            borderRadius: '0.5rem',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            background: 'rgba(30, 41, 59, 0.4)',
                                            color: '#cbd5e1',
                                            fontWeight: '600',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.4rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <FileText size={16} /> Convertir / Generar Excel
                                    </button>
                                </div>

                                <div 
                                    className="upload-zone" 
                                    style={{ 
                                        padding: '2rem 1.5rem', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        justifyContent: 'center', 
                                        alignItems: 'center', 
                                        border: isDragging ? '2px dashed #38bdf8' : '2px dashed #0284c7', 
                                        borderRadius: '0.85rem', 
                                        cursor: 'pointer', 
                                        background: isDragging ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.04)', 
                                        transition: 'all 0.2s' 
                                    }} 
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
                                >
                                    <input type="file" id="fileInput" multiple hidden onChange={handleFileChange} />
                                    <UploadCloud size={52} color="#38bdf8" style={{ marginBottom: '0.75rem' }} />
                                    <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', margin: '0 0 0.4rem 0', textAlign: 'center' }}>
                                        Arrastra tus planillas de Excel / CSV aquí
                                    </h3>
                                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.75rem 0', textAlign: 'center', maxWidth: '400px', lineHeight: '1.4' }}>
                                        Haz clic o suelta archivos <strong>.xlsx / .csv</strong> para procesar e importar tus operaciones al sistema.
                                    </p>
                                    <span style={{ fontSize: '0.75rem', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', padding: '0.25rem 0.65rem', borderRadius: '0.4rem', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: '600' }}>
                                        🛡️ Filtro automático anti-duplicados activo
                                    </span>
                                </div>
                            </div>

                            {fileList.length > 0 && (
                                <div style={{ marginTop: '1.25rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem 0', color: '#f8fafc' }}>Archivos a Cargar ({fileList.length}):</h4>
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '110px', overflowY: 'auto' }}>
                                        {fileList.map((f, i) => (
                                            <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '0.375rem', marginBottom: '0.3rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                                                    <FileText size={16} color="#38bdf8" /> {f.name}
                                                </span>
                                                <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>Listo para importar</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {processing && (
                                        <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#38bdf8', marginBottom: '0.35rem', fontWeight: '600' }}>
                                                <span>Subiendo y analizando transacciones...</span>
                                                <span>{uploadProgress}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', transition: 'width 0.2s ease' }} />
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        className="btn-primary"
                                        style={{ width: '100%', marginTop: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.85rem 1rem', fontSize: '1.02rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #0284c7, #2563eb)' }}
                                        onClick={processFiles}
                                        disabled={processing}
                                    >
                                        {processing ? <Loader2 className="spin" size={22} /> : "📥 PROCESAR E IMPORTAR AL SISTEMA"}
                                    </button>
                                    {processing && <p style={{ textAlign: 'center', marginTop: '0.5rem', color: '#4ade80', fontSize: '0.85rem', margin: 0 }}>Analizando e importando transacciones al sistema... Por favor aguarde ({uploadProgress}%)...</p>}
                                </div>
                            )}

                            {error && (
                                <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '0.5rem', background: error.type === 'config' ? 'rgba(239,68,68,0.12)' : 'rgba(0,0,0,0.3)', border: '1px solid ' + (error.type === 'config' ? '#ef4444' : '#64748b') }}>
                                    <p style={{ color: error.type === 'config' ? '#fca5a5' : '#ef4444', textAlign: 'center', margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>
                                        {error.msg}
                                    </p>
                                    {error.type === 'config' && (
                                        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                                            <p style={{ fontSize: '0.85rem', color: '#fca5a5', margin: 0 }}>{error.details}</p>
                                            <a href="/settings" style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.4rem 1rem', background: '#ef4444', color: 'white', borderRadius: '0.375rem', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                Ir a Configuración para Arreglarlo
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* RESULTS SECTION */}
            {results && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#f8fafc' }}>Resultados del Análisis</h2>
                            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>Se encontraron {results.total_transactions} operaciones contables.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.85rem' }}>
                            <button className="btn-primary" style={{ background: '#334155', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }} onClick={() => { setResults(null); clearFiles(); }}>Subir otros</button>
                            <button className="btn-primary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }} onClick={downloadExcel}>DESCARGAR EXCEL FINAL</button>
                        </div>
                    </div>

                    {results.warnings && results.warnings.length > 0 && (
                        <div style={{ 
                            background: 'rgba(245, 158, 11, 0.08)', 
                            border: '1px solid rgba(245, 158, 11, 0.3)', 
                            borderRadius: '0.85rem', 
                            padding: '0.85rem 1.25rem', 
                            marginBottom: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <div style={{ background: 'rgba(245, 158, 11, 0.18)', padding: '0.5rem', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AlertTriangle size={20} color="#fbbf24" />
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.92rem', color: '#fef08a', fontWeight: '700', display: 'block' }}>
                                        Se detectaron {results.warnings.length} faltante(s) / advertencia(s) de historial (huecos FIFO)
                                    </span>
                                    <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                                        Representan el total de huecos FIFO acumulados en la base de datos del sistema (combinando datos existentes con los nuevos archivos cargados). Podés revisarlos y resolverlos en la sección Calendario.
                                    </span>
                                </div>
                            </div>
                            <button 
                                className="btn-primary" 
                                style={{ 
                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                                    border: 'none', 
                                    padding: '0.55rem 1.1rem', 
                                    fontSize: '0.85rem', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem', 
                                    color: '#fff', 
                                    fontWeight: '600', 
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
                                }}
                                onClick={() => navigate('/calendar?tab=warnings')}
                            >
                                <Sparkles size={16} />
                                Resolver en Calendario →
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '1rem', flex: 1 }}>
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
                                <div key={idx} className="glass-card" style={{ padding: '1.25rem', borderRadius: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', margin: 0, color: '#f8fafc' }}>
                                            <CheckCircle size={20} color="#4ade80" /> {file.filename}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <span className="badge badge-blue" style={{ fontSize: '0.8rem' }}>{file.count} Ops Detectadas</span>
                                            {file.inserted > 0 && <span className="badge" style={{ background: 'rgba(74, 222, 128, 0.2)', color: '#4ade80', fontSize: '0.8rem' }}>+{file.inserted} Nuevas</span>}
                                            {file.skipped > 0 && <span className="badge" style={{ background: 'rgba(251, 146, 60, 0.2)', color: '#fb923c', fontSize: '0.8rem' }}>{file.skipped} Duplicadas</span>}
                                        </div>
                                    </div>

                                    {/* COMPARISON VIEW */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                                        {/* RAW */}
                                        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                            <h5 style={{ color: '#94a3b8', marginBottom: '0.5rem', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>ORIGINAL (Vista Previa "Excel")</h5>
                                            <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                                                {file.raw_sample && file.raw_sample.length > 0 ? (
                                                    <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
                                                        <thead>
                                                            <tr>
                                                                {Object.keys(file.raw_sample[0]).map((key) => (
                                                                    <th key={key} style={{ color: '#38bdf8', fontSize: '0.8rem', padding: '0.5rem' }}>{key}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {file.raw_sample.map((row, rIdx) => (
                                                                <tr key={rIdx}>
                                                                    {Object.values(row).map((val, cIdx) => (
                                                                        <td key={cIdx} style={{ fontSize: '0.8rem', opacity: 0.85, padding: '0.4rem 0.5rem' }}>
                                                                            {String(val).substring(0, 30)}{String(val).length > 30 ? '...' : ''}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : <p style={{ fontSize: '0.85rem', margin: 0 }}>Sin datos legibles</p>}
                                            </div>
                                        </div>

                                        {/* PROCESSED */}
                                        <div style={{ background: 'rgba(6, 182, 212, 0.05)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(6,182,212,0.3)', overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                <h5 style={{ color: '#38bdf8', fontSize: '0.85rem', margin: 0 }}>PROCESADO (Vista Final Contador)</h5>
                                                {uniqueExchanges.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                        <button
                                                            onClick={() => setSelectedExchanges(prev => ({ ...prev, [idx]: 'ALL' }))}
                                                            style={{
                                                                padding: '0.2rem 0.55rem',
                                                                fontSize: '0.75rem',
                                                                borderRadius: '0.35rem',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                background: currentFilter === 'ALL' ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                                                                color: currentFilter === 'ALL' ? '#0f172a' : '#cbd5e1',
                                                                fontWeight: '700',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            Todos ({file.count || file.processed_sample.length} ops)
                                                        </button>
                                                        {uniqueExchanges.map(ex => {
                                                            const count = file.exchange_counts ? file.exchange_counts[ex] : file.processed_sample.filter(tx => getTxExchange(tx) === ex).length;
                                                            return (
                                                                <button
                                                                    key={ex}
                                                                    onClick={() => setSelectedExchanges(prev => ({ ...prev, [idx]: ex }))}
                                                                    style={{
                                                                        padding: '0.2rem 0.55rem',
                                                                        fontSize: '0.75rem',
                                                                        borderRadius: '0.35rem',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        background: currentFilter === ex ? '#38bdf8' : 'rgba(56, 189, 248, 0.12)',
                                                                        color: currentFilter === ex ? '#0f172a' : '#38bdf8',
                                                                        fontWeight: '700',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    {ex} ({count} ops)
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                                                {displaySample && displaySample.length > 0 ? (
                                                    <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
                                                        <thead>
                                                            <tr>
                                                                {Object.keys(displaySample[0]).map((key) => (
                                                                    <th key={key} style={{ color: '#38bdf8', fontSize: '0.8rem', padding: '0.5rem' }}>{key}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {displaySample.map((tx, i) => (
                                                                <tr key={i}>
                                                                    {Object.values(tx).map((val, cIdx) => (
                                                                        <td key={cIdx} style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem', fontWeight: typeof val === 'number' ? 'bold' : 'normal' }}>
                                                                            {val}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : <p style={{ fontSize: '0.85rem', margin: 0 }}>No se detectaron operaciones fiscales en esta muestra para el filtro seleccionado.</p>}
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
