// app.js - Mapzimus board v16
// sc fields: 0-100 | vs: 0-100 | saturated palette | sub-score range filters | sort direction toggle

const VAR_LABELS = {
  rep_pct:"Republican vote % by state", median_household_income:"Median household income by state",
  pct_under_25k:"% households under $25K", pct_over_200k:"% households over $200K",
  state_gdp_per_capita:"State GDP per capita", violent_crime_rate:"Violent crime rate by state",
  murder_rate:"Murder rate by state", pct_bachelors:"% with bachelor's degree",
  pct_hs_grad:"% HS graduates", expenditure_per_pupil:"Per-pupil school spending",
  avg_teacher_salary:"Avg teacher salary", state_unemployment_rate:"Unemployment rate by state",
  female_lfp_rate:"Female labor force participation", total_transfers_per_capita:"Govt transfers per capita",
  pct_on_snap:"% households on SNAP", pct_on_medicaid:"% on Medicaid",
  birth_rate_state:"Birth rate by state", teen_birth_rate:"Teen birth rate",
  pct_births_unmarried:"% births to unmarried mothers", total_medicare:"Medicare enrollment",
  per_capita_health_spending:"Health spending per capita", all_items_cpi:"All-items CPI",
  gasoline_cpi:"Gasoline CPI", housing_cpi:"Housing CPI",
  home_price_index_2024:"Home price index 2024", home_price_pct_change_2005_2024:"Home price % change 2005-2024",
  student_loans_outstanding:"Student loan debt outstanding", mortgage_delinquency_rate:"Mortgage delinquency rate",
  housing_permits_total:"New housing permits", population_pct_change:"Population % change",
  net_migration_rate:"Net migration rate", birth_rate:"Birth rate by country",
  trade_balance_goods:"Trade balance on goods", rd_pct_gdp:"R&D spending % of GDP",
  pct_forest:"% land that is forest", energy_consumption_per_capita:"Energy per capita",
  renewable_energy_share:"Renewable energy share", coal_production_index:"Coal production index",
  us_troops_overseas:"US troops stationed overseas", defense_budget_total:"Total defense budget",
  pct_bridges_poor:"% bridges in poor condition", waterway_freight_tons:"Waterway freight tonnage",
  passengers_enplaned:"Passengers enplaned", incarceration_rate:"Incarceration rate",
  avg_commute_time:"Average commute time", broadband_access_pct:"Broadband access rate",
  dollar_general_density:"Dollar General stores per 10K", grocery_distance:"Drive time to nearest grocery",
  population_pct_change_2020_2025:"Population % change 2020-2025",
  population_per_sq_km:"Population density per km2", current_account_balance:"Current account balance",
  water_access_pct:"Drinking water access %", political_regime:"Political regime type",
  median_age:"Median age", natural_growth_rate:"Natural population growth rate",
  old_age_dependency_ratio:"Old-age dependency ratio", youth_dependency_ratio:"Youth dependency ratio",
  migration_contribution_pct:"Migration contribution to growth",
  population_pct_change_2023_2100:"Population % change 2023-2100",
};

//  OVERRIDES 
const LS_KEY = 'mapzimus_overrides_v2';
function loadOverrides() { try { return JSON.parse(localStorage.getItem(LS_KEY)||'{}'); } catch { return {}; } }
function saveOverride(id, field, value) {
  const ov = loadOverrides();
  if (!ov[id]) ov[id] = {};
  ov[id][field] = value;
  localStorage.setItem(LS_KEY, JSON.stringify(ov));
  const idea = D.find(d => d.id === id);
  if (idea) idea[field] = value;
}
(function applyOverrides() {
  const ov = loadOverrides();
  D.forEach(d => {
    if (ov[d.id]) {
      if (ov[d.id].status !== undefined) d.status = ov[d.id].status;
      if (ov[d.id].notes  !== undefined) d.notes  = ov[d.id].notes;
    }
  });
})();

//  INDEXES 
const VAR_INDEX = {};
D.forEach(d => {
  [...(d.vars || []), ...(d.join || [])].forEach(v => {
    if (!VAR_INDEX[v]) VAR_INDEX[v] = [];
    if (!VAR_INDEX[v].find(x => x.id === d.id))
      VAR_INDEX[v].push({ id: d.id, primary: !!(d.vars && d.vars.includes(v)) });
  });
});
const FMT_MAP = {};
D.forEach(d => { if (!FMT_MAP[d.fmt]) FMT_MAP[d.fmt] = []; FMT_MAP[d.fmt].push(d); });

//  PASTEL COLOR PALETTE 
const P = {
  red:'#ef4444', orange:'#f97316', yellow:'#eab308', green:'#22c55e',
  teal:'#14b8a6', blue:'#3b82f6', purple:'#a855f7', pink:'#ec4899',
  lime:'#84cc16', sky:'#0ea5e9', amber:'#f59e0b', rose:'#f43f5e',
  indigo:'#6366f1', mint:'#10b981', peach:'#fb923c', violet:'#d946ef',
};

//  TOPIC COLORS 
const TOPIC_COLORS = {
  health:P.red, economy:P.green, politics:P.blue, crime:P.rose,
  housing:P.orange, education:P.teal, labor:P.purple,
  race:P.pink, gender:P.violet, immigration:P.sky, middle_east:'#f59e0b',
  military:P.indigo, energy:P.yellow, climate:P.mint, environment:P.lime,
  food:P.peach, agriculture:P.lime, drugs:P.purple, guns:P.rose,
  finance:P.amber, sports:'#10b981', inequality:P.pink, transportation:P.teal,
  infrastructure:P.indigo, technology:P.blue, media:P.sky, population:P.violet,
  international:P.purple, entertainment:'#a855f7', religion:P.amber,
  history:P.peach, psychology:'#06b6d4',
  humor:'#ec4899', science:'#0ea5e9', geography:'#22c55e',
  children:P.pink, rural:P.lime,
};

const TOPIC_LABELS = {
  middle_east:'Middle East', data_ready:'Data Ready',
};
function topicLabel(t) { return TOPIC_LABELS[t] || t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }


//  SECTION COLORS 
const SECTION_COLORS = {
  // Legacy ProQuest/HSUS sections
  'Health':P.red, 'Elections':P.blue, 'Income':P.green, 'Housing':P.orange,
  'Labor Force':P.purple, 'Law Enforcement':P.rose, 'Education':P.teal,
  'Energy':P.yellow, 'Agriculture':P.lime, 'Transportation':P.teal,
  'Population':P.violet, 'National Security':P.indigo,
  'International Statistics':P.purple, 'Geography':P.mint,
  'Banking':P.amber, 'Finance':P.amber, 'Prices':P.peach,
  'Births Deaths':P.pink, 'Arts Recreation':P.sky,
  'Business Enterprise':P.indigo, 'Foreign Commerce':P.sky,
  'Social Insurance':P.green, 'Wholesale':P.orange, 'Retail Trade':P.orange,
  'Accommodation':P.peach, 'Food Services':P.peach,
  'Forestry':P.lime, 'Fishing':P.sky, 'Mining':P.amber,
  // Canonical hand-crafted sections (EM-FZ batches)
  'Crime and Law Enforcement':P.rose, 'Demographics':P.violet,
  'Economy':P.green, 'Environment':P.lime, 'Entertainment':P.sky,
  'Food & Nutrition':P.peach, 'History':P.indigo, 'Labor':P.purple,
  'Science & Technology':P.teal, 'Sports & Recreation':P.sky,
  'Science Technology':P.teal, 'Climate':P.mint,
};

function getSectionColor(section) {
  if (!section) return '#888';
  const entries = Object.entries(SECTION_COLORS).sort((a,b) => b[0].length - a[0].length);
  for (const [key, color] of entries) {
    if (section.includes(key)) return color;
  }
  return '#888';
}

// Precomputed section color lookup - built once, O(1) per card render
const SECTION_COLOR_MAP = (() => {
  const map = {};
  const entries = Object.entries(SECTION_COLORS).sort((a,b) => b[0].length - a[0].length);
  // Pre-resolve every known section value in data
  const allSections = new Set(D.map(d => d.section ? d.section.split(/\s*[--]\s*/)[0].trim() : ''));
  allSections.forEach(sec => {
    if (!sec) { map[sec] = '#888'; return; }
    map[sec] = '#888';
    for (const [key, color] of entries) {
      if (sec.includes(key)) { map[sec] = color; break; }
    }
  });
  return map;
})();
function getSectionColorFast(sec) { return SECTION_COLOR_MAP[sec] || '#888'; }


// Bonus breakdown badge with tooltip
const BK_LABELS = {ti:' Time',cl:' Clear',df:' Fresh',vm:' Viral',sh:' Share',og:' Orig'};
function bonusBkHtml(d) {
  if (!d.bonus) return '';
  const bk = d.bonusBk || {};
  const rows = Object.entries(BK_LABELS)
    .filter(([k]) => bk[k] > 0)
    .map(([k,lbl]) => `<div class="bk-row"><span>${lbl}</span><span>+${bk[k]}</span></div>`)
    .join('');
  return `<span class="bp-tag" tabindex="0">+${d.bonus}<span class="bp-tip">${rows}</span></span>`;
}
// Sections that show as clickable badges on cards (excludes catch-all sections)
const BADGE_SECTIONS = new Set([
  // Legacy ProQuest/HSUS
  'Health','Elections','Income','Housing','Labor Force','Law Enforcement',
  'Education','Energy','Agriculture','Transportation','Population',
  'National Security','Banking','Finance','Prices','Births Deaths',
  'Business Enterprise','Foreign Commerce','Social Insurance',
  'Geography','Arts Recreation','Information',
  // Canonical hand-crafted (EM-FZ batches)
  'Crime and Law Enforcement','Demographics','Economy','Environment',
  'Entertainment','Food & Nutrition','History','Labor',
  'Science & Technology','Sports & Recreation','Climate',
]);

//  SCORE FIELDS 
// Virality algorithm v5 (weights updated in maintain.py):
// - visual bumped to 2.0 (highest correlation with engagement, #1 scroll-stopper)
// - tension bumped to 1.5 (controversy drives shares/comments)
// - originality bumped to 1.5 (uniqueness prevents scroll-past)
// - clarity reduced to 1.25 (low variance, barely differentiates ideas)
// - data_ready penalty steeper: vs *= (1 - 0.5*(1 - data_ready/100))
// - format bonus: choropleths +3, bivariate/dot maps +2
// - denominator 11.75
// Formula: raw = e*2 + r*2 + c*1.25 + s*1.5 + t*1.5 + v*2.0 + o*1.5
//          vs = int(raw/11.75 * penalty) + format_bonus
const SC_FIELDS = [
  { key:'emotional',    label:'Emotional',    short:'Emo', color:'#ff6b8a', weight:2    },
  { key:'relatability', label:'Relatability', short:'Rel', color:'#38bdf8', weight:2    },
  { key:'clarity',      label:'Clarity',      short:'Cla', color:'#fb923c', weight:1.25 },
  { key:'surprise',     label:'Surprise',     short:'Sur', color:'#facc15', weight:1.5  },
  { key:'tension',      label:'Tension',      short:'Ten', color:'#a855f7', weight:1.5  },
  { key:'visual',       label:'Visual',       short:'Vis', color:'#10b981', weight:2.0  },
  { key:'originality',  label:'Originality',  short:'Ori', color:'#f472b6', weight:1.5  },
  { key:'data_ready',   label:'Data Ready',   short:'Dat', color:'#818cf8', weight:'penalty' },
];

const scColor = s => s >= 82 ? '#ff6b8a' : s >= 70 ? '#facc15' : s >= 55 ? '#10b981' : '#444';

//  STATUSES 
const STATUSES = [
  { val:'idea',        color:P.indigo, label:'Idea'        },
  { val:'in-progress', color:P.amber,  label:'In Progress' },
  { val:'built',       color:P.green,  label:'Built'       },
  { val:'published',   color:P.blue,   label:'Published'   },
];

//  GEO TREE 
const GEO_TREE = {
  USA: {
    label:'USA', children:['USA_ALL','USA_RES','USA_REG','USA_TZ','USA_ST'],
  },
  USA_ALL:  { label:'ALL USA', geos: null, matchAll:'us' },
  USA_RES:  { label:'Resolution', children:['us_national','us_state','us_county','us_metro','us_cities','us_city','us_tz','us_tract','us_zip'] },
  USA_REG:  { label:'Region', children:['us_northeast','us_new_england','us_mid_atlantic','us_south','us_southeast','us_midwest','us_great_plains','us_west','us_southwest','us_pacific_nw'] },
  USA_TZ:   { label:'Timezone', children:['us_tz_eastern','us_tz_central','us_tz_mountain','us_tz_pacific','us_tz_alaska','us_tz_hawaii'] },
  USA_ST:   { label:'State / Territory', children:[
    'us_al','us_ak','us_az','us_ar','us_ca','us_co','us_ct','us_de','us_fl','us_ga',
    'us_hi','us_id','us_il','us_in','us_ia','us_ks','us_ky','us_la','us_me','us_md',
    'us_ma','us_mi','us_mn','us_ms','us_mo','us_mt','us_ne','us_nv','us_nh','us_nj',
    'us_nm','us_ny','us_nc','us_nd','us_oh','us_ok','us_or','us_pa','us_ri','us_sc',
    'us_sd','us_tn','us_tx','us_ut','us_vt','us_va','us_wa','us_wv','us_wi','us_wy',
    'us_dc','us_pr','us_vi','us_gu','us_as','us_mp'
  ]},
  // US leaf nodes
  us_national:    { label:'National' },
  us_state:       { label:'All States' },
  us_county:      { label:'Countywide' },
  us_metro:       { label:'Metro Areas' },
  us_cities:      { label:'US Cities' },
  us_city:        { label:'City / Place' },
  us_tz:          { label:'US Timezones' },
  us_tract:       { label:'Census Tract' },
  us_zip:         { label:'Zip Code' },
  us_northeast:   { label:'Northeast' },
  us_new_england: { label:'New England' },
  us_mid_atlantic:{ label:'Mid-Atlantic' },
  us_south:       { label:'South' },
  us_southeast:   { label:'Southeast' },
  us_midwest:     { label:'Midwest' },
  us_great_plains:{ label:'Great Plains' },
  us_west:        { label:'West' },
  us_southwest:   { label:'Southwest' },
  us_pacific_nw:  { label:'Pacific NW' },
  us_tz_eastern:  { label:'Eastern' },
  us_tz_central:  { label:'Central' },
  us_tz_mountain: { label:'Mountain' },
  us_tz_pacific:  { label:'Pacific' },
  us_tz_alaska:   { label:'Alaska' },
  us_tz_hawaii:   { label:'Hawaii' },
  // states
  us_al:{label:'AL',full:'Alabama'},    us_ak:{label:'AK',full:'Alaska'},
  us_az:{label:'AZ',full:'Arizona'},    us_ar:{label:'AR',full:'Arkansas'},
  us_ca:{label:'CA',full:'California'}, us_co:{label:'CO',full:'Colorado'},
  us_ct:{label:'CT',full:'Connecticut'},us_de:{label:'DE',full:'Delaware'},
  us_fl:{label:'FL',full:'Florida'},    us_ga:{label:'GA',full:'Georgia'},
  us_hi:{label:'HI',full:'Hawaii'},     us_id:{label:'ID',full:'Idaho'},
  us_il:{label:'IL',full:'Illinois'},   us_in:{label:'IN',full:'Indiana'},
  us_ia:{label:'IA',full:'Iowa'},       us_ks:{label:'KS',full:'Kansas'},
  us_ky:{label:'KY',full:'Kentucky'},   us_la:{label:'LA',full:'Louisiana'},
  us_me:{label:'ME',full:'Maine'},      us_md:{label:'MD',full:'Maryland'},
  us_ma:{label:'MA',full:'Massachusetts'},us_mi:{label:'MI',full:'Michigan'},
  us_mn:{label:'MN',full:'Minnesota'},  us_ms:{label:'MS',full:'Mississippi'},
  us_mo:{label:'MO',full:'Missouri'},   us_mt:{label:'MT',full:'Montana'},
  us_ne:{label:'NE',full:'Nebraska'},   us_nv:{label:'NV',full:'Nevada'},
  us_nh:{label:'NH',full:'New Hampshire'},us_nj:{label:'NJ',full:'New Jersey'},
  us_nm:{label:'NM',full:'New Mexico'}, us_ny:{label:'NY',full:'New York'},
  us_nc:{label:'NC',full:'North Carolina'},us_nd:{label:'ND',full:'North Dakota'},
  us_oh:{label:'OH',full:'Ohio'},       us_ok:{label:'OK',full:'Oklahoma'},
  us_or:{label:'OR',full:'Oregon'},     us_pa:{label:'PA',full:'Pennsylvania'},
  us_ri:{label:'RI',full:'Rhode Island'},us_sc:{label:'SC',full:'South Carolina'},
  us_sd:{label:'SD',full:'South Dakota'},us_tn:{label:'TN',full:'Tennessee'},
  us_tx:{label:'TX',full:'Texas'},      us_ut:{label:'UT',full:'Utah'},
  us_vt:{label:'VT',full:'Vermont'},    us_va:{label:'VA',full:'Virginia'},
  us_wa:{label:'WA',full:'Washington'}, us_wv:{label:'WV',full:'West Virginia'},
  us_wi:{label:'WI',full:'Wisconsin'},  us_wy:{label:'WY',full:'Wyoming'},
  us_dc:{label:'DC',full:'Washington DC'},
  us_pr:{label:'PR',full:'Puerto Rico'},us_vi:{label:'VI',full:'US Virgin Islands'},
  us_gu:{label:'GU',full:'Guam'},       us_as:{label:'AS',full:'American Samoa'},
  us_mp:{label:'MP',full:'N. Mariana Islands'},
  // WORLD
  WORLD:      { label:'WORLD', children:['WORLD_ALL','worldwide','global_city','north_america','EUROPE','ASIA','AFRICA','middle_east','LATAM','oceania'] },
  WORLD_ALL:  { label:'ALL WORLD', matchAll:'world' },
  worldwide:      { label:'Global' },
  global_city:    { label:'Global Cities' },
  north_america:  { label:'North America' },
  EUROPE: { label:'Europe', children:['europe','europe_west','europe_east','europe_nordic','europe_south'] },
  europe:       { label:'All Europe' },
  europe_west:  { label:'W. Europe' },
  europe_east:  { label:'E. Europe' },
  europe_nordic:{ label:'Nordic' },
  europe_south: { label:'S. Europe' },
  ASIA: { label:'Asia', children:['asia','asia_east','asia_south','asia_southeast','asia_central'] },
  asia:         { label:'All Asia' },
  asia_east:    { label:'East Asia' },
  asia_south:   { label:'South Asia' },
  asia_southeast:{ label:'SE Asia' },
  asia_central: { label:'Central Asia' },
  AFRICA: { label:'Africa', children:['africa','africa_sub','africa_west','africa_east','africa_north'] },
  africa:       { label:'All Africa' },
  africa_sub:   { label:'Sub-Saharan' },
  africa_west:  { label:'W. Africa' },
  africa_east:  { label:'E. Africa' },
  africa_north: { label:'N. Africa' },
  middle_east:  { label:'Middle East' },
  LATAM: { label:'Latin America', children:['latin_america','latin_south','latin_central','caribbean'] },
  latin_america: { label:'All Latin Am.' },
  latin_south:   { label:'South America' },
  latin_central: { label:'Central America' },
  caribbean:     { label:'Caribbean' },
  oceania:       { label:'Oceania' },
};

// Collect all geo leaf values under a node (for filtering)
function geoLeaves(nodeKey) {
  const node = GEO_TREE[nodeKey];
  if (!node) return new Set([nodeKey]);
  if (node.matchAll) return null; // null = match by prefix
  if (!node.children) return new Set([nodeKey]);
  const s = new Set();
  for (const c of node.children) {
    const sub = geoLeaves(c);
    if (sub === null) return null;
    sub.forEach(v => s.add(v));
  }
  return s;
}

// Precomputed insertion-order index for O(1) newest/oldest sort
const D_INDEX = new Map(D.map((d,i) => [d.id, i]));

// Accordion state
let geoFilter = null; // { key, leaves: Set|null, prefix: string|null, label }
let geoRow2 = null;   // which top-level is expanded (USA or WORLD)
let geoRow3 = null;   // which category is expanded

//  STATE 
const activeFilters = { type:null, fmt:null, status:null, notes:null, section:null };
let activeTopics = new Set();
let sortK = 'vscore', sortDir = 'desc';
let bonusFilter = null; // null|'has'|'none'|'ti'|'cl'|'df'|'vm'|'sh'|'og'
let scFilters = {};
const PAGE = 60;
let filteredIdeas = [], renderedCount = 0, _renderPending = false;

//  CARD HTML 
function cardHTML(d, highlight=false) {
  const bars = SC_FIELDS.map(f => {
    const v = d.sc[f.key] || 0;
    return `<div class="br"><span class="bl">${f.short}</span><div class="bt"><div class="bf" style="width:${v}%;background:${f.color}"></div></div><span class="bv">${v}</span></div>`;
  }).join('');

  const st = STATUSES.find(s => s.val === (d.status||'idea')) || STATUSES[0];
  // Use first segment of compound sections (e.g. "Health - Foreign Commerce" -> "Health")
  const secDisplay = d.section ? d.section.split(/\s*[--]\s*/)[0].trim() : '';
  const secColor = getSectionColorFast(secDisplay);
  // Only show badge for canonical sections - hides catch-alls like "International Statistics"
  const showSecBadge = secDisplay && BADGE_SECTIONS.has(secDisplay);

  const statusOptions = STATUSES.map(s =>
    `<div class="st-opt${s.val===d.status?' active':''}" data-id="${d.id}" data-val="${s.val}">
      <span class="sdot" style="background:${s.color}"></span>${s.label}
    </div>`
  ).join('');

  const topicBadges = (d.topics||[]).map(t => {
    const c = TOPIC_COLORS[t] || '#888';
    return `<span class="topic-badge" style="background:${c}1a;color:${c};border:1px solid ${c}55">${topicLabel(t)}</span>`;
  }).join('');

  const extList = (d.ext&&d.ext.length) ? d.ext.map(e => `<li>${e}</li>`).join('') : '';
  const notesHtml = d.notes
    ? `<div class="notes-edit" data-id="${d.id}" title="Click to edit"> ${d.notes}</div>`
    : `<button class="add-note-btn" data-id="${d.id}">+ Add note</button>`;

  return `<div class="card${highlight?' hi':''}" data-id="${d.id}" style="border-left-color:${TYPE_BORDER[d.type]||'var(--border)'};">
    <div class="card-main">
      <div class="card-header">
        <div class="status-wrap">
          <span class="status-dot" style="background:${st.color}" data-id="${d.id}" title="${st.label}"></span>
          <div class="status-menu" id="sm-${d.id}">${statusOptions}</div>
        </div>
        <div class="badge-row">
          ${showSecBadge ? `<span class="sect-badge" style="background:${secColor}1a;color:${secColor};border:1px solid ${secColor}55;cursor:pointer" onclick="filterBySection('${secDisplay.replace(/'/g,"\\'")}',this)">${secDisplay}</span>` : ''}
          ${topicBadges}
        </div>
      </div>
      <div class="ct">${d.title}</div>
      ${d.sub ? `<div class="cs">${d.sub}</div>` : ''}
      <div class="pills">
        <span class="pl ${d.type||'unk'}">${d.type||'?'}</span>
        <span class="pl geo">${(d.geo||'').replace(/_/g,' ')}</span>
        <span class="pl fmt">${d.fmt}</span>
        ${d.dd ? `<span class="pl dd">${d.dd}</span>` : ''}
      </div>
      <div class="data-block">
        <div class="data-label">DATA NEEDED</div>
        <div class="data-primary">${d.tbl}</div>
        ${extList?`<ul class="data-ext">${extList}</ul>`:''}
      </div>
      <div class="notes-area">${notesHtml}</div>
    </div>
    <div class="right">
      <div><div class="vs" style="color:${scColor((d.vs||0)+(d.bonus||0))}">${(d.vs||0)+(d.bonus||0)}${bonusBkHtml(d)}</div><div class="vl">V-Score</div></div>
      <div class="brs">${bars}</div>
    </div>
  </div>`;
}

//  EVENT DELEGATION 
document.addEventListener('click', function(e) {
  if (!e.target.closest('.status-wrap'))
    document.querySelectorAll('.status-menu.open').forEach(m => m.classList.remove('open'));

  if (e.target.classList.contains('status-dot')) {
    const id = e.target.dataset.id;
    const menu = document.getElementById('sm-' + id);
    if (!menu) return;
    const was = menu.classList.contains('open');
    document.querySelectorAll('.status-menu.open').forEach(m => m.classList.remove('open'));
    if (!was) menu.classList.add('open');
    return;
  }
  if (e.target.classList.contains('st-opt') || e.target.closest('.st-opt')) {
    const opt = e.target.closest('.st-opt');
    const id = opt.dataset.id, val = opt.dataset.val;
    saveOverride(id, 'status', val);
    document.getElementById('sm-' + id)?.classList.remove('open');
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (card) {
      const st = STATUSES.find(s => s.val === val) || STATUSES[0];
      const dot = card.querySelector('.status-dot');
      if (dot) { dot.style.background = st.color; dot.title = st.label; }
      card.querySelectorAll('.st-opt').forEach(o => o.classList.toggle('active', o.dataset.val === val));
    }
    updateOverrideCount(); return;
  }
  if (e.target.classList.contains('add-note-btn') || e.target.closest('.add-note-btn')) {
    const btn = e.target.closest('.add-note-btn');
    openNotesEditor(btn.dataset.id, btn.closest('.notes-area'), ''); return;
  }
  if (e.target.classList.contains('notes-edit') || e.target.closest('.notes-edit')) {
    const el = e.target.closest('.notes-edit');
    openNotesEditor(el.dataset.id, el.closest('.notes-area'), el.textContent.replace(/^\s+/,'').trim()); return;
  }
});

function openNotesEditor(id, container, current) {
  container.innerHTML = `<div class="notes-editor">
    <textarea class="notes-ta" autofocus>${current}</textarea>
    <div class="notes-btns">
      <button class="nb-save" data-id="${id}">Save</button>
      <button class="nb-cancel" data-id="${id}">Cancel</button>
      ${current ? `<button class="nb-clear" data-id="${id}">Clear</button>` : ''}
    </div></div>`;
  const ta = container.querySelector('.notes-ta'); ta.focus();
  container.querySelector('.nb-save').onclick = () => {
    const val = ta.value.trim(); saveOverride(id, 'notes', val);
    container.innerHTML = val
      ? `<div class="notes-edit" data-id="${id}" title="Click to edit"> ${val}</div>`
      : `<button class="add-note-btn" data-id="${id}">+ Add note</button>`;
    updateOverrideCount();
  };
  container.querySelector('.nb-cancel').onclick = () => {
    const idea = D.find(d => d.id === id), notes = idea ? idea.notes : '';
    container.innerHTML = notes
      ? `<div class="notes-edit" data-id="${id}" title="Click to edit"> ${notes}</div>`
      : `<button class="add-note-btn" data-id="${id}">+ Add note</button>`;
  };
  const clr = container.querySelector('.nb-clear');
  if (clr) clr.onclick = () => {
    saveOverride(id, 'notes', '');
    container.innerHTML = `<button class="add-note-btn" data-id="${id}">+ Add note</button>`;
    updateOverrideCount();
  };
}

//  EXPORT 
function updateOverrideCount() {
  const n = Object.keys(loadOverrides()).length;
  const el = document.getElementById('override-count');
  if (el) el.textContent = n > 0 ? `${n} edited` : '';
}
function exportOverrides() {
  const ov = loadOverrides(), n = Object.keys(ov).length;
  if (!n) { alert('No edits yet.'); return; }
  let s = '# patch_overrides.py\nimport re\noverrides={\n';
  for (const [id, fields] of Object.entries(ov))
    s += `  "${id}":${JSON.stringify(fields)},\n`;
  s += '}\nwith open("data.js","r",encoding="utf-8") as f: content=f.read()\n';
  s += 'lines=content.split("\\n"); new_lines=[]; changed=0\n';
  s += 'for line in lines:\n';
  s += '    if not (line.startswith(",{id:") or line.startswith("{id:")): new_lines.append(line); continue\n';
  s += '    id_m=__import__("re").search(\'id:"([^"]+)"\',line)\n';
  s += '    if not id_m: new_lines.append(line); continue\n';
  s += '    id_=id_m.group(1)\n';
  s += '    if id_ in overrides:\n';
  s += '        ov=overrides[id_]\n';
  s += '        if "status" in ov: line=re.sub(r\',status:"[^"]*"\',\',status:"\'+ov["status"]+\'"\',line)\n';
  s += '        if "notes" in ov: line=re.sub(r\',notes:"[^"]*"\',\',notes:"\'+ov["notes"]+\'"\',line)\n';
  s += '        changed+=1\n    new_lines.append(line)\n';
  s += 'with open("data.js","w",encoding="utf-8") as f: f.write("\\n".join(new_lines))\n';
  s += 'print("Patched",changed,"ideas")\n';
  const blob = new Blob([s], {type:'text/plain'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'patch_overrides.py'; a.click();
}

//  FILTER + SORT 
function buildFiltered() {
  const q = (document.getElementById('q').value || '').toLowerCase();
  filteredIdeas = D.filter(d => {
    if (activeFilters.type   && d.type   !== activeFilters.type)   return false;
    if (geoFilter) {
      if (geoFilter.prefix) {
        if (!(d.geo||'').startsWith(geoFilter.prefix)) return false;
      } else if (geoFilter.leaves) {
        if (!geoFilter.leaves.has(d.geo)) return false;
      }
    }
    if (activeFilters.fmt    && d.fmt    !== activeFilters.fmt)     return false;
    if (activeFilters.status && d.status !== activeFilters.status)  return false;
    if (activeFilters.section && !d.section?.includes(activeFilters.section)) return false;
    if (activeFilters.notes === 'has'  && !d.notes)  return false;
    if (activeFilters.notes === 'none' && d.notes)   return false;
    if (bonusFilter === 'has'  && !(d.bonus > 0)) return false;
    if (bonusFilter === 'none' && (d.bonus  > 0)) return false;
    if (bonusFilter && bonusFilter !== 'has' && bonusFilter !== 'none') {
      const bk = d.bonusBk || {}; if (!(bk[bonusFilter] > 0)) return false;
    }
    if (activeTopics.size > 0) {
      if (!(d.topics||[]).some(t => activeTopics.has(t))) return false;
    }
    for (const [key, range] of Object.entries(scFilters)) {
      const v = d.sc[key] || 0;
      if (v < range.min || v > range.max) return false;
    }
    if (q) {
      const h = (d.title+' '+(d.sub||'')+' '+(d.tags||'')+' '+(d.section||'')).toLowerCase();
      if (!h.includes(q)) return false;
    }
    return true;
  });

  filteredIdeas.sort((a, b) => {
    let av, bv;
    if (sortK === 'vscore')      { av = (a.vs||0)+(a.bonus||0); bv = (b.vs||0)+(b.bonus||0); }
    else if (sortK === 'bonus')   { av = a.bonus||0; bv = b.bonus||0; }
    else if (sortK === 'newest') { av = D_INDEX.get(a.id); bv = D_INDEX.get(b.id); }
    else if (sortK === 'oldest') { av = D_INDEX.get(a.id); bv = D_INDEX.get(b.id); }
    else if (sortK === 'dd')     { av = parseInt((a.dd||'').slice(0,4))||0; bv = parseInt((b.dd||'').slice(0,4))||0; }
    else { av = a.sc[sortK]||0; bv = b.sc[sortK]||0; }
    // newest = desc by index = larger index first
    if (sortK === 'newest') return bv - av;
    if (sortK === 'oldest') return av - bv;
    return sortDir === 'desc' ? bv - av : av - bv;
  });
}

//  VIRTUAL SCROLL 
function updateStats() {
  const el = id => document.getElementById(id);
  if (!el('stat-total')) return;
  el('stat-total').textContent = D.length.toLocaleString();
  const avg = Math.round(D.reduce((s,d) => s + (d.vs||0) + (d.bonus||0), 0) / D.length);
  el('stat-avg').textContent = avg;
  const tc = {};
  D.forEach(d => (d.topics||[]).forEach(t => { tc[t] = (tc[t]||0) + 1; }));
  const top = Object.entries(tc).sort((a,b) => b[1]-a[1])[0];
  if (top) el('stat-top').textContent = topicLabel(top[0]) + ' (' + top[1].toLocaleString() + ')';
  const bn = D.filter(d => d.bonus > 0).length;
  const bel = el('stat-bonus');
  if (bel && bn > 0) { bel.style.display = ''; bel.querySelector('strong').textContent = bn; }
}

function renderBrowse() {
  buildFiltered(); renderedCount = 0; _renderPending = false;
  document.getElementById('bgrid').innerHTML = '';
  renderMore(); updateCount(); updateStats();
}
function renderMore() {
  if (_renderPending || renderedCount >= filteredIdeas.length) return;
  _renderPending = true;
  requestAnimationFrame(() => {
    const batch = filteredIdeas.slice(renderedCount, renderedCount + PAGE);
    const frag = document.createDocumentFragment();
    batch.forEach(d => {
      const div = document.createElement('div');
      div.innerHTML = cardHTML(d);
      frag.appendChild(div.firstChild);
    });
    document.getElementById('bgrid').appendChild(frag);
    renderedCount += batch.length;
    _renderPending = false;
    updateCount();
  });
}
function updateCount() {
  const total = filteredIdeas.length, shown = Math.min(renderedCount, total);
  document.getElementById('bcnt').textContent =
    shown < total ? `Showing ${shown} of ${total} ideas - scroll for more` : `Showing ${total} of ${D.length} ideas`;
  if (!total) document.getElementById('bgrid').innerHTML = '<div class="empty">No match.</div>';
}

const sentinel = document.createElement('div'); sentinel.id = 'sentinel';
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bgrid').after(sentinel);
  new IntersectionObserver(entries => { if (entries[0].isIntersecting) renderMore(); }, { rootMargin:'200px' }).observe(sentinel);
  updateOverrideCount();
  buildScFilters();
  buildGeoAccordion();
  renderSavedFilters();
});

//  PILLS / SORT / TOPIC 
function setBonusFilter(val) {
  bonusFilter = (bonusFilter === val) ? null : val; // toggle
  document.querySelectorAll('.bf-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.v === bonusFilter);
  });
  buildFiltered(); renderBrowse(); updateCounts();
}

function togglePill(btn) {
  const field = btn.dataset.f, val = btn.dataset.v;
  if (activeFilters[field] === val) {
    activeFilters[field] = null; btn.classList.remove('on');
  } else {
    document.querySelectorAll(`.fp[data-f="${field}"]`).forEach(b => b.classList.remove('on'));
    activeFilters[field] = val; btn.classList.add('on');
  }
  updateResetBtn(); 
renderBrowse();
}
function updateResetBtn() {
  const hasFilter = Object.values(activeFilters).some(v => v) ||
    activeTopics.size > 0 || geoFilter !== null ||
    (document.getElementById('q')?.value||'').trim();
  const btn = document.getElementById('reset-btn');
  if (btn) btn.style.display = hasFilter ? 'inline-flex' : 'none';
}
function resetAllFilters() {
  Object.keys(activeFilters).forEach(k => activeFilters[k] = null);
  activeTopics.clear();
  geoFilter = null;
  geoRow2 = null; geoRow3 = null;
  document.querySelectorAll('.fp.on').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.sect-badge.sect-active').forEach(b => b.classList.remove('sect-active'));
  document.querySelectorAll('.fp.topic').forEach(btn => {
    const val = btn.dataset.v, c = TOPIC_COLORS[val];
    if (c) { btn.style.color=c; btn.style.borderColor=c+'55'; btn.style.background=c+'12'; }
  });
  document.getElementById('q').value = '';
  buildGeoAccordion();
  updateResetBtn(); 
renderBrowse();
}
function toggleTopic(btn) {
  const val = btn.dataset.v;
  const c = TOPIC_COLORS[val] || '#888';
  if (activeTopics.has(val)) {
    activeTopics.delete(val); btn.classList.remove('on');
    btn.style.color = c; btn.style.borderColor = c+'55'; btn.style.background = c+'12';
  } else {
    activeTopics.add(val); btn.classList.add('on');
    btn.style.background = c+'33'; btn.style.color = c; btn.style.borderColor = c;
  }
  updateResetBtn(); 
renderBrowse();
}
function filterBySection(sec, el) {
  if (activeFilters.section === sec) {
    activeFilters.section = null;
    document.querySelectorAll('.sect-badge.sect-active').forEach(b => b.classList.remove('sect-active'));
  } else {
    activeFilters.section = sec;
    document.querySelectorAll('.sect-badge.sect-active').forEach(b => b.classList.remove('sect-active'));
    if (el) el.classList.add('sect-active');
  }
  updateResetBtn(); 
renderBrowse();
}
function setSort(btnOrKey) {
  const key = (typeof btnOrKey === 'string') ? btnOrKey : btnOrKey.dataset.k;
  if (sortK === key) {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    sortK = key; sortDir = 'desc';
  }
  document.querySelectorAll('.sb').forEach(b => b.classList.remove('on','asc','desc'));
  const active = document.querySelector(`.sb[data-k="${key}"]`);
  if (active) {
    active.classList.add('on');
    active.classList.add(sortDir); // explicit separate add so both land
  }
  
renderBrowse();
}
function setMode(m, btn) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('on')); btn.classList.add('on');
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  document.getElementById('pane-' + m).classList.add('on');
  if (m === 'correlate') buildVarSelect();
  if (m === 'format') buildFormatGrid();
  if (m === 'score-filters') buildScFilters();
}

//  SUB-SCORE RANGE FILTERS 
function buildScFilters() {
  const container = document.getElementById('sc-filter-grid');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';
  SC_FIELDS.forEach(f => {
    const div = document.createElement('div'); div.className = 'scf';
    div.innerHTML = `
      <div class="scf-label" style="color:${f.color}">${f.label} <span style="color:#555;font-weight:400;font-size:9px">(weight ${f.weight}x)</span></div>
      <div class="scf-row">
        <span class="scf-val" id="scf-min-${f.key}">0</span>
        <input type="range" min="0" max="100" value="0"   step="5" class="scf-range" id="scf-rmin-${f.key}" data-key="${f.key}" data-bound="min">
        <input type="range" min="0" max="100" value="100" step="5" class="scf-range" id="scf-rmax-${f.key}" data-key="${f.key}" data-bound="max">
        <span class="scf-val" id="scf-max-${f.key}">100</span>
      </div>
      <div class="scf-hint" id="scf-cnt-${f.key}"></div>`;
    container.appendChild(div);
    div.querySelectorAll('.scf-range').forEach(r => r.addEventListener('input', () => updateScFilter(f.key)));
  });
}
function updateScFilter(key) {
  const minEl = document.getElementById(`scf-rmin-${key}`);
  const maxEl = document.getElementById(`scf-rmax-${key}`);
  let min = parseInt(minEl.value), max = parseInt(maxEl.value);
  if (min > max) { min = max; minEl.value = min; }
  document.getElementById(`scf-min-${key}`).textContent = min;
  document.getElementById(`scf-max-${key}`).textContent = max;
  if (min === 0 && max === 100) delete scFilters[key];
  else scFilters[key] = { min, max };
  const cnt = D.filter(d => (d.sc[key]||0) >= min && (d.sc[key]||0) <= max).length;
  document.getElementById(`scf-cnt-${key}`).textContent = `${cnt.toLocaleString()} ideas match`;
  buildFiltered();
  // Render into score-filter pane's own grid
  const sfGrid = document.getElementById('sf-grid');
  const sfCnt  = document.getElementById('sf-cnt');
  if (sfGrid) {
    sfGrid.innerHTML = filteredIdeas.map(d => cardHTML(d)).join('');
    if (sfCnt) sfCnt.textContent = `${filteredIdeas.length} of ${D.length} ideas`;
  }
}
function clearScFilters() {
  scFilters = {};
  document.querySelectorAll('.scf-range').forEach(r => {
    r.value = r.dataset.bound === 'min' ? 0 : 100;
  });
  SC_FIELDS.forEach(f => {
    document.getElementById(`scf-min-${f.key}`).textContent = '0';
    document.getElementById(`scf-max-${f.key}`).textContent = '100';
    document.getElementById(`scf-cnt-${f.key}`).textContent = '';
  });
  
renderBrowse();
}

//  CORRELATE 
function buildVarSelect() {
  const sel = document.getElementById('varsel');
  if (sel.options.length > 1) return;
  Object.keys(VAR_LABELS).sort((a,b) => VAR_LABELS[a].localeCompare(VAR_LABELS[b])).forEach(v => {
    const o = document.createElement('option'); o.value = v; o.textContent = VAR_LABELS[v]; sel.appendChild(o);
  });
}
function renderCorr() {
  const v = document.getElementById('varsel').value;
  if (!v) { document.getElementById('cgrid').innerHTML = ''; document.getElementById('ccnt').textContent = ''; return; }
  const pIds = new Set((VAR_INDEX[v]||[]).filter(x => x.primary).map(x => x.id));
  const jIds = new Set((VAR_INDEX[v]||[]).filter(x => !x.primary).map(x => x.id));
  const all = new Set([...pIds, ...jIds]);
  document.getElementById('corr-hint').textContent = `${all.size} ideas connect to "${VAR_LABELS[v]}". Blue border = uses this variable directly.`;
  const sorted = D.filter(d => all.has(d.id)).sort((a,b) => {
    const ap = pIds.has(a.id)?1:0, bp = pIds.has(b.id)?1:0;
    if (ap !== bp) return bp - ap; return ((b.vs||0)+(b.bonus||0)) - ((a.vs||0)+(a.bonus||0));
  });
  document.getElementById('ccnt').textContent = `${sorted.length} idea${sorted.length!==1?'s':''} relate`;
  document.getElementById('cgrid').innerHTML = sorted.length
    ? sorted.map(d => cardHTML(d, pIds.has(d.id))).join('')
    : '<div class="empty">No ideas indexed for this variable.</div>';
}

//  FORMAT 
let selFmt = null;
function buildFormatGrid() {
  const fg = document.getElementById('fgrid');
  if (fg.children.length) return;
  Object.entries(FMT_MAP).sort((a,b) => b[1].length - a[1].length).forEach(([k, items]) => {
    const btn = document.createElement('button'); btn.className = 'fb';
    btn.innerHTML = `<div>${k}</div><div class="fct">${items.length} ideas</div>`;
    btn.onclick = () => toggleFmt(k, btn); fg.appendChild(btn);
  });
}
function toggleFmt(k, btn) {
  if (selFmt === k) {
    selFmt = null;
    document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
    document.getElementById('fgridout').innerHTML = '';
    document.getElementById('fcnt').textContent = '';
  } else {
    selFmt = k;
    document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const items = (FMT_MAP[k]||[]).sort((a,b) => ((b.vs||0)+(b.bonus||0)) - ((a.vs||0)+(a.bonus||0)));
    document.getElementById('fcnt').textContent = `${items.length} ideas`;
    document.getElementById('fgridout').innerHTML = items.map(d => cardHTML(d)).join('');
  }
}

//  GEO ACCORDION 
function buildGeoAccordion() {
  const r1 = document.getElementById('geo-row1');
  const r2 = document.getElementById('geo-row2');
  const r3 = document.getElementById('geo-row3');
  const bc = document.getElementById('geo-breadcrumb');
  if (!r1) return;

  // Row 1: USA / WORLD
  r1.innerHTML = '';
  ['USA','WORLD'].forEach(key => {
    const btn = document.createElement('button');
    btn.className = 'fp geo-top' + (geoRow2 === key ? ' on' : '');
    btn.textContent = GEO_TREE[key].label;
    btn.onclick = () => {
      if (geoRow2 === key) { geoRow2 = null; geoRow3 = null; }
      else { geoRow2 = key; geoRow3 = null; }
      buildGeoAccordion();
    };
    r1.appendChild(btn);
  });

  // Row 2
  r2.innerHTML = '';
  r2.style.display = geoRow2 ? 'flex' : 'none';
  if (geoRow2) {
    const parent = GEO_TREE[geoRow2];
    // ALL button first
    const allBtn = document.createElement('button');
    const isAllActive = geoFilter?.key === geoRow2 + '_ALL_BTN';
    allBtn.className = 'fp geo-pill' + (isAllActive ? ' on' : '');
    allBtn.textContent = geoRow2 === 'USA' ? 'ALL USA' : 'ALL WORLD';
    allBtn.onclick = () => {
      if (isAllActive) { geoFilter = null; }
      else {
        geoFilter = {
          key: geoRow2 + '_ALL_BTN',
          prefix: geoRow2 === 'USA' ? 'us' : null,
          leaves: geoRow2 === 'WORLD' ? buildWorldLeaves() : null,
          label: geoRow2 === 'USA' ? 'ALL USA' : 'ALL WORLD'
        };
      }
      updateResetBtn(); buildGeoAccordion(); 
renderBrowse();
    };
    r2.appendChild(allBtn);

    parent.children.forEach(key => {
      if (key === 'USA_ALL' || key === 'WORLD_ALL') return; // handled above
      const node = GEO_TREE[key];
      const hasChildren = !!(node.children);
      const isActive = geoRow3 === key || geoFilter?.key === key;
      const btn = document.createElement('button');
      btn.className = 'fp geo-pill' + (isActive ? ' on' : '') + (hasChildren ? ' geo-has-children' : '');
      btn.textContent = node.label + (hasChildren ? ' ' : '');
      btn.onclick = () => {
        if (hasChildren) {
          geoRow3 = (geoRow3 === key) ? null : key;
          buildGeoAccordion();
        } else {
          // Leaf - filter directly
          if (geoFilter?.key === key) { geoFilter = null; }
          else { geoFilter = { key, leaves: new Set([key]), label: node.label }; }
          updateResetBtn(); buildGeoAccordion(); 
renderBrowse();
        }
      };
      r2.appendChild(btn);
    });
  }

  // Row 3
  r3.innerHTML = '';
  r3.style.display = geoRow3 ? 'flex' : 'none';
  if (geoRow3) {
    const parent = GEO_TREE[geoRow3];
    if (parent && parent.children) {
      // For STATE panel - compact grid with abbrevs
      const isStatePanel = geoRow3 === 'USA_ST';
      if (isStatePanel) r3.classList.add('geo-state-grid');
      else r3.classList.remove('geo-state-grid');

      parent.children.forEach(key => {
        const node = GEO_TREE[key];
        if (!node) return;
        const hasChildren = !!(node.children);
        const isActive = geoFilter?.key === key;
        const btn = document.createElement('button');
        btn.className = 'fp geo-pill' + (isActive ? ' on' : '') + (hasChildren ? ' geo-has-children' : '');
        btn.textContent = node.label + (hasChildren ? ' ' : '');
        if (node.full) btn.title = node.full;
        btn.onclick = () => {
          if (hasChildren) {
            // sub-expand: for now open inline (Europe sub-regions etc.)
            if (geoFilter?.key === key + '_ALL') { geoFilter = null; }
            else {
              const leaves = geoLeaves(key);
              geoFilter = { key: key + '_ALL', leaves, label: node.label };
            }
            updateResetBtn(); buildGeoAccordion(); 
renderBrowse();
          } else {
            if (geoFilter?.key === key) { geoFilter = null; }
            else { geoFilter = { key, leaves: new Set([key]), label: node.label }; }
            updateResetBtn(); buildGeoAccordion(); 
renderBrowse();
          }
        };
        r3.appendChild(btn);
      });
    }
  }

  // Breadcrumb
  if (bc) {
    if (geoFilter) {
      bc.style.display = 'flex';
      bc.innerHTML = `<span class="geo-bc-label">${geoFilter.label}</span><span class="geo-bc-x" onclick="geoFilter=null;updateResetBtn();buildGeoAccordion();renderBrowse()">x</span>`;
    } else {
      bc.style.display = 'none';
    }
  }
}

function buildWorldLeaves() {
  const s = new Set(['worldwide','global_city','north_america','middle_east','oceania','global','World','world',
    'europe','europe_west','europe_east','europe_nordic','europe_south',
    'asia','asia_east','asia_south','asia_southeast','asia_central',
    'africa','africa_sub','africa_west','africa_east','africa_north',
    'latin_america','latin_south','latin_central','caribbean']);
  return s;
}

//  SAVED FILTERS 
const SF_KEY = 'mz_saved_filters';
function loadSavedFilters() { try { return JSON.parse(localStorage.getItem(SF_KEY)||'[]'); } catch { return []; } }
function saveSavedFilters(arr) { localStorage.setItem(SF_KEY, JSON.stringify(arr)); }

function saveCurrentFilter() {
  const name = document.getElementById('sf-name-input')?.value?.trim();
  if (!name) return;
  const filters = loadSavedFilters();
  filters.push({
    name,
    activeFilters: {...activeFilters},
    activeTopics: [...activeTopics],
    geoFilter: geoFilter ? {...geoFilter, leaves: geoFilter.leaves ? [...geoFilter.leaves] : null} : null,
    geoRow2, geoRow3,
    sortK, sortDir,
    q: document.getElementById('q')?.value || '',
    scFilters: {...scFilters},
  });
  saveSavedFilters(filters);
  document.getElementById('sf-name-input').value = '';
  document.getElementById('sf-save-area').style.display = 'none';
  renderSavedFilters();
}

function applyFilter(f) {
  Object.assign(activeFilters, f.activeFilters);
  activeTopics = new Set(f.activeTopics);
  geoFilter = f.geoFilter ? {...f.geoFilter, leaves: f.geoFilter.leaves ? new Set(f.geoFilter.leaves) : null} : null;
  geoRow2 = f.geoRow2; geoRow3 = f.geoRow3;
  sortK = f.sortK; sortDir = f.sortDir;
  scFilters = {...(f.scFilters||{})};
  if (document.getElementById('q')) document.getElementById('q').value = f.q || '';
  // Restore pill UI
  document.querySelectorAll('.fp.on').forEach(b => b.classList.remove('on'));
  ['type','fmt','status','notes'].forEach(field => {
    if (activeFilters[field]) {
      const b = document.querySelector(`.fp[data-f="${field}"][data-v="${activeFilters[field]}"]`);
      if (b) b.classList.add('on');
    }
  });
  document.querySelectorAll('.fp.topic').forEach(btn => {
    const val = btn.dataset.v, c = TOPIC_COLORS[val];
    if (activeTopics.has(val)) {
      btn.classList.add('on');
      btn.style.background=c+'33'; btn.style.color=c; btn.style.borderColor=c;
    } else if (c) {
      btn.classList.remove('on');
      btn.style.color=c; btn.style.borderColor=c+'55'; btn.style.background=c+'12';
    }
  });
  document.querySelectorAll('.sb').forEach(b => b.classList.remove('on','asc','desc'));
  const sb = document.querySelector(`.sb[data-k="${sortK}"]`);
  if (sb) { sb.classList.add('on'); sb.classList.add(sortDir); }
  buildGeoAccordion();
  updateResetBtn(); 
renderBrowse();
}

function renderSavedFilters() {
  const container = document.getElementById('saved-filters-strip');
  if (!container) return;
  const filters = loadSavedFilters();
  container.style.display = filters.length ? 'flex' : 'none';
  container.innerHTML = filters.map((f,i) =>
    `<span class="sf-bookmark">
      <span onclick="applyFilter(${JSON.stringify(f).replace(/"/g,'&quot;')})">${f.name}</span>
      <span class="sf-x" onclick="deleteSavedFilter(${i})">x</span>
    </span>`
  ).join('');
}

function deleteSavedFilter(i) {
  const filters = loadSavedFilters();
  filters.splice(i,1);
  saveSavedFilters(filters);
  renderSavedFilters();
}

function toggleSaveArea() {
  const area = document.getElementById('sf-save-area');
  if (!area) return;
  const showing = area.style.display !== 'none';
  area.style.display = showing ? 'none' : 'flex';
  if (!showing) document.getElementById('sf-name-input')?.focus();
}

// Card type colors for left border
const TYPE_BORDER = { MAP:'#22c55e', XREF:'#3b82f6', CHART:'#a855f7', RANK:'#f59e0b' };

// Format bonus for v4 virality algorithm (choropleths are proven viral formats)

//  INIT 
(function initTopicPills() {
  document.querySelectorAll('.fp.topic').forEach(btn => {
    const val = btn.dataset.v;
    const c = TOPIC_COLORS[val];
    if (c) {
      btn.style.color = c;
      btn.style.borderColor = c + '55';
      btn.style.background = c + '12';
    }
  });
})();


renderBrowse();
