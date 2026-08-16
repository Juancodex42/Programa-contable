import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Calendar, CheckCircle, Clock, Layers, FileSpreadsheet, RefreshCw, CheckSquare, Square, Info, AlertTriangle, ShieldCheck, Sparkles } from 'lucide-react';
import axios from 'axios';
import config from '../config';

function Reports() {
    const navigate = useNavigate();
    const [selectedExchanges, setSelectedExchanges] = useState([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [latestCertDate, setLatestCertDate] = useState(null);
    const [exportFormat, setExportFormat] = useState('consolidated'); // 'consolidated' or 'separated'
    const [exchanges, setExchanges] = useState([]);
    const [previewCount, setPreviewCount] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [loadingExchanges, setLoadingExchanges] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [gaps, setGaps] = useState([]);

    // Modal States
    const [showMappingModal, setShowMappingModal] = useState(false);
    const [mappingPreviewData, setMappingPreviewData] = useState([]);
    const [activeTabIdx, setActiveTabIdx] = useState(0);
    const [uploadingFile, setUploadingFile] = useState(null);

    // Fetch Exchanges & status
    const fetchExchanges = async () => {
        setLoadingExchanges(true);
        try {
            // 1. Load exchanges immediately
            const exRes = await axios.get(`${config.API_URL}/api/exchanges`);
            const rawExchanges = (exRes.data || []).filter(ex => ex.id !== 'manual');
            const list = rawExchanges.map(ex => ({
                id: ex.id,
                name: ex.name,
                type: ex.type,
                status: 'loading',
                lastUpdate: '-',
                msg: ''
            }));
            setExchanges(list);
            
            // Default select all exchanges
            setSelectedExchanges(list.map(ex => ex.name));

            // 2. Load statuses and merge
            const statusRes = await axios.get(`${config.API_URL}/api/status`);
            const statusData = statusRes.data || {};
            setExchanges(prev => prev.map(ex => ({
                ...ex,
                status: statusData[ex.id]?.status || 'online',
                lastUpdate: statusData[ex.id]?.lastUpdate || '-',
                msg: statusData[ex.id]?.msg || ''
            })));
        } catch (err) {
            console.error("Error fetching exchanges/status", err);
        } finally {
            setLoadingExchanges(false);
        }
    };

    const fetchLatestCertDate = async () => {
        try {
            const res = await axios.get(`${config.API_URL}/api/certifications`);
            const latest = res.data?.summary?.latest_end_date;
            if (latest) {
                setLatestCertDate(latest);
            } else {
                setLatestCertDate(null);
            }
        } catch (err) {
            console.error("Error fetching latest certification date:", err);
            setLatestCertDate(null);
        }
    };

    useEffect(() => {
        fetchExchanges();
        fetchLatestCertDate();

        // Auto-refresh certification date when Calendar.jsx saves or deletes a certification
        const onCertUpdated = () => fetchLatestCertDate();
        window.addEventListener('certifications_updated', onCertUpdated);
        return () => window.removeEventListener('certifications_updated', onCertUpdated);
    }, []);

    const datesInverted = dateRange.start && dateRange.end && dateRange.start > dateRange.end;

    // Fetch preview count whenever exchanges or dates change
    useEffect(() => {
        if (selectedExchanges.length === 0 || datesInverted) {
            setPreviewCount(0);
            setGaps([]);
            return;
        }

        const fetchPreview = async () => {
            setLoadingPreview(true);
            try {
                const res = await axios.post(`${config.API_URL}/api/reports/batch-generate`, {
                    exchanges: selectedExchanges,
                    dateStart: dateRange.start,
                    dateEnd: dateRange.end
                });
                setPreviewCount(res.data.count);
                setGaps(res.data.gaps || []);
            } catch (err) {
                console.error("Error fetching preview", err);
                setPreviewCount(null);
                setGaps([]);
            } finally {
                setLoadingPreview(false);
            }
        };

        const delayDebounce = setTimeout(() => {
            fetchPreview();
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [selectedExchanges, dateRange, datesInverted]);

    const toggleSelection = (name) => {
        if (selectedExchanges.includes(name)) {
            setSelectedExchanges(selectedExchanges.filter(item => item !== name));
        } else {
            setSelectedExchanges([...selectedExchanges, name]);
        }
    };

    const selectAllExchanges = () => {
        setSelectedExchanges(exchanges.map(ex => ex.name));
    };

    const deselectAllExchanges = () => {
        setSelectedExchanges([]);
    };

    const formatDateLocal = (date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.trim().split(' ');
        const datePart = parts[0];
        let timePart = parts.length > 1 ? parts[1] : '';
        if (timePart) {
            const cleanTime = timePart.split('.')[0];
            timePart = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime.slice(0, 8);
        }
        const dSub = datePart.split('-');
        if (dSub.length === 3) {
            const formattedDate = `${dSub[2]}/${dSub[1]}/${dSub[0]}`;
            return (timePart && timePart !== '23:59:59') ? `${formattedDate} ${timePart}` : formattedDate;
        }
        if (parts.length > 1) {
            return `${datePart} ${timePart}`;
        }
        if (datePart.split('/').length === 3) {
            return `${datePart} 00:00:00`;
        }
        return dateStr;
    };

    const checkIsStale = (lastUpdate, dateEnd) => {
        if (!dateEnd || !lastUpdate || lastUpdate === '-') return false;
        const parts = lastUpdate.split(' ')[0].split('/');
        if (parts.length === 3) {
            const exDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59`);
            const targetDate = new Date(`${dateEnd}T23:59:59`);
            return exDate < targetDate;
        }
        return false;
    };


    const handlePreset = (type) => {
        const today = new Date();
        let start = '';
        let end = '';

        if (type === 'last_cert') {
            if (latestCertDate) {
                start = latestCertDate;
                end = (dateRange.end && dateRange.end >= latestCertDate) ? dateRange.end : formatDateLocal(today);
            }
        } else if (type === 'current_month') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            start = formatDateLocal(firstDay);
            end = formatDateLocal(lastDay);
        } else if (type === 'last_month') {
            const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
            start = formatDateLocal(firstDay);
            end = formatDateLocal(lastDay);
        } else if (type === 'last_90') {
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 90);
            start = formatDateLocal(pastDate);
            end = formatDateLocal(today);
        } else if (type === 'all') {
            start = '';
            end = '';
        }

        setDateRange({ start, end });
    };

    const openMappingModal = async () => {
        if (selectedExchanges.length === 0) {
            alert("Selecciona al menos un exchange para descargar el reporte.");
            return;
        }
        if (datesInverted) {
            alert("La fecha de inicio debe ser anterior o igual a la fecha de fin.");
            return;
        }
        setLoadingPreview(true);
        try {
            const res = await axios.post(`${config.API_URL}/api/reports/preview-mapping`, {
                exchanges: selectedExchanges,
                dateStart: dateRange.start,
                dateEnd: dateRange.end
            });
            setMappingPreviewData(res.data || []);
            setActiveTabIdx(0);
            setShowMappingModal(true);
        } catch (err) {
            console.error("Error fetching preview mapping", err);
            alert("Error al cargar la previsualización del reporte.");
        } finally {
            setLoadingPreview(false);
        }
    };

    const confirmAndDownload = async () => {
        setShowMappingModal(false);
        await handleBatchDownload();
    };

    const handleModalFileUpload = async (exchangeId, fileOrFiles) => {
        setUploadingFile(exchangeId);
        const formData = new FormData();
        const filesArray = fileOrFiles instanceof FileList || Array.isArray(fileOrFiles) 
            ? Array.from(fileOrFiles) 
            : [fileOrFiles];
        
        filesArray.forEach(file => {
            formData.append('files', file);
        });

        try {
            // Process the uploaded manual file(s)
            const processRes = await axios.post(`${config.API_URL}/process`, formData);
            if (processRes.data && processRes.data.results) {
                const totalCount = processRes.data.results.reduce((sum, r) => sum + (r.count || 0), 0);
                const hasErr = processRes.data.results.some(r => r.error);
                if (hasErr || totalCount === 0) {
                    const errDetail = processRes.data.results.find(r => r.error)?.error;
                    alert(errDetail || "No se detectaron transacciones válidas en la planilla cargada. Asegúrate de subir el extracto original del exchange o una Planilla Consolidada (Excel Maestro).");
                }
            }
            
            // Refresh preview mapping data in the modal
            const res = await axios.post(`${config.API_URL}/api/reports/preview-mapping`, {
                exchanges: selectedExchanges,
                dateStart: dateRange.start,
                dateEnd: dateRange.end
            });
            setMappingPreviewData(res.data || []);
            
            // Trigger refresh of main page preview transactions count
            const generateRes = await axios.post(`${config.API_URL}/api/reports/batch-generate`, {
                exchanges: selectedExchanges,
                dateStart: dateRange.start,
                dateEnd: dateRange.end
            });
            setPreviewCount(generateRes.data.count);
        } catch (err) {
            console.error("Error uploading file in modal", err);
            const errData = err.response?.data;
            if (errData && errData.error === 'missing_columns') {
                const ex = (errData.exchange || 'el archivo').toUpperCase();
                const missingStr = Array.isArray(errData.missing) ? errData.missing.join(', ') : (errData.missing || 'Encabezados requeridos');
                const availStr = Array.isArray(errData.available) ? errData.available.slice(0, 15).join(', ') : (errData.available || 'Ninguna');
                alert(`Error al procesar (${ex}): Faltan columnas en la planilla.\n\n` +
                      `• Columnas requeridas no encontradas: ${missingStr}\n` +
                      `• Columnas detectadas en tu archivo: ${availStr}\n\n` +
                      `Por favor verifica que estés subiendo el archivo CSV o Excel original exportado de la plataforma sin alterar los encabezados.`);
            } else {
                const serverMsg = errData?.error || errData?.message;
                alert(serverMsg ? `Error al procesar: ${serverMsg}` : "Error al cargar y procesar el archivo. Revisa el formato o reintenta con el Excel/CSV original de Binance.");
            }
        } finally {
            setUploadingFile(null);
        }
    };

    const handleBatchDownload = async () => {
        setDownloading(true);
        try {
            const response = await axios.post(`${config.API_URL}/api/reports/batch-download`, {
                exchanges: selectedExchanges,
                dateStart: dateRange.start,
                dateEnd: dateRange.end,
                format: exportFormat
            }, { responseType: 'blob' });

            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const year = dateRange.start ? dateRange.start.substring(0, 4) : "Batch";
            const filename = exportFormat === 'separated' 
                ? `Reportes_Separados_${year}.zip` 
                : `Reporte_Consolidado_${year}.xlsx`;

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error downloading batch", error);
            alert("Error al descargar el reporte consolidado.");
        } finally {
            setDownloading(false);
        }
    };

    // Calculate stale exchanges (lastUpdate is older than dateRange.end)
    const getStaleExchanges = () => {
        if (!dateRange.end) return [];
        const targetDate = new Date(dateRange.end + 'T23:59:59');
        const stale = [];

        exchanges.forEach(ex => {
            if (!selectedExchanges.includes(ex.name)) return;
            if (ex.lastUpdate === '-' || !ex.lastUpdate) return;

            // Parse DD/MM/YYYY
            const parts = ex.lastUpdate.split(' ')[0].split('/');
            if (parts.length === 3) {
                const exDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T23:59:59`);
                if (exDate < targetDate) {
                    stale.push({
                        name: ex.name,
                        lastUpdate: ex.lastUpdate.split(' ')[0]
                    });
                }
            }
        });
        return stale;
    };

    const staleExchanges = getStaleExchanges();
    const exchangesWithErrors = exchanges.filter(ex => selectedExchanges.includes(ex.name) && ['expired', 'offline'].includes(ex.status));

    return (
        <div style={{ padding: '1.25rem 2rem', maxWidth: '1400px', margin: '1rem auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 2rem)', boxSizing: 'border-box', overflow: 'hidden' }}>
            <header style={{ marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', margin: 0, background: 'linear-gradient(to right, #38bdf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '800' }}>
                        Reportes Continuos
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>
                        Genera y descarga reportes personalizados a partir del historial acumulado en la base de datos.
                    </p>
                </div>
                <button 
                    onClick={fetchExchanges} 
                    style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                >
                    <RefreshCw size={14} className={loadingExchanges ? "spin" : ""} /> Recargar Estados
                </button>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                
                {/* COLUMN 1: EXCHANGES SELECTION */}
                <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', borderRadius: '1rem', height: '100%', overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: '#f8fafc' }}>1. Seleccionar Exchanges</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>Elige las plataformas que quieres incluir en el reporte.</p>
                    
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                        <button 
                            onClick={selectAllExchanges}
                            style={{ flex: 1, padding: '0.5rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '0.375rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                        >
                            Seleccionar Todos
                        </button>
                        <button 
                            onClick={deselectAllExchanges}
                            style={{ flex: 1, padding: '0.5rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '0.375rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                        >
                            Limpiar Selección
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
                        {exchanges.map(ex => {
                            const isSelected = selectedExchanges.includes(ex.name);
                            const hasError = ['expired', 'offline'].includes(ex.status);
                            return (
                                <div
                                    key={ex.name}
                                    style={{
                                        padding: '1rem',
                                        borderRadius: '0.75rem',
                                        border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                                        background: isSelected ? 'rgba(6,182,212,0.05)' : 'rgba(30, 41, 59, 0.4)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        transition: 'all 0.2s',
                                        opacity: hasError && !isSelected ? 0.7 : 1
                                    }}
                                    onClick={() => toggleSelection(ex.name)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {isSelected ? (
                                            <CheckSquare size={18} color="var(--accent-cyan)" />
                                        ) : (
                                            <Square size={18} color="var(--text-secondary)" />
                                        )}
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                {ex.name} {hasError && <AlertTriangle size={14} color="#ef4444" title={ex.msg || "Error de conexión"} />}
                                            </h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                                                <Clock size={12} />
                                                <span>Act: {formatDateDisplay(ex.lastUpdate)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <span style={{ 
                                        fontSize: '0.7rem', 
                                        padding: '0.15rem 0.5rem', 
                                        borderRadius: '1rem',
                                        background: ex.status === 'online' ? 'rgba(74, 222, 128, 0.15)' : (ex.status === 'unconfigured' || ex.status === 'loading') ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                        color: ex.status === 'online' ? '#4ade80' : (ex.status === 'unconfigured' || ex.status === 'loading') ? '#f59e0b' : '#ef4444',
                                        fontWeight: '600'
                                    }}>
                                        {ex.status === 'online' ? 'ONLINE' : ex.status === 'expired' ? 'VENCIDA' : ex.status === 'unconfigured' ? 'SIN KEYS' : ex.status === 'loading' ? '...' : 'OFFLINE'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* COLUMN 2: TEMPORAL FILTER (DATES) */}
                <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', borderRadius: '1rem', height: '100%', overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: '#f8fafc' }}>2. Rango Temporal</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>Elige las fechas límite para las operaciones contables.</p>

                    <div style={{ display: 'grid', gap: '1.25rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Fecha de Inicio</label>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                                <Calendar 
                                    size={18} 
                                    color="#38bdf8" 
                                    style={{ marginRight: '0.75rem', cursor: 'pointer' }} 
                                    title="Abrir calendario visual"
                                    onClick={(e) => {
                                        const inp = e.currentTarget.parentElement.querySelector('input[type="date"]');
                                        if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch(err){} }
                                    }}
                                />
                                <input 
                                    type="date" 
                                    style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '0.95rem' }} 
                                    value={dateRange.start ? dateRange.start.split(' ')[0] : ''} 
                                    onChange={e => setDateRange({ ...dateRange, start: e.target.value })} 
                                />
                            </div>
                            {dateRange.start && dateRange.start.includes(' ') && (
                                <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '600' }}>
                                    <Clock size={12} />
                                    <span>Inicio exacto: {formatDateDisplay(dateRange.start)}</span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Fecha de Fin</label>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                                <Calendar 
                                    size={18} 
                                    color="#38bdf8" 
                                    style={{ marginRight: '0.75rem', cursor: 'pointer' }} 
                                    title="Abrir calendario visual"
                                    onClick={(e) => {
                                        const inp = e.currentTarget.parentElement.querySelector('input[type="date"]');
                                        if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch(err){} }
                                    }}
                                />
                                <input 
                                    type="date" 
                                    style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '0.95rem' }} 
                                    value={dateRange.end ? dateRange.end.split(' ')[0] : ''} 
                                    onChange={e => setDateRange({ ...dateRange, end: e.target.value })} 
                                />
                            </div>
                            {dateRange.end && dateRange.end.includes(' ') && (
                                <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '600' }}>
                                    <Clock size={12} />
                                    <span>Fin exacto: {formatDateDisplay(dateRange.end)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {datesInverted && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
                            <AlertTriangle size={16} color="#f87171" style={{ flexShrink: 0 }} />
                            <span style={{ color: '#fca5a5', fontSize: '0.8rem', fontWeight: '600' }}>
                                La fecha de inicio debe ser anterior o igual a la fecha de fin.
                            </span>
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
                        <button 
                            onClick={() => handlePreset('last_cert')}
                            disabled={!latestCertDate}
                            title={latestCertDate ? `Establecer fecha de inicio en la última certificación (${formatDateDisplay(latestCertDate)})` : 'No hay certificaciones registradas'}
                            style={{ 
                                width: '100%',
                                padding: '0.65rem 0.75rem', 
                                background: latestCertDate ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 41, 59, 0.4)', 
                                border: latestCertDate ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid var(--border-color)', 
                                color: latestCertDate ? '#38bdf8' : 'var(--text-secondary)', 
                                borderRadius: '0.5rem', 
                                fontSize: '0.85rem', 
                                cursor: latestCertDate ? 'pointer' : 'not-allowed', 
                                transition: 'all 0.2s', 
                                fontWeight: '600',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                marginBottom: '1.25rem',
                                opacity: latestCertDate ? 1 : 0.65
                            }}
                        >
                            <ShieldCheck size={16} color={latestCertDate ? "#38bdf8" : "var(--text-secondary)"} />
                            {latestCertDate 
                                ? `Desde Últ. Certificación (${formatDateDisplay(latestCertDate)})` 
                                : 'Sin Certificación Previa'}
                        </button>

                        <h4 style={{ fontSize: '0.9rem', color: '#f8fafc', margin: '0 0 0.75rem 0', fontWeight: '700' }}>Atajos Rápidos</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button 
                                onClick={() => handlePreset('current_month')}
                                style={{ padding: '0.6rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', color: '#cbd5e1', borderRadius: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', fontWeight: '500' }}
                            >
                                Mes Actual
                            </button>
                            <button 
                                onClick={() => handlePreset('last_month')}
                                style={{ padding: '0.6rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', color: '#cbd5e1', borderRadius: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', fontWeight: '500' }}
                            >
                                Mes Anterior
                            </button>
                            <button 
                                onClick={() => handlePreset('last_90')}
                                style={{ padding: '0.6rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', color: '#cbd5e1', borderRadius: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', fontWeight: '500' }}
                            >
                                Últimos 90 Días
                            </button>
                            <button 
                                onClick={() => handlePreset('all')}
                                style={{ padding: '0.6rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', color: '#cbd5e1', borderRadius: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', fontWeight: '500' }}
                            >
                                Todo el Histórico
                            </button>
                        </div>
                    </div>
                </div>

                {/* COLUMN 3: FORMAT & ACTION */}
                <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', borderRadius: '1rem', height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 0.25rem 0', color: '#f8fafc' }}>3. Exportar y Descargar</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>Elige el formato de salida para presentar al contador.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div 
                                onClick={() => setExportFormat('consolidated')}
                                style={{
                                    padding: '1.2rem',
                                    borderRadius: '0.75rem',
                                    border: exportFormat === 'consolidated' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                                    background: exportFormat === 'consolidated' ? 'rgba(6,182,212,0.05)' : 'rgba(30, 41, 59, 0.3)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <FileSpreadsheet size={28} color={exportFormat === 'consolidated' ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#f8fafc' }}>Libro Consolidado</h4>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>Un único Excel con todas las operaciones unificadas cronológicamente.</p>
                                </div>
                            </div>

                            <div 
                                onClick={() => setExportFormat('separated')}
                                style={{
                                    padding: '1.2rem',
                                    borderRadius: '0.75rem',
                                    border: exportFormat === 'separated' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                                    background: exportFormat === 'separated' ? 'rgba(6,182,212,0.05)' : 'rgba(30, 41, 59, 0.3)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Layers size={28} color={exportFormat === 'separated' ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '700', color: '#f8fafc' }}>Archivos Separados (ZIP)</h4>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>Genera planillas Excel individuales empaquetadas en un archivo comprimido ZIP.</p>
                                </div>
                            </div>
                        </div>

                        {/* WARNING BANNERS FOR API ERRORS & STALE DATA */}
                        {exchangesWithErrors.length > 0 && (
                            <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#fca5a5', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <AlertTriangle size={15} color="#ef4444" /> Advertencia de API
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                                    Los siguientes exchanges seleccionados tienen problemas de conexión. El reporte generado podría no contener información reciente de:
                                    <ul style={{ margin: '0.2rem 0 0 0', paddingLeft: '1.1rem', maxHeight: '130px', overflowY: 'auto' }}>
                                        {exchangesWithErrors.map(ex => (
                                            <li key={ex.name}><strong>{ex.name}:</strong> {ex.msg || 'Credenciales inválidas o error de red.'}</li>
                                        ))}
                                    </ul>
                                </span>
                            </div>
                        )}

                        {staleExchanges.length > 0 && (
                            <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '0.75rem', padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#fde68a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Info size={15} color="#f59e0b" /> Datos Desactualizados
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                                    El periodo solicitado finaliza el {dateRange.end}, pero los siguientes exchanges no registran datos hasta esa fecha:
                                    <ul style={{ margin: '0.2rem 0 0 0', paddingLeft: '1.1rem', maxHeight: '130px', overflowY: 'auto' }}>
                                        {staleExchanges.map(ex => (
                                            <li key={ex.name}><strong>{ex.name}:</strong> última sincronización el {formatDateDisplay(ex.lastUpdate)}</li>
                                        ))}
                                    </ul>
                                </span>
                            </div>
                        )}

                        {gaps && gaps.length > 0 && (
                            <div style={{ 
                                background: 'rgba(245, 158, 11, 0.08)', 
                                border: '1px solid rgba(245, 158, 11, 0.3)', 
                                borderRadius: '0.75rem', 
                                padding: '0.85rem 1rem', 
                                marginBottom: '1rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                gap: '1rem',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                    <div style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '0.45rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center' }}>
                                        <AlertTriangle size={18} color="#fbbf24" />
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.86rem', color: '#fef08a', fontWeight: '700', display: 'block' }}>
                                            {gaps.length} Faltante(s) de Historial (Huecos FIFO / P2P)
                                        </span>
                                        <span style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.3' }}>
                                            Se detectaron ventas sin compras previas registradas. Podes completar la información en el Calendario.
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    className="btn-primary" 
                                    style={{ 
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                                        border: 'none', 
                                        padding: '0.45rem 0.9rem', 
                                        fontSize: '0.8rem', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.4rem', 
                                        color: '#fff', 
                                        fontWeight: '600', 
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer' 
                                    }}
                                    onClick={() => navigate('/calendar?tab=warnings')}
                                >
                                    <Sparkles size={14} />
                                    Resolver en Calendario →
                                </button>
                            </div>
                        )}

                        {/* PREVIEW STATUS CARD */}
                        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <Info size={20} color={previewCount > 0 ? "var(--accent-cyan)" : "#ef4444"} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                {selectedExchanges.length === 0 ? (
                                    <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                                        Selecciona al menos un exchange para consultar operaciones.
                                    </span>
                                ) : datesInverted ? (
                                    <span style={{ fontSize: '0.85rem', color: '#fca5a5' }}>
                                        Filtro de fechas incoherente.
                                    </span>
                                ) : loadingPreview ? (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <RefreshCw size={12} className="spin" /> Calculando registros disponibles...
                                    </span>
                                ) : previewCount !== null ? (
                                    <span style={{ fontSize: '0.85rem', color: previewCount > 0 ? '#cbd5e1' : '#fca5a5', fontWeight: '500' }}>
                                        {previewCount > 0 
                                            ? `Se detectaron ${previewCount} transacciones en la base de datos.` 
                                            : "No se encontraron operaciones con los filtros actuales."
                                        }
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>Error al consultar disponibilidad.</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* PINNED DOWNLOAD BUTTON AT CARD FOOTER */}
                    <div style={{ paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                        <button
                            className="btn-primary"
                            onClick={openMappingModal}
                            disabled={downloading || loadingPreview || !previewCount || previewCount === 0 || selectedExchanges.length === 0 || datesInverted}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: (downloading || loadingPreview || !previewCount || previewCount === 0 || selectedExchanges.length === 0 || datesInverted) ? 0.5 : 1,
                                cursor: (downloading || loadingPreview || !previewCount || previewCount === 0 || selectedExchanges.length === 0 || datesInverted) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {downloading ? (
                                <>
                                    <RefreshCw size={20} className="spin" /> GENERANDO REPORTE...
                                </>
                            ) : selectedExchanges.length === 0 ? (
                                "SELECCIONA EXCHANGES"
                            ) : datesInverted ? (
                                "ERROR DE FECHAS"
                            ) : previewCount === 0 ? (
                                "SIN OPERACIONES"
                            ) : (
                                <>
                                    <Download size={20} /> 
                                    {exportFormat === 'separated' ? 'DESCARGAR ZIP' : 'DESCARGAR EXCEL MAESTRO'}
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>

            {/* MAPPING PREVIEW & VALIDATION MODAL */}
            {showMappingModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '1.5rem'
                }}>
                    <div className="glass-card" style={{
                        width: '100%',
                        maxWidth: '750px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(30, 41, 59, 0.95)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                        borderRadius: '1rem',
                        overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{ 
                            padding: '1.25rem 1.5rem', 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#38bdf8' }}>
                                    Confirmación de Reporte y Mapeo de Columnas
                                </h3>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    Verifica cómo se relacionan las columnas antes de generar el Excel contable.
                                </p>
                            </div>

                            {/* Rango Temporal de Paso 2 */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                justifyContent: 'center',
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                borderRadius: '0.5rem',
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.8rem',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                flexShrink: 0
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Desde:</span>
                                    <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                                        {dateRange.start ? formatDateDisplay(dateRange.start) : 'Inicio Histórico'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Hasta:</span>
                                    <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
                                        {dateRange.end ? formatDateDisplay(dateRange.end) : 'Fecha Actual'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ 
                            display: 'flex', 
                            background: 'rgba(15, 23, 42, 0.4)', 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            padding: '0.5rem 1rem 0 1rem',
                            gap: '0.4rem',
                            overflowX: 'auto'
                        }}>
                            {mappingPreviewData.map((item, idx) => {
                                const isActive = activeTabIdx === idx;
                                const isStale = item.isStale || (dateRange.end && item.lastUpdate !== '-' && checkIsStale(item.lastUpdate, dateRange.end));
                                const statusColor = item.isReady 
                                    ? '#4ade80' // Green
                                    : isStale 
                                        ? '#f59e0b' // Yellow for stale data
                                        : (!item.isApi && item.transactionCount === 0) 
                                            ? '#f59e0b' // Yellow
                                            : '#ef4444'; // Red
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTabIdx(idx)}
                                        style={{
                                            padding: '0.6rem 1.1rem',
                                            background: isActive ? 'var(--card-bg)' : 'transparent',
                                            border: '1px solid ' + (isActive ? 'rgba(56, 189, 248, 0.2)' : 'transparent'),
                                            borderBottom: '1px solid ' + (isActive ? 'rgba(30, 41, 59, 0.95)' : 'transparent'),
                                            borderTopLeftRadius: '0.5rem',
                                            borderTopRightRadius: '0.5rem',
                                            color: isActive ? '#f8fafc' : 'var(--text-secondary)',
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            whiteSpace: 'nowrap',
                                            marginBottom: '-1px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }}></span>
                                        {item.name}
                                        {isStale && <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontWeight: 'bold' }}>VIEJO</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab Content */}
                        <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                            {(() => {
                                const current = mappingPreviewData[activeTabIdx];
                                if (!current) return null;

                                const isStale = current.isStale || (dateRange.end && current.lastUpdate !== '-' && checkIsStale(current.lastUpdate, dateRange.end));
                                const isManualNoData = !current.isApi && current.transactionCount === 0;

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <div>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    Origen de datos
                                                </span>
                                                <h4 style={{ margin: '0.15rem 0 0 0', fontSize: '1rem', color: '#f8fafc' }}>
                                                    {current.isApi 
                                                        ? `🔌 Conexión API integrada (Estado: ${current.status.toUpperCase()})` 
                                                        : `📁 Planilla de importación CSV / Manual (${current.transactionCount} ops detectadas)`
                                                    }
                                                </h4>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>
                                                    Última sincronización
                                                </span>
                                                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.9rem', color: isStale ? '#f59e0b' : '#38bdf8', fontWeight: 'bold' }}>
                                                    {formatDateDisplay(current.lastUpdate)} {isStale && '(Desactualizado)'}
                                                </p>
                                            </div>
                                        </div>

                                        {!current.isApi && isStale && (
                                            <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', borderRadius: '0.6rem', padding: '0.85rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.82rem', color: '#fde68a', lineHeight: '1.4' }}>
                                                    <strong>Atención:</strong> Las operaciones registradas para <strong>{current.name}</strong> llegan hasta el <strong>{formatDateDisplay(current.lastUpdate)}</strong>, pero el periodo del reporte configurado en el Paso 2 finaliza el <strong>{formatDateDisplay(dateRange.end)}</strong>. Arrastra a continuación una planilla CSV actualizada para cubrir el rango temporal.
                                                </span>
                                            </div>
                                        )}

                                        {isManualNoData ? (
                                            /* Dropzone for manual exchange with no data */
                                            <div 
                                                style={{
                                                    border: '2px dashed ' + (uploadingFile === current.id ? 'var(--accent-cyan)' : '#f59e0b'),
                                                    borderRadius: '0.75rem',
                                                    padding: '2.5rem 1.5rem',
                                                    background: uploadingFile === current.id ? 'rgba(6, 182, 212, 0.04)' : 'rgba(245, 158, 11, 0.03)',
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flex: 1
                                                }}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                        handleModalFileUpload(current.id, e.dataTransfer.files);
                                                    }
                                                }}
                                                onClick={() => document.getElementById(`modal-file-input-${current.id}`).click()}
                                            >
                                                <input 
                                                    type="file" 
                                                    id={`modal-file-input-${current.id}`} 
                                                    multiple
                                                    hidden 
                                                    onChange={(e) => {
                                                        if (e.target.files && e.target.files.length > 0) {
                                                            handleModalFileUpload(current.id, e.target.files);
                                                        }
                                                    }} 
                                                />
                                                <Layers size={40} color="#f59e0b" style={{ marginBottom: '0.75rem', animation: uploadingFile === current.id ? 'spin 1.5s linear infinite' : 'none' }} />
                                                <h4 style={{ margin: '0 0 0.4rem 0', color: '#f8fafc', fontSize: '1rem', fontWeight: 'bold' }}>
                                                    {uploadingFile === current.id ? "Procesando planilla..." : "Sin transacciones suficientes en este periodo"}
                                                </h4>
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '440px', margin: 0, lineHeight: '1.4' }}>
                                                    No hay registros de {current.name} para cubrir el periodo {dateRange.start ? `desde el ${formatDateDisplay(dateRange.start)} ` : ''}hasta {formatDateDisplay(dateRange.end) || 'la fecha actual'}. Arrastra aquí la planilla contable correspondiente para cargarla al vuelo.
                                                </p>
                                            </div>
                                        ) : current.isApi ? (
                                            /* Info for API connection */
                                            <div style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)', borderRadius: '0.75rem', padding: '2rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                                                <CheckCircle size={44} color="#4ade80" style={{ marginBottom: '0.75rem' }} />
                                                <h4 style={{ margin: '0 0 0.4rem 0', color: '#f8fafc', fontSize: '1.05rem', fontWeight: 'bold' }}>
                                                    Integración API Lista y Sincronizada
                                                </h4>
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '480px', margin: 0, lineHeight: '1.4' }}>
                                                    Las columnas de esta plataforma se importan automáticamente a través de la API en tiempo real. Todas las equivalencias están 100% preestablecidas y validadas por el sistema.
                                                </p>
                                            </div>
                                        ) : (
                                            /* Mapping table for CSV/Manual exchange WITH Dropzone banner */
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {/* Compact Dropzone to allow updating CSV even if existing data exists */}
                                                <div 
                                                    style={{
                                                        border: '2px dashed ' + (uploadingFile === current.id ? 'var(--accent-cyan)' : isStale ? '#f59e0b' : 'rgba(56, 189, 248, 0.3)'),
                                                        borderRadius: '0.5rem',
                                                        padding: '0.85rem 1rem',
                                                        background: uploadingFile === current.id ? 'rgba(6, 182, 212, 0.08)' : isStale ? 'rgba(245, 158, 11, 0.05)' : 'rgba(30, 41, 59, 0.4)',
                                                        textAlign: 'center',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '0.75rem',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                            handleModalFileUpload(current.id, e.dataTransfer.files);
                                                        }
                                                    }}
                                                    onClick={() => document.getElementById(`modal-file-input-${current.id}`).click()}
                                                >
                                                    <input 
                                                        type="file" 
                                                        id={`modal-file-input-${current.id}`} 
                                                        multiple
                                                        hidden 
                                                        onChange={(e) => {
                                                            if (e.target.files && e.target.files.length > 0) {
                                                                handleModalFileUpload(current.id, e.target.files);
                                                            }
                                                        }} 
                                                    />
                                                    <Layers size={20} color={isStale ? '#f59e0b' : '#38bdf8'} style={{ animation: uploadingFile === current.id ? 'spin 1.5s linear infinite' : 'none' }} />
                                                    <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: '600' }}>
                                                        {uploadingFile === current.id 
                                                            ? "Procesando nueva planilla..." 
                                                            : isStale 
                                                                ? `📥 Arrastra aquí o haz clic para cargar un CSV actualizado para ${current.name}` 
                                                                : `📥 ¿Deseas actualizar los datos? Arrastra un nuevo CSV para ${current.name}`
                                                        }
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '0.75rem 1rem', borderRadius: '0.5rem' }}>
                                                    <CheckCircle size={16} color="#4ade80" />
                                                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: '500' }}>
                                                        Columnas validadas. Se detectaron {current.transactionCount} registros en la base de datos para este periodo.
                                                    </span>
                                                </div>
                                                
                                                <div style={{ overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                        <thead>
                                                            <tr style={{ background: 'rgba(0, 0, 0, 0.3)', borderBottom: '1px solid var(--border-color)' }}>
                                                                <th style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>PLANTILLA CONTABLE (IDEAL)</th>
                                                                <th style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>COLUMNA DETECTADA</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {Object.entries(current.mapping).map(([field, colName]) => {
                                                                const cleanField = field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ');
                                                                return (
                                                                    <tr key={field} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                                        <td style={{ padding: '0.65rem 1rem', color: '#f1f5f9', fontWeight: '600' }}>{cleanField}</td>
                                                                        <td style={{ padding: '0.65rem 1rem', color: '#cbd5e1' }}>
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }}></span>
                                                                                {colName || "N/A"}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.2)' }}>
                            <div>
                                <button
                                    onClick={() => setShowMappingModal(false)}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-secondary)',
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                {/* Navigation buttons */}
                                <button
                                    onClick={() => setActiveTabIdx(prev => Math.max(0, prev - 1))}
                                    disabled={activeTabIdx === 0}
                                    style={{
                                        background: 'rgba(30, 41, 59, 0.6)',
                                        border: '1px solid var(--border-color)',
                                        color: activeTabIdx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)',
                                        padding: '0.6rem 1rem',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.85rem',
                                        cursor: activeTabIdx === 0 ? 'not-allowed' : 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    ◄ Anterior
                                </button>
                                
                                {activeTabIdx < mappingPreviewData.length - 1 ? (
                                    <button
                                        onClick={() => setActiveTabIdx(prev => Math.min(mappingPreviewData.length - 1, prev + 1))}
                                        style={{
                                            background: 'rgba(30, 41, 59, 0.6)',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-primary)',
                                            padding: '0.6rem 1rem',
                                            borderRadius: '0.5rem',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        Siguiente ➔
                                    </button>
                                ) : (
                                    <button
                                        onClick={confirmAndDownload}
                                        disabled={downloading}
                                        style={{
                                            background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))',
                                            color: 'white',
                                            border: 'none',
                                            padding: '0.6rem 1.4rem',
                                            borderRadius: '0.5rem',
                                            fontSize: '0.85rem',
                                            cursor: downloading ? 'not-allowed' : 'pointer',
                                            fontWeight: 'bold',
                                            opacity: downloading ? 0.5 : 1
                                        }}
                                    >
                                        Confirmar y Descargar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Reports;
