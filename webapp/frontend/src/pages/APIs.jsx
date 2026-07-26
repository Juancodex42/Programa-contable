import { useState, useEffect } from 'react';
import { Plug, Key, Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import config from '../config';

function APIs() {
    const [envKeys, setEnvKeys] = useState({});
    const [apiStatuses, setApiStatuses] = useState({});
    const [bgSyncEnabled, setBgSyncEnabled] = useState(false);
    const [editingEx, setEditingEx] = useState(null);
    const [formData, setFormData] = useState({ key: '', secret: '' });
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
            // Fast requests first (skip slow /api/status)
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

            // Load API status in background (slow endpoint)
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
            setBgSyncEnabled(!nextState); // Rollback
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

            // Automatically download if there's data
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
        <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ color: 'var(--accent-purple)', fontSize: '2rem', marginBottom: '0.5rem' }}>Conexiones API</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Conecta tus exchanges para reportes 100% automáticos.</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={handleSync}
                    disabled={syncing}
                    style={{ background: 'linear-gradient(135deg, #4ade80 0%, #059669 100%)', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '1rem', padding: '0.8rem 1.5rem' }}
                >
                    <RefreshCw size={20} className={syncing ? 'spin' : ''} />
                    {syncing ? 'Sincronizando...' : 'AUTO-SINCRONIZAR'}
                </button>
            </div>

            {serverError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '1rem 1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <AlertCircle size={20} color="#ef4444" />
                        <span>{serverError}</span>
                    </div>
                    <button onClick={() => loadKeys(true)} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                        Reintentar
                    </button>
                </div>
            )}

            <div className="glass-card" style={{ padding: '1.2rem 1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid var(--border-color)', borderRadius: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: bgSyncEnabled ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RefreshCw size={22} color={bgSyncEnabled ? '#4ade80' : 'var(--text-secondary)'} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'white' }}>Sincronización Automática en Segundo Plano (Windows)</h3>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {bgSyncEnabled ? '✓ Tarea activa en Windows: sincroniza APIs diariamente a las 20:00 hs sin abrir la app.' : 'Apagado: las APIs solo se sincronizarán cuando presiones AUTO-SINCRONIZAR.'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleToggleBgSync}
                    style={{
                        padding: '0.6rem 1.4rem',
                        borderRadius: '2rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        transition: 'all 0.3s ease',
                        background: bgSyncEnabled ? 'linear-gradient(135deg, #4ade80 0%, #059669 100%)' : '#334155',
                        color: 'white',
                        boxShadow: bgSyncEnabled ? '0 0 15px rgba(74,222,128,0.3)' : 'none'
                    }}
                >
                    {bgSyncEnabled ? 'ENCENDIDO' : 'APAGADO'}
                </button>
            </div>


            {syncResults && (
                <div style={{ marginBottom: '2rem', background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade80', borderRadius: '0.5rem', padding: '1.5rem' }}>
                    <h3 style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <CheckCircle size={20} /> Sincronización Completada
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        {syncResults.details.map((d, i) => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem' }}>
                                <strong>{d.exchange}</strong>
                                <div style={{ color: d.count > 0 ? '#4ade80' : 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                    {d.count > 0 ? `+${d.count} operaciones` : d.message}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gap: '1.5rem' }}>
                {dynamicExchanges.map(ex => {
                    const hasKey = !!envKeys[ex.keyName] && envKeys[ex.keyName] !== 'your_api_key_here';
                    const isEditing = editingEx === ex.id;
                    const st = apiStatuses[ex.statusKey] || {};
                    const statusType = st.status; // 'online', 'expired', 'offline', 'unconfigured'

                    let statusText = 'No configurado';
                    let statusColor = 'var(--text-secondary)';
                    let isErrorBorder = false;

                    if (statusLoading && hasKey) {
                        statusText = '⏳ Verificando...';
                        statusColor = '#a78bfa';
                    } else if (statusType === 'online') {
                        statusText = '✓ Autenticado OK';
                        statusColor = '#4ade80';
                    } else if (statusType === 'expired') {
                        statusText = `⚠️ Llave Vencida / Inválida (${st.msg || ''})`;
                        statusColor = '#f87171';
                        isErrorBorder = true;
                    } else if (statusType === 'offline') {
                        statusText = `❌ Error (${st.msg || 'Conexión fallida'})`;
                        statusColor = '#ef4444';
                        isErrorBorder = true;
                    } else if (statusType === 'unconfigured' || !hasKey) {
                        statusText = 'No configurado';
                        statusColor = 'var(--text-secondary)';
                    } else if (hasKey) {
                        statusText = st.msg || 'Configurado';
                        statusColor = '#f59e0b';
                    }

                    return (
                        <div key={ex.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: isErrorBorder ? '1px solid #f87171' : '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isErrorBorder ? 'rgba(248,113,113,0.15)' : (statusType === 'online' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Plug size={20} color={statusColor} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{ex.name}</h3>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '500', color: statusColor }}>
                                            {statusText}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className="btn-primary"
                                    style={{ background: isEditing ? 'var(--border-color)' : (hasKey ? 'rgba(255,255,255,0.05)' : '#334155'), color: 'white', backgroundImage: 'none' }}
                                    onClick={() => {
                                        if (isEditing) setEditingEx(null);
                                        else {
                                            setEditingEx(ex.id);
                                            setFormData({ key: '', secret: '' }); // Clear generic placeholder
                                        }
                                    }}
                                >
                                    {isEditing ? 'CANCELAR' : (hasKey ? 'CONFIGURAR' : 'CONECTAR')}
                                </button>
                            </div>

                            {(ex.id === 'okx' || ex.id === 'bybit') && (
                                <div style={{ fontSize: '0.82rem', color: '#cbd5e1', background: 'rgba(56, 189, 248, 0.08)', padding: '0.5rem 0.75rem', borderRadius: '0.4rem', borderLeft: '3px solid #38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span>ℹ️ <strong>Aviso P2P:</strong> La extracción P2P vía API en {ex.name} requiere ser <em>Comerciante/Anunciante (Merchant)</em>. Si sos usuario estándar, cargá tus compras/ventas P2P mediante archivo CSV/Excel manual en la solapa de Cargar Archivos.</span>
                                </div>
                            )}

                            {isEditing && (
                                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '0.5rem', marginTop: '0.5rem', border: '1px solid var(--border-color)' }}>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                        <AlertCircle size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span>Genera una clave API en tu cuenta de {ex.name} con permisos de lectura (<strong>Read-only</strong>). No compartas tus claves con nadie. Las claves se guardan encriptadas localmente en tu dispositivo.</span>
                                    </p>

                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>API Key</label>
                                            <input
                                                type="text"
                                                placeholder={hasKey ? envKeys[ex.keyName] : "Ingresa tu API Key"}
                                                value={formData.key}
                                                onChange={e => setFormData({ ...formData, key: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.3rem', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Secret Key</label>
                                            <input
                                                type="password"
                                                placeholder={hasKey ? "••••••••••••••••" : "Ingresa tu Secret Key"}
                                                value={formData.secret}
                                                onChange={e => setFormData({ ...formData, secret: e.target.value })}
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '0.3rem', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                            />
                                        </div>
                                        {ex.needsPassword && (
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>API Password / Passphrase</label>
                                                <input
                                                    type="password"
                                                    placeholder={hasKey ? "••••••••••••••••" : `Ingresa la contraseña de API de ${ex.name}`}
                                                    value={formData.password}
                                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '0.3rem', background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                                                />
                                            </div>
                                        )}
                                        <button
                                            className="btn-primary"
                                            style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
                                            onClick={() => handleSave(ex)}
                                            disabled={!formData.key && !formData.secret} // Allow saving if at least one is typed, mostly both
                                        >
                                            <Save size={18} /> GUARDAR CLAVES LOCALMENTE
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
export default APIs;
