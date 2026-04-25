/* ── State ── */
let timerInterval = null;
let elapsedSeconds = 0;
let timerRunning = false;
let selectedItems = new Set();
let allItems = [];
let allSessions = []; // full list, used only for stats

const PAGE_SIZE = 25;
let historyPage = 0;   // current page index (0-based)
let historyTotal = 0;  // total session count from server

/* ── Helpers ── */
function fmt(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TYPE_COLORS = [
  ['rgba(139,92,246,.75)',  'rgba(139,92,246,1)',  '#8b5cf6'],  // purple
  ['rgba(59,130,246,.75)',  'rgba(59,130,246,1)',  '#3b82f6'],  // blue
  ['rgba(34,197,94,.75)',   'rgba(34,197,94,1)',   '#22c55e'],  // green
  ['rgba(236,72,153,.75)',  'rgba(236,72,153,1)',  '#ec4899'],  // pink
  ['rgba(251,146,60,.75)',  'rgba(251,146,60,1)',  '#fb923c'],  // orange
  ['rgba(20,184,166,.75)',  'rgba(20,184,166,1)',  '#14b8a6'],  // teal
  ['rgba(234,179,8,.75)',   'rgba(234,179,8,1)',   '#eab308'],  // yellow
];

function typeColor(type) {
  const idx = [...type].reduce((a, c) => a + c.charCodeAt(0), 0) % TYPE_COLORS.length;
  return TYPE_COLORS[idx];
}

function todayISO() {
  return toLocalISO(new Date());
}

function startOfWeek(date) {
  const d = new Date(date + 'T00:00:00');
  // Week starts on Monday (getDay(): 0=Sun → shift to 6, 1=Mon → 0, ..., 6=Sat → 5)
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toLocalISO(d);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

/* ── Navigation ── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'stats') renderStats();
    if (btn.dataset.tab === 'history') { historyPage = 0; renderHistory(); }
    if (btn.dataset.tab === 'tempo') renderTempo();
    if (btn.dataset.tab === 'manage') renderManage();
  });
});

/* ── Timer ── */
const display = document.getElementById('timer-display');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnEnd   = document.getElementById('btn-end');

btnStart.addEventListener('click', () => {
  timerRunning = true;
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    display.textContent = fmt(elapsedSeconds);
  }, 1000);
  btnStart.disabled = true;
  btnPause.disabled = false;
  btnEnd.disabled   = false;
  display.classList.remove('paused');
});

btnPause.addEventListener('click', () => {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    btnPause.textContent = 'Resume';
    display.classList.add('paused');
  } else {
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      display.textContent = fmt(elapsedSeconds);
    }, 1000);
    timerRunning = true;
    btnPause.textContent = 'Pause';
    display.classList.remove('paused');
  }
});

btnEnd.addEventListener('click', () => {
  clearInterval(timerInterval);
  timerRunning = false;
  showConfirm();
});

function showConfirm() {
  const summary = document.getElementById('session-summary');
  const practiced = selectedItems.size > 0
    ? Array.from(selectedItems).join(', ')
    : 'Nothing selected';
  summary.textContent = `Duration: ${fmtDuration(elapsedSeconds)} · Practiced: ${practiced}`;
  document.getElementById('session-confirm').classList.remove('hidden');
  btnStart.disabled = true;
  btnPause.disabled = true;
  btnEnd.disabled   = true;
}

document.getElementById('btn-save').addEventListener('click', async () => {
  await api('POST', '/api/sessions', {
    date: todayISO(),
    duration: elapsedSeconds,
    items: Array.from(selectedItems)
  });
  resetTimer();
  const data = await api('GET', '/api/sessions');
  allSessions = data.sessions;
});

document.getElementById('btn-discard').addEventListener('click', resetTimer);

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  elapsedSeconds = 0;
  display.textContent = '00:00:00';
  display.classList.remove('paused');
  btnStart.disabled = false;
  btnPause.disabled = true;
  btnEnd.disabled   = true;
  btnPause.textContent = 'Pause';
  document.getElementById('session-confirm').classList.add('hidden');
  selectedItems.clear();
  renderChecklist();
}

/* ── Item Checklist ── */
function renderChecklist() {
  const grid = document.getElementById('item-checklist');
  grid.innerHTML = '';
  allItems.forEach(item => {
    const chip = document.createElement('div');
    chip.className = 'item-chip' + (selectedItems.has(item.name) ? ' selected' : '');
    chip.textContent = item.name;
    chip.addEventListener('click', () => {
      if (selectedItems.has(item.name)) selectedItems.delete(item.name);
      else selectedItems.add(item.name);
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) chip.textContent = item.name;
      else chip.textContent = item.name;
    });
    grid.appendChild(chip);
  });
}

/* ── Stats ── */
function renderStats() {
  const sessions = allSessions; // full list loaded at boot / after save
  const today = todayISO();
  const sow = startOfWeek(today);

  // Total time
  const totalSeconds = sessions.reduce((sum, s) => sum + s.duration, 0);
  document.getElementById('stat-total-time').textContent = fmt(totalSeconds);

  // Sessions this week
  const weekSessions = sessions.filter(s => s.date >= sow && s.date <= today);
  document.getElementById('stat-week-sessions').textContent = weekSessions.length;

  // Streak
  const { current, longest } = computeStreaks(sessions);
  document.getElementById('stat-streak').textContent = current;
  document.getElementById('stat-longest-streak').textContent = longest;

  renderWeekChart(weekSessions);
  renderYearChart(sessions);
}

function computeStreaks(sessions) {
  if (sessions.length === 0) return { current: 0, longest: 0 };
  const days = [...new Set(sessions.map(s => s.date))].sort();
  let longest = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { cur++; longest = Math.max(longest, cur); }
    else cur = 1;
  }
  // Current streak: count backwards from today
  const today = todayISO();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = toLocalISO(yesterday);
  const daySet = new Set(days);
  if (!daySet.has(today) && !daySet.has(yISO)) return { current: 0, longest };
  let current = 0;
  let check = new Date((daySet.has(today) ? today : yISO) + 'T00:00:00');
  while (daySet.has(toLocalISO(check))) {
    current++;
    check.setDate(check.getDate() - 1);
  }
  return { current, longest };
}

/* ── Week Chart ── */
let weekChart = null;
function renderWeekChart(weekSessions) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date();
  const labels = [];
  const data = [];
  const startOffset = (today.getDay() + 6) % 7; // days since Monday

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - startOffset + i);
    const iso = toLocalISO(d);
    labels.push(days[i]);
    const total = weekSessions
      .filter(s => s.date === iso)
      .reduce((sum, s) => sum + s.duration, 0);
    data.push(Math.round(total / 60)); // minutes
  }

  const ctx = document.getElementById('chart-week').getContext('2d');
  if (weekChart) weekChart.destroy();
  weekChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Minutes',
        data,
        backgroundColor: 'rgba(59,130,246,0.75)',
        borderColor: 'rgba(59,130,246,1)',
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: chartOptions('min')
  });
}

/* ── Year Chart ── */
let yearChart = null;
function renderYearChart(sessions) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const year = new Date().getFullYear();
  const data = Array(12).fill(0);

  sessions.forEach(s => {
    if (s.date.startsWith(String(year))) {
      const m = parseInt(s.date.slice(5, 7)) - 1;
      data[m] += s.duration;
    }
  });

  const ctx = document.getElementById('chart-year').getContext('2d');
  if (yearChart) yearChart.destroy();
  yearChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Hours',
        data: data.map(s => parseFloat((s / 3600).toFixed(2))),
        backgroundColor: 'rgba(139,92,246,0.75)',
        borderColor: 'rgba(139,92,246,1)',
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: chartOptions('h')
  });
}

function chartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.parsed.y} ${unit}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#8888aa' }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.07)' },
        ticks: { color: '#8888aa' }
      }
    }
  };
}

/* ── History ── */
async function renderHistory() {
  const offset = historyPage * PAGE_SIZE;
  const data = await api('GET', `/api/sessions?limit=${PAGE_SIZE}&offset=${offset}`);
  historyTotal = data.total;
  const sessions = data.sessions;

  const totalPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const start = historyTotal === 0 ? 0 : offset + 1;
  const end   = Math.min(offset + PAGE_SIZE, historyTotal);

  document.getElementById('history-count').textContent =
    historyTotal === 0 ? '' : `${start}–${end} of ${historyTotal}`;

  const tbody = document.getElementById('history-body');
  tbody.innerHTML = '';
  if (sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:32px">No sessions yet</td></tr>';
  } else {
    sessions.forEach(s => {
      const tr = document.createElement('tr');
      const chips = s.items.map(i => { const [bg,,solid] = typeColor(i); return `<span class="chip" style="background:${bg};border-color:${solid};color:#fff">${i}</span>`; }).join('');
      tr.innerHTML = `
        <td>${s.date}</td>
        <td>${fmtDuration(s.duration)}</td>
        <td><div class="chip-list">${chips || '<span style="color:var(--text-dim)">—</span>'}</div></td>
        <td><button class="del-btn" data-id="${s.id}" title="Delete">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this session?')) return;
        await api('DELETE', `/api/sessions/${btn.dataset.id}`);
        // If we deleted the last item on this page, go back one
        if (sessions.length === 1 && historyPage > 0) historyPage--;
        // Refresh stats (total count changed)
        const all = await api('GET', '/api/sessions');
        allSessions = all.sessions;
        renderHistory();
      });
    });
  }

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('history-pagination');
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'btn btn-blue';
  prev.textContent = '← Prev';
  prev.disabled = historyPage === 0;
  prev.addEventListener('click', () => { historyPage--; renderHistory(); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${historyPage + 1} of ${totalPages}`;

  const next = document.createElement('button');
  next.className = 'btn btn-blue';
  next.textContent = 'Next →';
  next.disabled = historyPage >= totalPages - 1;
  next.addEventListener('click', () => { historyPage++; renderHistory(); });

  container.append(prev, info, next);
}

/* ── Manage Items ── */
function renderManage() {
  const list = document.getElementById('items-list');
  list.innerHTML = '';
  allItems.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${item.name}</span>
      <button class="del-btn" data-id="${item.id}" title="Remove">✕</button>
    `;
    li.querySelector('.del-btn').addEventListener('click', async () => {
      await api('DELETE', `/api/items/${item.id}`);
      allItems = await api('GET', '/api/items');
      renderManage();
      renderChecklist();
    });
    list.appendChild(li);
  });
}

document.getElementById('btn-add-item').addEventListener('click', addItem);
document.getElementById('new-item-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addItem();
});

async function addItem() {
  const input = document.getElementById('new-item-input');
  const name = input.value.trim();
  if (!name) return;
  const result = await api('POST', '/api/items', { name });
  if (result.error) { alert(result.error); return; }
  input.value = '';
  allItems = await api('GET', '/api/items');
  renderManage();
  renderChecklist();
}

/* ── Tempo Tracker ── */
let allExercises = [];
let tempoCharts = {};  // keyed by type string

async function renderTempo() {
  allExercises = await api('GET', '/api/exercises');
  populateExerciseSelect();
  renderExerciseList();
  await renderRecentTable();
  await renderTempoCharts();
  await renderTempoLog();
}

function populateExerciseSelect() {
  const sel = document.getElementById('tempo-exercise');
  sel.innerHTML = '<option value="">— select exercise —</option>';
  allExercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.type ? `${ex.name} (${ex.type})` : ex.name;
    sel.appendChild(opt);
  });
}

// Set default date to today
document.getElementById('tempo-date').value = todayISO();

document.getElementById('btn-log-tempo').addEventListener('click', async () => {
  const date = document.getElementById('tempo-date').value;
  const exercise_id = parseInt(document.getElementById('tempo-exercise').value);
  const bpm = parseInt(document.getElementById('tempo-bpm').value);
  if (!date || !exercise_id || !bpm || bpm < 1) { alert('Please fill in all fields.'); return; }
  await api('POST', '/api/exercise-logs', { exercise_id, date, bpm });
  document.getElementById('tempo-bpm').value = '';
  await renderRecentTable();
  await renderTempoCharts();
  await renderTempoLog();
});

async function renderRecentTable() {
  const data = await api('GET', '/api/exercise-logs/recent');
  const container = document.getElementById('tempo-recent-table');
  container.innerHTML = '';

  if (data.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim)">No exercise logs yet.</p>';
    return;
  }

  // Group by type
  const byType = {};
  data.forEach(ex => {
    const t = ex.type || 'Uncategorized';
    if (!byType[t]) byType[t] = [];
    byType[t].push(ex);
  });

  const table = document.createElement('table');
  table.className = 'recent-ex-table';
  table.innerHTML = '<thead><tr><th>Exercise</th><th>Records (newest → oldest)</th></tr></thead>';
  const tbody = document.createElement('tbody');

  Object.entries(byType).sort(([a],[b]) => a.localeCompare(b)).forEach(([type, exercises]) => {
    const headerRow = document.createElement('tr');
    headerRow.className = 'recent-type-header';
    headerRow.innerHTML = `<td colspan="2">${type}</td>`;
    tbody.appendChild(headerRow);

    exercises.forEach(ex => {
      const maxBpm = Math.max(...ex.logs.map(l => l.bpm));
      const tr = document.createElement('tr');

      const chips = ex.logs.map(l => {
        const isBest = l.bpm === maxBpm;
        return `<span class="bpm-chip${isBest ? ' is-best' : ''}" title="${l.date}">
          <span class="date-chip">${l.date.slice(5)}</span> ${l.bpm}
        </span>`;
      }).join('');

      tr.innerHTML = `
        <td class="ex-name-cell">${ex.name}</td>
        <td class="bpm-cell">${chips}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

async function renderTempoCharts() {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceISO = toLocalISO(since);
  const logs = await api('GET', `/api/exercise-logs?since=${sinceISO}`);

  // Group logs: type → exercise name → max BPM
  const byType = {};
  logs.forEach(log => {
    const type = log.type || 'Uncategorized';
    if (!byType[type]) byType[type] = {};
    if (!byType[type][log.name] || byType[type][log.name] < log.bpm) {
      byType[type][log.name] = log.bpm;
    }
  });

  const container = document.getElementById('tempo-charts');
  container.innerHTML = '';

  // Destroy old charts
  Object.values(tempoCharts).forEach(c => c.destroy());
  tempoCharts = {};

  if (Object.keys(byType).length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);margin-bottom:24px">No exercise data in the last 30 days.</p>';
    return;
  }

  Object.entries(byType).sort(([a],[b]) => a.localeCompare(b)).forEach(([type, exMap]) => {
    const section = document.createElement('div');
    section.className = 'tempo-card';

    const labels = Object.keys(exMap);
    const data   = Object.values(exMap);

    const [bg, border, solid] = typeColor(type);

    section.innerHTML = `
      <div class="tempo-type-label" style="color:${solid}">${type}</div>
      <div class="chart-wrap"><canvas id="chart-tempo-${CSS.escape(type)}"></canvas></div>
    `;
    container.appendChild(section);

    const ctx = section.querySelector('canvas').getContext('2d');
    tempoCharts[type] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Max BPM',
          data,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} BPM` } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8888aa' } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: '#8888aa', callback: v => `${v}` } }
        }
      }
    });
  });
}

async function renderTempoLog() {
  const logs = await api('GET', '/api/exercise-logs?since=' + (() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return toLocalISO(d);
  })());
  const tbody = document.getElementById('tempo-log-body');
  tbody.innerHTML = '';
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px">No entries yet</td></tr>';
    return;
  }
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.date}</td>
      <td>${log.name}</td>
      <td>${log.type ? (() => { const [bg,,solid] = typeColor(log.type); return `<span class="ex-type-badge" style="background:${bg};border-color:${solid};color:#fff">${log.type}</span>`; })() : '—'}</td>
      <td><strong>${log.bpm}</strong></td>
      <td><button class="del-btn" data-id="${log.id}" title="Delete">✕</button></td>
    `;
    tr.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      await api('DELETE', `/api/exercise-logs/${log.id}`);
      await renderRecentTable();
      await renderTempoCharts();
      await renderTempoLog();
    });
    tbody.appendChild(tr);
  });
}

/* ── Exercise Management ── */
function renderExerciseList() {
  const list = document.getElementById('exercises-list');
  list.innerHTML = '';
  allExercises.forEach(ex => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${ex.name}${ex.type ? (() => { const [bg,,solid] = typeColor(ex.type); return `<span class="ex-type-badge" style="background:${bg};border-color:${solid};color:#fff">${ex.type}</span>`; })() : ''}</span>
      <span style="display:flex;gap:8px">
        <button class="del-btn edit-ex" data-id="${ex.id}" data-name="${ex.name}" data-type="${ex.type}" title="Edit">✎</button>
        <button class="del-btn" data-id="${ex.id}" title="Remove">✕</button>
      </span>
    `;
    li.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('edit-ex')) {
          openEditModal(parseInt(btn.dataset.id), btn.dataset.name, btn.dataset.type);
        } else {
          if (!confirm(`Delete "${ex.name}"? All its BPM logs will also be deleted.`)) return;
          await api('DELETE', `/api/exercises/${ex.id}`);
          allExercises = await api('GET', '/api/exercises');
          renderExerciseList();
          populateExerciseSelect();
          await renderTempoCharts();
          await renderTempoLog();
        }
      });
    });
    list.appendChild(li);
  });
}

document.getElementById('btn-add-exercise').addEventListener('click', addExercise);
document.getElementById('ex-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') addExercise(); });

async function addExercise() {
  const name = document.getElementById('ex-name-input').value.trim();
  const type = document.getElementById('ex-type-input').value.trim();
  if (!name) return;
  const result = await api('POST', '/api/exercises', { name, type });
  if (result.error) { alert(result.error); return; }
  document.getElementById('ex-name-input').value = '';
  document.getElementById('ex-type-input').value = '';
  allExercises = await api('GET', '/api/exercises');
  renderExerciseList();
  populateExerciseSelect();
}

function openEditModal(id, name, type) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Edit Exercise</h3>
      <input id="modal-name" type="text" value="${name}" maxlength="80" placeholder="Exercise name" />
      <input id="modal-type" type="text" value="${type}" maxlength="60" placeholder="Type (e.g. Scales)" />
      <div class="modal-actions">
        <button class="btn btn-purple" id="modal-save">Save</button>
        <button class="btn" style="background:var(--bg3);color:var(--text)" id="modal-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#modal-save').addEventListener('click', async () => {
    const newName = overlay.querySelector('#modal-name').value.trim();
    const newType = overlay.querySelector('#modal-type').value.trim();
    if (!newName) return;
    const result = await api('PUT', `/api/exercises/${id}`, { name: newName, type: newType });
    if (result.error) { alert(result.error); return; }
    overlay.remove();
    allExercises = await api('GET', '/api/exercises');
    renderExerciseList();
    populateExerciseSelect();
    await renderTempoCharts();
    await renderTempoLog();
  });
}

/* ── Boot ── */
async function init() {
  const [items, sessionsData] = await Promise.all([
    api('GET', '/api/items'),
    api('GET', '/api/sessions')   // no limit = full list for stats
  ]);
  allItems = items;
  allSessions = sessionsData.sessions;
  historyTotal = sessionsData.total;
  renderChecklist();
}

// Load Chart.js from CDN
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
script.onload = init;
document.head.appendChild(script);
