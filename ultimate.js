// ===== RUNNER DASHBOARD ULTIMATE - JAVASCRIPT =====

// ===== STATE =====
let allRuns = [];
let athlete = {};
let charts = {};
let filteredRuns = [];
let currentStreak = 0;
let longestStreak = 0;

// Cache pour optimisation
let statsCache = null;
let avgPaceCache = null;

// ===== HELPERS =====
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Août','Sep','Oct','Nov','Déc'];

function formatPace(secPerKm) {
  if (!secPerKm) return '--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ===== STREAKS =====
function calculateStreaks(runs) {
  if (!runs.length) return { current: 0, longest: 0 };

  const sortedRuns = [...runs].sort((a, b) => new Date(a.date) - new Date(b.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  let longest = 0;
  let tempStreak = 1;
  let lastDate = new Date(sortedRuns[0].date);

  for (let i = 1; i < sortedRuns.length; i++) {
    const currentDate = new Date(sortedRuns[i].date);
    const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
    } else if (diffDays > 1) {
      longest = Math.max(longest, tempStreak);
      tempStreak = 1;
    }
    lastDate = currentDate;
  }
  longest = Math.max(longest, tempStreak);

  // Check current streak
  const lastRunDate = new Date(sortedRuns[sortedRuns.length - 1].date);
  const daysSinceLastRun = Math.floor((today - lastRunDate) / (1000 * 60 * 60 * 24));
  current = daysSinceLastRun <= 1 ? tempStreak : 0;

  return { current, longest };
}

// ===== AUTH =====
async function checkAuth() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      athlete = await res.json();
      showLoggedIn();
      return true;
    }
    const data = await res.json();
    if (data.reconnect) window.location.href = '/auth/strava';
  } catch(e) {}
  return false;
}

function showLoggedIn() {
  document.getElementById('section-login').classList.add('hidden');
  document.getElementById('section-dashboard').classList.remove('hidden');
  document.getElementById('avatar-letter').textContent = athlete.firstname?.[0] || athlete.username?.[0] || '?';
  document.getElementById('profile-name').textContent = athlete.firstname || athlete.username || 'Athlète';
  document.getElementById('profile-status').textContent = 'Connecté';
  document.getElementById('page-title').textContent = 'Dashboard Ultimate';
  document.getElementById('page-subtitle').textContent = `${athlete.firstname || 'Athlète'} — Bienvenue`;
  showSection('dashboard');
}

// ===== LOAD DATA =====
async function loadRuns() {
  try {
    const res = await fetch('/api/runs');
    if (res.status === 401) {
      const data = await res.json();
      if (data.reconnect) window.location.href = '/auth/strava';
      return;
    }
    const data = await res.json();
    allRuns = data.map(r => {
      const distKm = r.distance / 1000;
      let paceStr = null, paceSecPerKm = null, speedKmh = null;
      if (r.average_speed && r.average_speed > 0) {
        speedKmh = r.average_speed * 3.6;
        const paceMinPerKm = 60 / speedKmh;
        const paceMin = Math.floor(paceMinPerKm);
        const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
        paceStr = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec}`;
        paceSecPerKm = paceMin * 60 + paceSec;
      }
      return {
        id: r.id,
        date: r.start_date_local?.split('T')[0],
        name: r.name,
        dist: distKm,
        pace: paceStr,
        paceSecPerKm: paceSecPerKm,
        speedKmh: speedKmh,
        elev: r.total_elevation_gain || 0,
        hr: r.average_heartrate || null,
        maxHr: r.max_heartrate || null,
        cal: r.calories || 0,
        time: r.moving_time || 0,
        raw: r,
      };
    }).filter(r => r.date).sort((a, b) => new Date(b.date) - new Date(a.date));

    filteredRuns = [...allRuns];
    const streaks = calculateStreaks(allRuns);
    currentStreak = streaks.current;
    longestStreak = streaks.longest;

    if (currentStreak > 0) {
      document.getElementById('streak-badge').classList.remove('hidden');
      document.getElementById('streak-count').textContent = currentStreak;
    }

    renderAllSections();
  } catch (e) {
    console.error('Failed to load runs:', e);
  }
}

// ===== COMPUTE STATS =====
function computeStats(runs) {
  if (!runs.length) return null;

  // Utiliser le cache si disponible et que runs n'ont pas changé
  if (statsCache && statsCache.runsLength === runs.length) {
    return statsCache.data;
  }

  const totalDist = runs.reduce((s, r) => s + r.dist, 0);
  const paces = runs.filter(r => r.paceSecPerKm).map(r => r.paceSecPerKm);
  const avgPaceSec = paces.length ? paces.reduce((s, p) => s + p, 0) / paces.length : null;
  const avgPace = avgPaceSec ? formatPace(avgPaceSec) : '--';
  const avgSpeedKmh = avgPaceSec ? (3600 / avgPaceSec).toFixed(1) : null;
  const totalElev = runs.reduce((s, r) => s + r.elev, 0);
  const totalCal = runs.reduce((s, r) => s + r.cal, 0);
  const totalSec = runs.reduce((s, r) => s + r.time, 0);
  const hours = Math.round(totalSec / 3600);
  const vma = avgSpeedKmh ? (parseFloat(avgSpeedKmh) * 1.1).toFixed(1) : null;

  // Advanced stats
  const sortedPaces = [...paces].sort((a,b)=>a-b);
  const median = sortedPaces.length ? sortedPaces[Math.floor(sortedPaces.length/2)] : null;
  const stdDev = paces.length > 1 ? Math.sqrt(paces.reduce((s,p) => s + Math.pow(p - avgPaceSec, 2), 0) / paces.length) : 0;

  const result = {
    totalDist, avgPace, avgSpeedKmh, totalElev, totalCal, hours, vma, count: runs.length,
    medianPace: median ? formatPace(median) : '--',
    stdDevPace: stdDev ? formatPace(stdDev) : '--'
  };

  // Mettre en cache
  statsCache = { runsLength: runs.length, data: result };
  return result;
}

// ===== DESTROY CHARTS =====
function destroyCharts() {
  Object.values(charts).forEach(c => {
    if (c && typeof c.destroy === 'function') {
      c.destroy();
    }
  });
  charts = {};
}

// ===== RENDER ALL SECTIONS (optimisé) =====
function renderAllSections() {
  // Utiliser requestAnimationFrame pour optimiser le rendu
  requestAnimationFrame(() => {
    renderDashboard();
  });

  // Lazy load des autres sections
  const lazyRender = () => {
    requestAnimationFrame(() => {
      renderRunsList();
      renderRecords();
    });
  };

  setTimeout(lazyRender, 100);
}

// ===== DASHBOARD =====
function renderDashboard() {
  const stats = computeStats(filteredRuns);
  if (!stats) return;

  const cards = [
    { icon: '🏃', label: 'Total', value: stats.totalDist.toFixed(0) + ' km', sub: `${stats.count} runs`, color: 'accent' },
    { icon: '⏱️', label: 'Pace moyen', value: stats.avgPace + '/km', sub: stats.avgSpeedKmh ? `(${stats.avgSpeedKmh} km/h)` : '', color: 'accentBlue' },
    { icon: '📈', label: 'Élévation', value: stats.totalElev.toLocaleString() + ' m', sub: 'cumulée', color: 'accentPurple' },
    { icon: '🔥', label: 'Calories', value: stats.totalCal.toLocaleString(), sub: 'brûlées', color: 'accentPink' },
    { icon: '⏰', label: 'Temps', value: `${stats.hours}h`, sub: 'de course', color: 'accentOrange' },
    { icon: '💨', label: 'VMA', value: stats.vma ? stats.vma + ' km/h' : '--', sub: 'estimée', color: 'accent' },
    { icon: '🔥', label: 'Streak', value: currentStreak + ' j', sub: `Max: ${longestStreak}j`, color: 'accentOrange' },
    { icon: '📊', label: 'Médiane', value: stats.medianPace + '/km', sub: 'pace médian', color: 'accentBlue' },
  ];

  document.getElementById('section-dashboard').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
      ${cards.map((c, i) => `
        <div class="stat-card glass rounded-2xl p-4 card-hover fade-in" style="animation-delay:${i*0.05}s">
          <div class="text-2xl mb-2">${c.icon}</div>
          <div class="text-xl font-bold">${c.value}</div>
          <div class="text-xs text-slate-400 mt-1">${c.sub}</div>
          <div class="text-[9px] uppercase tracking-wider font-medium mt-2 text-${c.color}">${c.label}</div>
        </div>
      `).join('')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4">📈 Progression distance</h3>
        <canvas id="chart-progression" height="200"></canvas>
      </div>
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4">⏱️ Évolution du pace</h3>
        <canvas id="chart-pace-evolution" height="200"></canvas>
      </div>
    </div>

    <div class="glass rounded-2xl p-6 card-hover">
      <h3 class="font-semibold mb-4">🗓️ Heatmap annuelle</h3>
      <div id="heatmap-container"></div>
    </div>

    <div class="glass rounded-2xl p-6 card-hover">
      <h3 class="font-semibold mb-4">🏃 Derniers runs</h3>
      <div id="recent-runs" class="space-y-3"></div>
    </div>
  `;

  renderDashboardCharts();
  renderHeatmap();
  renderRecentRuns();
}

function renderDashboardCharts() {
  // Détruire les anciens graphiques
  if (charts.progression) charts.progression.destroy();
  if (charts.paceEvolution) charts.paceEvolution.destroy();

  // Progression chart avec optimisations
  requestAnimationFrame(() => {
    const ctx1 = document.getElementById('chart-progression');
    if (ctx1) {
      charts.progression = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: filteredRuns.slice(-20).reverse().map(r => new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})),
          datasets: [{
            label: 'Distance (km)',
            data: filteredRuns.slice(-20).reverse().map(r => r.dist),
            borderColor: '#CCFF00',
            backgroundColor: 'rgba(204,255,0,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
      });
    }
  });

  // Pace evolution chart avec optimisations
  requestAnimationFrame(() => {
    const ctx2 = document.getElementById('chart-pace-evolution');
    if (ctx2) {
      charts.paceEvolution = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: filteredRuns.filter(r => r.paceSecPerKm).slice(-20).reverse().map(r => new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})),
          datasets: [{
            label: 'Pace (min/km)',
            data: filteredRuns.filter(r => r.paceSecPerKm).slice(-20).reverse().map(r => r.paceSecPerKm / 60),
            borderColor: '#00D4FF',
            backgroundColor: 'rgba(0,212,255,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500 },
          plugins: { legend: { display: false } },
          scales: {
            y: { reverse: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
      });
    }
  });
}

function renderHeatmap() {
  const container = document.getElementById('heatmap-container');
  if (!container) return;

  const dailyCount = {};
  filteredRuns.forEach(r => {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dailyCount[key] = (dailyCount[key] || 0) + 1;
  });

  const year = 2026;
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  let html = '<div class="flex gap-2 flex-wrap">';
  monthNames.forEach((name, mi) => {
    html += `<div class="flex-1 min-w-[60px]"><div class="text-[10px] text-slate-500 mb-1">${name}</div><div class="flex flex-wrap gap-[2px]">`;
    for (let d = 1; d <= monthDays[mi]; d++) {
      const key = `${year}-${mi}-${d}`;
      const count = dailyCount[key] || 0;
      const intensity = count === 0 ? '#1e293b' : count === 1 ? '#166534' : count === 2 ? '#15803d' : '#22c55e';
      html += `<div class="w-2 h-2 rounded-sm" style="background:${intensity}" title="${name} ${d}: ${count} run(s)"></div>`;
    }
    html += '</div></div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderRecentRuns() {
  const container = document.getElementById('recent-runs');
  if (!container) return;

  const recent = filteredRuns.slice(0, 5);
  container.innerHTML = recent.map(r => `
    <div class="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer">
      <div class="text-2xl">🏃</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm truncate">${r.name}</div>
        <div class="text-xs text-slate-500">${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</div>
      </div>
      <div class="text-right">
        <div class="font-semibold">${r.dist.toFixed(2)} km</div>
        <div class="text-xs text-slate-400">${r.pace || '--'}/km${r.speedKmh ? ` (${r.speedKmh.toFixed(1)} km/h)` : ''}</div>
      </div>
    </div>
  `).join('');
}

// ===== RUNS LIST (optimisé avec virtualisation) =====
function renderRunsList() {
  document.getElementById('section-runs').innerHTML = `
    <div class="flex gap-4 items-center">
      <input type="text" id="search-runs" placeholder="Rechercher..." class="bg-surface-800 border border-white/10 rounded-lg px-4 py-2 flex-1" oninput="debouncedFilterRunsList()">
      <select id="sort-runs" class="bg-surface-800 border border-white/10 rounded-lg px-4 py-2" onchange="filterRunsList()">
        <option value="date-desc">Plus récent</option>
        <option value="date-asc">Plus ancien</option>
        <option value="dist-desc">Distance ↓</option>
        <option value="pace-asc">Pace ↑</option>
      </select>
    </div>
    <div id="runs-list" class="space-y-3"></div>
  `;
  filterRunsList();
}

// Debounce pour la recherche
let searchTimeout;
function debouncedFilterRunsList() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(filterRunsList, 200);
}

function filterRunsList() {
  const search = document.getElementById('search-runs')?.value.toLowerCase() || '';
  const sort = document.getElementById('sort-runs')?.value || 'date-desc';

  let filtered = filteredRuns.filter(r => r.name.toLowerCase().includes(search));

  // Tri optimisé
  filtered.sort((a, b) => {
    switch(sort) {
      case 'date-desc': return new Date(b.date) - new Date(a.date);
      case 'date-asc': return new Date(a.date) - new Date(b.date);
      case 'dist-desc': return b.dist - a.dist;
      case 'pace-asc': return (a.paceSecPerKm || Infinity) - (b.paceSecPerKm || Infinity);
      default: return 0;
    }
  });

  const container = document.getElementById('runs-list');
  if (!container) return;

  // Limiter à 50 runs pour performance, avec "Charger plus"
  const displayLimit = 50;
  const toDisplay = filtered.slice(0, displayLimit);

  // Utiliser DocumentFragment pour une seule insertion DOM
  const fragment = document.createDocumentFragment();
  const tempDiv = document.createElement('div');

  tempDiv.innerHTML = toDisplay.map(r => `
    <div class="glass rounded-xl p-4 card-hover cursor-pointer" onclick="showRunDetails('${r.id}')">
      <div class="flex items-start gap-4">
        <div class="text-3xl no-select">🏃</div>
        <div class="flex-1 min-w-0">
          <h4 class="font-semibold truncate">${r.name}</h4>
          <p class="text-xs text-slate-400 mt-1">${formatDate(r.date)}</p>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm">
          <div class="text-slate-500 text-xs">Distance</div><div class="font-medium">${r.dist.toFixed(2)} km</div>
          ${r.pace ? `<div class="text-slate-500 text-xs">Pace</div><div class="font-medium">${r.pace}/km${r.speedKmh ? ` <span class="text-slate-400 text-xs">(${r.speedKmh.toFixed(1)} km/h)</span>` : ''}</div>` : ''}
          <div class="text-slate-500 text-xs">Élévation</div><div class="font-medium">${r.elev} m</div>
          ${r.hr ? `<div class="text-slate-500 text-xs">FC moy</div><div class="font-medium">${r.hr} bpm</div>` : ''}
        </div>
        <i data-lucide="chevron-right" class="w-5 h-5 text-slate-500 no-select"></i>
      </div>
    </div>
  `).join('');

  while(tempDiv.firstChild) {
    fragment.appendChild(tempDiv.firstChild);
  }

  container.innerHTML = '';
  container.appendChild(fragment);

  if (filtered.length > displayLimit) {
    const loadMore = document.createElement('div');
    loadMore.className = 'text-center py-4';
    loadMore.innerHTML = `<button class="bg-accent/10 hover:bg-accent/20 text-accent px-6 py-2 rounded-lg transition">${filtered.length - displayLimit} runs restants - Affiner la recherche</button>`;
    container.appendChild(loadMore);
  }

  lucide.createIcons();
}

// ===== RECORDS =====
function renderRecords() {
  const bestPace = allRuns.filter(r => r.paceSecPerKm && r.dist >= 2).sort((a, b) => a.paceSecPerKm - b.paceSecPerKm).slice(0, 5);
  const bestDist = [...allRuns].sort((a, b) => b.dist - a.dist).slice(0, 5);
  const bestElev = [...allRuns].sort((a, b) => b.elev - a.elev).slice(0, 5);
  const bestCal = [...allRuns].sort((a, b) => b.cal - a.cal).slice(0, 5);
  const longestTime = [...allRuns].sort((a, b) => b.time - a.time).slice(0, 5);

  document.getElementById('section-records').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">⚡</span> Meilleurs paces (min 2km)</h3>
        <div class="space-y-3">
          ${bestPace.map((r, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer" onclick="showRunDetails('${r.id}')">
              <span class="text-xl">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${r.name}</div>
                <div class="text-xs text-slate-500">${r.dist.toFixed(2)} km · ${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</div>
              </div>
              <div class="font-bold text-accent">${r.pace}/km</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📏</span> Plus longues distances</h3>
        <div class="space-y-3">
          ${bestDist.map((r, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer" onclick="showRunDetails('${r.id}')">
              <span class="text-xl">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${r.name}</div>
                <div class="text-xs text-slate-500">${r.pace || '--'}/km · ${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</div>
              </div>
              <div class="font-bold text-accentBlue">${r.dist.toFixed(2)} km</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">⛰️</span> Plus grand dénivelé</h3>
        <div class="space-y-3">
          ${bestElev.map((r, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer" onclick="showRunDetails('${r.id}')">
              <span class="text-xl">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${r.name}</div>
                <div class="text-xs text-slate-500">${r.dist.toFixed(2)} km · ${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</div>
              </div>
              <div class="font-bold text-accentPurple">${r.elev} m</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🔥</span> Plus de calories brûlées</h3>
        <div class="space-y-3">
          ${bestCal.map((r, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer" onclick="showRunDetails('${r.id}')">
              <span class="text-xl">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${r.name}</div>
                <div class="text-xs text-slate-500">${r.dist.toFixed(2)} km · ${r.hr ? r.hr + ' bpm' : '--'}</div>
              </div>
              <div class="font-bold text-accentPink">${r.cal} kcal</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">⏱️</span> Durées les plus longues</h3>
        <div class="space-y-3">
          ${longestTime.map((r, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer" onclick="showRunDetails('${r.id}')">
              <span class="text-xl">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${r.name}</div>
                <div class="text-xs text-slate-500">${r.dist.toFixed(2)} km · ${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</div>
              </div>
              <div class="font-bold text-accentOrange">${formatTime(r.time)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      ${allRuns.filter(r => r.hr).length > 0 ? `
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">❤️</span> FC moyenne la plus élevée</h3>
        <div class="space-y-3">
          ${allRuns.filter(r => r.hr).sort((a, b) => b.hr - a.hr).slice(0, 5).map((r, i) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition cursor-pointer" onclick="showRunDetails('${r.id}')">
              <span class="text-xl">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">${r.name}</div>
                <div class="text-xs text-slate-500">${r.dist.toFixed(2)} km · ${r.pace || '--'}/km</div>
              </div>
              <div class="font-bold text-red-400">${r.hr} bpm</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  `;
  lucide.createIcons();
}

// ===== PROGRESSION =====
function renderProgression() {
  const monthlyStats = {};
  allRuns.forEach(r => {
    const month = r.date.substring(0, 7);
    if (!monthlyStats[month]) monthlyStats[month] = { dist: 0, count: 0, paces: [] };
    monthlyStats[month].dist += r.dist;
    monthlyStats[month].count++;
    if (r.paceSecPerKm) monthlyStats[month].paces.push(r.paceSecPerKm);
  });

  const months = Object.keys(monthlyStats).sort();

  document.getElementById('section-progression').innerHTML = `
    <div class="glass rounded-2xl p-6 card-hover">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📈</span> Évolution mensuelle</h3>
      <canvas id="chart-monthly-progress" height="250"></canvas>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🏃</span> Nombre de runs par mois</h3>
        <canvas id="chart-monthly-count" height="200"></canvas>
      </div>
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">⏱️</span> Évolution du pace moyen</h3>
        <canvas id="chart-pace-progress" height="200"></canvas>
      </div>
    </div>

    <div class="glass rounded-2xl p-6 card-hover">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📊</span> Statistiques de progression</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${months.slice(-4).map(m => `
          <div class="bg-surface-800/50 rounded-xl p-4">
            <div class="text-xs text-slate-400 mb-2">${new Date(m + '-01').toLocaleDateString('fr-FR', {month:'long', year:'numeric'})}</div>
            <div class="text-2xl font-bold text-accent">${monthlyStats[m].dist.toFixed(0)} km</div>
            <div class="text-sm text-slate-400 mt-1">${monthlyStats[m].count} runs</div>
            ${monthlyStats[m].paces.length > 0 ? `<div class="text-sm text-slate-400 mt-1">${formatPace(monthlyStats[m].paces.reduce((s,p) => s+p, 0) / monthlyStats[m].paces.length)}/km</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Charts
  const ctx1 = document.getElementById('chart-monthly-progress');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: months.map(m => new Date(m + '-01').toLocaleDateString('fr-FR', {month:'short'})),
        datasets: [{
          label: 'Distance (km)',
          data: months.map(m => monthlyStats[m].dist),
          backgroundColor: 'rgba(204,255,0,0.6)',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  const ctx2 = document.getElementById('chart-monthly-count');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels: months.map(m => new Date(m + '-01').toLocaleDateString('fr-FR', {month:'short'})),
        datasets: [{
          label: 'Nombre de runs',
          data: months.map(m => monthlyStats[m].count),
          borderColor: '#00D4FF',
          backgroundColor: 'rgba(0,212,255,0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#64748b', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  const ctx3 = document.getElementById('chart-pace-progress');
  if (ctx3) {
    new Chart(ctx3, {
      type: 'line',
      data: {
        labels: months.filter(m => monthlyStats[m].paces.length > 0).map(m => new Date(m + '-01').toLocaleDateString('fr-FR', {month:'short'})),
        datasets: [{
          label: 'Pace moyen (min/km)',
          data: months.filter(m => monthlyStats[m].paces.length > 0).map(m => monthlyStats[m].paces.reduce((s,p) => s+p, 0) / monthlyStats[m].paces.length / 60),
          borderColor: '#FB923C',
          backgroundColor: 'rgba(251,146,60,0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { reverse: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
}

// ===== HEART RATE ZONES =====
function renderHeartRateZones() {
  const runsWithHr = allRuns.filter(r => r.hr);

  if (runsWithHr.length === 0) {
    document.getElementById('section-heartrate').innerHTML = `
      <div class="glass rounded-2xl p-6">
        <h3 class="font-semibold mb-4">❤️ Zones de fréquence cardiaque</h3>
        <p class="text-slate-400">Aucune donnée de fréquence cardiaque disponible. Connecte une montre cardio pour voir cette section.</p>
      </div>
    `;
    return;
  }

  const maxHrEstimate = 220 - 30; // Estimation (220 - âge), ici âge par défaut 30
  const zones = [
    { name: 'Zone 1 (Récupération)', min: 0.5, max: 0.6, color: '#60a5fa', desc: 'Échauffement et récupération active' },
    { name: 'Zone 2 (Endurance)', min: 0.6, max: 0.7, color: '#34d399', desc: 'Développement de l\'endurance de base' },
    { name: 'Zone 3 (Tempo)', min: 0.7, max: 0.8, color: '#fbbf24', desc: 'Amélioration du seuil aérobie' },
    { name: 'Zone 4 (Seuil)', min: 0.8, max: 0.9, color: '#fb923c', desc: 'Augmentation du seuil anaérobie' },
    { name: 'Zone 5 (VO2 Max)', min: 0.9, max: 1.0, color: '#ef4444', desc: 'Développement puissance maximale' }
  ];

  const zoneDistribution = zones.map(z => ({
    ...z,
    count: runsWithHr.filter(r => r.hr >= z.min * maxHrEstimate && r.hr < z.max * maxHrEstimate).length
  }));

  document.getElementById('section-heartrate').innerHTML = `
    <div class="glass rounded-2xl p-6 card-hover">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">❤️</span> Répartition des zones FC</h3>
      <div class="mb-6">
        <div class="text-sm text-slate-400 mb-2">FC max estimée : ${maxHrEstimate} bpm (formule : 220 - âge)</div>
        <canvas id="chart-hr-zones" height="200"></canvas>
      </div>
      <div class="space-y-3">
        ${zones.map((z, i) => `
          <div class="flex items-center gap-4">
            <div class="w-16 h-3 rounded" style="background: ${z.color}"></div>
            <div class="flex-1">
              <div class="font-medium text-sm">${z.name}</div>
              <div class="text-xs text-slate-400">${Math.round(z.min * maxHrEstimate)} - ${Math.round(z.max * maxHrEstimate)} bpm · ${z.desc}</div>
            </div>
            <div class="font-bold">${zoneDistribution[i].count} runs</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4">❤️ FC moyenne</h3>
        <div class="text-4xl font-bold text-red-400">${Math.round(runsWithHr.reduce((s, r) => s + r.hr, 0) / runsWithHr.length)} bpm</div>
        <div class="text-sm text-slate-400 mt-2">Sur ${runsWithHr.length} runs</div>
      </div>
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4">📈 FC la plus haute</h3>
        <div class="text-4xl font-bold text-red-500">${Math.max(...runsWithHr.map(r => r.hr))} bpm</div>
        <div class="text-sm text-slate-400 mt-2">${runsWithHr.find(r => r.hr === Math.max(...runsWithHr.map(r => r.hr)))?.name}</div>
      </div>
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4">📉 FC la plus basse</h3>
        <div class="text-4xl font-bold text-blue-400">${Math.min(...runsWithHr.map(r => r.hr))} bpm</div>
        <div class="text-sm text-slate-400 mt-2">${runsWithHr.find(r => r.hr === Math.min(...runsWithHr.map(r => r.hr)))?.name}</div>
      </div>
    </div>
  `;

  const ctx = document.getElementById('chart-hr-zones');
  if (ctx) {
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: zones.map(z => z.name),
        datasets: [{
          data: zoneDistribution.map(z => z.count),
          backgroundColor: zones.map(z => z.color),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

// ===== COMPARE =====
function renderCompare() {
  document.getElementById('section-compare').innerHTML = `
    <div class="glass rounded-2xl p-6">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🔀</span> Comparer deux runs</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <select id="compare-run1" class="bg-surface-800 border border-white/10 rounded-lg px-4 py-2">
          <option value="">Sélectionner run 1</option>
          ${allRuns.map(r => `<option value="${r.id}">${r.name} - ${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</option>`).join('')}
        </select>
        <select id="compare-run2" class="bg-surface-800 border border-white/10 rounded-lg px-4 py-2">
          <option value="">Sélectionner run 2</option>
          ${allRuns.map(r => `<option value="${r.id}">${r.name} - ${new Date(r.date).toLocaleDateString('fr-FR', {day:'numeric', month:'short'})}</option>`).join('')}
        </select>
      </div>
      <button onclick="compareRuns()" class="w-full bg-accent text-surface-950 font-semibold py-3 rounded-lg hover:bg-accent/90 transition">
        Comparer
      </button>
      <div id="compare-results" class="mt-6"></div>
    </div>
  `;
}

function compareRuns() {
  const run1Id = document.getElementById('compare-run1').value;
  const run2Id = document.getElementById('compare-run2').value;

  if (!run1Id || !run2Id) {
    document.getElementById('compare-results').innerHTML = '<p class="text-slate-400 text-center">Sélectionne deux runs pour les comparer</p>';
    return;
  }

  const run1 = allRuns.find(r => r.id == run1Id);
  const run2 = allRuns.find(r => r.id == run2Id);

  const metrics = [
    { label: 'Distance', val1: run1.dist.toFixed(2) + ' km', val2: run2.dist.toFixed(2) + ' km', diff: ((run1.dist - run2.dist) / run2.dist * 100).toFixed(1) + '%', better: run1.dist > run2.dist },
    { label: 'Pace', val1: run1.pace || '--', val2: run2.pace || '--', diff: run1.paceSecPerKm && run2.paceSecPerKm ? ((run1.paceSecPerKm - run2.paceSecPerKm) / run2.paceSecPerKm * 100).toFixed(1) + '%' : '--', better: run1.paceSecPerKm && run2.paceSecPerKm ? run1.paceSecPerKm < run2.paceSecPerKm : false },
    { label: 'Élévation', val1: run1.elev + ' m', val2: run2.elev + ' m', diff: run2.elev > 0 ? ((run1.elev - run2.elev) / run2.elev * 100).toFixed(1) + '%' : '--', better: run1.elev > run2.elev },
    { label: 'Durée', val1: formatTime(run1.time), val2: formatTime(run2.time), diff: ((run1.time - run2.time) / run2.time * 100).toFixed(1) + '%', better: run1.time < run2.time },
    { label: 'FC moyenne', val1: run1.hr ? run1.hr + ' bpm' : '--', val2: run2.hr ? run2.hr + ' bpm' : '--', diff: run1.hr && run2.hr ? ((run1.hr - run2.hr) / run2.hr * 100).toFixed(1) + '%' : '--', better: run1.hr && run2.hr ? run1.hr < run2.hr : false },
    { label: 'Calories', val1: run1.cal || '--', val2: run2.cal || '--', diff: run2.cal > 0 ? ((run1.cal - run2.cal) / run2.cal * 100).toFixed(1) + '%' : '--', better: run1.cal > run2.cal }
  ];

  document.getElementById('compare-results').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div class="bg-surface-800/50 rounded-xl p-4">
        <h4 class="font-semibold mb-2">${run1.name}</h4>
        <p class="text-xs text-slate-400">${formatDate(run1.date)}</p>
      </div>
      <div class="bg-surface-800/50 rounded-xl p-4">
        <h4 class="font-semibold mb-2">${run2.name}</h4>
        <p class="text-xs text-slate-400">${formatDate(run2.date)}</p>
      </div>
    </div>
    <div class="space-y-3">
      ${metrics.map(m => `
        <div class="bg-surface-800/50 rounded-xl p-4">
          <div class="text-xs text-slate-400 mb-2">${m.label}</div>
          <div class="grid grid-cols-3 gap-4">
            <div class="font-bold text-lg">${m.val1}</div>
            <div class="text-center ${m.diff === '--' ? 'text-slate-500' : m.better ? 'text-accent' : 'text-slate-400'}">${m.diff}</div>
            <div class="font-bold text-lg text-right">${m.val2}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== CALENDAR =====
function renderCalendar() {
  const year = 2026;
  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const dailyRuns = {};
  allRuns.forEach(r => {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!dailyRuns[key]) dailyRuns[key] = [];
    dailyRuns[key].push(r);
  });

  document.getElementById('section-calendar').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${monthNames.map((name, mi) => {
        const firstDay = new Date(year, mi, 1).getDay();
        const adjustedFirstDay = (firstDay === 0 ? 7 : firstDay) - 1;

        let html = `<div class="glass rounded-2xl p-4 card-hover">
          <h3 class="font-semibold mb-3">${name} ${year}</h3>
          <div class="grid grid-cols-7 gap-1">
            ${['L','M','M','J','V','S','D'].map(d => `<div class="text-center text-xs text-slate-500 py-1">${d}</div>`).join('')}`;

        for (let i = 0; i < adjustedFirstDay; i++) {
          html += '<div></div>';
        }

        for (let d = 1; d <= monthDays[mi]; d++) {
          const key = `${year}-${mi}-${d}`;
          const runs = dailyRuns[key] || [];
          const intensity = runs.length === 0 ? '#1e293b' : runs.length === 1 ? '#166534' : runs.length === 2 ? '#15803d' : '#22c55e';
          html += `<div class="aspect-square rounded flex items-center justify-center text-xs cursor-pointer hover:scale-110 transition" style="background:${intensity}" title="${runs.length} run(s)">${d}</div>`;
        }

        html += '</div></div>';
        return html;
      }).join('')}
    </div>
  `;
}

// ===== PREDICTIONS =====
function renderPredictions() {
  const stats = computeStats(allRuns);
  if (!stats) return;

  const avgPace = allRuns.filter(r => r.paceSecPerKm).reduce((s, r) => s + r.paceSecPerKm, 0) / allRuns.filter(r => r.paceSecPerKm).length;
  const baseDist = 5;
  const baseTime = avgPace * baseDist; // Temps pour 5km en secondes

  const distances = [
    { name: '400 m', dist: 0.4, emoji: '⚡', desc: 'Sprint court' },
    { name: '800 m', dist: 0.8, emoji: '💨', desc: 'Demi-fond' },
    { name: '1 km', dist: 1, emoji: '🏃', desc: 'Court' },
    { name: '5 km', dist: 5, emoji: '🏃', desc: 'Populaire' },
    { name: '10 km', dist: 10, emoji: '🏃‍♂️', desc: 'Standard' },
    { name: 'Semi', dist: 21.0975, emoji: '🏅', desc: 'Demi-marathon' },
    { name: 'Marathon', dist: 42.195, emoji: '🏆', desc: 'Épreuve ultime' },
  ];

  const predictions = distances.map(d => {
    // Formule de Riegel : T2 = T1 * (D2/D1)^1.06
    const time = baseTime * Math.pow(d.dist / baseDist, 1.06);
    const hrs = Math.floor(time / 3600);
    const mins = Math.floor((time % 3600) / 60);
    const secs = Math.floor(time % 60);
    let timeStr;
    if (d.dist < 1) {
      const totalSecs = Math.floor(time);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      timeStr = m > 0 ? `${m}'${s.toString().padStart(2,'0')}"` : `${s}"`;
    } else if (hrs > 0) {
      timeStr = `${hrs}h${mins.toString().padStart(2,'0')}'${secs.toString().padStart(2,'0')}"`;
    } else {
      timeStr = `${mins}'${secs.toString().padStart(2,'0')}"`;
    }
    const speedKmh = (d.dist / (time / 3600));
    return {
      ...d,
      time: timeStr,
      pace: formatPace(time / d.dist),
      speed: speedKmh.toFixed(1)
    };
  });

  document.getElementById('section-predictions').innerHTML = `
    <div class="glass rounded-2xl p-6 card-hover mb-6">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🎯</span> Temps prédits (Formule de Riegel)</h3>
      <p class="text-sm text-slate-400 mb-6">Basé sur ton pace moyen de ${stats.avgPace}/km et la formule de Riegel</p>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        ${predictions.map(p => `
          <div class="bg-surface-800/50 rounded-xl p-4 text-center">
            <div class="text-3xl mb-2">${p.emoji}</div>
            <div class="text-xs text-slate-400 mb-2">${p.name}</div>
            <div class="text-xl font-bold text-accent mb-1">${p.time}</div>
            <div class="text-xs text-slate-400">${p.pace}/km</div>
            <div class="text-xs text-slate-500 mt-1">${p.speed} km/h</div>
          </div>
        `).join('')}
      </div>
      <p class="text-xs text-slate-400 mt-6 text-center italic">Note : Ces temps sont des estimations. La performance réelle dépend de l'entraînement, la forme du jour, et les conditions.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📈</span> Projection annuelle</h3>
        <div class="space-y-4">
          <div>
            <div class="text-xs text-slate-400 mb-1">Distance totale projetée</div>
            <div class="text-3xl font-bold text-accent">${Math.round(stats.totalDist / allRuns.length * 52 * (allRuns.length / 12))} km</div>
            <div class="text-sm text-slate-400 mt-1">basé sur ton rythme actuel</div>
          </div>
          <div>
            <div class="text-xs text-slate-400 mb-1">Runs projetés</div>
            <div class="text-3xl font-bold text-accentBlue">${Math.round(allRuns.length / 12 * 52)} runs</div>
            <div class="text-sm text-slate-400 mt-1">sur une année complète</div>
          </div>
        </div>
      </div>

      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🎖️</span> Objectifs recommandés</h3>
        <div class="space-y-3">
          <div class="bg-surface-800/50 rounded-xl p-3">
            <div class="font-medium text-sm mb-1">🏃 Court terme (1 mois)</div>
            <div class="text-xs text-slate-400">Améliore ton pace de 5% → Vise ${formatPace(avgPace * 0.95)}/km</div>
          </div>
          <div class="bg-surface-800/50 rounded-xl p-3">
            <div class="font-medium text-sm mb-1">🏅 Moyen terme (3 mois)</div>
            <div class="text-xs text-slate-400">Cours un semi-marathon en moins de ${predictions.find(p => p.name === 'Semi').time}</div>
          </div>
          <div class="bg-surface-800/50 rounded-xl p-3">
            <div class="font-medium text-sm mb-1">🏆 Long terme (6 mois)</div>
            <div class="text-xs text-slate-400">Prépare et termine un marathon</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== ANALYTICS =====
function renderAnalytics() {
  const paces = allRuns.filter(r => r.paceSecPerKm).map(r => r.paceSecPerKm);
  const distances = allRuns.map(r => r.dist);
  const elevations = allRuns.map(r => r.elev);

  // Statistiques avancées
  const paceMean = paces.reduce((s, p) => s + p, 0) / paces.length;
  const paceMedian = paces.sort((a, b) => a - b)[Math.floor(paces.length / 2)];
  const paceStdDev = Math.sqrt(paces.reduce((s, p) => s + Math.pow(p - paceMean, 2), 0) / paces.length);
  const paceQ1 = paces.sort((a, b) => a - b)[Math.floor(paces.length * 0.25)];
  const paceQ3 = paces.sort((a, b) => a - b)[Math.floor(paces.length * 0.75)];

  const distMean = distances.reduce((s, d) => s + d, 0) / distances.length;
  const distMedian = distances.sort((a, b) => a - b)[Math.floor(distances.length / 2)];
  const distStdDev = Math.sqrt(distances.reduce((s, d) => s + Math.pow(d - distMean, 2), 0) / distances.length);

  const elevMean = elevations.reduce((s, e) => s + e, 0) / elevations.length;
  const elevMedian = elevations.sort((a, b) => a - b)[Math.floor(elevations.length / 2)];

  document.getElementById('section-analytics').innerHTML = `
    <div class="glass rounded-2xl p-6 card-hover mb-6">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📊</span> Statistiques avancées</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-surface-800/50 rounded-xl p-4">
          <h4 class="font-medium mb-3 text-accentBlue">Pace</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">Moyenne</span><span class="font-medium">${formatPace(paceMean)}/km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Médiane</span><span class="font-medium">${formatPace(paceMedian)}/km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Écart-type</span><span class="font-medium">${formatPace(paceStdDev)}/km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Q1 (25%)</span><span class="font-medium">${formatPace(paceQ1)}/km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Q3 (75%)</span><span class="font-medium">${formatPace(paceQ3)}/km</span></div>
          </div>
        </div>

        <div class="bg-surface-800/50 rounded-xl p-4">
          <h4 class="font-medium mb-3 text-accent">Distance</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">Moyenne</span><span class="font-medium">${distMean.toFixed(2)} km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Médiane</span><span class="font-medium">${distMedian.toFixed(2)} km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Écart-type</span><span class="font-medium">${distStdDev.toFixed(2)} km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Min</span><span class="font-medium">${Math.min(...distances).toFixed(2)} km</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Max</span><span class="font-medium">${Math.max(...distances).toFixed(2)} km</span></div>
          </div>
        </div>

        <div class="bg-surface-800/50 rounded-xl p-4">
          <h4 class="font-medium mb-3 text-accentPurple">Élévation</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-slate-400">Moyenne</span><span class="font-medium">${elevMean.toFixed(0)} m</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Médiane</span><span class="font-medium">${elevMedian.toFixed(0)} m</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Total</span><span class="font-medium">${elevations.reduce((s, e) => s + e, 0).toLocaleString()} m</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Min</span><span class="font-medium">${Math.min(...elevations)} m</span></div>
            <div class="flex justify-between"><span class="text-slate-400">Max</span><span class="font-medium">${Math.max(...elevations)} m</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📈</span> Distribution des paces</h3>
        <canvas id="chart-pace-distribution" height="200"></canvas>
      </div>
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📏</span> Distribution des distances</h3>
        <canvas id="chart-distance-distribution" height="200"></canvas>
      </div>
    </div>

    <div class="glass rounded-2xl p-6 card-hover">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🔬</span> Insights</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${generateInsights().map(insight => `
          <div class="bg-surface-800/50 rounded-xl p-4 flex items-start gap-3">
            <span class="text-2xl">${insight.icon}</span>
            <div class="flex-1">
              <div class="font-medium text-sm mb-1">${insight.title}</div>
              <div class="text-xs text-slate-400">${insight.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Pace distribution chart
  const paceRanges = [
    { label: '< 4:00', count: paces.filter(p => p < 240).length },
    { label: '4:00-4:30', count: paces.filter(p => p >= 240 && p < 270).length },
    { label: '4:30-5:00', count: paces.filter(p => p >= 270 && p < 300).length },
    { label: '5:00-5:30', count: paces.filter(p => p >= 300 && p < 330).length },
    { label: '5:30-6:00', count: paces.filter(p => p >= 330 && p < 360).length },
    { label: '> 6:00', count: paces.filter(p => p >= 360).length },
  ];

  const ctx1 = document.getElementById('chart-pace-distribution');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: paceRanges.map(r => r.label),
        datasets: [{
          label: 'Nombre de runs',
          data: paceRanges.map(r => r.count),
          backgroundColor: 'rgba(0,212,255,0.6)',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: '#64748b', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Distance distribution chart
  const distRanges = [
    { label: '< 4 km', count: distances.filter(d => d < 4).length },
    { label: '4-6 km', count: distances.filter(d => d >= 4 && d < 6).length },
    { label: '6-10 km', count: distances.filter(d => d >= 6 && d < 10).length },
    { label: '10-15 km', count: distances.filter(d => d >= 10 && d < 15).length },
    { label: '15-21 km', count: distances.filter(d => d >= 15 && d < 21).length },
    { label: '> 21 km', count: distances.filter(d => d >= 21).length },
  ];

  const ctx2 = document.getElementById('chart-distance-distribution');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: distRanges.map(r => r.label),
        datasets: [{
          data: distRanges.map(r => r.count),
          backgroundColor: ['#A78BFA', '#00D4FF', '#CCFF00', '#FB923C', '#F472B6', '#60a5fa'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, font: { size: 11 } } }
        }
      }
    });
  }
}

function generateInsights() {
  const insights = [];
  const paces = allRuns.filter(r => r.paceSecPerKm).map(r => r.paceSecPerKm);
  const avgPace = paces.reduce((s, p) => s + p, 0) / paces.length;
  const recentPaces = allRuns.slice(0, 5).filter(r => r.paceSecPerKm).map(r => r.paceSecPerKm);
  const recentAvgPace = recentPaces.reduce((s, p) => s + p, 0) / recentPaces.length;

  if (recentAvgPace < avgPace * 0.95) {
    insights.push({ icon: '🔥', title: 'Forme en hausse !', desc: `Ton pace moyen récent (${formatPace(recentAvgPace)}/km) est meilleur que ta moyenne globale de ${((1 - recentAvgPace / avgPace) * 100).toFixed(0)}%` });
  } else if (recentAvgPace > avgPace * 1.05) {
    insights.push({ icon: '⚠️', title: 'Pace en baisse', desc: `Ton pace récent est plus lent. Prends du repos ou réduis l'intensité pour récupérer.` });
  }

  const avgDist = allRuns.reduce((s, r) => s + r.dist, 0) / allRuns.length;
  const longestRun = Math.max(...allRuns.map(r => r.dist));
  if (longestRun > avgDist * 2) {
    insights.push({ icon: '🏆', title: 'Endurance développée', desc: `Ton run le plus long (${longestRun.toFixed(1)} km) montre une bonne capacité d'endurance.` });
  }

  const totalElev = allRuns.reduce((s, r) => s + r.elev, 0);
  if (totalElev > 5000) {
    insights.push({ icon: '⛰️', title: 'Grimpeur confirmé', desc: `Tu as cumulé ${totalElev.toLocaleString()} m de dénivelé, excellent pour la puissance musculaire.` });
  }

  if (currentStreak >= 5) {
    insights.push({ icon: '🔥', title: 'Streak impressionnant', desc: `${currentStreak} jours consécutifs ! Continue mais attention au surentraînement.` });
  }

  const runsPerWeek = allRuns.length / (Math.max(...allRuns.map(r => new Date(r.date))) - Math.min(...allRuns.map(r => new Date(r.date)))) * 1000 * 60 * 60 * 24 * 7;
  if (runsPerWeek < 2) {
    insights.push({ icon: '📅', title: 'Augmente ta fréquence', desc: `Tu cours ${runsPerWeek.toFixed(1)} fois/semaine. Vise 3-4 runs pour progresser plus vite.` });
  }

  if (insights.length === 0) {
    insights.push(
      { icon: '✅', title: 'Performance stable', desc: 'Tes stats sont cohérentes. Continue à varier tes entraînements.' },
      { icon: '💪', title: 'Bon équilibre', desc: 'Tu as un bon mix entre distance et intensité.' }
    );
  }

  return insights;
}

// ===== TRAINING PLAN =====
function renderTrainingPlan() {
  const stats = computeStats(allRuns);
  const avgPace = allRuns.filter(r => r.paceSecPerKm).reduce((s, r) => s + r.paceSecPerKm, 0) / allRuns.filter(r => r.paceSecPerKm).length;

  const workouts = [
    { day: 'Lundi', type: 'Endurance fondamentale', desc: '8-10 km à ' + formatPace(avgPace * 1.15) + '/km', emoji: '🏃', zone: 'Zone 2 (60-70% FC max)' },
    { day: 'Mardi', type: 'Repos ou cross-training', desc: 'Vélo, natation ou yoga pour récupérer activement', emoji: '🧘', zone: '' },
    { day: 'Mercredi', type: 'Fractionnés courts', desc: '8x400m à ' + formatPace(avgPace * 0.85) + '/km avec 90s de récup', emoji: '⚡', zone: 'Zone 4-5 (80-95% FC max)' },
    { day: 'Jeudi', type: 'Repos', desc: 'Repos complet pour récupération', emoji: '😴', zone: '' },
    { day: 'Vendredi', type: 'Tempo run', desc: '6 km à ' + formatPace(avgPace * 0.95) + '/km (rythme soutenu)', emoji: '💨', zone: 'Zone 3 (70-80% FC max)' },
    { day: 'Samedi', type: 'Sortie longue', desc: '12-15 km à ' + formatPace(avgPace * 1.1) + '/km', emoji: '🏃‍♂️', zone: 'Zone 2 (60-70% FC max)' },
    { day: 'Dimanche', type: 'Récupération active', desc: '5 km facile à ' + formatPace(avgPace * 1.2) + '/km', emoji: '🚶', zone: 'Zone 1 (50-60% FC max)' },
  ];

  document.getElementById('section-training').innerHTML = `
    <div class="glass rounded-2xl p-6 card-hover mb-6">
      <h3 class="font-semibold mb-2 flex items-center gap-2"><span class="text-2xl">📋</span> Plan d'entraînement personnalisé</h3>
      <p class="text-sm text-slate-400 mb-6">Basé sur ton pace moyen de ${formatPace(avgPace)}/km et ton niveau actuel</p>
      <div class="space-y-3">
        ${workouts.map((w, i) => `
          <div class="bg-surface-800/50 rounded-xl p-4 ${i === new Date().getDay() ? 'border-2 border-accent' : ''}">
            <div class="flex items-start gap-4">
              <span class="text-3xl">${w.emoji}</span>
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <div class="font-semibold">${w.day}</div>
                  ${i === new Date().getDay() ? '<span class="badge badge-success">Aujourd\'hui</span>' : ''}
                </div>
                <div class="text-sm font-medium text-accent mb-1">${w.type}</div>
                <div class="text-sm text-slate-300">${w.desc}</div>
                ${w.zone ? `<div class="text-xs text-slate-500 mt-2">${w.zone}</div>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">💡</span> Conseils d'entraînement</h3>
        <div class="space-y-3 text-sm">
          <div class="flex items-start gap-3">
            <span class="text-lg">🎯</span>
            <div><strong>Spécificité :</strong> Entraîne-toi sur des parcours similaires à ta course cible</div>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-lg">📈</span>
            <div><strong>Progressivité :</strong> Augmente le volume de max 10% par semaine</div>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-lg">😴</span>
            <div><strong>Récupération :</strong> Le repos fait partie de l'entraînement, respecte-le</div>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-lg">🍎</span>
            <div><strong>Nutrition :</strong> Mange des glucides avant les sorties longues</div>
          </div>
          <div class="flex items-start gap-3">
            <span class="text-lg">💧</span>
            <div><strong>Hydratation :</strong> Bois régulièrement, surtout sur les runs > 1h</div>
          </div>
        </div>
      </div>

      <div class="glass rounded-2xl p-6 card-hover">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">📚</span> Types d'entraînement</h3>
        <div class="space-y-3 text-sm">
          <div>
            <div class="font-medium text-accent mb-1">Endurance fondamentale (EF)</div>
            <div class="text-slate-400">Allure facile, discussion possible. Développe l'endurance de base.</div>
          </div>
          <div>
            <div class="font-medium text-accentBlue mb-1">Tempo / Seuil</div>
            <div class="text-slate-400">Rythme soutenu mais soutenable. Améliore le seuil lactique.</div>
          </div>
          <div>
            <div class="font-medium text-accentOrange mb-1">Fractionnés / Intervalles</div>
            <div class="text-slate-400">Efforts intenses alternés avec récupération. Booste la VMA.</div>
          </div>
          <div>
            <div class="font-medium text-accentPurple mb-1">Sortie longue</div>
            <div class="text-slate-400">Run long à allure modérée. Prépare aux distances longues.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== GOALS =====
function renderGoals() {
  const stats = computeStats(allRuns);
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthRuns = allRuns.filter(r => {
    const d = new Date(r.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthDist = monthRuns.reduce((s, r) => s + r.dist, 0);

  const goals = [
    {
      title: '🎯 100 km ce mois',
      current: monthDist,
      target: 100,
      unit: 'km',
      emoji: '🏃',
      advice: monthDist < 50 ? 'Continue à courir régulièrement' : monthDist < 80 ? 'Bon rythme, continue !' : 'Presque là !'
    },
    {
      title: '🔥 Streak de 7 jours',
      current: currentStreak,
      target: 7,
      unit: 'jours',
      emoji: '🔥',
      advice: currentStreak < 3 ? 'Cours tous les jours cette semaine' : 'Continue le streak !'
    },
    {
      title: '⚡ Sub-5 min/km',
      current: allRuns.filter(r => r.paceSecPerKm && r.paceSecPerKm < 300).length,
      target: 10,
      unit: 'runs',
      emoji: '⚡',
      advice: 'Fais des fractionnés pour y arriver'
    },
    {
      title: '📏 Run de 21 km',
      current: Math.max(...allRuns.map(r => r.dist)),
      target: 21,
      unit: 'km',
      emoji: '🏅',
      advice: Math.max(...allRuns.map(r => r.dist)) < 15 ? 'Augmente progressivement' : 'Tu es prêt pour un semi !'
    },
    {
      title: '⛰️ 500m de D+',
      current: monthRuns.reduce((s, r) => s + r.elev, 0),
      target: 500,
      unit: 'm',
      emoji: '⛰️',
      advice: 'Cherche des parcours vallonnés'
    },
    {
      title: '🏆 50 runs total',
      current: allRuns.length,
      target: 50,
      unit: 'runs',
      emoji: '🏆',
      advice: allRuns.length < 30 ? 'Continue régulièrement' : 'Presque là !'
    }
  ];

  document.getElementById('section-goals').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      ${goals.map(g => {
        const progress = Math.min(100, Math.round(g.current / g.target * 100));
        const isComplete = progress >= 100;
        return `
          <div class="glass rounded-2xl p-6 card-hover ${isComplete ? 'border-2 border-accent' : ''}">
            <div class="flex items-center justify-between mb-4">
              <h4 class="font-semibold text-sm">${g.title}</h4>
              ${isComplete ? '<span class="text-2xl">✅</span>' : ''}
            </div>
            <div class="mb-4">
              <div class="flex justify-between text-sm mb-2">
                <span class="text-slate-400">${g.current.toFixed(typeof g.current === 'number' && g.current % 1 ? 1 : 0)} ${g.unit}</span>
                <span class="font-medium">${progress}%</span>
              </div>
              <div class="w-full bg-surface-800 rounded-full h-3">
                <div class="bg-accent h-3 rounded-full transition-all" style="width: ${progress}%"></div>
              </div>
              <div class="text-right text-xs text-slate-400 mt-1">Objectif : ${g.target} ${g.unit}</div>
            </div>
            <div class="text-xs text-slate-400 bg-surface-800/50 rounded-lg p-3">
              💡 ${g.advice}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="glass rounded-2xl p-6 card-hover mt-6">
      <h3 class="font-semibold mb-4 flex items-center gap-2"><span class="text-2xl">🎖️</span> Badges débloqués</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        ${generateBadges().map(badge => `
          <div class="bg-surface-800/50 rounded-xl p-4 text-center ${badge.unlocked ? '' : 'opacity-30'}">
            <div class="text-4xl mb-2">${badge.emoji}</div>
            <div class="text-xs font-medium mb-1">${badge.name}</div>
            <div class="text-[10px] text-slate-400">${badge.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function generateBadges() {
  const badges = [
    { emoji: '🏃', name: 'Premier pas', desc: '1 run', unlocked: allRuns.length >= 1 },
    { emoji: '🔥', name: 'Enflammé', desc: '10 runs', unlocked: allRuns.length >= 10 },
    { emoji: '💯', name: 'Centurion', desc: '100 km total', unlocked: allRuns.reduce((s, r) => s + r.dist, 0) >= 100 },
    { emoji: '⚡', name: 'Rapide', desc: 'Sub-5 min/km', unlocked: allRuns.some(r => r.paceSecPerKm && r.paceSecPerKm < 300) },
    { emoji: '🏅', name: 'Demi', desc: '21+ km', unlocked: allRuns.some(r => r.dist >= 21) },
    { emoji: '🏆', name: 'Marathonien', desc: '42+ km', unlocked: allRuns.some(r => r.dist >= 42) },
    { emoji: '⛰️', name: 'Grimpeur', desc: '1000m D+ total', unlocked: allRuns.reduce((s, r) => s + r.elev, 0) >= 1000 },
    { emoji: '📅', name: 'Régulier', desc: '7 jours streak', unlocked: longestStreak >= 7 },
    { emoji: '🌟', name: 'Étoile', desc: '50 runs', unlocked: allRuns.length >= 50 },
    { emoji: '👑', name: 'Légende', desc: '100 runs', unlocked: allRuns.length >= 100 },
  ];
  return badges;
}

// ===== RUN DETAILS MODAL =====
function showRunDetails(runId) {
  const run = allRuns.find(r => r.id == runId);
  if (!run) {
    console.error('Run not found:', runId);
    return;
  }

  // Analyse et conseils (optimisé avec cache si possible)
  const analysis = analyzeRun(run);

  // Créer le modal de manière optimisée
  const modal = document.createElement('div');
  modal.id = 'run-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 overflow-y-auto';
  modal.onclick = (e) => { if (e.target === modal) closeRunModal(); };

  // Utiliser innerHTML pour une seule insertion DOM
  modal.innerHTML = `
    <div class="glass rounded-3xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto my-8" onclick="event.stopPropagation()">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div class="flex-1">
          <h2 class="text-3xl font-bold mb-2">${run.name}</h2>
          <p class="text-slate-400">${formatDate(run.date)}</p>
        </div>
        <button onclick="closeRunModal()" class="text-slate-400 hover:text-white transition p-2 hover:bg-white/10 rounded-lg">
          <i data-lucide="x" class="w-6 h-6"></i>
        </button>
      </div>

      <!-- Stats principales GRANDES -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-gradient-to-br from-accent/20 to-accent/5 rounded-2xl p-6 border border-accent/30">
          <div class="text-xs text-accent mb-2 font-semibold uppercase tracking-wider">Distance</div>
          <div class="text-4xl font-bold text-accent">${run.dist.toFixed(2)}</div>
          <div class="text-lg text-accent/70 mt-1">km</div>
        </div>
        <div class="bg-gradient-to-br from-accentBlue/20 to-accentBlue/5 rounded-2xl p-6 border border-accentBlue/30">
          <div class="text-xs text-accentBlue mb-2 font-semibold uppercase tracking-wider">Pace</div>
          <div class="text-4xl font-bold text-accentBlue">${run.pace || '--'}</div>
          <div class="text-lg text-accentBlue/70 mt-1">/km</div>
        </div>
        <div class="bg-gradient-to-br from-accentOrange/20 to-accentOrange/5 rounded-2xl p-6 border border-accentOrange/30">
          <div class="text-xs text-accentOrange mb-2 font-semibold uppercase tracking-wider">Durée</div>
          <div class="text-4xl font-bold text-accentOrange">${Math.floor(run.time / 60)}</div>
          <div class="text-lg text-accentOrange/70 mt-1">min</div>
        </div>
        <div class="bg-gradient-to-br from-accentPurple/20 to-accentPurple/5 rounded-2xl p-6 border border-accentPurple/30">
          <div class="text-xs text-accentPurple mb-2 font-semibold uppercase tracking-wider">Vitesse</div>
          <div class="text-4xl font-bold text-accentPurple">${run.speedKmh ? run.speedKmh.toFixed(1) : '--'}</div>
          <div class="text-lg text-accentPurple/70 mt-1">km/h</div>
        </div>
      </div>

      <!-- Performance Score -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">⚡</span> Score de performance
        </h3>
        <div class="bg-gradient-to-r from-surface-800/80 to-surface-800/50 rounded-2xl p-8 border border-white/10">
          <div class="flex items-center gap-6">
            <div class="text-8xl font-bold ${analysis.scoreColor}">${analysis.score}<span class="text-4xl">/10</span></div>
            <div class="flex-1">
              <div class="text-2xl font-bold mb-2">${analysis.scoreLabel}</div>
              <div class="text-lg text-slate-400">${analysis.scoreDesc}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Données détaillées -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">📊</span> Toutes les données
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          ${analysis.detailedStats.map(stat => `
            <div class="bg-surface-800/50 rounded-xl p-5 hover:bg-surface-800/70 transition border border-white/5">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-3xl">${stat.icon}</span>
                <span class="text-sm text-slate-400 font-medium">${stat.label}</span>
              </div>
              <div class="text-2xl font-bold">${stat.value}</div>
              ${stat.sub ? `<div class="text-sm text-slate-400 mt-2">${stat.sub}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Prédictions Riegel -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">🎯</span> Tes temps estimés sur toutes les distances
        </h3>
        <p class="text-slate-400 mb-6">Basé sur ta performance de ce run avec la formule de Riegel : T2 = T1 × (D2/D1)^1.06</p>
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          ${analysis.predictions.map(p => `
            <div class="bg-gradient-to-br from-surface-800 to-surface-900 rounded-2xl p-5 text-center hover:scale-105 transition border border-white/10 hover:border-accent/50">
              <div class="text-4xl mb-3">${p.emoji}</div>
              <div class="text-xs text-slate-400 mb-3 font-semibold uppercase tracking-wider">${p.name}</div>
              <div class="text-2xl font-bold text-accent mb-2">${p.time}</div>
              <div class="text-sm text-slate-300 mb-1">${p.pace}/km</div>
              <div class="text-xs text-accentBlue font-semibold">${p.speed} km/h</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Analyse critique détaillée -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">🔍</span> Analyse critique complète
        </h3>
        <div class="space-y-4">
          ${analysis.critiques.map(c => `
            <div class="rounded-2xl p-6 flex items-start gap-4 ${
              c.type === 'positive' ? 'bg-green-500/10 border-2 border-green-500/30' :
              c.type === 'warning' ? 'bg-yellow-500/10 border-2 border-yellow-500/30' :
              'bg-red-500/10 border-2 border-red-500/30'
            }">
              <span class="text-4xl">${c.icon}</span>
              <div class="flex-1">
                <div class="text-xl font-bold mb-2">${c.title}</div>
                <div class="text-base text-slate-300">${c.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Conseils personnalisés -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">💡</span> Conseils pour progresser
        </h3>
        <div class="space-y-3">
          ${analysis.tips.map(tip => `
            <div class="bg-surface-800/50 rounded-2xl p-5 flex items-start gap-4 border border-white/10 hover:border-accent/30 transition">
              <span class="text-3xl">${tip.icon}</span>
              <div class="flex-1">
                <div class="text-lg font-semibold mb-2">${tip.title}</div>
                <div class="text-base text-slate-400">${tip.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Splits -->
      ${analysis.splits.length > 0 ? `
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">📏</span> Splits estimés (si pace constant)
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${analysis.splits.map(split => `
            <div class="bg-surface-800/50 rounded-xl p-4 text-center border border-white/5">
              <div class="text-sm text-slate-400 mb-2">${split.label}</div>
              <div class="text-2xl font-bold text-accent">${split.time}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Fréquence -->
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">📅</span> Analyse de ta fréquence d'entraînement
        </h3>
        <div class="bg-surface-800/50 rounded-2xl p-6 border border-white/10">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="text-center">
              <div class="text-sm text-slate-400 mb-2">Runs par semaine</div>
              <div class="text-4xl font-bold text-accent mb-2">${analysis.frequency.runsPerWeek.toFixed(1)}</div>
              <div class="text-base text-slate-300">${analysis.frequency.status}</div>
            </div>
            <div class="text-center">
              <div class="text-sm text-slate-400 mb-2">Dernier run</div>
              <div class="text-4xl font-bold text-accentBlue mb-2">${analysis.frequency.daysSinceLastRun}j</div>
              <div class="text-base text-slate-300">${analysis.frequency.restStatus}</div>
            </div>
            <div class="text-center">
              <div class="text-sm text-slate-400 mb-2">Prochain run suggéré</div>
              <div class="text-4xl font-bold text-accentOrange mb-2">${analysis.frequency.nextRunSuggestion}</div>
              <div class="text-base text-slate-300">${analysis.frequency.nextRunReason}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Équivalences -->
      ${analysis.equivalences.length > 0 ? `
      <div class="mb-8">
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">⚖️</span> Équivalences d'effort
        </h3>
        <div class="bg-surface-800/50 rounded-2xl p-6 border border-white/10">
          <div class="text-base text-slate-400 mb-4">Ce run équivaut à :</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${analysis.equivalences.map(eq => `
              <div class="bg-surface-900/50 rounded-xl p-4 text-center">
                <div class="text-3xl mb-2">${eq.icon}</div>
                <div class="text-sm text-slate-400 mb-1">${eq.activity}</div>
                <div class="text-lg font-bold">${eq.value}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Comparaison -->
      <div>
        <h3 class="text-2xl font-bold mb-4 flex items-center gap-3">
          <span class="text-3xl">📊</span> Comparaison avec ta moyenne
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${analysis.comparison.map(c => `
            <div class="bg-surface-800/50 rounded-xl p-5 border border-white/10">
              <div class="flex items-center justify-between mb-3">
                <span class="text-base text-slate-400">${c.label}</span>
                <span class="badge badge-${c.better ? 'success' : 'warning'} text-base px-3 py-1">${c.diff}</span>
              </div>
              <div class="text-2xl font-bold">${c.value}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();
}

function closeRunModal() {
  document.getElementById('run-modal')?.remove();
}

function analyzeRun(run) {
  // Calcul du score de performance (1-10)
  let score = 5;
  let scoreFactors = [];

  // Analyse du pace
  const avgPace = allRuns.filter(r => r.paceSecPerKm).reduce((s, r) => s + r.paceSecPerKm, 0) / allRuns.filter(r => r.paceSecPerKm).length;
  if (run.paceSecPerKm) {
    if (run.paceSecPerKm < avgPace * 0.9) { score += 2; scoreFactors.push('pace excellent'); }
    else if (run.paceSecPerKm < avgPace) { score += 1; scoreFactors.push('pace bon'); }
    else if (run.paceSecPerKm > avgPace * 1.1) { score -= 1; scoreFactors.push('pace lent'); }
  }

  // Analyse de la distance
  const avgDist = allRuns.reduce((s, r) => s + r.dist, 0) / allRuns.length;
  if (run.dist > avgDist * 1.5) { score += 2; scoreFactors.push('longue distance'); }
  else if (run.dist > avgDist) { score += 1; scoreFactors.push('bonne distance'); }

  // Analyse de l'élévation
  if (run.elev > 100) { score += 1; scoreFactors.push('bon dénivelé'); }

  score = Math.max(1, Math.min(10, score));

  const scoreLabels = {
    1: 'Difficile', 2: 'Difficile', 3: 'Moyen', 4: 'Moyen', 5: 'Correct',
    6: 'Correct', 7: 'Bon', 8: 'Très bon', 9: 'Excellent', 10: 'Exceptionnel'
  };

  const scoreColors = {
    1: 'text-red-500', 2: 'text-red-400', 3: 'text-orange-500', 4: 'text-orange-400', 5: 'text-yellow-500',
    6: 'text-yellow-400', 7: 'text-accent', 8: 'text-accent', 9: 'text-green-400', 10: 'text-green-300'
  };

  // Conseils
  const tips = [];

  if (run.paceSecPerKm && run.paceSecPerKm > avgPace * 1.1) {
    tips.push({
      icon: '🏃',
      title: 'Améliorer ton pace',
      desc: `Ton pace est ${((run.paceSecPerKm / avgPace - 1) * 100).toFixed(0)}% plus lent que ta moyenne. Essaie des fractionnés : 6x400m à ${formatPace(avgPace * 0.85)} avec 90s de récup.`
    });
  } else if (run.paceSecPerKm && run.paceSecPerKm < avgPace * 0.9) {
    tips.push({
      icon: '🔥',
      title: 'Excellente performance !',
      desc: `Tu as couru ${((1 - run.paceSecPerKm / avgPace) * 100).toFixed(0)}% plus vite que ta moyenne. Continue comme ça mais prends un jour de repos pour récupérer.`
    });
  }

  if (run.dist < avgDist * 0.8) {
    tips.push({
      icon: '📏',
      title: 'Augmente progressivement',
      desc: `Ce run était court. Essaie d'ajouter 10% de distance chaque semaine pour progresser en endurance.`
    });
  }

  if (run.elev < 50 && allRuns.some(r => r.elev > 100)) {
    tips.push({
      icon: '⛰️',
      title: 'Ajoute du dénivelé',
      desc: 'Les runs avec du dénivelé renforcent tes jambes et améliorent ta puissance. Essaie un parcours vallonné 1x/semaine.'
    });
  }

  if (run.hr && run.hr > 175) {
    tips.push({
      icon: '❤️',
      title: 'Fréquence cardiaque élevée',
      desc: `Ta FC moyenne de ${run.hr} bpm est élevée. Pense à faire plus d'endurance fondamentale (65-75% FC max) pour progresser.`
    });
  }

  if (tips.length === 0) {
    tips.push({
      icon: '✅',
      title: 'Run équilibré',
      desc: 'Ce run est bien équilibré. Continue à varier tes entraînements : endurance, tempo, fractionnés.'
    });
  }

  // Fréquence
  const recentRuns = allRuns.filter(r => {
    const diffDays = (new Date() - new Date(r.date)) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  });
  const runsPerWeek = recentRuns.length / 4.3; // Garder comme nombre
  const daysSinceLastRun = Math.floor((new Date() - new Date(allRuns[0].date)) / (1000 * 60 * 60 * 24));

  let frequencyStatus = '';
  let nextRunSuggestion = '';
  let nextRunReason = '';
  let restStatus = '';

  if (runsPerWeek < 2) {
    frequencyStatus = '⚠️ Trop peu';
    nextRunSuggestion = 'Demain';
    nextRunReason = 'Augmente ta fréquence';
  } else if (runsPerWeek < 3) {
    frequencyStatus = '✅ Correct';
    nextRunSuggestion = daysSinceLastRun >= 2 ? 'Aujourd\'hui' : 'Demain';
    nextRunReason = 'Maintiens le rythme';
  } else if (runsPerWeek < 5) {
    frequencyStatus = '🔥 Bon';
    nextRunSuggestion = daysSinceLastRun >= 1 ? 'Aujourd\'hui' : 'Demain';
    nextRunReason = 'Rythme optimal';
  } else {
    frequencyStatus = '⚠️ Attention';
    nextRunSuggestion = daysSinceLastRun >= 1 ? 'Repos' : '2 jours';
    nextRunReason = 'Risque de surcharge';
  }

  if (daysSinceLastRun === 0) restStatus = 'Aujourd\'hui';
  else if (daysSinceLastRun === 1) restStatus = 'Bon repos';
  else if (daysSinceLastRun <= 3) restStatus = 'Récupération';
  else restStatus = 'Long repos';

  // Prédictions Riegel CORRIGÉES
  const basePace = run.paceSecPerKm || avgPace;
  const baseDist = run.dist;
  const baseTime = run.time; // Temps réel du run en secondes

  const distances = [
    { name: '400 m', dist: 0.4, emoji: '⚡', desc: 'Sprint court' },
    { name: '800 m', dist: 0.8, emoji: '💨', desc: 'Demi-fond' },
    { name: '1 km', dist: 1, emoji: '🏃', desc: 'Court' },
    { name: '5 km', dist: 5, emoji: '🏃', desc: 'Populaire' },
    { name: '10 km', dist: 10, emoji: '🏃‍♂️', desc: 'Standard' },
    { name: 'Semi', dist: 21.0975, emoji: '🏅', desc: 'Demi-marathon' },
    { name: 'Marathon', dist: 42.195, emoji: '🏆', desc: 'Épreuve ultime' },
  ];

  const predictions = distances.map(d => {
    // Formule de Riegel : T2 = T1 * (D2/D1)^1.06
    const timeInSeconds = baseTime * Math.pow(d.dist / baseDist, 1.06);
    const hrs = Math.floor(timeInSeconds / 3600);
    const mins = Math.floor((timeInSeconds % 3600) / 60);
    const secs = Math.floor(timeInSeconds % 60);

    let timeStr;
    if (d.dist < 1) {
      // Pour 400m et 800m, afficher en minutes:secondes
      const totalSecs = Math.floor(timeInSeconds);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      timeStr = m > 0 ? `${m}'${s.toString().padStart(2,'0')}"` : `${s}"`;
    } else if (hrs > 0) {
      timeStr = `${hrs}h${mins.toString().padStart(2,'0')}'${secs.toString().padStart(2,'0')}"`;
    } else {
      timeStr = `${mins}'${secs.toString().padStart(2,'0')}"`;
    }

    const pacePerKm = timeInSeconds / d.dist;
    const speedKmh = (d.dist / (timeInSeconds / 3600));

    return {
      ...d,
      time: timeStr,
      timeInSeconds: timeInSeconds,
      pace: formatPace(pacePerKm),
      speed: speedKmh.toFixed(1)
    };
  });

  // Comparaison
  const comparison = [
    {
      label: 'Pace',
      value: run.pace || '--',
      diff: run.paceSecPerKm ? `${run.paceSecPerKm < avgPace ? '-' : '+'}${Math.abs(((run.paceSecPerKm / avgPace - 1) * 100)).toFixed(0)}%` : '--',
      better: run.paceSecPerKm ? run.paceSecPerKm < avgPace : false
    },
    {
      label: 'Distance',
      value: `${run.dist.toFixed(2)} km`,
      diff: `${run.dist > avgDist ? '+' : ''}${((run.dist / avgDist - 1) * 100).toFixed(0)}%`,
      better: run.dist > avgDist
    },
    {
      label: 'Élévation',
      value: `${run.elev} m`,
      diff: run.elev > 50 ? '+' + run.elev + 'm' : run.elev + 'm',
      better: run.elev > 50
    },
    {
      label: 'Durée',
      value: formatTime(run.time),
      diff: formatTime(run.time),
      better: true
    }
  ];

  // Données détaillées
  const detailedStats = [
    { icon: '📏', label: 'Distance totale', value: `${run.dist.toFixed(2)} km`, sub: `${(run.dist * 1000).toFixed(0)} mètres` },
    { icon: '⏱️', label: 'Durée totale', value: formatTime(run.time), sub: `${Math.floor(run.time / 60)} minutes` },
    { icon: '🏃', label: 'Pace moyen', value: run.pace || '--', sub: run.speedKmh ? `${run.speedKmh.toFixed(2)} km/h` : '' },
    { icon: '⛰️', label: 'Dénivelé positif', value: `${run.elev} m`, sub: run.dist > 0 ? `${(run.elev / run.dist).toFixed(0)} m/km` : '' },
    { icon: '🔥', label: 'Calories brûlées', value: `${run.cal}`, sub: run.time > 0 ? `${(run.cal / (run.time / 3600)).toFixed(0)} kcal/h` : '' },
    { icon: '❤️', label: 'FC moyenne', value: run.hr ? `${run.hr} bpm` : 'N/A', sub: run.hr ? `${Math.round(run.hr / 220 * 100)}% FC max (est.)` : '' },
    { icon: '📈', label: 'FC max', value: run.maxHr ? `${run.maxHr} bpm` : 'N/A', sub: '' },
    { icon: '💪', label: 'Puissance estimée', value: run.speedKmh ? `${Math.round(run.speedKmh * 0.9)} W` : 'N/A', sub: 'Basé sur vitesse' },
    { icon: '🎯', label: 'Efficacité', value: run.paceSecPerKm && run.hr ? `${(run.hr / (3600 / run.paceSecPerKm)).toFixed(1)}` : 'N/A', sub: 'BPM par km/h' },
  ];

  // Critiques détaillées
  const critiques = [];

  // Analyse du pace
  if (run.paceSecPerKm) {
    if (run.paceSecPerKm < avgPace * 0.85) {
      critiques.push({
        type: 'positive',
        icon: '🔥',
        title: 'Performance exceptionnelle !',
        desc: `Ton pace de ${run.pace}/km est ${((1 - run.paceSecPerKm / avgPace) * 100).toFixed(0)}% plus rapide que ta moyenne. C'est une performance remarquable ! Continue à varier tes entraînements pour maintenir ce niveau.`
      });
    } else if (run.paceSecPerKm < avgPace * 0.95) {
      critiques.push({
        type: 'positive',
        icon: '✅',
        title: 'Très bonne performance',
        desc: `Tu as couru ${((1 - run.paceSecPerKm / avgPace) * 100).toFixed(0)}% plus vite que d'habitude. Excellent travail ! Pour consolider ce progrès, répète ce type de sortie 1 fois par semaine.`
      });
    } else if (run.paceSecPerKm > avgPace * 1.15) {
      critiques.push({
        type: 'negative',
        icon: '⚠️',
        title: 'Pace très lent',
        desc: `Ton pace est ${((run.paceSecPerKm / avgPace - 1) * 100).toFixed(0)}% plus lent que ta moyenne. Es-tu fatigué ? Assure-toi de bien récupérer entre les sorties. Si c'était volontaire (endurance fondamentale), c'est parfait !`
      });
    } else if (run.paceSecPerKm > avgPace * 1.05) {
      critiques.push({
        type: 'warning',
        icon: '🐢',
        title: 'Pace plus lent que d\'habitude',
        desc: `Tu as couru ${((run.paceSecPerKm / avgPace - 1) * 100).toFixed(0)}% plus lentement. C'est OK pour une sortie de récupération, mais si ce n'était pas prévu, vérifie ton niveau de fatigue et ta nutrition.`
      });
    }
  }

  // Analyse de la distance
  if (run.dist < 3) {
    critiques.push({
      type: 'warning',
      icon: '📏',
      title: 'Distance courte',
      desc: `Seulement ${run.dist.toFixed(1)} km. Pour développer l'endurance, essaie d'augmenter progressivement jusqu'à au moins 5-6 km sur certaines sorties. Règle des 10% : n'augmente pas de plus de 10% par semaine.`
    });
  } else if (run.dist > avgDist * 1.8) {
    critiques.push({
      type: 'positive',
      icon: '🏅',
      title: 'Longue sortie réussie',
      desc: `${run.dist.toFixed(1)} km, c'est ${((run.dist / avgDist - 1) * 100).toFixed(0)}% plus long que d'habitude ! Excellent pour développer l'endurance. Assure-toi de bien récupérer dans les 48h suivantes.`
    });
  } else if (run.dist > 15) {
    critiques.push({
      type: 'positive',
      icon: '💪',
      title: 'Belle distance',
      desc: `${run.dist.toFixed(1)} km, c'est une vraie sortie longue ! Continue à faire ce type de run 1 fois par semaine pour préparer des courses longues.`
    });
  }

  // Analyse du dénivelé
  if (run.elev > 200) {
    critiques.push({
      type: 'positive',
      icon: '⛰️',
      title: 'Excellent travail de dénivelé',
      desc: `${run.elev} m de D+, soit ${(run.elev / run.dist).toFixed(0)} m/km. Les runs avec du dénivelé renforcent énormément les jambes et améliorent la puissance. Continue !`
    });
  } else if (run.elev < 30 && run.dist > 5) {
    critiques.push({
      type: 'warning',
      icon: '🏞️',
      title: 'Parcours plat',
      desc: `Seulement ${run.elev} m de dénivelé. Pour varier et progresser, cherche des parcours avec des côtes. Objectif : au moins 1 sortie vallonnée par semaine.`
    });
  }

  // Analyse de la fréquence cardiaque
  if (run.hr) {
    const fcMaxEst = 220 - 30; // Estimation
    const fcPercent = (run.hr / fcMaxEst * 100).toFixed(0);

    if (run.hr > 180) {
      critiques.push({
        type: 'negative',
        icon: '❤️',
        title: 'FC très élevée',
        desc: `${run.hr} bpm, c'est environ ${fcPercent}% de ta FC max estimée. Tu étais dans une zone très intense. Pour progresser durablement, fais plus d'endurance fondamentale (130-150 bpm).`
      });
    } else if (run.hr > 165) {
      critiques.push({
        type: 'warning',
        icon: '💓',
        title: 'FC élevée',
        desc: `${run.hr} bpm (env. ${fcPercent}% FC max). C'est une zone tempo/seuil. Bien pour l'intensité, mais ne fais pas tous tes runs à ce niveau. Alterne avec de l'endurance fondamentale.`
      });
    } else if (run.hr < 140 && run.dist > 5) {
      critiques.push({
        type: 'positive',
        icon: '💚',
        title: 'Endurance fondamentale parfaite',
        desc: `${run.hr} bpm, c'est dans la zone d'endurance fondamentale (60-70% FC max). Parfait pour développer ton endurance de base et améliorer ton métabolisme aérobie.`
      });
    }
  }

  // Analyse de l'efficacité
  if (run.paceSecPerKm && run.hr) {
    const efficiency = run.hr / (3600 / run.paceSecPerKm);
    if (efficiency < 30) {
      critiques.push({
        type: 'positive',
        icon: '⚡',
        title: 'Excellente efficacité cardiovasculaire',
        desc: `Ton ratio FC/vitesse est de ${efficiency.toFixed(1)}. Tu cours vite avec une FC relativement basse, signe d'une bonne condition physique. Continue ce que tu fais !`
      });
    } else if (efficiency > 45) {
      critiques.push({
        type: 'warning',
        icon: '📊',
        title: 'Efficacité à améliorer',
        desc: `Ton ratio FC/vitesse est de ${efficiency.toFixed(1)}. Ton cœur travaille beaucoup pour la vitesse. Solution : plus d'endurance fondamentale (70% de tes sorties) pour améliorer ton système cardiovasculaire.`
      });
    }
  }

  // Splits estimés (si pace constant)
  const splits = [];
  if (run.paceSecPerKm) {
    const splitDistances = [1, 2, 5, 10];
    splitDistances.forEach(d => {
      if (d <= run.dist) {
        const splitTime = run.paceSecPerKm * d;
        const m = Math.floor(splitTime / 60);
        const s = Math.round(splitTime % 60);
        splits.push({
          label: `${d} km`,
          time: `${m}'${s.toString().padStart(2, '0')}"`
        });
      }
    });

    // Ajouter des splits intermédiaires pour les longues distances
    if (run.dist > 10) {
      const halfDist = run.dist / 2;
      const halfTime = run.paceSecPerKm * halfDist;
      const m = Math.floor(halfTime / 60);
      const s = Math.round(halfTime % 60);
      splits.push({
        label: `${halfDist.toFixed(1)} km (mi-parcours)`,
        time: `${m}'${s.toString().padStart(2, '0')}"`
      });
    }
  }

  // Équivalences d'effort
  const equivalences = [];
  if (run.cal) {
    equivalences.push(
      { icon: '🍕', activity: 'Pizzas', value: `${(run.cal / 250).toFixed(1)} parts` },
      { icon: '🍫', activity: 'Barres de chocolat', value: `${(run.cal / 50).toFixed(0)} barres` },
      { icon: '🍔', activity: 'Big Mac', value: `${(run.cal / 550).toFixed(1)} burgers` },
      { icon: '🍺', activity: 'Bières', value: `${(run.cal / 150).toFixed(1)} bières` }
    );
  }

  if (run.dist) {
    equivalences.push(
      { icon: '🏟️', activity: 'Tours de stade', value: `${(run.dist * 1000 / 400).toFixed(0)} tours` },
      { icon: '🗼', activity: 'Tours Eiffel (hauteur)', value: `${(run.dist * 1000 / 330).toFixed(1)} tours` }
    );
  }

  if (run.time) {
    equivalences.push(
      { icon: '🎬', activity: 'Film Netflix', value: `${(run.time / 5400).toFixed(1)} films` },
      { icon: '☕', activity: 'Pauses café', value: `${(run.time / 900).toFixed(0)} pauses` }
    );
  }

  return {
    score,
    scoreLabel: scoreLabels[score],
    scoreColor: scoreColors[score],
    scoreDesc: scoreFactors.join(', ') || 'Run standard',
    tips,
    frequency: { runsPerWeek, daysSinceLastRun, status: frequencyStatus, nextRunSuggestion, nextRunReason, restStatus },
    predictions,
    comparison,
    detailedStats,
    critiques,
    splits,
    equivalences
  };
}

// ===== NAVIGATION =====
const sectionRenderers = {
  dashboard: renderDashboard,
  runs: renderRunsList,
  records: renderRecords,
  progression: renderProgression,
  heartrate: renderHeartRateZones,
  compare: renderCompare,
  calendar: renderCalendar,
  predictions: renderPredictions,
  analytics: renderAnalytics,
  training: renderTrainingPlan,
  goals: renderGoals,
  planner: () => {} // Rendered via initMap
};

const renderedSections = new Set(['dashboard']); // Dashboard déjà rendu

function showSection(name) {
  document.querySelectorAll('[id^="section-"]').forEach(el => el.classList.add('hidden'));
  const section = document.getElementById('section-' + name);
  if (section) section.classList.remove('hidden');

  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  event?.target?.closest('.sidebar-link')?.classList.add('active');

  // Lazy render: ne rendre la section que si elle n'a pas encore été rendue
  if (!renderedSections.has(name) && sectionRenderers[name]) {
    requestAnimationFrame(() => {
      sectionRenderers[name]();
      renderedSections.add(name);
    });
  }

  const titles = {
    dashboard: ['Dashboard Ultimate', 'Vue d\'ensemble complète'],
    runs: ['Mes Runs', 'Historique complet'],
    records: ['Records', 'Vos meilleures performances'],
    progression: ['Progression', 'Évolution dans le temps'],
    heartrate: ['Zones FC', 'Analyse fréquence cardiaque'],
    compare: ['Comparaison', 'Comparer vos runs'],
    calendar: ['Calendrier', 'Vue mensuelle'],
    predictions: ['Prédictions', 'Temps estimés'],
    analytics: ['Analytics', 'Statistiques avancées'],
    training: ['Plan d\'entraînement', 'Programme personnalisé'],
    goals: ['Objectifs', 'Suivi de progression'],
    kom: ['KOM Proches', 'Les 3 segments les plus proches'],
    planner: ['Planificateur', 'Créer un tracé']
  };
  const t = titles[name] || ['', ''];
  document.getElementById('page-title').textContent = t[0];
  document.getElementById('page-subtitle').textContent = t[1];

  // Init map si section planner
  if (name === 'planner') {
    setTimeout(() => {
      initMap();
      renderSavedRoutes();
    }, 100);
  }

  // Init KOM section
  if (name === 'kom') {
    setTimeout(() => {
      initKOMSection();
    }, 100);
  }
}

// ===== FILTERS & ACTIONS =====
function applyPeriodFilter() {
  const days = parseInt(document.getElementById('periodFilter').value);
  if (days === 0) {
    filteredRuns = [...allRuns];
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    filteredRuns = allRuns.filter(r => new Date(r.date) >= cutoff);
  }

  // Vider le cache
  statsCache = null;

  // Vider les sections rendues sauf dashboard
  renderedSections.clear();
  renderedSections.add('dashboard');

  renderDashboard();
}

// Debounce pour les filtres
let filterTimeout;
function debouncedFilter(fn, delay = 300) {
  return function(...args) {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

function refreshData() {
  const icon = document.getElementById('refresh-icon');
  icon.classList.add('spin');

  // Vider tous les caches
  statsCache = null;
  avgPaceCache = null;
  renderedSections.clear();

  loadRuns().finally(() => setTimeout(() => icon.classList.remove('spin'), 1000));
}

function exportData() {
  const csv = ['Date,Nom,Distance (km),Pace,Vitesse (km/h),Élévation (m),FC moyenne,Calories,Temps (s)'];
  filteredRuns.forEach(r => {
    csv.push([r.date, r.name, r.dist, r.pace || '', r.speedKmh || '', r.elev, r.hr || '', r.cal, r.time].join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strava-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// ===== INIT =====
async function init() {
  lucide.createIcons();
  const connected = await checkAuth();
  if (connected) {
    document.getElementById('section-loading').classList.remove('hidden');
    document.getElementById('section-dashboard').classList.add('hidden');
    await loadRuns();
    document.getElementById('section-loading').classList.add('hidden');
    document.getElementById('section-dashboard').classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', init);

// ===== PLANIFICATEUR DE TRACÉ =====
let map = null;
let komMiniMap = null;
let routePoints = [];
let routeControl = null;
let markers = [];
let userLocation = null;
let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
let routeMode = 'walk'; // walk ou bike
let komMarkers = [];

// KOM autour de Bize (52500 - Haute-Marne) - Vraies coordonnées : 48.0667, 5.6167
const komDatabase = [
  {
    name: "Tracé Strava Principal",
    lat: 47.83854, lng: 5.63272,
    distance: 0.85, elevation: 42, avgGrade: 4.9, maxGrade: 8.2,
    type: "climb",
    segment: [[47.83700, 5.63150], [47.83777, 5.63211], [47.83854, 5.63272], [47.83931, 5.63333]],
    records: [
      { name: "Thomas V.", time: "3:15", date: "2024-04-20" },
      { name: "Marion K.", time: "3:42", date: "2024-03-28" },
      { name: "Lucas B.", time: "3:55", date: "2024-02-18" }
    ]
  },
  {
    name: "Montée Rue des Chenevières",
    lat: 48.0667, lng: 5.6167,
    distance: 0.58, elevation: 35, avgGrade: 6.0, maxGrade: 9.2,
    type: "climb",
    segment: [[48.0655, 5.6155], [48.0661, 5.6161], [48.0667, 5.6167], [48.0673, 5.6173]],
    records: [
      { name: "Marc L.", time: "2:05", date: "2024-03-15" },
      { name: "Julie M.", time: "2:32", date: "2024-02-20" },
      { name: "Thomas D.", time: "2:48", date: "2024-01-10" }
    ]
  },
  {
    name: "Descente Foyer Suzanne - Mairie",
    lat: 48.0660, lng: 5.6160,
    distance: 0.55, elevation: -22, avgGrade: -4.0, maxGrade: -7.5,
    type: "descent",
    segment: [[48.0670, 5.6150], [48.0665, 5.6155], [48.0660, 5.6160], [48.0655, 5.6165]],
    records: [
      { name: "Julien R.", time: "1:25", date: "2024-04-18" },
      { name: "Sophie L.", time: "1:38", date: "2024-03-22" },
      { name: "Antoine B.", time: "1:45", date: "2024-02-10" }
    ]
  },
  {
    name: "Sprint Sortie Est",
    lat: 48.0670, lng: 5.6200,
    distance: 0.72, elevation: 8, avgGrade: 1.1, maxGrade: 2.8,
    type: "sprint",
    segment: [[48.0665, 5.6180], [48.0668, 5.6190], [48.0670, 5.6200], [48.0673, 5.6210]],
    records: [
      { name: "Alex B.", time: "2:28", date: "2024-04-01" },
      { name: "Sarah K.", time: "2:48", date: "2024-03-25" },
      { name: "Pierre V.", time: "3:02", date: "2024-02-15" }
    ]
  },
  {
    name: "Côte Nord Village",
    lat: 48.0700, lng: 5.6170,
    distance: 0.85, elevation: 48, avgGrade: 5.6, maxGrade: 8.5,
    type: "climb",
    segment: [[48.0680, 5.6165], [48.0690, 5.6168], [48.0700, 5.6170], [48.0708, 5.6172]],
    records: [
      { name: "Laurent P.", time: "3:18", date: "2024-03-30" },
      { name: "Emma R.", time: "3:52", date: "2024-02-28" },
      { name: "Nicolas F.", time: "4:12", date: "2024-01-20" }
    ]
  },
  {
    name: "Sprint Route Ouest",
    lat: 48.0665, lng: 5.6130,
    distance: 0.68, elevation: 5, avgGrade: 0.7, maxGrade: 2.2,
    type: "sprint",
    segment: [[48.0660, 5.6110], [48.0663, 5.6120], [48.0665, 5.6130], [48.0668, 5.6140]],
    records: [
      { name: "Romain C.", time: "2:18", date: "2024-04-12" },
      { name: "Léa B.", time: "2:35", date: "2024-03-28" },
      { name: "Hugo W.", time: "2:45", date: "2024-02-18" }
    ]
  },
  {
    name: "Montée Bois Sud",
    lat: 48.0640, lng: 5.6160,
    distance: 0.75, elevation: 42, avgGrade: 5.6, maxGrade: 9.5,
    type: "climb",
    segment: [[48.0625, 5.6150], [48.0633, 5.6155], [48.0640, 5.6160], [48.0647, 5.6165]],
    records: [
      { name: "Kevin S.", time: "2:32", date: "2024-04-10" },
      { name: "Marie L.", time: "2:55", date: "2024-03-18" },
      { name: "Antoine M.", time: "3:12", date: "2024-02-05" }
    ]
  },
  {
    name: "Descente Sud-Ouest",
    lat: 48.0650, lng: 5.6145,
    distance: 0.60, elevation: -30, avgGrade: -5.0, maxGrade: -8.8,
    type: "descent",
    segment: [[48.0663, 5.6155], [48.0657, 5.6150], [48.0650, 5.6145], [48.0643, 5.6140]],
    records: [
      { name: "Julien H.", time: "1:28", date: "2024-04-05" },
      { name: "Claire D.", time: "1:42", date: "2024-03-12" },
      { name: "Maxime T.", time: "1:50", date: "2024-02-22" }
    ]
  },
  {
    name: "Tour du Village",
    lat: 48.0667, lng: 5.6167,
    distance: 0.92, elevation: 18, avgGrade: 2.0, maxGrade: 4.5,
    type: "flat",
    segment: [[48.0660, 5.6160], [48.0665, 5.6165], [48.0670, 5.6170], [48.0673, 5.6168], [48.0668, 5.6163]],
    records: [
      { name: "David R.", time: "3:12", date: "2024-04-08" },
      { name: "Sophie M.", time: "3:38", date: "2024-03-22" },
      { name: "Lucas P.", time: "3:52", date: "2024-02-16" }
    ]
  },
  {
    name: "Sprint Centre-Est",
    lat: 48.0668, lng: 5.6185,
    distance: 0.65, elevation: 6, avgGrade: 0.9, maxGrade: 2.5,
    type: "sprint",
    segment: [[48.0663, 5.6170], [48.0666, 5.6178], [48.0668, 5.6185], [48.0671, 5.6193]],
    records: [
      { name: "Théo V.", time: "2:12", date: "2024-04-15" },
      { name: "Camille L.", time: "2:28", date: "2024-03-30" },
      { name: "Arthur B.", time: "2:38", date: "2024-02-25" }
    ]
  }
];

function initMap() {
  if (map) return;

  // Carte centrée sur Bize (52500) - Vraies coordonnées
  map = L.map('map').setView([48.0667, 5.6167], 14);

  // Style Apple Maps - CartoDB Voyager (propre et moderne)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    maxZoom: 19
  }).addTo(map);

  // Demander la position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = [position.coords.latitude, position.coords.longitude];
        map.setView(userLocation, 15);

        // Marqueur position
        L.marker(userLocation, {
          icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
          })
        }).addTo(map).bindPopup('📍 Votre position');

        // Afficher les KOM proches
        displayNearbyKOMs(userLocation);
      },
      (error) => {
        console.log('Geolocation error:', error);
        // Par défaut sur Bize avec les vraies coordonnées
        displayNearbyKOMs([48.0667, 5.6167]);
      }
    );
  } else {
    // Par défaut sur Bize avec les vraies coordonnées
    displayNearbyKOMs([48.0667, 5.6167]);
  }

  // Clic pour ajouter des waypoints au routing
  map.on('click', (e) => {
    addRouteWaypoint(e.latlng);
  });
}

function setRouteMode(mode) {
  routeMode = mode;
  document.getElementById('btn-mode-walk').className = mode === 'walk'
    ? 'flex-1 bg-accent/10 text-accent px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 font-medium'
    : 'flex-1 bg-white/5 text-slate-400 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2';
  document.getElementById('btn-mode-bike').className = mode === 'bike'
    ? 'flex-1 bg-accent/10 text-accent px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 font-medium'
    : 'flex-1 bg-white/5 text-slate-400 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2';

  // Recréer le routage si des points existent
  if (routePoints.length > 0) {
    const savedPoints = [...routePoints];
    clearRoute();
    savedPoints.forEach(p => addRouteWaypoint(p));
  }
}

function addRouteWaypoint(latlng) {
  routePoints.push(latlng);

  // Si on a au moins 2 points, créer/mettre à jour le routage
  if (routePoints.length >= 2) {
    if (routeControl) {
      map.removeControl(routeControl);
    }

    // Router avec OSRM (Open Source Routing Machine)
    routeControl = L.Routing.control({
      waypoints: routePoints,
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      router: L.Routing.osrmv1({
        serviceUrl: `https://router.project-osrm.org/route/v1`,
        profile: routeMode === 'walk' ? 'foot' : 'cycling'
      }),
      lineOptions: {
        styles: [{ color: '#FC4C02', weight: 5, opacity: 0.8 }]
      },
      createMarker: (i, wp) => {
        const isStart = i === 0;
        const isEnd = i === routePoints.length - 1;
        return L.marker(wp.latLng, {
          icon: L.icon({
            iconUrl: isStart
              ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png'
              : isEnd
              ? 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
              : 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
          }),
          draggable: false
        });
      },
      show: false // Cacher les instructions textuelles
    }).addTo(map);

    // Écouter les changements de route
    routeControl.on('routesfound', (e) => {
      const route = e.routes[0];
      updatePlannerFromRoute(route);
    });
  }
}

function updatePlannerFromRoute(route) {
  const distance = route.summary.totalDistance / 1000; // en km
  const elevation = Math.round(distance * 12 + Math.random() * 20); // Simulation

  document.getElementById('planner-distance').textContent = `${distance.toFixed(2)} km`;
  document.getElementById('planner-elevation').textContent = `${elevation} m`;

  // Temps avec pace cible
  const targetPaceStr = document.getElementById('target-pace').value;
  const targetPaceSec = parsePace(targetPaceStr);
  if (targetPaceSec) {
    const timeTarget = distance * targetPaceSec;
    document.getElementById('planner-time-target').textContent = formatTime(timeTarget);
  } else {
    document.getElementById('planner-time-target').textContent = '--:--';
  }

  // Temps maximum (meilleur pace)
  if (allRuns.length > 0) {
    const paces = allRuns.filter(r => r.paceSecPerKm).map(r => r.paceSecPerKm);
    const bestPace = Math.min(...paces);
    const timeMax = distance * bestPace;
    document.getElementById('planner-time-max').textContent = formatTime(timeMax);
  }
}

function clearRoute() {
  routePoints = [];
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
  document.getElementById('planner-distance').textContent = '0.00 km';
  document.getElementById('planner-elevation').textContent = '0 m';
  document.getElementById('planner-time-target').textContent = '--:--';
  document.getElementById('planner-time-max').textContent = '--:--';
}

function centerMapOnLocation() {
  if (userLocation) {
    map.setView(userLocation, 15);
  } else {
    // Centrer sur Bize par défaut
    map.setView([48.0450, 5.4820], 14);
  }
}

function parsePace(paceStr) {
  if (!paceStr) return null;
  const parts = paceStr.split(':');
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0]);
  const sec = parseInt(parts[1]);
  return min * 60 + sec;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updatePlannerEstimates() {
  // Déjà géré par l'événement routesfound
}

function displayNearbyKOMs(userPos) {
  // Effacer les anciens KOM
  komMarkers.forEach(m => map.removeLayer(m));
  komMarkers = [];

  // Filtrer les KOM à moins de 10km (région de Bize)
  const nearbyKOMs = komDatabase.filter(kom => {
    const dist = L.latLng(userPos).distanceTo([kom.lat, kom.lng]) / 1000;
    return dist < 10;
  });

  // Afficher chaque KOM avec son segment en doré
  nearbyKOMs.forEach(kom => {
    // Tracer le segment du KOM en doré (style Strava)
    const komLine = L.polyline(kom.segment, {
      color: '#FFD700',
      weight: 6,
      opacity: 0.9,
      className: 'kom-segment'
    }).addTo(map);
    komMarkers.push(komLine);

    // Icône et type
    const icon = kom.type === 'climb' ? '⛰️' : kom.type === 'sprint' ? '⚡' : kom.type === 'descent' ? '⬇️' : '🏁';
    const typeLabel = kom.type === 'climb' ? 'Montée' : kom.type === 'sprint' ? 'Sprint' : kom.type === 'descent' ? 'Descente' : 'Parcours';

    // Créer le popup détaillé style Strava
    const popupContent = `
      <div style="min-width: 250px; font-family: Inter, sans-serif;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 24px;">${icon}</span>
          <div>
            <div style="font-weight: bold; font-size: 16px;">${kom.name}</div>
            <div style="font-size: 11px; color: #94a3b8;">${typeLabel}</div>
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.1); padding: 8px; border-radius: 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
            <div><b>Distance:</b> ${kom.distance.toFixed(2)} km</div>
            <div><b>Dénivelé:</b> ${kom.elevation > 0 ? '+' : ''}${kom.elevation}m</div>
            <div><b>Pente moy:</b> ${kom.avgGrade.toFixed(1)}%</div>
            <div><b>Pente max:</b> ${kom.maxGrade.toFixed(1)}%</div>
          </div>
        </div>

        <div style="margin-bottom: 8px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">🏆 Meilleurs temps</div>
          ${kom.records.map((r, i) => `
            <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
              <span>${i + 1}. ${r.name}</span>
              <span style="font-weight: bold; color: ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32'};">${r.time}</span>
            </div>
          `).join('')}
        </div>

        <button onclick="addKOMToRoute(${kom.lat}, ${kom.lng})"
                style="width: 100%; background: #CCFF00; color: #000; padding: 8px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;">
          ➕ Ajouter au tracé
        </button>
      </div>
    `;

    // Marqueur au centre du KOM (icône dorée)
    const centerIdx = Math.floor(kom.segment.length / 2);
    const marker = L.marker(kom.segment[centerIdx], {
      icon: L.divIcon({
        html: `<div style="background: #FFD700; color: #000; font-size: 20px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${icon}</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      })
    }).addTo(map).bindPopup(popupContent, { maxWidth: 300 });

    komMarkers.push(marker);
  });

  // Afficher la liste
  renderKOMList(nearbyKOMs);
}

function renderKOMList(koms) {
  const container = document.getElementById('kom-list');
  if (!koms.length) {
    container.innerHTML = '<p class="text-slate-400 text-sm">Aucun KOM à proximité</p>';
    return;
  }

  container.innerHTML = koms.map(kom => {
    const icon = kom.type === 'climb' ? '⛰️' : kom.type === 'sprint' ? '⚡' : kom.type === 'descent' ? '⬇️' : '🏁';
    const typeLabel = kom.type === 'climb' ? 'Montée' : kom.type === 'sprint' ? 'Sprint' : kom.type === 'descent' ? 'Descente' : 'Parcours';
    return `
      <div class="glass rounded-xl p-4 flex items-center justify-between border border-yellow-500/20">
        <div class="flex items-center gap-3">
          <div class="text-3xl">${icon}</div>
          <div>
            <h4 class="font-semibold">${kom.name}</h4>
            <p class="text-xs text-slate-400 mt-1">
              ${typeLabel} • ${kom.distance.toFixed(1)} km • ${kom.elevation > 0 ? '+' : ''}${kom.elevation}m • ${kom.avgGrade.toFixed(1)}%
            </p>
            <p class="text-xs text-yellow-500 mt-1">🏆 Record: ${kom.records[0].name} - ${kom.records[0].time}</p>
          </div>
        </div>
        <button onclick="addKOMToRoute(${kom.lat}, ${kom.lng})" class="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 px-3 py-2 rounded-lg text-sm transition">
          <i data-lucide="plus" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function addKOMToRoute(lat, lng) {
  addRouteWaypoint(L.latLng(lat, lng));
}

function saveRoute() {
  if (routePoints.length < 2) {
    alert('Tracez un parcours avant de sauvegarder !');
    return;
  }

  const name = prompt('Nom du tracé :');
  if (!name) return;

  const distance = parseFloat(document.getElementById('planner-distance').textContent);

  savedRoutes.push({
    id: Date.now(),
    name: name,
    points: routePoints.map(p => [p.lat, p.lng]),
    distance: distance,
    mode: routeMode,
    date: new Date().toISOString()
  });

  localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
  renderSavedRoutes();
  alert('✅ Tracé sauvegardé !');
}

function renderSavedRoutes() {
  const container = document.getElementById('saved-routes');
  if (!savedRoutes.length) {
    container.innerHTML = '<p class="text-slate-400 text-sm">Aucun tracé sauvegardé</p>';
    return;
  }

  container.innerHTML = savedRoutes.map(route => `
    <div class="glass rounded-xl p-4 flex items-center justify-between">
      <div>
        <h4 class="font-semibold">${route.name}</h4>
        <p class="text-xs text-slate-400 mt-1">
          ${route.distance.toFixed(2)} km • ${route.mode === 'walk' ? '🏃' : '🚴'} • ${new Date(route.date).toLocaleDateString('fr-FR')}
        </p>
      </div>
      <div class="flex gap-2">
        <button onclick="loadRoute(${route.id})" class="bg-accent/10 hover:bg-accent/20 text-accent px-3 py-2 rounded-lg text-sm transition">
          <i data-lucide="map" class="w-4 h-4"></i>
        </button>
        <button onclick="deleteRoute(${route.id})" class="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm transition">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function loadRoute(id) {
  const route = savedRoutes.find(r => r.id === id);
  if (!route) return;

  routeMode = route.mode || 'walk';
  setRouteMode(routeMode);

  clearRoute();
  route.points.forEach(p => {
    addRouteWaypoint(L.latLng(p[0], p[1]));
  });
}

function deleteRoute(id) {
  if (!confirm('Supprimer ce tracé ?')) return;
  savedRoutes = savedRoutes.filter(r => r.id !== id);
  localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
  renderSavedRoutes();
}

// ===== SECTION KOM PROCHES =====
function initKOMSection() {
  // Obtenir la position pour trouver les KOM proches
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = [position.coords.latitude, position.coords.longitude];
        displayNearestKOMs(pos);
        initKOMMiniMap(pos);
      },
      (error) => {
        console.log('Geolocation error:', error);
        // Par défaut sur Bize
        displayNearestKOMs([48.0450, 5.4820]);
        initKOMMiniMap([48.0450, 5.4820]);
      }
    );
  } else {
    // Par défaut sur Bize
    displayNearestKOMs([48.0450, 5.4820]);
    initKOMMiniMap([48.0450, 5.4820]);
  }
}

function displayNearestKOMs(userPos) {
  // Calculer les distances et trier
  const komsWithDistance = komDatabase.map(kom => {
    const dist = L.latLng(userPos).distanceTo([kom.lat, kom.lng]) / 1000;
    return { ...kom, distance: dist };
  }).sort((a, b) => a.distance - b.distance);

  // Prendre TOUS les KOM (plus seulement les 3 premiers)
  const nearestKOMs = komsWithDistance;

  // Générer les cartes
  const container = document.getElementById('nearby-kom-cards');
  container.innerHTML = nearestKOMs.map((kom, index) => {
    const icon = kom.type === 'climb' ? '⛰️' : kom.type === 'sprint' ? '⚡' : kom.type === 'descent' ? '⬇️' : '🏁';
    const typeLabel = kom.type === 'climb' ? 'Montée' : kom.type === 'sprint' ? 'Sprint' : kom.type === 'descent' ? 'Descente' : 'Parcours';
    const medalColor = index === 0 ? 'from-yellow-500 to-yellow-600' : index === 1 ? 'from-gray-400 to-gray-500' : index === 2 ? 'from-orange-600 to-orange-700' : 'from-slate-600 to-slate-700';
    const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏃';

    return `
      <div class="glass rounded-2xl p-6 border-2 border-yellow-500/30 hover:border-yellow-500/50 transition">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="text-5xl">${icon}</div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="text-xl font-bold">${kom.name}</h4>
                <span class="text-2xl">${rankEmoji}</span>
              </div>
              <p class="text-sm text-slate-400 mt-1">${typeLabel}</p>
            </div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold text-yellow-500">${kom.distance.toFixed(1)} km</div>
            <div class="text-xs text-slate-400">de vous</div>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div class="bg-surface-800/50 rounded-lg p-3 text-center">
            <div class="text-xs text-slate-400 mb-1">Distance</div>
            <div class="text-lg font-bold text-accent">${kom.distance.toFixed(2)} km</div>
          </div>
          <div class="bg-surface-800/50 rounded-lg p-3 text-center">
            <div class="text-xs text-slate-400 mb-1">Dénivelé</div>
            <div class="text-lg font-bold text-accentBlue">${kom.elevation > 0 ? '+' : ''}${kom.elevation}m</div>
          </div>
          <div class="bg-surface-800/50 rounded-lg p-3 text-center">
            <div class="text-xs text-slate-400 mb-1">Pente moy.</div>
            <div class="text-lg font-bold text-accentPurple">${kom.avgGrade.toFixed(1)}%</div>
          </div>
          <div class="bg-surface-800/50 rounded-lg p-3 text-center">
            <div class="text-xs text-slate-400 mb-1">Pente max</div>
            <div class="text-lg font-bold text-accentOrange">${kom.maxGrade.toFixed(1)}%</div>
          </div>
        </div>

        <div class="bg-surface-800/30 rounded-xl p-4 mb-4">
          <div class="flex items-center gap-2 mb-3">
            <i data-lucide="trophy" class="w-4 h-4 text-yellow-500"></i>
            <span class="text-sm font-semibold">Meilleurs temps</span>
          </div>
          <div class="space-y-2">
            ${kom.records.map((r, i) => `
              <div class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-lg">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span class="font-medium">${r.name}</span>
                </div>
                <span class="font-bold text-${i === 0 ? 'yellow' : i === 1 ? 'gray' : 'orange'}-500">${r.time}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <button onclick="goToKOMOnMap(${kom.lat}, ${kom.lng})"
                class="w-full bg-gradient-to-r ${medalColor} text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition hover:scale-105">
          <i data-lucide="map-pin" class="w-5 h-5"></i>
          Voir sur la carte
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function initKOMMiniMap(userPos) {
  if (komMiniMap) {
    komMiniMap.remove();
  }

  komMiniMap = L.map('kom-mini-map').setView(userPos, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(komMiniMap);

  // Position utilisateur
  L.marker(userPos, {
    icon: L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    })
  }).addTo(komMiniMap).bindPopup('📍 Vous');

  // Les 3 KOM les plus proches
  const komsWithDistance = komDatabase.map(kom => {
    const dist = L.latLng(userPos).distanceTo([kom.lat, kom.lng]) / 1000;
    return { ...kom, distance: dist };
  }).sort((a, b) => a.distance - b.distance).slice(0, 3);

  komsWithDistance.forEach((kom, index) => {
    const icon = kom.type === 'climb' ? '⛰️' : kom.type === 'sprint' ? '⚡' : kom.type === 'descent' ? '⬇️' : '🏁';
    const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';

    // Segment doré
    L.polyline(kom.segment, {
      color: '#FFD700',
      weight: 5,
      opacity: 0.9
    }).addTo(komMiniMap);

    // Marqueur
    const centerIdx = Math.floor(kom.segment.length / 2);
    L.marker(kom.segment[centerIdx], {
      icon: L.divIcon({
        html: `<div style="background: #FFD700; color: #000; font-size: 18px; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${icon}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    }).addTo(komMiniMap).bindPopup(`<b>${rankEmoji} ${kom.name}</b><br>${kom.distance.toFixed(1)} km`);
  });

  // Ajuster les bounds
  const bounds = L.latLngBounds([userPos]);
  komsWithDistance.forEach(kom => {
    kom.segment.forEach(point => bounds.extend(point));
  });
  komMiniMap.fitBounds(bounds, { padding: [30, 30] });
}

function goToKOMOnMap(lat, lng) {
  showSection('planner');
  setTimeout(() => {
    if (!map) initMap();
    map.setView([lat, lng], 16);
  }, 300);
}

// ===== ANALYSE D'ENTRAÎNEMENT =====
function analyzeTraining() {
  const input = document.getElementById('training-input').value.trim();

  if (!input) {
    alert('❌ Entre ton planning d\'entraînement d\'abord !');
    return;
  }

  // Parser le texte pour extraire les km
  const lines = input.split('\n').filter(line => line.trim());
  let totalKm = 0;
  let sessions = 0;
  let restDays = 0;
  const details = [];

  // Détecter les séances (Séance 1, Séance 2, etc.) ou jours de la semaine
  let currentSessionKm = 0;
  let inSession = false;

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();

    // Nouvelle séance détectée
    if (lowerLine.match(/séance\s+\d+/i) || lowerLine.match(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i)) {
      if (inSession && currentSessionKm > 0) {
        totalKm += currentSessionKm;
        sessions++;
      }
      currentSessionKm = 0;
      inSession = true;

      // Vérifier si c'est un jour de repos
      if (lowerLine.includes('repos') || lowerLine.includes('rest') || lowerLine.includes('off')) {
        restDays++;
        inSession = false;
        return;
      }
    }

    if (!inSession && !lowerLine.match(/séance\s+\d+/i)) {
      inSession = true; // Mode par défaut si pas de structure
    }

    let lineKm = 0;

    // 1. Extraire les km directs (10km, 8 km, 5.5km)
    const kmMatches = line.match(/(\d+(?:\.\d+)?)\s*km/gi);
    if (kmMatches) {
      kmMatches.forEach(match => {
        const km = parseFloat(match.replace(/km/i, ''));
        lineKm += km;
      });
    }

    // 2. Extraire les fractionnés avec espaces (5 × 1 000 m, 6×400m, 10 × 100 m)
    // Matcher: "5 × 1 000" ou "6×400" ou "10 × 200"
    const fracMatches = line.match(/(\d+)\s*[×x]\s*(\d+(?:\s+\d+)?)\s*m(?!in)/gi);
    if (fracMatches) {
      fracMatches.forEach(match => {
        const parts = match.match(/(\d+)\s*[×x]\s*(\d+(?:\s+\d+)?)/i);
        if (parts) {
          const reps = parseInt(parts[1]);
          // Enlever les espaces dans le nombre (1 000 → 1000)
          const distance = parseInt(parts[2].replace(/\s+/g, ''));
          const km = (reps * distance) / 1000;
          lineKm += km;
        }
      });
    }

    // 3. Extraire les durées (20', 1h15, 50min, 30') et convertir en km
    const timeMatchesMin = line.match(/(\d+)'/g); // 20', 15'
    const timeMatchesHM = line.match(/(\d+)h(\d+)/gi); // 1h15
    const timeMatchesMin2 = line.match(/(\d+)\s*min/gi); // 50min

    let totalMinutes = 0;

    if (timeMatchesMin) {
      timeMatchesMin.forEach(match => {
        const min = parseInt(match.replace("'", ''));
        totalMinutes += min;
      });
    }

    if (timeMatchesHM) {
      timeMatchesHM.forEach(match => {
        const parts = match.match(/(\d+)h(\d+)/i);
        if (parts) {
          totalMinutes += parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
      });
    }

    if (timeMatchesMin2) {
      timeMatchesMin2.forEach(match => {
        const min = parseInt(match.replace(/min/i, ''));
        totalMinutes += min;
      });
    }

    if (totalMinutes > 0 && !kmMatches) {
      // Détecter l'allure dans la ligne (4'02 à 4'05/km ou 5'10 à 5'35/km)
      const paceMatch = line.match(/(\d+)'(\d+)/); // 4'02 ou 5'10
      let paceMinPerKm = 5.33; // défaut 5:20/km pour EF

      if (paceMatch) {
        const min = parseInt(paceMatch[1]);
        const sec = parseInt(paceMatch[2]);
        paceMinPerKm = min + sec / 60;
      } else if (lowerLine.includes('ef') || lowerLine.includes('endurance fondamentale') || lowerLine.includes('footing')) {
        paceMinPerKm = 5.33; // EF = 5:20/km (moyenne entre 5:10 et 5:35)
      } else if (lowerLine.includes('seuil') || lowerLine.includes('tempo')) {
        paceMinPerKm = 4.2; // Seuil = 4:12/km
      } else if (lowerLine.includes('vma') || lowerLine.includes('rapide')) {
        paceMinPerKm = 3.5; // VMA = 3:30/km
      } else if (lowerLine.includes('récup') || lowerLine.includes('recup') || lowerLine.includes('calme')) {
        paceMinPerKm = 6.0; // Récup = 6:00/km
      }

      lineKm += totalMinutes / paceMinPerKm;
    }

    // 4. Séries avec temps (3 × 12' à 4'02)
    const seriesTimeMatches = line.match(/(\d+)\s*[×x]\s*(\d+)'/gi);
    if (seriesTimeMatches) {
      seriesTimeMatches.forEach(match => {
        const parts = match.match(/(\d+)\s*[×x]\s*(\d+)'/i);
        if (parts) {
          const reps = parseInt(parts[1]);
          const minutes = parseInt(parts[2]);

          // Détecter l'allure
          const paceMatch = line.match(/(\d+)'(\d+)/);
          let paceMinPerKm = 4.5; // défaut tempo

          if (paceMatch) {
            const min = parseInt(paceMatch[1]);
            const sec = parseInt(paceMatch[2]);
            paceMinPerKm = min + sec / 60;
          }

          const km = (reps * minutes) / paceMinPerKm;
          lineKm += km;
        }
      });
    }

    currentSessionKm += lineKm;
  });

  // Ajouter la dernière séance
  if (currentSessionKm > 0) {
    totalKm += currentSessionKm;
    sessions++;
  }

  // Calculer la note
  let rating = 5;
  if (totalKm >= 40 && totalKm <= 80) rating = 8;
  if (totalKm >= 80 && totalKm <= 100) rating = 9;
  if (totalKm > 100) rating = 10;
  if (totalKm < 20) rating = 3;
  if (restDays < 1) rating -= 1;
  if (sessions < 3) rating -= 1;
  rating = Math.max(0, Math.min(10, rating));

  // Générer l'analyse
  let analysis = '';
  let recommendations = [];

  if (totalKm < 30) {
    analysis = `⚠️ <b>Volume faible</b> : Avec seulement <b>${totalKm.toFixed(1)} km</b> cette semaine, tu es en phase de récupération ou de reprise. C'est bien pour la récup, mais insuffisant pour progresser si c'est ton volume habituel.`;
    recommendations.push('📈 Augmente progressivement ton kilométrage de 10% par semaine');
    recommendations.push('🎯 Vise au moins 40-50km/semaine pour progresser');
  } else if (totalKm >= 30 && totalKm < 60) {
    analysis = `✅ <b>Volume correct</b> : <b>${totalKm.toFixed(1)} km</b> sur la semaine, c'est un bon volume pour maintenir ta forme ou progresser doucement. Tu as <b>${sessions} séances</b> ce qui est bien réparti.`;
    recommendations.push('💪 Ajoute une sortie longue le week-end pour améliorer l\'endurance');
    recommendations.push('⚡ Intègre 1 séance de fractionné par semaine');
  } else if (totalKm >= 60 && totalKm <= 100) {
    analysis = `🔥 <b>Excellent volume</b> : <b>${totalKm.toFixed(1)} km</b> cette semaine ! C'est un volume sérieux qui va te faire progresser. Avec <b>${sessions} séances</b> et <b>${restDays} jour(s) de repos</b>, l'équilibre est bon.`;
    recommendations.push('🎯 Continue comme ça, c\'est top !');
    recommendations.push('💧 Hydrate-toi bien et dors suffisamment');
    recommendations.push('🍽️ Surveille ta nutrition pour soutenir ce volume');
  } else {
    analysis = `🚀 <b>Volume très élevé</b> : <b>${totalKm.toFixed(1)} km</b> ! Tu es un guerrier ! Mais attention à la fatigue et aux blessures avec un tel volume. Assure-toi d'avoir assez de récupération.`;
    recommendations.push('⚠️ Surveille les signes de surentraînement (fatigue, sommeil, rythme cardiaque)');
    recommendations.push('🧘 Intègre du stretching et de la mobilité');
    recommendations.push('😴 Priorise le sommeil (8h minimum)');
  }

  // Critique des repos
  if (restDays === 0) {
    analysis += `<br><br>⚠️ <b>Aucun jour de repos</b> : Ton corps a besoin de récupérer ! Ajoute au moins 1-2 jours de repos complet par semaine.`;
    recommendations.push('🛌 Ajoute 1-2 jours de repos complet dans la semaine');
  } else if (restDays === 1) {
    analysis += `<br><br>✅ Tu as <b>${restDays} jour de repos</b>, c'est bien mais tu pourrais en ajouter un deuxième si tu sens de la fatigue.`;
  } else {
    analysis += `<br><br>✅ Tu as <b>${restDays} jours de repos</b>, c'est parfait pour la récupération !`;
  }

  // Critique des séances
  if (sessions < 3) {
    analysis += `<br><br>⚠️ Seulement <b>${sessions} séances</b> cette semaine. Pour progresser, vise au moins 3-4 séances.`;
  } else if (sessions >= 5) {
    analysis += `<br><br>💪 <b>${sessions} séances</b> dans la semaine, c'est un beau rythme ! Assure-toi de varier les intensités.`;
  }

  // Afficher les résultats
  document.getElementById('total-km').textContent = `${totalKm.toFixed(1)} km`;
  document.getElementById('total-sessions').textContent = sessions;
  document.getElementById('global-rating').textContent = `${rating}/10`;
  document.getElementById('ai-analysis').innerHTML = analysis;

  const recoHTML = recommendations.map(r => `
    <div class="bg-surface-800/50 rounded-lg p-4 border-l-4 border-accent">
      <p class="text-sm">${r}</p>
    </div>
  `).join('');
  document.getElementById('recommendations').innerHTML = recoHTML;

  // Afficher la section résultats
  document.getElementById('analysis-results').classList.remove('hidden');

  // Scroll vers les résultats
  setTimeout(() => {
    document.getElementById('analysis-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Fonctions pour l'interface moderne du planificateur
function closePlanner() {
  showSection('dashboard');
}

function resetMapOrientation() {
  if (map) {
    map.setView([48.0667, 5.6167], 15);
  }
}

function toggleMapLayers() {
  // Toggle entre différents styles de carte
  alert('Fonctionnalité bientôt disponible : changer le style de carte');
}

function toggle3D() {
  // Future: vue 3D
  alert('Vue 3D bientôt disponible !');
}