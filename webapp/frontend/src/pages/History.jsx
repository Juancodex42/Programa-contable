import { useState, useEffect } from 'react';
import { Database, FileText, Calendar, Loader2, AlertTriangle } from 'lucide-react';
import axios from 'axios';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import config from '../config';
import { Link } from 'react-router-dom';

function History() {
    const [history, setHistory] = useState([]);
    const [gaps, setGaps] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const [hRes, gRes] = await Promise.all([
                    axios.get(`${config.API_URL}/api/history`),
                    axios.get(`${config.API_URL}/api/reports/gaps`)
                ]);
                setHistory(hRes.data);
                setGaps(gRes.data.gaps || []);
            } catch (err) {
                console.error("Error fetching history or gaps", err);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, []);

    const downloadOriginal = async (filename) => {
        // Feature for future: Download original file?
        // Or re-download processed excel for just this file?
        // Let's use the new download endpoint for single file
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

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Cargando historial...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <h2 style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database /> Historial de Archivos
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Registro de todos los archivos procesados y guardados en la base de datos.
            </p>

            {gaps && gaps.length > 0 && (
                <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#fde68a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={18} color="#f59e0b" /> Advertencia: Historial Incompleto (Huecos)
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        Los datos generados a continuación podrían tener inconsistencias fiscales porque faltan registrar compras para:
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

            {/* Banner redirecting to Reports for consolidated downloads */}
            <div className="glass-card" style={{ 
                padding: '1rem 1.25rem', 
                marginBottom: '2rem', 
                background: 'rgba(6, 182, 212, 0.05)', 
                borderColor: 'rgba(6, 182, 212, 0.2)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'rgba(6, 182, 212, 0.15)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Database size={18} color="var(--accent-cyan)" />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#f8fafc', fontWeight: '700' }}>¿Deseas consolidar o filtrar reportes?</h4>
                        <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Para descargar reportes agrupados por exchange o en un rango de fechas personalizado, utiliza la sección de reportes continuos.
                        </p>
                    </div>
                </div>
                <a 
                    href="/reports" 
                    className="btn-primary" 
                    style={{ 
                        padding: '0.5rem 1rem', 
                        fontSize: '0.85rem', 
                        textDecoration: 'none', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        fontWeight: '600',
                        borderRadius: '0.375rem'
                    }}
                >
                    Ir a Reportes Continuos
                </a>
            </div>

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
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem' }}
                                            onClick={() => downloadOriginal(item.filename)}
                                        >
                                            Descargar
                                        </button>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
export default History;
