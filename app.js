import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// ==========================================
// 1. Firebase Firestore 初始化設定
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCbYyKk-r9bzUarelUkMXcEDofyB_BZWTc",
  authDomain: "bandmint-f7ab6.firebaseapp.com",
  databaseURL: "https://bandmint-f7ab6-default-rtdb.firebaseio.com",
  projectId: "bandmint-f7ab6",
  storageBucket: "bandmint-f7ab6.firebasestorage.app",
  messagingSenderId: "46339355176",
  appId: "1:46339355176:web:0b3d8dfe359d44dc957b1d",
  measurementId: "G-GHJ04475H9"
};

const COLLECTION_NAME = 'dalin_307_contacts';
const LOG_COLLECTION_NAME = 'dalin_307_logs';
const STORAGE_KEY = 'dalin_jhs_307_alumni_cache_v2';
const LOG_STORAGE_KEY = 'dalin_jhs_307_logs_cache_v1';

let db = null;
let isCloudConnected = false;
let lastSyncErrorMessage = '';

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (err) {
  console.error('Firebase 初始化失敗:', err);
  lastSyncErrorMessage = err.message || 'Firebase 初始化異常';
}

// 狀態樣式設定
const STATUS_STYLES = {
  '尚未聯繫': { badge: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400', order: 4 },
  '已聯繫':   { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500', order: 2 },
  '確定出席': { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', order: 1 },
  '不克出席': { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', order: 3 },
  '失聯中':   { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', order: 5 }
};

// 更新紀錄 Log 類型樣式
const LOG_TYPE_META = {
  'CREATE': { emoji: '✨', label: '新增成員', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  'UPDATE': { emoji: '✏️', label: '編輯資料', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  'STATUS': { emoji: '🔄', label: '狀態變更', badge: 'bg-sky-100 text-sky-800 border-sky-200' },
  'DELETE': { emoji: '🗑️', label: '刪除資料', badge: 'bg-rose-100 text-rose-800 border-rose-200' }
};

// LINE 品牌圖示向量 SVG（綠底白框黑字圓角方形 Logo）
function getLineBrandIconSVG(uniqueKey = 'card') {
  const gradId = `lineGreenGrad_${uniqueKey}`;
  return `
    <svg viewBox="0 0 100 100" class="line-brand-icon w-4 h-4 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#69F08D" />
          <stop offset="50%" stop-color="#28D36E" />
          <stop offset="100%" stop-color="#06C755" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#${gradId})" />
      <path d="M 85 46 C 85 30.5 69.3 18 50 18 C 30.7 18 15 30.5 15 46 C 15 59.8 27.3 71.4 43.9 73.6 C 45 73.8 46.5 74.3 46.9 75.3 C 47.2 76.1 47.1 77.4 47 78.2 L 46.5 81.2 C 46.3 82.2 45.7 84.9 49.8 83.2 C 53.9 81.5 71.8 70.2 79.8 60.9 C 83.4 56.8 85 51.7 85 46 Z" fill="#FFFFFF" stroke="#111111" stroke-width="5.5" stroke-linejoin="round" />
      <path d="M 27 38 V 55 H 36 M 42 38 V 55 M 49 55 V 38 L 60 55 V 38 M 73 38 H 66 V 55 H 73 M 66 46.5 H 72" fill="none" stroke="#111111" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// 應用程式狀態
let members = [];
let activityLogs = [];
let currentView = 'card'; // 'card' | 'table'
let groupFilter = 'ALL';  // 'ALL' | 'BOYS' | 'GIRLS' | 'OTHER'
let statusFilter = 'ALL'; // 'ALL' | 'HAS_CONTACT' | 'CONTACTED_ANY' | status string
let logFilter = 'ALL';    // 'ALL' | 'CREATE' | 'UPDATE' | 'STATUS' | 'DELETE'
let confirmCallback = null;

// ==========================================
// 2. 同步狀態 UI 更新與本機快取備援
// ==========================================
function setSyncStatus(state, customMsg = '') {
  const dot = document.getElementById('sync-status-dot');
  const text = document.getElementById('sync-status-text');
  const footerHint = document.getElementById('footer-sync-hint');

  if (!dot || !text) return;

  if (state === 'connected') {
    isCloudConnected = true;
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    text.textContent = customMsg || '🟢 Firestore 雲端即時同步中';
    if (footerHint) {
      footerHint.innerHTML = `<i data-lucide="cloud" class="w-4 h-4 text-emerald-600"></i><span>資料已與 Firebase Firestore 雲端資料庫即時同步</span>`;
      lucide.createIcons();
    }
  } else if (state === 'syncing') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
    text.textContent = customMsg || '🟡 寫入同步中...';
  } else if (state === 'error') {
    isCloudConnected = false;
    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    text.textContent = customMsg || '🔴 連線異常（請檢查 Firestore 權限規則）';
    if (footerHint) {
      footerHint.innerHTML = `<i data-lucide="hard-drive" class="w-4 h-4 text-amber-600"></i><span>目前處於本機快取備援模式</span>`;
      lucide.createIcons();
    }
  }
}

function showSyncDetails() {
  if (isCloudConnected) {
    showToast(`已連線至 Firebase Firestore (${COLLECTION_NAME})，共載入 ${members.length} 筆雲端資料！`);
  } else {
    showToast(`雲端同步暫時無法連線：${lastSyncErrorMessage || '請確認網路狀態或 Firestore 讀寫安全規則'}。`, 'error');
  }
}

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        members = parsed;
      }
    }
    const rawLogs = localStorage.getItem(LOG_STORAGE_KEY);
    if (rawLogs) {
      const parsedLogs = JSON.parse(rawLogs);
      if (Array.isArray(parsedLogs)) {
        activityLogs = parsedLogs;
      }
    }
  } catch (e) {
    console.error('讀取本機快取失敗:', e);
  }
}

function saveMembersToLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  } catch (e) {
    console.error('寫入本機快取失敗:', e);
  }
}

function saveLogsToLocalCache() {
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(activityLogs.slice(0, 200)));
  } catch (e) {
    console.error('寫入 Log 快取失敗:', e);
  }
}

function clearLocalCache() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOG_STORAGE_KEY);
  showToast('已清除本機快取，正在重新同步雲端資料...');
  location.reload();
}

// 啟動 Firestore 即時監聽 (通訊錄與更新紀錄 Log)
function initFirestoreSync() {
  loadLocalCache();
  updateLogBadge();
  renderMembers();

  if (!db) {
    setSyncStatus('error');
    return;
  }

  // 1. 監聽通訊錄集合
  const colRef = collection(db, COLLECTION_NAME);
  onSnapshot(
    colRef,
    (snapshot) => {
      const cloudList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const seatNum = Number(data.seat) || 0;
        cloudList.push({
          id: docSnap.id,
          seat: seatNum,
          name: data.name || '',
          gender: data.gender || (seatNum >= 1 && seatNum <= 25 ? '男' : seatNum >= 26 && seatNum <= 50 ? '女' : '師長/其他'),
          phone: data.phone || '',
          line: data.line || '',
          email: data.email || '',
          address: data.address || '',
          job: data.job || '',
          status: STATUS_STYLES[data.status] ? data.status : '尚未聯繫',
          notes: data.notes || '',
          updatedAt: data.updatedAt || 0
        });
      });

      members = cloudList;
      saveMembersToLocalCache();
      setSyncStatus('connected');
      renderMembers();
    },
    (error) => {
      console.error('Firestore onSnapshot 監聽錯誤:', error);
      lastSyncErrorMessage = error.code === 'permission-denied'
        ? 'Firestore 安全規則拒絕存取 (permission-denied)'
        : (error.message || '網路連線中斷');
      setSyncStatus('error');
      showToast('Firestore 雲端連線異常（請檢查權限規則），目前顯示本機快取資料。', 'error');
    }
  );

  // 2. 監聽更新紀錄 Log 集合（最新 150 筆）
  const logQuery = query(
    collection(db, LOG_COLLECTION_NAME),
    orderBy('timestamp', 'desc'),
    limit(150)
  );
  onSnapshot(
    logQuery,
    (snapshot) => {
      const cloudLogs = [];
      snapshot.forEach((docSnap) => {
        cloudLogs.push({ id: docSnap.id, ...docSnap.data() });
      });
      activityLogs = cloudLogs;
      saveLogsToLocalCache();
      updateLogBadge();
      const logModal = document.getElementById('log-modal');
      if (logModal && !logModal.classList.contains('hidden')) {
        renderLogs();
      }
    },
    (error) => {
      console.warn('Firestore Log 監聽提示:', error);
    }
  );
}

// ==========================================
// 3. 寫入與渲染更新紀錄 Log
// ==========================================
async function recordActivityLog(actionType, seat, name, summary, details = []) {
  const now = Date.now();
  const roleLabel = (seat >= 1 && seat <= 50) ? `${formatSeat(seat)}號` : `師長/編號${seat}`;
  const logEntry = {
    actionType, // 'CREATE' | 'UPDATE' | 'STATUS' | 'DELETE'
    seat: Number(seat) || 0,
    roleLabel,
    name: name || '未命名',
    summary,
    details,
    timestamp: now
  };

  // 先更新本機狀態與快取
  activityLogs.unshift({ id: `local_${now}`, ...logEntry });
  saveLogsToLocalCache();
  updateLogBadge();

  if (db) {
    try {
      await addDoc(collection(db, LOG_COLLECTION_NAME), logEntry);
    } catch (err) {
      console.warn('寫入雲端 Log 失敗（已保留於本機快取）:', err);
    }
  }
}

function updateLogBadge() {
  const badge = document.getElementById('log-count-badge');
  if (!badge) return;
  if (activityLogs.length > 0) {
    badge.textContent = activityLogs.length > 99 ? '99+' : activityLogs.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function formatDateTime(ts) {
  if (!ts) return '未知時間';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

function openLogModal() {
  const modal = document.getElementById('log-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  renderLogs();
  lucide.createIcons();
}

function closeLogModal() {
  const modal = document.getElementById('log-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function setLogFilter(type) {
  logFilter = type;
  document.querySelectorAll('.log-filter-pill').forEach(btn => {
    if (btn.dataset.logFilter === type) {
      btn.className = 'log-filter-pill px-2.5 py-1 rounded-lg text-xs font-medium bg-forest-800 text-white transition shrink-0';
    } else {
      btn.className = 'log-filter-pill px-2.5 py-1 rounded-lg text-xs font-medium bg-cream-200/70 text-gray-700 hover:bg-cream-200 transition shrink-0';
    }
  });
  renderLogs();
}

function renderLogs() {
  const container = document.getElementById('log-list-container');
  if (!container) return;

  const filtered = activityLogs.filter(log => {
    if (logFilter === 'ALL') return true;
    return log.actionType === logFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-10 text-center border border-cream-200">
        <div class="text-4xl mb-3">📭</div>
        <h3 class="text-base font-bold text-forest-900">目前尚無符合的更新紀錄</h3>
        <p class="text-xs text-gray-500 mt-1">當有任何同學或師長的資料被新增、編輯或變更狀態時，系統會自動記錄在此。</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(log => {
    const meta = LOG_TYPE_META[log.actionType] || LOG_TYPE_META['UPDATE'];
    const detailsList = Array.isArray(log.details) ? log.details : [];
    return `
      <div class="bg-white rounded-xl p-4 border border-cream-300/80 shadow-sm hover:border-amber-400/70 transition">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.badge}">
              <span>${meta.emoji}</span>
              <span>${meta.label}</span>
            </span>
            <span class="text-xs font-bold px-2 py-0.5 rounded-md bg-forest-800/10 text-forest-900">
              ${escapeHTML(log.roleLabel || '')}
            </span>
            <span class="font-serif font-bold text-base text-forest-900">
              ${escapeHTML(log.name || '')}
            </span>
          </div>
          <span class="text-xs text-gray-400 font-mono">
            🕒 ${formatDateTime(log.timestamp)}
          </span>
        </div>

        <p class="text-sm text-gray-700 mt-2 font-medium">
          ${escapeHTML(log.summary || '')}
        </p>

        ${detailsList.length > 0 ? `
          <ul class="mt-2.5 pt-2 border-t border-cream-200 space-y-1 text-xs text-gray-600">
            ${detailsList.map(item => `
              <li class="flex items-start gap-1.5">
                <span class="text-amber-600 font-bold">•</span>
                <span>${escapeHTML(item)}</span>
              </li>
            `).join('')}
          </ul>
        ` : ''}
      </div>
    `;
  }).join('');
}

function exportLogTxt() {
  if (activityLogs.length === 0) {
    showToast('目前尚無更新紀錄可匯出！', 'error');
    return;
  }
  const lines = [
    '====================================================',
    '大林國中三年七班 (85年畢) 同學與師長通訊錄 - 更新紀錄 Log',
    `匯出時間：${formatDateTime(Date.now())}（共 ${activityLogs.length} 筆紀錄）`,
    '====================================================',
    ''
  ];

  activityLogs.forEach((log, index) => {
    const meta = LOG_TYPE_META[log.actionType] || LOG_TYPE_META['UPDATE'];
    lines.push(`[${index + 1}] ${formatDateTime(log.timestamp)} | ${meta.emoji} ${meta.label} | ${log.roleLabel || ''} ${log.name || ''}`);
    lines.push(`    摘要：${log.summary || ''}`);
    if (Array.isArray(log.details) && log.details.length > 0) {
      log.details.forEach(d => lines.push(`      - ${d}`));
    }
    lines.push('');
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `大林國中三年七班_通訊錄更新紀錄Log_${today}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('已下載更新紀錄 Log 文字檔！');
}

// ==========================================
// 4. 統計數據更新與渲染
// ==========================================
function updateStatistics() {
  const total = members.length;
  const boysCount = members.filter(m => m.seat >= 1 && m.seat <= 25).length;
  const girlsCount = members.filter(m => m.seat >= 26 && m.seat <= 50).length;
  const othersCount = total - boysCount - girlsCount;

  const filledCount = members.filter(m =>
    (m.phone && m.phone.trim()) ||
    (m.line && m.line.trim()) ||
    (m.email && m.email.trim()) ||
    (m.address && m.address.trim())
  ).length;

  const contactedCount = members.filter(m =>
    ['已聯繫', '確定出席', '不克出席'].includes(m.status)
  ).length;

  const attendingCount = members.filter(m => m.status === '確定出席').length;

  const filledPct = total ? Math.round((filledCount / total) * 100) : 0;
  const contactedPct = total ? Math.round((contactedCount / total) * 100) : 0;
  const attendingPct = total ? Math.round((attendingCount / total) * 100) : 0;

  document.getElementById('stat-total').textContent = total;
  const splitEl = document.getElementById('stat-gender-split');
  if (splitEl) {
    splitEl.textContent = othersCount > 0
      ? `男 ${boysCount} / 女 ${girlsCount} / 師長 ${othersCount}`
      : `男 ${boysCount} / 女 ${girlsCount}`;
  }

  document.getElementById('stat-filled').textContent = filledCount;
  document.getElementById('stat-filled-pct').textContent = `${filledPct}%`;
  document.getElementById('bar-filled').style.width = `${filledPct}%`;

  document.getElementById('stat-contacted').textContent = contactedCount;
  document.getElementById('stat-contacted-pct').textContent = `${contactedPct}%`;
  document.getElementById('bar-contacted').style.width = `${contactedPct}%`;

  document.getElementById('stat-attending').textContent = attendingCount;
  document.getElementById('stat-attending-pct').textContent = `${attendingPct}%`;
  document.getElementById('bar-attending').style.width = `${attendingPct}%`;
}

// ==========================================
// 5. 篩選、排序與檢視切換
// ==========================================
function getFilteredAndSortedMembers() {
  const keyword = document.getElementById('search-input').value.trim().toLowerCase();
  const sortBy = document.getElementById('sort-select').value;

  const clearBtn = document.getElementById('clear-search-btn');
  if (keyword) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }

  let filtered = members.filter(m => {
    if (groupFilter === 'BOYS' && (m.seat < 1 || m.seat > 25)) return false;
    if (groupFilter === 'GIRLS' && (m.seat < 26 || m.seat > 50)) return false;
    if (groupFilter === 'OTHER' && (m.seat >= 1 && m.seat <= 50)) return false;

    if (statusFilter === 'HAS_CONTACT') {
      const hasInfo = (m.phone && m.phone.trim()) || (m.line && m.line.trim()) || (m.email && m.email.trim()) || (m.address && m.address.trim());
      if (!hasInfo) return false;
    } else if (statusFilter === 'CONTACTED_ANY') {
      if (!['已聯繫', '確定出席', '不克出席'].includes(m.status)) return false;
    } else if (statusFilter !== 'ALL') {
      if (m.status !== statusFilter) return false;
    }

    if (keyword) {
      const seatStr = String(m.seat).padStart(2, '0') + ' ' + String(m.seat);
      const searchable = [
        seatStr,
        m.name,
        m.phone,
        m.line,
        m.email,
        m.address,
        m.job,
        m.status,
        m.notes
      ].join(' ').toLowerCase();
      if (!searchable.includes(keyword)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'seat-asc') return a.seat - b.seat;
    if (sortBy === 'seat-desc') return b.seat - a.seat;
    if (sortBy === 'status') {
      const oa = STATUS_STYLES[a.status]?.order || 99;
      const ob = STATUS_STYLES[b.status]?.order || 99;
      return oa !== ob ? oa - ob : a.seat - b.seat;
    }
    if (sortBy === 'updated') {
      return (b.updatedAt || 0) - (a.updatedAt || 0) || (a.seat - b.seat);
    }
    return a.seat - b.seat;
  });

  return filtered;
}

function handleSearchAndFilter() {
  renderMembers();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  handleSearchAndFilter();
}

function setGroupFilter(group) {
  groupFilter = group;
  document.querySelectorAll('.group-pill').forEach(btn => {
    if (btn.dataset.group === group) {
      btn.className = 'group-pill px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-forest-800 text-white transition shrink-0';
    } else {
      btn.className = 'group-pill px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-cream-100 text-gray-700 hover:bg-cream-200 transition shrink-0';
    }
  });
  renderMembers();
}

function setStatusFilter(status) {
  statusFilter = status;
  document.querySelectorAll('.status-pill').forEach(btn => {
    if (btn.dataset.status === status) {
      btn.className = 'status-pill px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-amber-600 text-white transition shrink-0';
    } else {
      btn.className = 'status-pill px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-cream-100 text-gray-700 hover:bg-cream-200 transition shrink-0';
    }
  });
  renderMembers();
}

function quickFilter(type) {
  setGroupFilter('ALL');
  if (type === 'ALL') {
    setStatusFilter('ALL');
  } else if (type === 'HAS_CONTACT' || type === 'CONTACTED_ANY') {
    statusFilter = type;
    document.querySelectorAll('.status-pill').forEach(btn => {
      btn.className = 'status-pill px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-cream-100 text-gray-700 hover:bg-cream-200 transition shrink-0';
    });
    renderMembers();
  } else {
    setStatusFilter(type);
  }
}

function resetAllFilters() {
  document.getElementById('search-input').value = '';
  setGroupFilter('ALL');
  setStatusFilter('ALL');
}

function setViewMode(mode) {
  currentView = mode;
  const btnCard = document.getElementById('btn-view-card');
  const btnTable = document.getElementById('btn-view-table');
  const cardContainer = document.getElementById('card-view-container');
  const tableContainer = document.getElementById('table-view-container');

  if (mode === 'card') {
    btnCard.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-forest-800 text-white shadow-sm transition';
    btnTable.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-forest-900 transition';
    cardContainer.classList.remove('hidden');
    tableContainer.classList.add('hidden');
  } else {
    btnTable.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-forest-800 text-white shadow-sm transition';
    btnCard.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-forest-900 transition';
    tableContainer.classList.remove('hidden');
    cardContainer.classList.add('hidden');
  }
  renderMembers();
}

// ==========================================
// 6. 畫面渲染 (卡片 & 表格)
// ==========================================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSeat(seat) {
  return seat < 10 ? `0${seat}` : `${seat}`;
}

function renderMembers() {
  updateStatistics();
  const list = getFilteredAndSortedMembers();
  document.getElementById('visible-count').textContent = list.length;

  const filterLabel = document.getElementById('active-filter-label');
  if (statusFilter === 'HAS_CONTACT') {
    filterLabel.textContent = '（篩選：已填寫聯絡方式）';
  } else if (statusFilter === 'CONTACTED_ANY') {
    filterLabel.textContent = '（篩選：已取得聯繫）';
  } else if (statusFilter !== 'ALL') {
    filterLabel.textContent = `（篩選：${statusFilter}）`;
  } else {
    filterLabel.textContent = '';
  }

  const emptyState = document.getElementById('empty-state');
  const cardContainer = document.getElementById('card-view-container');
  const tableContainer = document.getElementById('table-view-container');

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    cardContainer.classList.add('hidden');
    tableContainer.classList.add('hidden');

    const titleEl = document.getElementById('empty-state-title');
    const descEl = document.getElementById('empty-state-desc');
    if (members.length === 0) {
      titleEl.textContent = 'Firestore 資料庫目前尚無名單資料';
      descEl.textContent = '請點擊「新增同學/師長」建立第一筆聯絡資料。';
    } else {
      titleEl.textContent = '找不到符合條件的同學資料';
      descEl.textContent = '請嘗試調整搜尋關鍵字或清除目前的篩選條件。';
    }
  } else {
    emptyState.classList.add('hidden');
    if (currentView === 'card') {
      cardContainer.classList.remove('hidden');
      tableContainer.classList.add('hidden');
      renderCards(list);
    } else {
      tableContainer.classList.remove('hidden');
      cardContainer.classList.add('hidden');
      renderTable(list);
    }
  }
  lucide.createIcons();
}

function renderCards(list) {
  const container = document.getElementById('card-view-container');
  container.innerHTML = list.map((m, idx) => {
    const st = STATUS_STYLES[m.status] || STATUS_STYLES['尚未聯繫'];
    const isBoy = m.seat >= 1 && m.seat <= 25;
    const isGirl = m.seat >= 26 && m.seat <= 50;
    const seatBg = isBoy
      ? 'bg-forest-800 text-cream-50'
      : isGirl
        ? 'bg-amber-600 text-white'
        : 'bg-purple-800 text-white';

    const hasPhone = m.phone && m.phone.trim();
    const hasLine = m.line && m.line.trim();
    const hasEmail = m.email && m.email.trim();
    const hasAddress = m.address && m.address.trim();
    const hasJob = m.job && m.job.trim();
    const hasNotes = m.notes && m.notes.trim();

    return `
      <article class="bg-white rounded-2xl border border-cream-300/90 card-shadow flex flex-col justify-between transition duration-200 hover:-translate-y-0.5 print-break-inside group">
        <div class="p-4 sm:p-5 pb-3">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl ${seatBg} flex flex-col items-center justify-center shrink-0 shadow-sm">
                <span class="text-[10px] opacity-80 leading-none">座號</span>
                <span class="text-base font-bold leading-tight mt-0.5">${formatSeat(m.seat)}</span>
              </div>
              <div>
                <h3 onclick="openEditModal('${m.id}')" class="font-serif text-lg sm:text-xl font-bold text-forest-900 cursor-pointer hover:text-amber-600 transition">
                  ${escapeHTML(m.name)}
                </h3>
                <div class="mt-1 inline-flex items-center">
                  <select
                    onchange="quickChangeStatus('${m.id}', this.value)"
                    aria-label="變更 ${escapeHTML(m.name)} 的聯絡狀態"
                    class="text-xs font-medium px-2.5 py-0.5 rounded-full border ${st.badge} cursor-pointer outline-none focus:ring-2 focus:ring-amber-400/50 transition"
                  >
                    ${Object.keys(STATUS_STYLES).map(s => `
                      <option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>
                    `).join('')}
                  </select>
                </div>
              </div>
            </div>

            <button
              onclick="openEditModal('${m.id}')"
              class="p-2 rounded-xl text-gray-400 hover:text-forest-800 hover:bg-cream-100 transition no-print"
              title="編輯詳細資料"
            >
              <i data-lucide="square-pen" class="w-4 h-4"></i>
            </button>
          </div>

          <div class="mt-4 space-y-2.5 text-sm">
            <div class="flex items-center justify-between gap-2 min-h-[24px]">
              <div class="flex items-center gap-2 text-gray-600 truncate">
                <i data-lucide="phone" class="w-4 h-4 text-forest-700 shrink-0"></i>
                ${hasPhone
                  ? `<a href="tel:${escapeHTML(m.phone)}" class="font-medium text-gray-800 hover:text-forest-700 hover:underline truncate">${escapeHTML(m.phone)}</a>`
                  : `<span class="text-gray-400 text-xs italic">尚未填寫電話</span>`
                }
              </div>
              ${hasPhone ? `
                <button onclick="copyText('${escapeHTML(m.phone)}', '電話號碼')" class="p-1 text-gray-400 hover:text-forest-800 rounded-md hover:bg-cream-100 shrink-0 no-print" title="複製電話">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>

            <div class="flex items-center justify-between gap-2 min-h-[24px]">
              <div class="flex items-center gap-2 text-gray-600 truncate">
                ${getLineBrandIconSVG(idx)}
                ${hasLine
                  ? `<span class="font-medium text-gray-800 truncate">${escapeHTML(m.line)}</span>`
                  : `<span class="text-gray-400 text-xs italic">尚未填寫 LINE</span>`
                }
              </div>
              ${hasLine ? `
                <button onclick="copyText('${escapeHTML(m.line)}', 'LINE ID')" class="p-1 text-gray-400 hover:text-emerald-700 rounded-md hover:bg-cream-100 shrink-0 no-print" title="複製 LINE ID">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>

            <div class="flex items-center gap-2 text-gray-600 min-h-[24px] truncate">
              <i data-lucide="mail" class="w-4 h-4 text-amber-600 shrink-0"></i>
              ${hasEmail
                ? `<a href="mailto:${escapeHTML(m.email)}" class="text-gray-700 hover:text-amber-700 hover:underline truncate text-xs sm:text-sm">${escapeHTML(m.email)}</a>`
                : `<span class="text-gray-400 text-xs italic">尚未填寫 Email</span>`
              }
            </div>

            <div class="flex items-center gap-2 text-gray-600 min-h-[24px] truncate">
              <i data-lucide="briefcase" class="w-4 h-4 text-sky-700 shrink-0"></i>
              ${hasJob
                ? `<span class="text-gray-700 truncate text-xs sm:text-sm">${escapeHTML(m.job)}</span>`
                : `<span class="text-gray-400 text-xs italic">尚未填寫職業/單位</span>`
              }
            </div>

            <div class="flex items-start gap-2 text-gray-600 min-h-[24px]">
              <i data-lucide="map-pin" class="w-4 h-4 text-rose-600 shrink-0 mt-0.5"></i>
              ${hasAddress
                ? `<span class="text-gray-700 text-xs sm:text-sm line-clamp-2">${escapeHTML(m.address)}</span>`
                : `<span class="text-gray-400 text-xs italic">尚未填寫現居地</span>`
              }
            </div>
          </div>

          ${hasNotes ? `
            <div class="mt-3 p-2.5 rounded-xl bg-cream-100/80 border border-cream-200 text-xs text-gray-700 leading-relaxed">
              <span class="font-semibold text-forest-800">備註：</span>${escapeHTML(m.notes)}
            </div>
          ` : ''}
        </div>

        <div class="px-4 py-2.5 bg-cream-50/80 border-t border-cream-200/80 rounded-b-2xl flex items-center justify-between no-print">
          <span class="text-[11px] text-gray-400">
            ${m.updatedAt ? '已同步雲端' : '點擊右側補充資料'}
          </span>
          <button
            onclick="openEditModal('${m.id}')"
            class="inline-flex items-center gap-1 text-xs font-semibold text-forest-800 hover:text-amber-600 transition"
          >
            <span>編輯完整資訊</span>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function renderTable(list) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = list.map(m => {
    const st = STATUS_STYLES[m.status] || STATUS_STYLES['尚未聯繫'];
    return `
      <tr class="hover:bg-cream-50 transition">
        <td class="py-3 px-3 sm:px-4 font-bold text-forest-900 whitespace-nowrap">${formatSeat(m.seat)}</td>
        <td class="py-3 px-3 sm:px-4 font-serif font-bold text-gray-900 whitespace-nowrap">${escapeHTML(m.name)}</td>
        <td class="py-3 px-3 sm:px-4 whitespace-nowrap">
          <select
            onchange="quickChangeStatus('${m.id}', this.value)"
            class="text-xs font-medium px-2.5 py-1 rounded-full border ${st.badge} cursor-pointer outline-none"
          >
            ${Object.keys(STATUS_STYLES).map(s => `
              <option value="${s}" ${m.status === s ? 'selected' : ''}>${s}</option>
            `).join('')}
          </select>
        </td>
        <td class="py-3 px-3 sm:px-4 whitespace-nowrap">
          ${m.phone ? `
            <div class="flex items-center gap-1.5">
              <a href="tel:${escapeHTML(m.phone)}" class="text-forest-800 hover:underline font-medium">${escapeHTML(m.phone)}</a>
              <button onclick="copyText('${escapeHTML(m.phone)}', '電話')" class="text-gray-400 hover:text-gray-700 no-print" title="複製">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          ` : '<span class="text-gray-300">-</span>'}
        </td>
        <td class="py-3 px-3 sm:px-4 whitespace-nowrap">
          ${m.line ? `
            <div class="flex items-center gap-1.5">
              <span>${escapeHTML(m.line)}</span>
              <button onclick="copyText('${escapeHTML(m.line)}', 'LINE ID')" class="text-gray-400 hover:text-gray-700 no-print" title="複製">
                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          ` : '<span class="text-gray-300">-</span>'}
        </td>
        <td class="py-3 px-3 sm:px-4 max-w-[200px] truncate" title="${escapeHTML(m.address)}">${escapeHTML(m.address) || '<span class="text-gray-300">-</span>'}</td>
        <td class="py-3 px-3 sm:px-4 max-w-[160px] truncate" title="${escapeHTML(m.job)}">${escapeHTML(m.job) || '<span class="text-gray-300">-</span>'}</td>
        <td class="py-3 px-3 sm:px-4 max-w-[220px] truncate text-xs text-gray-600" title="${escapeHTML(m.notes)}">${escapeHTML(m.notes) || '<span class="text-gray-300">-</span>'}</td>
        <td class="py-3 px-3 sm:px-4 text-right whitespace-nowrap no-print">
          <button onclick="openEditModal('${m.id}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cream-100 hover:bg-forest-800 hover:text-white text-forest-900 text-xs font-medium transition">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            <span>編輯</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 7. 編輯、新增、快速狀態變更與刪除 (同步寫入 Firestore 並記錄 Log)
// ==========================================
async function quickChangeStatus(id, newStatus) {
  const idx = members.findIndex(m => m.id === id);
  if (idx === -1) return;

  const target = members[idx];
  const oldStatus = target.status || '尚未聯繫';
  if (oldStatus === newStatus) return;

  const now = Date.now();
  members[idx].status = newStatus;
  members[idx].updatedAt = now;
  saveMembersToLocalCache();
  renderMembers();

  if (db) {
    setSyncStatus('syncing', '🟡 寫入同步中...');
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: now
      });
      await recordActivityLog(
        'STATUS',
        target.seat,
        target.name,
        `聯絡狀態由「${oldStatus}」更新為「${newStatus}」`,
        [`狀態：${oldStatus} → ${newStatus}`]
      );
      setSyncStatus('connected');
      showToast(`已雲端同步「${target.name}」狀態為「${newStatus}」`);
    } catch (err) {
      console.error('Firestore 快速更新狀態失敗:', err);
      lastSyncErrorMessage = err.message || '寫入失敗';
      setSyncStatus('error');
      showToast(`雲端同步失敗：${lastSyncErrorMessage}`, 'error');
    }
  }
}

function openEditModal(id) {
  const m = members.find(item => item.id === id);
  if (!m) return;

  document.getElementById('field-id').value = m.id;
  document.getElementById('field-seat').value = m.seat;
  document.getElementById('field-name').value = m.name;
  document.getElementById('field-status').value = m.status || '尚未聯繫';
  document.getElementById('field-phone').value = m.phone || '';
  document.getElementById('field-line').value = m.line || '';
  document.getElementById('field-email').value = m.email || '';
  document.getElementById('field-job').value = m.job || '';
  document.getElementById('field-address').value = m.address || '';
  document.getElementById('field-notes').value = m.notes || '';

  document.getElementById('modal-seat-badge').textContent = `${formatSeat(m.seat)} 號`;
  document.getElementById('modal-title').textContent = `編輯「${m.name}」聯絡資料`;
  document.getElementById('btn-delete-member').classList.remove('hidden');

  const modal = document.getElementById('edit-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  lucide.createIcons();
}

function openAddModal() {
  const maxSeat = members.reduce((max, m) => Math.max(max, m.seat), 50);
  document.getElementById('field-id').value = '';
  document.getElementById('field-seat').value = maxSeat + 1;
  document.getElementById('field-name').value = '';
  document.getElementById('field-status').value = '已聯繫';
  document.getElementById('field-phone').value = '';
  document.getElementById('field-line').value = '';
  document.getElementById('field-email').value = '';
  document.getElementById('field-job').value = '';
  document.getElementById('field-address').value = '';
  document.getElementById('field-notes').value = '';

  document.getElementById('modal-seat-badge').textContent = '新增成員';
  document.getElementById('modal-title').textContent = '新增同學或師長資料';
  document.getElementById('btn-delete-member').classList.add('hidden');

  const modal = document.getElementById('edit-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  lucide.createIcons();
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function computeMemberDiff(oldMember, newPayload) {
  const fieldLabels = {
    seat: '座號',
    name: '姓名',
    status: '聯絡狀態',
    phone: '電話',
    line: 'LINE ID',
    email: 'Email',
    job: '職業/單位',
    address: '現居地',
    notes: '備註/近況'
  };
  const changes = [];
  Object.keys(fieldLabels).forEach(key => {
    const prevVal = String(oldMember[key] ?? '').trim();
    const nextVal = String(newPayload[key] ?? '').trim();
    if (prevVal !== nextVal) {
      changes.push(`${fieldLabels[key]}：${prevVal || '（空）'} → ${nextVal || '（空）'}`);
    }
  });
  return changes;
}

async function saveMemberForm(event) {
  event.preventDefault();
  const existingId = document.getElementById('field-id').value;
  const seat = parseInt(document.getElementById('field-seat').value, 10) || 0;
  const name = document.getElementById('field-name').value.trim();
  const status = document.getElementById('field-status').value;
  const phone = document.getElementById('field-phone').value.trim();
  const line = document.getElementById('field-line').value.trim();
  const email = document.getElementById('field-email').value.trim();
  const job = document.getElementById('field-job').value.trim();
  const address = document.getElementById('field-address').value.trim();
  const notes = document.getElementById('field-notes').value.trim();

  if (!name) {
    showToast('請輸入姓名！', 'error');
    return;
  }

  const now = Date.now();
  const gender = (seat >= 1 && seat <= 25) ? '男' : (seat >= 26 && seat <= 50) ? '女' : '師長/其他';
  const seatPadded = formatSeat(seat);
  const docId = existingId || ((seat >= 1 && seat <= 50) ? `seat_${seatPadded}` : `member_${now}`);

  const payload = {
    seat,
    name,
    gender,
    status,
    phone,
    line,
    email,
    job,
    address,
    notes,
    updatedAt: now
  };

  let logType = 'CREATE';
  let logSummary = `新增成員資料（狀態：${status}）`;
  let logDetails = [];

  if (existingId) {
    const idx = members.findIndex(m => m.id === existingId);
    if (idx !== -1) {
      const oldMember = { ...members[idx] };
      logDetails = computeMemberDiff(oldMember, payload);
      logType = 'UPDATE';
      logSummary = logDetails.length > 0
        ? `更新了 ${logDetails.length} 項聯絡欄位資料`
        : '儲存了聯絡資料（欄位內容無變動）';
      members[idx] = { id: existingId, ...payload };
    }
  } else {
    if (phone) logDetails.push(`電話：${phone}`);
    if (line) logDetails.push(`LINE ID：${line}`);
    if (address) logDetails.push(`現居地：${address}`);
    if (job) logDetails.push(`職業/單位：${job}`);
    if (notes) logDetails.push(`備註：${notes}`);
    members.push({ id: docId, ...payload });
  }

  saveMembersToLocalCache();
  closeEditModal();
  renderMembers();

  if (db) {
    setSyncStatus('syncing', '🟡 寫入同步中...');
    try {
      const docRef = doc(db, COLLECTION_NAME, docId);
      await setDoc(docRef, payload, { merge: true });
      await recordActivityLog(logType, seat, name, logSummary, logDetails);
      setSyncStatus('connected');
      showToast(existingId ? `已雲端同步「${name}」的聯絡資料！` : `已新增「${name}」並同步至雲端！`);
    } catch (err) {
      console.error('Firestore 儲存失敗:', err);
      lastSyncErrorMessage = err.message || '寫入權限異常';
      setSyncStatus('error');
      showToast(`雲端同步失敗：${lastSyncErrorMessage}`, 'error');
    }
  }
}

function requestDeleteMember() {
  const id = document.getElementById('field-id').value;
  const m = members.find(item => item.id === id);
  if (!m) return;

  openConfirmModal(
    '刪除成員資料',
    `確定要將「${formatSeat(m.seat)}號 ${m.name}」從雲端通訊錄中移除嗎？此變更將同步至所有裝置。`,
    async () => {
      const deletedSnapshot = { ...m };
      members = members.filter(item => item.id !== id);
      saveMembersToLocalCache();
      closeEditModal();
      renderMembers();

      if (db) {
        setSyncStatus('syncing', '🟡 正在從雲端移除...');
        try {
          await deleteDoc(doc(db, COLLECTION_NAME, id));
          await recordActivityLog(
            'DELETE',
            deletedSnapshot.seat,
            deletedSnapshot.name,
            '從通訊錄中移除此筆成員資料',
            deletedSnapshot.status ? [`原狀態：${deletedSnapshot.status}`] : []
          );
          setSyncStatus('connected');
          showToast(`已從雲端移除「${deletedSnapshot.name}」的資料`);
        } catch (err) {
          console.error('Firestore 刪除失敗:', err);
          lastSyncErrorMessage = err.message || '刪除權限異常';
          setSyncStatus('error');
          showToast(`雲端同步失敗：${lastSyncErrorMessage}`, 'error');
        }
      }
    }
  );
}

// ==========================================
// 8. 匯出 Excel / CSV 試算表
// ==========================================
function openDataToolsModal() {
  const modal = document.getElementById('datatools-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  lucide.createIcons();
}

function closeDataToolsModal() {
  const modal = document.getElementById('datatools-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function exportCSV() {
  const sorted = [...members].sort((a, b) => a.seat - b.seat);
  const headers = ['座號', '姓名', '聯絡狀態', '聯絡電話/手機', 'LINE ID', '電子信箱', '現居縣市/地址', '職業/服務單位', '備註/近況'];
  const rows = sorted.map(m => [
    m.seat,
    m.name,
    m.status,
    m.phone || '',
    m.line || '',
    m.email || '',
    m.address || '',
    m.job || '',
    m.notes || ''
  ]);

  const csvContent = '\uFEFF' + [
    headers.join(','),
    ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `大林國中三年七班(85年畢)_同學通訊錄_${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('已下載 Excel 相容試算表檔案！');
}

function copyText(text, label = '內容') {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast(`已複製${label}到剪貼簿！`);
  } catch (err) {
    showToast('複製失敗，請手動選取複製', 'error');
  }
  document.body.removeChild(textarea);
}

// ==========================================
// 9. 自訂確認框與 Toast 提示元件
// ==========================================
function openConfirmModal(title, desc, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-desc').textContent = desc;
  confirmCallback = onConfirm;
  const modal = document.getElementById('confirm-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  lucide.createIcons();
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  confirmCallback = null;
}

document.getElementById('confirm-yes-btn').addEventListener('click', () => {
  if (typeof confirmCallback === 'function') {
    confirmCallback();
  }
  closeConfirmModal();
});

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-red-700 text-white' : 'bg-forest-900 text-cream-50 border border-amber-400/30';
  const iconName = type === 'error' ? 'alert-circle' : 'check-circle-2';
  const iconColor = type === 'error' ? 'text-red-200' : 'text-amber-300';

  toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium transition-all duration-300 translate-y-2 opacity-0 ${bgClass}`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor} shrink-0"></i>
    <span>${escapeHTML(message)}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// 點擊 Modal 背景關閉
['edit-modal', 'datatools-modal', 'log-modal', 'confirm-modal'].forEach(modalId => {
  document.getElementById(modalId).addEventListener('click', (e) => {
    if (e.target.id === modalId) {
      document.getElementById(modalId).classList.add('hidden');
      document.getElementById(modalId).classList.remove('flex');
    }
  });
});

// 註冊全域函式供 HTML 內嵌事件呼叫
window.openAddModal = openAddModal;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveMemberForm = saveMemberForm;
window.requestDeleteMember = requestDeleteMember;
window.quickChangeStatus = quickChangeStatus;
window.copyText = copyText;
window.openDataToolsModal = openDataToolsModal;
window.closeDataToolsModal = closeDataToolsModal;
window.exportCSV = exportCSV;
window.clearLocalCache = clearLocalCache;
window.quickFilter = quickFilter;
window.handleSearchAndFilter = handleSearchAndFilter;
window.clearSearch = clearSearch;
window.setViewMode = setViewMode;
window.setGroupFilter = setGroupFilter;
window.setStatusFilter = setStatusFilter;
window.resetAllFilters = resetAllFilters;
window.closeConfirmModal = closeConfirmModal;
window.showSyncDetails = showSyncDetails;
window.openLogModal = openLogModal;
window.closeLogModal = closeLogModal;
window.setLogFilter = setLogFilter;
window.exportLogTxt = exportLogTxt;

// 啟動 Firestore 雲端即時同步
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initFirestoreSync();
});