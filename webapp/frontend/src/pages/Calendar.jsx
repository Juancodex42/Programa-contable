import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Calendar as CalendarIcon, ShieldCheck, AlertTriangle, FileText,
  Plus, Trash2, Download, RefreshCw, CheckCircle2, Clock, UploadCloud, X,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Sparkles, Wand2, Info, ArrowRight, HelpCircle, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import config from '../config';

const API_BASE = `${config.API_URL}/api`;

const Calendar = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab') === 'warnings' ? 'warnings' : 'certifications';

  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam === 'warnings') {
      setActiveTab('warnings');
    }
  }, [location.search]);

  // Warnings / Gaps / Reconciliation State
  const [gaps, setGaps] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loadingWarnings, setLoadingWarnings] = useState(false);

  // Exchange Filter & Accordion State for Advertencias
  const [selectedExchangeFilter, setSelectedExchangeFilter] = useState('ALL');
  const [expandedExchanges, setExpandedExchanges] = useState({});
  const [exchangeLimits, setExchangeLimits] = useState({});

  const toggleExchangeExpand = (exName) => {
    setExpandedExchanges((prev) => ({
      ...prev,
      [exName]: prev[exName] !== undefined ? !prev[exName] : false
    }));
  };

  const loadMoreForExchange = (exName) => {
    setExchangeLimits((prev) => ({
      ...prev,
      [exName]: (prev[exName] || 10) + 15
    }));
  };

  // Sleek Glassmorphism Toast Notification State
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'info' });
    }, 4500);
  };

  const handleApiSyncForExchange = async (exName) => {
    showToast(`⚡ Sincronizando API de ${exName}...`, 'info');
    try {
      const res = await axios.post(`${API_BASE}/sync`);
      const data = res.data || {};
      showToast(`✓ Sincronización completada para ${exName}. Movimientos actualizados.`, 'success');
      if (typeof fetchWarningsAndGaps === 'function') {
        fetchWarningsAndGaps();
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.details || `No se detectaron claves API activas para ${exName}. Podés subir el CSV.`;
      showToast(`⚠️ ${errorMsg}`, 'warning');
    }
  };

  // "Ponete al Día" Interactive Checklist Wizard State
  const [showPonteAlDiaModal, setShowPonteAlDiaModal] = useState(false);
  const [ponteAlDiaStep, setPonteAlDiaStep] = useState(0);
  const [completedChecklistExchanges, setCompletedChecklistExchanges] = useState({});
  const [syncingAllApis, setSyncingAllApis] = useState(false);

  const triggerAutoApiSyncAll = async () => {
    setSyncingAllApis(true);
    showToast('⚡ Auto-sincronizando APIs activas (Binance, Bitso, Bitget, OKX, Bybit)...', 'info');
    try {
      const res = await axios.post(`${API_BASE}/sync`);
      showToast('✓ APIs sincronizadas correctamente. Reevaluando advertencias...', 'success');
      if (typeof fetchWarningsAndGaps === 'function') {
        await fetchWarningsAndGaps();
      }
    } catch (err) {
      showToast('ℹ️ Sincronización finalizada o parcial. Podés cargar archivos de exchanges sin API.', 'info');
    } finally {
      setSyncingAllApis(false);
    }
  };

  // In-Modal Direct File Upload State
  const [inModalUploading, setInModalUploading] = useState(false);
  const [inModalUploadMsg, setInModalUploadMsg] = useState(null);

  const handleInModalUpload = async (files) => {
    if (!files || files.length === 0) return;
    setInModalUploading(true);
    setInModalUploadMsg(null);

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append('files', f));

    try {
      const res = await axios.post(`${config.API_URL}/process`, formData);
      const data = res.data || {};
      const results = data.files || [];
      const total = data.total_transactions || 0;

      // Check if any file reported an error during processing
      const errorItem = results.find((r) => r.error);
      if (errorItem) {
        const errText = errorItem.error || 'Error al procesar el archivo.';
        setInModalUploadMsg({ type: 'error', text: `⚠️ ${errText}` });
        showToast(`⚠️ ${errText}`, 'error');
      } else {
        setInModalUploadMsg({
          type: 'success',
          text: `✓ Archivo procesado con éxito. Se insertaron ${total} operaciones.`
        });
        showToast(`✓ Archivo cargado e importado. ${total} operaciones insertadas.`, 'success');
        if (typeof fetchWarningsAndGaps === 'function') {
          await fetchWarningsAndGaps();
        }
      }
    } catch (err) {
      console.error('In-modal upload error:', err);
      let errMsg = 'Error al procesar el archivo.';
      if (err.response && err.response.data) {
        if (err.response.data.error === 'missing_columns') {
          const missingCols = Array.isArray(err.response.data.missing)
            ? err.response.data.missing.join(', ')
            : (err.response.data.missing || '');
          const exchangeName = err.response.data.exchange || '';
          errMsg = `Formato no reconocido${exchangeName ? ` en ${exchangeName}` : ''}. Faltan columnas: ${missingCols}.`;
        } else if (typeof err.response.data.error === 'string') {
          errMsg = err.response.data.error;
        } else if (err.response.data.message) {
          errMsg = err.response.data.message;
        }
      } else if (err.message && err.message !== 'Network Error') {
        errMsg = err.message;
      } else {
        errMsg = 'Error de conexión con el servidor backend (verificá que el servidor esté en ejecución).';
      }
      setInModalUploadMsg({ type: 'error', text: `⚠️ ${errMsg}` });
      showToast(`⚠️ ${errMsg}`, 'error');
    } finally {
      setInModalUploading(false);
    }
  };

  const openPonteAlDiaModal = () => {
    setPonteAlDiaStep(0);
    setShowPonteAlDiaModal(true);
    setInModalUploadMsg(null);
    triggerAutoApiSyncAll();
  };

  // Guided Resolution Wizard State
  const [showResolverModal, setShowResolverModal] = useState(false);
  const [selectedWarning, setSelectedWarning] = useState(null);
  const [resolverStep, setResolverStep] = useState(1);
  const [resolverSubmitting, setResolverSubmitting] = useState(false);
  const [resolverError, setResolverError] = useState('');
  const [resolverSuccess, setResolverSuccess] = useState('');

  const [resolverData, setResolverData] = useState({
    date: '',
    exchange: '',
    crypto: '',
    missing: 0,
    origin_type: 'Capital Inicial / Años Anteriores',
    cost_ars: '',
    notes: ''
  });

  const fetchWarningsAndGaps = async () => {
    setLoadingWarnings(true);
    try {
      const [gapsRes, reconRes] = await Promise.all([
        fetch(`${API_BASE}/reports/gaps`).then((r) => r.json()).catch(() => ({ gaps: [] })),
        fetch(`${API_BASE}/audit/reconciliation`).then((r) => r.json()).catch(() => ({ anomalies: [] }))
      ]);
      if (gapsRes && Array.isArray(gapsRes.gaps)) {
        setGaps(gapsRes.gaps);
      }
      if (reconRes && Array.isArray(reconRes.anomalies)) {
        setAnomalies(reconRes.anomalies);
      }
    } catch (err) {
      console.error('Error fetching warnings and gaps:', err);
    } finally {
      setLoadingWarnings(false);
    }
  };

  useEffect(() => {
    fetchWarningsAndGaps();
  }, []);

  const [certData, setCertData] = useState({
    certifications: [],
    summary: {
      total_count: 0,
      status: 'pending',
      latest_end_date: null,
      uncertified_days: null,
      today: new Date().toISOString().split('T')[0]
    }
  });

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [autoDetectedMsg, setAutoDetectedMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState({
    show: false,
    id: null,
    title: '',
    deleting: false
  });

  // Batch / Multi-file Upload Queue State
  const [fileQueue, setFileQueue] = useState([]);

  // Selected Timeline Year State (Defaults to current year, dynamic multi-year navigation)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [hoveredMonth, setHoveredMonth] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    start_date: '',
    end_date: '',
    issue_date: new Date().toISOString().split('T')[0],
    cpa_name: '',
    notes: '',
    file: null
  });

  const fetchCertifications = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/certifications`);
      const data = await res.json();
      if (res.ok && data) {
        setCertData({
          certifications: Array.isArray(data.certifications) ? data.certifications : [],
          summary: data.summary || {
            total_count: 0,
            status: 'pending',
            latest_end_date: null,
            uncertified_days: null,
            today: new Date().toISOString().split('T')[0]
          }
        });
      } else {
        console.error('Error in API response:', data?.error);
      }
    } catch (err) {
      console.error('Error fetching certifications:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertifications();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const parseSingleFile = async (fileItem) => {
    try {
      const payload = new FormData();
      payload.append('file', fileItem.file);
      payload.append('filename', fileItem.file.name);

      const res = await fetch(`${API_BASE}/certifications/parse_pdf`, {
        method: 'POST',
        body: payload
      });
      const result = await res.json();

      const cleanDateOnly = (raw) => {
        if (!raw) return '';
        const trimmed = String(raw).trim();
        const dOnly = trimmed.split(' ')[0].split('T')[0];
        return /^\d{4}-\d{2}-\d{2}$/.test(dOnly) ? dOnly : '';
      };

      const cleanFullTimestamp = (raw) => {
        if (!raw) return '';
        return String(raw).trim();
      };

      let sDate = '';
      let eDate = '';
      let fullStart = '';
      let fullEnd = '';
      let cpa = '';
      let issueDate = '';
      let source = '';
      let txInfo = null;
      let title = '';

      if (res.ok && result.success && result.extracted) {
        fullEnd = cleanFullTimestamp(result.extracted.end_date);
        fullStart = cleanFullTimestamp(result.extracted.start_date);
        eDate = cleanDateOnly(result.extracted.end_date);
        sDate = cleanDateOnly(result.extracted.start_date);
        cpa = result.extracted.cpa_name || '';
        issueDate = cleanDateOnly(result.extracted.issue_date) || '';
        source = result.extracted.detection_source || 'PDF';
        txInfo = result.extracted.latest_tx_info || null;
        title = result.extracted.title || '';
      }

      setFileQueue((prev) => {
        const nextQueue = prev.map((item) => {
          if (item.id === fileItem.id) {
            return {
              ...item,
              title: title || item.title,
              start_date: sDate || item.start_date,
              end_date: eDate || item.end_date,
              full_start_date: fullStart || item.full_start_date || '',
              full_end_date: fullEnd || item.full_end_date || '',
              cpa_name: cpa,
              issue_date: issueDate || item.issue_date,
              detection_source: source,
              latest_tx_info: txInfo,
              parsing: false,
              parsedSuccess: !!(sDate && eDate)
            };
          }
          return item;
        });

        // Sync with formData if single file mode
        if (nextQueue.length === 1 && nextQueue[0].id === fileItem.id) {
          const first = nextQueue[0];
          setFormData((fPrev) => ({
            ...fPrev,
            file: first.file,
            title: first.title,
            start_date: first.start_date,
            end_date: first.end_date,
            cpa_name: first.cpa_name,
            issue_date: first.issue_date
          }));
          if (fullStart && fullEnd) {
            setAutoDetectedMsg(`✨ Período detectado: ${fullStart} al ${fullEnd}`);
          } else if (sDate && eDate) {
            setAutoDetectedMsg(`✨ Período detectado: ${sDate} al ${eDate}`);
          } else {
            setAutoDetectedMsg('✨ Archivo procesado.');
          }
        }
        return nextQueue;
      });
    } catch (err) {
      console.error('Error parsing file:', err);
      setFileQueue((prev) =>
        prev.map((item) => (item.id === fileItem.id ? { ...item, parsing: false } : item))
      );
    }
  };






  const handleFilesAdd = (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const filesArray = Array.from(selectedFiles);

    const newItems = filesArray.map((file) => {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const autoTitle = `Certificación ${baseName}`;
      return {
        id: Math.random().toString(36).substring(2, 11),
        file,
        filename: file.name,
        title: autoTitle,
        start_date: '',
        end_date: '',
        issue_date: new Date().toISOString().split('T')[0],
        cpa_name: '',
        notes: '',
        parsing: true,
        progress: 10,
        parsedSuccess: false
      };

    });

    setFileQueue((prev) => {
      const combined = [...prev, ...newItems];
      if (combined.length === 1) {
        const first = combined[0];
        setFormData({
          title: first.title,
          start_date: first.start_date,
          end_date: first.end_date,
          issue_date: first.issue_date,
          cpa_name: first.cpa_name,
          notes: first.notes,
          file: first.file
        });
      }
      return combined;
    });

    setErrorMessage('');
    setSuccessMessage('');

    newItems.forEach((item) => {
      parseSingleFile(item);
    });
  };

  const handleQueueItemChange = (id, field, value) => {
    setFileQueue((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (prev.length === 1) {
            setFormData((fPrev) => ({ ...fPrev, [field]: value }));
          }
          return updated;
        }
        return item;
      })
    );
  };

  const handleRemoveQueueItem = (id) => {
    setFileQueue((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      if (filtered.length === 1) {
        const first = filtered[0];
        setFormData({
          title: first.title,
          start_date: first.start_date,
          end_date: first.end_date,
          issue_date: first.issue_date,
          cpa_name: first.cpa_name,
          notes: first.notes,
          file: first.file
        });
      } else if (filtered.length === 0) {
        setFormData({
          title: '',
          start_date: '',
          end_date: '',
          issue_date: new Date().toISOString().split('T')[0],
          cpa_name: '',
          notes: '',
          file: null
        });
        setAutoDetectedMsg('');
      }
      return filtered;
    });
  };

  const openNewCertificationModal = async () => {
    setFileQueue([]);

    // Obtener el start_date sugerido desde el backend (last_end + 1 segundo)
    let suggestedStart = '';
    let suggestedMsg = '';
    try {
      const res = await fetch(`${API_BASE}/certifications/next_start`);
      const data = await res.json();
      if (data.next_start_date) {
        // Mostrar solo la fecha YYYY-MM-DD en el campo de tipo date del formulario
        suggestedStart = data.next_start_date.split(' ')[0];
        suggestedMsg = `📅 Inicio sugerido: ${suggestedStart} (continuación desde el fin de la última certificación)`;
      }
    } catch (e) {
      console.warn('No se pudo obtener next_start_date:', e);
    }

    setFormData({
      title: '',
      start_date: suggestedStart,
      end_date: '',
      issue_date: new Date().toISOString().split('T')[0],
      cpa_name: '',
      notes: '',
      file: null
    });
    setAutoDetectedMsg(suggestedMsg);
    setErrorMessage('');
    setSuccessMessage('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (fileQueue.length > 0) {
      for (let i = 0; i < fileQueue.length; i++) {
        const item = fileQueue[i];
        if (!item.start_date || !item.end_date) {
          setErrorMessage(`Por favor, ingresá la Fecha Inicio y Fecha Fin para "${item.filename}".`);
          return;
        }
        if (new Date(item.start_date) > new Date(item.end_date)) {
          setErrorMessage(`La fecha de inicio debe ser anterior o igual a la de fin para "${item.filename}".`);
          return;
        }
      }

      setSubmitting(true);
      let successCount = 0;

      try {
        for (let i = 0; i < fileQueue.length; i++) {
          const item = fileQueue[i];
          const payload = new FormData();
          payload.append('title', item.title || `Certificación ${item.filename}`);
          payload.append('start_date', item.full_start_date || item.start_date);
          payload.append('end_date', item.full_end_date || item.end_date);
          if (item.issue_date) payload.append('issue_date', item.issue_date);
          if (item.cpa_name) payload.append('cpa_name', item.cpa_name);
          if (item.notes) payload.append('notes', item.notes);
          if (item.file) payload.append('file', item.file);

          const res = await fetch(`${API_BASE}/certifications`, {
            method: 'POST',
            body: payload
          });
          const result = await res.json();
          if (res.ok && result.success) {
            successCount++;
          }
        }

        if (successCount > 0) {
          setSuccessMessage(`¡${successCount} certificación(es) registrada(s) con éxito!`);
          setFileQueue([]);
          setFormData({
            title: '',
            start_date: '',
            end_date: '',
            issue_date: new Date().toISOString().split('T')[0],
            cpa_name: '',
            notes: '',
            file: null
          });
          setAutoDetectedMsg('');
          setTimeout(() => {
            setShowModal(false);
            fetchCertifications();
            window.dispatchEvent(new Event('certifications_updated'));
          }, 800);
        } else {
          setErrorMessage('Error al registrar las certificaciones.');
        }
      } catch (err) {
        console.error(err);
        setErrorMessage('Error de red al guardar las certificaciones.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      setErrorMessage('Por favor, ingresá las fechas de inicio y fin de la certificación.');
      return;
    }

    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setErrorMessage('La fecha de inicio debe ser anterior o igual a la fecha de fin.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('title', formData.title || 'Certificación Contable');
      payload.append('start_date', formData.start_date);
      payload.append('end_date', formData.end_date);
      if (formData.issue_date) payload.append('issue_date', formData.issue_date);
      if (formData.cpa_name) payload.append('cpa_name', formData.cpa_name);
      if (formData.notes) payload.append('notes', formData.notes);

      const res = await fetch(`${API_BASE}/certifications`, {
        method: 'POST',
        body: payload
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setSuccessMessage('¡Certificación registrada con éxito!');
        setFormData({
          title: '',
          start_date: '',
          end_date: '',
          issue_date: new Date().toISOString().split('T')[0],
          cpa_name: '',
          notes: '',
          file: null
        });
        setTimeout(() => {
          setShowModal(false);
          fetchCertifications();
          window.dispatchEvent(new Event('certifications_updated'));
        }, 800);
      } else {
        setErrorMessage(result.error || 'Error al guardar la certificación.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Error de conexión con el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteConfirm = (id, title) => {
    setDeleteConfirm({
      show: true,
      id,
      title,
      deleting: false
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.id) return;
    setDeleteConfirm((prev) => ({ ...prev, deleting: true }));

    try {
      const res = await fetch(`${API_BASE}/certifications/${deleteConfirm.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        // Optimistically remove from state for an immediate smooth response
        setCertData((prev) => ({
          ...prev,
          certifications: (prev.certifications || []).filter((c) => c.id !== deleteConfirm.id)
        }));
        setDeleteConfirm({ show: false, id: null, title: '', deleting: false });
        // Silently sync server state & coverage calculations without resetting or flashing page loading
        fetchCertifications(true);
        window.dispatchEvent(new Event('certifications_updated'));
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'No se pudo eliminar el registro.');
        setDeleteConfirm((prev) => ({ ...prev, deleting: false }));
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al intentar eliminar.');
      setDeleteConfirm((prev) => ({ ...prev, deleting: false }));
    }
  };

  const openResolverModal = (item) => {
    setSelectedWarning(item);
    setResolverStep(1);
    setResolverError('');
    setResolverSuccess('');

    const itemDate = item.date || item.fecha || new Date().toISOString().split('T')[0];
    const itemExchange = item.exchange || 'Binance P2P';
    const itemCrypto = item.coin || item.crypto || 'USDT';
    const itemMissing = item.deficit || item.missing || item.sold_qty || 0;

    setResolverData({
      date: itemDate,
      exchange: itemExchange,
      crypto: itemCrypto,
      missing: itemMissing,
      origin_type: 'Capital Inicial / Años Anteriores',
      cost_ars: '',
      notes: ''
    });
    setShowResolverModal(true);
  };

  const handleResolverSubmit = async (e) => {
    if (e) e.preventDefault();
    setResolverSubmitting(true);
    setResolverError('');
    setResolverSuccess('');

    try {
      const res = await axios.post(`${API_BASE}/audit/classify_anomaly`, {
        date: resolverData.date,
        exchange: resolverData.exchange,
        crypto: resolverData.crypto,
        missing: resolverData.missing,
        origin_type: resolverData.origin_type
      });
      const result = res.data || {};
      if (result.success) {
        setResolverSuccess('¡Inconsistencia resuelta y registrada con éxito!');
        setTimeout(() => {
          setShowResolverModal(false);
          if (typeof fetchWarningsAndGaps === 'function') fetchWarningsAndGaps();
          if (typeof fetchCertifications === 'function') fetchCertifications(true);
        }, 1200);
      } else {
        setResolverError(result.error || 'No se pudo registrar el ajuste.');
      }
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || 'Error al guardar el ajuste.';
      setResolverError(errMsg);
    } finally {
      setResolverSubmitting(false);
    }
  };

  const certificationsList = Array.isArray(certData?.certifications) ? certData.certifications : [];

  const cleanDateOnly = (dStr) => {
    if (!dStr) return '';
    return String(dStr).trim().split(' ')[0].split('T')[0];
  };

  const parseCleanDate = (dateStr, isEnd = false) => {
    if (!dateStr) return null;
    let str = String(dateStr).trim();
    if (str.includes(' ')) str = str.split(' ')[0];
    if (str.includes('T')) str = str.split('T')[0];

    // Handle DD/MM/YYYY
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return isEnd
            ? new Date(year, month, day, 23, 59, 59)
            : new Date(year, month, day, 0, 0, 0);
        }
      }
    }

    // Handle YYYY-MM-DD or DD-MM-YYYY
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        let year, month, day;
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          day = parseInt(parts[2], 10);
        } else {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10) - 1;
          year = parseInt(parts[2], 10);
        }
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return isEnd
            ? new Date(year, month, day, 23, 59, 59)
            : new Date(year, month, day, 0, 0, 0);
        }
      }
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // Dynamic Year List (Generates a 15-year window around current year + any certification years)
  const currentYr = new Date().getFullYear();
  const baseYearRange = Array.from({ length: 15 }, (_, i) => currentYr - 10 + i); // 2016 to 2030
  const certYears = certificationsList.flatMap((c) => {
    if (!c) return [];
    const sObj = parseCleanDate(c.start_date);
    const eObj = parseCleanDate(c.end_date, true);
    const s = sObj ? sObj.getFullYear() : null;
    const e = eObj ? eObj.getFullYear() : null;
    return [s, e];
  }).filter((y) => y && !isNaN(y));

  const availableYears = Array.from(new Set([...baseYearRange, ...certYears])).sort((a, b) => a - b);

  // Distinct color palette for certification brackets
  const CERT_COLORS = [
    { border: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)', text: '#38bdf8', lightBg: 'rgba(56, 189, 248, 0.08)' }, // Cyan
    { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.18)', text: '#c084fc', lightBg: 'rgba(168, 85, 247, 0.08)' }, // Purple
    { border: '#10b981', bg: 'rgba(16, 185, 129, 0.18)', text: '#34d399', lightBg: 'rgba(16, 185, 129, 0.08)' }, // Emerald
    { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.18)', text: '#f472b6', lightBg: 'rgba(236, 72, 153, 0.08)' }, // Pink
    { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.18)', text: '#fbbf24', lightBg: 'rgba(245, 158, 11, 0.08)' }, // Amber
    { border: '#6366f1', bg: 'rgba(99, 102, 241, 0.18)', text: '#818cf8', lightBg: 'rgba(99, 102, 241, 0.08)' }, // Indigo
  ];

  const getCertColor = (cert) => {
    if (!cert) return CERT_COLORS[0];
    const idx = certificationsList.findIndex((c) => c === cert || (c && cert && c.id === cert.id));
    const safeIdx = idx >= 0 ? idx : 0;
    return CERT_COLORS[safeIdx % CERT_COLORS.length] || CERT_COLORS[0];
  };

  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Helper to format date with time if present
  const formatDateTime = (dateStr, fallbackStr) => {
    if (!dateStr && !fallbackStr) return '';
    const targetStr = dateStr || fallbackStr;
    if (!targetStr) return '';
    const cleanStr = targetStr.trim();
    const parts = cleanStr.includes('T') ? cleanStr.split('T') : cleanStr.split(' ');
    const datePart = parts[0];
    let timePart = parts.length > 1 ? parts[1] : '';

    if (!timePart && fallbackStr) {
      const fbClean = fallbackStr.trim();
      const fbParts = fbClean.includes('T') ? fbClean.split('T') : fbClean.split(' ');
      if (fbParts.length > 1) {
        timePart = fbParts[1];
      }
    }

    const dSub = datePart.split('-');
    if (dSub.length === 3) {
      const formattedDate = `${dSub[2]}/${dSub[1]}/${dSub[0]}`;
      if (timePart) {
        const cleanTime = timePart.split('.')[0];
        const fullTime = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime.slice(0, 8);
        return `${formattedDate} ${fullTime}`;
      }
      return `${formattedDate} 00:00:00`;
    }
    if (parts.length > 1) {
      const cleanTime = timePart.split('.')[0];
      const fullTime = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime.slice(0, 8);
      return `${parts[0]} ${fullTime}`;
    }
    return targetStr;
  };

  // Get certifications covering a specific month of the selected year
  const getCertsForMonth = (monthIndex) => {
    const startOfMonth = new Date(selectedYear, monthIndex, 1, 0, 0, 0);
    const endOfMonth = new Date(selectedYear, monthIndex + 1, 0, 23, 59, 59);

    return certificationsList.filter((cert) => {
      if (!cert) return false;
      const cStart = parseCleanDate(cert.start_date);
      const cEnd = parseCleanDate(cert.end_date, true);
      if (!cStart || !cEnd) return false;
      return cStart <= endOfMonth && cEnd >= startOfMonth;
    });
  };

  // Calculate coverage status for each month of selected year
  const getMonthCoverageStatus = (monthIndex) => {
    const monthCerts = getCertsForMonth(monthIndex);
    const startOfMonth = new Date(selectedYear, monthIndex, 1);
    const today = new Date();

    if (monthCerts.length > 0) return 'certified';
    if (startOfMonth > today) return 'future';
    return 'pending';
  };

  // Compute active certification brackets spanning months in the selected year (with distinct height levels)
  const getYearCertificationBrackets = () => {
    const yearStart = new Date(selectedYear, 0, 1, 0, 0, 0);
    const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59);

    const rawList = certificationsList
      .map((cert) => {
        if (!cert) return null;
        const cStart = parseCleanDate(cert.start_date);
        const cEnd = parseCleanDate(cert.end_date, true);
        if (!cStart || !cEnd) return null;

        if (cStart > yearEnd || cEnd < yearStart) return null;

        let startMonth = cStart < yearStart ? 0 : cStart.getMonth();
        let endMonth = cEnd > yearEnd ? 11 : cEnd.getMonth();

        const colorScheme = getCertColor(cert);

        return {
          cert,
          startMonth,
          endMonth,
          colorScheme,
          cStart,
          cEnd
        };
      })
      .filter(Boolean);

    rawList.sort((a, b) => a.cStart - b.cStart);

    // Assign minimal rows (height levels) to prevent horizontal collision
    const rows = [];
    rawList.forEach((b) => {
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        const canFit = rows[r].every(
          (existing) => b.endMonth < existing.startMonth || b.startMonth > existing.endMonth
        );
        if (canFit) {
          rows[r].push(b);
          b.rowIndex = r;
          placed = true;
          break;
        }
      }
      if (!placed) {
        b.rowIndex = rows.length;
        rows.push([b]);
      }
    });

    return rawList;
  };

  const activeBrackets = getYearCertificationBrackets();

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
            <CalendarIcon size={32} style={{ color: 'var(--accent-cyan)' }} />
            Calendario de Operaciones y Certificaciones
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.4rem 0 0 0', fontSize: '0.95rem' }}>
            Control de períodos auditados, inconsistencias FIFO, faltantes de P2P y dictámenes contables
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={openPonteAlDiaModal}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: '700',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
            }}
          >
            <Sparkles size={18} />
            Ponete al Día
            {(gaps.length + anomalies.length) > 0 && (
              <span style={{ background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem' }}>
                {gaps.length + anomalies.length}
              </span>
            )}
          </button>

          <button
            onClick={async () => {
              try {
                await fetch(`${API_BASE}/certifications/sync`, { method: 'POST' });
                fetchCertifications();
                fetchWarningsAndGaps();
                alert("Sincronización de cobertura legal realizada con éxito.");
              } catch (err) {
                console.error(err);
              }
            }}
            className="btn-primary"
            style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid #34d399', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title="Vincular transacciones con calendario certificado"
          >
            <ShieldCheck size={18} />
            Sincronizar Cobertura
          </button>

          <button
            onClick={() => { fetchCertifications(); fetchWarningsAndGaps(); }}
            className="btn-primary"
            style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title="Actualizar datos"
          >
            <RefreshCw size={18} className={(loading || loadingWarnings) ? 'spin' : ''} />
            Refrescar
          </button>

          {activeTab === 'certifications' && (
            <button
              onClick={openNewCertificationModal}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Plus size={18} />
              Nueva Certificación
            </button>
          )}
        </div>
      </div>

      {/* Tabs Selector Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setActiveTab('certifications')}
          style={{
            background: activeTab === 'certifications' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            border: activeTab === 'certifications' ? '1px solid #38bdf8' : '1px solid transparent',
            color: activeTab === 'certifications' ? '#38bdf8' : 'var(--text-secondary)',
            padding: '0.65rem 1.25rem',
            borderRadius: '0.6rem',
            fontWeight: '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <ShieldCheck size={18} />
          Dictámenes & Certificaciones Contables
        </button>

        <button
          onClick={() => setActiveTab('warnings')}
          style={{
            background: activeTab === 'warnings' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
            border: activeTab === 'warnings' ? '1px solid #f59e0b' : '1px solid transparent',
            color: activeTab === 'warnings' ? '#fbbf24' : 'var(--text-secondary)',
            padding: '0.65rem 1.25rem',
            borderRadius: '0.6rem',
            fontWeight: '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <AlertTriangle size={18} color={activeTab === 'warnings' ? '#fbbf24' : 'currentColor'} />
          Operaciones & Advertencias
          {(gaps.length + anomalies.length) > 0 && (
            <span style={{
              background: '#ef4444',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: '700',
              padding: '0.15rem 0.55rem',
              borderRadius: '999px',
              marginLeft: '0.3rem'
            }}>
              {gaps.length + anomalies.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'warnings' ? (
        <div>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Estado de Consistencia</span>
                {(gaps.length + anomalies.length) === 0 ? (
                  <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={14} /> Historial Consistente
                  </span>
                ) : (
                  <span className="badge badge-red" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <AlertTriangle size={14} /> Advertencias Pendientes
                  </span>
                )}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: (gaps.length + anomalies.length) === 0 ? '#4ade80' : '#fbbf24' }}>
                {(gaps.length + anomalies.length) === 0 ? 'Sin Advertencias' : `${gaps.length + anomalies.length} Inconsistencia(s)`}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                {(gaps.length + anomalies.length) === 0
                  ? 'Todas tus operaciones tienen respaldo y compras previas registradas'
                  : 'Faltan compras o datos de adquisición para cubrir algunas ventas o P2P'}
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Exchanges Afectados</span>
                <Sparkles size={20} style={{ color: 'var(--accent-purple)' }} />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {Array.from(new Set([...gaps.map(g => g.exchange), ...anomalies.map(a => a.exchange)])).join(', ') || 'Ninguno'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                Revisá y completá la información exchange por exchange de forma guiada
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Acción Recomendada</span>
                <Wand2 size={20} style={{ color: 'var(--accent-cyan)' }} />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#38bdf8' }}>
                Resolutor Guiado
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                Hacé clic en "Resolver" para ingresar datos faltantes sin modificar archivos originales
              </div>
            </div>
          </div>

          {/* Dynamic Timeline Bar for Warnings & Coverage */}
          <div className="glass-card" style={{ padding: '1.75rem', borderRadius: '1rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={20} style={{ color: 'var(--accent-cyan)' }} />
                  Línea de Tiempo de Consistencia
                </h3>

                {/* Multi-Year Selector Controls (Adelante y Atrás) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(15, 23, 42, 0.8)', padding: '0.2rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => setSelectedYear((prev) => prev - 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Año anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr} style={{ background: '#0f172a', color: 'white' }}>
                        {yr}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSelectedYear((prev) => prev + 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Año siguiente"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#22c55e' }}></div>
                  <span>Auditado / Certificado</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 4px, #d97706 4px, #d97706 8px)' }}></div>
                  <span>Advertencia / Hueco</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#38bdf8' }}></div>
                  <span>Ponete al Día</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}></div>
                  <span>Futuro</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.5rem' }}>
              {months.map((monthName, mIdx) => {
                const today = new Date();
                const currentYear = today.getFullYear();
                const currentMonth = today.getMonth();
                const isFuture = selectedYear > currentYear || (selectedYear === currentYear && mIdx > currentMonth);

                const monthGaps = gaps.filter(g => {
                  if (!g.date) return false;
                  const d = new Date(g.date.split(' ')[0]);
                  return d.getFullYear() === selectedYear && d.getMonth() === mIdx;
                });
                const monthCerts = getCertsForMonth(mIdx);
                const hasGaps = monthGaps.length > 0;
                const isCertified = monthCerts.length > 0;
                const certTitles = monthCerts.map(c => c.title || c.cpa_name || 'Certificación Contable').join(' | ');

                // Calculate visual state
                let bg = 'rgba(56, 189, 248, 0.08)';
                let border = '1px solid rgba(56, 189, 248, 0.3)';
                let titleColor = '#38bdf8';
                let labelColor = '#93c5fd';
                let labelText = '🔄 Ponete al Día';
                let tooltipText = `Mes transcurrido sin certificación. Clic para poner al día.`;

                if (isFuture) {
                  bg = 'rgba(15, 23, 42, 0.4)';
                  border = '1px solid rgba(255, 255, 255, 0.05)';
                  titleColor = '#64748b';
                  labelColor = '#475569';
                  labelText = 'Futuro';
                  tooltipText = `Mes futuro (${monthName} ${selectedYear}). Aún no transcurrido.`;
                } else if (isCertified) {
                  bg = 'rgba(34, 197, 94, 0.15)';
                  border = '1px solid #22c55e';
                  titleColor = '#4ade80';
                  labelColor = '#86efac';
                  labelText = '✓ Auditado';
                  tooltipText = `🛡️ Período Auditado con Certificación Contable: ${certTitles}`;
                } else if (hasGaps) {
                  bg = 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.2) 6px, rgba(217, 119, 6, 0.3) 6px, rgba(217, 119, 6, 0.3) 12px)';
                  border = '1px solid #f59e0b';
                  titleColor = '#fbbf24';
                  labelColor = '#fef08a';
                  labelText = '⚠️ Hueco';
                  tooltipText = `⚠️ ${monthGaps.length} advertencia(s) de consistencia en ${monthName} ${selectedYear}. Clic para resolver.`;
                }

                return (
                  <div
                    key={monthName}
                    title={tooltipText}
                    style={{
                      background: bg,
                      border: border,
                      borderRadius: '0.6rem',
                      padding: '0.75rem 0.5rem',
                      textAlign: 'center',
                      cursor: (!isFuture) ? 'pointer' : 'default',
                      transition: 'transform 0.15s ease',
                      opacity: isFuture ? 0.6 : 1
                    }}
                    onClick={() => {
                      if (hasGaps && monthGaps[0]) {
                        openResolverModal(monthGaps[0]);
                      } else if (isCertified) {
                        setActiveTab('certifications');
                      } else if (!isFuture) {
                        openPonteAlDiaModal();
                      }
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: titleColor }}>{monthName}</div>
                    <div style={{ fontSize: '0.7rem', marginTop: '0.3rem', color: labelColor }}>
                      {labelText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Warnings List - Grouped by Exchange */}
          {(() => {
            const allWarningsList = [
              ...gaps.map(g => ({ ...g, isGap: true })),
              ...anomalies.map(a => ({ ...a, isAnomaly: true }))
            ];

            const groupedExchanges = allWarningsList.reduce((acc, item) => {
              const ex = item.exchange || 'Otros Exchanges';
              if (!acc[ex]) acc[ex] = [];
              acc[ex].push(item);
              return acc;
            }, {});

            const exchangeNames = Object.keys(groupedExchanges);
            const filteredNames = selectedExchangeFilter === 'ALL'
              ? exchangeNames
              : exchangeNames.filter(name => name === selectedExchangeFilter);

            return (
              <div className="glass-card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={20} color="#f59e0b" />
                    Lista de Advertencias Agrupadas por Exchange ({allWarningsList.length})
                  </h3>
                </div>

                {allWarningsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={48} color="#4ade80" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                    <h4 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: '0 0 0.5rem' }}>¡Sin Advertencias Pendientes!</h4>
                    <p style={{ fontSize: '0.9rem', margin: 0 }}>Tus archivos cargados y movimientos tienen consistencia completa y compras previas registradas.</p>
                  </div>
                ) : (
                  <div>
                    {/* Exchange Filter Pills Header */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
                      <button
                        onClick={() => setSelectedExchangeFilter('ALL')}
                        style={{
                          background: selectedExchangeFilter === 'ALL' ? 'linear-gradient(135deg, #38bdf8, #0284c7)' : 'rgba(30, 41, 59, 0.8)',
                          color: selectedExchangeFilter === 'ALL' ? '#fff' : 'var(--text-secondary)',
                          border: selectedExchangeFilter === 'ALL' ? 'none' : '1px solid var(--border-color)',
                          padding: '0.45rem 0.9rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.82rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Todos los Exchanges ({allWarningsList.length})
                      </button>

                      {exchangeNames.map((exName) => {
                        const count = groupedExchanges[exName].length;
                        const isActive = selectedExchangeFilter === exName;
                        return (
                          <button
                            key={exName}
                            onClick={() => setSelectedExchangeFilter(exName)}
                            style={{
                              background: isActive ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(30, 41, 59, 0.8)',
                              color: isActive ? '#fff' : 'var(--text-secondary)',
                              border: isActive ? 'none' : '1px solid var(--border-color)',
                              padding: '0.45rem 0.9rem',
                              borderRadius: '0.5rem',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem'
                            }}
                          >
                            {exName}
                            <span style={{ background: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.45rem', borderRadius: '0.4rem', fontSize: '0.75rem', color: '#fef08a' }}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Grouped Accordions by Exchange */}
                    <div style={{ display: 'grid', gap: '1.25rem' }}>
                      {filteredNames.map((exName) => {
                        const items = groupedExchanges[exName] || [];
                        const isExpanded = expandedExchanges[exName] !== false; // expanded by default
                        const limit = exchangeLimits[exName] || 10;
                        const visibleItems = items.slice(0, limit);

                        return (
                          <div key={exName} style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '0.85rem', overflow: 'hidden' }}>
                            {/* Accordion Group Header */}
                            <div
                              style={{
                                padding: '1rem 1.25rem',
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                userSelect: 'none',
                                borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
                              }}
                              onClick={() => toggleExchangeExpand(exName)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <span className="badge badge-amber" style={{ fontSize: '0.9rem', fontWeight: 'bold', padding: '0.35rem 0.75rem' }}>
                                  {exName}
                                </span>
                                <span style={{ fontSize: '0.92rem', color: '#f8fafc', fontWeight: '600' }}>
                                  {items.length} Inconsistencia(s) detectadas
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <button
                                  className="btn-primary"
                                  style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', padding: '0.45rem 0.9rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fff', fontWeight: '600' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (items[0]) openResolverModal(items[0]);
                                  }}
                                >
                                  <Wand2 size={14} />
                                  Resolver {exName} →
                                </button>

                                <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                  {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                                </button>
                              </div>
                            </div>

                            {/* Accordion Group Items List */}
                            {isExpanded && (
                              <div style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                                {visibleItems.map((item, idx) => (
                                  <div
                                    key={`${exName}-${idx}`}
                                    style={{
                                      background: 'rgba(15, 23, 42, 0.9)',
                                      border: '1px solid rgba(255, 255, 255, 0.08)',
                                      borderRadius: '0.65rem',
                                      padding: '1rem 1.25rem',
                                      display: 'flex',
                                      justify: 'space-between',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: '1rem'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1 }}>
                                      <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '0.55rem', borderRadius: '0.5rem', color: '#fbbf24', flexShrink: 0 }}>
                                        <AlertTriangle size={20} />
                                      </div>
                                      <div>
                                        <div style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: '600', marginBottom: '0.2rem' }}>
                                          {item.date ? item.date.split(' ')[0] : ''}
                                        </div>
                                        <div style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#f8fafc' }}>
                                          {item.isGap
                                            ? `Venta de ${item.sold_qty} ${item.coin} (Faltan ${item.deficit ? item.deficit.toFixed(4) : 0} ${item.coin} de compra previa)`
                                            : (item.message || `Phantom Sale de ${item.missing} ${item.crypto}`)}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                          No se encontró un registro de compra o depósito previo para cubrir la salida FIFO.
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      className="btn-primary"
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.18)',
                                        border: '1px solid rgba(245, 158, 11, 0.5)',
                                        color: '#fbbf24',
                                        padding: '0.45rem 0.9rem',
                                        fontSize: '0.82rem',
                                        fontWeight: '600',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer'
                                      }}
                                      onClick={() => openResolverModal(item)}
                                    >
                                      Resolver →
                                    </button>
                                  </div>
                                ))}

                                {items.length > visibleItems.length && (
                                  <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                                    <button
                                      onClick={() => loadMoreForExchange(exName)}
                                      style={{
                                        background: 'rgba(30, 41, 59, 0.8)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--accent-cyan)',
                                        padding: '0.55rem 1.25rem',
                                        borderRadius: '0.5rem',
                                        fontSize: '0.82rem',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Mostrar más advertencias de {exName} ({items.length - visibleItems.length} restantes)...
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <>
          {/* Summary KPI Cards (100% Dynamic) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

        {/* Card 1: Status */}
        <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Estado Auditado</span>
            {certData.summary.status === 'up_to_date' ? (
              <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <CheckCircle2 size={14} /> Certificado al Día
              </span>
            ) : (
              <span className="badge badge-red" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertTriangle size={14} /> Atención Requerida
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: certData.summary.status === 'up_to_date' ? '#4ade80' : '#f87171' }}>
            {certData.summary.status === 'up_to_date' ? 'Período Cubierto' : 'Certificación Pendiente'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            {certData.summary.status === 'up_to_date'
              ? 'Tus movimientos están respaldados formalmente'
              : 'Se requiere subir dictamen contable para actualizar cobertura'}
          </div>
        </div>

        {/* Card 2: Latest Certified Range */}
        <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Último Período Certificado</span>
            <ShieldCheck size={20} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {certData.summary.latest_end_date ? (
              <span>Hasta {formatDateTime(certData.summary.latest_end_date)}</span>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>Sin registros</span>
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            {certData.summary.total_count > 0 ? `${certData.summary.total_count} certificación(es) registrada(s)` : 'No se han cargado certificados aún'}
          </div>
        </div>

        {/* Card 3: Days Pending */}
        <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Período Sin Certificar</span>
            <Clock size={20} style={{ color: certData.summary.uncertified_days ? '#fbbf24' : '#4ade80' }} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: certData.summary.uncertified_days ? '#fbbf24' : '#4ade80' }}>
            {certData.summary.uncertified_days !== null ? `${certData.summary.uncertified_days} Días` : 'Pendiente total'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
            {certData.summary.uncertified_days > 0
              ? `Transcurridos desde el vencimiento anterior`
              : certData.summary.uncertified_days === 0
              ? 'Cobertura total garantizada hasta la fecha'
              : 'Ingresá tu primer certificado contable'}
          </div>
        </div>
      </div>

      {/* Visual Dynamic Multi-Year Timeline Bar Chart with External Certification Brackets */}
      <div className="glass-card" style={{ padding: '1.75rem', borderRadius: '1rem', marginBottom: '2rem', position: 'relative', zIndex: 20, overflow: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CalendarIcon size={20} style={{ color: 'var(--accent-purple)' }} />
              Línea de Tiempo de Cobertura
            </h3>

            {/* Dynamic Multi-Year Selector Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(15, 23, 42, 0.8)', padding: '0.2rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setSelectedYear((prev) => prev - 1)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Año anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-cyan)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr} style={{ background: '#0f172a', color: 'white' }}>
                    {yr}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSelectedYear((prev) => prev + 1)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Año siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#22c55e' }}></div>
              <span>Certificado</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b', border: '1px dashed #fbbf24' }}></div>
              <span>Pendiente de Certificar</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)' }}></div>
              <span>Período Futuro</span>
            </div>
          </div>
        </div>

        {/* Outer Certification Grouping Brackets */}
        {activeBrackets.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.4rem 0.6rem', marginBottom: '0.75rem' }}>
            {activeBrackets.map((b, bIdx) => {
              const spanCols = b.endMonth - b.startMonth + 1;
              const shortTitle = b.cert.title ? b.cert.title.replace('Certificación Contable', 'Cert.').replace('Certificación', 'Cert.') : '';
              return (
                <div
                  key={b.cert.id || bIdx}
                  style={{
                    gridColumn: `${b.startMonth + 1} / span ${spanCols}`,
                    gridRow: `${(b.rowIndex || 0) + 1}`,
                    background: b.colorScheme.bg,
                    border: `1.5px solid ${b.colorScheme.border}`,
                    borderRadius: '0.5rem',
                    padding: '0.35rem 0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    gap: '0.4rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: b.colorScheme.text,
                    boxShadow: `0 0 10px ${b.colorScheme.bg}`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={`Dictamen: ${b.cert.title} | Cobertura: ${formatDateTime(b.cert.start_date)} - ${formatDateTime(b.cert.end_date, b.cert.created_at || b.cert.issue_date)}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                    <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {spanCols <= 1 ? shortTitle : b.cert.title}
                    </span>
                  </div>
                  {b.cert.cpa_name && spanCols > 1 && (
                    <span style={{ fontSize: '0.7rem', opacity: 0.85, flexShrink: 0 }}>
                      Cr. {b.cert.cpa_name.split(' ')[0]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline Grid Bar for Selected Year */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.6rem', position: 'relative', zIndex: 25 }}>
          {months.map((monthName, idx) => {
            const monthCerts = getCertsForMonth(idx);
            const status = getMonthCoverageStatus(idx);
            const isShared = monthCerts.length > 1;

            let bgColor = 'rgba(255, 255, 255, 0.05)';
            let borderColor = 'rgba(255, 255, 255, 0.1)';
            let textColor = 'var(--text-secondary)';

            if (status === 'certified') {
              if (isShared) {
                const c1 = getCertColor(monthCerts[0]);
                const c2 = getCertColor(monthCerts[1]);
                bgColor = 'rgba(30, 41, 59, 0.8)';
                borderColor = c1.border;
                textColor = '#ffffff';
              } else if (monthCerts.length === 1) {
                const cScheme = getCertColor(monthCerts[0]);
                bgColor = cScheme.lightBg;
                borderColor = cScheme.border;
                textColor = cScheme.text;
              } else {
                bgColor = 'rgba(34, 197, 94, 0.25)';
                borderColor = '#22c55e';
                textColor = '#4ade80';
              }
            } else if (status === 'pending') {
              bgColor = 'rgba(245, 158, 11, 0.2)';
              borderColor = '#f59e0b';
              textColor = '#fbbf24';
            }

            return (
              <div
                key={monthName}
                style={{
                  background: bgColor,
                  border: `1.5px solid ${borderColor}`,
                  borderRadius: '0.6rem',
                  padding: '0.85rem 0.4rem',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: hoveredMonth === idx ? 100 : 1,
                  boxShadow: hoveredMonth === idx ? '0 0 15px rgba(56, 189, 248, 0.3)' : 'none',
                  transform: hoveredMonth === idx ? 'translateY(-2px)' : 'none'
                }}
                onMouseEnter={() => setHoveredMonth(idx)}
                onMouseLeave={() => setHoveredMonth(null)}
                onClick={() => {
                  if (status === 'pending') {
                    const startD = `${selectedYear}-${String(idx + 1).padStart(2, '0')}-01`;
                    const endD = new Date(selectedYear, idx + 1, 0).toISOString().split('T')[0];
                    setFormData((prev) => ({
                      ...prev,
                      title: `Certificación ${monthName} ${selectedYear}`,
                      start_date: startD,
                      end_date: endD
                    }));
                    setShowModal(true);
                  }
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: textColor }}>{monthName}</div>
                <div style={{ fontSize: '0.7rem', marginTop: '0.3rem', color: textColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                  {isShared ? (
                    <span style={{ background: 'rgba(245, 158, 11, 0.3)', padding: '0.1rem 0.3rem', borderRadius: '0.3rem', fontSize: '0.65rem', fontWeight: 'bold', border: '1px solid #f59e0b', color: '#fbbf24' }}>
                      ⚡ Transición
                    </span>
                  ) : status === 'certified' ? (
                    '✓ Auditado'
                  ) : status === 'pending' ? (
                    '⚠️ Sin cert.'
                  ) : (
                    '-'
                  )}
                </div>

                {/* Floating Interactive Hover Tooltip Popover */}
                <AnimatePresence>
                  {hoveredMonth === idx && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 10px)',
                        top: 'auto',
                        left: idx > 8 ? 'auto' : idx < 3 ? '0' : '50%',
                        right: idx > 8 ? '0' : 'auto',
                        transform: idx > 8 || idx < 3 ? 'none' : 'translateX(-50%)',
                        zIndex: 9999,
                        width: '310px',
                        background: '#0f172a',
                        border: '1.5px solid var(--accent-cyan)',
                        boxShadow: '0 20px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(6, 182, 212, 0.2)',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        textAlign: 'left',
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', borderBottom: '1px solid rgba(255,255,255,0.1)', pb: '0.4rem' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>
                          📅 {monthName.toUpperCase()} {selectedYear}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {monthCerts.length} Dictamen(es)
                        </span>
                      </div>

                      {monthCerts.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {status === 'pending' ? '⚠️ Período sin certificar.' : 'Período futuro.'}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          {monthCerts.map((c, cIdx) => {
                            const cColor = getCertColor(c);
                            return (
                              <div
                                key={c.id || cIdx}
                                style={{
                                  background: 'rgba(30, 41, 59, 0.6)',
                                  borderLeft: `3px solid ${cColor.border}`,
                                  padding: '0.5rem 0.6rem',
                                  borderRadius: '0.4rem'
                                }}
                              >
                                <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: cColor.text, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <ShieldCheck size={13} />
                                  {c.title}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                  • Cobertura: <strong style={{ color: '#fff' }}>{formatDateTime(c.start_date)}</strong> ➔ <strong style={{ color: '#fff' }}>{formatDateTime(c.end_date, c.created_at || c.issue_date)}</strong>
                                </div>
                                {c.cpa_name && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                    • CPA: {c.cpa_name}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Certifications Table */}
      <div className="glass-card" style={{ padding: '1.75rem', borderRadius: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} style={{ color: 'var(--accent-cyan)' }} />
            Registro de Certificaciones Contables
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Total: {certData.certifications.length} registro(s)
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Cargando certificaciones contables...
          </div>
        ) : certData.certifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', border: '2px dashed var(--border-color)', borderRadius: '0.75rem' }}>
            <UploadCloud size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem', opacity: 0.7 }} />
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>No hay certificaciones registradas</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
              Registrá tus certificaciones contables para mantener al día el historial de auditoría e impositivo.
            </p>
            <button onClick={openNewCertificationModal} className="btn-primary">
              + Cargar Primer Certificado
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Título / Objeto</th>
                  <th>Período Cubierto</th>
                  <th>Emisor / Contador</th>
                  <th>Fecha Emisión</th>
                  <th>Documento Adjunto</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {certData.certifications.map((cert) => (
                  <tr key={cert.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {cert.title}
                      {cert.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginTop: '0.15rem' }}>
                          {cert.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {formatDateTime(cert.start_date)} al {formatDateTime(cert.end_date)}
                      </span>
                    </td>
                    <td>{cert.cpa_name || <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                    <td>{formatDateTime(cert.issue_date, cert.created_at) || <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                    <td>
                      {cert.file_path ? (
                        <a
                          href={`${API_BASE}/certifications/download/${cert.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none', fontWeight: 500 }}
                        >
                          <Download size={14} /> Descargar PDF
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Sin archivo</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => openDeleteConfirm(cert.id, cert.title)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '0.4rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        title="Eliminar registro"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nueva Certificación con Auto-Detección Inteligente y Carga Masiva */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: fileQueue.length > 1 ? '820px' : '620px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '2rem',
                borderRadius: '1.25rem',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
                transition: 'max-width 0.3s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={24} style={{ color: 'var(--accent-cyan)' }} />
                    Registrar Certificaciones Contables
                  </h3>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Podés seleccionar uno o varios archivos PDF para procesar de a lote.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem' }}
                >
                  <X size={20} />
                </button>
              </div>

              {errorMessage && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {successMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                
                {/* Drag & Drop / Multi-file Selector Zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesAdd(e.dataTransfer.files);
                    }
                  }}
                  style={{
                    border: `2px dashed ${isDragging ? 'var(--accent-cyan)' : 'rgba(56, 189, 248, 0.4)'}`,
                    borderRadius: '0.75rem',
                    padding: fileQueue.length > 0 ? '0.85rem 1rem' : '1.5rem 1rem',
                    background: isDragging ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => document.getElementById('certFileInput').click()}
                >
                  <input
                    id="certFileInput"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.zip"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files) handleFilesAdd(e.target.files);
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', color: 'var(--accent-cyan)' }}>
                    <UploadCloud size={24} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f8fafc' }}>
                      {fileQueue.length > 0 ? '+ Seleccionar o arrastrar más archivos' : 'Hacé clic o arrastrá uno o múltiples archivos PDF aquí'}
                    </span>
                  </div>
                  {fileQueue.length === 0 && (
                    <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Soporta PDFs individuales o en lote. Se autodetectarán los períodos de cada archivo.
                    </p>
                  )}
                </div>

                {/* Case 1: Multiple or Single Files in Queue */}
                {fileQueue.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Archivos para Registrar ({fileQueue.length}):
                      </span>
                    </div>

                    {fileQueue.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '0.75rem',
                          padding: '1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}
                      >
                        {/* Queue Item Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                            <FileText size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
                              {item.filename}
                            </span>
                          </div>


                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {item.parsing ? (

                              <span
                                className="badge"
                                style={{
                                  position: 'relative',
                                  background: 'rgba(15, 23, 42, 0.95)',
                                  color: '#38bdf8',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  padding: '0.35rem 0.85rem',
                                  borderRadius: '2rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  overflow: 'hidden',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)'
                                }}
                              >
                                {/* 360° Sweeping Conic Border Halo */}
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: '-3px',
                                    borderRadius: '2rem',
                                    padding: '2.5px',
                                    background: 'conic-gradient(from 0deg, #38bdf8 0%, #818cf8 35%, rgba(56, 189, 248, 0.15) 70%, transparent 100%)',
                                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                    WebkitMaskComposite: 'xor',
                                    maskComposite: 'exclude',
                                    animation: 'spinHalo 2s linear infinite',
                                    pointerEvents: 'none'
                                  }}
                                />
                                <Wand2 size={13} className="spin" style={{ zIndex: 1, position: 'relative' }} />
                                <span style={{ zIndex: 1, position: 'relative' }}>Analizando PDF...</span>
                              </span>


                            ) : item.parsedSuccess ? (

                              <span className="badge badge-green" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderRadius: '2rem', padding: '0.35rem 0.75rem' }}>
                                <Sparkles size={13} /> Autocompletado
                              </span>
                            ) : (
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '0.75rem', borderRadius: '2rem', padding: '0.35rem 0.75rem' }}>
                                Verificar fechas
                              </span>
                            )}


                            <button
                              type="button"
                              onClick={() => handleRemoveQueueItem(item.id)}
                              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', cursor: 'pointer' }}
                              title="Quitar de la lista"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Fields per Queue Item */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                              Título / Descripción
                            </label>
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => handleQueueItemChange(item.id, 'title', e.target.value)}
                              style={{
                                width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.4rem',
                                background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box'
                              }}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                Fecha Inicio (Desde) *
                              </label>
                              <input
                                type="date"
                                value={item.start_date}
                                onChange={(e) => handleQueueItemChange(item.id, 'start_date', e.target.value)}
                                style={{
                                  width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.4rem',
                                  background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box'
                                }}
                                required
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                Fecha Fin (Hasta) *
                              </label>
                              <input
                                type="date"
                                value={item.end_date}
                                onChange={(e) => handleQueueItemChange(item.id, 'end_date', e.target.value)}
                                style={{
                                  width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.4rem',
                                  background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box'
                                }}
                                required
                              />
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                Contador Emisor / Matrícula
                              </label>
                              <input
                                type="text"
                                value={item.cpa_name}
                                onChange={(e) => handleQueueItemChange(item.id, 'cpa_name', e.target.value)}
                                placeholder="Ej: CPN Carlos Gómez (Mat. 1234)"
                                style={{
                                  width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.4rem',
                                  background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box'
                                }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                Observaciones / Notas
                              </label>
                              <input
                                type="text"
                                value={item.notes}
                                onChange={(e) => handleQueueItemChange(item.id, 'notes', e.target.value)}
                                placeholder="Notas aclaratorias..."
                                style={{
                                  width: '100%', padding: '0.55rem 0.75rem', borderRadius: '0.4rem',
                                  background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Case 2: Manual Registration Form (When no files uploaded) */
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Título / Descripción
                      </label>
                      <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="Ej: Certificación Contable Anual 2023"
                        style={{
                          width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                          background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                          Fecha Inicio (Desde) *
                        </label>
                        <input
                          type="date"
                          name="start_date"
                          value={formData.start_date}
                          onChange={handleInputChange}
                          style={{
                            width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                            background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box'
                          }}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                          Fecha Fin (Hasta) *
                        </label>
                        <input
                          type="date"
                          name="end_date"
                          value={formData.end_date}
                          onChange={handleInputChange}
                          style={{
                            width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                            background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box'
                          }}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                          Fecha de Emisión
                        </label>
                        <input
                          type="date"
                          name="issue_date"
                          value={formData.issue_date}
                          onChange={handleInputChange}
                          style={{
                            width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                            background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                          Contador Emisor / Matrícula
                        </label>
                        <input
                          type="text"
                          name="cpa_name"
                          value={formData.cpa_name}
                          onChange={handleInputChange}
                          placeholder="Ej: CPN Carlos Gómez (Mat. 1234)"
                          style={{
                            width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                            background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        Observaciones / Notas
                      </label>
                      <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        rows="2"
                        placeholder="Notas internas o aclaraciones del dictamen..."
                        style={{
                          width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                          background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      background: 'transparent', border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)', padding: '0.75rem 1.25rem', borderRadius: '0.5rem',
                      cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting
                      ? 'Guardando...'
                      : fileQueue.length > 1
                      ? `Guardar ${fileQueue.length} Certificaciones`
                      : 'Guardar Certificación'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
      )}

      {/* Glassmorphism PDF OCR Loading Overlay */}
      <AnimatePresence>
        {parsingPdf && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.2)',
                borderRadius: '1.25rem', padding: '2.5rem', maxWidth: '460px', width: '100%',
                textAlign: 'center', color: '#f8fafc'
              }}
            >
              <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 1.5rem' }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '4px solid rgba(56, 189, 248, 0.15)',
                  borderTopColor: '#38bdf8',
                  animation: 'spin 1s linear infinite'
                }} />
                <div style={{
                  position: 'absolute', inset: '10px', borderRadius: '50%',
                  border: '4px solid rgba(129, 140, 248, 0.15)',
                  borderBottomColor: '#818cf8',
                  animation: 'spin 1.5s linear infinite reverse'
                }} />
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', fontSize: '2rem'
                }}>
                  📄
                </div>
              </div>

              <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.75rem', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Escaneando Documento PDF...
              </h3>

              <p style={{ fontSize: '0.92rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 0.75rem' }}>
                El motor de análisis está procesando las firmas, sellos y tablas del documento.
              </p>

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '0.4rem 0.85rem', borderRadius: '2rem', fontSize: '0.85rem',
                color: '#38bdf8', fontWeight: 600, marginBottom: '1.5rem'
              }}>
                ⏱️ Tiempo estimado: ~5 a 15 segundos
              </div>


              <div style={{
                height: '6px', width: '100%', background: 'rgba(51, 65, 85, 0.6)',
                borderRadius: '3px', overflow: 'hidden', position: 'relative'
              }}>
                <div style={{
                  position: 'absolute', height: '100%', width: '40%',
                  background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                  borderRadius: '3px', animation: 'progressPulse 1.8s ease-in-out infinite'
                }} />
              </div>

              <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes progressPulse { 0% { left: -40%; } 100% { left: 100%; } }
                @keyframes spinHalo { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes haloPulse {
                  0% { box-shadow: 0 0 6px rgba(56, 189, 248, 0.4), inset 0 0 4px rgba(56, 189, 248, 0.2); border-color: rgba(56, 189, 248, 0.5); }
                  50% { box-shadow: 0 0 16px rgba(56, 189, 248, 0.9), inset 0 0 8px rgba(56, 189, 248, 0.5); border-color: #38bdf8; }
                  100% { box-shadow: 0 0 6px rgba(56, 189, 248, 0.4), inset 0 0 4px rgba(56, 189, 248, 0.2); border-color: rgba(56, 189, 248, 0.5); }
                }
              `}</style>


            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Modal Confirmación de Eliminación In-Page */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 3000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 15, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '1.75rem',
                borderRadius: '1.25rem',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px rgba(239, 68, 68, 0.15)',
                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
                color: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f87171',
                  flexShrink: 0
                }}>
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                    ¿Eliminar certificación?
                  </h3>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.4 }}>
                    ¿Estás seguro de eliminar la certificación <strong style={{ color: '#f8fafc' }}>"{deleteConfirm.title}"</strong>? Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  disabled={deleteConfirm.deleting}
                  onClick={() => setDeleteConfirm({ show: false, id: null, title: '', deleting: false })}
                  className="btn-primary"
                  style={{
                    background: 'rgba(51, 65, 85, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    padding: '0.55rem 1.1rem',
                    fontSize: '0.88rem'
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={deleteConfirm.deleting}
                  onClick={handleDeleteConfirm}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    cursor: deleteConfirm.deleting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                    opacity: deleteConfirm.deleting ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {deleteConfirm.deleting ? (
                    <>
                      <RefreshCw size={15} className="spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} />
                      Sí, Eliminar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Resolutor Guiado de Advertencias */}
      <AnimatePresence>
        {showResolverModal && selectedWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 2500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 15, opacity: 0 }}
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '560px',
                padding: '2rem',
                borderRadius: '1.25rem',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.99))',
                color: '#f8fafc',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.15)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fbbf24' }}>
                  <Wand2 size={22} /> Resolutor Guiado de Advertencias
                </h3>
                <button
                  onClick={() => setShowResolverModal(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Wizard Steps Progress Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '0.6rem 1rem', borderRadius: '0.6rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: resolverStep === 1 ? '#38bdf8' : '#4ade80', fontWeight: '600', fontSize: '0.82rem' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: resolverStep === 1 ? '#38bdf8' : '#22c55e', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>1</span>
                  Diagnóstico
                </div>
                <ChevronRight size={14} color="#64748b" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: resolverStep === 2 ? '#38bdf8' : resolverStep === 3 ? '#4ade80' : '#64748b', fontWeight: '600', fontSize: '0.82rem' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: resolverStep === 2 ? '#38bdf8' : resolverStep === 3 ? '#22c55e' : '#334155', color: resolverStep >= 2 ? '#0f172a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>2</span>
                  Completar Datos
                </div>
                <ChevronRight size={14} color="#64748b" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: resolverStep === 3 ? '#4ade80' : '#64748b', fontWeight: '600', fontSize: '0.82rem' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: resolverStep === 3 ? '#22c55e' : '#334155', color: resolverStep === 3 ? '#0f172a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>3</span>
                  Confirmación
                </div>
              </div>

              {resolverError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '0.6rem', padding: '0.75rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.85rem' }}>
                  {resolverError}
                </div>
              )}

              {resolverSuccess && (
                <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid #22c55e', borderRadius: '0.6rem', padding: '0.75rem', marginBottom: '1rem', color: '#4ade80', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={18} /> {resolverSuccess}
                </div>
              )}

              <form onSubmit={handleResolverSubmit}>
                {resolverStep === 1 && (
                  <div>
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.95rem', color: '#fef08a' }}>Detalle de la Operación Afectada</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        <strong>Exchange:</strong> {resolverData.exchange}<br />
                        <strong>Fecha de la Venta:</strong> {resolverData.date}<br />
                        <strong>Cripto & Monto Faltante:</strong> {resolverData.missing} {resolverData.crypto}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1.5rem' }}>
                      {/* Vía 1: Dropzone directo e in-situ */}
                      <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '0.75rem', padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '0.4rem', borderRadius: '0.4rem', color: '#38bdf8', flexShrink: 0 }}>
                            <UploadCloud size={22} />
                          </div>
                          <div>
                            <strong style={{ fontSize: '0.9rem', color: '#f8fafc', display: 'block' }}>Vía 1: Cargar Excel / CSV de {resolverData.exchange} directamente aquí</strong>
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.3', display: 'block', marginTop: '0.1rem' }}>
                              Subí la planilla de compras o depósitos para resolver esta advertencia al instante.
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            border: '2px dashed #0284c7',
                            borderRadius: '0.6rem',
                            padding: '1.25rem 1rem',
                            textAlign: 'center',
                            background: 'rgba(2, 132, 199, 0.06)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => document.getElementById('resolverFileInputInSitu').click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              handleInModalUpload(e.dataTransfer.files);
                            }
                          }}
                        >
                          <input
                            type="file"
                            id="resolverFileInputInSitu"
                            multiple
                            hidden
                            onChange={(e) => handleInModalUpload(e.target.files)}
                          />
                          <UploadCloud size={32} color="#38bdf8" style={{ marginBottom: '0.4rem' }} />
                          <div style={{ fontSize: '0.88rem', color: '#f8fafc', fontWeight: 'bold' }}>
                            Arrastrá o hacé clic para seleccionar tu Excel / CSV
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            Soporta .xlsx, .csv (Binance, Bitso, Fiwind, Ripio, etc.)
                          </div>
                        </div>

                        {inModalUploading && (
                          <div style={{ marginTop: '0.75rem', textAlign: 'center', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            ⏳ Procesando e importando transacciones al sistema...
                          </div>
                        )}

                        {inModalUploadMsg && (
                          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: inModalUploadMsg.type === 'success' ? '#4ade80' : '#fca5a5', textAlign: 'center', fontWeight: 'bold', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '0.4rem' }}>
                            {inModalUploadMsg.text}
                          </div>
                        )}
                      </div>

                      {/* Vía 2: Declarar Saldo Inicial */}
                      <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-color)', borderRadius: '0.65rem', padding: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '0.4rem', borderRadius: '0.4rem', color: '#fbbf24', flexShrink: 0 }}>
                          <Wand2 size={20} />
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.88rem', color: '#f8fafc', display: 'block' }}>Vía 2: Declarar Saldo Inicial / Ajuste Manual</strong>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.3', display: 'block', marginTop: '0.2rem' }}>
                            Si son compras P2P informales, saldo de años anteriores o regalos, hacé clic en Continuar para declarar la fecha estimada y costo.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <button type="button" onClick={() => setShowResolverModal(false)} className="btn-primary" style={{ background: '#334155', fontSize: '0.82rem' }}>Cerrar</button>
                      <button type="button" onClick={() => setResolverStep(2)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                        Ajuste Manual <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {resolverStep === 2 && (
                  <div>
                    <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>Origen / Tipo de Adquisición</label>
                        <select
                          value={resolverData.origin_type}
                          onChange={(e) => setResolverData(prev => ({ ...prev, origin_type: e.target.value }))}
                          style={{ width: '100%', padding: '0.6rem 0.8rem', background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: '#fff', fontSize: '0.9rem' }}
                        >
                          <option value="Capital Inicial / Años Anteriores">Capital Inicial / Años Anteriores</option>
                          <option value="Compra P2P Binance / Sin Respaldo">Compra P2P Binance / Sin Respaldo</option>
                          <option value="Ingreso por Transferencia">Ingreso por Transferencia de Wallet</option>
                          <option value="Recompensa / Staking / Airdrop">Recompensa / Staking / Airdrop</option>
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>Fecha de Adquisición</label>
                          <input
                            type="date"
                            value={resolverData.date ? resolverData.date.split(' ')[0] : ''}
                            onChange={(e) => setResolverData(prev => ({ ...prev, date: e.target.value }))}
                            style={{ width: '100%', padding: '0.6rem 0.8rem', background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: '#fff', fontSize: '0.9rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>Cantidad ({resolverData.crypto})</label>
                          <input
                            type="number"
                            step="any"
                            value={resolverData.missing}
                            onChange={(e) => setResolverData(prev => ({ ...prev, missing: parseFloat(e.target.value) || 0 }))}
                            style={{ width: '100%', padding: '0.6rem 0.8rem', background: '#0f172a', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: '#fff', fontSize: '0.9rem' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <button type="button" onClick={() => setResolverStep(1)} className="btn-primary" style={{ background: '#334155' }}>Atrás</button>
                      <button type="button" onClick={() => setResolverStep(3)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        Revisar <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {resolverStep === 3 && (
                  <div>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#38bdf8' }}>Resumen del Ajuste a Registrar</h4>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
                        <strong>Tipo:</strong> Compra / Ingreso de Ajuste FIFO<br />
                        <strong>Origen:</strong> {resolverData.origin_type}<br />
                        <strong>Criptomonedas:</strong> {resolverData.missing} {resolverData.crypto}<br />
                        <strong>Fecha de Registro:</strong> {resolverData.date}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <button type="button" onClick={() => setResolverStep(2)} className="btn-primary" style={{ background: '#334155' }} disabled={resolverSubmitting}>Atrás</button>
                      <button
                        type="submit"
                        className="btn-primary"
                        style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        disabled={resolverSubmitting}
                      >
                        {resolverSubmitting ? (
                          <>
                            <RefreshCw size={16} className="spin" /> Guardando...
                          </>
                        ) : (
                          <>
                            <Check size={16} /> Confirmar y Guardar Ajuste
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Ponete al Día - Checklist Interactivo por Exchange */}
      <AnimatePresence>
        {showPonteAlDiaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
              zIndex: 2600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            {(() => {
              const allWarningsList = [
                ...gaps.map(g => ({ ...g, isGap: true })),
                ...anomalies.map(a => ({ ...a, isAnomaly: true }))
              ];

              const groupedExchanges = allWarningsList.reduce((acc, item) => {
                const ex = item.exchange || 'Otros Exchanges';
                if (!acc[ex]) acc[ex] = [];
                acc[ex].push(item);
                return acc;
              }, {});

              const checklistExchanges = Object.keys(groupedExchanges);
              const totalSteps = checklistExchanges.length;
              const isFinished = ponteAlDiaStep >= totalSteps || totalSteps === 0;
              const currentExName = !isFinished ? checklistExchanges[ponteAlDiaStep] : null;
              const currentExItems = currentExName ? groupedExchanges[currentExName] : [];

              return (
                <motion.div
                  initial={{ scale: 0.92, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.92, y: 20, opacity: 0 }}
                  className="glass-card"
                  style={{
                    width: '100%',
                    maxWidth: '850px',
                    borderRadius: '1.25rem',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.99), rgba(15, 23, 42, 0.99))',
                    color: '#f8fafc',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 35px rgba(245, 158, 11, 0.2)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Modal Header */}
                  <div style={{ padding: '1.5rem 2rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fbbf24' }}>
                        <Sparkles size={24} /> Asistente "Ponete al Día" - Checklist por Exchange
                      </h3>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                        Resolución guiada paso a paso exchange por exchange para dejar tu contabilidad 100% al día
                      </p>
                    </div>
                    <button
                      onClick={() => setShowPonteAlDiaModal(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                    >
                      <X size={22} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div style={{ padding: '1.75rem 2rem' }}>
                    {isFinished ? (
                      /* Final Celebration View */
                      <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', border: '2px solid #22c55e', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                          <CheckCircle2 size={40} />
                        </div>
                        <h4 style={{ fontSize: '1.4rem', color: '#f8fafc', margin: '0 0 0.5rem', fontWeight: 'bold' }}>
                          ¡Felicitaciones! Tu Contabilidad está 100% al Día 🎉
                        </h4>
                        <p style={{ fontSize: '0.95rem', color: '#cbd5e1', maxWidth: '560px', margin: '0 auto 1.75rem', lineHeight: 1.5 }}>
                          Has completado el checklist de todos los exchanges. Todos tus movimientos tienen consistencia FIFO y no quedan advertencias ni faltantes pendientes.
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                          <button
                            onClick={() => setShowPonteAlDiaModal(false)}
                            className="btn-primary"
                            style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)', color: '#cbd5e1', padding: '0.65rem 1.25rem' }}
                          >
                            Cerrar Asistente
                          </button>
                          <button
                            onClick={() => { setShowPonteAlDiaModal(false); navigate('/reports'); }}
                            className="btn-primary"
                            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', padding: '0.65rem 1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                          >
                            <FileText size={18} /> Ir a Descargar Excel Maestro →
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Checklist Grid Layout (Left Panel: Exchanges List, Right Panel: Active Action Card) */
                      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                        
                        {/* Left Side: Checklist Progress Bar & Exchanges Items */}
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-color)', borderRadius: '0.85rem', padding: '1rem' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                            Pasos ({ponteAlDiaStep + 1} de {totalSteps})
                          </div>

                          <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {checklistExchanges.map((exName, idx) => {
                              const isCurrent = idx === ponteAlDiaStep;
                              const isCompleted = idx < ponteAlDiaStep || completedChecklistExchanges[exName];
                              const count = groupedExchanges[exName].length;

                              return (
                                <div
                                  key={exName}
                                  onClick={() => setPonteAlDiaStep(idx)}
                                  style={{
                                    padding: '0.65rem 0.85rem',
                                    borderRadius: '0.55rem',
                                    background: isCurrent ? 'rgba(56, 189, 248, 0.18)' : isCompleted ? 'rgba(34, 197, 94, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                                    border: isCurrent ? '1px solid #38bdf8' : isCompleted ? '1px solid #22c55e' : '1px solid transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {isCompleted ? (
                                      <CheckCircle2 size={16} color="#4ade80" />
                                    ) : (
                                      <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: isCurrent ? '#38bdf8' : '#475569', color: '#0f172a', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {idx + 1}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '0.85rem', fontWeight: isCurrent ? 'bold' : '600', color: isCurrent ? '#38bdf8' : '#f8fafc' }}>
                                      {exName}
                                    </span>
                                  </div>

                                  <span style={{ fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.4rem', borderRadius: '0.4rem', color: isCompleted ? '#86efac' : '#fef08a' }}>
                                    {isCompleted ? '✓ Al día' : `${count}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div>
                            <input
                              type="file"
                              id="ponteFileInput_consolidated"
                              multiple
                              hidden
                              onChange={(e) => handleInModalUpload(e.target.files)}
                            />
                            <button
                              onClick={() => {
                                const inputEl = document.getElementById('ponteFileInput_consolidated');
                                if (inputEl) inputEl.click();
                              }}
                              style={{
                                marginTop: '0.85rem',
                                width: '100%',
                                padding: '0.55rem',
                                borderRadius: '0.5rem',
                                background: 'rgba(168, 85, 247, 0.15)',
                                border: '1px solid rgba(168, 85, 247, 0.4)',
                                color: '#d8b4fe',
                                fontSize: '0.78rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem',
                                transition: 'all 0.2s'
                              }}
                            >
                              <UploadCloud size={14} /> 📄 Cargar Planilla Varios / Consolidada
                            </button>
                          </div>
                        </div>


                        {/* Right Side: Active Exchange Diagnosis & Autocomplete Actions */}
                        <div>
                          {(() => {
                            const apiExchangesList = ['binance', 'bitso', 'bitget', 'okx', 'bybit'];
                            const isApiEx = apiExchangesList.some(name => currentExName.toLowerCase().includes(name));

                            return (
                              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: isApiEx ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '0.85rem', padding: '1.25rem', marginBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: isApiEx ? '#38bdf8' : '#fbbf24', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {isApiEx ? '⚡ Exchange con Conexión API' : '📄 Exchange Sin API (Carga Manual / CSV)'}
                                  </h4>
                                  <span className="badge badge-amber" style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    {currentExItems.length} advertencia(s)
                                  </span>
                                </div>

                                <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.86rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                                  {isApiEx
                                    ? `${currentExName} cuenta con sincronización por API. El sistema puede recuperar automáticamente las compras y depósitos faltantes sin que subas archivos.`
                                    : `${currentExName} no dispone de API REST pública. Para resolver sus advertencias, podés subir el extracto CSV/Excel o declarar un saldo inicial.`}
                                </p>

                                {/* Dynamic Action Buttons based on API support */}
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                  {isApiEx && (
                                    <button
                                      disabled={syncingAllApis}
                                      onClick={() => handleApiSyncForExchange(currentExName)}
                                      className="btn-primary"
                                      style={{
                                        background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
                                        border: 'none',
                                        padding: '0.7rem 1rem',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        fontWeight: '600'
                                      }}
                                    >
                                      <RefreshCw size={16} className={syncingAllApis ? 'spin' : ''} />
                                      {syncingAllApis ? 'Sincronizando...' : `⚡ Auto-Sincronizar API de ${currentExName}`}
                                    </button>
                                  )}

                                  {/* In-Modal Interactive Dropzone for currentExName */}
                                  <div
                                    style={{
                                      border: '2px dashed #0284c7',
                                      borderRadius: '0.65rem',
                                      padding: '1rem',
                                      textAlign: 'center',
                                      background: 'rgba(2, 132, 199, 0.05)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                    onClick={() => {
                                      const inputEl = document.getElementById(`ponteFileInput_${currentExName}`);
                                      if (inputEl) inputEl.click();
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                        handleInModalUpload(e.dataTransfer.files);
                                      }
                                    }}
                                  >
                                    <input
                                      type="file"
                                      id={`ponteFileInput_${currentExName}`}
                                      multiple
                                      hidden
                                      onChange={(e) => handleInModalUpload(e.target.files)}
                                    />
                                    <UploadCloud size={30} color="#38bdf8" style={{ marginBottom: '0.3rem' }} />
                                    <div style={{ fontSize: '0.86rem', color: '#f8fafc', fontWeight: 'bold' }}>
                                      📄 Arrastrá o hacé clic para cargar Extracto CSV / Excel de {currentExName}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                      Se importará directamente sin cerrar esta ventana.
                                    </div>
                                  </div>

                                  {inModalUploading && (
                                    <div style={{ textAlign: 'center', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                      ⏳ Procesando e importando transacciones al sistema...
                                    </div>
                                  )}

                                  {inModalUploadMsg && (
                                    <div style={{ fontSize: '0.85rem', color: inModalUploadMsg.type === 'success' ? '#4ade80' : '#fca5a5', textAlign: 'center', fontWeight: 'bold', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '0.4rem' }}>
                                      {inModalUploadMsg.text}
                                    </div>
                                  )}

                                  {currentExItems[0] && (
                                    <button
                                      onClick={() => {
                                        setShowPonteAlDiaModal(false);
                                        openResolverModal(currentExItems[0]);
                                      }}
                                      className="btn-primary"
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                        color: '#fbbf24',
                                        padding: '0.65rem 1rem',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        fontWeight: '600'
                                      }}
                                    >
                                      <Wand2 size={16} /> ✏️ Ajuste Manual / Saldo Inicial para {currentExName}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Navigation Buttons */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                              type="button"
                              disabled={ponteAlDiaStep === 0}
                              onClick={() => setPonteAlDiaStep((prev) => Math.max(0, prev - 1))}
                              className="btn-primary"
                              style={{ background: '#334155', fontSize: '0.82rem', opacity: ponteAlDiaStep === 0 ? 0.5 : 1 }}
                            >
                              Anterior Exchange
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setCompletedChecklistExchanges((prev) => ({ ...prev, [currentExName]: true }));
                                setPonteAlDiaStep((prev) => prev + 1);
                              }}
                              className="btn-primary"
                              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                              Marcar {currentExName} al Día <CheckCircle2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sleek Floating Glassmorphism Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: 'fixed',
              top: '1.5rem',
              right: '1.5rem',
              zIndex: 9999,
              background: toast.type === 'success' 
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(22, 101, 52, 0.98))'
                : toast.type === 'error'
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(153, 27, 27, 0.98))'
                : toast.type === 'warning'
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(180, 83, 9, 0.98))'
                : 'linear-gradient(135deg, rgba(56, 189, 248, 0.95), rgba(30, 58, 138, 0.98))',
              color: '#ffffff',
              padding: '0.85rem 1.35rem',
              borderRadius: '0.85rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontSize: '0.9rem',
              fontWeight: 600,
              backdropFilter: 'blur(10px)'
            }}
          >
            {toast.type === 'success' && <CheckCircle2 size={20} />}
            {toast.type === 'error' && <AlertTriangle size={20} />}
            {toast.type === 'warning' && <AlertTriangle size={20} />}
            {toast.type === 'info' && <Sparkles size={20} />}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast({ show: false, message: '', type: 'info' })}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8, marginLeft: '0.5rem' }}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Calendar;
