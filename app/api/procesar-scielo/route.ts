import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// Borramos el FINAL_COLUMNS hardcodeado de aquí arriba

const MAP = {
  'PT': 'Publication Type', 'AU': 'Authors', 'TI': 'Title', 'SO': 'Source',
  'LA': 'Language', 'DT': 'Document Type', 'DE': 'Author Keywords',
  'AB': 'Abstract', 'C1': 'Addresses', 'PU': 'Publisher', 'SN': 'ISSN',
  'PY': 'Publication Year', 'VL': 'Volume', 'IS': 'Issue', 'BP': 'Start Page',
  'EP': 'End Page', 'DI': 'DOI', 'OA': 'Open Access', 'UT': 'Archive Location',
  'C2': 'Scielo País'
};

function cleanScieloId(val: string) {
  if (!val) return null;
  const s = String(val).toUpperCase().trim().replace(/\s/g, '');
  if (['-', '—', 'NAN', 'NONE', ''].includes(s) || s.length < 5) return null;
  return s;
}

function extractUlimaAuthorsScielo(addressesText: string) {
  if (!addressesText) return [];
  const regex = /\[(.*?)\]\s*Univ.*?Lima/gi;
  let match;
  const authors: string[] = [];
  while ((match = regex.exec(addressesText)) !== null) {
    const group = match[1].split(';').map(a => a.trim());
    authors.push(...group);
  }
  return authors;
}

export async function POST(req: Request) {
  try {
    // 💡 RECIBIMOS LAS COLUMNAS DINÁMICAS DEL FRONTEND AQUÍ
    const { fileScielo, fileIds, columns } = await req.json();
    if (!fileScielo || !fileIds) return NextResponse.json({ error: "Faltan archivos" }, { status: 400 });

    const FINAL_COLUMNS = columns && columns.length > 0 ? columns : [];

    // 1. Leer TXT/CSV tabulado
    const scieloBuffer = Buffer.from(fileScielo.split(',')[1], 'base64');
    const scieloText = scieloBuffer.toString('utf-8').replace(/\r/g, ''); 
    const scieloRows = scieloText.split('\n').map(r => r.split('\t'));
    const headers = scieloRows[0].map(h => (MAP as any)[h.trim()] || h.trim());
    
    const scieloData = scieloRows.slice(1).filter(r => r.length > 1).map(row => {
      const obj: any = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });

    // 2. Leer Excel de IDs y cruzar
    const idsBuffer = Buffer.from(fileIds.split(',')[1], 'base64');
    const workbookIds = XLSX.read(idsBuffer, { type: 'buffer' });
    const firstSheetName = workbookIds.SheetNames[0];
    const idsData = XLSX.utils.sheet_to_json(workbookIds.Sheets[firstSheetName]);
    
    const idCol = Object.keys(idsData[0] || {}).find(c => c.toUpperCase().includes('SCIELO') && c.toUpperCase().includes('ID')) || Object.keys(idsData[0] || {})[0];
    const existingIds = new Set(idsData.map((row: any) => cleanScieloId(row[idCol])).filter(Boolean));

    let newRecords = scieloData.filter((row: any) => {
      const id = cleanScieloId(row['Archive Location'] || row['UT']);
      return id && !existingIds.has(id);
    });

    // 3. Mapeo y Formateo a Dataset Maestro
    const finalRows: any[] = [];
    
    newRecords.forEach((row: any) => {
      const rawInst = String(row['Addresses'] || '');
      const ulimaAuthors = extractUlimaAuthorsScielo(rawInst);
      
      const baseRow: any = {};
      // 💡 CREAR LA FILA CON LA ESTRUCTURA DINÁMICA
      FINAL_COLUMNS.forEach((col: string) => baseRow[col] = "");
      
      baseRow['SciELO Citation Index ID'] = row['Archive Location'] || row['UT'] || '';
      baseRow['Title'] = row['Title'] || '';
      baseRow['Autor(es) del documento'] = row['Authors'] || '';
      baseRow['Source title'] = row['Source'] || '';
      baseRow['Language'] = row['Language'] || '';
      
      const pt = String(row['Publication Type'] || '').trim();
      baseRow['Publication type'] = pt === 'J' ? 'Journal' : pt;
      
      baseRow['Publisher'] = row['Publisher'] || '';
      baseRow['ISSN'] = row['ISSN'] || '';
      baseRow['Year'] = row['Publication Year'] || '';
      baseRow['Volume'] = row['Volume'] || '';
      baseRow['Issue'] = row['Issue'] || '';
      
      const sp = row['Start Page'] && row['Start Page'] !== 'nan' ? String(row['Start Page']).trim() : '';
      const ep = row['End Page'] && row['End Page'] !== 'nan' ? String(row['End Page']).trim() : '';
      baseRow['Pages'] = (sp && ep) ? `${sp}-${ep}` : sp;
      
      baseRow['DOI'] = row['DOI'] || '';
      baseRow['Open Access'] = row['Open Access'] || '';
      
      baseRow['SciELO País'] = row['Scielo País'] || '';
      
      baseRow['Institutions'] = rawInst.replace(/\[.*?\]/g, '').replace(/;/g, ' | ').trim();
      baseRow['Base de datos'] = 'SciELO';
      baseRow['Country/Region'] = 'Peru';

      const today = new Date();
      baseRow['F ingreso/actualización'] = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getFullYear()}`;

      if (ulimaAuthors.length === 0) {
        finalRows.push(baseRow);
      } else {
        ulimaAuthors.forEach(author => {
          const newRow = { ...baseRow };
          newRow['Autor(es) ULIMA'] = author;
          newRow['Autor Ulima Nombre completo'] = author;
          
          // 💡 FILTRAR PARA QUE SOLO QUEDEN LAS COLUMNAS REQUERIDAS
          const orderedRow: any = {};
          FINAL_COLUMNS.forEach((col: string) => orderedRow[col] = newRow[col]);
          finalRows.push(orderedRow);
        });
      }
    });

    // 4. Generar Excel
    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(finalRows, { header: FINAL_COLUMNS });
    XLSX.utils.book_append_sheet(newWb, newWs, "Nuevos_SciELO");
    
    return NextResponse.json({
      message: "SciELO procesado",
      nuevos_registros: finalRows.length,
      file: XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' }),
      previewData: finalRows.slice(0, 5).map(r => ({ 
        'SciELO ID': r['SciELO Citation Index ID'], 
        'Title': r['Title'], 
        'Autor Ulima': r['Autor Ulima Nombre completo'] 
      }))
    });

  } catch (error: any) { 
    return NextResponse.json({ error: error.message }, { status: 500 }); 
  }
}