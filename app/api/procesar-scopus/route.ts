import { NextResponse } from 'next/server';

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

export async function POST(req: Request) {
  try {
    // Solo recibimos tu API Key y un arreglo de IDs en texto plano (Súper ligero)
    const { apiKey, columns, existingIds = [] } = await req.json();
    
    if (!apiKey) return NextResponse.json({ error: "Falta API Key" }, { status: 400 });

    const FINAL_COLUMNS = columns && columns.length > 0 ? columns : [];
    const existingIdsSet = new Set(existingIds.map(String));

    const rawEntries = await fetchScopusData(apiKey);
    let dfApi = rawEntries.map(entry => {
      const rawId = entry['dc:identifier'] || '';
      const eidClean = rawId.includes(':') ? rawId.split(':').pop() : rawId;
      const { allAuthors, ulimaAuthors, idsList, numAuthors } = processAuthors(entry.author);

      const baseRow: any = {};
      FINAL_COLUMNS.forEach((col: string) => baseRow[col] = "");

      baseRow['Scopus ID'] = eidClean ? `2-s2.0-${eidClean}` : "";
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

    if (existingIdsSet.size > 0) {
      dfApi = dfApi.filter(row => !existingIdsSet.has(row['Scopus ID']));
    }

    const finalRows: any[] = [];
    dfApi.forEach(row => {
      const ulimaArr = row['Autor(es) ULIMA'] ? String(row['Autor(es) ULIMA']).split(',').map(s => s.trim()) : [];
      const idsArr = row['Scopus Author Ids'] ? String(row['Scopus Author Ids']).split(',').map(s => s.trim()) : [];
      const docArr = row['Autor(es) del documento'] ? String(row['Autor(es) del documento']).split(',').map(s => s.trim()) : [];

      if (ulimaArr.length === 0 || !ulimaArr[0]) {
        finalRows.push(row);
        return;
      }

      const mapIds: Record<string, string> = {};
      docArr.forEach((name, i) => { if (i < idsArr.length) mapIds[name] = idsArr[i]; });

      ulimaArr.forEach(auUlima => {
        const newRow = { ...row };
        newRow['Autor Ulima Nombre completo'] = auUlima;
        newRow['Scopus Author Id'] = mapIds[auUlima] || '';
        
        const orderedRow: any = {};
        FINAL_COLUMNS.forEach((col: string) => {
            orderedRow[col] = newRow[col];
        });
        finalRows.push(orderedRow);
      });
    });

    // Retornamos los datos planos, ¡sin armar excel!
    return NextResponse.json({
      message: "Proceso exitoso",
      data: finalRows 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}