import { useState, useEffect } from 'react';
import { useFileContext } from '../context/FileContext';
import config from '../config';
import { UploadCloud, FileText, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

function Home() {
    const [isDragging, setIsDragging] = useState(false);
    const [gaps, setGaps] = useState([]);
    
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
        const formData = new FormData();
        fileList.forEach(f => formData.append('files', f));

        try {
            const res = await axios.post(`${config.API_URL}/process`, formData);
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

            {gaps && gaps.length > 0 && (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#fde68a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={18} color="#f59e0b" /> ¡Atención! Faltantes de Historial Detectados (Huecos)
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        Para que el cálculo FIFO de impuestos sea real y no asuma costo $0, se sugiere subir los archivos de compras que cubran los siguientes períodos/exchanges:
                        <ul style={{ margin: '0.3rem 0 0 0', paddingLeft: '1.2rem' }}>
                            {gaps.map((gap, idx) => (
                                <li key={idx}>
                                    <strong>{gap.exchange}:</strong> Venta de {gap.sold_qty} {gap.coin} el {gap.date.split(' ')[0]} (Faltan comprar {gap.deficit.toFixed(4)} {gap.coin}).
                                </li>
                            ))}
                        </ul>
                    </span>
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
                                    {['Binance Spot', 'Binance P2P', 'Bitso Alpha', 'Fiwind', 'Ripio Classic', 'Ripio Trade'].map(ex => (
                                        <span key={ex} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '500', background: 'rgba(56, 189, 248, 0.1)', color: '#f1f5f9', padding: '0.35rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                                            <CheckCircle size={14} color="#38bdf8" /> {ex}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: DROPZONE & ACTIONS */}
                        <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '1rem' }}>
                            <div 
                                className="upload-zone" 
                                style={{ 
                                    padding: '2rem 1.5rem', 
                                    flex: 1, 
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
                                <h3 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#f8fafc', margin: '0 0 0.4rem 0' }}>Arrastra tus archivos o haz click aquí</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0, textAlign: 'center', maxWidth: '380px', lineHeight: '1.4' }}>
                                    Soporta planillas Excel (Fiwind), CSV (Ripio/Bitso), ZIP (Binance) y TXT (Ripio).
                                </p>
                            </div>

                            {fileList.length > 0 && (
                                <div style={{ marginTop: '1.25rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem 0', color: '#f8fafc' }}>Archivos seleccionados ({fileList.length}):</h4>
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '110px', overflowY: 'auto' }}>
                                        {fileList.map((f, i) => (
                                            <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '0.375rem', marginBottom: '0.3rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                                                    <FileText size={16} color="#38bdf8" /> {f.name}
                                                </span>
                                                <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>Pendiente</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <button
                                        className="btn-primary"
                                        style={{ width: '100%', marginTop: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', fontSize: '1rem', fontWeight: 'bold' }}
                                        onClick={processFiles}
                                        disabled={processing}
                                    >
                                        {processing ? <Loader2 className="spin" size={20} /> : "PROCESAR ARCHIVOS"}
                                    </button>
                                    {processing && <p style={{ textAlign: 'center', marginTop: '0.5rem', color: '#4ade80', fontSize: '0.85rem', margin: 0 }}>Analizando transacciones... Esto puede demorar unos segundos...</p>}
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
                        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
                            <span style={{ fontSize: '0.9rem', color: '#fca5a5', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <AlertTriangle size={18} color="#ef4444" /> Advertencias de Consistencia Detectadas
                            </span>
                            <ul style={{ margin: '0.3rem 0 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                                {results.warnings.map((warn, wIdx) => (
                                    <li key={wIdx}>{warn}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '1rem', flex: 1 }}>
                        {results.files.map((file, idx) => (
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
                                        <h5 style={{ color: '#38bdf8', marginBottom: '0.5rem', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>PROCESADO (Vista Final Contador)</h5>
                                        <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                                            {file.processed_sample && file.processed_sample.length > 0 ? (
                                                <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
                                                    <thead>
                                                        <tr>
                                                            {Object.keys(file.processed_sample[0]).map((key) => (
                                                                <th key={key} style={{ color: '#38bdf8', fontSize: '0.8rem', padding: '0.5rem' }}>{key}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {file.processed_sample.map((tx, i) => (
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
                                            ) : <p style={{ fontSize: '0.85rem', margin: 0 }}>No se detectaron operaciones fiscales en esta muestra.</p>}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}

export default Home;
