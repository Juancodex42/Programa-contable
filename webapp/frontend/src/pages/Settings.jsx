import { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import axios from 'axios';
import config from '../config';

function Settings() {
    const [exchanges, setExchanges] = useState([]);
    const [selectedExchangeId, setSelectedExchangeId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // New Exchange modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [newExchangeName, setNewExchangeName] = useState('');

    const fetchExchanges = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`${config.API_URL}/api/exchanges`);
            const data = res.data || [];
            setExchanges(data);
            if (data.length > 0) {
                setSelectedExchangeId(prev => prev || data[0].id);
            }
            setLoading(false);
        } catch (err) {
            console.error("Error loading exchanges", err);
            setError("No se pudo conectar con el servidor Backend (puerto 5000). Asegúrate de que el servidor esté en ejecución.");
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExchanges();
    }, []);

    const selectedEx = exchanges.find(e => e.id === selectedExchangeId);

    const handleCreateExchange = async () => {
        if (!newExchangeName.trim()) return;
        try {
            await axios.post(`${config.API_URL}/api/exchanges`, {
                name: newExchangeName,
                mapping: {
                    fecha: 'Fecha',
                    tipo_operacion: 'Tipo',
                    moneda: 'Moneda',
                    monto_compra_cripto: 'Compra',
                    monto_venta_cripto: 'Venta',
                    cotizacion_compra: 'Cotizacion Compra',
                    cotizacion_venta: 'Cotizacion Venta',
                    monto_ars: 'Monto ARS',
                    comentarios: 'Notas'
                }
            });
            setNewExchangeName('');
            setShowAddModal(false);
            fetchExchanges();
        } catch (err) {
            alert("Error al crear el exchange");
        }
    };

    const handleDeleteExchange = async (id) => {
        if (!window.confirm("¿Seguro que deseas eliminar este exchange?")) return;
        try {
            await axios.delete(`${config.API_URL}/api/exchanges/${id}`);
            setSelectedExchangeId('');
            fetchExchanges();
        } catch (err) {
            alert("Error al eliminar el exchange");
        }
    };

    const handleUpdateMappingField = async (field, value) => {
        if (!selectedEx) return;
        setSaving(true);
        const updatedMapping = { ...selectedEx.mapping, [field]: value };
        try {
            await axios.put(`${config.API_URL}/api/exchanges/${selectedEx.id}/mapping`, {
                mapping: updatedMapping,
                dateFormat: selectedEx.dateFormat
            });
            setExchanges(exchanges.map(e => e.id === selectedEx.id ? { ...e, mapping: updatedMapping } : e));
        } catch (err) {
            alert("Error guardando mapeo");
        }
        setSaving(false);
    };

    const handleUpdateDateFormat = async (dateFormat) => {
        if (!selectedEx) return;
        setSaving(true);
        try {
            await axios.put(`${config.API_URL}/api/exchanges/${selectedEx.id}/mapping`, {
                mapping: selectedEx.mapping,
                dateFormat: dateFormat
            });
            setExchanges(exchanges.map(e => e.id === selectedEx.id ? { ...e, dateFormat } : e));
        } catch (err) {
            alert("Error guardando formato de fecha");
        }
        setSaving(false);
    };

    if (loading) return <div style={{ color: 'white', padding: '2rem' }}>Cargando configuraciones de exchanges...</div>;

    const defaultFields = [
        { key: 'fecha', label: 'Fecha y Hora' },
        { key: 'tipo_operacion', label: 'Tipo de Operación (BUY/SELL)' },
        { key: 'moneda', label: 'Moneda / Cripto (BTC, USDT, etc.)' },
        { key: 'monto_compra_cripto', label: 'Cantidad Comprada' },
        { key: 'monto_venta_cripto', label: 'Cantidad Vendida' },
        { key: 'cotizacion_compra', label: 'Cotización Compra' },
        { key: 'cotizacion_venta', label: 'Cotización Venta' },
        { key: 'monto_ars', label: 'Monto Total en ARS' },
        { key: 'comentarios', label: 'Comentarios / Notas' }
    ];

    return (
        <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
                    <SettingsIcon /> Configuraciones y Mapeo de Exchanges
                </h2>
                <button
                    className="btn-primary"
                    style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                    onClick={() => setShowAddModal(true)}
                >
                    <Plus size={16} /> AGREGAR EXCHANGE
                </button>
            </div>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '1rem 1.5rem', borderRadius: '0.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <AlertTriangle size={20} color="#ef4444" />
                        <span>{error}</span>
                    </div>
                    <button onClick={fetchExchanges} className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                        Reintentar
                    </button>
                </div>
            )}

            {/* Modal for Adding Exchange */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="glass-card" style={{ padding: '2rem', width: '400px', background: '#0f172a', border: '1px solid var(--accent-cyan)' }}>
                        <h3 style={{ color: 'var(--accent-cyan)', marginBottom: '1rem' }}>Nuevo Exchange Personalizado</h3>
                        <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Nombre del Exchange / Plataforma:</label>
                        <input
                            type="text"
                            placeholder="Ej: KuCoin, Lemon Cash, P2P Efectivo..."
                            value={newExchangeName}
                            onChange={e => setNewExchangeName(e.target.value)}
                            style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white', borderRadius: '0.5rem', marginBottom: '1.5rem' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'white', padding: '0.6rem 1.2rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancelar</button>
                            <button onClick={handleCreateExchange} className="btn-primary" style={{ padding: '0.6rem 1.2rem' }}>Crear Exchange</button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '2rem' }}>
                {/* Sidebar */}
                <div className="glass-card" style={{ padding: '1rem' }}>
                    <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase' }}>Exchanges Activos</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {exchanges.map(ex => (
                            <button
                                key={ex.id}
                                onClick={() => setSelectedExchangeId(ex.id)}
                                style={{
                                    background: selectedExchangeId === ex.id ? 'var(--accent-cyan)' : 'transparent',
                                    color: selectedExchangeId === ex.id ? 'black' : 'white',
                                    border: 'none',
                                    padding: '0.8rem',
                                    textAlign: 'left',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    fontWeight: selectedExchangeId === ex.id ? 'bold' : 'normal',
                                    display: 'flex',
                                    justify: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span>{ex.name}</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.7, padding: '0.1rem 0.4rem', borderRadius: '0.3rem', background: 'rgba(0,0,0,0.2)' }}>
                                    {ex.type}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                {selectedEx ? (
                    <div className="glass-card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.5rem' }}>
                                    Configuración: <span style={{ color: 'var(--accent-cyan)' }}>{selectedEx.name}</span>
                                </h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Tipo: {selectedEx.type}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {saving && <span style={{ color: '#4ade80', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Save size={14} /> Guardando...</span>}
                                {selectedEx.type === 'CUSTOM_CSV' && (
                                    <button onClick={() => handleDeleteExchange(selectedEx.id)} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        <Trash2 size={14} /> Eliminar
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'start' }}>
                            <AlertTriangle color="#ef4444" size={24} style={{ flexShrink: 0 }} />
                            <p style={{ fontSize: '0.85rem', color: '#fca5a5', margin: 0 }}>
                                <b>Mapeo de Columnas:</b> Asigna cada campo del sistema al nombre exacto de la columna en el archivo CSV/Excel que descargas de {selectedEx.name}.
                            </p>
                        </div>

                        {/* Date Format */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h4 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Formato de Fecha y Hora</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem' }}>
                                <div>
                                    <label style={{ color: 'white', fontWeight: 'bold' }}>Formato STRFTIME</label>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>Ej: %d/%m/%Y %H:%M:%S (Día/Mes/Año)</p>
                                </div>
                                <input
                                    type="text"
                                    defaultValue={selectedEx.dateFormat || '%d/%m/%Y %H:%M:%S'}
                                    onBlur={(e) => handleUpdateDateFormat(e.target.value)}
                                    style={{
                                        background: 'rgba(0,0,0,0.3)',
                                        border: '1px solid var(--border-color)',
                                        color: 'white',
                                        padding: '0.5rem',
                                        borderRadius: '0.3rem',
                                        width: '100%'
                                    }}
                                />
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.8rem' }}>Campo Interno</th>
                                    <th style={{ textAlign: 'left', padding: '0.8rem' }}>Columna en CSV / Excel</th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaultFields.map(f => (
                                    <tr key={f.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.8rem' }}>
                                            <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{f.label}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{f.key}</div>
                                        </td>
                                        <td style={{ padding: '0.8rem' }}>
                                            <input
                                                type="text"
                                                defaultValue={selectedEx.mapping[f.key] || ''}
                                                onBlur={(e) => handleUpdateMappingField(f.key, e.target.value)}
                                                placeholder={`Columna en ${selectedEx.name}`}
                                                style={{
                                                    background: 'rgba(0,0,0,0.3)',
                                                    border: '1px solid var(--border-color)',
                                                    color: 'white',
                                                    padding: '0.5rem',
                                                    borderRadius: '0.3rem',
                                                    width: '100%'
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Selecciona un exchange de la lista lateral o agrega uno nuevo.
                    </div>
                )}
            </div>
        </div>
    );
}

export default Settings;

