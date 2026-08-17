import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon, ShieldCheck, AlertTriangle, FileText,
  Plus, Trash2, Download, RefreshCw, CheckCircle2, Clock, UploadCloud, X,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Sparkles, Wand2, Info, ArrowRight, HelpCircle, Check, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import config from '../config';

const API_BASE = `${config.API_URL}/api`;

const Calendar = () => {
  const location = useLocation();
  const navigate = useNavigate();
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

  // Toast Notification State
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
      await axios.post(`${API_BASE}/sync`);
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
        errMsg = 'Error de conexión con el servidor backend.';
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

  // Selected Timeline Year State
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
    let suggestedStart = '';
    let suggestedMsg = '';
    try {
      const res = await fetch(`${API_BASE}/certifications/next_start`);
      const data = await res.json();
      if (data.next_start_date) {
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
        setCertData((prev) => ({
          ...prev,
          certifications: (prev.certifications || []).filter((c) => c.id !== deleteConfirm.id)
        }));
        setDeleteConfirm({ show: false, id: null, title: '', deleting: false });
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

  const parseCleanDate = (dateStr, isEnd = false) => {
    if (!dateStr) return null;
    let str = String(dateStr).trim();
    if (str.includes(' ')) str = str.split(' ')[0];
    if (str.includes('T')) str = str.split('T')[0];

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

  const currentYr = new Date().getFullYear();
  const baseYearRange = Array.from({ length: 15 }, (_, i) => currentYr - 10 + i);
  const certYears = certificationsList.flatMap((c) => {
    if (!c) return [];
    const sObj = parseCleanDate(c.start_date);
    const eObj = parseCleanDate(c.end_date, true);
    const s = sObj ? sObj.getFullYear() : null;
    const e = eObj ? eObj.getFullYear() : null;
    return [s, e];
  }).filter((y) => y && !isNaN(y));

  const availableYears = Array.from(new Set([...baseYearRange, ...certYears])).sort((a, b) => a - b);

  const CERT_COLORS = [
    { border: '#4F46E5', bg: 'rgba(79, 70, 229, 0.18)', text: '#818CF8', lightBg: 'rgba(79, 70, 229, 0.08)' },
    { border: '#10B981', bg: 'rgba(16, 185, 129, 0.18)', text: '#34D399', lightBg: 'rgba(16, 185, 129, 0.08)' },
    { border: '#06B6D4', bg: 'rgba(6, 182, 212, 0.18)', text: '#38BDF8', lightBg: 'rgba(6, 182, 212, 0.08)' },
    { border: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.18)', text: '#C084FC', lightBg: 'rgba(139, 92, 246, 0.08)' },
    { border: '#F59E0B', bg: 'rgba(245, 158, 11, 0.18)', text: '#FBBF24', lightBg: 'rgba(245, 158, 11, 0.08)' }
  ];

  const getCertColor = (cert) => {
    if (!cert) return CERT_COLORS[0];
    const idx = certificationsList.findIndex((c) => c === cert || (c && cert && c.id === cert.id));
    const safeIdx = idx >= 0 ? idx : 0;
    return CERT_COLORS[safeIdx % CERT_COLORS.length] || CERT_COLORS[0];
  };

  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
    return targetStr;
  };

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

  const getMonthCoverageStatus = (monthIndex) => {
    const monthCerts = getCertsForMonth(monthIndex);
    const startOfMonth = new Date(selectedYear, monthIndex, 1);
    const today = new Date();

    if (monthCerts.length > 0) return 'certified';
    if (startOfMonth > today) return 'future';
    return 'pending';
  };

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

        return { cert, startMonth, endMonth, colorScheme, cStart, cEnd };
      })
      .filter(Boolean);

    rawList.sort((a, b) => a.cStart - b.cStart);

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
    <div style={{ padding: '1.75rem 2rem', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'var(--brand-indigo-subtle)',
              border: '1px solid var(--brand-indigo-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-indigo-light)'
            }}>
              <CalendarIcon size={20} />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F8FAFC', margin: 0, letterSpacing: '-0.02em' }}>
              Calendario de Operaciones & Auditoría FIFO
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: '0.35rem 0 0 0', fontSize: '0.88rem', paddingLeft: '2.85rem' }}>
            Línea temporal de períodos certificados, dictámenes C.P.N., consistencia FIFO y auditoría diaria.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            onClick={openPonteAlDiaModal}
            className="btn-primary"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontWeight: 700,
              color: '#fff',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
            }}
          >
            <Sparkles size={16} />
            Ponete al Día
            {(gaps.length + anomalies.length) > 0 && (
              <span style={{ background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem' }}>
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
                showToast("Sincronización de cobertura legal realizada con éxito.", "success");
              } catch (err) {
                console.error(err);
              }
            }}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            title="Vincular transacciones con calendario certificado"
          >
            <ShieldCheck size={16} color="#34D399" />
            Sincronizar Cobertura
          </button>

          <button
            onClick={() => { fetchCertifications(); fetchWarningsAndGaps(); }}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            title="Actualizar datos"
          >
            <RefreshCw size={16} className={(loading || loadingWarnings) ? 'spin' : ''} />
            Refrescar
          </button>

          {activeTab === 'certifications' && (
            <button
              onClick={openNewCertificationModal}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Plus size={16} />
              Nueva Certificación
            </button>
          )}
        </div>
      </div>

      {/* Tabs Selector Bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        background: '#0D131F',
        padding: '0.3rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        width: 'fit-content'
      }}>
        <button
          onClick={() => setActiveTab('certifications')}
          style={{
            background: activeTab === 'certifications' ? 'var(--brand-indigo)' : 'transparent',
            border: 'none',
            color: activeTab === 'certifications' ? '#FFFFFF' : 'var(--text-secondary)',
            padding: '0.5rem 1.1rem',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            transition: 'all 150ms ease'
          }}
        >
          <ShieldCheck size={16} />
          Dictámenes & Certificaciones Contables ({certData.certifications.length})
        </button>

        <button
          onClick={() => setActiveTab('warnings')}
          style={{
            background: activeTab === 'warnings' ? 'var(--brand-indigo)' : 'transparent',
            border: 'none',
            color: activeTab === 'warnings' ? '#FFFFFF' : 'var(--text-secondary)',
            padding: '0.5rem 1.1rem',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            transition: 'all 150ms ease'
          }}
        >
          <AlertTriangle size={16} color={activeTab === 'warnings' ? '#FEF08A' : 'var(--accent-amber-light)'} />
          Operaciones & Inconsistencias
          {(gaps.length + anomalies.length) > 0 && (
            <span style={{
              background: '#EF4444',
              color: '#fff',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.1rem 0.45rem',
              borderRadius: '999px',
              marginLeft: '0.2rem'
            }}>
              {gaps.length + anomalies.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'warnings' ? (
        <div>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card-surface" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Estado de Consistencia
                </span>
                {(gaps.length + anomalies.length) === 0 ? (
                  <span className="badge badge-emerald">
                    <CheckCircle2 size={12} /> Historial Consistente
                  </span>
                ) : (
                  <span className="badge badge-amber">
                    <AlertTriangle size={12} /> Advertencias Activas
                  </span>
                )}
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 700, color: (gaps.length + anomalies.length) === 0 ? '#34D399' : '#FBBF24' }} className="font-mono">
                {(gaps.length + anomalies.length) === 0 ? 'Sin Advertencias' : `${gaps.length + anomalies.length} Faltante(s)`}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {(gaps.length + anomalies.length) === 0
                  ? 'Todas las ventas tienen comprobantes de compra previos.'
                  : 'Faltan compras o adquisiciones para cubrir salidas FIFO.'}
              </div>
            </div>

            <div className="card-surface" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Exchanges con Huecos
                </span>
                <Sparkles size={18} color="var(--brand-indigo-light)" />
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F8FAFC' }}>
                {Array.from(new Set([...gaps.map(g => g.exchange), ...anomalies.map(a => a.exchange)])).join(', ') || 'Ninguno'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Revisá y completá la información exchange por exchange.
              </div>
            </div>

            <div className="card-surface" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Resolución Guiada
                </span>
                <Wand2 size={18} color="var(--accent-cyan)" />
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--brand-indigo-light)' }}>
                Asistente Automático
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Ingresá saldos iniciales o subí archivos sin modificar los originales.
              </div>
            </div>
          </div>

          {/* Dynamic Timeline Bar for Warnings & Coverage */}
          <div className="card-surface" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <Clock size={18} color="var(--brand-indigo-light)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                  Línea de Tiempo de Consistencia & Auditoría ({selectedYear})
                </h3>

                {/* Year Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#0D131F', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => setSelectedYear((prev) => prev - 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Año anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--brand-indigo-light)', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}
                    className="font-mono"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr} style={{ background: '#0D131F', color: 'white' }}>
                        {yr}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSelectedYear((prev) => prev + 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Año siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10B981' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>Auditado C.P.N.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#F59E0B' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>Advertencia / Hueco</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#4F46E5' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>Provisorio al Día</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.45rem' }}>
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

                let bg = 'rgba(79, 70, 229, 0.08)';
                let border = '1px solid rgba(79, 70, 229, 0.25)';
                let titleColor = '#818CF8';
                let labelText = 'Al Día';

                if (isFuture) {
                  bg = 'rgba(15, 23, 42, 0.4)';
                  border = '1px solid var(--border-subtle)';
                  titleColor = 'var(--text-muted)';
                  labelText = '-';
                } else if (isCertified) {
                  bg = 'rgba(16, 185, 129, 0.15)';
                  border = '1px solid #10B981';
                  titleColor = '#34D399';
                  labelText = '✓ Auditado';
                } else if (hasGaps) {
                  bg = 'rgba(245, 158, 11, 0.18)';
                  border = '1px solid #F59E0B';
                  titleColor = '#FBBF24';
                  labelText = '⚠️ Hueco';
                }

                return (
                  <div
                    key={monthName}
                    style={{
                      background: bg,
                      border: border,
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.65rem 0.35rem',
                      textAlign: 'center',
                      cursor: (!isFuture) ? 'pointer' : 'default',
                      transition: 'all 150ms ease',
                      opacity: isFuture ? 0.45 : 1
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
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: titleColor }}>{monthName}</div>
                    <div style={{ fontSize: '0.68rem', marginTop: '0.2rem', color: titleColor }}>
                      {labelText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grouped Warnings List by Exchange */}
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
              <div className="card-surface" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} color="#F59E0B" />
                    Inconsistencias y Huecos FIFO por Exchange ({allWarningsList.length})
                  </h3>
                </div>

                {allWarningsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <CheckCircle2 size={42} color="#34D399" style={{ margin: '0 auto 0.75rem', opacity: 0.9 }} />
                    <h4 style={{ fontSize: '1.1rem', color: '#F8FAFC', margin: '0 0 0.25rem' }}>¡Historial 100% Consistente!</h4>
                    <p style={{ fontSize: '0.85rem', margin: 0 }}>Todas tus transacciones cuentan con compras previas registradas y respaldo formal.</p>
                  </div>
                ) : (
                  <div>
                    {/* Minimalist Filter Chips Header */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                      <button
                        onClick={() => setSelectedExchangeFilter('ALL')}
                        className={`chip ${selectedExchangeFilter === 'ALL' ? 'active' : ''}`}
                      >
                        Todos ({allWarningsList.length})
                      </button>

                      {exchangeNames.map((exName) => {
                        const count = groupedExchanges[exName].length;
                        const isActive = selectedExchangeFilter === exName;
                        return (
                          <button
                            key={exName}
                            onClick={() => setSelectedExchangeFilter(exName)}
                            className={`chip ${isActive ? 'active-amber' : ''}`}
                          >
                            {exName} ({count})
                          </button>
                        );
                      })}
                    </div>

                    {/* Grouped Accordions by Exchange */}
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {filteredNames.map((exName) => {
                        const items = groupedExchanges[exName] || [];
                        const isExpanded = expandedExchanges[exName] !== false;
                        const limit = exchangeLimits[exName] || 10;
                        const visibleItems = items.slice(0, limit);

                        return (
                          <div key={exName} style={{ background: '#0D131F', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                            {/* Header */}
                            <div
                              style={{
                                padding: '0.85rem 1.15rem',
                                background: 'var(--bg-elevated)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                              }}
                              onClick={() => toggleExchangeExpand(exName)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <span className="badge badge-amber" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                  {exName}
                                </span>
                                <span style={{ fontSize: '0.88rem', color: '#F8FAFC', fontWeight: 600 }}>
                                  {items.length} Inconsistencia(s)
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <button
                                  className="btn-primary"
                                  style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', border: 'none', padding: '0.35rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#fff', fontWeight: 600 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (items[0]) openResolverModal(items[0]);
                                  }}
                                >
                                  <Wand2 size={13} />
                                  Resolver {exName} →
                                </button>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </span>
                              </div>
                            </div>

                            {/* Items List */}
                            {isExpanded && (
                              <div style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                                {visibleItems.map((item, idx) => (
                                  <div
                                    key={`${exName}-${idx}`}
                                    style={{
                                      background: 'rgba(15, 23, 42, 0.75)',
                                      border: '1px solid var(--border-subtle)',
                                      borderRadius: 'var(--radius-sm)',
                                      padding: '0.75rem 1rem',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: '0.75rem'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                      <div style={{ background: 'var(--accent-amber-subtle)', padding: '0.45rem', borderRadius: 'var(--radius-sm)', color: 'var(--accent-amber-light)', flexShrink: 0 }}>
                                        <AlertTriangle size={18} />
                                      </div>
                                      <div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }} className="font-mono">
                                          {item.date ? item.date.split(' ')[0] : ''}
                                        </div>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#F8FAFC' }}>
                                          {item.isGap
                                            ? `Venta de ${item.sold_qty} ${item.coin} (Faltan ${item.deficit ? item.deficit.toFixed(4) : 0} ${item.coin} de compra previa)`
                                            : (item.message || `Falta adquisición de ${item.missing} ${item.crypto}`)}
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      className="chip active-amber"
                                      onClick={() => openResolverModal(item)}
                                    >
                                      Resolver →
                                    </button>
                                  </div>
                                ))}

                                {items.length > visibleItems.length && (
                                  <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
                                    <button
                                      onClick={() => loadMoreForExchange(exName)}
                                      className="btn-secondary"
                                      style={{ fontSize: '0.78rem', padding: '0.4rem 1rem' }}
                                    >
                                      Mostrar más ({items.length - visibleItems.length} restantes)...
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
        /* Certifications Tab */
        <>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card-surface" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Estado Auditado
                </span>
                {certData.summary.status === 'up_to_date' ? (
                  <span className="badge badge-emerald">
                    <CheckCircle2 size={12} /> Certificado al Día
                  </span>
                ) : (
                  <span className="badge badge-amber">
                    <AlertTriangle size={12} /> Certificación Pendiente
                  </span>
                )}
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 700, color: certData.summary.status === 'up_to_date' ? '#34D399' : '#FBBF24' }}>
                {certData.summary.status === 'up_to_date' ? 'Período Cubierto' : 'Certificación Pendiente'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {certData.summary.status === 'up_to_date'
                  ? 'Tus movimientos están respaldados formalmente.'
                  : 'Se requiere subir dictamen contable para actualizar cobertura.'}
              </div>
            </div>

            <div className="card-surface" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Último Período Certificado
                </span>
                <ShieldCheck size={18} color="var(--brand-indigo-light)" />
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }} className="font-mono">
                {certData.summary.latest_end_date ? (
                  <span>Hasta {formatDateTime(certData.summary.latest_end_date)}</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Sin registros</span>
                )}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {certData.summary.total_count > 0 ? `${certData.summary.total_count} certificación(es) registrada(s)` : 'No se han cargado certificados aún'}
              </div>
            </div>

            <div className="card-surface" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Período Sin Certificar
                </span>
                <Clock size={18} color={certData.summary.uncertified_days ? '#FBBF24' : '#34D399'} />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 700, color: certData.summary.uncertified_days ? '#FBBF24' : '#34D399' }} className="font-mono">
                {certData.summary.uncertified_days !== null ? `${certData.summary.uncertified_days} Días` : 'Pendiente'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {certData.summary.uncertified_days > 0
                  ? `Transcurridos desde el vencimiento anterior`
                  : 'Cobertura garantizada hasta la fecha'}
              </div>
            </div>
          </div>

          {/* Timeline Bar with Certification Brackets */}
          <div className="card-surface" style={{ padding: '1.5rem', marginBottom: '1.5rem', position: 'relative', zIndex: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <CalendarIcon size={18} color="var(--brand-indigo-light)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                  Línea de Tiempo de Cobertura Legal ({selectedYear})
                </h3>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#0D131F', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => setSelectedYear((prev) => prev - 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Año anterior"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--brand-indigo-light)', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}
                    className="font-mono"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr} style={{ background: '#0D131F', color: 'white' }}>
                        {yr}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSelectedYear((prev) => prev + 1)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Año siguiente"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10B981' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>Certificado C.P.N.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#F59E0B' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>Pendiente</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)' }}></div>
                  <span style={{ color: 'var(--text-secondary)' }}>Futuro</span>
                </div>
              </div>
            </div>

            {/* Certification Brackets */}
            {activeBrackets.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.35rem 0.5rem', marginBottom: '0.75rem' }}>
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
                        border: `1px solid ${b.colorScheme.border}`,
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.3rem 0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.35rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: b.colorScheme.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={`Dictamen: ${b.cert.title} | Cobertura: ${formatDateTime(b.cert.start_date)} - ${formatDateTime(b.cert.end_date)}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
                        <ShieldCheck size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {spanCols <= 1 ? shortTitle : b.cert.title}
                        </span>
                      </div>
                      {b.cert.cpa_name && spanCols > 1 && (
                        <span style={{ fontSize: '0.68rem', opacity: 0.85, flexShrink: 0 }}>
                          {b.cert.cpa_name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Months Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '0.45rem', position: 'relative', zIndex: 25 }}>
              {months.map((monthName, idx) => {
                const monthCerts = getCertsForMonth(idx);
                const status = getMonthCoverageStatus(idx);

                let bgColor = 'rgba(255, 255, 255, 0.03)';
                let borderColor = 'var(--border-subtle)';
                let textColor = 'var(--text-muted)';

                if (status === 'certified') {
                  bgColor = 'rgba(16, 185, 129, 0.12)';
                  borderColor = 'rgba(16, 185, 129, 0.35)';
                  textColor = '#34D399';
                } else if (status === 'pending') {
                  bgColor = 'rgba(245, 158, 11, 0.12)';
                  borderColor = 'rgba(245, 158, 11, 0.35)';
                  textColor = '#FBBF24';
                }

                return (
                  <div
                    key={monthName}
                    style={{
                      background: bgColor,
                      border: borderColor,
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.65rem 0.35rem',
                      textAlign: 'center',
                      transition: 'all 150ms ease',
                      cursor: 'pointer',
                      position: 'relative'
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
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: textColor }}>{monthName}</div>
                    <div style={{ fontSize: '0.68rem', marginTop: '0.2rem', color: textColor }}>
                      {status === 'certified' ? '✓ Auditado' : status === 'pending' ? '⚠️ Sin cert.' : '-'}
                    </div>

                    {/* Hover Popover */}
                    <AnimatePresence>
                      {hoveredMonth === idx && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.96 }}
                          style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 8px)',
                            left: idx > 8 ? 'auto' : idx < 3 ? '0' : '50%',
                            right: idx > 8 ? '0' : 'auto',
                            transform: idx > 8 || idx < 3 ? 'none' : 'translateX(-50%)',
                            zIndex: 9999,
                            width: '280px',
                            background: '#0D131F',
                            border: '1px solid var(--brand-indigo-border)',
                            boxShadow: 'var(--shadow-lg)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.85rem',
                            textAlign: 'left',
                            pointerEvents: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand-indigo-light)' }}>
                              📅 {monthName.toUpperCase()} {selectedYear}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {monthCerts.length} Cert.
                            </span>
                          </div>

                          {monthCerts.length === 0 ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {status === 'pending' ? '⚠️ Período sin certificar.' : 'Período futuro.'}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {monthCerts.map((c, cIdx) => (
                                <div
                                  key={c.id || cIdx}
                                  style={{
                                    background: 'var(--bg-elevated)',
                                    borderLeft: '3px solid var(--accent-emerald)',
                                    padding: '0.4rem 0.55rem',
                                    borderRadius: 'var(--radius-sm)'
                                  }}
                                >
                                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#34D399' }}>
                                    {c.title}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }} className="font-mono">
                                    {formatDateTime(c.start_date)} ➔ {formatDateTime(c.end_date)}
                                  </div>
                                </div>
                              ))}
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

          {/* Certifications Dense Table */}
          <div className="sticky-table-container">
            <table className="table-ledger">
              <thead>
                <tr>
                  <th>Título / Objeto del Dictamen</th>
                  <th>Período Cubierto</th>
                  <th>Contador / Matrícula</th>
                  <th>Fecha Emisión</th>
                  <th>Documento PDF</th>
                  <th style={{ textAlign: 'right', width: '90px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {certData.certifications.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <UploadCloud size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.6, color: 'var(--brand-indigo-light)' }} />
                      <h4 style={{ fontSize: '1.1rem', color: '#F8FAFC', margin: '0 0 0.25rem' }}>No hay certificaciones contables registradas</h4>
                      <p style={{ fontSize: '0.85rem', margin: '0 0 1.25rem' }}>Subí tus dictámenes contables en PDF para auditar tus transacciones.</p>
                      <button onClick={openNewCertificationModal} className="btn-primary">
                        + Registrar Primer Certificado
                      </button>
                    </td>
                  </tr>
                ) : (
                  certData.certifications.map((cert) => (
                    <tr key={cert.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {cert.title}
                        {cert.notes && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '0.15rem' }}>
                            {cert.notes}
                          </div>
                        )}
                      </td>
                      <td className="font-mono">
                        <span className="badge badge-indigo" style={{ fontSize: '0.72rem' }}>
                          {formatDateTime(cert.start_date)} al {formatDateTime(cert.end_date)}
                        </span>
                      </td>
                      <td>{cert.cpa_name || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td className="font-mono">{formatDateTime(cert.issue_date, cert.created_at) || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td>
                        {cert.file_path ? (
                          <a
                            href={`${API_BASE}/certifications/download/${cert.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--brand-indigo-light)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem' }}
                          >
                            <Download size={13} /> Descargar PDF
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Sin archivo</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => openDeleteConfirm(cert.id, cert.title)}
                          style={{
                            background: 'var(--accent-rose-subtle)',
                            border: '1px solid var(--accent-rose-border)',
                            color: 'var(--accent-rose-light)',
                            padding: '0.35rem 0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            transition: 'all 150ms ease'
                          }}
                          title="Eliminar certificación"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Nueva Certificación con Auto-Detección y Carga Masiva */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(9, 13, 20, 0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
              className="card-surface"
              style={{
                width: '100%',
                maxWidth: fileQueue.length > 1 ? '820px' : '620px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '2rem',
                border: '1px solid var(--border-strong)',
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={22} color="var(--brand-indigo-light)" />
                    Registrar Certificaciones Contables
                  </h3>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Podés seleccionar uno o varios archivos PDF para procesar por lote.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {errorMessage && (
                <div style={{ background: 'var(--accent-rose-subtle)', border: '1px solid var(--accent-rose-border)', color: 'var(--accent-rose-light)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.82rem' }}>
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div style={{ background: 'var(--accent-emerald-subtle)', border: '1px solid var(--accent-emerald-border)', color: 'var(--accent-emerald-light)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.82rem' }}>
                  {successMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
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
                  className="upload-zone-refined"
                  style={{
                    borderColor: isDragging ? 'var(--brand-indigo)' : 'var(--border-strong)',
                    padding: fileQueue.length > 0 ? '1rem' : '1.75rem 1rem'
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--brand-indigo-light)' }}>
                    <UploadCloud size={22} />
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#F8FAFC' }}>
                      {fileQueue.length > 0 ? '+ Seleccionar o arrastrar más archivos' : 'Hacé clic o arrastrá uno o múltiples archivos PDF aquí'}
                    </span>
                  </div>
                  {fileQueue.length === 0 && (
                    <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Soporta PDFs individuales o en lote. Se autodetectarán los períodos de cada archivo.
                    </p>
                  )}
                </div>

                {fileQueue.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '380px', overflowY: 'auto' }}>
                    {fileQueue.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          background: '#0D131F',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          padding: '1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.65rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
                            <FileText size={16} color="var(--brand-indigo-light)" style={{ flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
                              {item.filename}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {item.parsing ? (
                              <span className="badge badge-indigo" style={{ fontSize: '0.72rem' }}>
                                <RefreshCw size={11} className="spin" /> Analizando PDF...
                              </span>
                            ) : item.parsedSuccess ? (
                              <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                                <Sparkles size={11} /> Autocompletado
                              </span>
                            ) : (
                              <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                                Verificar fechas
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveQueueItem(item.id)}
                              style={{ background: 'var(--accent-rose-subtle)', border: '1px solid var(--accent-rose-border)', color: 'var(--accent-rose-light)', padding: '0.25rem 0.45rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                              title="Quitar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.65rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                              Título / Descripción
                            </label>
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => handleQueueItemChange(item.id, 'title', e.target.value)}
                              className="input-field"
                              style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                Fecha Inicio (Desde) *
                              </label>
                              <input
                                type="date"
                                value={item.start_date}
                                onChange={(e) => handleQueueItemChange(item.id, 'start_date', e.target.value)}
                                className="input-field"
                                style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                                required
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                                Fecha Fin (Hasta) *
                              </label>
                              <input
                                type="date"
                                value={item.end_date}
                                onChange={(e) => handleQueueItemChange(item.id, 'end_date', e.target.value)}
                                className="input-field"
                                style={{ padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                                required
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Título / Descripción
                      </label>
                      <input
                        type="text"
                        name="title"
                        value={formData.title}
                        onChange={handleInputChange}
                        placeholder="Ej: Certificación Contable Anual 2024"
                        className="input-field"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                          Fecha Inicio (Desde) *
                        </label>
                        <input
                          type="date"
                          name="start_date"
                          value={formData.start_date}
                          onChange={handleInputChange}
                          className="input-field"
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                          Fecha Fin (Hasta) *
                        </label>
                        <input
                          type="date"
                          name="end_date"
                          value={formData.end_date}
                          onChange={handleInputChange}
                          className="input-field"
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                          Fecha de Emisión
                        </label>
                        <input
                          type="date"
                          name="issue_date"
                          value={formData.issue_date}
                          onChange={handleInputChange}
                          className="input-field"
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                          Contador Emisor / Matrícula
                        </label>
                        <input
                          type="text"
                          name="cpa_name"
                          value={formData.cpa_name}
                          onChange={handleInputChange}
                          placeholder="Ej: CPN Carlos Gómez (Mat. 1234)"
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        Observaciones / Notas
                      </label>
                      <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleInputChange}
                        rows="2"
                        placeholder="Notas aclaratorias del dictamen..."
                        className="input-field"
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-outline"
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(9, 13, 20, 0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 3000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
              className="card-surface"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '1.75rem',
                border: '1px solid var(--accent-rose-border)',
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1.25rem' }}>
                <div style={{
                  background: 'var(--accent-rose-subtle)',
                  border: '1px solid var(--accent-rose-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem',
                  color: 'var(--accent-rose-light)',
                  flexShrink: 0
                }}>
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#F8FAFC' }}>
                    ¿Eliminar certificación?
                  </h3>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    ¿Confirmás la eliminación de <strong style={{ color: '#F8FAFC' }}>"{deleteConfirm.title}"</strong>?
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  disabled={deleteConfirm.deleting}
                  onClick={() => setDeleteConfirm({ show: false, id: null, title: '', deleting: false })}
                  className="btn-outline"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteConfirm.deleting}
                  onClick={handleDeleteConfirm}
                  style={{
                    background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '0.55rem 1.15rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: deleteConfirm.deleting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  {deleteConfirm.deleting ? (
                    <>
                      <RefreshCw size={14} className="spin" /> Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} /> Sí, Eliminar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Guided Resolution Modal */}
      <AnimatePresence>
        {showResolverModal && selectedWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(9, 13, 20, 0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 2500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
              className="card-surface"
              style={{
                width: '100%',
                maxWidth: '560px',
                padding: '1.75rem',
                border: '1px solid var(--accent-amber-border)',
                boxShadow: 'var(--shadow-lg)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#FBBF24' }}>
                  <Wand2 size={20} /> Resolutor Guiado de Advertencias
                </h3>
                <button
                  onClick={() => setShowResolverModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Steps Progress */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', background: '#0D131F', padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: resolverStep === 1 ? 'var(--brand-indigo-light)' : '#34D399', fontWeight: 600, fontSize: '0.78rem' }}>
                  <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: resolverStep === 1 ? 'var(--brand-indigo)' : '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>1</span>
                  Diagnóstico
                </div>
                <ChevronRight size={13} color="var(--text-muted)" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: resolverStep === 2 ? 'var(--brand-indigo-light)' : resolverStep === 3 ? '#34D399' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>
                  <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: resolverStep === 2 ? 'var(--brand-indigo)' : resolverStep === 3 ? '#10B981' : '#334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>2</span>
                  Datos
                </div>
                <ChevronRight size={13} color="var(--text-muted)" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: resolverStep === 3 ? '#34D399' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>
                  <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: resolverStep === 3 ? '#10B981' : '#334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>3</span>
                  Confirmar
                </div>
              </div>

              {resolverError && (
                <div style={{ background: 'var(--accent-rose-subtle)', border: '1px solid var(--accent-rose-border)', borderRadius: 'var(--radius-sm)', padding: '0.65rem', marginBottom: '1rem', color: 'var(--accent-rose-light)', fontSize: '0.82rem' }}>
                  {resolverError}
                </div>
              )}

              {resolverSuccess && (
                <div style={{ background: 'var(--accent-emerald-subtle)', border: '1px solid var(--accent-emerald-border)', borderRadius: 'var(--radius-sm)', padding: '0.65rem', marginBottom: '1rem', color: 'var(--accent-emerald-light)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CheckCircle2 size={16} /> {resolverSuccess}
                </div>
              )}

              <form onSubmit={handleResolverSubmit}>
                {resolverStep === 1 && (
                  <div>
                    <div style={{ background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber-border)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1.15rem' }}>
                      <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.88rem', color: '#FEF08A' }}>Detalle de la Operación Afectada</h4>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#CBD5E1', lineHeight: '1.4' }}>
                        <strong>Exchange:</strong> {resolverData.exchange}<br />
                        <strong>Fecha de la Venta:</strong> {resolverData.date}<br />
                        <strong>Cripto & Monto Faltante:</strong> {resolverData.missing} {resolverData.crypto}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
                      {/* Vía 1: In-situ dropzone */}
                      <div style={{ background: '#0D131F', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
                          <UploadCloud size={18} color="var(--brand-indigo-light)" />
                          <strong style={{ fontSize: '0.85rem', color: '#F8FAFC' }}>
                            Vía 1: Cargar Excel / CSV de {resolverData.exchange}
                          </strong>
                        </div>
                        <div
                          className="upload-zone-refined"
                          style={{ padding: '0.85rem' }}
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
                          <div style={{ fontSize: '0.82rem', color: '#F8FAFC', fontWeight: 600 }}>
                            Arrastrá o hacé clic para subir tu planilla
                          </div>
                        </div>
                        {inModalUploading && (
                          <div style={{ marginTop: '0.5rem', textAlign: 'center', color: 'var(--brand-indigo-light)', fontSize: '0.8rem' }}>
                            ⏳ Procesando transacciones...
                          </div>
                        )}
                        {inModalUploadMsg && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: inModalUploadMsg.type === 'success' ? '#34D399' : '#FB7185', textAlign: 'center' }}>
                            {inModalUploadMsg.text}
                          </div>
                        )}
                      </div>

                      {/* Vía 2 */}
                      <div style={{ background: '#0D131F', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                        <Wand2 size={18} color="var(--accent-amber-light)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong style={{ fontSize: '0.85rem', color: '#F8FAFC', display: 'block' }}>Vía 2: Declarar Saldo Inicial / Ajuste Manual</strong>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem', display: 'block' }}>
                            Compras P2P informales, saldo de años anteriores o aportes de capital.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem' }}>
                      <button type="button" onClick={() => setShowResolverModal(false)} className="btn-outline">Cerrar</button>
                      <button type="button" onClick={() => setResolverStep(2)} className="btn-primary">
                        Ajuste Manual <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {resolverStep === 2 && (
                  <div>
                    <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1.25rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                          Origen / Tipo de Adquisición
                        </label>
                        <select
                          value={resolverData.origin_type}
                          onChange={(e) => setResolverData(prev => ({ ...prev, origin_type: e.target.value }))}
                          className="input-field"
                        >
                          <option value="Capital Inicial / Años Anteriores">Capital Inicial / Años Anteriores</option>
                          <option value="Compra P2P Binance / Sin Respaldo">Compra P2P Binance / Sin Respaldo</option>
                          <option value="Ingreso por Transferencia">Ingreso por Transferencia de Wallet</option>
                          <option value="Recompensa / Staking / Airdrop">Recompensa / Staking / Airdrop</option>
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                            Fecha de Adquisición
                          </label>
                          <input
                            type="date"
                            value={resolverData.date ? resolverData.date.split(' ')[0] : ''}
                            onChange={(e) => setResolverData(prev => ({ ...prev, date: e.target.value }))}
                            className="input-field"
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>
                            Cantidad ({resolverData.crypto})
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={resolverData.missing}
                            onChange={(e) => setResolverData(prev => ({ ...prev, missing: parseFloat(e.target.value) || 0 }))}
                            className="input-field"
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem' }}>
                      <button type="button" onClick={() => setResolverStep(1)} className="btn-outline">Atrás</button>
                      <button type="button" onClick={() => setResolverStep(3)} className="btn-primary">
                        Revisar <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {resolverStep === 3 && (
                  <div>
                    <div style={{ background: 'var(--brand-indigo-subtle)', border: '1px solid var(--brand-indigo-border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem' }}>
                      <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.9rem', color: 'var(--brand-indigo-light)' }}>Resumen del Ajuste</h4>
                      <div style={{ fontSize: '0.82rem', color: '#CBD5E1', lineHeight: '1.5' }}>
                        <strong>Tipo:</strong> Compra / Ingreso de Ajuste FIFO<br />
                        <strong>Origen:</strong> {resolverData.origin_type}<br />
                        <strong>Criptomonedas:</strong> {resolverData.missing} {resolverData.crypto}<br />
                        <strong>Fecha de Registro:</strong> {resolverData.date}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem' }}>
                      <button type="button" onClick={() => setResolverStep(2)} className="btn-outline" disabled={resolverSubmitting}>Atrás</button>
                      <button
                        type="submit"
                        className="btn-primary"
                        style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                        disabled={resolverSubmitting}
                      >
                        {resolverSubmitting ? (
                          <>
                            <RefreshCw size={14} className="spin" /> Guardando...
                          </>
                        ) : (
                          <>
                            <Check size={14} /> Confirmar y Guardar Ajuste
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

      {/* Modal Ponete al Día - Checklist Interactivo */}
      <AnimatePresence>
        {showPonteAlDiaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(9, 13, 20, 0.85)',
              backdropFilter: 'blur(8px)',
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
                  initial={{ scale: 0.94, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.94, y: 15 }}
                  className="card-surface"
                  style={{
                    width: '100%',
                    maxWidth: '820px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--accent-amber-border)',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Header */}
                  <div style={{ padding: '1.25rem 1.75rem', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#FBBF24' }}>
                        <Sparkles size={20} /> Asistente "Ponete al Día" — Checklist por Exchange
                      </h3>
                      <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        Resolución guiada paso a paso para dejar tu sub-ledger 100% conciliado.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowPonteAlDiaModal(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '1.5rem 1.75rem' }}>
                    {isFinished ? (
                      <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--accent-emerald-subtle)', border: '1px solid var(--accent-emerald-border)', color: '#34D399', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                          <CheckCircle2 size={34} />
                        </div>
                        <h4 style={{ fontSize: '1.3rem', color: '#F8FAFC', margin: '0 0 0.4rem', fontWeight: 700 }}>
                          ¡Tu Contabilidad está 100% al Día! 🎉
                        </h4>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                          Completaste el checklist de todos los exchanges. Todos tus movimientos tienen consistencia FIFO y no quedan advertencias pendientes.
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                          <button
                            onClick={() => setShowPonteAlDiaModal(false)}
                            className="btn-outline"
                          >
                            Cerrar Asistente
                          </button>
                          <button
                            onClick={() => { setShowPonteAlDiaModal(false); navigate('/reports'); }}
                            className="btn-primary"
                          >
                            <FileText size={16} /> Ir a Descargar Excel Maestro →
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.25rem', alignItems: 'start' }}>
                        {/* Steps List */}
                        <div style={{ background: '#0D131F', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.65rem' }}>
                            Pasos ({ponteAlDiaStep + 1} de {totalSteps})
                          </div>

                          <div style={{ display: 'grid', gap: '0.4rem' }}>
                            {checklistExchanges.map((exName, idx) => {
                              const isCurrent = idx === ponteAlDiaStep;
                              const isCompleted = idx < ponteAlDiaStep || completedChecklistExchanges[exName];
                              const count = groupedExchanges[exName].length;

                              return (
                                <div
                                  key={exName}
                                  onClick={() => setPonteAlDiaStep(idx)}
                                  style={{
                                    padding: '0.55rem 0.75rem',
                                    borderRadius: 'var(--radius-sm)',
                                    background: isCurrent ? 'var(--brand-indigo-subtle)' : isCompleted ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                    border: isCurrent ? '1px solid var(--brand-indigo-border)' : isCompleted ? '1px solid var(--accent-emerald-border)' : '1px solid transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    {isCompleted ? (
                                      <CheckCircle2 size={14} color="#34D399" />
                                    ) : (
                                      <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: isCurrent ? 'var(--brand-indigo)' : '#334155', color: '#fff', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {idx + 1}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '0.82rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--brand-indigo-light)' : '#F8FAFC' }}>
                                      {exName}
                                    </span>
                                  </div>

                                  <span style={{ fontSize: '0.68rem', color: isCompleted ? '#34D399' : 'var(--accent-amber-light)' }}>
                                    {isCompleted ? '✓' : count}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Active Step Actions */}
                        <div>
                          {(() => {
                            const apiExchangesList = ['binance', 'bitso', 'bitget', 'okx', 'bybit'];
                            const isApiEx = apiExchangesList.some(name => currentExName.toLowerCase().includes(name));

                            return (
                              <div style={{ background: '#0D131F', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.15rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                                  <h4 style={{ margin: 0, fontSize: '1rem', color: isApiEx ? 'var(--brand-indigo-light)' : '#FBBF24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    {isApiEx ? '⚡ Exchange con Conexión API' : '📄 Exchange Sin API (Carga CSV / Manual)'}
                                  </h4>
                                  <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                                    {currentExItems.length} advertencia(s)
                                  </span>
                                </div>

                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                  {isApiEx
                                    ? `${currentExName} cuenta con sincronización API. El sistema puede recuperar compras y depósitos faltantes de forma automática.`
                                    : `${currentExName} requiere cargar el extracto CSV/Excel o declarar saldos iniciales.`}
                                </p>

                                <div style={{ display: 'grid', gap: '0.65rem' }}>
                                  {isApiEx && (
                                    <button
                                      disabled={syncingAllApis}
                                      onClick={() => handleApiSyncForExchange(currentExName)}
                                      className="btn-primary"
                                      style={{ width: '100%', fontSize: '0.82rem' }}
                                    >
                                      <RefreshCw size={14} className={syncingAllApis ? 'spin' : ''} />
                                      {syncingAllApis ? 'Sincronizando...' : `⚡ Sincronizar API de ${currentExName}`}
                                    </button>
                                  )}

                                  <div
                                    className="upload-zone-refined"
                                    style={{ padding: '0.85rem' }}
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
                                    <div style={{ fontSize: '0.82rem', color: '#F8FAFC', fontWeight: 600 }}>
                                      📄 Subir Extracto CSV / Excel de {currentExName}
                                    </div>
                                  </div>

                                  {inModalUploading && (
                                    <div style={{ textAlign: 'center', color: 'var(--brand-indigo-light)', fontSize: '0.8rem' }}>
                                      ⏳ Procesando archivo...
                                    </div>
                                  )}

                                  {inModalUploadMsg && (
                                    <div style={{ fontSize: '0.8rem', color: inModalUploadMsg.type === 'success' ? '#34D399' : '#FB7185', textAlign: 'center' }}>
                                      {inModalUploadMsg.text}
                                    </div>
                                  )}

                                  {currentExItems[0] && (
                                    <button
                                      onClick={() => {
                                        setShowPonteAlDiaModal(false);
                                        openResolverModal(currentExItems[0]);
                                      }}
                                      className="chip active-amber"
                                      style={{ justifyContent: 'center', padding: '0.5rem' }}
                                    >
                                      <Wand2 size={14} /> Ajuste Manual / Saldo Inicial para {currentExName}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button
                              type="button"
                              disabled={ponteAlDiaStep === 0}
                              onClick={() => setPonteAlDiaStep((prev) => Math.max(0, prev - 1))}
                              className="btn-outline"
                              style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem', opacity: ponteAlDiaStep === 0 ? 0.4 : 1 }}
                            >
                              Anterior
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setCompletedChecklistExchanges((prev) => ({ ...prev, [currentExName]: true }));
                                setPonteAlDiaStep((prev) => prev + 1);
                              }}
                              className="btn-primary"
                              style={{ background: 'linear-gradient(135deg, #10B981, #059669)', fontSize: '0.82rem' }}
                            >
                              Marcar {currentExName} al Día <CheckCircle2 size={14} />
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

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.92 }}
            style={{
              position: 'fixed',
              top: '1.25rem',
              right: '1.25rem',
              zIndex: 9999,
              background: toast.type === 'success'
                ? '#059669'
                : toast.type === 'error'
                ? '#DC2626'
                : toast.type === 'warning'
                ? '#D97706'
                : '#4F46E5',
              color: '#FFFFFF',
              padding: '0.75rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            {toast.type === 'success' && <CheckCircle2 size={18} />}
            {toast.type === 'error' && <AlertTriangle size={18} />}
            {toast.type === 'warning' && <AlertTriangle size={18} />}
            {toast.type === 'info' && <Sparkles size={18} />}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast({ show: false, message: '', type: 'info' })}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8, marginLeft: '0.35rem' }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Calendar;
