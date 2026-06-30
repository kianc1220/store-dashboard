import { useState, useCallback, useRef, useMemo, useEffect, useSyncExternalStore } from 'react'
import Papa from 'papaparse'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, ReferenceDot,
} from 'recharts'

const OUTLET_NAMES = {
  '1UEC': '1UEC',
  'AIOI': 'IOI Azure',
  'GP':   'Gurney Plaza',
  'HQ':   'HQ',
  'IOI':  'IOI City Mall',
  'KKI':  'Imago KK',
  'KLCC': 'KLCC',
  'LYP':  'Low Yat Plaza',
  'OU':   '1 Utama',
  'PBJ':  'Pavilion Bukit Jalil',
  'PDM':  'Paradigm Mall',
  'PV':   'Pavilion KL',
  'QBM':  'Queensbay Mall',
  'SVC':  'Vivacity',
  'SW':   'Sunway Pyramid',
  'TG':   'The Gardens',
}
const outletLabel = code => {
  if (!code) return ''
  if (code.includes('/') || code.length > 12) return 'All Outlets'
  return OUTLET_NAMES[code] || code
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const BLUE = '#2563eb'
const GREEN = '#059669'
const ORANGE = '#d97706'
const RED = '#dc2626'
const PURPLE = '#7c3aed'
const STORE_B_COLOR = '#7c3aed'
const COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#ea580c']

const T = {
  BG: '#f4f6fb',
  CARD: '#ffffff',
  BORDER: 'rgba(0,0,0,0.07)',
  BORDER_STRONG: 'rgba(0,0,0,0.14)',
  TEXT: '#111827',
  MUTED: '#6b7280',
  GRID: 'rgba(0,0,0,0.05)',
  NAV: 'rgba(244,246,251,0.95)',
  TOOLTIP_BG: '#1f2937',
  META_BG: '#eff6ff',
  META_BORDER: '#bfdbfe',
  META_TEXT: '#1d4ed8',
  SECTION: '#9ca3af',
}

function useWindowWidth() {
  return useSyncExternalStore(
    cb => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) },
    () => window.innerWidth
  )
}

function fmtMYR(n) {
  const abs = Math.abs(n)
  return (n < 0 ? '-' : '') + 'RM' + abs.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtMYRAbbr(n) {
  if (n >= 1000000) return 'RM' + (n / 1000000).toFixed(2) + 'M'
  if (n >= 1000) return 'RM' + (n / 1000).toFixed(1) + 'k'
  return 'RM' + Math.round(n).toLocaleString()
}
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return Math.round(n).toLocaleString()
}
function fmtHour(h) {
  if (h === 0) return '12am'
  if (h < 12) return h + 'am'
  if (h === 12) return '12pm'
  return (h - 12) + 'pm'
}
function fmtMonth(key) {
  if (!key) return '—'
  const [y, m] = key.split('-')
  return new Date(y, m - 1).toLocaleString('default', { month: 'short', year: '2-digit' })
}
function seedRandom(d, h) {
  const x = Math.sin(d * 13 + h * 7 + 42) * 10000
  return x - Math.floor(x)
}

const PTYPE_COLORS = { Drone: '#2563eb', Handheld: '#059669', 'Home/Power': '#d97706', Others: '#94a3b8' }
const PTYPES = ['Drone', 'Handheld', 'Home/Power', 'Others']

function classifyProductType(product, category) {
  const cat = (category || '').toUpperCase()
  const p = (product || '').toUpperCase()

  // Home/Power: power stations + ROMO robot vacuums
  if (/\bPOWER\b|\bROMO\b|\bSMART HOME\b|\bDOORBELL\b/.test(p)) return 'Home/Power'

  // DJI Care Refresh warranties: classify by the covered product, not as generic accessory
  if (/\bCARE\s+REFRESH\b/.test(p)) {
    if (/\bOSMO\b|\bPOCKET\b|\bMIC\b|\bMOBILE\b|\bLAVALIER\b|\bRONIN\b/.test(p)) return 'Handheld'
    if (/\bMAVIC\b|\bMINI\b|\bAVATA\b|\bNEO\b|\bFLIP\b|\bLITO\b|\bFPV\b|\bAIR\b/.test(p)) return 'Drone'
    return 'Others'
  }

  // All other accessories and third-party brands → Others
  if (cat.includes('ACCESSORIES') || cat === 'MEMORYCARD' || cat === 'MEMORY CARD' || cat === 'BRAND') return 'Others'

  // Handheld FIRST — catches "Mic Mini 2" via MIC and "RS 4 Mini" via RS before MINI hits Drone
  if (/\bOSMO\b|\bRS\s*[C2-9]\b|\bRONIN\b|\bPOCKET\b|\bMIC\b|\bMOBILE\b|\bLAVALIER\b/.test(p)) return 'Handheld'

  // Drone: flying platforms
  if (/\bMAVIC\b|\bMINI\b|\bPHANTOM\b|\bAVATA\b|\bFPV\b|\bAGRAS\b|\bNEO\b|\bFLIP\b|\bLITO\b/.test(p) ||
      /\bDJI\s+AIR\b|\bAIR\s+\d/.test(p)) return 'Drone'

  return 'Others'
}

function generateDemoData(seed = 0) {
  const rows = []
  const categories = ['DJI PRODUCT', 'DJI ACCESSORIES', 'REPAIR', 'TRADE-IN']
  const products = ['DJI Mini 5 Pro', 'Osmo Pocket 4', 'DJI Neo 2', 'Osmo Action 5', 'DJI RC2', 'ND Filter Set', 'Carrying Bag']
  const salesmen = ['QBM-KC', 'QBM-ARIF', 'QBM-Desmond', 'QBM-KHAIRUL', 'QBM-WAYNE']
  const payments = ['Visa', 'Master', 'Bank Transfer', 'ATOME', 'Debit', 'Payment X']
  const brands = ['DJI', 'Other']
  const genders = ['Male', 'Female']
  const ages = ['Below 20', '20-29', '30-39', '40-49', '50 & Above']
  const now = new Date('2026-06-20')
  for (let i = 89; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dow = date.getDay()
    const isWeekend = dow === 0 || dow === 6
    const base = seed === 0 ? 7 : 5
    const count = Math.round((isWeekend ? base * 1.7 : base) * (0.7 + seedRandom(i + seed, 0) * 0.6))
    for (let o = 0; o < count; o++) {
      const hour = Math.floor(seedRandom(i + seed, o) * 14) + 9
      const cat = categories[Math.floor(seedRandom(i + seed, o + 1) * categories.length)]
      const prod = products[Math.floor(seedRandom(i + seed, o + 2) * products.length)]
      const sp = Math.round((seed === 0 ? 200 : 150) + seedRandom(i + seed, o + 3) * 4800)
      const rsp = Math.round(sp * (1 + seedRandom(i + seed, o + 4) * 0.15))
      const disc = seedRandom(i + seed, o + 5) > 0.7 ? Math.round(sp * 0.05) : 0
      rows.push({
        date: date.toISOString().split('T')[0], hour,
        category: cat, product: prod, orders: 1,
        revenue: sp - disc, rsp, discount: disc,
        payment: payments[Math.floor(seedRandom(i + seed, o + 6) * payments.length)],
        salesman: salesmen[Math.floor(seedRandom(i + seed, o + 7) * salesmen.length)],
        brand: brands[Math.floor(seedRandom(i + seed, o + 8) * brands.length)],
        gender: genders[Math.floor(seedRandom(i + seed, o + 9) * genders.length)],
        age_group: ages[Math.floor(seedRandom(i + seed, o + 10) * ages.length)],
      })
    }
  }
  const outlet = seed === 0 ? 'DEMO STORE A' : 'DEMO STORE B'
  return { rows, meta: { outlet, period: 'Last 90 days', generated: new Date().toISOString().split('T')[0] } }
}

const DATE_RE = /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/

function parsePOSFile(raw) {
  const meta = {}
  let headerIdx = -1
  let isSellThrough = false

  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const cell = (raw[i][0] || '').trim()
    if (cell.startsWith('Generated On')) meta.generated = cell.replace(/^Generated On\s*:?\s*/, '').trim()
    if (/^Report Time [Pp]eriod/.test(cell)) meta.period = cell.replace(/^Report Time [Pp]eriod\s*:?\s*/, '').trim()
    if (/^Outlets?\s*:/.test(cell)) {
      let o = cell.replace(/^Outlets?\s*:?\s*/, '').trim()
      // Strip company suffix e.g. " - AZURE TELECOMMUNICATION SDN BHD (1312920-W)"
      o = o.replace(/\s*-\s*AZURE\s+TELECOMMUNICATION.*$/i, '').trim()
      meta.outlet = o
    }
    if (cell.startsWith('Total Transactions')) meta.totalTx = cell.replace('Total Transactions :', '').trim()
    if (cell.startsWith('Total Sales')) meta.kassieTotal = parseFloat(cell.replace(/^Total Sales\s*:\s*\(MYR\)/, '').trim()) || null
    if (cell === 'Date') { headerIdx = i; break }
    if (cell === 'Product Code') { headerIdx = i; isSellThrough = true; break }
  }

  if (headerIdx === -1) return null
  const headers = raw[headerIdx]

  if (isSellThrough) {
    // Product Sell Through format — one row per product, no Date column.
    // Extract period start date to use as synthetic transaction date.
    const periodMatch = meta.period?.match(/(\d{4}-\d{2}-\d{2})/)
    const syntheticDate = periodMatch ? periodMatch[1] : new Date().toISOString().split('T')[0]

    const dataRows = raw.slice(headerIdx + 1)
      .filter(r => r[0] && r[0].trim() && r[1] && r[1].trim()) // must have Product Code + Name
      .map(r => {
        const obj = {}
        headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim() })
        return obj
      })
      .map(r => {
        const cat = r['Category'] || ''
        // Normalise to the Category Description values normalizeRow expects
        const categoryDesc = cat === 'PRODUCT' ? 'DJI PRODUCT'
          : cat === 'ACCESSORIES' ? 'DJI ACCESSORIES'
          : cat === 'MEMORYCARD' ? 'MEMORY CARD'
          : cat

        return {
          'Date': syntheticDate,
          'Product Description': r['Product Name'],
          'Category Description': categoryDesc,
          'Brand': r['Brand'] || r['Product Brand L2'] || '',
          'Net Sales(MYR)': r['Sales(MYR)'] || r['Net Sales Without Tax(MYR)'] || '0',
          'Selling Price(MYR)': r['Retail Price(MYR)'] || '0',
          'Discount Amount(MYR)': r['Discount Amount'] || '0',
          'RSP(MYR)': r['Retail Price(MYR)'] || '0',
          'Qty': r['Total Quantity Sold'] || r['QBM'] || '1',
          'Salesman': '',
          'Payment Modes': 'Unknown',
          'Customer Type': 'Unknown',
          'Customer Gender': 'Unknown',
          'Customer Age Group': 'Unknown',
        }
      })
    return { headers, dataRows, meta, isSellThrough: true }
  }

  // Standard transaction-level CSV
  const dataRows = raw.slice(headerIdx + 1)
    .filter(r => r[0] && DATE_RE.test(r[0]))
    .map(r => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim() })
      return obj
    })
  return { headers, dataRows, meta, isSellThrough: false }
}

function normalizeRow(r) {
  if (r['Date'] && DATE_RE.test(r['Date'])) {
    const [datePart, timePart] = r['Date'].split(' ')
    let isoDate
    if (datePart.includes('/')) {
      const [dd, mm, yyyy] = datePart.split('/')
      isoDate = `${yyyy}-${mm}-${dd}`
    } else {
      isoDate = datePart
    }
    const hour = timePart ? parseInt(timePart.split(':')[0]) : 12
    const qty = parseFloat(r['Qty']) || 1
    const sp = parseFloat(r['Selling Price(MYR)']) || 0
    // RSP = original list price before any discount
    const rsp = parseFloat(r['RSP At Creation(MYR)']) || parseFloat(r['RSP(MYR)']) || Math.abs(sp)
    const disc = parseFloat(r['Discount Amount(MYR)']) || 0
    // Revenue = Net Sales after discount. Try explicit net field first, then Sub Total, then compute.
    const sub = parseFloat(r['Net Sales(MYR)']) || parseFloat(r['Sub Total(MYR)']) || parseFloat(r['Total(MYR)']) || ((sp - disc) * qty)
    const isReturn = sub < 0
    return {
      date: isoDate, hour: isNaN(hour) ? 12 : hour,
      orders: isReturn ? -(parseFloat(r['Qty']) || 1) : (parseFloat(r['Qty']) || 1),
      revenue: sub, isReturn, rsp, discount: disc,
      category: r['Category Description'] || r['Product Category 1'] || 'Other',
      product: r['Product Description'] || 'Unknown',
      payment: (r['Payment Modes'] || 'Unknown').replace(/^Payment\s*X$/i, 'DPay'),
      salesman: r['Salesman'] || 'Unknown',
      brand: r['Brand'] || 'Other',
      gender: r['Customer Gender'] || 'Unknown',
      age_group: r['Customer Age Group'] || 'Unknown',
      outlet: r['Outlet Code'] || r['Outlet Name'] || r['Branch Code'] || r['Branch'] || '',
      invoice_no: r['Invoice No.'] || r['Invoice No'] || '',
    }
  }
  return {
    date: r.date || '', hour: parseInt(r.hour) || 0,
    orders: parseFloat(r.orders) || 1, revenue: parseFloat(r.revenue) || 0,
    rsp: parseFloat(r.rsp) || 0, discount: parseFloat(r.discount) || 0,
    category: r.category || 'Other', product: r.product || 'Unknown',
    payment: r.payment || 'Unknown', salesman: r.salesman || 'Unknown',
    brand: r.brand || 'Other', gender: r.gender || 'Unknown',
    age_group: r.age_group || 'Unknown', invoice_no: r.invoice_no || '',
  }
}

function processData(rows, meta = {}, dateRange = null, outletFilter = null) {
  const allNormalized = rows.map(normalizeRow).filter(r => r.date)

  // Collect available outlets
  const outletSet = new Set()
  allNormalized.forEach(r => { if (r.outlet) outletSet.add(r.outlet) })
  const availableOutlets = [...outletSet].sort()

  // Filter by outlet if set
  let normalized = allNormalized
  if (outletFilter) {
    normalized = allNormalized.filter(r => r.outlet === outletFilter)
  }

  // Filter by exact date range when set
  if (dateRange?.start && dateRange?.end) {
    normalized = normalized.filter(r => r.date >= dateRange.start && r.date <= dateRange.end)
  }

  const revenueByDate = {}, ordersByDate = {}, revenueByMonth = {}, ordersByMonth = {}
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0))
  const invoicesByDow = Array(7).fill(0)
  const seenInvoices = new Set()
  const categoryRev = {}, productRev = {}, productOrders = {}, productUnitsSold = {}
  const productTypeRev = {}, productTypeOrders = {}, productTypeItemsMap = {}
  const salesmanRev = {}, salesmanOrders = {}, salesmanProducts = {}
  const salesmanTxCount = {}, salesmanReturnCount = {}, salesmanReturnRev = {}
  const productTxCount = {}, productReturnCount = {}, productReturnRev = {}
  const paymentRev = {}, paymentCount = {}
  const brandRev = {}, brandOrders = {}
  const genderCount = {}, ageOrders = {}
  let totalDiscount = 0, totalRSP = 0, totalRevenue = 0, totalOrders = 0
  let grossRevenue = 0, returnRevenue = 0, returnCount = 0

  normalized.forEach(r => {
    const { date, hour, orders, revenue, discount, rsp, category, product, payment, salesman, brand, gender, age_group, isReturn } = r
    const d = new Date(date)
    let dow = isNaN(d.getTime()) ? 0 : (d.getDay() + 6) % 7
    dow = Math.max(0, Math.min(6, dow))

    revenueByDate[date] = (revenueByDate[date] || 0) + revenue
    ordersByDate[date] = (ordersByDate[date] || 0) + orders
    const monthKey = date.slice(0, 7)
    revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + revenue
    if (!isReturn) ordersByMonth[monthKey] = (ordersByMonth[monthKey] || 0) + Math.abs(orders)
    if (hour >= 0 && hour < 24) heatmap[dow][hour] += Math.abs(orders)

    categoryRev[category] = (categoryRev[category] || 0) + revenue
    productRev[product] = (productRev[product] || 0) + revenue
    productOrders[product] = (productOrders[product] || 0) + orders
    if (!isReturn) productUnitsSold[product] = (productUnitsSold[product] || 0) + Math.abs(orders)
    const pType = classifyProductType(product, category)
    productTypeRev[pType] = (productTypeRev[pType] || 0) + revenue
    productTypeOrders[pType] = (productTypeOrders[pType] || 0) + Math.abs(orders)
    if (!productTypeItemsMap[pType]) productTypeItemsMap[pType] = {}
    productTypeItemsMap[pType][product] = (productTypeItemsMap[pType][product] || 0) + revenue
    if (!isReturn && r.invoice_no && !seenInvoices.has(r.invoice_no)) {
      seenInvoices.add(r.invoice_no); invoicesByDow[dow]++
    }
    salesmanRev[salesman] = (salesmanRev[salesman] || 0) + revenue
    salesmanOrders[salesman] = (salesmanOrders[salesman] || 0) + orders
    if (!isReturn) {
      if (!salesmanProducts[salesman]) salesmanProducts[salesman] = {}
      salesmanProducts[salesman][product] = (salesmanProducts[salesman][product] || 0) + Math.abs(orders)
    }
    if (!isReturn) {
      paymentRev[payment] = (paymentRev[payment] || 0) + revenue
      paymentCount[payment] = (paymentCount[payment] || 0) + orders
    }
    brandRev[brand] = (brandRev[brand] || 0) + revenue
    brandOrders[brand] = (brandOrders[brand] || 0) + orders
    genderCount[gender] = (genderCount[gender] || 0) + 1
    ageOrders[age_group] = (ageOrders[age_group] || 0) + Math.abs(orders)
    if (!isReturn) totalDiscount += discount
    if (!isReturn) totalRSP += rsp * Math.abs(orders)
    totalRevenue += revenue
    totalOrders += Math.abs(orders)

    // Return tracking per product and salesman
    productTxCount[product] = (productTxCount[product] || 0) + 1
    salesmanTxCount[salesman] = (salesmanTxCount[salesman] || 0) + 1
    if (isReturn) {
      returnRevenue += Math.abs(revenue); returnCount++
      productReturnCount[product] = (productReturnCount[product] || 0) + 1
      productReturnRev[product] = (productReturnRev[product] || 0) + Math.abs(revenue)
      salesmanReturnCount[salesman] = (salesmanReturnCount[salesman] || 0) + 1
      salesmanReturnRev[salesman] = (salesmanReturnRev[salesman] || 0) + Math.abs(revenue)
    } else grossRevenue += revenue
  })

  const sortedDates = Object.keys(revenueByDate).sort()
  const trend = sortedDates.map(d => ({
    date: d.slice(5),
    fullDate: d,
    revenue: Math.round(revenueByDate[d]),
    orders: Math.round(ordersByDate[d] || 0),
  }))

  const months = Object.keys(revenueByMonth).sort()
  const momCurrentLabel = months[months.length - 1] || ''
  const momPrevLabel = months[months.length - 2] || ''
  const momCurrent = revenueByMonth[momCurrentLabel] || 0
  const momPrev = revenueByMonth[momPrevLabel] || 0
  const momChange = momPrev > 0 ? ((momCurrent - momPrev) / momPrev) * 100 : 0
  const monthlyBreakdown = months.slice(-6).map(m => ({
    label: fmtMonth(m), key: m, revenue: Math.round(revenueByMonth[m] || 0), orders: ordersByMonth[m] || 0,
  }))

  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const half = Math.floor(trend.length / 2)
  const prevRev = trend.slice(0, half).reduce((a, b) => a + b.revenue, 0)
  const currRev = trend.slice(half).reduce((a, b) => a + b.revenue, 0)
  const growth = prevRev > 0 ? ((currRev - prevRev) / prevRev) * 100 : 0
  const rspGap = totalRSP - totalRevenue
  const returnRate = (totalOrders + returnCount) > 0 ? returnCount / (totalOrders + returnCount) * 100 : 0

  const categories = Object.entries(categoryRev).sort((a, b) => b[1] - a[1]).map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }))
  const productTypes = PTYPES
    .map(name => ({ name, revenue: Math.round(productTypeRev[name] || 0), orders: productTypeOrders[name] || 0 }))
    .filter(p => p.revenue > 0)
  const topProducts = Object.entries(productRev).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, revenue]) => ({ name, revenue: Math.round(revenue), orders: productOrders[name] || 0 }))
  const allProducts = Object.entries(productUnitsSold).sort((a, b) => b[1] - a[1]).map(([name, units]) => ({ name, units, revenue: Math.round(productRev[name] || 0) }))
  const salesmen = Object.entries(salesmanRev).sort((a, b) => b[1] - a[1]).map(([name, revenue]) => {
    const rc = salesmanReturnCount[name] || 0
    const tx = salesmanTxCount[name] || 0
    return {
      name, revenue: Math.round(revenue), orders: salesmanOrders[name] || 0,
      products: Object.entries(salesmanProducts[name] || {}).sort((a, b) => b[1] - a[1]).map(([product, units]) => ({ product, units })),
      returnCount: rc, returnRevenue: Math.round(salesmanReturnRev[name] || 0),
      returnRate: tx > 0 ? Math.round((rc / tx) * 100) : 0,
      forwardSales: tx - rc,
    }
  })
  const topReturnedProducts = Object.entries(productReturnCount)
    .map(([name, rc]) => {
      const tx = productTxCount[name] || rc
      return { name, returnCount: rc, returnRevenue: Math.round(productReturnRev[name] || 0), returnRate: Math.round((rc / tx) * 100) }
    })
    .sort((a, b) => b.returnCount - a.returnCount)
    .slice(0, 8)
  const payments = Object.entries(paymentRev).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, revenue]) => ({ name, revenue: Math.round(revenue), count: paymentCount[name] || 0 }))
  const brands = Object.entries(brandRev).sort((a, b) => b[1] - a[1]).map(([name, revenue]) => ({ name, revenue: Math.round(revenue), orders: brandOrders[name] || 0 }))
  const genders = Object.entries(genderCount).map(([name, value]) => ({ name, value }))
  const ageGroups = Object.entries(ageOrders)
    .sort((a, b) => {
      const order = ['Below 20', '20-29', '30-39', '40-49', '50 & Above']
      return order.indexOf(a[0]) - order.indexOf(b[0])
    })
    .map(([name, value]) => ({ name, value }))
  const dowTotals = heatmap.map((row, d) => ({ day: DAYS[d], value: row.reduce((a, b) => a + b, 0) }))
  const invoiceDowTotals = DAYS.map((day, i) => ({ day, value: invoicesByDow[i] }))
  const productTypeItems = {}
  for (const [pType, items] of Object.entries(productTypeItemsMap)) {
    productTypeItems[pType] = Object.entries(items).sort((a, b) => b[1] - a[1]).map(([name, rev]) => ({ name, revenue: Math.round(rev) }))
  }

  // Peak hour+day: single busiest heatmap cell
  let peakVal = 0, peakD = 0, peakH = 0
  heatmap.forEach((row, d) => row.forEach((v, h) => {
    if (v > peakVal) { peakVal = v; peakD = d; peakH = h }
  }))

  // Busiest day: independently from total orders per day of week
  const busiestDay = heatmap
    .map((row, d) => ({ d, total: row.reduce((a, b) => a + b, 0) }))
    .reduce((best, cur) => cur.total > best.total ? cur : best, { d: 0, total: 0 }).d

  // Slowest active slot: minimum during store hours (10am–10pm, matching 10:30am–10:30pm opening)
  let slowVal = Infinity, slowD = 0, slowH = 10
  heatmap.forEach((row, d) => {
    for (let h = 10; h <= 22; h++) {
      if (row[h] < slowVal) { slowVal = row[h]; slowD = d; slowH = h }
    }
  })

  const weekdayTotal = heatmap.slice(0, 5).flat().reduce((a, b) => a + b, 0) / 5
  const weekendTotal = heatmap.slice(5).flat().reduce((a, b) => a + b, 0) / 2
  const weekendRatio = weekdayTotal > 0 ? (weekendTotal / weekdayTotal).toFixed(1) : '—'

  return {
    trend, totalRevenue, totalOrders, aov, growth, totalDiscount, rspGap,
    categories, productTypes, topProducts, allProducts, salesmen, payments, brands, genders, ageGroups,
    heatmap, dowTotals, invoiceDowTotals, peakHour: peakH, peakDay: peakD, slowHour: slowH, slowDay: slowD,
    weekendRatio, busiestDay, meta, grossRevenue, returnRevenue, returnCount, returnRate,
    momCurrent, momPrev, momChange, momCurrentLabel, momPrevLabel, monthlyBreakdown,
    topReturnedProducts, totalRSP, availableOutlets, productTypeItems, availableMonths: months,
  }
}

function exportCSV(data, fileName) {
  const rows = [
    ['StoreDash Export — ' + (data.meta?.outlet || 'Store')],
    [],
    ['SUMMARY'],
    ['Metric', 'Value'],
    ['Gross Revenue (MYR)', data.grossRevenue.toFixed(2)],
    ['Return Revenue (MYR)', data.returnRevenue.toFixed(2)],
    ['Net Revenue (MYR)', data.totalRevenue.toFixed(2)],
    ['Total Sales', data.totalOrders],
    ['Return Count', data.returnCount],
    ['Return Rate %', data.returnRate.toFixed(2)],
    ['Avg Order Value (MYR)', data.aov.toFixed(2)],
    ['Total Discount (MYR)', data.totalDiscount.toFixed(2)],
    ['RSP Gap (MYR)', data.rspGap.toFixed(2)],
    [],
    ['TOP PRODUCTS'],
    ['Product', 'Revenue (MYR)', 'Sales'],
    ...data.topProducts.map(p => [p.name, p.revenue, p.orders]),
    [],
    ['SALESMEN'],
    ['Salesman', 'Revenue (MYR)', 'Sales'],
    ...data.salesmen.map(s => [s.name, s.revenue, s.orders]),
    [],
    ['CATEGORIES'],
    ['Category', 'Revenue (MYR)'],
    ...data.categories.map(c => [c.name, c.revenue]),
    [],
    ['PAYMENT METHODS'],
    ['Payment', 'Revenue (MYR)', 'Count'],
    ...data.payments.map(p => [p.name, p.revenue, p.count]),
    [],
    ['MONTHLY BREAKDOWN'],
    ['Month', 'Revenue (MYR)'],
    ...data.monthlyBreakdown.map(m => [m.key, m.revenue]),
    [],
    ['DAILY TREND'],
    ['Date', 'Revenue (MYR)', 'Sales'],
    ...data.trend.map(t => [t.fullDate, t.revenue, t.orders]),
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (fileName?.replace('.csv', '') || 'storedash') + '_export.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function exportPDF(data, compareData, nameA, nameB, periodLabel) {
  const fmtR = n => 'RM' + Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtN = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString()
  const genDate = new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })

  const css = `
    @page { size: A4; margin: 14mm 16mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 10pt; line-height: 1.45; background: #fff; }

    /* ── Page header (repeats on every page) ── */
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 6mm; border-bottom: 2.5pt solid #2563eb; margin-bottom: 6mm; }
    .brand { font-size: 17pt; font-weight: 800; color: #2563eb; letter-spacing: -0.02em; }
    .brand span { font-size: 10pt; font-weight: 400; color: #6b7280; margin-left: 8px; }
    .store-pill { font-size: 9pt; font-weight: 600; padding: 3px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 5px; }
    .pill-a { background: #eff6ff; color: #2563eb; border: 1pt solid #bfdbfe; }
    .pill-b { background: #f5f3ff; color: #7c3aed; border: 1pt solid #ddd6fe; }
    .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

    /* ── Section heading ── */
    .section { margin-top: 6mm; }
    .section-title { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: #9ca3af; border-bottom: 0.75pt solid #e5e7eb; padding-bottom: 2mm; margin-bottom: 3.5mm; }

    /* ── KPI grid ── */
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-bottom: 4mm; }
    .kpi { border: 0.75pt solid #e5e7eb; border-radius: 5pt; padding: 3mm 4mm; background: #fafafa; }
    .kpi-label { font-size: 7.5pt; color: #6b7280; margin-bottom: 2px; }
    .kpi-value { font-size: 14pt; font-weight: 700; line-height: 1.2; }
    .kpi-delta { font-size: 7.5pt; color: #9ca3af; margin-top: 2px; }

    /* ── Two-column layout ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
    .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    thead tr { background: #f4f6fb; }
    th { padding: 2.5mm 3mm; text-align: left; font-size: 8pt; font-weight: 700; color: #374151; border-bottom: 1.5pt solid #e5e7eb; white-space: nowrap; }
    td { padding: 2mm 3mm; border-bottom: 0.5pt solid #f1f5f9; vertical-align: top; }
    tbody tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .bold { font-weight: 700; }
    .blue { color: #2563eb; }
    .purple { color: #7c3aed; }
    .green { color: #059669; }
    .red { color: #dc2626; }
    .amber { color: #d97706; }
    .muted { color: #6b7280; }

    /* ── Delta badge ── */
    .badge { display: inline-block; padding: 1px 5px; border-radius: 10px; font-size: 7.5pt; font-weight: 700; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-red { background: #fef2f2; color: #dc2626; }

    /* ── Page break ── */
    .page-break { page-break-before: always; padding-top: 0; }

    /* ── Footer ── */
    .footer { margin-top: 8mm; padding-top: 3mm; border-top: 0.5pt solid #e5e7eb; display: flex; justify-content: space-between; font-size: 7.5pt; color: #9ca3af; }

    /* ── Store divider ── */
    .store-divider { border-left: 3pt solid; padding-left: 4mm; margin: 5mm 0 3mm; }
    .divider-a { border-color: #2563eb; }
    .divider-b { border-color: #7c3aed; }
    .divider-title { font-size: 12pt; font-weight: 700; }
    .divider-sub { font-size: 8.5pt; color: #6b7280; margin-top: 2px; }
  `

  const kpiGrid = (d, color) => [
    ['Net Revenue', fmtR(d.totalRevenue), color, `${d.growth >= 0 ? '+' : ''}${d.growth.toFixed(1)}% period trend`],
    ['Gross Revenue', fmtR(d.grossRevenue), '#111827', 'before returns'],
    ['Return Revenue', fmtR(d.returnRevenue), '#dc2626', `${d.returnCount} transactions`],
    ['Total Sales', fmtN(d.totalOrders), '#111827', 'units sold'],
    ['Return Rate', d.returnRate.toFixed(1) + '%', d.returnRate < 5 ? '#059669' : '#dc2626', d.returnRate < 5 ? 'Healthy' : 'Monitor'],
    ['Avg Order Value', fmtR(d.aov), '#111827', 'per transaction'],
    ['Total Discount', fmtR(d.totalDiscount), '#d97706', `${d.totalRevenue > 0 ? ((d.totalDiscount / (d.totalRevenue + d.totalDiscount)) * 100).toFixed(1) : 0}% of gross`],
    ['RSP Gap', fmtR(d.rspGap), '#dc2626', 'below RSP'],
    ['MoM Change', (d.momChange >= 0 ? '+' : '') + d.momChange.toFixed(1) + '%', d.momChange >= 0 ? '#059669' : '#dc2626', `${d.momPrevLabel ? d.momPrevLabel + ' → ' + d.momCurrentLabel : 'current month'}`],
  ].map(([lbl, val, c, delta]) =>
    `<div class="kpi"><div class="kpi-label">${lbl}</div><div class="kpi-value" style="color:${c}">${val}</div><div class="kpi-delta">${delta}</div></div>`
  ).join('')

  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s

  const salesTable = (d, color) =>
    `<table><thead><tr><th>#</th><th>Salesman</th><th class="num">Revenue</th><th class="num">Sales</th><th class="num">Return%</th></tr></thead><tbody>
    ${d.salesmen.map((s, i) => `<tr><td class="muted">${i + 1}</td><td class="${i === 0 ? 'bold' : ''}">${s.name}</td><td class="num ${i === 0 ? 'bold' : ''}" style="color:${i === 0 ? color : '#111827'}">${fmtR(s.revenue)}</td><td class="num muted">${fmtN(s.orders)}</td><td class="num ${s.returnRate >= 15 ? 'red' : 'muted'}">${s.returnRate}%</td></tr>`).join('')}
    </tbody></table>`

  const prodTable = (d) =>
    `<table><thead><tr><th>#</th><th>Product</th><th class="num">Revenue</th><th class="num">Sales</th></tr></thead><tbody>
    ${d.topProducts.slice(0, 10).map((p, i) => `<tr><td class="muted">${i + 1}</td><td>${trunc(p.name, 42)}</td><td class="num">${fmtR(p.revenue)}</td><td class="num muted">${fmtN(p.orders)}</td></tr>`).join('')}
    </tbody></table>`

  const payTable = (d) =>
    `<table><thead><tr><th>Method</th><th class="num">Revenue</th><th class="num">Sales</th></tr></thead><tbody>
    ${d.payments.map(p => `<tr><td>${p.name}</td><td class="num">${fmtR(p.revenue)}</td><td class="num muted">${fmtN(p.count)}</td></tr>`).join('')}
    </tbody></table>`

  const monthTable = (d) =>
    `<table><thead><tr><th>Month</th><th class="num">Revenue</th><th class="num">Sales</th></tr></thead><tbody>
    ${d.monthlyBreakdown.map(m => {
      const isCurrent = m.key === d.momCurrentLabel
      return `<tr><td${isCurrent ? ' class="bold"' : ''}>${m.label}${isCurrent ? ' ✦' : ''}</td><td class="num${isCurrent ? ' bold blue' : ''}">${fmtR(m.revenue)}</td><td class="num muted">${fmtN(m.orders || 0)}</td></tr>`
    }).join('')}
    </tbody></table>`

  const ptypeTable = (d, color) => {
    const rows = d.productTypes.map(pt => {
      const pct = d.totalRevenue > 0 ? (pt.revenue / d.totalRevenue * 100).toFixed(1) : '0'
      return `<tr><td style="color:${color}">${pt.name}</td><td class="num bold" style="color:${color}">${fmtR(pt.revenue)}</td><td class="num muted">${fmtN(pt.orders)} sales</td><td class="num muted">${pct}%</td></tr>`
    }).join('')
    return rows ? `<table><thead><tr><th>Product Type</th><th class="num">Revenue</th><th class="num">Sales</th><th class="num">Share</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="color:#9ca3af;font-size:8pt">No product type data</p>'
  }

  const pageHeader = () => `
    <div class="page-header">
      <div>
        <div class="brand">StoreDash <span>Sales Report</span></div>
        <div style="font-size:8.5pt;color:#6b7280;margin-top:3px">Period: <strong>${periodLabel}</strong> · Generated: ${genDate}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="store-pill pill-a"><span class="dot" style="background:#2563eb"></span>${nameA}</span>
        ${compareData ? `<span style="font-size:9pt;color:#9ca3af">vs</span><span class="store-pill pill-b"><span class="dot" style="background:#7c3aed"></span>${nameB}</span>` : ''}
      </div>
    </div>`

  const footer = (page, total) => `
    <div class="footer">
      <span>StoreDash · Confidential</span>
      <span>Page ${page} of ${total}</span>
    </div>`

  const totalPages = compareData ? 4 : 2

  // Page 1: KPIs + Summary
  const page1 = `
    ${pageHeader()}
    <div class="store-divider divider-a">
      <div class="divider-title" style="color:#2563eb">${nameA}</div>
      <div class="divider-sub">${data.meta?.outlet || ''} · ${data.meta?.period || periodLabel}</div>
    </div>
    <div class="section">
      <div class="section-title">Performance Summary</div>
      <div class="kpi-grid">${kpiGrid(data, '#2563eb')}</div>
    </div>
    <div class="section" style="margin-top:4mm">
      <div class="section-title">Product Type Breakdown</div>
      ${ptypeTable(data, '#2563eb')}
    </div>
    <div class="two-col" style="margin-top:4mm">
      <div class="section">
        <div class="section-title">Monthly Breakdown</div>
        ${monthTable(data)}
      </div>
      <div class="section">
        <div class="section-title">Payment Methods</div>
        ${payTable(data)}
      </div>
    </div>
    ${footer(1, totalPages)}`

  // Page 2: Staff + Products
  const page2 = `
    <div class="page-break">
    ${pageHeader()}
    <div class="store-divider divider-a">
      <div class="divider-title" style="color:#2563eb">${nameA}</div>
    </div>
    <div class="section" style="margin-top:4mm">
      <div class="section-title">Salesman Performance</div>
      ${salesTable(data, '#2563eb')}
    </div>
    <div class="section" style="margin-top:5mm">
      <div class="section-title">Top Products</div>
      ${prodTable(data)}
    </div>
    ${footer(2, totalPages)}
    </div>`

  // Page 3 (compare only): Store B KPIs + Monthly + Payments
  const page3 = compareData ? `
    <div class="page-break">
    ${pageHeader()}
    <div class="store-divider divider-b">
      <div class="divider-title" style="color:#7c3aed">${nameB}</div>
      <div class="divider-sub">${compareData.meta?.outlet || ''} · ${compareData.meta?.period || periodLabel}</div>
    </div>
    <div class="section">
      <div class="section-title">Performance Summary</div>
      <div class="kpi-grid">${kpiGrid(compareData, '#7c3aed')}</div>
    </div>
    <div class="section" style="margin-top:4mm">
      <div class="section-title">Product Type Breakdown</div>
      ${ptypeTable(compareData, '#7c3aed')}
    </div>
    <div class="two-col" style="margin-top:4mm">
      <div class="section">
        <div class="section-title">Monthly Breakdown</div>
        ${monthTable(compareData)}
      </div>
      <div class="section">
        <div class="section-title">Payment Methods</div>
        ${payTable(compareData)}
      </div>
    </div>
    ${footer(3, totalPages)}
    </div>` : ''

  // Page 4 (compare only): Store B Staff + Products + Comparison table
  const page4 = compareData ? (() => {
    const metrics = [
      ['Net Revenue', data.totalRevenue, compareData.totalRevenue, fmtR],
      ['Gross Revenue', data.grossRevenue, compareData.grossRevenue, fmtR],
      ['Return Revenue', data.returnRevenue, compareData.returnRevenue, fmtR],
      ['Total Sales', data.totalOrders, compareData.totalOrders, fmtN],
      ['Avg Order Value', data.aov, compareData.aov, fmtR],
      ['Return Rate (%)', data.returnRate, compareData.returnRate, v => v.toFixed(1) + '%'],
      ['Total Discount', data.totalDiscount, compareData.totalDiscount, fmtR],
      ['RSP Gap', data.rspGap, compareData.rspGap, fmtR],
      ['MoM Change (%)', data.momChange, compareData.momChange, v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'],
    ]
    const compRows = metrics.map(([lbl, a, b, fmt]) => {
      const delta = b !== 0 ? ((a - b) / Math.abs(b)) * 100 : 0
      const cls = delta >= 0 ? 'badge-green' : 'badge-red'
      return `<tr><td>${lbl}</td><td class="num blue bold">${fmt(a)}</td><td class="num purple bold">${fmt(b)}</td><td class="num"><span class="badge ${cls}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%</span></td></tr>`
    }).join('')
    return `
    <div class="page-break">
    ${pageHeader()}
    <div class="store-divider divider-b">
      <div class="divider-title" style="color:#7c3aed">${nameB}</div>
    </div>
    <div class="section" style="margin-top:4mm">
      <div class="section-title">Salesman Performance</div>
      ${salesTable(compareData, '#7c3aed')}
    </div>
    <div class="section" style="margin-top:5mm">
      <div class="section-title">Top Products</div>
      ${prodTable(compareData)}
    </div>
    <div class="section" style="margin-top:6mm">
      <div class="section-title">Side-by-side Comparison — ${nameA} vs ${nameB}</div>
      <table>
        <thead><tr><th>Metric</th><th class="num" style="color:#2563eb">${nameA}</th><th class="num" style="color:#7c3aed">${nameB}</th><th class="num">A vs B</th></tr></thead>
        <tbody>${compRows}</tbody>
      </table>
    </div>
    ${footer(4, totalPages)}
    </div>`
  })() : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>StoreDash Report — ${nameA}${compareData ? ' vs ' + nameB : ''} — ${genDate}</title>
<style>${css}</style>
</head>
<body>
${page1}
${page2}
${page3}
${page4}
</body>
</html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 600)
}

const TT = { background: T.TOOLTIP_BG, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#f9fafb', fontSize: 12, padding: '8px 12px' }
const TC = false // disable hover cursor rectangle on bar charts
const TS = { itemStyle: { color: '#f9fafb' }, labelStyle: { color: '#d1d5db' } }

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_LABELS = ['M','T','W','T','F','S','S']

function MiniCalendar({ trend }) {
  if (!trend || trend.length === 0) return null

  const byDate = {}
  trend.forEach(d => { if (d.fullDate) byDate[d.fullDate] = d.revenue })

  const months = [...new Set(trend.filter(d => d.fullDate).map(d => d.fullDate.slice(0, 7)))]
  if (!months.length) return null
  const targetMonth = months[months.length - 1]
  const [year, month] = targetMonth.split('-').map(Number)

  const maxRev = Math.max(...trend.map(d => d.revenue), 1)
  const peakDay = trend.reduce((best, d) => d.revenue > (best?.revenue ?? 0) ? d : best, null)

  const daysInMonth = new Date(year, month, 0).getDate()
  let startDow = new Date(year, month - 1, 1).getDay()
  startDow = startDow === 0 ? 6 : startDow - 1

  const today = new Date()
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const todayNum = today.getDate()

  const cells = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={{ flexShrink: 0, width: 164, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: BLUE, letterSpacing: '0.06em' }}>{MONTH_NAMES[month - 1].toUpperCase()}</span>
        <span style={{ fontSize: 10, color: T.MUTED }}>{year}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {DOW_LABELS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: T.MUTED, paddingBottom: 3 }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const rev = byDate[dateStr] || 0
          const isPeak = dateStr === peakDay?.fullDate
          const isToday = isThisMonth && d === todayNum
          const intensity = rev > 0 ? 0.12 + (rev / maxRev) * 0.75 : 0
          return (
            <div key={i} title={rev > 0 ? `${dateStr}: RM${Math.round(rev).toLocaleString()}` : dateStr} style={{
              width: '100%', aspectRatio: '1', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: isPeak || isToday ? 800 : 500,
              background: isPeak ? BLUE : isToday ? '#fee2e2' : rev > 0 ? `rgba(37,99,235,${intensity})` : 'transparent',
              color: isPeak ? '#fff' : isToday ? '#dc2626' : rev > 0 ? (intensity > 0.5 ? '#1d4ed8' : T.MUTED) : T.MUTED,
              cursor: 'default',
              outline: isToday && !isPeak ? '1.5px solid #fca5a5' : 'none',
            }}>{d}</div>
          )
        })}
      </div>
      {peakDay && (
        <div style={{ marginTop: 8, fontSize: 9, color: T.MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: BLUE, flexShrink: 0 }} />
          Peak: {peakDay.date} · RM{Math.round(peakDay.revenue).toLocaleString()}
        </div>
      )}
    </div>
  )
}

function KPI({ icon, label, value, delta, color, small }) {
  return (
    <div className="sd-kpi" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 12, padding: small ? '0.75rem 1rem' : '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <p style={{ fontSize: 11, color: T.MUTED, margin: '0 0 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{icon} {label}</p>
      <p style={{ fontSize: small ? 16 : String(value).length > 11 ? 14 : String(value).length > 8 ? 17 : 20, fontWeight: 700, margin: 0, color: T.TEXT, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden' }}>{value}</p>
      {delta && <p style={{ fontSize: 11, margin: '4px 0 0', color: color || T.MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{delta}</p>}
    </div>
  )
}

function Card({ title, children, style, action }) {
  return (
    <div className="sd-card" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', minWidth: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T.MUTED, margin: 0, flexShrink: 0 }}>{title}</p>
          <div style={{ fontSize: 11, color: T.MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{action}</div>
        </div>
      )}
      {children}
    </div>
  )
}

function fmtDateLabel(d) {
  if (!d) return ''
  const [y, m, dd] = d.split('-')
  return `${dd}-${MONTHS_SHORT[parseInt(m) - 1]}-${y}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatRangeLabel(dateRange) {
  if (!dateRange) return 'All time'
  return `${fmtDateLabel(dateRange.start)} – ${fmtDateLabel(dateRange.end)}`
}

// Compact "2026-06-01 00:00:00 - 2026-06-30 23:59:59" → "01-Jun-2026 – 30-Jun-2026"
function formatPeriodMeta(str) {
  if (!str) return str
  const dates = str.match(/\d{4}-\d{2}-\d{2}/g)
  if (dates?.length >= 2) return `${fmtDateLabel(dates[0])} – ${fmtDateLabel(dates[1])}`
  if (dates?.length === 1) return fmtDateLabel(dates[0])
  return str
}

function DateRangePicker({ value, onChange, onClose, isMobile }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const initDate = value?.start ? new Date(value.start) : new Date()
  const [viewYear, setViewYear] = useState(initDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initDate.getMonth())
  const [selStart, setSelStart] = useState(value?.start ?? null)
  const [selEnd, setSelEnd] = useState(value?.end ?? null)
  const [picking, setPicking] = useState(false)
  const [hover, setHover] = useState(null)

  const presets = [
    { label: 'Today', fn: () => ({ start: todayStr, end: todayStr }) },
    { label: 'Yesterday', fn: () => { const y = addDays(todayStr, -1); return { start: y, end: y } } },
    { label: 'Last 7 Days', fn: () => ({ start: addDays(todayStr, -6), end: todayStr }) },
    { label: 'This Month', fn: () => {
      const d = new Date()
      return { start: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, end: todayStr }
    }},
    { label: 'Last 3 Months', fn: () => ({ start: addDays(todayStr, -89), end: todayStr }) },
    { label: 'Last 6 Months', fn: () => ({ start: addDays(todayStr, -179), end: todayStr }) },
    { label: 'Last 9 Months', fn: () => ({ start: addDays(todayStr, -269), end: todayStr }) },
    { label: 'Last 2 Years', fn: () => ({ start: addDays(todayStr, -729), end: todayStr }) },
    { label: 'All time', fn: () => null },
  ]

  const applyPreset = (fn) => {
    const r = fn()
    if (!r) { setSelStart(null); setSelEnd(null); setPicking(false); return }
    setSelStart(r.start); setSelEnd(r.end); setPicking(false)
    const d = new Date(r.start); setViewYear(d.getFullYear()); setViewMonth(d.getMonth())
  }

  const handleDayClick = (dateStr) => {
    if (!picking) { setSelStart(dateStr); setSelEnd(null); setPicking(true) }
    else {
      const [s, e] = dateStr < selStart ? [dateStr, selStart] : [selStart, dateStr]
      setSelStart(s); setSelEnd(e); setPicking(false); setHover(null)
    }
  }

  const isPresetActive = (fn) => {
    const r = fn()
    return r ? r.start === selStart && r.end === selEnd : !selStart && !selEnd
  }

  const rightMonth = (viewMonth + 1) % 12
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear

  const renderCal = (year, month) => {
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++)
      cells.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)

    const effEnd = picking ? (hover || null) : selEnd
    const rS = selStart && effEnd ? (selStart <= effEnd ? selStart : effEnd) : null
    const rE = selStart && effEnd ? (selStart <= effEnd ? effEnd : selStart) : null
    const single = selStart === rE

    // Build rows of 7
    const rows = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    while (rows.length > 0 && rows[rows.length - 1].every(c => !c)) rows.pop()

    const cellSize = isMobile ? 'calc((100vw - 48px) / 7)' : '32px'
    return (
      <div style={{ minWidth: isMobile ? 0 : 224 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cellSize})`, gap: 0 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', padding: '0 0 8px', fontWeight: 600, letterSpacing: '0.04em' }}>{d}</div>
          ))}
          {rows.flat().map((dateStr, i) => {
            if (!dateStr) return <div key={i} style={{ height: 34 }} />
            const isS = dateStr === rS
            const isE = dateStr === rE
            const inR = rS && rE && dateStr > rS && dateStr < rE
            const isToday = dateStr === todayStr
            const dow = (firstDow + parseInt(dateStr.split('-')[2]) - 1) % 7
            const isWeekStart = dow === 0
            const isWeekEnd = dow === 6
            const isRangeStart = isS && !single
            const isRangeEnd = isE && !single

            return (
              <div key={i} onClick={() => handleDayClick(dateStr)} onMouseEnter={() => picking && setHover(dateStr)}
                style={{ position: 'relative', height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none' }}
              >
                {/* Range background strip */}
                {inR && <div style={{ position: 'absolute', inset: '3px 0', background: '#e0eaff', borderRadius: isWeekStart ? '50% 0 0 50%' : isWeekEnd ? '0 50% 50% 0' : 0 }} />}
                {isRangeStart && <div style={{ position: 'absolute', inset: '3px 0', background: '#e0eaff', left: '50%', borderRadius: 0 }} />}
                {isRangeEnd && <div style={{ position: 'absolute', inset: '3px 0', background: '#e0eaff', right: '50%', borderRadius: 0 }} />}
                {/* Day circle */}
                <div style={{
                  position: 'relative', zIndex: 1,
                  width: isMobile ? 28 : 30, height: isMobile ? 28 : 30, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: (isS || isE) ? BLUE : 'transparent',
                  color: (isS || isE) ? '#fff' : inR ? BLUE : isToday ? BLUE : '#1f2937',
                  fontWeight: (isS || isE) ? 700 : isToday ? 600 : 400,
                  fontSize: isMobile ? 12 : 13,
                  boxShadow: isToday && !(isS || isE) ? `inset 0 0 0 1.5px ${BLUE}` : 'none',
                }}>
                  {parseInt(dateStr.split('-')[2])}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const canApply = (selStart && selEnd) || (!selStart && !selEnd)
  const footerLabel = selStart && selEnd
    ? <><strong style={{ color: '#111' }}>{fmtDateLabel(selStart)}</strong><span style={{ color: '#9ca3af', margin: '0 8px' }}>→</span><strong style={{ color: '#111' }}>{fmtDateLabel(selEnd)}</strong></>
    : picking
      ? <><strong style={{ color: '#111' }}>{fmtDateLabel(selStart)}</strong><span style={{ color: '#9ca3af', margin: '0 8px' }}>→</span><span style={{ color: ORANGE, fontStyle: 'italic' }}>pick end date</span></>
      : <span style={{ color: '#9ca3af' }}>Select a start date</span>

  const NavBtn = ({ onClick, children }) => (
    <button onClick={onClick} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#6b7280', flexShrink: 0 }}>{children}</button>
  )

  return (
    <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 199, background: isMobile ? 'rgba(0,0,0,0.35)' : 'transparent' }} />
    <div style={{
      position: 'fixed',
      bottom: isMobile ? 0 : 'auto',
      top: isMobile ? 'auto' : 64,
      left: isMobile ? 0 : 'auto',
      right: isMobile ? 0 : 16,
      zIndex: 200, background: '#fff',
      paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
      borderRadius: isMobile ? '16px 16px 0 0' : 14,
      boxShadow: isMobile ? '0 -8px 40px rgba(0,0,0,0.18)' : '0 12px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
      border: '1px solid #e5e7eb', marginTop: 0, overflow: 'hidden',
      width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 0 : 560,
      height: isMobile ? '82svh' : 'auto',
      maxHeight: isMobile ? '82vh' : 'none',
      display: isMobile ? 'flex' : 'block', flexDirection: isMobile ? 'column' : undefined,
    }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: isMobile ? 1 : undefined, minHeight: isMobile ? 0 : undefined, overflow: isMobile ? 'hidden' : undefined }}>

        {/* Preset sidebar / top strip on mobile */}
        <div style={{
          width: isMobile ? '100%' : 148, background: '#fafafa',
          borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
          borderBottom: isMobile ? '1px solid #f0f0f0' : 'none',
          padding: isMobile ? '10px 12px 8px' : '16px 0', flexShrink: 0,
        }}>
          <p style={{ margin: isMobile ? '0 0 7px' : '0 0 8px 16px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quick select</p>
          {/* Single-row horizontal scroll on mobile */}
          <div style={{ display: isMobile ? 'flex' : 'block', flexWrap: isMobile ? 'nowrap' : undefined, gap: isMobile ? 6 : 0, overflowX: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {presets.map(({ label, fn }) => {
              const active = isPresetActive(fn)
              return isMobile ? (
                <button key={label} onClick={() => applyPreset(fn)} style={{
                  padding: '5px 12px', border: `1px solid ${active ? BLUE : '#e5e7eb'}`, borderRadius: 20,
                  cursor: 'pointer', fontSize: 11, flexShrink: 0,
                  background: active ? '#eff6ff' : '#fff',
                  color: active ? BLUE : '#374151',
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </button>
              ) : (
                <button key={label} onClick={() => applyPreset(fn)} style={{
                  display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 13,
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? BLUE : '#374151',
                  fontWeight: active ? 600 : 400,
                }}>
                  {active && <span style={{ width: 3, height: 14, background: BLUE, borderRadius: 2, marginRight: 8, flexShrink: 0 }} />}
                  {!active && <span style={{ width: 11, flexShrink: 0 }} />}
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Calendar area */}
        <div style={{ flex: 1, minHeight: 0, padding: isMobile ? '14px 12px 10px' : '20px 20px 16px', overflowX: 'auto', overflowY: isMobile ? 'auto' : undefined, WebkitOverflowScrolling: 'touch' }}>
          {isMobile ? (
            /* Single calendar on mobile */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <NavBtn onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }}>‹</NavBtn>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{MONTHS_SHORT[viewMonth]} {viewYear}</span>
                <NavBtn onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }}>›</NavBtn>
              </div>
              {renderCal(viewYear, viewMonth)}
            </div>
          ) : (
            /* Dual calendar on tablet/desktop */
            <div style={{ display: 'flex', gap: 28 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <NavBtn onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }}>‹</NavBtn>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{MONTHS_SHORT[viewMonth]} {viewYear}</span>
                  <div style={{ width: 28 }} />
                </div>
                {renderCal(viewYear, viewMonth)}
              </div>
              <div style={{ width: 1, background: '#f0f0f0', margin: '0 -4px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ width: 28 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{MONTHS_SHORT[rightMonth]} {rightYear}</span>
                  <NavBtn onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }}>›</NavBtn>
                </div>
                {renderCal(rightYear, rightMonth)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer — sticky at bottom so Cancel/Apply always visible */}
      <div style={{ borderTop: '1px solid #f0f0f0', padding: isMobile ? '10px 16px calc(10px + env(safe-area-inset-bottom))' : '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', flexShrink: 0 }}>
        <div style={{ fontSize: 13 }}>{footerLabel}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 }}>Cancel</button>
          <button
            onClick={() => { onChange(selStart && selEnd ? { start: selStart, end: selEnd } : null); onClose() }}
            disabled={!canApply}
            style={{ padding: '7px 22px', borderRadius: 8, border: 'none', background: canApply ? BLUE : '#bfdbfe', color: '#fff', cursor: canApply ? 'pointer' : 'default', fontSize: 13, fontWeight: 700, letterSpacing: '0.01em' }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

function SectionLabel({ children, id }) {
  return (
    <div id={id} className="sd-section" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2rem 0 1rem', scrollMarginTop: 120 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.SECTION, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: T.BORDER }} />
    </div>
  )
}

function HeatmapCell({ value, max, isTotal }) {
  const t = max > 0 ? value / max : 0
  return (
    <div title={`${Math.round(value)} orders`} style={{
      flex: 1, height: 26, borderRadius: 2, minWidth: 0,
      background: isTotal ? 'transparent' : t === 0 ? '#f1f5f9' : `rgba(37,99,235,${0.08 + t * 0.82})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {value > 0 && (
        <span style={{ fontSize: 8, fontWeight: 600, lineHeight: 1, color: isTotal ? T.MUTED : t > 0.55 ? '#fff' : '#475569', pointerEvents: 'none' }}>
          {Math.round(value)}
        </span>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${active ? BLUE : T.BORDER_STRONG}`,
      background: active ? BLUE : T.CARD,
      color: active ? '#fff' : T.MUTED,
      fontWeight: active ? 600 : 400,
      transition: 'all 0.15s',
      boxShadow: active ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
    }}>{children}</button>
  )
}

function DeltaBadge({ value, suffix = '%', invert = false }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
      background: positive ? '#dcfce7' : '#fef2f2',
      color: positive ? '#16a34a' : '#dc2626',
    }}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  )
}

function parseFile(file, onSuccess, onError) {
  Papa.parse(file, {
    header: false, skipEmptyLines: false,
    complete: ({ data: raw }) => {
      const parsed = parsePOSFile(raw)
      if (parsed) {
        onSuccess({ rows: parsed.dataRows, meta: parsed.meta })
      } else {
        Papa.parse(file, {
          header: true, skipEmptyLines: true,
          complete: ({ data: rows }) => {
            if (!rows.length) { onError('No data found.'); return }
            onSuccess({ rows, meta: {} })
          },
          error: () => onError('Failed to read file.'),
        })
      }
    },
    error: () => onError('Failed to read file.'),
  })
}

export default function Dashboard() {
  const w = useWindowWidth()
  const isMobile = w < 640
  const isTablet = w >= 640 && w < 1024
  const isDesktop = w >= 1024

  const [rawData, setRawData] = useState(null)
  const [fileName, setFileName] = useState(null)
  const isDemo = fileName?.startsWith('demo_store')
  const [rawCompareData, setRawCompareData] = useState(null)
  const [compareFileName, setCompareFileName] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState(null)  // null = all time; { start, end } = filtered
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [outletFilter, setOutletFilter] = useState(null)
  const [search, setSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('storedash-targets') || '{}') } catch { return {} }
  })
  const [monthlyTargets, setMonthlyTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('storedash-monthly-targets') || '{}') } catch { return {} }
  })
  const [editingMonthlyTarget, setEditingMonthlyTarget] = useState(false)
  const [monthlyTargetInput, setMonthlyTargetInput] = useState('')
  const [uploadHistory, setUploadHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('storedash-history') || '[]') } catch { return [] }
  })
  const [editingTargets, setEditingTargets] = useState(false)
  const [allProductSearch, setAllProductSearch] = useState('')
  const [selectedSalesman, setSelectedSalesman] = useState(null)
  const [salesmanSearch, setSalesmanSearch] = useState('')
  const [salesmanProductSearch, setSalesmanProductSearch] = useState('')
  const [heatView, setHeatView] = useState('a')
  const [staffView, setStaffView] = useState('a')
  const [ptypeModal, setPtypeModal] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [prodCountView, setProdCountView] = useState('a')
  const [draggingB, setDraggingB] = useState(false)
  const [cloudFiles, setCloudFiles] = useState([])
  const [cloudLoading, setCloudLoading] = useState(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveKey, setSaveKey] = useState('')
  const [saveStatus, setSaveStatus] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showAllSalesmen, setShowAllSalesmen] = useState(false)
  const [showAllLeaderboard, setShowAllLeaderboard] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline  = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [])

  const [aiResult, setAiResult] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiCached, setAiCached] = useState(false)
  const [savedAnalyses, setSavedAnalyses] = useState([])
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)

  const [splashPhase, setSplashPhase] = useState('show') // 'show' | 'fade' | 'done'
  const [parsing, setParsing] = useState(false)
  const splashStartRef = useRef(Date.now())
  const dismissSplash = useCallback(() => {
    const elapsed = Date.now() - splashStartRef.current
    const wait = Math.max(0, 700 - elapsed) // minimum 0.7s so animation is visible
    setTimeout(() => {
      setSplashPhase('fade')
      setTimeout(() => setSplashPhase('done'), 400)
    }, wait)
  }, [])
  const fileRef = useRef()
  const compareFileRef = useRef()
  const fileCacheRef = useRef({})
  const rawCsvRef = useRef(null)

  const monthRange = selectedMonth ? { start: selectedMonth + '-01', end: selectedMonth + '-31' } : null
  const effectiveRange = dateRange || monthRange
  const data = useMemo(() => rawData ? processData(rawData.rows, rawData.meta, effectiveRange, outletFilter) : null, [rawData, effectiveRange, outletFilter])
  const compareData = useMemo(() => rawCompareData ? processData(rawCompareData.rows, rawCompareData.meta, effectiveRange, outletFilter) : null, [rawCompareData, effectiveRange, outletFilter])

  // Fingerprint: stable ID for this exact dataset — used for cache lookup
  const aiFingerprint = useMemo(() => {
    if (!data) return null
    const raw = `${data.meta?.outlet || ''}_${data.meta?.period || ''}_${Math.round(data.totalRevenue)}_${data.totalOrders}`
    return raw.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 120)
  }, [data])

  // When data changes, clear result and auto-load cached analysis if available
  useEffect(() => {
    setAiResult(null)
    setAiCached(false)
    setAiError(null)
    if (!aiFingerprint) return
    fetch(`/.netlify/functions/ai-analysis?action=list`)
      .then(r => r.json())
      .then(list => {
        if (!Array.isArray(list)) return
        setSavedAnalyses(list)
        const cached = list.find(e => e.fingerprint === aiFingerprint)
        if (cached) {
          // Load the full cached analysis from the server
          fetch('/.netlify/functions/ai-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprint: aiFingerprint, _cacheOnly: true,
              outlet: data?.meta?.outlet, period: data?.meta?.period,
              totalRevenue: data?.totalRevenue || 0, totalOrders: data?.totalOrders || 0,
            }),
          }).then(r => r.json()).then(d => {
            if (d.ok && d.cached && d.analysis) { setAiResult(d.analysis); setAiCached(true) }
          }).catch(() => {})
        }
      })
      .catch(() => {})
  }, [aiFingerprint]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved analyses list on mount (for home screen)
  useEffect(() => {
    fetch('/.netlify/functions/ai-analysis?action=list')
      .then(r => r.json())
      .then(list => { if (Array.isArray(list)) setSavedAnalyses(list) })
      .catch(() => {})
  }, [])

  const deleteAnalysis = useCallback(async (fingerprint) => {
    await fetch('/.netlify/functions/ai-analysis?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint }),
    }).catch(() => {})
    setSavedAnalyses(prev => prev.filter(e => e.fingerprint !== fingerprint))
    if (aiResult && aiFingerprint === fingerprint) { setAiResult(null); setAiCached(false) }
  }, [aiResult, aiFingerprint])

  const runAIAnalysis = useCallback(async (force = false) => {
    if (!data) return
    setAiLoading(true)
    setAiError(null)
    setAiCached(false)
    try {
      const payload = {
        fingerprint: aiFingerprint,
        forceRegenerate: force,
        outlet: data.meta?.outlet,
        period: data.meta?.period,
        totalRevenue: data.totalRevenue,
        totalOrders: data.totalOrders,
        aov: data.aov,
        growth: data.growth,
        momChange: data.momChange,
        returnRate: data.returnRate,
        rspGap: data.rspGap,
        peakDay: data.peakDay,
        peakHour: data.peakHour,
        topProducts: data.topProducts.slice(0, 10),
        salesmen: data.salesmen.slice(0, 8).map(s => ({ name: s.name, revenue: s.revenue, orders: s.orders, returnRate: s.returnRate })),
        categories: data.categories.slice(0, 6).map(c => ({ name: c.name, revenue: c.revenue, orders: c.orders })),
        productTypes: data.productTypes.map(t => ({ name: t.name, revenue: t.revenue, orders: t.orders })),
      }
      const res = await fetch('/.netlify/functions/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Analysis failed')
      setAiResult(json.analysis)
      setAiCached(json.cached || false)
      if (!json.cached) {
        // Refresh saved list so new entry appears
        fetch('/.netlify/functions/ai-analysis?action=list')
          .then(r => r.json()).then(list => { if (Array.isArray(list)) setSavedAnalyses(list) }).catch(() => {})
      }
    } catch (e) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }, [data, aiFingerprint])

  useEffect(() => {
    fetch('/.netlify/functions/storedash-load?meta=true')
      .then(r => r.ok ? r.json() : [])
      .then(list => { if (Array.isArray(list)) setCloudFiles(list) })
      .catch(() => {})
      .finally(() => dismissSplash())
  }, [dismissSplash])

  // Scroll-triggered animations — only after splash is done
  useEffect(() => {
    if (splashPhase !== 'done') return
    let obs
    const t = setTimeout(() => {
      obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('sd-in'); obs.unobserve(e.target) }
        })
      }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' })
      document.querySelectorAll(
        '.sd-card:not(.sd-in),.sd-kpi:not(.sd-in),.sd-section:not(.sd-in),.sd-home:not(.sd-in),.sd-row:not(.sd-in),.sd-pop:not(.sd-in)'
      ).forEach(el => obs.observe(el))
    }, 0)
    return () => { clearTimeout(t); if (obs) obs.disconnect() }
  }, [splashPhase, data, fileName, aiResult, savedAnalyses, cloudFiles, uploadHistory])

  const loadCloud = async (fileEntry) => {
    setCloudLoading(fileEntry.key)
    setError(null)
    try {
      const res = await fetch(`/.netlify/functions/storedash-load?key=${encodeURIComponent(fileEntry.key)}`)
      if (!res.ok) throw new Error('File not found')
      const text = await res.text()
      rawCsvRef.current = text
      const blob = new Blob([text], { type: 'text/csv' })
      const file = new File([blob], fileEntry.filename || 'cloud-data.csv', { type: 'text/csv' })
      handleFile(file)
    } catch {
      setError('Failed to load cloud data.')
    }
    setCloudLoading(null)
  }

  const saveCloud = async () => {
    if (!rawCsvRef.current) return
    setSaveStatus('saving')
    try {
      const res = await fetch('/.netlify/functions/storedash-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: rawCsvRef.current,
          key: saveKey,
          filename: fileName,
          outlet: rawData?.meta?.outlet || '',
          period: rawData?.meta?.period || '',
          totalTx: rawData?.meta?.totalTx || null,
        }),
      })
      if (res.ok) {
        setSaveStatus('saved')
        const newEntry = { key: 'file-' + (fileName || 'report').replace(/\.csv$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60), filename: fileName, outlet: rawData?.meta?.outlet, period: rawData?.meta?.period, totalTx: rawData?.meta?.totalTx, savedAt: new Date().toISOString() }
        setCloudFiles(prev => [newEntry, ...prev.filter(f => f.key !== newEntry.key)])
        setTimeout(() => { setShowSaveDialog(false); setSaveStatus(null); setSaveKey('') }, 1800)
      } else {
        const err = await res.json()
        setSaveStatus(err.error === 'Wrong PIN' ? 'wrongpin' : 'error')
      }
    } catch {
      setSaveStatus('error')
    }
  }

  const handleFile = useCallback(file => {
    if (!file) return
    setError(null); setFileName(file.name); setParsing(true)
    const reader = new FileReader()
    reader.onload = e => { rawCsvRef.current = e.target.result }
    reader.readAsText(file)
    parseFile(file, parsed => {
      fileCacheRef.current[file.name] = parsed
      setRawData(parsed); setParsing(false)
      const entry = {
        filename: file.name,
        outlet: parsed.meta?.outlet || '',
        period: parsed.meta?.period || '',
        kassieTotal: parsed.meta?.kassieTotal || null,
        totalTx: parsed.meta?.totalTx || null,
        uploadedAt: new Date().toISOString(),
      }
      setUploadHistory(prev => {
        const next = [entry, ...prev.filter(h => h.filename !== file.name)].slice(0, 5)
        localStorage.setItem('storedash-history', JSON.stringify(next))
        return next
      })
    }, err => { setParsing(false); setError(err) })
  }, [])

  const handleCompareFile = useCallback(file => {
    if (!file) return
    setCompareFileName(file.name)
    parseFile(file, setRawCompareData, () => {})
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const loadDemo = () => {
    setFileName('demo_store_a.csv'); setError(null)
    const { rows, meta } = generateDemoData(0)
    setRawData({ rows, meta })
  }

  const loadDemoCompare = () => {
    setCompareFileName('demo_store_b.csv')
    const { rows, meta } = generateDemoData(99)
    setRawCompareData({ rows, meta })
  }

  const resetAll = () => {
    setRawData(null); setFileName(null); setRawCompareData(null); setCompareFileName(null)
    setError(null); setSearch(''); setProductSearch(''); setAllProductSearch(''); setSelectedSalesman(null); setSalesmanSearch(''); setSalesmanProductSearch(''); setTargets({}); setDateRange(null); setShowDatePicker(false); setOutletFilter(null)
  }

  useEffect(() => {
    localStorage.setItem('storedash-targets', JSON.stringify(targets))
  }, [targets])

  useEffect(() => {
    localStorage.setItem('storedash-monthly-targets', JSON.stringify(monthlyTargets))
  }, [monthlyTargets])

  const monthlyTargetKey = data?.meta?.outlet || 'default'
  const monthlyTarget = monthlyTargets[monthlyTargetKey] || 0
  const monthlyTargetPct = monthlyTarget > 0 ? Math.min(100, (data?.totalRevenue || 0) / monthlyTarget * 100) : 0
  const saveMonthlyTarget = () => {
    const val = parseFloat(monthlyTargetInput) || 0
    setMonthlyTargets(t => ({ ...t, [monthlyTargetKey]: val }))
    setEditingMonthlyTarget(false)
  }

  const trend = data?.trend ?? []
  const peakTrendPoint = trend.reduce((best, d) => d.revenue > (best?.revenue ?? 0) ? d : best, null)

  // Auto-insights: surface key signals from data
  const insights = useMemo(() => {
    if (!data) return []
    const items = []
    if (data.momChange !== null && data.momChange !== undefined) {
      if (data.momChange >= 10) items.push({ type: 'positive', icon: '📈', text: `Revenue up ${data.momChange.toFixed(1)}% vs last month (${data.momPrevLabel} → ${data.momCurrentLabel})` })
      else if (data.momChange <= -10) items.push({ type: 'warning', icon: '📉', text: `Revenue down ${Math.abs(data.momChange).toFixed(1)}% vs last month — may need attention` })
    }
    if (data.returnRate > 8) items.push({ type: 'warning', icon: '↩️', text: `Return rate is ${data.returnRate.toFixed(1)}% — above 8% threshold` })
    else if (data.returnRate > 0) items.push({ type: 'neutral', icon: '↩️', text: `Return rate is ${data.returnRate.toFixed(1)}% — within normal range` })
    const topSalesman = data.salesmen[0]
    const secondSalesman = data.salesmen[1]
    if (topSalesman && secondSalesman && topSalesman.revenue > secondSalesman.revenue * 1.5) {
      items.push({ type: 'neutral', icon: '🏆', text: `${topSalesman.name} leads by ${((topSalesman.revenue / secondSalesman.revenue - 1) * 100).toFixed(0)}% over #2 — consider sharing their approach` })
    }
    const highReturnStaff = data.salesmen.filter(s => s.returnRate > 15 && s.returnCount >= 2)
    highReturnStaff.forEach(s => items.push({ type: 'warning', icon: '⚠️', text: `${s.name} has a ${s.returnRate}% return rate (${s.returnCount} returns) — may need coaching` }))
    const wrNum = parseFloat(data.weekendRatio)
    if (!isNaN(wrNum) && wrNum > 1.3) items.push({ type: 'positive', icon: '📅', text: `Weekend traffic is ${wrNum}× weekday average — good for promotions` })
    else if (!isNaN(wrNum) && wrNum < 0.7) items.push({ type: 'neutral', icon: '📅', text: `Weekdays outperform weekends (${wrNum}× ratio) — consider weekday-focused offers` })
    if (data.peakHour !== undefined) items.push({ type: 'neutral', icon: '🕐', text: `Peak traffic: ${DAYS[data.peakDay]} ${data.peakHour}:00–${data.peakHour + 1}:00 — best time for demos or promos` })
    const rspGapPct = data.totalRSP > 0 ? (data.rspGap / data.totalRSP) * 100 : 0
    if (rspGapPct > 5) items.push({ type: 'warning', icon: '💸', text: `Discount gap is ${rspGapPct.toFixed(1)}% below RSP (${fmtMYR(data.rspGap)}) — review pricing strategy` })
    else if (rspGapPct > 0) items.push({ type: 'neutral', icon: '💸', text: `Discount gap is ${rspGapPct.toFixed(1)}% below RSP — within acceptable range` })
    return items.slice(0, 6)
  }, [data])

  const activeProducts = data ? (productSearch ? data.topProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())) : data.topProducts) : []

  // Merge trend for comparison overlay
  const comparisonTrend = (() => {
    if (!data || !compareData) return []
    const aMap = {}, bMap = {}
    data.trend.forEach(t => { aMap[t.date] = t.revenue })
    compareData.trend.forEach(t => { bMap[t.date] = t.revenue })
    const allDates = [...new Set([...Object.keys(aMap), ...Object.keys(bMap)])].sort()
    return allDates.map(date => ({ date, storeA: aMap[date] || 0, storeB: bMap[date] || 0 }))
  })()

  // Category comparison
  const categoryComparison = (() => {
    if (!data || !compareData) return []
    const bMap = {}
    compareData.categories.forEach(c => { bMap[c.name] = c.revenue })
    return data.categories.slice(0, 6).map(c => ({ name: c.name, storeA: c.revenue, storeB: bMap[c.name] || 0 }))
  })()

  const monthlyComparison = (() => {
    if (!data || !compareData) return []
    const aMap = {}, bMap = {}
    data.monthlyBreakdown.forEach(m => { aMap[m.key] = m.revenue })
    compareData.monthlyBreakdown.forEach(m => { bMap[m.key] = m.revenue })
    const allKeys = [...new Set([...Object.keys(aMap), ...Object.keys(bMap)])].sort().slice(-6)
    return allKeys.map(key => ({ label: fmtMonth(key), key, storeA: aMap[key] || 0, storeB: bMap[key] || 0 }))
  })()

  const productComparison = (() => {
    if (!data || !compareData) return []
    const bMap = {}
    compareData.topProducts.forEach(p => { bMap[p.name] = p.revenue })
    const aMap = {}
    data.topProducts.forEach(p => { aMap[p.name] = p.revenue })
    const allNames = [...new Set([...data.topProducts.map(p => p.name), ...compareData.topProducts.map(p => p.name)])]
    return allNames
      .map(name => ({ name, storeA: aMap[name] || 0, storeB: bMap[name] || 0 }))
      .sort((a, b) => (b.storeA + b.storeB) - (a.storeA + a.storeB))
      .slice(0, 8)
  })()

  const nameA = data?.meta?.outlet || 'Store A'
  const nameB = compareData?.meta?.outlet || 'Store B'

  const allProductsComparison = (() => {
    if (!data || !compareData) return null
    const aMap = {}, bMap = {}
    data.allProducts.forEach(p => { aMap[p.name] = p.units })
    compareData.allProducts.forEach(p => { bMap[p.name] = p.units })
    const names = [...new Set([...Object.keys(aMap), ...Object.keys(bMap)])]
    return names
      .map(name => ({ name, unitsA: aMap[name] || 0, unitsB: bMap[name] || 0 }))
      .sort((a, b) => (b.unitsA + b.unitsB) - (a.unitsA + a.unitsB))
  })()

  const productTypeComparison = compareData ? PTYPES.map(name => {
    const a = data?.productTypes.find(p => p.name === name)
    const b = compareData.productTypes.find(p => p.name === name)
    return { name, storeA: a?.revenue || 0, storeB: b?.revenue || 0, ordersA: a?.orders || 0, ordersB: b?.orders || 0 }
  }).filter(p => p.storeA > 0 || p.storeB > 0) : null

  return (
    <div style={{ minHeight: '100vh', background: T.BG, color: T.TEXT, fontFamily: "'Inter', system-ui, sans-serif", maxWidth: '100vw' }}>

      {/* ── Splash screen ── */}
      <style>{`
        @keyframes splashSpin { to { transform: rotate(360deg); } }
        @keyframes splashPop { from { transform: scale(0.82) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes splashDot { 0%,80%,100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes sdFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sdFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sdSlideLeft { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes sdSlideRight { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes sdPop { from { opacity: 0; transform: scale(0.93); } to { opacity: 1; transform: scale(1); } }
        @keyframes sdShimmer { 0%,100% { background-position: 200% center; } 50% { background-position: -200% center; } }
        /* All animated elements start invisible — IntersectionObserver reveals them */
        .sd-card, .sd-kpi, .sd-section, .sd-home, .sd-row, .sd-pop { opacity: 0; }
        /* Animations only fire when .sd-in is added (after splash + in viewport) */
        .sd-card.sd-in { animation: sdFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
        .sd-kpi.sd-in  { animation: sdFadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .sd-section.sd-in { animation: sdSlideLeft 0.35s ease-out both; }
        .sd-home.sd-in { animation: sdFadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .sd-row.sd-in  { animation: sdSlideLeft 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .sd-pop.sd-in  { animation: sdPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
        /* Stagger delays — applied when sd-in is added */
        .sd-kpi.sd-in:nth-child(1)  { animation-delay: 0ms }
        .sd-kpi.sd-in:nth-child(2)  { animation-delay: 55ms }
        .sd-kpi.sd-in:nth-child(3)  { animation-delay: 110ms }
        .sd-kpi.sd-in:nth-child(4)  { animation-delay: 165ms }
        .sd-kpi.sd-in:nth-child(5)  { animation-delay: 220ms }
        .sd-kpi.sd-in:nth-child(6)  { animation-delay: 275ms }
        .sd-card.sd-in:nth-child(1) { animation-delay: 0ms }
        .sd-card.sd-in:nth-child(2) { animation-delay: 70ms }
        .sd-card.sd-in:nth-child(3) { animation-delay: 140ms }
        .sd-card.sd-in:nth-child(4) { animation-delay: 210ms }
        .sd-card.sd-in:nth-child(5) { animation-delay: 280ms }
        .sd-card.sd-in:nth-child(6) { animation-delay: 350ms }
        .sd-home.sd-in:nth-child(1) { animation-delay: 60ms }
        .sd-home.sd-in:nth-child(2) { animation-delay: 130ms }
        .sd-home.sd-in:nth-child(3) { animation-delay: 200ms }
        .sd-home.sd-in:nth-child(4) { animation-delay: 270ms }
        .sd-home.sd-in:nth-child(5) { animation-delay: 340ms }
        .sd-kpi.sd-in:hover  { transform: translateY(-2px) !important; box-shadow: 0 6px 20px rgba(0,0,0,0.10) !important; transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .sd-card.sd-in:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10) !important; transition: box-shadow 0.2s ease; }
        .sd-ai-btn {
          background: linear-gradient(135deg, #2563eb, #7c3aed) !important;
          background-size: 200% auto !important;
          animation: sdShimmer 3s linear infinite !important;
        }
        .sd-ai-btn:disabled { opacity: 0.45 !important; cursor: not-allowed !important; animation: none !important; background: #9ca3af !important; box-shadow: none !important; }
        .sd-ai-btn:hover:not(:disabled) { opacity: 0.9 !important; transform: scale(1.02); transition: transform 0.15s ease; }
      `}</style>
      {splashPhase !== 'done' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'linear-gradient(160deg, #080d1a 0%, #0a1628 45%, #0d1f3c 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          opacity: splashPhase === 'fade' ? 0 : 1,
          transition: 'opacity 0.4s ease',
          pointerEvents: splashPhase === 'fade' ? 'none' : 'all',
        }}>
          {/* Subtle grid lines like hub homepage */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
          <div style={{ animation: 'splashPop 0.55s cubic-bezier(0.34,1.56,0.64,1)', textAlign: 'center', padding: '0 2rem', position: 'relative' }}>
            <p style={{ color: '#e6a014', fontSize: 10, fontWeight: 800, letterSpacing: '0.35em', textTransform: 'uppercase', margin: '0 0 20px' }}>DJI QUEENSBAY MALL</p>
            <div style={{ fontSize: 56, marginBottom: 16, lineHeight: 1 }}>🛸</div>
            <h1 style={{ color: '#fff', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 6px', lineHeight: 1.1 }}>StoreDash</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '0 0 40px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Operator Hub · Sales Analytics</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', animation: `splashDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Offline overlay ── */}
      {isOffline && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'linear-gradient(160deg, #080d1a 0%, #0a1628 45%, #0d1f3c 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0,
        }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
          <div style={{ textAlign: 'center', padding: '0 2rem', position: 'relative' }}>
            <div style={{ fontSize: 52, marginBottom: 20 }}>📡</div>
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.02em' }}>You are offline</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '0 0 32px', lineHeight: 1.6 }}>Connect to the internet to access StoreDash.<br />This page will reload automatically when you're back online.</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 20px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>NO CONNECTION</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Parsing / cloud-loading overlay ── */}
      {(parsing || cloudLoading) && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 8888,
          background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{ width: 48, height: 48, border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'splashSpin 0.75s linear infinite' }} />
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>{cloudLoading ? 'Loading from cloud…' : 'Analysing your data…'}</p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>This only takes a moment</p>
        </div>
      )}

      {/* Navbar wrapper — sticky so sub-bar sticks too */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10 }}>
      <nav style={{
        borderBottom: `1px solid ${T.BORDER}`,
        background: T.NAV, backdropFilter: 'blur(12px)',
        padding: '0 1rem', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        flexWrap: 'nowrap', overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      }}>
        {/* Left: back link + brand / home */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <a
            href="/"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: T.MUTED, textDecoration: 'none', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 6, padding: '4px 9px', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = BLUE}
            onMouseLeave={e => e.currentTarget.style.color = T.MUTED}
          >
            {isMobile ? '←' : '← Operator Hub'}
          </a>
          <div
            onClick={data ? resetAll : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: data ? 'pointer' : 'default', borderRadius: 8, padding: '2px 4px', transition: 'background 0.15s' }}
            title={data ? 'Go to Home' : ''}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>📊</div>
            <span style={{ fontWeight: 800, fontSize: 15, color: BLUE, letterSpacing: '-0.01em' }}>StoreDash</span>
            {data && <span style={{ fontSize: 10, color: T.MUTED, marginLeft: -2 }}>⌂</span>}
          </div>
        </div>

        {/* Center: store context — hidden on mobile to save space */}
        {data && !isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: `1px solid #bfdbfe`, borderRadius: 20, padding: '4px 12px' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: BLUE, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: BLUE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isTablet ? 120 : 220 }}>
                {data.availableOutlets?.length > 1
                  ? (outletFilter ? outletLabel(outletFilter) : 'All Outlets')
                  : (outletLabel(data.meta?.outlet) || fileName)}
              </span>
            </div>
            {compareData && (
              <>
                <span style={{ fontSize: 11, color: T.MUTED }}>vs</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5f3ff', border: `1px solid #ddd6fe`, borderRadius: 20, padding: '4px 12px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: STORE_B_COLOR, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: STORE_B_COLOR, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isTablet ? 120 : 220 }}>
                    {outletLabel(compareData.meta?.outlet) || compareFileName}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right: date picker + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, position: 'relative' }}>
          {data && (
            <>
              {/* Month selector — desktop only (mobile gets sub-bar) */}
              {!isMobile && data.availableMonths?.length > 1 && (
                <div style={{ display: 'flex', gap: 3, background: '#e5e7eb', borderRadius: 8, padding: 2 }}>
                  <button
                    onClick={() => { setSelectedMonth(null); setDateRange(null) }}
                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: !selectedMonth ? BLUE : 'transparent',
                      color: !selectedMonth ? '#fff' : T.MUTED,
                      fontWeight: !selectedMonth ? 700 : 400 }}>
                    All
                  </button>
                  {data.availableMonths.map(m => (
                    <button key={m}
                      onClick={() => {
                        setSelectedMonth(m)
                        setDateRange({ start: m + '-01', end: m + '-31' })
                      }}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        background: selectedMonth === m ? BLUE : 'transparent',
                        color: selectedMonth === m ? '#fff' : T.MUTED,
                        fontWeight: selectedMonth === m ? 700 : 400 }}>
                      {fmtMonth(m)}
                    </button>
                  ))}
                </div>
              )}

              {/* Outlet selector — desktop only (mobile gets sub-bar) */}
              {!isMobile && data.availableOutlets?.length > 1 && (
                <select
                  value={outletFilter || ''}
                  onChange={e => { setOutletFilter(e.target.value || null); setSelectedMonth(null) }}
                  style={{
                    fontSize: 12, padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                    border: `1.5px solid ${outletFilter ? BLUE : T.BORDER_STRONG}`,
                    background: outletFilter ? '#eff6ff' : T.CARD,
                    color: outletFilter ? BLUE : T.TEXT,
                    fontWeight: outletFilter ? 700 : 400,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    maxWidth: 180, appearance: 'none',
                    paddingRight: 24, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                  }}
                >
                  <option value="">All Outlets</option>
                  {data.availableOutlets.map(o => (
                    <option key={o} value={o}>{outletLabel(o)}</option>
                  ))}
                </select>
              )}

              {/* Date range picker button — picker rendered outside nav to escape backdrop-filter containment */}
              <button
                onClick={() => setShowDatePicker(p => !p)}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1px solid ${dateRange ? BLUE : T.BORDER_STRONG}`,
                  background: dateRange ? '#eff6ff' : T.CARD,
                  color: dateRange ? BLUE : T.TEXT,
                  fontWeight: dateRange ? 600 : 400,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>📅</span>
                {!isMobile
                  ? <span>{formatRangeLabel(dateRange)}</span>
                  : dateRange && <span style={{ fontSize: 11, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatRangeLabel(dateRange)}</span>
                }
                <span style={{ color: T.MUTED, fontSize: 10 }}>▾</span>
              </button>
              {dateRange && (
                <button onClick={() => setDateRange(null)} title="Clear date filter" style={{ fontSize: 11, padding: '4px 7px', borderRadius: 6, border: `1px solid ${T.BORDER_STRONG}`, background: T.CARD, color: T.MUTED, cursor: 'pointer' }}>✕</button>
              )}

              {!isMobile && <div style={{ width: 1, height: 20, background: T.BORDER_STRONG, margin: '0 2px' }} />}

              {!isMobile && !compareData && (
                <>
                  <input ref={compareFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleCompareFile(e.target.files[0])} />
                  <button onClick={() => compareFileRef.current.click()}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${STORE_B_COLOR}`, background: '#f5f3ff', color: STORE_B_COLOR, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    + Compare
                  </button>
                </>
              )}
              {!isMobile && compareData && (
                <button onClick={() => { setRawCompareData(null); setCompareFileName(null) }}
                  style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.CARD, color: T.MUTED, cursor: 'pointer' }}>
                  ✕ Remove B
                </button>
              )}

              {!isMobile && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => exportCSV(data, fileName)}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.CARD, color: T.MUTED, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
                    ⬇ CSV
                  </button>
                  <button onClick={() => exportPDF(data, compareData, nameA, nameB, formatRangeLabel(dateRange))}
                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.CARD, color: T.MUTED, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
                    📄 PDF
                  </button>
                </div>
              )}
            </>
          )}
          {data && !isMobile && (
            <button onClick={() => { setShowSaveDialog(true); setSaveStatus(null); setSaveKey('') }}
              title="Save current data to cloud so team can load it on any device"
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid #bfdbfe`, background: '#eff6ff', color: BLUE, cursor: 'pointer', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
              ☁️ Save
            </button>
          )}
          <button onClick={resetAll}
            style={{ fontSize: 12, padding: isMobile ? '5px 8px' : '5px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: data ? BLUE : T.CARD, color: data ? '#fff' : T.MUTED, cursor: 'pointer', fontWeight: data ? 600 : 400, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
            {data ? (isMobile ? '↑' : '↑ Upload') : 'Upload CSV'}
          </button>
          {data && (
            <button onClick={() => setShowMenu(true)}
              title="Jump to section"
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.CARD, color: T.TEXT, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0, padding: 0 }}>
              <div style={{ width: 14, height: 1.5, background: 'currentColor', borderRadius: 1 }} />
              <div style={{ width: 14, height: 1.5, background: 'currentColor', borderRadius: 1 }} />
              <div style={{ width: 14, height: 1.5, background: 'currentColor', borderRadius: 1 }} />
            </button>
          )}
        </div>
      </nav>

      {/* Mobile sub-bar: month tabs + outlet selector */}
      {isMobile && data && (data.availableMonths?.length > 1 || data.availableOutlets?.length > 1) && (
        <div style={{
          background: T.NAV, backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${T.BORDER}`,
          padding: '6px 1rem',
          display: 'flex', alignItems: 'center', gap: 8,
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          {data.availableMonths?.length > 1 && (
            <div style={{ display: 'flex', gap: 3, background: '#e5e7eb', borderRadius: 8, padding: 2, flexShrink: 0 }}>
              <button
                onClick={() => { setSelectedMonth(null); setDateRange(null) }}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: !selectedMonth ? BLUE : 'transparent',
                  color: !selectedMonth ? '#fff' : T.MUTED,
                  fontWeight: !selectedMonth ? 700 : 400 }}>
                All
              </button>
              {data.availableMonths.map(m => (
                <button key={m}
                  onClick={() => {
                    setSelectedMonth(m)
                    setDateRange({ start: m + '-01', end: m + '-31' })
                  }}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: selectedMonth === m ? BLUE : 'transparent',
                    color: selectedMonth === m ? '#fff' : T.MUTED,
                    fontWeight: selectedMonth === m ? 700 : 400 }}>
                  {fmtMonth(m)}
                </button>
              ))}
            </div>
          )}
          {data.availableOutlets?.length > 1 && (
            <select
              value={outletFilter || ''}
              onChange={e => { setOutletFilter(e.target.value || null); setSelectedMonth(null) }}
              style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                border: `1.5px solid ${outletFilter ? BLUE : T.BORDER_STRONG}`,
                background: outletFilter ? '#eff6ff' : T.CARD,
                color: outletFilter ? BLUE : T.TEXT,
                fontWeight: outletFilter ? 700 : 400,
                maxWidth: 160, appearance: 'none',
                paddingRight: 22, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
              }}
            >
              <option value="">All Outlets</option>
              {data.availableOutlets.map(o => (
                <option key={o} value={o}>{outletLabel(o)}</option>
              ))}
            </select>
          )}
        </div>
      )}
      </div>{/* end sticky nav wrapper */}

      {/* Section jump menu */}
      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
      {showMenu && (
        <>
          <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.45)', animation: 'fadeIn 0.2s ease-out' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? 'min(88vw, 300px)' : 280, zIndex: 401, background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 32px rgba(0,0,0,0.18)', animation: 'slideInRight 0.22s cubic-bezier(0.22,1,0.36,1)' }}>
            <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', margin: 0 }}>Jump to section</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Tap to scroll</p>
              </div>
              <button onClick={() => setShowMenu(false)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 24px' }}>
              {[
                { id: 'sec-ai', icon: '✨', label: 'AI Analysis' },
                { id: 'sec-target', icon: '🎯', label: 'Monthly Target' },
                { id: 'sec-insights', icon: '💡', label: 'Auto Insights' },
                { id: 'sec-overview', icon: '📊', label: 'Sales Overview' },
                { id: 'sec-returns', icon: '↩️', label: 'Returns & Refunds' },
                { id: 'sec-mom', icon: '📅', label: 'Month-over-Month' },
                { id: 'sec-staff', icon: '👥', label: 'Staff Performance' },
                { id: 'sec-products', icon: '📦', label: 'Product Count' },
                { id: 'sec-discount', icon: '🏷️', label: 'Discount Analysis' },
                { id: 'sec-traffic', icon: '🕐', label: 'Traffic Patterns' },
              ].map(s => (
                <button key={s.id} onClick={() => {
                  setShowMenu(false)
                  setTimeout(() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
                }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, width: 26, textAlign: 'center' }}>{s.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Date picker rendered here (outside nav) so position:fixed isn't trapped by nav's backdrop-filter */}
      {showDatePicker && (
        <DateRangePicker
          value={dateRange}
          onChange={r => { setDateRange(r); setShowDatePicker(false) }}
          onClose={() => setShowDatePicker(false)}
          isMobile={isMobile}
        />
      )}

      {/* Save to cloud dialog */}
      {showSaveDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowSaveDialog(false); setSaveStatus(null); setSaveKey('') } }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 6px', color: T.TEXT }}>☁️ Save to Cloud</p>
            <p style={{ fontSize: 13, color: T.MUTED, margin: '0 0 1.25rem' }}>Anyone on the team can load this data on their phone without re-uploading.</p>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.TEXT, display: 'block', marginBottom: 6 }}>Save PIN</label>
            <input
              type="password"
              value={saveKey}
              onChange={e => { setSaveKey(e.target.value); setSaveStatus(null) }}
              onKeyDown={e => e.key === 'Enter' && saveCloud()}
              placeholder="Enter PIN to authorise save"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${saveStatus === 'wrongpin' ? RED : T.BORDER_STRONG}`, fontSize: 14, marginBottom: 6, outline: 'none', boxSizing: 'border-box' }}
            />
            {saveStatus === 'wrongpin' && <p style={{ fontSize: 12, color: RED, margin: '0 0 10px' }}>Wrong PIN — check with your manager.</p>}
            {saveStatus === 'error' && <p style={{ fontSize: 12, color: RED, margin: '0 0 10px' }}>Save failed. Try again.</p>}
            {saveStatus === 'saved' && <p style={{ fontSize: 12, color: GREEN, margin: '0 0 10px' }}>✓ Saved! Team can now load this data.</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => { setShowSaveDialog(false); setSaveStatus(null); setSaveKey('') }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.MUTED, cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={saveCloud} disabled={!saveKey || saveStatus === 'saving' || saveStatus === 'saved'}
                style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: saveStatus === 'saved' ? GREEN : BLUE, color: '#fff', cursor: saveKey ? 'pointer' : 'default', fontSize: 13, fontWeight: 700, opacity: !saveKey ? 0.5 : 1 }}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save to Cloud'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: isMobile ? '1rem 0.75rem' : '2rem 1.5rem' }}>

        {/* Upload */}
        {!data && (
          <>
            <div style={{ marginBottom: '1.5rem', animation: 'sdFadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both' }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 6px', color: T.TEXT }}>Store Dashboard</h1>
              <p style={{ color: T.MUTED, fontSize: 14 }}>Upload your Kassie Customer Purchase Listing CSV to analyse sales</p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${dragging ? BLUE : T.BORDER_STRONG}`,
                borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
                background: dragging ? '#eff6ff' : T.CARD,
                transition: 'all 0.2s', marginBottom: '1rem',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px', color: T.TEXT }}>Drop your CSV file here</p>
              <p style={{ color: T.MUTED, fontSize: 13, margin: '0 0 1.25rem' }}>or click to browse</p>
              <button onClick={e => { e.stopPropagation(); loadDemo() }}
                style={{ padding: '9px 22px', borderRadius: 9, cursor: 'pointer', fontSize: 13, border: `1px solid ${BLUE}`, background: '#eff6ff', color: BLUE, fontWeight: 600 }}>
                ✨ Try with demo data
              </button>
            </div>

            {/* Cloud files card — always visible */}
            <div className="sd-home" style={{ background: T.CARD, border: `1px solid ${cloudFiles.length ? '#bfdbfe' : T.BORDER}`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: cloudFiles.length ? 10 : 0 }}>
                <span style={{ fontSize: 18 }}>☁️</span>
                <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: cloudFiles.length ? '#1d4ed8' : T.TEXT }}>
                  {cloudFiles.length ? `Cloud files (${cloudFiles.length})` : 'No cloud files yet'}
                </p>
              </div>
              {cloudFiles.length === 0 && (
                <p style={{ fontSize: 12, color: T.MUTED, margin: '6px 0 0' }}>Upload a CSV on desktop → tap ☁️ Save to sync it here for the whole team.</p>
              )}
              {cloudFiles.length > 0 && (
                <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 2 }}>
                  {cloudFiles.map((f, i) => {
                    const ago = (() => {
                      const diff = Math.floor((Date.now() - new Date(f.savedAt)) / 1000)
                      if (diff < 60) return 'just now'
                      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
                      return `${Math.floor(diff / 86400)}d ago`
                    })()
                    return (
                      <div key={f.key} className="sd-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#eff6ff', borderRadius: 8, border: '1px solid #dbeafe', animationDelay: `${i * 50}ms` }}>
                        <span style={{ fontSize: 14 }}>📂</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.outlet ? outletLabel(f.outlet) : f.filename}
                          </p>
                          <p style={{ fontSize: 11, color: '#3b82f6', margin: 0 }}>
                            {f.period && <span>{formatPeriodMeta(f.period)} · </span>}
                            {f.totalTx && <span>{f.totalTx} tx · </span>}
                            {ago}
                          </p>
                        </div>
                        <button onClick={() => loadCloud(f)} disabled={cloudLoading === f.key}
                          style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {cloudLoading === f.key ? '…' : 'Load'}
                        </button>
                        <button onClick={async () => {
                          await fetch('/.netlify/functions/storedash-load', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: f.key }),
                          })
                          setCloudFiles(prev => prev.filter(x => x.key !== f.key))
                        }} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid #dbeafe', background: 'transparent', color: '#93c5fd', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Saved AI Analyses */}
            {savedAnalyses.length > 0 && (
              <div className="sd-home" style={{ background: T.CARD, border: '1px solid #e0e7ff', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>✨</span>
                  <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: '#4f46e5' }}>Saved Analyses ({savedAnalyses.length})</p>
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 2 }}>
                  {savedAnalyses.map((a, i) => {
                    const ago = (() => {
                      const diff = Math.floor((Date.now() - new Date(a.generatedAt)) / 1000)
                      if (diff < 60) return 'just now'
                      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
                      return `${Math.floor(diff / 86400)}d ago`
                    })()
                    const isActive = a.fingerprint === aiFingerprint
                    return (
                      <div key={a.fingerprint} className="sd-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: isActive ? '#eef2ff' : '#f8f9ff', borderRadius: 8, border: `1px solid ${isActive ? '#c7d2fe' : '#e0e7ff'}`, animationDelay: `${i * 50}ms` }}>
                        <span style={{ fontSize: 13 }}>🧠</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#4338ca' : '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {outletLabel(a.outlet) || a.outlet}
                            {isActive && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#4f46e5', background: '#e0e7ff', borderRadius: 4, padding: '1px 5px' }}>Current</span>}
                          </p>
                          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                            {a.period && <span>{formatPeriodMeta(a.period)} · </span>}
                            RM {(a.revenue || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })} · {ago}
                          </p>
                        </div>
                        <button onClick={() => deleteAnalysis(a.fingerprint)}
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e7ff', background: 'transparent', color: '#a5b4fc', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Kassie export tip */}
            <div className="sd-home" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: '1rem', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>💡</span>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13, color: '#92400e', margin: '0 0 4px' }}>Kassie Export Tip — to match Branch/Outlet Net Sales</p>
                <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 4px' }}>Go to <strong>Customer Report → Customer Purchase Listing</strong>, then:</p>
                <p style={{ fontSize: 12, color: '#78350f', margin: 0 }}>
                  ☑ Uncheck <strong>"Display invoices with registered Customer Only"</strong> — this includes walk-in sales that are missing otherwise
                </p>
              </div>
            </div>

            {/* Recent history */}
            {uploadHistory.length > 0 && (
              <div className="sd-home" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, margin: 0, color: T.TEXT }}>🕐 Recent uploads</p>
                  <button onClick={() => { setUploadHistory([]); localStorage.removeItem('storedash-history') }}
                    style={{ fontSize: 11, color: T.MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {uploadHistory.map((h, i) => {
                    const cached = !!fileCacheRef.current[h.filename]
                    const ago = (() => {
                      const diff = Math.floor((Date.now() - new Date(h.uploadedAt)) / 1000)
                      if (diff < 60) return 'just now'
                      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
                      return `${Math.floor(diff / 86400)}d ago`
                    })()
                    return (
                      <div key={i}
                        onClick={() => {
                          if (cached) {
                            setRawData(fileCacheRef.current[h.filename])
                            setFileName(h.filename)
                          } else {
                            fileRef.current.click()
                          }
                        }}
                        className="sd-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.BG, borderRadius: 8, border: `1px solid ${T.BORDER}`, cursor: 'pointer', transition: 'background 0.15s', animationDelay: `${i * 50}ms` }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                        onMouseLeave={e => e.currentTarget.style.background = T.BG}
                      >
                        <span style={{ fontSize: 16 }}>{cached ? '📂' : '📄'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: T.TEXT, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.filename}</p>
                          <p style={{ fontSize: 11, color: T.MUTED, margin: 0 }}>
                            {h.outlet && <span>{outletLabel(h.outlet)} · </span>}
                            {h.period && <span>{formatPeriodMeta(h.period)} · </span>}
                            {h.totalTx && <span>{h.totalTx} tx</span>}
                            {cached && <span style={{ color: GREEN }}> · Click to reload</span>}
                          </p>
                        </div>
                        {h.kassieTotal != null && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>{fmtMYRAbbr(h.kassieTotal)}</span>
                        )}
                        <span style={{ fontSize: 11, color: T.MUTED, whiteSpace: 'nowrap' }}>{ago}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Supported formats */}
            <div className="sd-home" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 4px', color: T.TEXT }}>Supported formats</p>
              <p style={{ fontSize: 12, color: T.MUTED, margin: '0 0 12px' }}>Auto-detected — just drop the file</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ background: T.BG, border: `1px solid ${T.BORDER}`, borderRadius: 8, padding: '10px 12px', flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: BLUE, margin: '0 0 4px' }}>POS Report (CustomerPurchaseListing)</p>
                  <p style={{ fontSize: 11, color: T.MUTED, margin: 0 }}>Your Kassie export — metadata rows auto-skipped</p>
                </div>
                <div style={{ background: T.BG, border: `1px solid ${T.BORDER}`, borderRadius: 8, padding: '10px 12px', flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: T.MUTED, margin: '0 0 4px' }}>Simple CSV</p>
                  <p style={{ fontSize: 11, color: T.MUTED, margin: 0 }}>Columns: date, orders, revenue, category, product, payment, salesman, brand</p>
                </div>
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '0.75rem 1rem', color: '#dc2626', fontSize: 13, marginTop: 12 }}>
            ⚠️ {error}
          </div>
        )}

        {data && (
          <div key={fileName} style={{ animation: 'sdFadeIn 0.3s ease-out both' }}>
            {/* Meta banner */}
            {data.meta?.period && (
              <div style={{ background: T.META_BG, border: `1px solid ${T.META_BORDER}`, borderRadius: 10, padding: isMobile ? '8px 12px' : '10px 16px', marginBottom: '1.5rem', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 5 : 24, flexWrap: 'wrap', alignItems: isMobile ? 'flex-start' : 'center' }}>
                {data.meta.outlet && <span style={{ fontSize: 12, color: T.META_TEXT, fontWeight: 600 }}>🏪 {outletLabel(data.meta.outlet)}</span>}
                {data.meta.period && <span style={{ fontSize: 12, color: '#3b82f6' }}>📅 {formatPeriodMeta(data.meta.period)}</span>}
                {data.meta.generated && <span style={{ fontSize: 12, color: T.MUTED }}>🕐 Generated: {data.meta.generated}</span>}
                {data.meta.totalTx && <span style={{ fontSize: 12, color: T.MUTED }}>🧾 {data.meta.totalTx} transactions</span>}
                {data.meta.kassieTotal != null && !dateRange && (
                  <span style={{ fontSize: 12, color: Math.abs(data.totalRevenue - data.meta.kassieTotal) < 1 ? '#059669' : '#d97706', fontWeight: 600 }}>
                    {Math.abs(data.totalRevenue - data.meta.kassieTotal) < 1
                      ? `✓ Kassie total matches: ${fmtMYR(data.meta.kassieTotal)}`
                      : `⚠ Kassie declares ${fmtMYR(data.meta.kassieTotal)} · StoreDash shows ${fmtMYR(data.totalRevenue)}`}
                  </span>
                )}
              </div>
            )}

            {/* ── STORE COMPARISON ── */}
            {compareData && (
              <>
                <SectionLabel id="sec-compare">Store comparison</SectionLabel>

                {/* Side-by-side KPI comparison */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[
                    { icon: '💰', label: 'Net revenue', a: data.totalRevenue, b: compareData.totalRevenue, fmt: fmtMYR },
                    { icon: '🛒', label: 'Total orders', a: data.totalOrders, b: compareData.totalOrders, fmt: fmtNum },
                    { icon: '🧾', label: 'Avg order value', a: data.aov, b: compareData.aov, fmt: fmtMYR },
                    { icon: '🏷️', label: 'Total discounts', a: data.totalDiscount, b: compareData.totalDiscount, fmt: fmtMYR, invert: true },
                  ].map(({ icon, label, a, b, fmt, invert }) => {
                    const diff = b > 0 ? ((a - b) / b) * 100 : 0
                    return (
                      <div key={label} style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <p style={{ fontSize: 11, color: T.MUTED, margin: '0 0 10px' }}>{icon} {label}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: BLUE }} />
                              <span style={{ fontSize: 11, color: T.MUTED }}>{nameA}</span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: T.TEXT }}>{fmt(a)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: STORE_B_COLOR }} />
                              <span style={{ fontSize: 11, color: T.MUTED }}>{nameB}</span>
                              <span style={{ fontSize: 16, fontWeight: 700, color: T.TEXT }}>{fmt(b)}</span>
                            </div>
                          </div>
                          <DeltaBadge value={diff} invert={invert} />
                        </div>
                        {/* Visual bar comparison */}
                        <div style={{ marginTop: 10 }}>
                          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5, marginBottom: 4 }}>
                            <div style={{ background: BLUE, height: '100%', borderRadius: 4, width: `${Math.min(100, a / Math.max(a, b) * 100)}%` }} />
                          </div>
                          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
                            <div style={{ background: STORE_B_COLOR, height: '100%', borderRadius: 4, width: `${Math.min(100, b / Math.max(a, b) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Revenue overlay trend */}
                <Card title="Revenue trend — store comparison" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                    {[{ color: BLUE, name: nameA }, { color: STORE_B_COLOR, name: nameB }].map(s => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.MUTED }}>
                        <div style={{ width: 20, height: 3, borderRadius: 2, background: s.color }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={comparisonTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.MUTED }} interval={Math.max(0, Math.floor(comparisonTrend.length / 7))} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={(v, name) => [fmtMYR(v), name === 'storeA' ? nameA : nameB]} />
                      <Line type="monotone" dataKey="storeA" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="storeB" stroke={STORE_B_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                {/* Category comparison */}
                <Card title="Revenue by category — comparison">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={categoryComparison} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.MUTED }} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={(v, name) => [fmtMYR(v), name === 'storeA' ? nameA : nameB]} />
                      <Bar dataKey="storeA" fill={BLUE} radius={[4,4,0,0]} name="storeA" />
                      <Bar dataKey="storeB" fill={STORE_B_COLOR} radius={[4,4,0,0]} name="storeB" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    {[{ color: BLUE, name: nameA }, { color: STORE_B_COLOR, name: nameB }].map(s => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.MUTED }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Month-over-month comparison */}
                <Card title="Monthly revenue — month-over-month comparison" style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[{ color: BLUE, name: nameA, mom: data.momChange }, { color: STORE_B_COLOR, name: nameB, mom: compareData.momChange }].map(s => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                        <span style={{ color: T.MUTED }}>{s.name}</span>
                        <DeltaBadge value={s.mom} />
                        <span style={{ color: T.MUTED, fontSize: 11 }}>MoM</span>
                      </div>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyComparison} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.MUTED }} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={(v, name) => [fmtMYR(v), name === 'storeA' ? nameA : nameB]} />
                      <Bar dataKey="storeA" fill={BLUE} radius={[4,4,0,0]} name="storeA" />
                      <Bar dataKey="storeB" fill={STORE_B_COLOR} radius={[4,4,0,0]} name="storeB" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Top products comparison */}
                <Card title="Top products — comparison" style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                    {[{ color: BLUE, name: nameA }, { color: STORE_B_COLOR, name: nameB }].map(s => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.MUTED }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {productComparison.map((p, i) => {
                      const maxVal = Math.max(p.storeA, p.storeB, 1)
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: T.TEXT, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <span style={{ fontSize: 11, color: BLUE, fontWeight: 600 }}>{p.storeA > 0 ? fmtMYR(p.storeA) : '—'}</span>
                              <span style={{ fontSize: 11, color: STORE_B_COLOR, fontWeight: 600 }}>{p.storeB > 0 ? fmtMYR(p.storeB) : '—'}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ background: '#e5e7eb', borderRadius: 3, height: 5 }}>
                              <div style={{ background: BLUE, height: '100%', borderRadius: 3, width: `${Math.round(p.storeA / maxVal * 100)}%` }} />
                            </div>
                            <div style={{ background: '#e5e7eb', borderRadius: 3, height: 5 }}>
                              <div style={{ background: STORE_B_COLOR, height: '100%', borderRadius: 3, width: `${Math.round(p.storeB / maxVal * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              </>
            )}

            {/* If no comparison yet, show a prompt */}
            {!compareData && (
              <div
                onDragOver={e => { e.preventDefault(); setDraggingB(true) }}
                onDragLeave={() => setDraggingB(false)}
                onDrop={e => { e.preventDefault(); setDraggingB(false); handleCompareFile(e.dataTransfer.files[0]) }}
                onClick={() => compareFileRef.current.click()}
                style={{
                  background: draggingB ? '#ede9fe' : '#f5f3ff',
                  border: `2px dashed ${draggingB ? STORE_B_COLOR : 'rgba(124,58,237,0.4)'}`,
                  borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '0.5rem',
                  display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between',
                  flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 0,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: STORE_B_COLOR, margin: '0 0 2px' }}>
                    {draggingB ? '📂 Drop Store B CSV here' : 'Compare with another store'}
                  </p>
                  <p style={{ fontSize: 12, color: T.MUTED, margin: 0 }}>
                    {draggingB ? 'Release to load Store B' : 'Drag & drop a CSV here, or click to browse'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <input ref={compareFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleCompareFile(e.target.files[0])} />
                  <button onClick={loadDemoCompare}
                    style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: `1px solid ${STORE_B_COLOR}`, background: 'transparent', color: STORE_B_COLOR, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Try demo comparison
                  </button>
                  <button onClick={() => compareFileRef.current.click()}
                    style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: STORE_B_COLOR, color: '#fff', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Upload Store B CSV
                  </button>
                </div>
              </div>
            )}

            {/* ── AI ANALYSIS ── */}
            <div style={{ marginBottom: '1.25rem' }}>
              <SectionLabel id="sec-ai">AI analysis</SectionLabel>

              {/* Idle state */}
              {!aiResult && !aiLoading && (
                <div style={{
                  position: 'relative', overflow: 'hidden', borderRadius: 16,
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
                  padding: isMobile ? '28px 20px' : '36px 32px',
                  display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'center', gap: 24,
                }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(37,99,235,0.12) 0%, transparent 50%)', pointerEvents: 'none' }} />
                  <div style={{ textAlign: isMobile ? 'center' : 'left', flex: 1, position: 'relative' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>✦ AI Sales Intelligence</div>
                    <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 10 }}>
                      Deep analysis + Malaysia<br />market comparison
                    </div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, maxWidth: 380 }}>
                      Hot products · strengths · action items · benchmarked against other DJI outlets across Malaysia.
                    </div>
                    {savedAnalyses.some(a => a.fingerprint === aiFingerprint) && (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span>✓</span><span>Saved analysis found — loads instantly, no API call</span>
                      </div>
                    )}
                    {aiError && <div style={{ marginTop: 12, fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '6px 12px', display: 'inline-block' }}>{aiError}</div>}
                  </div>
                  <div style={{ flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <button className="sd-ai-btn" disabled={!!isDemo} onClick={() => {
                      if (savedAnalyses.some(a => a.fingerprint === aiFingerprint)) {
                        setShowRegenConfirm(true)
                      } else {
                        runAIAnalysis()
                      }
                    }} style={{
                      color: '#fff', border: 'none', borderRadius: 12,
                      padding: isMobile ? '12px 28px' : '13px 32px',
                      fontSize: 14, fontWeight: 700,
                      cursor: isDemo ? 'not-allowed' : 'pointer',
                      boxShadow: isDemo ? 'none' : '0 8px 24px rgba(99,102,241,0.45)',
                      whiteSpace: 'nowrap',
                    }}>✨ Generate Analysis</button>
                    {isDemo && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: 160, lineHeight: 1.4 }}>
                        Not available for demo data — upload your own CSV to use AI Analysis
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Loading state */}
              {aiLoading && (
                <div style={{
                  borderRadius: 16, background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
                  padding: '48px 20px', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 16,
                }}>
                  <div style={{ position: 'relative', width: 48, height: 48 }}>
                    <div style={{ position: 'absolute', inset: 0, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'splashSpin 0.8s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: 6, border: '2px solid rgba(37,99,235,0.2)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'splashSpin 1.2s linear infinite reverse' }} />
                  </div>
                  <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 700 }}>Analysing your store…</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>Comparing against DJI Malaysia market benchmarks</div>
                </div>
              )}

              {/* Results */}
              {aiResult && (
                <div className="sd-pop" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Summary banner */}
                  {aiResult.summary && (
                    <div style={{
                      borderRadius: 14, padding: '18px 20px',
                      background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 10% 50%, rgba(99,102,241,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>✦ Summary</div>
                            {aiCached && <span style={{ fontSize: 10, fontWeight: 700, color: '#6ee7b7', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 4, padding: '1px 6px' }}>✓ Saved</span>}
                          </div>
                          <div style={{ fontSize: 13.5, color: '#e2e8f0', lineHeight: 1.7, maxWidth: 640 }}>{aiResult.summary}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {aiCached && (
                            <button onClick={() => { setAiResult(null); setAiCached(false); setTimeout(runAIAnalysis, 50) }}
                              style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ↺ Refresh
                            </button>
                          )}
                          <button onClick={() => { setAiResult(null); setAiError(null); setAiCached(false) }}
                            style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ✕
                          </button>
                          {aiFingerprint && (
                            <button onClick={() => deleteAnalysis(aiFingerprint)}
                              style={{ fontSize: 11, color: 'rgba(248,113,113,0.7)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              🗑
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VS Malaysia */}
                  {aiResult.vsMarket && (
                    <div className="sd-pop" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 14, overflow: 'hidden', animationDelay: '80ms' }}>
                      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15 }}>🇲🇾</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT }}>vs Malaysia Market</span>
                      </div>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                          {[
                            { label: 'Revenue', value: aiResult.vsMarket.revenuePosition },
                            { label: 'AOV', value: aiResult.vsMarket.aovPosition },
                            { label: 'Return Rate', value: aiResult.vsMarket.returnRatePosition },
                          ].map(({ label, value }) => {
                            const isGood = /top|above|excellent|good/i.test(value)
                            const isBad = /below|needs/i.test(value)
                            const bg = isGood ? '#f0fdf4' : isBad ? '#fef2f2' : '#f8fafc'
                            const border = isGood ? '#bbf7d0' : isBad ? '#fca5a5' : T.BORDER
                            const color = isGood ? '#166534' : isBad ? '#dc2626' : T.MUTED
                            return (
                              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '6px 12px' }}>
                                <div style={{ fontSize: 10, color: T.MUTED, fontWeight: 600, marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color, textTransform: 'capitalize' }}>{value}</div>
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.65 }}>{aiResult.vsMarket.insight}</div>
                      </div>
                    </div>
                  )}

                  {/* Hot Products + Strengths */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 10 }}>
                    {/* Hot Products */}
                    {aiResult.hotProducts?.length > 0 && (
                      <div className="sd-pop" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 14, overflow: 'hidden', animationDelay: '160ms' }}>
                        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15 }}>🔥</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT }}>Hot Products</span>
                        </div>
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {aiResult.hotProducts.map((p, i) => {
                            const medals = ['🥇','🥈','🥉','4️⃣']
                            return (
                              <div key={i} className="sd-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', animationDelay: `${i * 70}ms` }}>
                                <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{medals[i] || (i + 1)}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT }}>{p.name}</span>
                                    {p.badge && <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 5, padding: '1px 6px' }}>{p.badge}</span>}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: T.MUTED, lineHeight: 1.5 }}>{p.insight}</div>
                                </div>
                                {p.revenue > 0 && <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, flexShrink: 0 }}>RM {p.revenue.toLocaleString()}</div>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Strengths */}
                    {aiResult.strengths?.length > 0 && (
                      <div className="sd-pop" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, overflow: 'hidden', animationDelay: '240ms' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15 }}>💪</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>What's Working</span>
                        </div>
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {aiResult.strengths.map((s, i) => (
                            <div key={i} className="sd-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', animationDelay: `${i * 70}ms` }}>
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#dcfce7', border: '1.5px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#15803d', marginBottom: 2 }}>{s.title}</div>
                                <div style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.5 }}>{s.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Items */}
                  {aiResult.improvements?.length > 0 && (
                    <div className="sd-pop" style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 14, overflow: 'hidden', animationDelay: '320ms' }}>
                      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15 }}>🎯</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT }}>Action Items</span>
                        <span style={{ fontSize: 11, color: T.MUTED, marginLeft: 2 }}>— ordered by priority</span>
                      </div>
                      <div style={{ padding: '4px 0' }}>
                        {aiResult.improvements.map((imp, i) => {
                          const isHigh = imp.priority === 'high'
                          return (
                            <div key={i} className="sd-row" style={{ display: 'flex', gap: 14, padding: '12px 16px', borderBottom: i < aiResult.improvements.length - 1 ? `1px solid ${T.BORDER}` : 'none', alignItems: 'flex-start', animationDelay: `${i * 80}ms` }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, paddingTop: 2 }}>
                                <div style={{ width: 22, height: 22, borderRadius: 6, background: isHigh ? '#fef2f2' : '#fff7ed', border: `1.5px solid ${isHigh ? '#fca5a5' : '#fdba74'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: isHigh ? RED : ORANGE }}>{i + 1}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 9.5, fontWeight: 800, color: isHigh ? RED : ORANGE, textTransform: 'uppercase', letterSpacing: '0.08em', background: isHigh ? '#fef2f2' : '#fff7ed', border: `1px solid ${isHigh ? '#fca5a5' : '#fdba74'}`, borderRadius: 4, padding: '1px 5px' }}>{imp.priority}</span>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.TEXT }}>{imp.area}</span>
                                </div>
                                <div style={{ fontSize: 12.5, color: '#1e293b', marginBottom: 3 }}>→ {imp.action}</div>
                                <div style={{ fontSize: 11.5, color: T.MUTED, lineHeight: 1.5 }}>{imp.impact}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── MONTHLY TARGET ── */}
            <div className="sd-card" style={{ marginBottom: '1.25rem' }}>
              <SectionLabel id="sec-target">Monthly target</SectionLabel>
              <div style={{ background: T.CARD, border: `1px solid ${T.BORDER}`, borderRadius: 12, padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {editingMonthlyTarget ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: T.MUTED }}>RM</span>
                    <input
                      type="number"
                      autoFocus
                      value={monthlyTargetInput}
                      onChange={e => setMonthlyTargetInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveMonthlyTarget(); if (e.key === 'Escape') setEditingMonthlyTarget(false) }}
                      placeholder="e.g. 150000"
                      style={{ flex: '1 1 140px', minWidth: 100, fontSize: 14, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT }}
                    />
                    <button onClick={saveMonthlyTarget}
                      style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: 'none', background: BLUE, color: '#fff', cursor: 'pointer' }}>
                      Save
                    </button>
                    <button onClick={() => setEditingMonthlyTarget(false)}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.MUTED, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                ) : monthlyTarget > 0 ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                      <div>
                        <span style={{ fontSize: 20, fontWeight: 800, color: T.TEXT }}>{fmtMYR(data.totalRevenue)}</span>
                        <span style={{ fontSize: 13, color: T.MUTED }}> / {fmtMYR(monthlyTarget)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: monthlyTargetPct >= 100 ? GREEN : monthlyTargetPct >= 70 ? BLUE : ORANGE }}>
                          {monthlyTargetPct.toFixed(0)}%
                        </span>
                        <button onClick={() => { setMonthlyTargetInput(String(monthlyTarget)); setEditingMonthlyTarget(true) }}
                          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.MUTED, cursor: 'pointer' }}>
                          Edit
                        </button>
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: T.BORDER, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${monthlyTargetPct}%`, borderRadius: 4, background: monthlyTargetPct >= 100 ? GREEN : monthlyTargetPct >= 70 ? BLUE : ORANGE, transition: 'width 0.5s ease' }} />
                    </div>
                    <p style={{ fontSize: 11.5, color: T.MUTED, margin: '8px 0 0' }}>
                      {monthlyTargetPct >= 100
                        ? `Target reached! ${fmtMYR(data.totalRevenue - monthlyTarget)} over.`
                        : `${fmtMYR(monthlyTarget - data.totalRevenue)} remaining to hit target.`}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 13, color: T.MUTED }}>No monthly target set for this outlet yet.</span>
                    <button onClick={() => { setMonthlyTargetInput(''); setEditingMonthlyTarget(true) }}
                      style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: 'none', background: BLUE, color: '#fff', cursor: 'pointer' }}>
                      Set target
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── SALES OVERVIEW ── */}
            {/* ── AUTO INSIGHTS ── */}
            {insights.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <SectionLabel id="sec-insights">Auto insights</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '260px'}, 1fr))`, gap: 8 }}>
                  {insights.map((ins, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                      background: ins.type === 'positive' ? '#f0fdf4' : ins.type === 'warning' ? '#fff7ed' : T.CARD,
                      border: `1px solid ${ins.type === 'positive' ? '#bbf7d0' : ins.type === 'warning' ? '#fed7aa' : T.BORDER}`,
                      borderRadius: 10
                    }}>
                      <span style={{ fontSize: 16, lineHeight: 1.4 }}>{ins.icon}</span>
                      <span style={{ fontSize: 12.5, color: T.TEXT, lineHeight: 1.5 }}>{ins.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <SectionLabel id="sec-overview">Sales overview</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
              <KPI icon="💰" label="Net revenue" value={fmtMYR(data.totalRevenue)}
                delta={`${data.growth >= 0 ? '+' : ''}${data.growth.toFixed(1)}% trend`}
                color={data.growth >= 0 ? '#16a34a' : '#dc2626'} />
              <KPI icon="🛒" label="Total sales" value={fmtNum(data.totalOrders)} delta="units sold" />
              <KPI icon="🧾" label="Avg order value" value={fmtMYR(data.aov)} delta="per transaction" />
              <KPI icon="🏷️" label="Total discounts" value={fmtMYR(data.totalDiscount)}
                delta={data.totalRevenue > 0 ? `${((data.totalDiscount / (data.totalRevenue + data.totalDiscount)) * 100).toFixed(1)}% of gross` : ''} color={ORANGE} />
              <KPI icon="📉" label="RSP gap" value={fmtMYR(data.rspGap)} delta="revenue below RSP" color={RED} />
              <KPI icon="⚡" label="Peak hour" value={fmtHour(data.peakHour)} delta={`${DAYS[data.peakDay]} is busiest`} />
            </div>

            {/* Revenue trend */}
            <Card title={compareData ? `Revenue trend — ${nameA} vs ${nameB}` : 'Revenue trend'}>
              {compareData && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                  {[{ color: BLUE, name: nameA }, { color: STORE_B_COLOR, name: nameB }].map(s => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.MUTED }}>
                      <div style={{ width: 20, height: 3, borderRadius: 2, background: s.color }} />
                      {s.name}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    {compareData ? (
                      <LineChart data={comparisonTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: T.MUTED }} interval={Math.max(0, Math.floor(comparisonTrend.length / 7))} />
                        <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                        <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={(v, name) => [fmtMYR(v), name === 'storeA' ? nameA : nameB]} />
                        <Line type="monotone" dataKey="storeA" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="storeB" stroke={STORE_B_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="5 3" />
                      </LineChart>
                    ) : (
                      <LineChart data={trend} margin={{ top: 28, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.MUTED }} interval={Math.max(0, Math.floor(trend.length / 7))} />
                        <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                        <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={v => [fmtMYR(v), 'Revenue']} />
                        <Line type="monotone" dataKey="revenue" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        {peakTrendPoint && (
                          <ReferenceDot x={peakTrendPoint.date} y={peakTrendPoint.revenue} r={5} fill={BLUE} stroke="#fff" strokeWidth={2}
                            label={{ value: `${peakTrendPoint.date} · ${fmtMYRAbbr(peakTrendPoint.revenue)}`, position: 'top', fontSize: 10, fill: BLUE, fontWeight: 700 }} />
                        )}
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
                {!compareData && !isMobile && <MiniCalendar trend={trend} />}
              </div>
            </Card>

            {/* ── RETURNS & REFUNDS ── */}
            <SectionLabel id="sec-returns">Returns & refunds</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
              <KPI icon="💵" label="Gross revenue" value={fmtMYR(data.grossRevenue)} delta="before returns" />
              <KPI icon="↩️" label="Return revenue" value={fmtMYR(data.returnRevenue)} delta={`${data.returnCount} return transactions`} color={RED} />
              <KPI icon="✅" label="Net revenue" value={fmtMYR(data.totalRevenue)} delta="gross minus returns" color={GREEN} />
              <KPI icon="📊" label="Return rate" value={`${data.returnRate.toFixed(1)}%`}
                delta={data.returnRate < 5 ? 'Healthy' : data.returnRate < 10 ? 'Monitor closely' : 'High — investigate'}
                color={data.returnRate < 5 ? GREEN : data.returnRate < 10 ? ORANGE : RED} />
            </div>

            {/* ── RETURN BREAKDOWN ── */}
            {(data.topReturnedProducts?.length > 0 || data.salesmen.some(s => s.returnCount > 0)) && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: '1.25rem' }}>
                {data.topReturnedProducts?.length > 0 && (
                  <Card title="Returns by product">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.topReturnedProducts.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: T.MUTED, minWidth: 16, textAlign: 'right' }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: T.TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.name}</span>
                              <span style={{ fontSize: 11, color: p.returnRate >= 15 ? RED : T.MUTED }}>{p.returnRate}% · {p.returnCount} returns</span>
                            </div>
                            <div style={{ height: 4, background: T.BORDER, borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${Math.min(p.returnRate, 100)}%`, background: p.returnRate >= 15 ? RED : ORANGE, borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {data.salesmen.some(s => s.returnCount > 0 && s.forwardSales > 0) && (
                  <Card title="Returns by salesman">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.salesmen.filter(s => s.returnCount > 0 && s.forwardSales > 0).sort((a, b) => b.returnCount - a.returnCount).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: T.MUTED, minWidth: 16, textAlign: 'right' }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 500, color: T.TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
                              <span style={{ fontSize: 11, color: s.returnRate >= 15 ? RED : T.MUTED, flexShrink: 0, whiteSpace: 'nowrap' }}>{s.returnRate}% · {s.returnCount} ret · {fmtMYR(s.returnRevenue)}</span>
                            </div>
                            <div style={{ height: 4, background: T.BORDER, borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${Math.min(s.returnRate, 100)}%`, background: s.returnRate >= 15 ? RED : ORANGE, borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ── MONTH-OVER-MONTH ── */}
            <SectionLabel id="sec-mom">Month-over-month</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (compareData ? '1fr 1fr 1.5fr' : '1fr 2fr'), gap: 12, marginBottom: '1rem' }}>
              {/* Store A MoM card — redesigned */}
              {(() => {
                const MomCard = ({ title, current, prev, currentLabel, prevLabel, change, color }) => {
                  const isUp = change > 0
                  const isDown = change < 0
                  const arrowColor = isUp ? GREEN : isDown ? RED : T.MUTED
                  const arrow = isUp ? '▲' : isDown ? '▼' : '—'
                  const maxVal = Math.max(current, prev, 1)
                  return (
                    <Card title={title}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: T.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{currentLabel || 'This month'}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{fmtMYR(current)}</div>
                        </div>
                        <div style={{ textAlign: 'center', paddingBottom: 4 }}>
                          <div style={{ fontSize: 18, color: arrowColor, lineHeight: 1 }}>{arrow}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: arrowColor, marginTop: 2 }}>{change > 0 ? '+' : ''}{change.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          { label: prevLabel || 'Prev month', value: prev, c: '#94a3b8' },
                          { label: currentLabel || 'This month', value: current, c: color },
                        ].map(({ label, value, c }) => (
                          <div key={label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 11, color: T.MUTED }}>{label}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{fmtMYR(value)}</span>
                            </div>
                            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
                              <div style={{ background: c, height: '100%', borderRadius: 4, width: `${Math.min(100, value / maxVal * 100)}%`, transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )
                }
                return (
                  <MomCard
                    title={compareData ? `${nameA} — MoM` : 'MoM revenue change'}
                    current={data.momCurrent} prev={data.momPrev}
                    currentLabel={fmtMonth(data.momCurrentLabel)} prevLabel={fmtMonth(data.momPrevLabel)}
                    change={data.momChange} color={BLUE}
                  />
                )
              })()}

              {/* Store B MoM card — only when comparing */}
              {compareData && (() => {
                const isUp = compareData.momChange > 0, isDown = compareData.momChange < 0
                const arrowColor = isUp ? GREEN : isDown ? RED : T.MUTED
                const arrow = isUp ? '▲' : isDown ? '▼' : '—'
                const maxVal = Math.max(compareData.momCurrent, compareData.momPrev, 1)
                return (
                  <Card title={`${nameB} — MoM`}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: T.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{fmtMonth(compareData.momCurrentLabel) || 'This month'}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: STORE_B_COLOR, lineHeight: 1 }}>{fmtMYR(compareData.momCurrent)}</div>
                      </div>
                      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
                        <div style={{ fontSize: 18, color: arrowColor, lineHeight: 1 }}>{arrow}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: arrowColor, marginTop: 2 }}>{compareData.momChange > 0 ? '+' : ''}{compareData.momChange.toFixed(1)}%</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: fmtMonth(compareData.momPrevLabel) || 'Prev month', value: compareData.momPrev, c: '#94a3b8' },
                        { label: fmtMonth(compareData.momCurrentLabel) || 'This month', value: compareData.momCurrent, c: STORE_B_COLOR },
                      ].map(({ label, value, c }) => (
                        <div key={label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: T.MUTED }}>{label}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{fmtMYR(value)}</span>
                          </div>
                          <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
                            <div style={{ background: c, height: '100%', borderRadius: 4, width: `${Math.min(100, value / maxVal * 100)}%`, transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )
              })()}

              {/* Monthly bar chart — single store or comparison */}
              <Card title={compareData ? 'Monthly revenue — both stores' : 'Monthly revenue'}>
                <ResponsiveContainer width="100%" height={160}>
                  {compareData ? (
                    <BarChart data={monthlyComparison} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.MUTED }} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={(v, name) => [fmtMYR(v), name === 'storeA' ? nameA : nameB]} />
                      <Bar dataKey="storeA" fill={BLUE} radius={[4,4,0,0]} name="storeA" />
                      <Bar dataKey="storeB" fill={STORE_B_COLOR} radius={[4,4,0,0]} name="storeB" />
                    </BarChart>
                  ) : (
                    <BarChart data={data.monthlyBreakdown} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.MUTED }} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={v => [fmtMYR(v), 'Revenue']} />
                      <Bar dataKey="revenue" radius={[4,4,0,0]}>
                        {data.monthlyBreakdown.map((m, i) => (
                          <Cell key={i} fill={m.key === data.momCurrentLabel ? BLUE : '#bfdbfe'} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
                {compareData && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    {[{ color: BLUE, name: nameA }, { color: STORE_B_COLOR, name: nameB }].map(s => (
                      <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.MUTED }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Category + Products */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 12, marginTop: 12 }}>
              <Card title="Sales by product type" action={!productTypeComparison && <span style={{ fontSize: 10, color: T.MUTED }}>click bar to drill down</span>}>
                <ResponsiveContainer width="100%" height={190}>
                  {productTypeComparison ? (
                    <BarChart data={productTypeComparison} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: T.MUTED }} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": "
                        formatter={(v, key) => [fmtMYR(v), key === 'storeA' ? nameA : nameB]} />
                      <Bar dataKey="storeA" fill={BLUE} radius={[4,4,0,0]} name={nameA} />
                      <Bar dataKey="storeB" fill={STORE_B_COLOR} radius={[4,4,0,0]} name={nameB} />
                    </BarChart>
                  ) : (
                    <BarChart data={data.productTypes} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                      onClick={e => e?.activePayload?.[0] && setPtypeModal(e.activePayload[0].payload.name)}
                      style={{ cursor: 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: T.MUTED }} />
                      <YAxis tick={{ fontSize: 11, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                      <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": "
                        formatter={(v, key) => key === 'revenue' ? [fmtMYR(v), 'Revenue'] : [fmtNum(v), 'Units sold']} />
                      <Bar dataKey="revenue" radius={[4,4,0,0]}>
                        {data.productTypes.map((pt, i) => (
                          <Cell key={i} fill={PTYPE_COLORS[pt.name] || '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                  {productTypeComparison ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.MUTED }}><div style={{ width: 8, height: 8, borderRadius: 2, background: BLUE }} />{nameA}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.MUTED }}><div style={{ width: 8, height: 8, borderRadius: 2, background: STORE_B_COLOR }} />{nameB}</div>
                    </>
                  ) : PTYPES.map(name => {
                    const pt = data.productTypes.find(p => p.name === name)
                    const totalRev = data.productTypes.reduce((s, p) => s + p.revenue, 0)
                    const pct = totalRev > 0 && pt ? Math.round(pt.revenue / totalRev * 100) : 0
                    return pt ? (
                      <button key={name} onClick={() => setPtypeModal(name)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 7px', borderRadius: 6, transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PTYPE_COLORS[name] || '#94a3b8' }} />
                        {name} · {fmtNum(pt.orders)} units · {pct}%
                      </button>
                    ) : null
                  })}
                </div>
              </Card>

              {/* Product type drill-down modal */}
              {ptypeModal && data.productTypeItems?.[ptypeModal] && (
                <div onClick={() => setPtypeModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                  <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: PTYPE_COLORS[ptypeModal] || '#94a3b8' }} />
                        <span style={{ fontWeight: 700, fontSize: 15, color: T.TEXT }}>{ptypeModal} — breakdown</span>
                      </div>
                      <button onClick={() => setPtypeModal(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: T.MUTED, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(() => {
                        const items = data.productTypeItems[ptypeModal]
                        const maxRev = items[0]?.revenue || 1
                        const totalRev = items.reduce((s, p) => s + p.revenue, 0)
                        return items.map((p, i) => (
                          <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: T.TEXT, maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                              <span style={{ fontSize: 11, color: T.MUTED, flexShrink: 0 }}>{fmtMYR(p.revenue)} · {Math.round(p.revenue / totalRev * 100)}%</span>
                            </div>
                            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
                              <div style={{ background: PTYPE_COLORS[ptypeModal] || BLUE, height: '100%', borderRadius: 4, width: `${Math.round(p.revenue / maxRev * 100)}%` }} />
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                    <div style={{ paddingTop: 12, borderTop: `1px solid ${T.BORDER}`, marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.MUTED }}>
                      <span>{data.productTypeItems[ptypeModal].length} products</span>
                      <span>Total: <strong style={{ color: T.TEXT }}>{fmtMYR(data.productTypeItems[ptypeModal].reduce((s, p) => s + p.revenue, 0))}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              <Card
                title="Top products"
                action={
                  <input
                    placeholder="Search..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT, outline: 'none', width: 110 }}
                  />
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
                  {activeProducts.length === 0 && <p style={{ fontSize: 12, color: T.MUTED, textAlign: 'center' }}>No products found</p>}
                  {activeProducts.map((p, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: T.TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: T.MUTED, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtMYR(p.revenue)}</span>
                      </div>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
                        <div style={{ background: COLORS[i % COLORS.length], height: '100%', borderRadius: 4, width: `${activeProducts[0] ? Math.round(p.revenue / activeProducts[0].revenue * 100) : 0}%`, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* ── STAFF PERFORMANCE ── */}
            <SectionLabel id="sec-staff">Staff performance</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <Card
                title="Salesman leaderboard"
                action={
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {compareData && (
                      <div style={{ display: 'flex', gap: 2, background: '#e5e7eb', borderRadius: 8, padding: 2 }}>
                        <button onClick={() => setStaffView('a')} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, border: 'none', background: staffView === 'a' ? '#fff' : 'transparent', color: staffView === 'a' ? BLUE : T.MUTED, fontWeight: staffView === 'a' ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{nameA}</button>
                        <button onClick={() => setStaffView('b')} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, border: 'none', background: staffView === 'b' ? '#fff' : 'transparent', color: staffView === 'b' ? STORE_B_COLOR : T.MUTED, fontWeight: staffView === 'b' ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{nameB}</button>
                      </div>
                    )}
                    {staffView === 'a' && (
                      <button onClick={() => setEditingTargets(v => !v)}
                        style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: `1px solid ${T.BORDER_STRONG}`, background: editingTargets ? BLUE : T.BG, color: editingTargets ? '#fff' : T.MUTED, cursor: 'pointer' }}>
                        {editingTargets ? 'Done' : 'Set targets'}
                      </button>
                    )}
                  </div>
                }
              >
                {(() => {
                  const staffData = (compareData && staffView === 'b') ? compareData : data
                  const staffColor = (compareData && staffView === 'b') ? STORE_B_COLOR : BLUE
                  const staffBarBg = staffColor === STORE_B_COLOR ? '#ddd6fe' : '#bfdbfe'
                  const filtered = search ? staffData.salesmen.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : staffData.salesmen
                  const LB_LIMIT = 10
                  const visibleStaff = (!search && !showAllLeaderboard) ? filtered.slice(0, LB_LIMIT) : filtered
                  const hasMoreStaff = !search && filtered.length > LB_LIMIT
                  return (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <input
                          placeholder="Search salesman..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT, outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {visibleStaff.map((s, i) => {
                          const target = staffView === 'a' ? (targets[s.name] || 0) : 0
                          const pct = target > 0 ? Math.min(100, s.revenue / target * 100) : 0
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <span style={{ width: 20, fontSize: 11, color: T.MUTED, textAlign: 'right', paddingTop: 2 }}>#{i + 1}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, color: T.TEXT }}>{s.name}</span>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: T.MUTED }}>{fmtNum(s.orders)} orders</span>
                                    <span style={{ fontSize: 11, color: i === 0 ? staffColor : T.MUTED, fontWeight: i === 0 ? 700 : 400 }}>{fmtMYR(s.revenue)}</span>
                                  </div>
                                </div>
                                {staffView === 'a' && editingTargets ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 10, color: T.MUTED }}>Target RM</span>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={targets[s.name] || ''}
                                      onChange={e => setTargets(t => ({ ...t, [s.name]: parseFloat(e.target.value) || 0 }))}
                                      style={{ width: 90, fontSize: 11, padding: '3px 6px', borderRadius: 6, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT, outline: 'none' }}
                                    />
                                    {target > 0 && <span style={{ fontSize: 10, color: pct >= 100 ? GREEN : T.MUTED }}>{pct.toFixed(0)}%</span>}
                                  </div>
                                ) : staffView === 'a' && target > 0 ? (
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                      <span style={{ fontSize: 10, color: T.MUTED }}>Target: {fmtMYR(target)}</span>
                                      <span style={{ fontSize: 10, color: pct >= 100 ? GREEN : ORANGE, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                                    </div>
                                    <div style={{ background: '#e5e7eb', borderRadius: 4, height: 5 }}>
                                      <div style={{ background: pct >= 100 ? GREEN : pct >= 70 ? BLUE : ORANGE, height: '100%', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }} />
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ background: '#e5e7eb', borderRadius: 4, height: 4 }}>
                                    <div style={{ background: i === 0 ? staffColor : staffBarBg, height: '100%', borderRadius: 4, width: `${filtered[0] ? Math.round(s.revenue / filtered[0].revenue * 100) : 0}%` }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {filtered.length === 0 && <p style={{ fontSize: 12, color: T.MUTED, textAlign: 'center' }}>No results</p>}
                      </div>
                      {hasMoreStaff && (
                        <button
                          onClick={() => setShowAllLeaderboard(v => !v)}
                          style={{ marginTop: 14, width: '100%', padding: '8px 0', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.MUTED, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {showAllLeaderboard ? `▲ Show top ${LB_LIMIT} only` : `▼ Show all ${filtered.length} salespeople`}
                        </button>
                      )}
                    </>
                  )
                })()}
              </Card>

              <Card title="Payment methods">
                {(() => {
                  const totalPayRev = data.payments.reduce((s, p) => s + p.revenue, 0)
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={data.payments} layout="vertical" margin={{ top: 0, right: 55, bottom: 0, left: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: T.MUTED }} tickFormatter={v => fmtMYRAbbr(v)} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: T.MUTED }} width={80} tickFormatter={v => v.length > 16 ? v.slice(0, 14) + '…' : v} />
                          <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": "
                            formatter={(v, _key, entry) => [`${fmtMYR(v)} (${totalPayRev > 0 ? Math.round(v / totalPayRev * 100) : 0}%)`, 'Revenue']} />
                          <Bar dataKey="revenue" radius={[0,4,4,0]} label={{ position: 'right', formatter: v => totalPayRev > 0 ? `${Math.round(v / totalPayRev * 100)}%` : '', fontSize: 11, fill: T.MUTED }}>
                            {data.payments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {data.payments.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.MUTED }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                            {p.name.length > 16 ? p.name.slice(0, 14) + '…' : p.name} ({fmtNum(p.count)} · {totalPayRev > 0 ? Math.round(p.revenue / totalPayRev * 100) : 0}%)
                          </div>
                        ))}
                      </div>
                    </>
                  )
                })()}
              </Card>
            </div>

            {/* Product Count */}
            <SectionLabel id="sec-products">Product count</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>

              {/* Left: all products — comparison-aware */}
              <Card
                title={allProductsComparison
                  ? `All products · ${nameA} vs ${nameB}`
                  : `All products · ${data.allProducts.length} items`}
                action={
                  <input
                    placeholder="Search product..."
                    value={allProductSearch}
                    onChange={e => setAllProductSearch(e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT, outline: 'none', width: 130 }}
                  />
                }
              >
                {(() => {
                  if (allProductsComparison) {
                    // Comparison view: side-by-side bars per product
                    const filtered = allProductSearch
                      ? allProductsComparison.filter(p => p.name.toLowerCase().includes(allProductSearch.toLowerCase()))
                      : allProductsComparison
                    const maxUnits = Math.max(...allProductsComparison.map(p => Math.max(p.unitsA, p.unitsB)), 1)
                    return (
                      <>
                        <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
                          {[{ color: BLUE, name: nameA }, { color: STORE_B_COLOR, name: nameB }].map(s => (
                            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.MUTED }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.name}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 2 }}>
                          {filtered.length === 0 && <p style={{ fontSize: 12, color: T.MUTED, textAlign: 'center', padding: '1rem 0' }}>No products found</p>}
                          {filtered.map((p, i) => (
                            <div key={i}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 11, color: T.TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{p.name}</span>
                                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: BLUE }}>{fmtNum(p.unitsA)}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: STORE_B_COLOR }}>{fmtNum(p.unitsB)}</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ background: '#e5e7eb', borderRadius: 3, height: 4 }}>
                                  <div style={{ background: BLUE, height: '100%', borderRadius: 3, width: `${Math.round(p.unitsA / maxUnits * 100)}%`, transition: 'width 0.4s' }} />
                                </div>
                                <div style={{ background: '#e5e7eb', borderRadius: 3, height: 4 }}>
                                  <div style={{ background: STORE_B_COLOR, height: '100%', borderRadius: 3, width: `${Math.round(p.unitsB / maxUnits * 100)}%`, transition: 'width 0.4s' }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.BORDER}`, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: T.MUTED }}>Showing <strong style={{ color: T.TEXT }}>{filtered.length}</strong> products</span>
                          <span style={{ fontSize: 11, color: BLUE }}>{nameA}: <strong>{fmtNum(data.allProducts.reduce((s, p) => s + p.units, 0))} units</strong></span>
                          <span style={{ fontSize: 11, color: STORE_B_COLOR }}>{nameB}: <strong>{fmtNum(compareData.allProducts.reduce((s, p) => s + p.units, 0))} units</strong></span>
                        </div>
                      </>
                    )
                  }
                  // Single-store view
                  const filtered = allProductSearch
                    ? data.allProducts.filter(p => p.name.toLowerCase().includes(allProductSearch.toLowerCase()))
                    : data.allProducts
                  const maxUnits = data.allProducts[0]?.units || 1
                  return (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 2 }}>
                        {filtered.length === 0 && <p style={{ fontSize: 12, color: T.MUTED, textAlign: 'center', padding: '1rem 0' }}>No products found</p>}
                        {filtered.map((p, i) => (
                          <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 11, color: T.TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68%' }}>{p.name}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS[i % COLORS.length], flexShrink: 0, marginLeft: 4 }}>{fmtNum(p.units)} units</span>
                            </div>
                            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 4 }}>
                              <div style={{ background: COLORS[i % COLORS.length], height: '100%', borderRadius: 4, width: `${Math.round(p.units / maxUnits * 100)}%`, transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.BORDER}`, display: 'flex', gap: 16 }}>
                        <span style={{ fontSize: 11, color: T.MUTED }}>Showing <strong style={{ color: T.TEXT }}>{filtered.length}</strong> of <strong style={{ color: T.TEXT }}>{data.allProducts.length}</strong></span>
                        <span style={{ fontSize: 11, color: T.MUTED }}>Total: <strong style={{ color: T.TEXT }}>{fmtNum(data.allProducts.reduce((s, p) => s + p.units, 0))} units</strong></span>
                      </div>
                    </>
                  )
                })()}
              </Card>

              {/* Right: by salesman — comparison-aware */}
              <Card
                title="By salesman"
                action={compareData ? (
                  <div style={{ display: 'flex', gap: 2, background: '#e5e7eb', borderRadius: 8, padding: 2 }}>
                    <button onClick={() => { setProdCountView('a'); setSelectedSalesman(null) }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: prodCountView === 'a' ? '#fff' : 'transparent', color: prodCountView === 'a' ? BLUE : T.MUTED, fontWeight: prodCountView === 'a' ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{nameA}</button>
                    <button onClick={() => { setProdCountView('b'); setSelectedSalesman(null) }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: prodCountView === 'b' ? '#fff' : 'transparent', color: prodCountView === 'b' ? STORE_B_COLOR : T.MUTED, fontWeight: prodCountView === 'b' ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{nameB}</button>
                  </div>
                ) : null}
              >
                {(() => {
                  const pcData = (compareData && prodCountView === 'b') ? compareData : data
                  const pcColor = (compareData && prodCountView === 'b') ? STORE_B_COLOR : BLUE
                  return (
                    <>
                      <input
                        placeholder="Search salesman..."
                        value={salesmanSearch}
                        onChange={e => { setSalesmanSearch(e.target.value); setSelectedSalesman(null) }}
                        style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT, outline: 'none', marginBottom: 10 }}
                      />
                      {(() => {
                        const allSalesmen = pcData.salesmen.filter(s => !salesmanSearch || s.name.toLowerCase().includes(salesmanSearch.toLowerCase()))
                        const LIMIT = 12
                        const visibleSalesmen = (!salesmanSearch && !showAllSalesmen) ? allSalesmen.slice(0, LIMIT) : allSalesmen
                        const hasMore = !salesmanSearch && allSalesmen.length > LIMIT
                        return (
                          <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasMore ? 8 : 14 }}>
                              {visibleSalesmen.map((s, i) => (
                                <button key={i} onClick={() => { setSelectedSalesman(selectedSalesman === s.name ? null : s.name); setSalesmanProductSearch('') }}
                                  style={{
                                    fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                                    border: `1px solid ${selectedSalesman === s.name ? pcColor : T.BORDER_STRONG}`,
                                    background: selectedSalesman === s.name ? pcColor : T.BG,
                                    color: selectedSalesman === s.name ? '#fff' : T.MUTED,
                                    fontWeight: selectedSalesman === s.name ? 600 : 400,
                                    transition: 'all 0.15s',
                                  }}>
                                  {s.name}
                                </button>
                              ))}
                            </div>
                            {hasMore && (
                              <button onClick={() => setShowAllSalesmen(v => !v)} style={{ fontSize: 11, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 14px', fontWeight: 600 }}>
                                {showAllSalesmen ? '▲ Show less' : `▼ Show all ${allSalesmen.length} salesmen`}
                              </button>
                            )}
                          </>
                        )
                      })()}
                      {(() => {
                        const sm = pcData.salesmen.find(s => s.name === selectedSalesman)
                        if (!selectedSalesman || !sm) return (
                          <p style={{ fontSize: 12, color: T.MUTED, textAlign: 'center', padding: '2rem 0' }}>Select a salesman to see their product breakdown</p>
                        )
                        const filteredProds = salesmanProductSearch
                          ? sm.products.filter(p => p.product.toLowerCase().includes(salesmanProductSearch.toLowerCase()))
                          : sm.products
                        const maxUnits = sm.products[0]?.units || 1
                        return (
                          <>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 10, padding: '8px 10px', background: T.BG, borderRadius: 8 }}>
                              <span style={{ fontSize: 11, color: T.MUTED }}>Orders: <strong style={{ color: T.TEXT }}>{fmtNum(sm.orders)}</strong></span>
                              <span style={{ fontSize: 11, color: T.MUTED }}>Revenue: <strong style={{ color: pcColor }}>{fmtMYR(sm.revenue)}</strong></span>
                              <span style={{ fontSize: 11, color: T.MUTED }}>Products: <strong style={{ color: T.TEXT }}>{sm.products.length}</strong></span>
                            </div>
                            <input
                              placeholder="Search product..."
                              value={salesmanProductSearch}
                              onChange={e => setSalesmanProductSearch(e.target.value)}
                              style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.BORDER_STRONG}`, background: T.BG, color: T.TEXT, outline: 'none', marginBottom: 10 }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                              {filteredProds.length === 0 && <p style={{ fontSize: 12, color: T.MUTED, textAlign: 'center', padding: '0.5rem 0' }}>No products found</p>}
                              {filteredProds.map((p, j) => (
                                <div key={j}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span style={{ fontSize: 11, color: T.TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68%' }}>{p.product}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: pcColor, flexShrink: 0, marginLeft: 4 }}>{fmtNum(p.units)} units</span>
                                  </div>
                                  <div style={{ background: '#e5e7eb', borderRadius: 4, height: 4 }}>
                                    <div style={{ background: pcColor, height: '100%', borderRadius: 4, width: `${Math.round(p.units / maxUnits * 100)}%`, transition: 'width 0.4s' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )
                      })()}
                    </>
                  )
                })()}
              </Card>
            </div>

            {/* Discount */}
            <SectionLabel id="sec-discount">Discount analysis</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
              <KPI icon="🏷️" label="Total discount given" value={fmtMYR(data.totalDiscount)} />
              <KPI icon="📊" label="Discount rate" value={`${data.totalRevenue > 0 ? ((data.totalDiscount / (data.totalRevenue + data.totalDiscount)) * 100).toFixed(2) : '0'}%`} delta="of gross sales" />
              <KPI icon="📉" label="RSP gap (below RSP)" value={fmtMYR(data.rspGap)} delta="revenue not captured" color={RED} />
              <KPI icon="💹" label="Effective avg price" value={fmtMYR(data.aov)} delta={`vs RSP avg ${data.totalOrders > 0 ? fmtMYR(data.rspGap / data.totalOrders + data.aov) : '—'}`} />
            </div>

            {/* Traffic heatmap */}
            <SectionLabel id="sec-traffic">Traffic patterns</SectionLabel>
            <Card
              title="Hour × day heatmap"
              action={compareData ? (
                <div style={{ display: 'flex', gap: 2, background: '#e5e7eb', borderRadius: 8, padding: 2 }}>
                  <button onClick={() => setHeatView('a')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: heatView === 'a' ? '#fff' : 'transparent', color: heatView === 'a' ? BLUE : T.MUTED, fontWeight: heatView === 'a' ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{nameA}</button>
                  <button onClick={() => setHeatView('b')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: heatView === 'b' ? '#fff' : 'transparent', color: heatView === 'b' ? STORE_B_COLOR : T.MUTED, fontWeight: heatView === 'b' ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' }}>{nameB}</button>
                </div>
              ) : null}
            >
              {(() => {
                const activeHeatData = (compareData && heatView === 'b') ? compareData : data
                const activeHeatColor = (compareData && heatView === 'b') ? STORE_B_COLOR : BLUE
                // Only show hours that have at least 1 sale across all days
                const allHourTotals = HOURS.map(h => activeHeatData.heatmap.reduce((s, row) => s + row[h], 0))
                const activeHours = HOURS.filter(h => allHourTotals[h] > 0)
                const activeHeatMax = Math.max(...activeHeatData.heatmap.flat())
                const rowTotals = activeHeatData.heatmap.map(row => row.reduce((a, b) => a + b, 0))
                const grandTotal = rowTotals.reduce((a, b) => a + b, 0)
                const colMax = Math.max(...activeHours.map(h => allHourTotals[h]), 1)
                const [rgb_r, rgb_g, rgb_b] = activeHeatColor === STORE_B_COLOR ? [124,58,237] : [37,99,235]
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 12, fontSize: 11, color: T.MUTED }}>
                      <span>Low</span>
                      {[0.08,0.3,0.5,0.7,0.9].map(o => (
                        <div key={o} style={{ width: 14, height: 14, borderRadius: 2, background: o === 0.08 ? '#f1f5f9' : `rgba(${rgb_r},${rgb_g},${rgb_b},${o})` }} />
                      ))}
                      <span>High</span>
                    </div>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <div style={{ minWidth: isMobile ? activeHours.length * 22 + 76 : Math.max(400, activeHours.length * 30 + 90) }}>
                        {/* Hour header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 4, paddingLeft: 38 }}>
                          {activeHours.map(h => (
                            <div key={h} style={{ flex: 1, fontSize: 9, color: T.MUTED, textAlign: 'center', fontWeight: h % 3 === 0 ? 600 : 400 }}>{fmtHour(h)}</div>
                          ))}
                          <div style={{ width: 42, fontSize: 10, color: T.MUTED, textAlign: 'right', flexShrink: 0 }}>Total</div>
                        </div>
                        {/* Day rows */}
                        {activeHeatData.heatmap.map((row, d) => {
                          const rowTotal = rowTotals[d]
                          const rowPct = grandTotal > 0 ? Math.round(rowTotal / grandTotal * 100) : 0
                          return (
                            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 3 }}>
                              <span style={{ width: 34, fontSize: 11, color: T.MUTED, flexShrink: 0 }}>{DAYS[d]}</span>
                              {activeHours.map(h => {
                                const val = row[h]
                                const t = activeHeatMax > 0 ? val / activeHeatMax : 0
                                return (
                                  <div key={h} title={`${DAYS[d]} ${fmtHour(h)}: ${Math.round(val)} orders`} style={{
                                    flex: 1, height: isMobile ? 22 : 28, borderRadius: 3, minWidth: 0,
                                    background: t === 0 ? '#f1f5f9' : `rgba(${rgb_r},${rgb_g},${rgb_b},${0.08 + t * 0.82})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    {val > 0 && <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, color: t > 0.5 ? '#fff' : '#475569', pointerEvents: 'none' }}>{Math.round(val)}</span>}
                                  </div>
                                )
                              })}
                              <div style={{ width: 42, flexShrink: 0, textAlign: 'right', paddingLeft: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: activeHeatColor }}>{rowTotal}</span>
                                <span style={{ fontSize: 9, color: T.MUTED, marginLeft: 2 }}>{rowPct}%</span>
                              </div>
                            </div>
                          )
                        })}
                        {/* Totals row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4, borderTop: `1px solid ${T.BORDER}`, paddingTop: 4 }}>
                          <span style={{ width: 34, fontSize: 10, color: T.MUTED, flexShrink: 0 }}>Total</span>
                          {activeHours.map(h => {
                            const val = allHourTotals[h]
                            const t = colMax > 0 ? val / colMax : 0
                            return (
                              <div key={h} style={{ flex: 1, height: 20, borderRadius: 3, minWidth: 0, background: t === 0 ? '#f8fafc' : `rgba(${rgb_r},${rgb_g},${rgb_b},${0.06 + t * 0.35})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 9, fontWeight: 600, color: '#64748b' }}>{val > 0 ? val : ''}</span>
                              </div>
                            )
                          })}
                          <span style={{ width: 42, fontSize: 11, fontWeight: 700, color: T.TEXT, textAlign: 'right', flexShrink: 0, paddingLeft: 4 }}>{grandTotal}</span>
                        </div>
                      </div>
                    </div>

                    {/* Traffic summary rows */}
                    {(() => {
                      const cells = []
                      activeHeatData.heatmap.forEach((row, d) => row.forEach((v, h) => { if (v > 0) cells.push({ d, h, v }) }))
                      cells.sort((a, b) => b.v - a.v)
                      const top3 = cells.slice(0, 3)
                      const slowSlot = cells.filter(c => c.h >= 10 && c.h <= 22).sort((a, b) => a.v - b.v)[0]
                      const topDates = [...activeHeatData.trend].sort((a, b) => b.orders - a.orders).slice(0, 3)
                      const wrNum = parseFloat(activeHeatData.weekendRatio)
                      const isB = activeHeatColor === STORE_B_COLOR
                      const accent = isB ? STORE_B_COLOR : BLUE
                      const bg = isB ? '#faf5ff' : '#f8faff'
                      const bdr = isB ? '#e9d5ff' : '#e0eaff'

                      const weekendTag = !isNaN(wrNum)
                        ? wrNum >= 1.2 ? { label: `${wrNum}× weekday avg`, color: GREEN }
                          : wrNum <= 0.85 ? { label: `${wrNum}× (weekdays lead)`, color: ORANGE }
                          : { label: `${wrNum}× (balanced)`, color: T.MUTED }
                        : null

                      const Row = ({ icon, label, children }) => (
                        <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${bdr}` }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 13, color: T.TEXT, lineHeight: 1.5 }}>{children}</div>
                          </div>
                        </div>
                      )

                      return (
                        <div style={{ marginTop: 16, background: bg, borderRadius: 12, border: `1px solid ${bdr}`, overflow: 'hidden' }}>
                          <div style={{ padding: '10px 16px 0', borderBottom: `1px solid ${bdr}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Traffic summary</span>
                          </div>
                          <div style={{ padding: '0 16px' }}>
                            <Row icon="🔥" label="Peak hours">
                              {top3.map((c, i) => (
                                <span key={i}>
                                  {i > 0 && <span style={{ color: T.MUTED, margin: '0 6px' }}>·</span>}
                                  <strong>{DAYS[c.d]} {fmtHour(c.h)}–{fmtHour(c.h+1)}</strong>
                                  <span style={{ fontSize: 11, color: T.MUTED, marginLeft: 4 }}>({c.v} sales)</span>
                                </span>
                              ))}
                            </Row>
                            {weekendTag && (
                              <Row icon="📅" label="Weekend vs weekday">
                                Weekends bring <strong style={{ color: weekendTag.color }}>{weekendTag.label}</strong> —&nbsp;
                                {wrNum >= 1.2 ? 'ideal for weekend promotions and extra staffing.'
                                  : wrNum <= 0.85 ? 'focus weekday campaigns to drive more weekend footfall.'
                                  : 'traffic is spread evenly throughout the week.'}
                              </Row>
                            )}
                            {slowSlot && (
                              <Row icon="😴" label="Slowest window">
                                <strong>{DAYS[slowSlot.d]} {fmtHour(slowSlot.h)}–{fmtHour(slowSlot.h+1)}</strong>
                                <span style={{ fontSize: 11, color: T.MUTED, marginLeft: 4 }}>({slowSlot.v} sale{slowSlot.v !== 1 ? 's' : ''})</span>
                                <span style={{ color: T.MUTED }}> — use this gap for stock replenishment or team briefings.</span>
                              </Row>
                            )}
                            <div style={{ display: 'flex', gap: 12, padding: '10px 0' }}>
                              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, marginTop: 1 }}>📆</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Top sales dates</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {topDates.map((d, i) => (
                                    <div key={i} style={{ background: i === 0 ? accent : '#fff', border: `1px solid ${i === 0 ? accent : bdr}`, borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
                                      <div style={{ fontWeight: 700, color: i === 0 ? '#fff' : T.TEXT }}>{d.fullDate || d.date}</div>
                                      <div style={{ fontSize: 11, color: i === 0 ? 'rgba(255,255,255,0.8)' : T.MUTED, marginTop: 1 }}>{Math.abs(d.orders)} sales · {fmtMYR(d.revenue)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )
              })()}
            </Card>

            {(() => {
              const td = (compareData && heatView === 'b') ? compareData : data
              const tdColor = (compareData && heatView === 'b') ? STORE_B_COLOR : BLUE
              const tdDowMax = Math.max(...td.dowTotals.map(d => d.value))
              return (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr', gap: 12, marginTop: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      ['🕐','Peak hour', `${fmtHour(td.peakHour)}–${fmtHour(td.peakHour+1)}`, `on ${DAYS[td.peakDay]}`],
                      ['📅','Busiest day', DAYS[td.busiestDay], 'most orders'],
                      ['🌙','Slowest slot', `${fmtHour(td.slowHour)} ${DAYS[td.slowDay]}`, 'quietest'],
                      ['🗓️','Weekend lift', `${td.weekendRatio}×`, 'vs weekday avg'],
                    ].map(([icon, label, value, delta]) => (
                      <KPI key={label} icon={icon} label={label} value={value} delta={delta} />
                    ))}
                  </div>
                  <Card title="Invoices by day of week">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={td.invoiceDowTotals} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={T.GRID} />
                        <XAxis dataKey="day" tick={{ fontSize: 12, fill: T.MUTED }} />
                        <YAxis tick={{ fontSize: 11, fill: T.MUTED }} />
                        <Tooltip {...TS} contentStyle={TT} cursor={TC} separator=": " formatter={v => [fmtNum(v), 'Invoices']} />
                        <Bar dataKey="value" radius={[4,4,0,0]}>
                          {td.invoiceDowTotals.map((d, i) => {
                            const max = Math.max(...td.invoiceDowTotals.map(x => x.value))
                            return <Cell key={i} fill={d.value === max ? tdColor : (tdColor === STORE_B_COLOR ? '#ddd6fe' : '#bfdbfe')} />
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>
              )
            })()}

            <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', padding: '2rem 0 1rem' }}>
              StoreDash · built with React + Recharts ·{' '}
              <a href="https://github.com/kianc1220" target="_blank" rel="noreferrer" style={{ color: '#9ca3af', textDecoration: 'none' }}>© kianc1220</a>
            </p>
          </div>
        )}
      </div>

      {/* Same-data regenerate confirmation modal */}
      {showRegenConfirm && (
        <div onClick={() => setShowRegenConfirm(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#1e1b4b', borderRadius: 18, padding: '1.75rem 2rem',
            maxWidth: 380, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            border: '1px solid rgba(139,92,246,0.3)',
          }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🔁</div>
            <h3 style={{ margin: '0 0 8px', color: '#e0e7ff', fontSize: 16, fontWeight: 700, textAlign: 'center' }}>
              Same data detected
            </h3>
            <p style={{ margin: '0 0 20px', color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
              A saved analysis already exists for this dataset. Regenerating will call the AI again and overwrite the saved result.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowRegenConfirm(false)} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={() => { setShowRegenConfirm(false); runAIAnalysis(true) }} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
              }}>
                Yes, regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
