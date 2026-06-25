const express = require('express');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const iconv = require('iconv-lite');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── DATA DIR ───
const DATA_DIR = path.join(__dirname, 'data');

// ─── CSV READER (hỗ trợ cp1252 và utf-8) ───
function readCSV(filename, encoding = 'utf-8') {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath);
  const content = iconv.decode(raw, encoding);
  try {
    return parse(content, { relax_column_count: true, skip_empty_lines: false, bom: true });
  } catch (e) {
    console.error(`Parse error ${filename}:`, e.message);
    return [];
  }
}

// ─── MODULE LAYOUT (verified against actual CSV columns) ───
const MODULE_LAYOUT = [
  { col:0,   module:'Video',      sub:'Safety+Keyframe',         week:0,  agent:2,   sample:5,  accurate:4,  error:6,  prob:7  },
  { col:9,   module:'Video',      sub:'Ecommerce',               week:9,  agent:10,  sample:11, accurate:12, error:14, prob:16 },
  { col:18,  module:'Video',      sub:'Ecommerce-Combine',        week:18, agent:19,  sample:21, accurate:20, error:22, prob:23 },
  { col:25,  module:'Video',      sub:'Non-Ecommerce',            week:25, agent:26,  sample:28, accurate:27, error:29, prob:30 },
  { col:32,  module:'Video',      sub:'OCP',                     week:33, agent:34,  sample:36, accurate:35, error:37, prob:38 },
  { col:41,  module:'Listing',    sub:'Multiple',                week:41, agent:42,  sample:43, accurate:44, error:45, prob:46 },
  { col:48,  module:'Listing',    sub:'TQC',                     week:48, agent:49,  sample:50, accurate:51, error:52, prob:53 },
  { col:55,  module:'Listing',    sub:'Item Report',             week:55, agent:56,  sample:57, accurate:58, error:59, prob:60 },
  { col:62,  module:'Listing',    sub:'FQC',                     week:62, agent:63,  sample:64, accurate:65, error:66, prob:67 },
  { col:69,  module:'Livestream', sub:'Safety-RT+KF+RP',         week:69, agent:70,  sample:71, accurate:72, error:73, prob:74 },
  { col:76,  module:'Livestream', sub:'Realtime',                week:76, agent:77,  sample:78, accurate:79, error:80, prob:81 },
  { col:83,  module:'Livestream', sub:'Keyframe',                week:83, agent:84,  sample:85, accurate:86, error:87, prob:88 },
  { col:90,  module:'Livestream', sub:'Reported Live',           week:90, agent:91,  sample:92, accurate:93, error:94, prob:95 },
  { col:97,  module:'Livestream', sub:'ECHQ',                    week:97, agent:98,  sample:99, accurate:100,error:101,prob:102},
  { col:104, module:'Chat',       sub:'All Project',             week:104,agent:105, sample:106,accurate:107,error:108,prob:null},
  { col:110, module:'Chat',       sub:'Project Level',           week:110,agent:112, sample:113,accurate:114,error:115,prob:null},
  { col:117, module:'Chat',       sub:'Rating',                  week:117,agent:118, sample:119,accurate:120,error:121,prob:null},
];

// ─── PARSE QA WEEKLY ───
function parseQAWeekly(rows) {
  const dataRows = rows.slice(2); // bỏ 2 header rows
  const records = [];

  for (const row of dataRows) {
    for (const m of MODULE_LAYOUT) {
      const agentRaw = (row[m.agent] || '').toString().trim();
      const weekRaw  = (row[m.week]  || '').toString().trim();

      if (!agentRaw || !weekRaw || isNaN(parseInt(weekRaw))) continue;
      if (agentRaw === 'QC:QC Agent' || agentRaw === 'QC Agent' || agentRaw === 'Agent') continue;

      const sample   = parseFloat(row[m.sample])   || 0;
      const accurate = parseFloat(row[m.accurate]) || 0;
      const errors   = parseFloat(row[m.error])    || 0;

      if (sample === 0) continue;

      const qaScore = Math.round(accurate / sample * 1000) / 10;

      records.push({
        week:        parseInt(weekRaw),
        module:      m.module,
        subModule:   m.sub,
        agentEmail:  agentRaw,
        qaSample:    sample,
        accurate,
        errors,
        qaScore,
        isProbation: m.prob !== null ? (row[m.prob] || '').toString().trim().toUpperCase() === 'Y' : false,
      });
    }
  }
  return records;
}

// ─── PARSE QA MONTHLY ───
// Monthly có cấu trúc giống weekly nhưng dùng Month thay Week
const MONTHLY_LAYOUT = [
  { module:'Video',      sub:'Safety+Keyframe',  month:0,  agent:2,   sample:5,  accurate:4,  error:6   },
  { module:'Video',      sub:'Ecommerce-Combine', month:7,  agent:8,   sample:10, accurate:9,  error:11  },
  { module:'Video',      sub:'Ecommerce',        month:14, agent:15,  sample:17, accurate:16, error:19  },
  { module:'Video',      sub:'Non-Ecommerce',    month:23, agent:24,  sample:26, accurate:25, error:27  },
  { module:'Video',      sub:'OCP',              month:29, agent:30,  sample:32, accurate:31, error:33  },
  { module:'Listing',    sub:'All',              month:36, agent:37,  sample:38, accurate:39, error:40  },
  { module:'Livestream', sub:'RT+KF+RP',         month:43, agent:44,  sample:45, accurate:46, error:47  },
  { module:'Livestream', sub:'ECHQ',             month:50, agent:51,  sample:52, accurate:53, error:54  },
  { module:'Chat',       sub:'All',              month:57, agent:58,  sample:59, accurate:60, error:61  },
  { module:'Chat',       sub:'Rating',           month:64, agent:65,  sample:66, accurate:67, error:68  },
];

function parseQAMonthly(rows) {
  const dataRows = rows.slice(2);
  const records = [];

  for (const row of dataRows) {
    for (const m of MONTHLY_LAYOUT) {
      const agentRaw = (row[m.agent] || '').toString().trim();
      const monthRaw = (row[m.month] || '').toString().trim();

      if (!agentRaw || !monthRaw || isNaN(parseInt(monthRaw))) continue;
      if (agentRaw.includes('Agent') || agentRaw.includes('agent')) continue;

      const sample   = parseFloat(row[m.sample])   || 0;
      const accurate = parseFloat(row[m.accurate]) || 0;
      const errors   = parseFloat(row[m.error])    || 0;

      if (sample === 0) continue;

      records.push({
        month:       parseInt(monthRaw),
        module:      m.module,
        subModule:   m.sub,
        agentEmail:  agentRaw,
        qaSample:    sample,
        accurate,
        errors,
        qaScore:     Math.round(accurate / sample * 1000) / 10,
      });
    }
  }
  return records;
}

// ─── PARSE APPEAL ───
function parseAppeal(rows) {
  const dataRows = rows.slice(2);
  const records = [];

  for (const row of dataRows) {
    // LS Appeal Inflow (col 0=week, 4=total_inflow)
    const lsWeek  = parseInt(row[0]);
    const lsTotal = parseInt(row[4]) || 0;
    if (!isNaN(lsWeek) && lsTotal > 0) {
      records.push({ week: lsWeek, module: 'Livestream', type: 'Inflow',
        total: lsTotal, success: 0, rate: 0 });
    }

    // LS Action Success (col 6=week, 9=approved)
    const lsActWeek = parseInt(row[6]);
    const lsActTotal = parseInt(row[9]) || 0;
    if (!isNaN(lsActWeek) && lsActTotal > 0) {
      records.push({ week: lsActWeek, module: 'Livestream', type: 'Action Success',
        total: lsActTotal, success: lsActTotal, rate: 100 });
    }

    // Video Safety Weekly (col 10=week, 12=yes, 13=total)
    const vidWeek  = parseInt(row[10]);
    const vidTotal = parseInt(row[13]) || 0;
    const vidYes   = parseInt(row[12]) || 0;
    if (!isNaN(vidWeek) && vidTotal > 0) {
      records.push({ week: vidWeek, module: 'Video', type: 'Safety',
        total: vidTotal, success: vidYes,
        rate: Math.round(vidYes / vidTotal * 1000) / 10 });
    }

    // Video Safety Monthly (col 15=month, 17=yes, 18=total)
    const vidMonth  = parseInt(row[15]);
    const vidMTotal = parseInt(row[18]) || 0;
    const vidMYes   = parseInt(row[17]) || 0;
    if (!isNaN(vidMonth) && vidMTotal > 0) {
      records.push({ month: vidMonth, module: 'Video', type: 'Safety-Monthly',
        total: vidMTotal, success: vidMYes,
        rate: Math.round(vidMYes / vidMTotal * 1000) / 10 });
    }

    // Video Ecommerce Weekly (col 20=week, 21=total, 22=success)
    const vidEcoWeek  = parseInt(row[20]);
    const vidEcoTotal = parseInt(row[21]) || 0;
    const vidEcoSucc  = parseInt(row[22]) || 0;
    if (!isNaN(vidEcoWeek) && vidEcoTotal > 0) {
      records.push({ week: vidEcoWeek, module: 'Video', type: 'Ecommerce',
        total: vidEcoTotal, success: vidEcoSucc,
        rate: Math.round(vidEcoSucc / vidEcoTotal * 1000) / 10 });
    }
  }
  return records;
}

// ─── PARSE LEAKAGE OVERALL ───
const LEAKAGE_OVERALL_LAYOUT = [
  { module:'Listing',    type:'Leakage',  pCol:0,  sCol:1,  aCol:2,  mode:'weekly'  },
  { module:'Listing',    type:'Leakage',  pCol:4,  sCol:5,  aCol:6,  mode:'monthly' },
  { module:'Listing',    type:'Overkill', pCol:8,  sCol:9,  aCol:10, mode:'weekly'  },
  { module:'Listing',    type:'Overkill', pCol:12, sCol:13, aCol:14, mode:'monthly' },
  { module:'Livestream', type:'Leakage',  pCol:16, sCol:17, aCol:18, mode:'weekly'  },
  { module:'Livestream', type:'Leakage',  pCol:20, sCol:21, aCol:22, mode:'monthly' },
  { module:'Livestream', type:'Overkill', pCol:24, sCol:25, aCol:26, mode:'weekly'  },
  { module:'Livestream', type:'Overkill', pCol:28, sCol:29, aCol:30, mode:'monthly' },
  { module:'Video',      type:'Leakage',  pCol:32, sCol:33, aCol:34, mode:'weekly'  },
  { module:'Video',      type:'Leakage',  pCol:36, sCol:37, aCol:38, mode:'monthly' },
  { module:'Video',      type:'Overkill', pCol:40, sCol:41, aCol:42, mode:'weekly'  },
  { module:'Video',      type:'Overkill', pCol:44, sCol:45, aCol:46, mode:'monthly' },
];

function parseLeakageOverall(rows) {
  const dataRows = rows.slice(2);
  const records = [];

  for (const row of dataRows) {
    for (const m of LEAKAGE_OVERALL_LAYOUT) {
      const period  = (row[m.pCol] || '').toString().trim();
      const sample  = parseFloat(row[m.sCol]) || 0;
      const accurate = parseFloat(row[m.aCol]) || 0;

      if (!period || isNaN(parseInt(period)) || sample === 0) continue;

      records.push({
        period: m.mode === 'weekly' ? `W${period}` : `M${period}`,
        periodNum: parseInt(period),
        mode:   m.mode,
        module: m.module,
        type:   m.type,
        sample, accurate,
        rate: Math.round((1 - accurate / sample) * 1000) / 10,
      });
    }
  }
  return records;
}

// ─── CACHE ───
let cache = null;
let cacheExpiresAt = 0;
const CACHE_TTL = 15 * 60 * 1000;

function loadAllData() {
  const weeklyRaw  = readCSV('QA_Score_weekly.csv',          'utf-8');
  const monthlyRaw = readCSV('QA_score_monthly.csv',         'cp1252');
  const appealRaw  = readCSV('Appeal.csv',                   'utf-8');
  const leakageRaw = readCSV('Leakage__Overkill_overall.csv','utf-8');

  const qaWeekly  = parseQAWeekly(weeklyRaw);
  const qaMonthly = parseQAMonthly(monthlyRaw);
  const appeal    = parseAppeal(appealRaw);
  const leakage   = parseLeakageOverall(leakageRaw);

  // Tính probation list
  const probation = qaWeekly
    .filter(r => r.isProbation)
    .reduce((acc, r) => {
      if (!acc[r.agentEmail]) acc[r.agentEmail] = { agentEmail: r.agentEmail, module: r.module, weeks: [] };
      if (!acc[r.agentEmail].weeks.includes(r.week)) acc[r.agentEmail].weeks.push(r.week);
      return acc;
    }, {});

  return {
    qaWeekly,
    qaMonthly,
    appeal,
    leakage,
    probation: Object.values(probation),
    meta: {
      fetchedAt: new Date().toISOString(),
      counts: { qaWeekly: qaWeekly.length, qaMonthly: qaMonthly.length, appeal: appeal.length, leakage: leakage.length },
    }
  };
}

// ─── API ENDPOINTS ───

// GET /api/data — trả toàn bộ data đã parse
app.get('/api/data', (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  if (!forceRefresh && cache && Date.now() < cacheExpiresAt) {
    return res.json({ ...cache, fromCache: true });
  }
  try {
    const data = loadAllData();
    cache = data;
    cacheExpiresAt = Date.now() + CACHE_TTL;
    res.json(data);
  } catch (e) {
    console.error('Data load error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/data/weekly?module=Listing&weekStart=18&weekEnd=22
app.get('/api/data/weekly', (req, res) => {
  if (!cache) { try { cache = loadAllData(); cacheExpiresAt = Date.now() + CACHE_TTL; } catch(e) { return res.status(500).json({ error: e.message }); }}
  const { module, weekStart, weekEnd } = req.query;
  let records = cache.qaWeekly;
  if (module && module !== 'All') records = records.filter(r => r.module === module);
  if (weekStart) records = records.filter(r => r.week >= parseInt(weekStart));
  if (weekEnd)   records = records.filter(r => r.week <= parseInt(weekEnd));
  res.json(records);
});

// GET /api/data/monthly?module=Listing&monthStart=1&monthEnd=6
app.get('/api/data/monthly', (req, res) => {
  if (!cache) { try { cache = loadAllData(); cacheExpiresAt = Date.now() + CACHE_TTL; } catch(e) { return res.status(500).json({ error: e.message }); }}
  const { module, monthStart, monthEnd } = req.query;
  let records = cache.qaMonthly;
  if (module && module !== 'All') records = records.filter(r => r.module === module);
  if (monthStart) records = records.filter(r => r.month >= parseInt(monthStart));
  if (monthEnd)   records = records.filter(r => r.month <= parseInt(monthEnd));
  res.json(records);
});

// GET /api/data/appeal?module=Livestream
app.get('/api/data/appeal', (req, res) => {
  if (!cache) { try { cache = loadAllData(); cacheExpiresAt = Date.now() + CACHE_TTL; } catch(e) { return res.status(500).json({ error: e.message }); }}
  const { module } = req.query;
  let records = cache.appeal;
  if (module && module !== 'All') records = records.filter(r => r.module === module);
  res.json(records);
});

// GET /api/data/leakage?module=Listing&mode=weekly
app.get('/api/data/leakage', (req, res) => {
  if (!cache) { try { cache = loadAllData(); cacheExpiresAt = Date.now() + CACHE_TTL; } catch(e) { return res.status(500).json({ error: e.message }); }}
  const { module, mode } = req.query;
  let records = cache.leakage;
  if (module && module !== 'All') records = records.filter(r => r.module === module);
  if (mode) records = records.filter(r => r.mode === mode);
  res.json(records);
});

// GET /api/data/probation
app.get('/api/data/probation', (req, res) => {
  if (!cache) { try { cache = loadAllData(); cacheExpiresAt = Date.now() + CACHE_TTL; } catch(e) { return res.status(500).json({ error: e.message }); }}
  res.json(cache.probation);
});

// POST /api/refresh — force reload
app.post('/api/refresh', (req, res) => {
  try {
    cache = loadAllData();
    cacheExpiresAt = Date.now() + CACHE_TTL;
    res.json({ ok: true, meta: cache.meta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Preload data on startup
try {
  console.log('⏳ Preloading data...');
  cache = loadAllData();
  cacheExpiresAt = Date.now() + CACHE_TTL;
  console.log('✅ Data loaded:', cache.meta.counts);
} catch (e) {
  console.warn('⚠️  Preload failed (will retry on first request):', e.message);
}

app.listen(PORT, () => console.log(`🚀 QA Dashboard server running on port ${PORT}`));
