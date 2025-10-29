import { supabase } from "@/integrations/supabase/client";

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
  const [month, year] = monthStr.split('_');
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  return `${year}-${monthMap[month]}-01`;
}

export async function importCheckoutData(csvContent: string) {
  try {
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(';');
    
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
      
      records.push({
        pillar: row.pillar,
        product_type: row.product_type,
        brand_id: row.brand_id,
        merchant_name: row.merchant_name,
        tpt: parseFloat(row.tpt) || 0,
        tpv: parseFloat(row.tpv) || 0,
        date: parseMonthToDate(row.month)
      });
    }
    
    const { data, error } = await supabase
      .from('merchant_data')
      .insert(records)
      .select();
    
    if (error) throw error;
    
    return {
      imported: records.length,
      skipped: 0,
      errors: 0,
      message: "Data imported successfully"
    };
  } catch (error) {
    console.error('Import error:', error);
    return {
      imported: 0,
      skipped: 0,
      errors: 1,
      message: error instanceof Error ? error.message : "Import failed"
    };
  }
}
