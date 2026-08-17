import { useState, useEffect } from 'react';
import { Plug, Save, RefreshCw, CheckCircle, AlertCircle, Shield, Check, Info } from 'lucide-react';
import axios from 'axios';
import config from '../config';

function APIs() {
    const [envKeys, setEnvKeys] = useState({});
    const [apiStatuses, setApiStatuses] = useState({});
    const [bgSyncEnabled, setBgSyncEnabled] = useState(false);
    const [editingEx, setEditingEx] = useState(null);
    const [formData, setFormData] = useState({ key: '', secret: '', password: '' });
    const [syncing, setSyncing] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [syncResults, setSyncResults] = useState(null);
    const [serverError, setServerError] = useState(null);

    const defaultApiExchanges = [
        { id: 'binance', name: 'Binance', keyName: 'BINANCE_API_KEY', secretName: 'BINANCE_API_SECRET', statusKey: 'binance' },
        { id: 'bitso', name: 'Bitso', keyName: 'BITSO_API_KEY', secretName: 'BITSO_API_SECRET', statusKey: 'bitso' },
        { id: 'ripio_trade', name: 'Ripio Trade', keyName: 'RIPIO_API_KEY', secretName: 'RIPIO_API_SECRET', statusKey: 'ripio_trade' },
        { id: 'okx', name: 'OKX', keyName: 'OKX_API_KEY', secretName: 'OKX_API_SECRET', statusKey: 'okx', needsPassword: true },
        { id: 'bybit', name: 'Bybit', keyName: 'BYBIT_API_KEY', secretName: 'BYBIT_API_SECRET', statusKey: 'bybit' },
        { id: 'bitget', name: 'Bitget', keyName: 'BITGET_API_KEY', secretName: 'BITGET_API_SECRET', statusKey: 'bitget', needsPassword: true }
    ];

    const [dynamicExchanges, setDynamicExchanges] = useState(defaultApiExchanges);

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async (forceStatusRefresh = false) => {
        if (forceStatusRefresh) {
            setStatusLoading(true);
        }
        setServerError(null);
        try {
            const [envRes, schRes, exRes] = await Promise.all([
                axios.get(`${config.API_URL}/api/env`),
                axios.get(`${config.API_URL}/api/scheduler/status`).catch(() => ({ data: { enabled: false } })),
                axios.get(`${config.API_URL}/api/exchanges`)
            ]);
            setEnvKeys(envRes.data || {});
            setBgSyncEnabled(schRes.data ? schRes.data.enabled : false);
            
            const fetched = exRes.data || [];
            if (fetched.length > 0) {
                const customApiExchanges = fetched.filter(ex => ex.type === 'CUSTOM_API').map(ex => ({
                    id: ex.id,
                    name: ex.name,
                    keyName: `${ex.id.toUpperCase()}_API_KEY`,
                    secretName: `${ex.id.toUpperCase()}_API_SECRET`,
                    statusKey: ex.id
                }));
                setDynamicExchanges([...defaultApiExchanges, ...customApiExchanges]);
            } else {
                setDynamicExchanges(defaultApiExchanges);
            }

            const statusUrl = forceStatusRefresh 
                ? `${config.API_URL}/api/status?force=true` 
                : `${config.API_URL}/api/status`;

            axios.get(statusUrl).then(statusRes => {
                setApiStatuses(statusRes.data || {});
                setStatusLoading(false);
            }).catch(() => setStatusLoading(false));
        } catch (e) {
            console.error("Error in loadKeys:", e);
            setServerError("No se pudo conectar con el servidor Backend (puerto 5000). Verifica que el servicio esté ejecutándose.");
            setDynamicExchanges(defaultApiExchanges);
            setStatusLoading(false);
        }
    };

    const handleToggleBgSync = async () => {
        const nextState = !bgSyncEnabled;
        setBgSyncEnabled(nextState);
        try {
            await axios.post(`${config.API_URL}/api/scheduler/toggle`, { enabled: nextState });
        } catch (e) {
            console.error("Error toggling background scheduler", e);
            setBgSyncEnabled(!nextState);
        }
    };

    const handleSave = async (ex) => {
        const payload = {
            [ex.keyName]: formData.key,
            [ex.secretName]: formData.secret
        };
        if (ex.needsPassword) {
            payload[`${ex.id}_API_PASSWORD`] = formData.password;
        }
        try {
            await axios.post(`${config.API_URL}/api/env`, payload);
            setEditingEx(null);
            setFormData({ key: '', secret: '', password: '' });
            loadKeys(true);
        } catch {
            alert("Error saving keys");
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setSyncResults(null);
        try {
            const res = await axios.post(`${config.API_URL}/api/sync`);
            setSyncResults(res.data);

            if (res.data.total_inserted > 0) {
                const dlPayload = { filenames: res.data.details.filter(d => d.count > 0).map(d => `api_sync_${d.exchange.toLowerCase().replace(' ', '')}`) };
                const dlRes = await axios.post(`${config.API_URL}/download`, dlPayload, { responseType: 'blob' });
                const url = window.URL.createObjectURL(new Blob([dlRes.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'Certificacion_Ingresos_AutoSync.xlsx');
                document.body.appendChild(link);
                link.click();
            }
        } catch {
            alert("Error during Auto-Sync.");
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1050px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <h2 style={{ color: '#F8FAFC', fontSize: '1.75rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                            Conexiones API
                        </h2>
                        <span className="badge-indigo" style={{ padding: '0.2rem 0.6rem', fontSize: '11px', fontWeight: 600 }}>
                            Sync v2.0
                        </span>
                    </div>
                    <p style={{ color: '#94A3B8', margin: 0, fontSize: '14px' }}>
                        Sincronización automatizada de extractos y libros mayores directo desde los exchanges.
                    </p>
                </div>
                <button
                    className="btn-primary"
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        fontSize: '14px',
                        padding: '0.75rem 1.4rem'
                    }}
                >
                    <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                    {syncing ? 'Sincronizando Exchanges...' : 'AUTO-SINCRONIZAR AHORA'}
                </button>
            </div>

            {/* Server Error Alert */}
            {serverError && (
                <div style={{
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#FB7185',
                    padding: '1rem 1.25rem',
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <AlertCircle size={18} color="#F43F5E" />
                        <span style={{ fontSize: '14px' }}>{serverError}</span>
                    </div>
                    <button
                        onClick={() => loadKeys(true)}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.9rem', fontSize: '12px' }}
                    >
                        Reintentar
                    </button>
                </div>
            )}

            {/* Background Scheduler Card */}
            <div className="card-surface" style={{
                padding: '1.25rem 1.5rem',
                marginBottom: '2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '8px',
                        background: bgSyncEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.04)',
                        border: bgSyncEnabled ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <RefreshCw size={20} color={bgSyncEnabled ? '#10B981' : '#94A3B8'} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
                            Sincronización Automática en Segundo Plano (Windows Task)
                        </h3>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '13px', color: '#94A3B8' }}>
                            {bgSyncEnabled 
                                ? '✓ Sincronización programada diaria activa (20:00 hs sin necesidad de abrir la aplicación).' 
                                : 'Inactivo: las APIs se consultarán únicamente cuando pulses "AUTO-SINCRONIZAR AHORA".'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleToggleBgSync}
                    style={{
                        padding: '0.5rem 1.25rem',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: bgSyncEnabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                        transition: 'all 0.2s ease',
                        background: bgSyncEnabled ? 'rgba(16, 185, 129, 0.15)' : '#182238',
                        color: bgSyncEnabled ? '#34D399' : '#94A3B8'
                    }}
                >
                    {bgSyncEnabled ? '● TAREA PROGRAMADA ON' : '○ APAGADO'}
                </button>
            </div>

            {/* Sync Results Banner */}
            {syncResults && (
                <div style={{
                    marginBottom: '2rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '10px',
                    padding: '1.25rem 1.5rem'
                }}>
                    <h3 style={{
                        color: '#34D399',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        margin: '0 0 1rem 0',
                        fontSize: '15px',
                        fontWeight: 600
                    }}>
                        <CheckCircle size={18} /> Sincronización de Extractos Completada
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                        {syncResults.details.map((d, i) => (
                            <div key={i} style={{
                                background: '#121A2B',
                                border: '1px solid rgba(255,255,255,0.06)',
                                padding: '0.85rem 1rem',
                                borderRadius: '8px'
                            }}>
                                <strong style={{ color: '#F8FAFC', fontSize: '13px' }}>{d.exchange}</strong>
                                <div style={{
                                    color: d.count > 0 ? '#34D399' : '#94A3B8',
                                    marginTop: '0.35rem',
                                    fontSize: '12px',
                                    fontWeight: d.count > 0 ? 600 : 400
                                }} className="tabular-nums">
                                    {d.count > 0 ? `+${d.count} operaciones importadas` : d.message}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Exchanges Grid */}
            <div style={{ display: 'grid', gap: '1rem' }}>
                {dynamicExchanges.map(ex => {
                    const hasKey = !!envKeys[ex.keyName] && envKeys[ex.keyName] !== 'your_api_key_here';
                    const isEditing = editingEx === ex.id;
                    const st = apiStatuses[ex.statusKey] || {};
                    const statusType = st.status;

                    let statusText = 'No configurado';
                    let badgeClass = 'badge-slate';
                    let isErrorBorder = false;

                    if (statusLoading && hasKey) {
                        statusText = 'Verificando firma...';
                        badgeClass = 'badge-indigo';
                    } else if (statusType === 'online') {
                        statusText = 'Autenticado OK';
                        badgeClass = 'badge-emerald';
                    } else if (statusType === 'expired') {
                        statusText = `Llave Vencida (${st.msg || ''})`;
                        badgeClass = 'badge-rose';
                        isErrorBorder = true;
                    } else if (statusType === 'offline') {
                        statusText = `Error de Conexión (${st.msg || 'Fallo'})`;
                        badgeClass = 'badge-rose';
                        isErrorBorder = true;
                    } else if (statusType === 'unconfigured' || !hasKey) {
                        statusText = 'No configurado';
                        badgeClass = 'badge-slate';
                    } else if (hasKey) {
                        statusText = st.msg || 'Configurado';
                        badgeClass = 'badge-amber';
                    }

                    return (
                        <div
                            key={ex.id}
                            className="card-surface"
                            style={{
                                padding: '1.25rem 1.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem',
                                borderColor: isErrorBorder ? 'rgba(244, 63, 94, 0.35)' : undefined
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '8px',
                                        background: isErrorBorder ? 'rgba(244, 63, 94, 0.12)' : (statusType === 'online' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.04)'),
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <Plug size={18} color={statusType === 'online' ? '#10B981' : isErrorBorder ? '#F43F5E' : '#94A3B8'} />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>{ex.name}</h3>
                                            <span className={badgeClass} style={{ fontSize: '11px', padding: '0.15rem 0.55rem' }}>
                                                {statusText}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '12px', color: '#64748B', display: 'block', marginTop: '0.15rem' }}>
                                            {hasKey ? 'Credenciales de lectura guardadas localmente' : 'Sin credenciales configuradas'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className={isEditing ? "btn-secondary" : (hasKey ? "btn-outline" : "btn-primary")}
                                    style={{ padding: '0.5rem 1.1rem', fontSize: '12px' }}
                                    onClick={() => {
                                        if (isEditing) setEditingEx(null);
                                        else {
                                            setEditingEx(ex.id);
                                            setFormData({ key: '', secret: '', password: '' });
                                        }
                                    }}
                                >
                                    {isEditing ? 'CANCELAR' : (hasKey ? 'MODIFICAR CLAVES' : 'CONECTAR API')}
                                </button>
                            </div>

                            {(ex.id === 'okx' || ex.id === 'bybit') && (
                                <div style={{
                                    fontSize: '12px',
                                    color: '#94A3B8',
                                    background: 'rgba(79, 70, 229, 0.08)',
                                    padding: '0.6rem 0.85rem',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid #4F46E5',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <Info size={15} color="#818CF8" style={{ flexShrink: 0 }} />
                                    <span><strong>Aviso P2P:</strong> La extracción P2P vía API en {ex.name} requiere rol de Comerciante (Merchant). Para usuarios minoristas, importa tu extracto CSV/Excel en la sección Cargar Archivos.</span>
                                </div>
                            )}

                            {isEditing && (
                                <div style={{
                                    background: '#090D14',
                                    padding: '1.25rem',
                                    borderRadius: '8px',
                                    marginTop: '0.25rem',
                                    border: '1px solid rgba(255,255,255,0.08)'
                                }}>
                                    <div style={{
                                        fontSize: '13px',
                                        color: '#94A3B8',
                                        marginBottom: '1.25rem',
                                        display: 'flex',
                                        gap: '0.6rem',
                                        alignItems: 'flex-start',
                                        background: 'rgba(255,255,255,0.03)',
                                        padding: '0.75rem',
                                        borderRadius: '6px'
                                    }}>
                                        <Shield size={16} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span>Genera una clave API con permisos exclusivos de lectura (<strong>Read-only</strong>). Tus credenciales se almacenan localmente y nunca se envían a servidores externos.</span>
                                    </div>

                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#94A3B8', marginBottom: '0.35rem' }}>API Key</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                placeholder={hasKey ? envKeys[ex.keyName] : "Ingresa tu API Key pública"}
                                                value={formData.key}
                                                onChange={e => setFormData({ ...formData, key: e.target.value })}
                                                style={{ width: '100%', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#94A3B8', marginBottom: '0.35rem' }}>Secret Key</label>
                                            <input
                                                type="password"
                                                className="input-field"
                                                placeholder={hasKey ? "••••••••••••••••" : "Ingresa tu Secret Key privada"}
                                                value={formData.secret}
                                                onChange={e => setFormData({ ...formData, secret: e.target.value })}
                                                style={{ width: '100%', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        {ex.needsPassword && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#94A3B8', marginBottom: '0.35rem' }}>API Password / Passphrase</label>
                                                <input
                                                    type="password"
                                                    className="input-field"
                                                    placeholder={hasKey ? "••••••••••••••••" : `Passphrase configurada en ${ex.name}`}
                                                    value={formData.password}
                                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                        )}
                                        <button
                                            className="btn-primary"
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'center',
                                                gap: '0.5rem',
                                                alignItems: 'center',
                                                marginTop: '0.5rem',
                                                padding: '0.65rem'
                                            }}
                                            onClick={() => handleSave(ex)}
                                            disabled={!formData.key && !formData.secret}
                                        >
                                            <Save size={16} /> GUARDAR CREDENCIALES LOCALES
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
}

export default APIs;
