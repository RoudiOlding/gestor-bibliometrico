"use client";

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, FileText, BarChart2, Globe, Database, PlayCircle, Settings, LayoutTemplate, Loader2, CheckCircle2, Download, Settings2, Trash2, Plus, RotateCcw, GripVertical } from 'lucide-react';

const DEFAULT_COLUMNS = [
  'Scopus ID', 'WOS ID', 'SciELO Citation Index ID', 'Title', 'Repositorio C', 'Origen de la publicación', 'Prof investigador: NivelA_nivelB', 'Incentivos', 'Autor(es) del documento', 'Autor(es) ULIMA', 'Autor ulima no definido C', 'Código de trabajador', 'Autor Ulima Nombre completo', 'Categoría del autor J - C', 'Unidad', 'Subunidad', 'Tipo docente', 'Dedicación docente', 'Publicación con alumno', 'Obtención de grado/título C', 'Number of Authors', 'Scopus Author Id', 'Scopus Author Ids', 'Fecha de envío / recibido', 'Fecha de aceptación', 'Fecha límite de envío (conferencia)', 'Fecha de celebración (conferencia)', 'Year', 'Estado de publicación', 'Source title', 'Publisher', 'Volume', 'Issue', 'Pages', 'Article number', 'ISSN', 'eISSN', 'ISBN', 'Source type', 'Language', 'Field-Weighted View Impact', 'Views', 'Citations', 'Field-Weighted Citation Impact', 'Field-Citation Average', 'Citas recibidas en 2024', 'Citas 2025 1er trimestre', 'Citas 2025 3er trimestre hasta set', 'Citas 2025 al 20/08/25', 'Citas 2025 al 14/11/25', 'Citas 2025 al 01/12/25', 'DOI', 'Enlace DOI', 'URL', 'Publication type', 'Open Access', 'Institutions', 'Number of Institutions', 'Autor+afiliación', 'Scopus Affiliation names', 'Country/Region', 'Number of Countries/Regions', 'Colaboración', 'Sustainable Development Goals (2023)', 'WoS INDEX', 'SciELO País', 'Observaciones', 'Sustento', 'Base de datos', 'Fecha de envío a Respositorio | Fecha de validación', 'F ingreso/actualización'
];

export default function GestorBibliometria() {
  const [activeTab, setActiveTab] = useState('scopus');
  const [apiKey, setApiKey] = useState('');
  
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);

  const [columns, setColumns] = useState<string[]>([]);
  const [newCol, setNewCol] = useState('');

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const currentYear = new Date().getFullYear();
  const [yearMode, setYearMode] = useState<'single'|'range'>('single');
  const [startYear, setStartYear] = useState(currentYear.toString());
  const [endYear, setEndYear] = useState(currentYear.toString());
  
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressVal, setProgressVal] = useState(0);
  const [resultData, setResultData] = useState<{ count: number, file: string, preview: any[] } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ulima-columns');
    if (saved) setColumns(JSON.parse(saved));
    else setColumns(DEFAULT_COLUMNS);
  }, []);

  useEffect(() => {
    if (columns.length > 0) localStorage.setItem('ulima-columns', JSON.stringify(columns));
  }, [columns]);

  const addColumn = () => {
    if (newCol.trim() && !columns.includes(newCol.trim())) {
      setColumns([...columns, newCol.trim()]); setNewCol('');
    }
  };

  const removeColumn = (colToRemove: string) => setColumns(columns.filter(c => c !== colToRemove));

  const restoreColumns = () => {
    if(confirm("¿Seguro que deseas restaurar las 71 columnas por defecto? Se perderán tus cambios actuales.")) {
      setColumns(DEFAULT_COLUMNS);
    }
  };

  const handleSort = () => {
    let _columns = [...columns];
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const draggedItemContent = _columns.splice(dragItem.current, 1)[0];
      _columns.splice(dragOverItem.current, 0, draggedItemContent);
      setColumns(_columns);
    }
    dragItem.current = null; dragOverItem.current = null;
  };

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  const handleProcess = async () => {
    if ((activeTab === 'scopus' || activeTab === 'citas') && !apiKey) {
      setStatus('error'); setProgressMsg("Se requiere la API Key de Scopus."); return;
    }
    if ((activeTab === 'wos' || activeTab === 'scielo') && (!file1 || !file2)) {
      setStatus('error'); setProgressMsg("Por favor sube ambos archivos para cruzar la data."); return;
    }

    setStatus('processing'); setProgressVal(0);
    setProgressMsg(`Iniciando flujo para ${activeTab.toUpperCase()}...`);

    try {
      if (activeTab === 'citas') {
        setProgressMsg('Obteniendo lista de publicaciones históricas...');
        const resList = await fetch('/api/citas-lista', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey })
        });
        const listData = await resList.json();
        if (!resList.ok) throw new Error(listData.error);
        
        const publications = listData.publications;
        const totalPubs = publications.length;
        const processed = [];
        const BATCH_SIZE = 10;
        const sY = parseInt(startYear);
        const eY = yearMode === 'single' ? sY : parseInt(endYear);

        for (let i = 0; i < totalPubs; i += BATCH_SIZE) {
          const batch = publications.slice(i, i + BATCH_SIZE);
          const resBatch = await fetch('/api/citas-batch', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, papers: batch, sYear: sY, eYear: eY })
          });
          const batchData = await resBatch.json();
          if (!resBatch.ok) throw new Error(batchData.error);
          
          processed.push(...batchData.results);
          
          const current = Math.min(i + BATCH_SIZE, totalPubs);
          setProgressMsg(`Analizando paper ${current} de ${totalPubs}...`);
          setProgressVal(Math.round((current / totalPubs) * 100));
        }

        setProgressMsg('Ordenando resultados y generando archivo...');
        processed.sort((a, b) => b['_sort_value'] - a['_sort_value']);
        processed.forEach((p: any) => delete p['_sort_value']);

        const newWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWb, XLSX.utils.json_to_sheet(processed), "Citas");
        const excelBase64 = XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' });

        setResultData({ count: processed.length, file: excelBase64, preview: processed.slice(0, 5) });
        setStatus('success');

      } else if (activeTab === 'scopus') {
        
        setProgressMsg('Leyendo IDs existentes localmente...');
        let existingIds: string[] = [];
        
        if (file1) {
          const buffer = await file1.arrayBuffer();
          const wb = XLSX.read(buffer);
          const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
          existingIds = data.map((r: any) => r['Scopus ID'] ? String(r['Scopus ID']) : null).filter(Boolean) as string[];
        }

        setProgressMsg('Consultando API de Scopus (Descargando registros nuevos)...');

        // Enviamos a Vercel solo el API Key y la lista de IDs (A prueba de peso límite)
        const payload = { apiKey, columns, existingIds };
        const response = await fetch('/api/procesar-scopus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const respData = await response.json();
        if (!response.ok) throw new Error(respData.error || 'Error en el servidor');
        
        let newRecords = respData.data;

        // Si hay registros nuevos y subiste el CSV, cruzamos en el frontend
        if (file2 && newRecords.length > 0) {
          setProgressMsg('Cruzando con metadatos CSV localmente...');
          
          const buffer = await file2.arrayBuffer();
          const wb = XLSX.read(buffer);
          const metaData: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

          if (metaData.length > 0) {
            const csvColumns = Object.keys(metaData[0]);

            // Función local para buscar columnas
            const getBestCol = (target: string) => {
              const exact = csvColumns.find(c => c.toLowerCase().trim() === target.toLowerCase());
              return exact || csvColumns.find(c => c.toLowerCase().includes(target.toLowerCase()));
            };

            const colEidCsv = getBestCol('eid');

            if (colEidCsv) {
              const metaDict: Record<string, any> = {};
              metaData.forEach(row => {
                const rawCsvEid = String(row[colEidCsv] || '');
                const cleanCsvEid = rawCsvEid.includes('-') ? rawCsvEid.split('-').pop() : rawCsvEid;
                if (cleanCsvEid) metaDict[cleanCsvEid] = row;
              });

              const mapeoReal: Record<string, string> = {};
              const targets = [
                { ideal: 'publisher', final: 'Publisher' },
                { ideal: 'language of original', final: 'Language' },
                { ideal: 'open access', final: 'Open Access' },
                { ideal: 'publication stage', final: 'Estado de publicación' }
              ];

              targets.forEach(t => {
                const foundCol = getBestCol(t.ideal);
                if (foundCol) mapeoReal[foundCol] = t.final;
              });

              newRecords = newRecords.map((row: any) => {
                const eidStr = String(row['Scopus ID'] || '');
                const cleanEid = eidStr.includes('-') ? eidStr.split('-').pop() : eidStr;

                const matchRow = metaDict[cleanEid || ''];
                if (matchRow) {
                  for (const [realCol, finalCol] of Object.entries(mapeoReal)) {
                    row[finalCol] = matchRow[realCol] || "";
                  }
                }
                return row;
              });
            }
          }
        }

        setProgressMsg('Generando archivo Excel final...');
        const newWb = XLSX.utils.book_new();
        const newWs = XLSX.utils.json_to_sheet(newRecords, { header: columns });
        XLSX.utils.book_append_sheet(newWb, newWs, "Scopus_Update");
        const excelBase64 = XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' });

        setResultData({ count: newRecords.length, file: excelBase64, preview: newRecords.slice(0, 5) });
        setStatus('success');

      } else {
        
        const payload: any = { apiKey, columns }; 
        if (file1) payload[activeTab === 'wos' ? 'fileWos' : 'fileScielo'] = await toBase64(file1);
        if (file2) payload[activeTab === 'wos' ? 'fileIds' : 'fileMeta'] = await toBase64(file2);

        const response = await fetch(`/api/procesar-${activeTab}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error en el servidor');
        
        setResultData({ count: data.nuevos_registros, file: data.file, preview: data.previewData });
        setStatus('success');
      }
    } catch (error: any) { setStatus('error'); setProgressMsg(error.message); }
  };

  const handleDownload = () => {
    if (!resultData) return;
    const a = document.createElement('a');
    a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${resultData.file}`;
    a.download = `Update_${activeTab.toUpperCase()}_${new Date().getTime()}.xlsx`;
    a.click();
  };

  const resetState = (tab: string) => {
    setActiveTab(tab); setStatus('idle'); setResultData(null); setProgressMsg(''); setProgressVal(0); setFile1(null); setFile2(null);
  };

  const tabClass = (tabName: string) => `flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 cursor-pointer ${activeTab === tabName ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200/50' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50 border border-transparent'}`;
  const dropzoneClass = (hasFile: boolean) => `border border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group ${hasFile ? 'border-[#F26522] bg-[#FFFBF9]' : 'border-neutral-300 bg-neutral-50/50 hover:bg-neutral-50 hover:border-[#F26522]/40'}`;

  return (
    <div className="flex min-h-screen bg-white text-neutral-900 font-sans antialiased">
      <aside className="w-64 bg-[#f7f7f5] border-r border-neutral-200/60 p-5 flex flex-col flex-shrink-0">
        <div className="flex items-center gap-2 mb-8 px-1">
          <LayoutTemplate size={18} className="text-[#F26522]" strokeWidth={2} />
          <h2 className="text-sm font-semibold tracking-tight">Gestor Bibliométrico</h2>
        </div>
        
        <div className="mb-6 px-1">
          <div className="flex items-center gap-2 mb-2">
            <Settings size={14} className="text-neutral-400" />
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider">Configuración</label>
          </div>
          <input 
            type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key Scopus"
            className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F26522] focus:border-[#F26522] text-sm transition-all shadow-sm placeholder:text-neutral-400"
          />
        </div>

        <div className="mt-auto px-1">
          <p className="text-xs font-medium text-neutral-800">Universidad de Lima</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">Versión 2.0 (Vercel Ready)</p>
        </div>
      </aside>

      <main className="flex-1 p-10 flex flex-col max-w-5xl mx-auto w-full">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-800 mb-1">Actualización y Análisis</h1>
          <p className="text-sm text-neutral-500">Cruces de bases de datos y métricas de impacto institucional.</p>
        </header>

        <nav className="flex space-x-1 bg-neutral-100/80 p-1 rounded-lg w-fit mb-8 border border-neutral-200/50">
          <button onClick={() => resetState('scopus')} className={tabClass('scopus')}><Database size={15} strokeWidth={1.5} /> Scopus</button>
          <button onClick={() => resetState('wos')} className={tabClass('wos')}><Globe size={15} strokeWidth={1.5} /> Web of Science</button>
          <button onClick={() => resetState('scielo')} className={tabClass('scielo')}><FileText size={15} strokeWidth={1.5} /> SciELO</button>
          <button onClick={() => resetState('citas')} className={tabClass('citas')}><BarChart2 size={15} strokeWidth={1.5} /> Citas</button>
          <button onClick={() => resetState('config')} className={tabClass('config')}><Settings2 size={15} strokeWidth={1.5} /> Formato Dataset</button>
        </nav>

        <div className="flex-1">
          {activeTab === 'config' ? (
            <div className="animate-in fade-in duration-300 slide-in-from-bottom-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-medium text-neutral-800 mb-1">Estructura del Dataset Maestro</h3>
                  <p className="text-sm text-neutral-500">Añade, elimina o <strong className="text-neutral-700">arrastra</strong> para cambiar el orden de las columnas.</p>
                </div>
                <button onClick={restoreColumns} className="text-xs flex items-center gap-1 text-neutral-500 hover:text-neutral-800 transition-colors bg-neutral-100 px-3 py-1.5 rounded-md border border-neutral-200">
                  <RotateCcw size={12} /> Restaurar Default
                </button>
              </div>

              <div className="bg-[#f7f7f5] border border-neutral-200/60 rounded-xl p-6 mb-6">
                <form onSubmit={(e) => { e.preventDefault(); addColumn(); }} className="flex gap-2 mb-6">
                  <input type="text" value={newCol} onChange={e => setNewCol(e.target.value)} placeholder="Escribe el nombre de la nueva columna..." className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-md text-sm outline-none focus:border-[#F26522]" />
                  <button type="submit" className="bg-white border border-neutral-200 text-neutral-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-neutral-50 flex items-center gap-2 shadow-sm"><Plus size={16} /> Añadir</button>
                </form>

                <div className="flex flex-wrap gap-2 max-h-[500px] overflow-y-auto pr-2 pb-2">
                  {columns.map((col, index) => (
                    <div key={col} draggable onDragStart={() => (dragItem.current = index)} onDragEnter={() => (dragOverItem.current = index)} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()} className="flex items-center gap-1 bg-white border border-neutral-200 pl-1.5 pr-2 py-1.5 rounded-md text-xs font-medium text-neutral-700 shadow-sm cursor-grab active:cursor-grabbing group hover:border-[#F26522]/50 transition-colors">
                      <GripVertical size={14} className="text-neutral-300 group-hover:text-neutral-500" />
                      <span className="select-none">{col}</span>
                      <button onClick={() => removeColumn(col)} className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : 
          
          status === 'idle' || status === 'error' ? (
            <div className="animate-in fade-in duration-300 slide-in-from-bottom-2">
              <h3 className="text-base font-medium text-neutral-800 mb-1">
                {activeTab === 'scopus' ? 'Dataset Maestro' : activeTab === 'wos' ? 'Cruce Web of Science' : activeTab === 'scielo' ? 'Cruce SciELO' : 'Reporte de Impacto (Citas)'}
              </h3>
              <p className="text-sm text-neutral-500 mb-6">Sube los archivos necesarios o configura los parámetros y presiona procesar.</p>

              {activeTab === 'citas' ? (
                <div className="bg-[#f7f7f5] border border-neutral-200/60 rounded-xl p-6 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Modo de consulta</label>
                      <select value={yearMode} onChange={e => setYearMode(e.target.value as any)} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-md text-sm outline-none">
                        <option value="single">Un solo año</option>
                        <option value="range">Rango (Múltiples años)</option>
                      </select>
                    </div>
                    {yearMode === 'single' ? (
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Año</label>
                        <input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-md text-sm outline-none" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><label className="block text-xs font-medium text-neutral-500 mb-1">Desde</label><input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-md text-sm outline-none" /></div>
                        <div className="flex-1"><label className="block text-xs font-medium text-neutral-500 mb-1">Hasta</label><input type="number" value={endYear} onChange={e => setEndYear(e.target.value)} className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-md text-sm outline-none" /></div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5 mb-6">
                  <label className={dropzoneClass(!!file1)}>
                    <UploadCloud className={`${file1 ? 'text-[#F26522]' : 'text-neutral-400'} mb-2`} size={24} strokeWidth={1.5} />
                    <span className="text-sm font-medium text-neutral-700">{file1 ? file1.name : (activeTab === 'scopus' ? 'Base Histórica' : `Data Cruda ${activeTab.toUpperCase()}`)}</span>
                    <input type="file" className="hidden" accept={activeTab === 'scielo' ? '.csv, .txt' : '.xlsx, .xls'} onChange={(e) => setFile1(e.target.files?.[0] || null)} />
                  </label>
                  <label className={dropzoneClass(!!file2)}>
                    <UploadCloud className={`${file2 ? 'text-[#F26522]' : 'text-neutral-400'} mb-2`} size={24} strokeWidth={1.5} />
                    <span className="text-sm font-medium text-neutral-700">{file2 ? file2.name : (activeTab === 'scopus' ? 'Metadatos (CSV)' : 'IDs Existentes')}</span>
                    <input type="file" className="hidden" accept={activeTab === 'scopus' ? '.csv' : '.xlsx, .xls'} onChange={(e) => setFile2(e.target.files?.[0] || null)} />
                  </label>
                </div>
              )}

              {status === 'error' && <div className="p-3 mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md">⚠️ {progressMsg}</div>}

              <div className="flex justify-end">
                <button onClick={handleProcess} className="bg-[#F26522] hover:bg-[#D9531E] text-white text-sm font-medium py-2 px-5 rounded-md shadow-sm transition-all flex items-center gap-2">
                  <PlayCircle size={16} strokeWidth={2} /> Ejecutar Proceso
                </button>
              </div>
            </div>
          ) : status === 'processing' ? (
            <div className="border border-neutral-200 rounded-xl p-8 flex flex-col items-center justify-center min-h-[250px] bg-neutral-50/50 shadow-inner">
              <Loader2 className="animate-spin text-[#F26522] mb-4" size={36} strokeWidth={1.5} />
              <p className="text-sm font-medium text-neutral-700 mb-6">{progressMsg}</p>
              {activeTab === 'citas' && (
                <div className="w-full max-w-sm bg-neutral-200 rounded-full h-1.5 mb-2 overflow-hidden">
                  <div className="bg-[#F26522] h-1.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progressVal}%` }}></div>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-neutral-200 rounded-xl p-8 bg-white shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle2 className="text-green-500" size={28} />
                <div><h4 className="text-base font-semibold text-neutral-800">Proceso completado</h4><p className="text-sm text-neutral-500">Se procesaron {resultData?.count} registros correctamente.</p></div>
              </div>

              {resultData?.preview && resultData.preview.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Vista Previa</p>
                  <div className="overflow-x-auto border border-neutral-200 rounded-lg">
                    <table className="w-full text-left text-sm text-neutral-600">
                      <thead className="bg-neutral-50 border-b border-neutral-200 text-xs text-neutral-500">
                        <tr>{Object.keys(resultData.preview[0]).slice(0, activeTab === 'citas' ? 6 : 4).map((col) => <th key={col} className="px-4 py-2 font-medium">{col}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {resultData.preview.map((row, i) => (
                          <tr key={i}>{Object.keys(row).slice(0, activeTab === 'citas' ? 6 : 4).map(col => <td key={col} className="px-4 py-2 truncate max-w-[200px]">{row[col]}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-8 border-t border-neutral-100 pt-6">
                <button onClick={() => resetState(activeTab)} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">Volver</button>
                <button onClick={handleDownload} className="bg-[#F26522] hover:bg-[#D9531E] text-white text-sm font-medium py-2 px-5 rounded-md shadow-sm transition-all flex items-center gap-2"><Download size={16} strokeWidth={2} /> Descargar Dataset Final</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}