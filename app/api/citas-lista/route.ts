import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { apiKey } = await req.json();
    if (!apiKey) return NextResponse.json({ error: "Falta API Key" }, { status: 400 });

    const baseUrl = "https://api.elsevier.com/content/search/scopus";
    let allPublications: any[] = [];
    let start = 0;
    const count = 25;
    
    while (true) {
      const query = 'AF-ID(60078115)';
      const url = `${baseUrl}?query=${encodeURIComponent(query)}&count=${count}&start=${start}&view=COMPLETE&sort=coverDate`;
      const res = await fetch(url, {
        headers: { 'X-ELS-APIKey': apiKey.trim(), 'Accept': 'application/json' }
      });
      
      if (!res.ok) throw new Error("Error conectando con Scopus");
      
      const data = await res.json();
      const entries = data['search-results']?.entry || [];
      if (entries.length === 0) break;
      
      allPublications.push(...entries);
      const total = parseInt(data['search-results']['opensearch:totalResults'] || '0', 10);
      if (allPublications.length >= total) break;
      start += count;
    }

    const results = allPublications.map(entry => {
        const scopusId = entry['dc:identifier'] || '';
        return {
          'Título': entry['dc:title'] || 'N/A',
          'EID': (entry['eid'] || '').replace('2-s2.0-', ''),
          'Scopus ID': scopusId,
          'cleanId': scopusId.replace('SCOPUS_ID:', ''),
          'Año': entry['prism:coverDate']?.substring(0, 4) || '',
          'Total Histórico': parseInt(entry['citedby-count'] || '0', 10)
        };
    });

    return NextResponse.json({ publications: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}