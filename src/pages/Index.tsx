import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, BarChart3, Table as TableIcon, Sparkles, RefreshCw, Users, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DateRange } from "react-day-picker";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

/**
 * Payments KPI Dashboard – Frontend (React)
 * Range Date: single input (e.g., "2025-10-01 - 2025-10-31" or "2025-09 - 2025-10")
 */

const PRODUCTS = [
  { key: "waas", label: "WaaS" },
  { key: "paychat", label: "PayChat" },
  { key: "sub_account", label: "Sub Account" },
];

const PERIODS = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
];

const PILLARS = [
  { key: "accept_payment", label: "Accept Payment", soon: true },
  { key: "payouts", label: "Payouts", soon: true },
  { key: "wallets_billing", label: "Wallets & Billing", soon: false },
];

export const CHURN_CONFIG: Record<string, { horizon_days: number; bands: { high: number; medium: number } }> = {
  default: { horizon_days: 30, bands: { high: 0.7, medium: 0.4 } },
  paychat: { horizon_days: 30, bands: { high: 0.7, medium: 0.4 } },
  waas: { horizon_days: 30, bands: { high: 0.7, medium: 0.4 } },
  sub_account: { horizon_days: 30, bands: { high: 0.7, medium: 0.4 } },
};

export function deriveCategory(tpt: number, tpv: number, prevTpt?: number, prevTpv?: number): "performing" | "declining_frequency" | "value_drop" | "critical" | "idle" {
  // Idle: No activity in current period
  if (tpt === 0 && tpv === 0) return "idle";
  
  // Calculate changes
  const tptChange = prevTpt ? ((tpt - prevTpt) / prevTpt) * 100 : 0;
  const tpvChange = prevTpv ? ((tpv - prevTpv) / prevTpv) * 100 : 0;
  
  // Critical: both metrics declining significantly
  if (tptChange < -20 && tpvChange < -20) return "critical";
  
  // Declining Frequency: TPT drops but TPV stable or growing
  if (tptChange < -10 && tpvChange >= -10) return "declining_frequency";
  
  // Value Drop: TPV drops but TPT stable or growing
  if (tpvChange < -10 && tptChange >= -10) return "value_drop";
  
  // Performing: both metrics stable or growing
  return "performing";
}

export function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function formatRupiahBio(n: number) {
  const bio = n / 1_000_000_000;
  return `Rp ${bio.toFixed(3).replace(/\.?0+$/, '')} Bio`;
}

export function getRiskCategory(tptDrop: number): "healthy" | "at_risk" | "critical" {
  if (tptDrop >= 30) return "critical";
  if (tptDrop >= 20) return "at_risk";
  return "healthy";
}

export function getPotentialCategory(tpvGrowth: number): "low" | "limited" | "moderate" | "high" {
  if (tpvGrowth >= 30) return "high";
  if (tpvGrowth >= 20) return "moderate";
  if (tpvGrowth >= 0) return "limited";
  return "low";
}

export function getRiskAction(category: "healthy" | "at_risk" | "critical"): string {
  if (category === "critical") return "Promotion";
  if (category === "at_risk") return "Engagement";
  return "Campaign";
}

export function getPotentialAction(category: "low" | "limited" | "moderate" | "high"): string {
  if (category === "high") return "Upsell";
  if (category === "moderate") return "Cross-sell";
  if (category === "limited") return "Promotion";
  return "Reactivation";
}

// ---- Small utilities for sorting ----
type SortDir = "asc" | "desc";
function sortBy<T extends Record<string, any>>(rows: T[], key: keyof T, dir: SortDir): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return dir === "asc" ? -1 : 1;
    if (vb == null) return dir === "asc" ? 1 : -1;
    if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
    const sa = String(va).toLowerCase();
    const sb = String(vb).toLowerCase();
    if (sa < sb) return dir === "asc" ? -1 : 1;
    if (sa > sb) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return copy;
}
const nextDir = (d: SortDir): SortDir => (d === "asc" ? "desc" : "asc");
const sortIndicator = (active: boolean, dir: SortDir) => (
  <span className="ml-1 inline-block text-xs align-middle">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span>
);

// --- Self-tests ---
(function selfTest() {
  try {
    console.assert(formatRupiah(150000) === "Rp\u00A0150.000");
    console.assert(formatRupiah(0) === "Rp\u00A00");
    console.assert(getRiskCategory(35) === "critical");
    console.assert(getRiskCategory(25) === "at_risk");
    console.assert(getRiskCategory(5) === "healthy");
    console.assert(getPotentialCategory(35) === "high");
    console.assert(getPotentialCategory(25) === "moderate");
    console.assert(getPotentialCategory(5) === "limited");
    console.assert(getPotentialCategory(-5) === "low");
  } catch (e) { /* noop in prod */ }
})();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Date helpers ---
function parseAnchorDate(period: string, rangeEnd: string, rangeStart: string) {
  const base = rangeEnd || rangeStart || new Date().toISOString().slice(0, 7);
  return new Date(base + "-01");
}
function formatMonthLabel(d: Date) { return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(d); }
function formatDayLabel(d: Date) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d); }
function formatQuarterLabel(d: Date) { const q = Math.floor(d.getMonth()/3)+1; return `Q${q} ${d.getFullYear()}`; }
function addMonths(d: Date, delta: number) { const nd = new Date(d); nd.setMonth(nd.getMonth()+delta); return nd; }
function addDays(d: Date, delta: number) { const nd = new Date(d); nd.setDate(nd.getDate()+delta); return nd; }
function addQuarters(d: Date, delta: number) { const nd = new Date(d); nd.setMonth(nd.getMonth()+delta*3); return nd; }
function pctChange(curr: number, prev: number) { if (!prev) return 0; return ((curr-prev)/prev)*100; }

// Helper function to map product keys to database values
function mapProductToDb(product: string): string {
  const productMap: Record<string, string> = {
    'paychat': 'PayChat',
    'waas': 'WaaS',
    'sub_account': 'Sub Account'
  };
  return productMap[product] || product;
}

async function fetchKPIMetrics({ product, pillar, rangeStart, rangeEnd, period }: any) {
  try {
    const dbPillar = pillar === "wallets_billing" ? "Wallets_Billing" : pillar;
    const dbProduct = mapProductToDb(product);
    
    console.log("=== fetchKPIMetrics DEBUG ===");
    console.log("Input params:", { product, pillar, rangeStart, rangeEnd, period });
    console.log("Mapped to DB:", { dbProduct, dbPillar });
    
    // Determine comparison period based on period type
    const endDate = rangeEnd;
    const endDateObj = new Date(endDate + "-01");
    let compareDate: string;
    let changeLabel: string;
    
    if (period === "quarter") {
      // Compare to previous quarter (3 months ago)
      compareDate = addMonths(endDateObj, -3).toISOString().slice(0, 7);
      changeLabel = "QoQ";
    } else {
      // Compare to previous month
      compareDate = addMonths(endDateObj, -1).toISOString().slice(0, 7);
      changeLabel = "MoM";
    }
    
    console.log(`KPI comparison: ${endDate} vs ${compareDate} (${changeLabel})`);
    
    // Fetch data for both periods
    const compareDateStart = compareDate + '-01';
    const nextPeriodStart = addMonths(endDateObj, 1).toISOString().slice(0, 10);
    
    console.log("Query dates:", { compareDateStart, endDate, nextPeriodStart });
    
    let query = supabase
      .from('merchant_data')
      .select('date, tpt, tpv, brand_id')
      .gte('date', compareDateStart)
      .lt('date', nextPeriodStart);
    
    if (dbProduct) query = query.eq('product_type', dbProduct);
    if (dbPillar) query = query.eq('pillar', dbPillar);
    
    const { data, error } = await query;
    if (error) throw error;
    
    console.log("Query returned rows:", data?.length);
    console.log("Filters applied:", { dbProduct: !!dbProduct, dbPillar: !!dbPillar });
    
    // Aggregate by period (endDate vs compareDate)
    let endTPT = 0, endTPV = 0;
    let compareTPT = 0, compareTPV = 0;
    let endCount = 0, compareCount = 0;
    
    data?.forEach(row => {
      const month = row.date.slice(0, 7);
      const tpt = Number(row.tpt) || 0;
      const tpv = Number(row.tpv) || 0;
      
      if (month === endDate) {
        endTPT += tpt;
        endTPV += tpv;
        endCount++;
      } else if (month === compareDate) {
        compareTPT += tpt;
        compareTPV += tpv;
        compareCount++;
      }
    });
    
    console.log("Aggregation results:");
    console.log(`  End period (${endDate}): TPT=${endTPT}, TPV=${endTPV}, rows=${endCount}`);
    console.log(`  Compare period (${compareDate}): TPT=${compareTPT}, TPV=${compareTPV}, rows=${compareCount}`);
    
    const tptChange = pctChange(endTPT, compareTPT);
    const tpvChange = pctChange(endTPV, compareTPV);
    const category = deriveCategory(endTPT, endTPV, compareTPT, compareTPV);
    
    const result = {
      tpt: Math.round(endTPT),
      tpv: Math.round(endTPV),
      tptChange,
      tpvChange,
      category,
      changeLabel
    };
    
    console.log("fetchKPIMetrics returning:", result);
    return result;
  } catch (error) {
    console.error("Error fetching KPI metrics:", error);
    return { tpt: 0, tpv: 0, tptChange: 0, tpvChange: 0, category: "idle", changeLabel: "MoM" };
  }
}

async function fetchMetricsSeries({ product, pillar, period, rangeStart, rangeEnd }: any) {
  try {
    // Map pillar from UI value to DB value
    const dbPillar = pillar === "wallets_billing" ? "Wallets_Billing" : pillar;
    // Map product from UI value to DB value
    const dbProduct = mapProductToDb(product);
    
    let query = supabase
      .from('merchant_data')
      .select('date, tpt, tpv, brand_id');
    
    // Filter by product and pillar
    if (dbProduct) query = query.eq('product_type', dbProduct);
    if (dbPillar) query = query.eq('pillar', dbPillar);
    
    // Filter by date range
    if (rangeStart) query = query.gte('date', `${rangeStart}-01`);
    if (rangeEnd) {
      const endDateObj = new Date(rangeEnd + "-01");
      const nextMonthStart = addMonths(endDateObj, 1).toISOString().slice(0, 10);
      query = query.lt('date', nextMonthStart);
    }
    
    // Apply range to get more than default 1000 rows
    query = query.range(0, 20000);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    const points = period === "quarter" ? 4 : 6;
    
    if (period === "quarter") {
      // Aggregate by quarter
      const quarterMap: Record<string, { tpt: number; tpv: number; mau: Set<string> }> = {};
      
      data?.forEach(row => {
        const date = new Date(row.date);
        const q = Math.floor(date.getMonth() / 3) + 1;
        const key = `Q${q} ${date.getFullYear()}`;
        const tptValue = Number(row.tpt) || 0;
        
        if (!quarterMap[key]) {
          quarterMap[key] = { tpt: 0, tpv: 0, mau: new Set() };
        }
        quarterMap[key].tpt += tptValue;
        quarterMap[key].tpv += Number(row.tpv) || 0;
        // Count unique brand_ids with at least one TPT
        if (tptValue > 0 && row.brand_id) quarterMap[key].mau.add(row.brand_id);
      });
      
      const series = Object.entries(quarterMap)
        .sort(([keyA], [keyB]) => {
          // Sort quarters chronologically (Q1 2024, Q2 2024, etc.)
          const [qA, yA] = keyA.split(' ');
          const [qB, yB] = keyB.split(' ');
          return yA === yB ? qA.localeCompare(qB) : yA.localeCompare(yB);
        })
        .map(([label, values]) => ({
          label,
          tpt: Math.round(values.tpt),
          tpv: Math.round(values.tpv),
          mau: values.mau.size
        }))
        .slice(-points);
      
      return { series };
    } else {
      // Aggregate by month
      const monthMap: Record<string, { tpt: number; tpv: number; mau: Set<string> }> = {};
      
      data?.forEach(row => {
        const date = new Date(row.date);
        const key = date.toISOString().slice(0, 7);
        const tptValue = Number(row.tpt) || 0;
        
        if (!monthMap[key]) {
          monthMap[key] = { tpt: 0, tpv: 0, mau: new Set() };
        }
        monthMap[key].tpt += tptValue;
        monthMap[key].tpv += Number(row.tpv) || 0;
        // Count unique brand_ids with at least one TPT
        if (tptValue > 0 && row.brand_id) monthMap[key].mau.add(row.brand_id);
      });
      
      const series = Object.entries(monthMap)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, values]) => ({
          label: formatMonthLabel(new Date(key + "-01")),
          tpt: Math.round(values.tpt),
          tpv: Math.round(values.tpv),
          mau: values.mau.size
        }))
        .slice(-points);
      
      return { series };
    }
  } catch (error) {
    console.error("Error fetching metrics series:", error);
    return { series: [] };
  }
}

async function fetchMetricsTable({ product, pillar, period, date_or_month, rangeStart, rangeEnd }: any) {
  try {
    const dbPillar = pillar === "wallets_billing" ? "Wallets_Billing" : pillar;
    const dbProduct = mapProductToDb(product);
    
    console.log("=== fetchMetricsTable DEBUG ===");
    console.log("Params:", { product, pillar, period, rangeStart, rangeEnd });
    console.log("Mapped:", { dbProduct, dbPillar });
    
    let query = supabase
      .from('merchant_data')
      .select('date, pillar, product_type, tpt, tpv');
    
    if (dbProduct) query = query.eq('product_type', dbProduct);
    if (dbPillar) query = query.eq('pillar', dbPillar);
    if (rangeStart) query = query.gte('date', `${rangeStart}-01`);
    if (rangeEnd) {
      const endDateObj = new Date(rangeEnd + "-01");
      const nextMonthStart = addMonths(endDateObj, 1).toISOString().slice(0, 10);
      query = query.lt('date', nextMonthStart);
      console.log("Date filters:", { rangeStart: `${rangeStart}-01`, rangeEnd: nextMonthStart });
    }
    
    // Apply range to get more than default 1000 rows
    query = query.range(0, 20000);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    console.log("Query returned rows:", data?.length);
    
    if (period === "quarter") {
      // Group by quarter
      const quarterMap: Record<string, { tpt: number; tpv: number; pillar: string; product: string }> = {};
      
      data?.forEach(row => {
        const date = new Date(row.date);
        const q = Math.floor(date.getMonth() / 3) + 1;
        const key = `Q${q} ${date.getFullYear()}`;
        
        if (!quarterMap[key]) {
          quarterMap[key] = {
            tpt: 0,
            tpv: 0,
            pillar: row.pillar,
            product: row.product_type
          };
        }
        quarterMap[key].tpt += Number(row.tpt) || 0;
        quarterMap[key].tpv += Number(row.tpv) || 0;
      });
      
      const sortedQuarters = Object.entries(quarterMap).sort((a, b) => a[0].localeCompare(b[0]));
      
      const rows = sortedQuarters.map(([dateLabel, values], index) => {
        // Compare to previous quarter if available
        const prevValues = index > 0 ? sortedQuarters[index - 1][1] : null;
        const category = prevValues 
          ? deriveCategory(values.tpt, values.tpv, prevValues.tpt, prevValues.tpv)
          : "performing" as const;
        
        return {
          id: `${values.product}-${values.pillar}-${dateLabel}`,
          date_or_month: dateLabel,
          pillar_name: PILLARS.find((p) => p.key === values.pillar.toLowerCase() || (p.key === "wallets_billing" && (values.pillar.toLowerCase() === "wallet_billing" || values.pillar.toLowerCase() === "wallets_billing")))?.label || values.pillar,
          product: PRODUCTS.find((p) => p.key === values.product)?.label || values.product,
          tpt: Math.round(values.tpt),
          tpv: Math.round(values.tpv),
          category
        };
      });
      
      return { rows };
    } else {
      // Group by month
      const monthMap: Record<string, { tpt: number; tpv: number; pillar: string; product: string }> = {};
      
      data?.forEach(row => {
        const key = row.date.slice(0, 7);
        
        if (!monthMap[key]) {
          monthMap[key] = {
            tpt: 0,
            tpv: 0,
            pillar: row.pillar,
            product: row.product_type
          };
        }
        monthMap[key].tpt += Number(row.tpt) || 0;
        monthMap[key].tpv += Number(row.tpv) || 0;
      });
      
      const sortedMonths = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0]));
      
      const rows = sortedMonths.map(([dateKey, values], index) => {
        // Compare to previous month if available
        const prevValues = index > 0 ? sortedMonths[index - 1][1] : null;
        const category = prevValues 
          ? deriveCategory(values.tpt, values.tpv, prevValues.tpt, prevValues.tpv)
          : "performing" as const;
        
        return {
          id: `${values.product}-${values.pillar}-${dateKey}`,
          date_or_month: dateKey,
          pillar_name: PILLARS.find((p) => p.key === values.pillar.toLowerCase() || (p.key === "wallets_billing" && (values.pillar.toLowerCase() === "wallet_billing" || values.pillar.toLowerCase() === "wallets_billing")))?.label || values.pillar,
          product: PRODUCTS.find((p) => p.key === values.product)?.label || values.product,
          tpt: Math.round(values.tpt),
          tpv: Math.round(values.tpv),
          category
        };
      });
      
      console.log("Month aggregations:", Object.entries(monthMap).map(([k, v]) => ({
        month: k,
        tpt: Math.round(v.tpt),
        tpv: Math.round(v.tpv)
      })));
      console.log("Returning rows:", rows.length);
      
      return { rows };
    }
  } catch (error) {
    console.error("Error fetching metrics table:", error);
    return { rows: [] };
  }
}

async function fetchMerchantsTable({ product, pillar, period, date_or_month, rangeStart, rangeEnd }: any) {
  try {
    const dbPillar = pillar === "wallets_billing" ? "Wallets_Billing" : pillar;
    const dbProduct = mapProductToDb(product);
    
    let query = supabase
      .from('merchant_data')
      .select('date, brand_id, merchant_name, product_type, tpt, tpv');
    
    if (dbProduct) query = query.eq('product_type', dbProduct);
    if (dbPillar) query = query.eq('pillar', dbPillar);
    if (rangeStart) query = query.gte('date', `${rangeStart}-01`);
    if (rangeEnd) {
      const endDateObj = new Date(rangeEnd + "-01");
      const nextMonthStart = addMonths(endDateObj, 1).toISOString().slice(0, 10);
      query = query.lt('date', nextMonthStart);
    }
    
    // Apply range to get more than default 1000 rows
    query = query.range(0, 20000);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Group by merchant, product, and month for period-over-period comparison
    const merchantMonthMap: Record<string, Record<string, { tpt: number; tpv: number }>> = {};
    const merchantMetaMap: Record<string, { brand_id: string; merchant_name: string; product: string }> = {};
    
    data?.forEach(row => {
      const key = `${row.brand_id}-${row.product_type}`;
      const month = row.date.slice(0, 7);
      
      if (!merchantMetaMap[key]) {
        merchantMetaMap[key] = {
          brand_id: row.brand_id,
          merchant_name: row.merchant_name,
          product: row.product_type
        };
      }
      
      if (!merchantMonthMap[key]) {
        merchantMonthMap[key] = {};
      }
      
      if (!merchantMonthMap[key][month]) {
        merchantMonthMap[key][month] = { tpt: 0, tpv: 0 };
      }
      
      merchantMonthMap[key][month].tpt += Number(row.tpt) || 0;
      merchantMonthMap[key][month].tpv += Number(row.tpv) || 0;
    });
    
    const rows = Object.entries(merchantMonthMap)
      .map(([key, months]) => {
        const sortedMonths = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
        
        // Split into two halves of the date range for period-over-period comparison
        const midPoint = Math.floor(sortedMonths.length / 2);
        
        let firstHalfTpt = 0, firstHalfTpv = 0;
        let secondHalfTpt = 0, secondHalfTpv = 0;
        
        sortedMonths.forEach(([_, values], index) => {
          if (index < midPoint) {
            firstHalfTpt += values.tpt;
            firstHalfTpv += values.tpv;
          } else {
            secondHalfTpt += values.tpt;
            secondHalfTpv += values.tpv;
          }
        });
        
        const totalTpt = firstHalfTpt + secondHalfTpt;
        const totalTpv = firstHalfTpv + secondHalfTpv;
        
        // Compare second half to first half for category
        const category = midPoint > 0
          ? deriveCategory(secondHalfTpt, secondHalfTpv, firstHalfTpt, firstHalfTpv)
          : (totalTpt === 0 && totalTpv === 0 ? "idle" as const : "performing" as const);
        
        return {
          id: key,
          brand_id: merchantMetaMap[key].brand_id,
          merchant_name: merchantMetaMap[key].merchant_name,
          product: PRODUCTS.find((p) => p.key === merchantMetaMap[key].product)?.label || merchantMetaMap[key].product,
          tpt: Math.round(totalTpt),
          tpv: Math.round(totalTpv),
          category
        };
      })
      .sort((a, b) => a.brand_id.localeCompare(b.brand_id));
    
    return { rows };
  } catch (error) {
    console.error("Error fetching merchants table:", error);
    return { rows: [] };
  }
}

async function fetchMerchantChurn({ product, pillar, rangeStart, rangeEnd }: any) {
  try {
    const dbProduct = mapProductToDb(product);
    const dbPillar = pillar === "wallets_billing" ? "Wallets_Billing" : pillar;
    
    console.log("fetchMerchantChurn - rangeStart:", rangeStart, "rangeEnd:", rangeEnd);
    
    // Use the most recent complete month as current period
    const currentMonth = rangeEnd || new Date().toISOString().slice(0, 7);
    const currentDate = new Date(currentMonth + '-01');
    
    // Previous month for comparison
    const prevDate = addMonths(currentDate, -1);
    const prevMonth = prevDate.toISOString().slice(0, 7);
    
    const currentStart = currentMonth;
    const currentEnd = currentMonth;
    const prevStart = prevMonth;
    const prevEnd = prevMonth;
    
    console.log("Comparing periods - current:", currentStart, "to", currentEnd, "vs prev:", prevStart, "to", prevEnd);
    
    // Calculate next month boundaries for proper date ranges
    const currentNextMonth = addMonths(new Date(currentEnd + '-01'), 1).toISOString().slice(0, 10);
    const prevNextMonth = addMonths(new Date(prevEnd + '-01'), 1).toISOString().slice(0, 10);
    
    // Query current period
    let currentQuery = supabase
      .from('merchant_data')
      .select('brand_id, merchant_name, tpt');
    if (dbProduct) currentQuery = currentQuery.eq('product_type', dbProduct);
    if (dbPillar) currentQuery = currentQuery.eq('pillar', dbPillar);
    currentQuery = currentQuery.gte('date', `${currentStart}-01`).lt('date', currentNextMonth);
    
    // Query previous period
    let previousQuery = supabase
      .from('merchant_data')
      .select('brand_id, merchant_name, tpt');
    if (dbProduct) previousQuery = previousQuery.eq('product_type', dbProduct);
    if (dbPillar) previousQuery = previousQuery.eq('pillar', dbPillar);
    previousQuery = previousQuery.gte('date', `${prevStart}-01`).lt('date', prevNextMonth);
    
    const [{ data: currentData }, { data: previousData }] = await Promise.all([
      currentQuery,
      previousQuery
    ]);
    
    console.log("Current data count:", currentData?.length, "Previous data count:", previousData?.length);
    
    // Aggregate by merchant
    const merchantMap = new Map<string, { brand_id: string; merchant_name: string; currentTPT: number; previousTPT: number }>();
    
    currentData?.forEach(row => {
      const key = row.brand_id;
      if (!merchantMap.has(key)) {
        merchantMap.set(key, { brand_id: row.brand_id, merchant_name: row.merchant_name, currentTPT: 0, previousTPT: 0 });
      }
      merchantMap.get(key)!.currentTPT += Number(row.tpt);
    });
    
    previousData?.forEach(row => {
      const key = row.brand_id;
      if (!merchantMap.has(key)) {
        merchantMap.set(key, { brand_id: row.brand_id, merchant_name: row.merchant_name, currentTPT: 0, previousTPT: 0 });
      }
      merchantMap.get(key)!.previousTPT += Number(row.tpt);
    });
    
    // Calculate churn risk
    const rows = Array.from(merchantMap.values())
      .filter(m => m.previousTPT > 0) // Only merchants with previous data
      .map(m => {
        const tptDrop = ((m.previousTPT - m.currentTPT) / m.previousTPT) * 100;
        const risk_category = getRiskCategory(tptDrop);
        const action = getRiskAction(risk_category);
        return {
          id: `churn-${m.brand_id}`,
          brand_id: m.brand_id,
          merchant_name: m.merchant_name,
          risk_category,
          tpt: Math.round(m.currentTPT),
          tpt_drop: Math.round(tptDrop),
          action
        };
      })
      .sort((a, b) => b.tpt_drop - a.tpt_drop); // Sort by highest drop first
    
    console.log("Merchant churn rows:", rows.length, "Total merchants:", merchantMap.size);
    
    return { rows };
  } catch (error) {
    console.error("Error fetching merchant churn:", error);
    return { rows: [] };
  }
}

async function fetchMerchantProfit({ product, pillar, rangeStart, rangeEnd }: any) {
  try {
    const dbProduct = mapProductToDb(product);
    const dbPillar = pillar === "wallets_billing" ? "Wallets_Billing" : pillar;
    
    console.log("fetchMerchantProfit - rangeStart:", rangeStart, "rangeEnd:", rangeEnd);
    
    // Use the most recent complete month as current period
    const currentMonth = rangeEnd || new Date().toISOString().slice(0, 7);
    const currentDate = new Date(currentMonth + '-01');
    
    // Previous month for comparison
    const prevDate = addMonths(currentDate, -1);
    const prevMonth = prevDate.toISOString().slice(0, 7);
    
    const currentStart = currentMonth;
    const currentEnd = currentMonth;
    const prevStart = prevMonth;
    const prevEnd = prevMonth;
    
    // Calculate next month boundaries for proper date ranges
    const currentNextMonth = addMonths(new Date(currentEnd + '-01'), 1).toISOString().slice(0, 10);
    const prevNextMonth = addMonths(new Date(prevEnd + '-01'), 1).toISOString().slice(0, 10);
    
    // Query current period
    let currentQuery = supabase
      .from('merchant_data')
      .select('brand_id, merchant_name, tpv');
    if (dbProduct) currentQuery = currentQuery.eq('product_type', dbProduct);
    if (dbPillar) currentQuery = currentQuery.eq('pillar', dbPillar);
    currentQuery = currentQuery.gte('date', `${currentStart}-01`).lt('date', currentNextMonth);
    
    // Query previous period
    let previousQuery = supabase
      .from('merchant_data')
      .select('brand_id, merchant_name, tpv');
    if (dbProduct) previousQuery = previousQuery.eq('product_type', dbProduct);
    if (dbPillar) previousQuery = previousQuery.eq('pillar', dbPillar);
    previousQuery = previousQuery.gte('date', `${prevStart}-01`).lt('date', prevNextMonth);
    
    const [{ data: currentData }, { data: previousData }] = await Promise.all([
      currentQuery,
      previousQuery
    ]);
    
    // Aggregate by merchant
    const merchantMap = new Map<string, { brand_id: string; merchant_name: string; currentTPV: number; previousTPV: number }>();
    
    currentData?.forEach(row => {
      const key = row.brand_id;
      if (!merchantMap.has(key)) {
        merchantMap.set(key, { brand_id: row.brand_id, merchant_name: row.merchant_name, currentTPV: 0, previousTPV: 0 });
      }
      merchantMap.get(key)!.currentTPV += Number(row.tpv);
    });
    
    previousData?.forEach(row => {
      const key = row.brand_id;
      if (!merchantMap.has(key)) {
        merchantMap.set(key, { brand_id: row.brand_id, merchant_name: row.merchant_name, currentTPV: 0, previousTPV: 0 });
      }
      merchantMap.get(key)!.previousTPV += Number(row.tpv);
    });
    
    // Calculate profit potential
    const rows = Array.from(merchantMap.values())
      .filter(m => m.previousTPV > 0) // Only merchants with previous data
      .map(m => {
        const tpvGrowth = ((m.currentTPV - m.previousTPV) / m.previousTPV) * 100;
        const potential_category = getPotentialCategory(tpvGrowth);
        const action = getPotentialAction(potential_category);
        return {
          id: `profit-${m.brand_id}`,
          brand_id: m.brand_id,
          merchant_name: m.merchant_name,
          potential_category,
          tpv: Math.round(m.currentTPV),
          tpv_growth: Math.round(tpvGrowth),
          action
        };
      })
      .sort((a, b) => b.tpv_growth - a.tpv_growth); // Sort by highest growth first
    
    return { rows };
  } catch (error) {
    console.error("Error fetching merchant profit:", error);
    return { rows: [] };
  }
}

function StatusBadge({ c }: { c: string }) {
  const map: any = { 
    performing: "bg-emerald-100 text-emerald-700", 
    declining_frequency: "bg-amber-100 text-amber-700", 
    value_drop: "bg-orange-100 text-orange-700",
    critical: "bg-rose-100 text-rose-700",
    idle: "bg-slate-100 text-slate-600"
  };
  const labelMap: any = {
    performing: "Performing",
    declining_frequency: "Declining Frequency",
    value_drop: "Value Drop",
    critical: "Critical",
    idle: "Idle"
  };
  return <Badge className={`rounded-xl px-3 ${map[c] || ""}`}>{labelMap[c] || c}</Badge>;
}

function RiskCategoryBadge({ category }: { category: "healthy" | "at_risk" | "critical" }) {
  const map: any = { 
    healthy: "bg-emerald-100 text-emerald-700", 
    at_risk: "bg-amber-100 text-amber-700", 
    critical: "bg-rose-100 text-rose-700" 
  };
  const labelMap: any = {
    healthy: "Healthy",
    at_risk: "At Risk",
    critical: "Critical"
  };
  return <Badge className={`rounded-xl px-3 ${map[category]}`}>{labelMap[category]}</Badge>;
}

function PotentialCategoryBadge({ category }: { category: "low" | "limited" | "moderate" | "high" }) {
  const map: any = { 
    low: "bg-slate-100 text-slate-700",
    limited: "bg-amber-100 text-amber-700", 
    moderate: "bg-blue-100 text-blue-700",
    high: "bg-emerald-100 text-emerald-700" 
  };
  const labelMap: any = {
    low: "Low",
    limited: "Limited",
    moderate: "Moderate",
    high: "High"
  };
  return <Badge className={`rounded-xl px-3 ${map[category]}`}>{labelMap[category]}</Badge>;
}

export default function PaymentsKPIDashboard() {
  const [tab, setTab] = useState("analytics");
  const [product, setProduct] = useState("paychat");
  const [period, setPeriod] = useState("month");
  const [pillar, setPillar] = useState("wallets_billing");
  // Range-only controls (single input)
  const [rangeStart, setRangeStart] = useState("2025-01");
  const [rangeEnd, setRangeEnd] = useState("2025-09");
  const [rangeInput, setRangeInput] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date("2025-01-01"),
    to: new Date("2025-09-01")
  });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [series, setSeries] = useState<any[]>([]);
  const [kpiMetrics, setKpiMetrics] = useState<any>({ tpt: 0, tpv: 0, tptChange: 0, tpvChange: 0, category: "idle", changeLabel: "MoM" });

  const [table, setTable] = useState<any[]>([]);
  const [merchantTable, setMerchantTable] = useState<any[]>([]);

  const [recoTab, setRecoTab] = useState("merchantChurn");
  const [churnRows, setChurnRows] = useState<any[]>([]);
  const [profitRows, setProfitRows] = useState<any[]>([]);

  // NEW: Sorting and filters per view
  // Churn
  const [churnSearch, setChurnSearch] = useState("");
  const [churnRisk, setChurnRisk] = useState<string>("all");
  const [churnSortKey, setChurnSortKey] = useState<string>("tpt");
  const [churnSortDir, setChurnSortDir] = useState<SortDir>("desc");
  // Merchants Data View
  const [merchantsSearch, setMerchantsSearch] = useState("");
  const [merchantsCategory, setMerchantsCategory] = useState<string>("all");
  const [merchantsSortKey, setMerchantsSortKey] = useState<string>("tpv");
  const [merchantsSortDir, setMerchantsSortDir] = useState<SortDir>("desc");
  // Product agg view
  const [aggSortKey, setAggSortKey] = useState<string>("date_or_month");
  const [aggSortDir, setAggSortDir] = useState<SortDir>("desc");
  const [aggCategory, setAggCategory] = useState<string>("all");
  // Profit view
  const [profitSearch, setProfitSearch] = useState("");
  const [profitActionCat, setProfitActionCat] = useState<string>("all");
  const [profitSortKey, setProfitSortKey] = useState<string>("tpv");
  const [profitSortDir, setProfitSortDir] = useState<SortDir>("desc");

  // Pagination state
  const [aggPage, setAggPage] = useState(1);
  const [merchantsPage, setMerchantsPage] = useState(1);
  const [churnPage, setChurnPage] = useState(1);
  const [profitPage, setProfitPage] = useState(1);
  const itemsPerPage = 10;

  const dateParam = useMemo(() => (rangeEnd || rangeStart), [rangeStart, rangeEnd]);

  useEffect(() => {
    const fmt = (s: string, e: string) => {
      if (!s && !e) return "";
      return `${s || ""}${s || e ? " - " : ""}${e || ""}`;
    };
    setRangeInput(fmt(rangeStart, rangeEnd));
  }, [rangeStart, rangeEnd, period]);

  // Update rangeStart and rangeEnd when dateRange changes
  useEffect(() => {
    if (dateRange?.from) {
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
      };
      setRangeStart(formatDate(dateRange.from));
      if (dateRange.to) {
        setRangeEnd(formatDate(dateRange.to));
      } else {
        setRangeEnd(formatDate(dateRange.from));
      }
    }
  }, [dateRange]);

  function parseRangeInput(raw: string) {
    const cleaned = raw.replace(/\s+/g, " ").trim();
    const parts = cleaned.split("-").map((p) => p.trim());
    if (parts.length < 2) return;
    const left = parts[0];
    const right = parts.slice(1).join("-").trim();
    const monthRe = /^\d{4}-\d{2}$/;
    const ok = monthRe.test(left) && monthRe.test(right);
    if (!ok) return;
    setRangeStart(left);
    setRangeEnd(right);
  }

  const loadAll = async () => {
    setLoading(true);
    try {
      console.log("Loading with rangeEnd:", rangeEnd, "product:", product, "pillar:", pillar);
      const [kpiData, { series }, tableRes, merchantRes] = await Promise.all([
        fetchKPIMetrics({ product, pillar, rangeStart, rangeEnd, period }),
        fetchMetricsSeries({ product, pillar, period, rangeStart, rangeEnd }),
        fetchMetricsTable({ product, pillar, period, date_or_month: dateParam, rangeStart, rangeEnd }),
        fetchMerchantsTable({ product, pillar, period, date_or_month: dateParam, rangeStart, rangeEnd }),
      ]);
      console.log("KPI Data received:", kpiData);
      setKpiMetrics(kpiData);
      setSeries(series);
      setTable(tableRes.rows);
      setMerchantTable(merchantRes.rows);
    } finally {
      setLoading(false);
    }
  };

  const loadMerchantRecos = async () => {
    const [ch, pr] = await Promise.all([
      fetchMerchantChurn({ product, pillar, rangeStart, rangeEnd }),
      fetchMerchantProfit({ product, pillar, rangeStart, rangeEnd }),
    ]);
    setChurnRows(ch.rows);
    setProfitRows(pr.rows);
  };

  const handleImportData = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      
      setImporting(true);
      try {
        const csvContent = await file.text();
        const { importCheckoutData } = await import("@/lib/importCheckoutData");
        const result = await importCheckoutData(csvContent);
        console.log("Import result:", result);
        alert(`Successfully imported ${result.imported} records!`);
        // Reload data after import
        await loadAll();
      } catch (error) {
        console.error("Import error:", error);
        alert("Failed to import data. Check console for details.");
      } finally {
        setImporting(false);
      }
    };
    
    input.click();
  };

  const handleImportFromFile = async () => {
    const confirmed = window.confirm(
      'This will import data from import.csv with automatic deduplication. Continue?'
    );
    
    if (!confirmed) return;
    
    setImporting(true);
    try {
      // Fetch CSV content from public folder
      const response = await fetch('/data/import.csv');
      const csvContent = await response.text();
      
      console.log('Calling backend import function...');
      
      // Call backend edge function to import with clearExisting=false (append mode)
      const { data, error } = await supabase.functions.invoke('import-data', {
        body: { csvContent, clearExisting: false }
      });
      
      if (error) throw error;
      
      console.log("Import result:", data);
      alert(`Successfully imported ${data.imported} unique records! (Skipped ${data.duplicatesSkipped} duplicates)`);
      await loadAll();
      await loadMerchantRecos();
    } catch (error) {
      console.error("Import error:", error);
      alert("Failed to import data. Check console for details.");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => { loadAll(); }, [product, pillar, period, dateParam]);
  useEffect(() => { if (tab === "reco") loadMerchantRecos(); }, [tab, product, pillar, rangeStart, rangeEnd]);

  // Derived views
  const sortedAggBase = useMemo(() => sortBy(table, aggSortKey as any, aggSortDir), [table, aggSortKey, aggSortDir]);
  const filteredAgg = useMemo(() => (aggCategory === "all" ? sortedAggBase : sortedAggBase.filter((r) => r.category === aggCategory)), [sortedAggBase, aggCategory]);

  const filteredMerchants = useMemo(() => {
    const q = merchantsSearch.toLowerCase();
    let rows = merchantTable.filter((r) => {
      const nameOk = r.merchant_name.toLowerCase().includes(q) || (r.brand_id || "").toLowerCase().includes(q);
      const catOk = merchantsCategory === "all" || r.category === merchantsCategory;
      return nameOk && catOk;
    });
    rows = sortBy(rows, merchantsSortKey as any, merchantsSortDir);
    return rows;
  }, [merchantTable, merchantsSearch, merchantsCategory, merchantsSortKey, merchantsSortDir]);

  const filteredChurn = useMemo(() => {
    const q = churnSearch.toLowerCase();
    const rows = churnRows.filter((r) => {
      const nameOk = !q || r.merchant_name.toLowerCase().includes(q) || (r.brand_id || "").toLowerCase().includes(q);
      const riskOk = churnRisk === "all" || r.risk_category === churnRisk;
      return nameOk && riskOk;
    });
    return sortBy(rows as any, churnSortKey as any, churnSortDir);
  }, [churnRows, churnSearch, churnRisk, churnSortKey, churnSortDir]);

  const filteredProfit = useMemo(() => {
    const q = profitSearch.toLowerCase();
    const filtered = profitRows.filter((r) => {
      const nameOk = r.merchant_name.toLowerCase().includes(q) || (r.brand_id || "").toLowerCase().includes(q);
      const catOk = profitActionCat === "all" || r.potential_category === profitActionCat;
      return nameOk && catOk;
    });
    return sortBy(filtered as any, profitSortKey as any, profitSortDir);
  }, [profitRows, profitSearch, profitActionCat, profitSortKey, profitSortDir]);

  // Pagination logic
  const paginatedAgg = useMemo(() => {
    const start = (aggPage - 1) * itemsPerPage;
    return filteredAgg.slice(start, start + itemsPerPage);
  }, [filteredAgg, aggPage]);

  const paginatedMerchants = useMemo(() => {
    const start = (merchantsPage - 1) * itemsPerPage;
    return filteredMerchants.slice(start, start + itemsPerPage);
  }, [filteredMerchants, merchantsPage]);

  const paginatedChurn = useMemo(() => {
    const start = (churnPage - 1) * itemsPerPage;
    return filteredChurn.slice(start, start + itemsPerPage);
  }, [filteredChurn, churnPage]);

  const paginatedProfit = useMemo(() => {
    const start = (profitPage - 1) * itemsPerPage;
    return filteredProfit.slice(start, start + itemsPerPage);
  }, [filteredProfit, profitPage]);

  // Total pages
  const aggTotalPages = Math.ceil(filteredAgg.length / itemsPerPage);
  const merchantsTotalPages = Math.ceil(filteredMerchants.length / itemsPerPage);
  const churnTotalPages = Math.ceil(filteredChurn.length / itemsPerPage);
  const profitTotalPages = Math.ceil(filteredProfit.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => { setAggPage(1); }, [filteredAgg.length]);
  useEffect(() => { setMerchantsPage(1); }, [filteredMerchants.length]);
  useEffect(() => { setChurnPage(1); }, [filteredChurn.length]);
  useEffect(() => { setProfitPage(1); }, [filteredProfit.length]);

  // Sort togglers
  const toggleAggSort = (key: string) => { if (aggSortKey === key) setAggSortDir(nextDir(aggSortDir)); else { setAggSortKey(key); setAggSortDir("asc"); } };
  const toggleMerchantsSort = (key: string) => { if (merchantsSortKey === key) setMerchantsSortDir(nextDir(merchantsSortDir)); else { setMerchantsSortKey(key); setMerchantsSortDir("asc"); } };
  const toggleChurnSort = (key: string) => { if (churnSortKey === key) setChurnSortDir(nextDir(churnSortDir)); else { setChurnSortKey(key); setChurnSortDir("asc"); } };
  const toggleProfitSort = (key: string) => { if (profitSortKey === key) setProfitSortDir(nextDir(profitSortDir)); else { setProfitSortKey(key); setProfitSortDir("asc"); } };

  return (
    <div className="min-h-screen w-full bg-background p-6 lg:p-8">
      {/* Hero Header with Gradient */}
      <div className="mb-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-accent p-8 shadow-lg">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE4YzAtMy4zMTQgMi42ODYtNiA2LTZzNiAyLjY4NiA2IDYtMi42ODYgNi02IDYtNi0yLjY4Ni02LTZ6TTAgMThjMC0zLjMxNCAyLjY4Ni02IDYtNnM2IDIuNjg2IDYgNi0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-xl bg-white/20 p-2 backdrop-blur-sm">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <h1 className="text-4xl font-bold text-white tracking-tight">S.M.I.R.E :)</h1>
              </div>
              <p className="text-white/90 text-lg font-medium">From data overload to instant insight.</p>
            </div>
            
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 border-none shadow-sm">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Filters</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Select value={pillar} onValueChange={(v) => { const meta = PILLARS.find((p) => p.key === v); if (meta?.soon) return; setPillar(v); }}>
          <SelectTrigger> <SelectValue placeholder="Pillar" /> </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PILLARS.map((p) => (<SelectItem key={p.key} value={p.key} disabled={p.soon}>{p.label}{p.soon ? " (soon)" : ""}</SelectItem>))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger> <SelectValue placeholder="Product" /> </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PRODUCTS.map((p) => (<SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger> <SelectValue placeholder="Period" /> </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PERIODS.map((p) => (<SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Date Range Picker */}
        <div className="col-span-2">
          <DateRangePicker
            date={dateRange}
            onDateChange={setDateRange}
          />
        </div>

            <Button className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all shadow-md" onClick={loadAll}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card className="border-none shadow-md hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">TPT</div>
            </div>
            {(()=>{ const pc = kpiMetrics.tptChange; const color = pc>0?"text-emerald-600":pc<0?"text-rose-600":"text-slate-700"; return (
              <div className="space-y-1">
                <div className="text-3xl font-bold text-foreground">{(kpiMetrics.tpt).toLocaleString("id-ID")}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${color}`}>{pc>0?"+":""}{pc.toFixed(1)}%</span>
                  <span className="text-xs text-muted-foreground">{kpiMetrics.changeLabel || "MoM"}</span>
                </div>
              </div>
            ); })()}
          </CardContent>
        </Card>
        <Card className="border-none shadow-md hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg bg-accent/10 p-2">
                <BarChart3 className="h-4 w-4 text-accent" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">TPV</div>
            </div>
            {(()=>{ const pc = kpiMetrics.tpvChange; const color = pc>0?"text-emerald-600":pc<0?"text-rose-600":"text-slate-700"; return (
              <div className="space-y-1">
                <div className="text-3xl font-bold text-foreground">{formatRupiah(kpiMetrics.tpv)}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${color}`}>{pc>0?"+":""}{pc.toFixed(1)}%</span>
                  <span className="text-xs text-muted-foreground">{kpiMetrics.changeLabel || "MoM"}</span>
                </div>
              </div>
            ); })()}
          </CardContent>
        </Card>
        <Card className="border-none shadow-md hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Status</div>
            </div>
            {(()=>{ 
              const colorMap: any = { 
                performing: "text-emerald-600", 
                declining_frequency: "text-amber-600", 
                value_drop: "text-orange-600",
                critical: "text-rose-600",
                idle: "text-slate-600"
              };
              const color = colorMap[kpiMetrics.category] || "text-foreground";
              return (
                <div className={`text-3xl font-bold capitalize ${color}`}>
                  {kpiMetrics.category.replace(/_/g, ' ')}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* OUTER TABS */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 grid w-full grid-cols-3 p-1 bg-card shadow-sm rounded-xl">
          <TabsTrigger value="analytics" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-accent data-[state=active]:text-white rounded-lg transition-all"><BarChart3 className="h-4 w-4" /> Analytics</TabsTrigger>
          <TabsTrigger value="table" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-accent data-[state=active]:text-white rounded-lg transition-all"><TableIcon className="h-4 w-4" /> Data View</TabsTrigger>
          <TabsTrigger value="reco" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-accent data-[state=active]:text-white rounded-lg transition-all"><Sparkles className="h-4 w-4" /> Recommendations</TabsTrigger>
        </TabsList>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-none shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-1.5">
                    <BarChart3 className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">TPT over time</h3>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
                      <defs>
                        <linearGradient id="colorTpt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="label" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickFormatter={(value) => value.toLocaleString('id-ID')}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                        formatter={(value: any) => [value.toLocaleString('id-ID'), 'TPT']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="tpt" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        fill="url(#colorTpt)"
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-accent/10 p-1.5">
                    <BarChart3 className="h-4 w-4 text-accent" />
                  </div>
                  <h3 className="font-semibold text-foreground">TPV over time</h3>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
                      <defs>
                        <linearGradient id="colorTpv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="label" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12}
                        tickFormatter={(v) => formatRupiahBio(v)} 
                      />
                      <Tooltip 
                        formatter={(v: any) => [formatRupiah(v), 'TPV']} 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }} 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="tpv" 
                        stroke="hsl(var(--accent))" 
                        strokeWidth={3}
                        fill="url(#colorTpv)"
                        dot={{ fill: 'hsl(var(--accent))', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-none shadow-md">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                    <Users className="h-4 w-4 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-foreground">Monthly Active Users</h3>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}> 
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Legend />
                      <Bar dataKey="mau" name="Active Users" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TABLE TAB */}
        <TabsContent value="table">
          <Tabs defaultValue="agg">
            <TabsList className="mb-4 grid w-full grid-cols-2 bg-card shadow-sm rounded-lg p-1">
              <TabsTrigger value="agg" className="rounded-md data-[state=active]:text-primary">Product</TabsTrigger>
              <TabsTrigger value="merchants" className="rounded-md data-[state=active]:text-primary">Merchants per Product</TabsTrigger>
            </TabsList>

            {/* Product aggregation table */}
            <TabsContent value="agg">
              <Card className="border-none shadow-md">
                <CardContent className="p-0">
                  {/* Product Category Filter */}
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-end bg-gradient-to-r from-slate-50 to-slate-100/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Product Category:</span>
                      <Select value={aggCategory} onValueChange={setAggCategory}>
                        <SelectTrigger className="w-48 opacity-60"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="performing">Performing</SelectItem>
                          <SelectItem value="declining_frequency">Declining Frequency</SelectItem>
                          <SelectItem value="value_drop">Value Drop</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="idle">Idle</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleAggSort("date_or_month")}>{period === "quarter" ? "Quarter" : "Month"}{sortIndicator(aggSortKey==="date_or_month", aggSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleAggSort("pillar_name")}>Pillar{sortIndicator(aggSortKey==="pillar_name", aggSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleAggSort("product")}>Product{sortIndicator(aggSortKey==="product", aggSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleAggSort("tpt")}>TPT{sortIndicator(aggSortKey==="tpt", aggSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleAggSort("tpv")}>TPV{sortIndicator(aggSortKey==="tpv", aggSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleAggSort("category")}>Product Category{sortIndicator(aggSortKey==="category", aggSortDir)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAgg.map((r) => (
                          <tr key={r.id} className="border-t hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium">{r.date_or_month}</td>
                            <td className="px-4 py-2">{r.pillar_name}</td>
                            <td className="px-4 py-2">{r.product}</td>
                            <td className="px-4 py-2">{r.tpt.toLocaleString("id-ID")}</td>
                            <td className="px-4 py-2">{formatRupiah(r.tpv)}</td>
                            <td className="px-4 py-2"><StatusBadge c={r.category} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-xs text-slate-500">
                      Showing {filteredAgg.length > 0 ? (aggPage - 1) * itemsPerPage + 1 : 0}-{Math.min(aggPage * itemsPerPage, filteredAgg.length)} of {filteredAgg.length} records
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAggPage(p => Math.max(1, p - 1))}
                        disabled={aggPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-600">
                        Page {aggPage} of {aggTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAggPage(p => Math.min(aggTotalPages, p + 1))}
                        disabled={aggPage === aggTotalPages || aggTotalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Merchants table */}
            <TabsContent value="merchants">
              <Card className="border-none shadow-md">
                <CardContent className="p-0">
                  {/* Controls: search + category filter */}
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between bg-gradient-to-r from-slate-50 to-slate-100/50">
                    <Input
                      placeholder="Search merchant name or brand id…"
                      value={merchantsSearch}
                      onChange={(e) => setMerchantsSearch(e.target.value)}
                      className="md:max-w-sm shadow-sm border-slate-200 focus:border-primary focus:ring-primary"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Merchant Category:</span>
                      <Select value={merchantsCategory} onValueChange={setMerchantsCategory}>
                        <SelectTrigger className="w-48 opacity-60"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="performing">Performing</SelectItem>
                          <SelectItem value="declining_frequency">Declining Frequency</SelectItem>
                          <SelectItem value="value_drop">Value Drop</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleMerchantsSort("brand_id")}>Brand ID{sortIndicator(merchantsSortKey==="brand_id", merchantsSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleMerchantsSort("merchant_name")}>Merchant{sortIndicator(merchantsSortKey==="merchant_name", merchantsSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleMerchantsSort("product")}>Product{sortIndicator(merchantsSortKey==="product", merchantsSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleMerchantsSort("tpt")}>TPT{sortIndicator(merchantsSortKey==="tpt", merchantsSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleMerchantsSort("tpv")}>TPV{sortIndicator(merchantsSortKey==="tpv", merchantsSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleMerchantsSort("category")}>Merchant Category{sortIndicator(merchantsSortKey==="category", merchantsSortDir)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedMerchants.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-4 py-2 font-mono text-xs">{r.brand_id}</td>
                            <td className="px-4 py-2 font-medium">{r.merchant_name}</td>
                            <td className="px-4 py-2">{r.product}</td>
                            <td className="px-4 py-2">{r.tpt.toLocaleString("id-ID")}</td>
                            <td className="px-4 py-2">{formatRupiah(r.tpv)}</td>
                            <td className="px-4 py-2"><StatusBadge c={r.category} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-xs text-slate-500">
                      Showing {filteredMerchants.length > 0 ? (merchantsPage - 1) * itemsPerPage + 1 : 0}-{Math.min(merchantsPage * itemsPerPage, filteredMerchants.length)} of {filteredMerchants.length} records
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMerchantsPage(p => Math.max(1, p - 1))}
                        disabled={merchantsPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-600">
                        Page {merchantsPage} of {merchantsTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMerchantsPage(p => Math.min(merchantsTotalPages, p + 1))}
                        disabled={merchantsPage === merchantsTotalPages || merchantsTotalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* RECOMMENDATIONS TAB */}
        <TabsContent value="reco">
          <Tabs value={recoTab} onValueChange={setRecoTab}>
            <TabsList className="mb-4 grid w-full grid-cols-2 bg-card shadow-sm rounded-lg p-1">
              <TabsTrigger value="merchantChurn" className="gap-2 rounded-md data-[state=active]:text-primary"><Users className="h-4 w-4" /> Merchant · Churn</TabsTrigger>
              <TabsTrigger value="merchantProfit" className="gap-2 rounded-md data-[state=active]:text-primary"><Users className="h-4 w-4" /> Merchant · Profit</TabsTrigger>
            </TabsList>

            {/* Merchant churn */}
            <TabsContent value="merchantChurn">
              <Card className="border-none shadow-md">
                <CardContent className="p-0">
                  {/* Controls: search by merchant name & filter by risk */}
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between bg-gradient-to-r from-slate-50 to-slate-100/50">
                    <Input
                      placeholder="Search merchant name or brand id…"
                      value={churnSearch}
                      onChange={(e) => setChurnSearch(e.target.value)}
                      className="md:max-w-sm shadow-sm border-slate-200 focus:border-primary focus:ring-primary"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Risk Category:</span>
                      <Select value={churnRisk} onValueChange={setChurnRisk}>
                        <SelectTrigger className="w-40 opacity-60">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="healthy">Healthy</SelectItem>
                          <SelectItem value="at_risk">At Risk</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleChurnSort("brand_id")}>Brand ID{sortIndicator(churnSortKey==="brand_id", churnSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleChurnSort("merchant_name")}>Merchant{sortIndicator(churnSortKey==="merchant_name", churnSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleChurnSort("risk_category")}>Risk Category{sortIndicator(churnSortKey==="risk_category", churnSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleChurnSort("tpt")}>TPT{sortIndicator(churnSortKey==="tpt", churnSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleChurnSort("action")}>Recommendation Action{sortIndicator(churnSortKey==="action", churnSortDir)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedChurn.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-4 py-2 font-mono text-xs">{r.brand_id}</td>
                            <td className="px-4 py-2 font-medium">{r.merchant_name}</td>
                            <td className="px-4 py-2"><RiskCategoryBadge category={r.risk_category} /></td>
                            <td className="px-4 py-2">{r.tpt.toLocaleString("id-ID")}</td>
                            <td className="px-4 py-2">{r.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-xs text-slate-500">
                      Showing {filteredChurn.length > 0 ? (churnPage - 1) * itemsPerPage + 1 : 0}-{Math.min(churnPage * itemsPerPage, filteredChurn.length)} of {filteredChurn.length} records
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChurnPage(p => Math.max(1, p - 1))}
                        disabled={churnPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-600">
                        Page {churnPage} of {churnTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChurnPage(p => Math.min(churnTotalPages, p + 1))}
                        disabled={churnPage === churnTotalPages || churnTotalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Merchant profit */}
            <TabsContent value="merchantProfit">
              <Card className="border-none shadow-md">
                <CardContent className="p-0">
                  {/* Controls: search by merchant & filter by potential category */}
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between bg-gradient-to-r from-slate-50 to-slate-100/50">
                    <Input
                      placeholder="Search merchant name or brand id…"
                      value={profitSearch}
                      onChange={(e) => setProfitSearch(e.target.value)}
                      className="md:max-w-sm shadow-sm border-slate-200 focus:border-primary focus:ring-primary"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Potential Category:</span>
                      <Select value={profitActionCat} onValueChange={setProfitActionCat}>
                        <SelectTrigger className="w-44 opacity-60"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="limited">Limited</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleProfitSort("brand_id")}>Brand ID{sortIndicator(profitSortKey==="brand_id", profitSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleProfitSort("merchant_name")}>Merchant{sortIndicator(profitSortKey==="merchant_name", profitSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleProfitSort("potential_category")}>Potential Category{sortIndicator(profitSortKey==="potential_category", profitSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleProfitSort("tpv")}>TPV{sortIndicator(profitSortKey==="tpv", profitSortDir)}</th>
                          <th className="px-4 py-3 cursor-pointer select-none" onClick={() => toggleProfitSort("action")}>Recommendation Action{sortIndicator(profitSortKey==="action", profitSortDir)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedProfit.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-4 py-2 font-mono text-xs">{r.brand_id}</td>
                            <td className="px-4 py-2 font-medium">{r.merchant_name}</td>
                            <td className="px-4 py-2"><PotentialCategoryBadge category={r.potential_category} /></td>
                            <td className="px-4 py-2">{formatRupiah(r.tpv)}</td>
                            <td className="px-4 py-2">{r.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-xs text-slate-500">
                      Showing {filteredProfit.length > 0 ? (profitPage - 1) * itemsPerPage + 1 : 0}-{Math.min(profitPage * itemsPerPage, filteredProfit.length)} of {filteredProfit.length} records
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProfitPage(p => Math.max(1, p - 1))}
                        disabled={profitPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-600">
                        Page {profitPage} of {profitTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProfitPage(p => Math.min(profitTotalPages, p + 1))}
                        disabled={profitPage === profitTotalPages || profitTotalPages === 0}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {loading && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-white/50">
          <div className="animate-pulse rounded-xl bg-white px-4 py-2 text-slate-700 shadow">Loading…</div>
        </div>
      )}
    </div>
  );
}
