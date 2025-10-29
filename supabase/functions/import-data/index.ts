import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CSVRow {
  pillar: string;
  product_type: string;
  brand_id: string;
  merchant_name: string;
  tpt: string;
  tpv: string;
  month: string;
}

function parseMonthToDate(monthStr: string): string {
  const [month, year] = monthStr.split('-');
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const monthLower = month.toLowerCase();
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${monthMap[monthLower]}-01`;
}

async function importCheckoutData(csvContent: string, supabase: any) {
  try {
    console.log('Starting CSV import...');
    
    // Remove BOM if present
    const cleanContent = csvContent.replace(/^\uFEFF/, '');
    const lines = cleanContent.trim().split('\n');
    const headers = lines[0].split(';').map(h => h.trim());
    
    console.log(`Processing ${lines.length - 1} rows...`);
    
    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(';');
      
      // Skip empty rows
      if (values.every(v => !v || !v.trim())) continue;
      
      const row: any = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim() || '';
      });
      
      // Skip if essential fields are missing
      if (!row.pillar || !row.brand_id) continue;
      
      // Clean TPV value - remove commas
      const tpvValue = row.tpv.replace(/,/g, '');
      
      records.push({
        pillar: row.pillar,
        product_type: row.product_type,
        brand_id: row.brand_id,
        merchant_name: row.merchant_name,
        tpt: parseFloat(row.tpt) || 0,
        tpv: parseFloat(tpvValue) || 0,
        date: parseMonthToDate(row.month)
      });
    }
    
    console.log(`Parsed ${records.length} valid records`);
    
    // Insert in batches to avoid timeout
    const batchSize = 500;
    let totalInserted = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(records.length/batchSize)}...`);
      
      const { data, error } = await supabase
        .from('merchant_data')
        .insert(batch)
        .select();
      
      if (error) {
        console.error('Batch insert error:', error);
        throw error;
      }
      
      totalInserted += batch.length;
      console.log(`Successfully inserted ${totalInserted}/${records.length} records`);
    }
    
    return {
      imported: records.length,
      skipped: 0,
      errors: 0,
      message: "Data imported successfully"
    };
  } catch (error) {
    console.error('Import error:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Import function invoked');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get CSV content from request body
    const { csvContent } = await req.json();
    
    if (!csvContent) {
      return new Response(
        JSON.stringify({ error: 'CSV content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('CSV content received, starting import...');
    
    const result = await importCheckoutData(csvContent, supabase);
    
    console.log('Import completed successfully:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Import failed';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        imported: 0,
        skipped: 0,
        errors: 1,
        message: 'Import failed'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
