import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

function extraerAutoresUlima(addressesText: string) {
  if (!addressesText) return [];
  const regex = /\[(.*?)\]\s*Univ\s*Lima/gi;
  let match;
  const autoresUlima: string[] = [];
  while ((match = regex.exec(addressesText)) !== null) {
    const autores = match[1].split(';').map(a => a.trim());
    autoresUlima.push(...autores);
  }
  return autoresUlima;
}

function limpiezaId(valor: string) {
  if (!valor) return null;
  const s = String(valor).toUpperCase().trim().replace(/\s/g, '');
  if (!s.includes('WOS:')) return null;
  return s;
}

export async function POST(req: Request) {
  try {
    const { fileWos, fileIds, columns } = await req.json();
    if (!fileWos || !fileIds) return NextResponse.json({ error: "Faltan archivos" }, { status: 400 });

    const FINAL_COLUMNS = columns && columns.length > 0 ? columns : [];

    const wosBuffer = Buffer.from(fileWos.split(',')[1], 'base64');
    const wosWorkbook = XLSX.read(wosBuffer, { type: 'buffer' });
    const dfWosRaw = XLSX.utils.sheet_to_json(wosWorkbook.Sheets[wosWorkbook.SheetNames[0]]);

    const idsBuffer = Buffer.from(fileIds.split(',')[1], 'base64');
    const idsWorkbook = XLSX.read(idsBuffer, { type: 'buffer' });
    const dfListaIds = XLSX.utils.sheet_to_json(idsWorkbook.Sheets[idsWorkbook.SheetNames[0]]);

    let colIdLista = Object.keys(dfListaIds[0] || {}).find(c => 
      ['id', 'wos id', 'wos_id', 'ut'].includes(c.toLowerCase())
    );
    if (!colIdLista) colIdLista = Object.keys(dfListaIds[0] || {})[0];

    const idsExistentes = new Set(dfListaIds.map((row: any) => limpiezaId(row[colIdLista])).filter(Boolean));

    const colUt = Object.keys(dfWosRaw[0] || {}).find(c => 
      c.toUpperCase().includes('UT') && c.toUpperCase().includes('WOS')
    ) || 'UT (Unique WOS ID)';

    let nuevosReales = dfWosRaw.filter((row: any) => {
      const idClean = limpiezaId(row[colUt]);
      return idClean && !idsExistentes.has(idClean);
    });

    const filasExpandidas: any[] = [];
    
    nuevosReales.forEach((filaWos: any) => {
      const addresses = filaWos['Addresses'] || '';
      const autoresUlima = extraerAutoresUlima(addresses);
      
      const filaBase: any = {};
      FINAL_COLUMNS.forEach((col: string) => filaBase[col] = "");
      
      filaBase['WOS ID'] = filaWos[colUt] || '';
      filaBase['Title'] = filaWos['Article Title'] || '';
      filaBase['Autor(es) del documento'] = filaWos['Author Full Names'] || '';
      filaBase['Number of Authors'] = filaWos['Authors'] || ''; 
      filaBase['Fecha de celebración (conferencia)'] = filaWos['Conference Date'] || '';
      filaBase['Year'] = filaWos['Publication Year'] || '';
      filaBase['Source title'] = filaWos['Source Title'] || '';
      filaBase['Publisher'] = filaWos['Publisher'] || '';
      filaBase['Volume'] = filaWos['Volume'] || '';
      filaBase['Issue'] = filaWos['Issue'] || '';
      
      const sp = String(filaWos['Start Page'] || '').trim();
      const ep = String(filaWos['End Page'] || '').trim();
      if (sp && sp !== 'nan' && ep && ep !== 'nan') {
        filaBase['Pages'] = `${sp}-${ep}`;
      } else if (sp && sp !== 'nan') {
        filaBase['Pages'] = sp;
      }
      
      filaBase['Article number'] = filaWos['Article Number'] || '';
      filaBase['ISSN'] = filaWos['ISSN'] || '';
      filaBase['eISSN'] = filaWos['eISSN'] || '';
      filaBase['ISBN'] = filaWos['ISBN'] || '';
      filaBase['Source type'] = filaWos['Journal Abbreviation'] || '';
      filaBase['Language'] = filaWos['Language'] || '';
      filaBase['DOI'] = filaWos['DOI'] || '';
      filaBase['Enlace DOI'] = filaWos['DOI Link'] || '';
      filaBase['Publication type'] = filaWos['Document Type'] || '';
      filaBase['Open Access'] = filaWos['Open Access Designations'] || '';
      filaBase['Institutions'] = filaWos['Affiliations'] || '';
      filaBase['Scopus Affiliation names'] = filaWos['Affiliations'] || '';
      filaBase['WoS INDEX'] = filaWos['Web of Science Index'] || '';
      
      filaBase['Country/Region'] = 'Peru';
      filaBase['Base de datos'] = 'Web of Science';
      
      const today = new Date();
      filaBase['F ingreso/actualización'] = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getFullYear()}`;

      if (autoresUlima.length === 0) {
        filasExpandidas.push(filaBase);
      } else {
        autoresUlima.forEach(autor => {
          const filaNueva = { ...filaBase };
          filaNueva['Autor(es) ULIMA'] = autor;
          filaNueva['Autor Ulima Nombre completo'] = autor;
          
          const orderedRow: any = {};
          FINAL_COLUMNS.forEach((col: string) => orderedRow[col] = filaNueva[col]);
          filasExpandidas.push(orderedRow);
        });
      }
    });

    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(filasExpandidas, { header: FINAL_COLUMNS });
    XLSX.utils.book_append_sheet(newWb, newWs, "Nuevos_WoS");
    
    return NextResponse.json({
      message: "WoS procesado exitosamente",
      nuevos_registros: filasExpandidas.length,
      file: XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' }),
      previewData: filasExpandidas.slice(0, 5).map(r => ({ 
        'WOS ID': r['WOS ID'], 
        'Title': r['Title'], 
        'Autor Ulima': r['Autor Ulima Nombre completo'] 
      }))
    });

  } catch (error: any) { 
    return NextResponse.json({ error: error.message }, { status: 500 }); 
  }
}