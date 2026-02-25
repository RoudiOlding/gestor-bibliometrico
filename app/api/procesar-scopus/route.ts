import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import Fuse from 'fuse.js';

async function fetchScopusData(apiKey: string) {
  const baseUrl = "https://api.elsevier.com/content/search/scopus";
  const query = "AF-ID(60078115)";
  let allPublications: any[] = [];
  let start = 0;
  const count = 25;

  while (true) {
    const res = await fetch(`${baseUrl}?query=${encodeURIComponent(query)}&count=${count}&start=${start}&view=COMPLETE&sort=coverDate`, {
      headers: { 'X-ELS-APIKey': apiKey, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Error API Scopus: ${res.statusText}`);
    const data = await res.json();
    const entries = data['search-results']?.entry || [];
    if (entries.length === 0) break;
    allPublications.push(...entries);
    const total = parseInt(data['search-results']['opensearch:totalResults'] || '0', 10);
    if (allPublications.length >= total) break;
    start += count;
  }
  return allPublications;
}

function processAuthors(authorsList: any[]) {
  const ULIMA_AFID = "60078115";
  const allAuthors: string[] = [];
  const ulimaAuthors: string[] = [];
  const idsList: string[] = [];

  for (const author of authorsList || []) {
    let name = `${author.surname || ''} ${author['given-name'] || ''}`.trim();
    if (!name) name = author.authname || "";
    if (name) allAuthors.push(name);
    if (author.authid) idsList.push(author.authid);
    let afids = author.afid || [];
    if (!Array.isArray(afids)) afids = [afids];
    const isUlima = afids.some((af: any) => af['$'] === ULIMA_AFID);
    if (isUlima && name) ulimaAuthors.push(name);
  }
  return {
    allAuthors: allAuthors.join(', '),
    ulimaAuthors: ulimaAuthors.join(', '),
    idsList: idsList.join(', '),
    numAuthors: allAuthors.length
  };
}

function getBestColumnMatch(target: string, columns: string[]) {
  const fuse = new Fuse(columns, { includeScore: true, threshold: 0.4 });
  const result = fuse.search(target);
  return result.length > 0 ? result[0].item : null;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    const apiKey = formData.get('apiKey') as string | null;
    const columnsStr = formData.get('columns') as string | null;
    const fileBase = formData.get('fileBase') as File | null;
    const fileMeta = formData.get('fileMeta') as File | null;

    if (!apiKey) return NextResponse.json({ error: "Falta API Key" }, { status: 400 });

    let columns: string[] = [];
    if (columnsStr) {
      try { columns = JSON.parse(columnsStr); } catch (e) {}
    }
    const FINAL_COLUMNS = columns && columns.length > 0 ? columns : [];

    const rawEntries = await fetchScopusData(apiKey);
    let dfApi = rawEntries.map(entry => {
      const rawId = entry['dc:identifier'] || '';
      const eidClean = rawId.includes(':') ? rawId.split(':').pop() : rawId;
      const { allAuthors, ulimaAuthors, idsList, numAuthors } = processAuthors(entry.author);

      const baseRow: any = {};
      FINAL_COLUMNS.forEach((col: string) => baseRow[col] = "");

      baseRow['Scopus ID'] = eidClean ? `2-s2.0-${eidClean}` : "";
      baseRow['EID_TEMP'] = eidClean; 
      baseRow['Title'] = entry['dc:title'] || "";
      baseRow['Year'] = entry['prism:coverDate'] ? entry['prism:coverDate'].substring(0, 4) : "";
      baseRow['Source title'] = entry['prism:publicationName'] || "";
      baseRow['Autor(es) del documento'] = allAuthors;
      baseRow['Autor(es) ULIMA'] = ulimaAuthors;
      baseRow['Number of Authors'] = numAuthors;
      baseRow['Scopus Author Ids'] = idsList;
      baseRow['DOI'] = entry['prism:doi'] || "";
      baseRow['Enlace DOI'] = entry['prism:doi'] ? `https://doi.org/${entry['prism:doi']}` : "";
      baseRow['Citations'] = entry['citedby-count'] || "0";
      baseRow['Publication type'] = entry.subtypeDescription || "";
      baseRow['Volume'] = entry['prism:volume'] || "";
      baseRow['Issue'] = entry['prism:issueIdentifier'] || "";
      baseRow['Pages'] = entry['prism:pageRange'] || "";
      baseRow['Article number'] = entry['article-number'] || "";
      baseRow['ISSN'] = entry['prism:issn'] || "";
      baseRow['eISSN'] = entry['prism:eIssn'] || "";
      baseRow['Base de datos'] = "Scopus";
      
      const today = new Date();
      baseRow['F ingreso/actualización'] = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getFullYear()}`;

      return baseRow;
    });

    if (fileBase) {
      const arrayBuffer = await fileBase.arrayBuffer();
      const baseBuffer = Buffer.from(arrayBuffer);
      const workbookBase = XLSX.read(baseBuffer, { type: 'buffer' });
      const baseData: any[] = XLSX.utils.sheet_to_json(workbookBase.Sheets[workbookBase.SheetNames[0]]);
      const existingIds = new Set(baseData.map(row => String(row['Scopus ID'])));
      dfApi = dfApi.filter(row => !existingIds.has(row['Scopus ID']));
    }

    if (fileMeta) {
      const arrayBuffer = await fileMeta.arrayBuffer();
      const metaBuffer = Buffer.from(arrayBuffer);
      const workbookMeta = XLSX.read(metaBuffer, { type: 'buffer' });
      const metaData: any[] = XLSX.utils.sheet_to_json(workbookMeta.Sheets[workbookMeta.SheetNames[0]]);
      
      if (metaData.length > 0) {
        const csvColumns = Object.keys(metaData[0]);
        const colEidCsv = getBestColumnMatch('EID', csvColumns);

        if (colEidCsv) {
          const metaDict: Record<string, any> = {};
          metaData.forEach(row => {
            const rawCsvEid = String(row[colEidCsv] || '');
            const cleanCsvEid = rawCsvEid.includes('-') ? rawCsvEid.split('-').pop() : rawCsvEid;
            if (cleanCsvEid) metaDict[cleanCsvEid] = row;
          });

          const mappingIdeal = {
            'Publisher': 'Publisher',
            'Language of Original Document': 'Language',
            'Open Access': 'Open Access',
            'Publication Stage': 'Estado de publicación'
          };

          const mapeoReal: Record<string, string> = {};
          for (const [ideal, final] of Object.entries(mappingIdeal)) {
            const realCol = getBestColumnMatch(ideal, csvColumns);
            if (realCol) mapeoReal[realCol] = final;
          }

          dfApi = dfApi.map(row => {
            const matchRow = metaDict[row.EID_TEMP];
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

    const finalRows: any[] = [];
    dfApi.forEach(row => {
      const ulimaArr = row['Autor(es) ULIMA'] ? String(row['Autor(es) ULIMA']).split(',').map(s => s.trim()) : [];
      const idsArr = row['Scopus Author Ids'] ? String(row['Scopus Author Ids']).split(',').map(s => s.trim()) : [];
      const docArr = row['Autor(es) del documento'] ? String(row['Autor(es) del documento']).split(',').map(s => s.trim()) : [];

      if (ulimaArr.length === 0 || !ulimaArr[0]) {
        delete row.EID_TEMP;
        finalRows.push(row);
        return;
      }

      const mapIds: Record<string, string> = {};
      docArr.forEach((name, i) => { if (i < idsArr.length) mapIds[name] = idsArr[i]; });

      ulimaArr.forEach(auUlima => {
        const newRow = { ...row };
        newRow['Autor Ulima Nombre completo'] = auUlima;
        newRow['Scopus Author Id'] = mapIds[auUlima] || '';
        delete newRow.EID_TEMP;
        
        const orderedRow: any = {};
        FINAL_COLUMNS.forEach((col: string) => {
            orderedRow[col] = newRow[col];
        });
        finalRows.push(orderedRow);
      });
    });

    const newWb = XLSX.utils.book_new();
    const newWs = XLSX.utils.json_to_sheet(finalRows, { header: FINAL_COLUMNS });
    XLSX.utils.book_append_sheet(newWb, newWs, "Scopus_Update");
    
    const excelBase64 = XLSX.write(newWb, { type: 'base64', bookType: 'xlsx' });

    return NextResponse.json({
      message: "Proceso exitoso",
      nuevos_registros: finalRows.length,
      file: excelBase64,
      previewData: finalRows.slice(0, 5) 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}