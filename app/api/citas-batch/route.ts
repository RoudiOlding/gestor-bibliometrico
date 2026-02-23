import { NextResponse } from 'next/server';

async function getCitationsInYear(cleanId: string, year: number, apiKey: string): Promise<number> {
  const baseUrl = "https://api.elsevier.com/content/search/scopus";
  const query = `REF(${cleanId}) AND PUBYEAR = ${year}`;
  const url = `${baseUrl}?query=${encodeURIComponent(query)}&count=1`;
  
  try {
    const res = await fetch(url, { 
      headers: { 'X-ELS-APIKey': apiKey.trim(), 'Accept': 'application/json' }
    });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      return getCitationsInYear(cleanId, year, apiKey);
    }
    if (res.status === 200) {
      const data = await res.json();
      return parseInt(data['search-results']?.['opensearch:totalResults'] || '0', 10);
    }
    return 0;
  } catch { return 0; }
}

export async function POST(req: Request) {
  try {
    const { apiKey, papers, sYear, eYear } = await req.json();
    const results = [];
    
    for (const paper of papers) {
        let totalCitationsRange = 0;
        const updatedPaper = { ...paper };
        
        for (let y = sYear; y <= eYear; y++) {
          let citations = 0;
          if (paper.cleanId) citations = await getCitationsInYear(paper.cleanId, y, apiKey);
          updatedPaper[`Citas ${y}`] = citations;
          totalCitationsRange += citations;
        }
        
        if (sYear !== eYear) updatedPaper['Total Periodo'] = totalCitationsRange;
        updatedPaper['_sort_value'] = totalCitationsRange;
        delete updatedPaper.cleanId; 
        
        results.push(updatedPaper);
        // Respiro exacto que tenías en Streamlit
        await new Promise(r => setTimeout(r, 50)); 
    }
    
    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}