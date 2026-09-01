/* =========================================================
   LH Nail 美甲工作台 - 主逻辑 JS
   ========================================================= */

// 生产环境兜底：业务按钮异常时尽量留在当前页面，避免预览外壳直接白屏
try {
  window.addEventListener('error', function(e) {
    if (e && e.target && e.target !== window) return true;
    try { console.error('[LH Nail Runtime]', e.error || e.message || e); } catch(_) {}
    try { toast && toast('页面遇到一个小错误，数据已保留，请重新点一次或刷新', 'error', 4200); } catch(_) {}
  });
  window.addEventListener('unhandledrejection', function(e) {
    try { console.error('[LH Nail Promise]', e.reason || e); } catch(_) {}
    try { toast && toast('操作未完成，请刷新后再试', 'error', 4200); } catch(_) {}
  });
} catch(_) {}

// ============ 全局状态 ============
const State = {
  appVersion: '1.0.89',
  // 版本戳（跨设备同步用）
  __ver: { schema: 2, data: 0, ts: 0 },
  // 业务类型 nail/lash
  biz: 'nail',
  // 默认价格配置（美甲：款式/甲片/卸甲；美睫：款式/卸睫）
  prices: {
    style: [
      { key: 'nude', name: '裸色', price: 88, custom: false },
      { key: 'solid', name: '纯色', price: 68, custom: false },
      { key: 'cat', name: '猫眼', price: 128, custom: false },
      { key: 'custom', name: '🖼 图片款式', price: 0, custom: true }
    ],
    tip: [
      { key: 'self', name: '本甲', price: 0 },
      { key: 'hhalf', name: '高位半贴', price: 80 },
      { key: 'jiamo', name: '甲膜', price: 30 },
      { key: 'half', name: '半贴', price: 60 },
      { key: 'shallow', name: '浅贴', price: 50 }
    ],
    removeNail: [
      { key: 'rn_self', name: '卸本甲', price: 20 },
      { key: 'rn_tip', name: '卸甲片', price: 30 },
      { key: 'rn_hard', name: '特别难卸除', price: 40 }
    ],
    lash: [
      { key: 'yy', name: 'YY 三叶草', price: 168 },
      { key: 'baby', name: '单根婴儿弯', price: 198 },
      { key: 'fairy', name: '仙子款穿插', price: 238 },
      { key: 'sun', name: '太阳花穿插', price: 218 },
      { key: 'miniComic', name: '小漫画', price: 258 },
      { key: 'bigComic', name: '大漫画狐兔系', price: 298 },
      { key: 'lower', name: '下睫毛', price: 68 }
    ],
    removeLash: [
      { key: 'rl_std', name: '卸睫毛', price: 20 }
    ]
  },
  // 会员折扣配置
  memberDiscounts: {
    '': { name: '非会员', discount: 1.00 },
    gold: { name: '黄金会员', discount: 0.95 },
    platinum: { name: '铂金会员', discount: 0.90 },
    diamond: { name: '钻石会员', discount: 0.85 }
  },
  // 当前选中
  selected: { style: null, tip: null, removeNail: null, lash: null, removeLash: null, customPrice: 0, manualPrices: {}, manualTouched: {} },
  // 上传的参考图
  refImages: [],
  // 图片仓：业务记录只保存图片 id，兼容旧版 dataURL 直接显示
  images: [],
  // 预约列表：正式使用默认空白，不再内置模拟预约
  appointments: [],
  // 背景图
  bgImages: { banner: null, sidebar: null },
  // 自定义文案
  customText: {},
  // 编辑中ID
  editingId: null
};

// ============ 工具函数 ============
function localDateStr(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function localDateTimeStr(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${localDateStr(d)}T${h}:${mi}`;
}
function getToday(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return localDateTimeStr(d);
}
function getTomorrow(h, m) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return localDateTimeStr(d);
}
function fmtDate(iso) {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { m, day, h, mi, full: `${d.getMonth() + 1}月${d.getDate()}日 ${h}:${mi}` };
}
function fmtMoney(n) {
  return '¥ ' + Number(n).toFixed(2);
}
function defaultApptDurationMinutes(biz) {
  return biz === 'lash' ? 90 : 120;
}
function durationMinutesToHoursValue(minutes, biz) {
  const mins = Number(minutes) > 0 ? Number(minutes) : defaultApptDurationMinutes(biz);
  const h = mins / 60;
  return String(Math.round(h * 100) / 100);
}
function durationHoursInputToMinutes(value, biz) {
  const h = Number(value);
  const safeHours = Number.isFinite(h) && h > 0 ? h : defaultApptDurationMinutes(biz) / 60;
  return Math.max(15, Math.round(safeHours * 60));
}
function formatApptDurationHours(a) {
  const mins = getApptDuration(a);
  const h = Math.round((mins / 60) * 100) / 100;
  return `${h}小时`;
}
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function setLocalStorageStrict(storageKey, raw) {
  const ret = localStorage.setItem(storageKey, raw);
  if (ret === false) throw new Error('localStorage 写入失败');
  const got = localStorage.getItem(storageKey);
  if (got !== raw) throw new Error('localStorage 写入后校验失败');
  return true;
}
function verifyLocalCollectionHas(key, id) {
  try {
    const raw = localStorage.getItem('lhn_' + key);
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) && list.some(x => x && x.id === id && !x._deleted && !x.deletedAt);
  } catch(e) { return false; }
}
function save(key, val) {
  try { val = normalizeCoreCollection(key, val); } catch (e) {}
  let localOk = true;
  let raw = '';
  try {
    raw = JSON.stringify(val);
    setLocalStorageStrict('lhn_' + key, raw);
  } catch (e) {
    localOk = false;
    try {
      if (['appointments','customers','memberTxns','manualIncomes','expenses','auditLogs'].includes(key)) {
        // 本地空间满时，优先释放图片缓存，保证预约/会员/账目等核心文字数据不丢
        localStorage.removeItem('lhn_images');
        setLocalStorageStrict('lhn_' + key, raw || JSON.stringify(val));
        localOk = true;
      }
    } catch (e2) {
      try {
        localStorage.setItem('lhn_last_save_error', JSON.stringify({
          key,
          at: new Date().toISOString(),
          message: e2.message || e.message || String(e2 || e)
        }));
      } catch(_) {}
    }
  }
  if (window.__LH_SILENT_SAVE) return localOk;
  // 【☁️ Supabase 云端同步】启用配置后，每次保存都会异步推送到 Supabase
  // ⚠️ 安全保护：首次从云端拉取完成前不推送，防止新设备空数据覆盖云端
  try {
    if (window.SupabaseSync && window.SupabaseSync.pushKey) {
      if (SupabaseRuntime.cloudPulledOnce || !isSupabaseReady()) {
        window.SupabaseSync.pushKey(key, val);
      }
    }
  } catch (e) {}
  // 【📡 跨标签页实时同步】版本戳自增 + BroadcastChannel 广播 + storage事件双重保险
  try {
    if (key !== '__ver') {
      if (!State.__ver) State.__ver = { schema: 2, data: 0, ts: 0 };
      State.__ver.data += 1;
      State.__ver.ts = Date.now();
      try { localStorage.setItem('lhn___ver', JSON.stringify(State.__ver)); } catch (e) {}
    }
    if (window.__BC && window.__BC_SENDER_ID) {
      try {
        window.__BC.postMessage({
          type: 'state-changed',
          key: key,
          ver: State.__ver,
          sender: window.__BC_SENDER_ID
        });
      } catch (e) {}
    }
  } catch (e) {}
  return localOk;
}
function load(key, def) {
  // 【☁️ Supabase 云端同步】加载时：先取本地，再由 Supabase 合并保护逻辑处理
  let local = def;
  try {
    const v = localStorage.getItem('lhn_' + key);
    if (v) local = JSON.parse(v);
  } catch (e) { local = def; }
  try {
    if (Array.isArray(local) && Array.isArray(def) && typeof mergeSupabaseBlock === 'function') {
      local = mergeSupabaseBlock(key, local, def);
    }
  } catch(e) {}
  return local;
}
const CORE_RECORD_KEYS = ['appointments','customers','memberTxns','manualIncomes','expenses','users','images'];
function getDeviceId() {
  try {
    let id = localStorage.getItem('lhn_device_id');
    if (!id) {
      id = 'DEV-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('lhn_device_id', id);
    }
    return id;
  } catch(e) { return 'DEV-local'; }
}
function _nowIso() { return new Date().toISOString(); }
function currentUserName() { return State.currentUser?.username || 'system'; }
function normalizeRecordMeta(rec, key, now) {
  if (!rec || typeof rec !== 'object') return rec;
  const t = now || _nowIso();
  if (!rec.id) rec.id = genId(({appointments:'A', customers:'C', memberTxns:'T', manualIncomes:'MAN', expenses:'EXP', users:'U', images:'IMG'}[key]) || 'ID');
  if (!rec.createdAt) rec.createdAt = t;
  if (!rec.updatedAt) rec.updatedAt = rec.createdAt || t;
  if (rec.deletedAt == null) rec.deletedAt = '';
  if (!rec.createdBy) rec.createdBy = currentUserName();
  if (!rec.updatedBy) rec.updatedBy = rec.createdBy || currentUserName();
  if (!rec.deviceId) rec.deviceId = getDeviceId();
  if (!rec.syncVersion) rec.syncVersion = 1;
  if (rec._deleted == null) rec._deleted = false;
  return rec;
}
function normalizeCoreCollection(key, val) {
  if (!CORE_RECORD_KEYS.includes(key) || !Array.isArray(val)) return val;
  const now = _nowIso();
  val.forEach(x => normalizeRecordMeta(x, key, now));
  return val;
}
function touchRecord(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  normalizeRecordMeta(rec, '', _nowIso());
  rec.updatedAt = _nowIso();
  rec.updatedBy = currentUserName();
  rec.deviceId = rec.deviceId || getDeviceId();
  rec.syncVersion = (Number(rec.syncVersion) || 1) + 1;
  return rec;
}
function createRecordMeta(prefix) {
  const t = _nowIso();
  return {
    id: genId(prefix || 'ID'),
    createdAt: t,
    updatedAt: t,
    deletedAt: '',
    createdBy: currentUserName(),
    updatedBy: currentUserName(),
    deviceId: getDeviceId(),
    syncVersion: 1,
    _deleted: false
  };
}
function activeRows(arr) {
  return (Array.isArray(arr) ? arr : []).filter(x => x && !x._deleted && !x.deletedAt);
}
function softDeleteRecord(rec, reason) {
  if (!rec) return false;
  const t = _nowIso();
  rec._deleted = true;
  rec._deletedAt = t;
  rec._deletedBy = currentUserName();
  rec._deleteReason = reason || '手动删除';
  rec.deletedAt = t;
  rec.updatedAt = t;
  rec.updatedBy = currentUserName();
  rec.syncVersion = (Number(rec.syncVersion) || 1) + 1;
  return true;
}
function toast(msg, type = '', durationMs) {
  const t = document.getElementById('toast');
  if (!t) return;
  if (t.__timer) { clearTimeout(t.__timer); t.__timer = null; }
  t.textContent = msg;
  t.style.background = type === 'error' ? '#D98C8C' : type === 'success' ? '#7BA17C' : 'var(--ink)';
  t.classList.add('show');
  const dur = typeof durationMs === 'number' && durationMs > 0 ? durationMs : 2200;
  t.__timer = setTimeout(() => t.classList.remove('show'), dur);
}
// 轻量 toast（用于 15s 轮询静默同步提示）
function silentToast(msg) {
  try {
    const oldBg = document.getElementById('toast')?.style?.background;
    toast(msg, 'success', 1800);
  } catch(_) {}
}
// -------- Cookie 辅助 --------
function setCookie(name, value, maxAgeSec) {
  try {
    const parts = [encodeURIComponent(name) + '=' + encodeURIComponent(value)];
    if (typeof maxAgeSec === 'number') parts.push('max-age=' + maxAgeSec);
    parts.push('path=/');
    parts.push('SameSite=Lax');
    document.cookie = parts.join('; ');
    return true;
  } catch(e) { return false; }
}
function getCookie(name) {
  try {
    const k = encodeURIComponent(name) + '=';
    const arr = ('; ' + document.cookie).split('; ');
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      if (s.indexOf(k) === 0) return decodeURIComponent(s.slice(k.length));
    }
  } catch(e) {}
  return null;
}
function delCookie(name) {
  try {
    document.cookie = encodeURIComponent(name) + '=; path=/; max-age=0; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  } catch(e) {}
}
// -------- 30 天记住登录：localStorage + cookie 双写
function persistSession(session) {
  try {
    const sess = session || null;
    localStorage.setItem('lhn_lh_session', JSON.stringify(sess));
    localStorage.setItem('lh_session', JSON.stringify(sess));
    if (sess && sess.expire) {
      const maxAge = Math.max(0, Math.floor((Number(sess.expire) - Date.now()) / 1000));
      setCookie('lh_remember', '1', maxAge);
      setCookie('lh_uname', String(sess.uname || ''), maxAge);
    } else {
      delCookie('lh_remember'); delCookie('lh_uname');
    }
  } catch(e) {}
}
function loadSession() {
  try {
    let s = null;
    try {
      const raw = localStorage.getItem('lhn_lh_session') || localStorage.getItem('lh_session');
      if (raw) s = JSON.parse(raw);
    } catch(e) { s = null; }
    if (!s && getCookie('lh_remember') === '1') {
      // cookie 兜底：尝试用 cookie 里 uname 再从 localStorage 查一次
      try {
        const raw2 = localStorage.getItem('lhn_lh_session') || localStorage.getItem('lh_session');
        if (raw2) s = JSON.parse(raw2);
      } catch(_) {}
    }
    if (s && s.expire && Number(s.expire) > Date.now()) return s;
    return null;
  } catch(e) { return null; }
}
function clearSession() {
  try { localStorage.removeItem('lhn_lh_session'); localStorage.removeItem('lh_session'); } catch(e) {}
  delCookie('lh_remember'); delCookie('lh_uname');
}
// -------- 轻量哈希（用于 sync 数据指纹）--------
function lightHash(obj) {
  try {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8) + '_' + s.length;
  } catch(e) { return 'h_' + Date.now(); }
}
// -------- 同步引擎：saveStateAll / loadStateAll / 15s 轮询 / storage 事件 + PIN 云同步 --------
const SYNC_STATE_KEYS = [
  'prices','appointments','customers','memberTxns','manualIncomes','expenses','images',
  'calColors','settings','users','bgImages','customText','colorTypes','auditLogs'
];
// 内存中记录的上次同步指纹 + 开关
const SyncRuntime = {
  autoSyncOn: true,
  lastTs: 0,
  lastHash: '',
  pollingTimer: null,
  lastImportInput: null,
  importing: false
};

// -------- Supabase 云端同步适配层 --------
const SupabaseRuntime = {
  client: null,
  pulling: false,
  lastPullAt: 0,
  lastPushAt: 0,
  lastError: '',
  cloudPulledOnce: false  // 首次从云端拉取完成标志，未完成前阻止推送，防止空数据覆盖云端
};
function getSupabaseConfig() {
  const c = window.LH_SUPABASE_CONFIG || {};
  return {
    enabled: !!c.enabled,
    url: String(c.url || '').trim(),
    anonKey: String(c.anonKey || '').trim(),
    workspaceId: String(c.workspaceId || 'lh-nail-main').trim() || 'lh-nail-main',
    table: String(c.table || 'lh_nail_sync').trim() || 'lh_nail_sync'
  };
}
function isSupabaseReady() {
  const c = getSupabaseConfig();
  return !!(c.enabled && c.url && c.anonKey && window.supabase && window.supabase.createClient);
}
function getSupabaseClient() {
  if (!isSupabaseReady()) return null;
  if (SupabaseRuntime.client) return SupabaseRuntime.client;
  const c = getSupabaseConfig();
  SupabaseRuntime.client = window.supabase.createClient(c.url, c.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return SupabaseRuntime.client;
}
function _blockTime(x) {
  const v = x?.updatedAt || x?.createdAt || x?.lastLogin || x?.datetime || x?.date || 0;
  if (typeof v === 'number') return v;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : 0;
}
function _configBlockTime(x) {
  if (!x || typeof x !== 'object') return 0;
  const v = x.__updatedAt || x.updatedAt || x._updatedAt || 0;
  if (typeof v === 'number') return v;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : 0;
}
function _arrayConfigBlockTime(arr) {
  if (!Array.isArray(arr)) return 0;
  let t = _configBlockTime(arr);
  arr.forEach(x => { t = Math.max(t, _blockTime(x)); });
  return t;
}
function _plainPriceSnapshot(x) {
  const out = {};
  try {
    PRICE_GROUP_ORDER.forEach(g => {
      out[g] = (Array.isArray(x?.[g]) ? x[g] : []).map(p => ({
        key: p?.key || '',
        name: p?.name || '',
        price: Number(p?.price) || 0,
        custom: !!p?.custom
      }));
    });
  } catch(e) {}
  return out;
}
function _isDefaultPriceConfig(x) {
  try {
    return JSON.stringify(_plainPriceSnapshot(x)) === JSON.stringify(_plainPriceSnapshot(DEFAULT_PRICES));
  } catch(e) { return false; }
}
function mergeSupabaseBlock(key, localVal, remoteVal) {
  if (remoteVal === undefined || remoteVal === null) return localVal;
  if (localVal === undefined || localVal === null) return remoteVal;
  if (key === 'colorTypes' && Array.isArray(localVal) && Array.isArray(remoteVal)) {
    const lt = _arrayConfigBlockTime(localVal);
    const rt = _arrayConfigBlockTime(remoteVal);
    if (lt || rt) return lt >= rt ? localVal : remoteVal;
  }
  if (Array.isArray(localVal) && Array.isArray(remoteVal)) {
    const map = new Map();
    const isDeleted = (item) => !!(item && (item._deleted || item.deletedAt));
    const isManualDelete = (item) => {
      if (!item) return false;
      const reason = item._deleteReason || item._deletedReason || '';
      return reason.indexOf('手动删除顾客档案') >= 0 || reason.indexOf('手动删除') >= 0;
    };
    const put = (item) => {
      if (!item) return;
      const id = item.id || JSON.stringify(item);
      const old = map.get(id);
      if (!old) { map.set(id, item); return; }
      // 🛡️ 关键修复：优先保留活跃记录，防止被旧代码软删除的版本覆盖活跃版本
      // 除非删除原因是用户手动删除（这种删除应该被尊重）
      const oldDeleted = isDeleted(old);
      const newDeleted = isDeleted(item);
      if (!newDeleted && oldDeleted && !isManualDelete(old)) {
        // 新版本是活跃的，旧版本是被自动删除的 → 用活跃版本替换
        map.set(id, item);
        return;
      }
      if (newDeleted && !oldDeleted && !isManualDelete(item)) {
        // 新版本是被自动删除的，旧版本是活跃的 → 保留活跃版本
        return;
      }
      // 两者状态相同（都活跃或都删除），或涉及手动删除 → 按时间戳决定
      if (_blockTime(item) >= _blockTime(old)) map.set(id, item);
    };
    remoteVal.forEach(put);
    localVal.forEach(put);
    return Array.from(map.values());
  }
  if (typeof localVal === 'object' && typeof remoteVal === 'object') {
    // 定价配置必须按“更新时间较新者”合并，避免重新登录时旧云端价格覆盖本机已保存的新价格
    if (key === 'prices') {
      const lt = _configBlockTime(localVal);
      const rt = _configBlockTime(remoteVal);
      if (lt || rt) return lt >= rt ? localVal : remoteVal;
      const localDefault = _isDefaultPriceConfig(localVal);
      const remoteDefault = _isDefaultPriceConfig(remoteVal);
      if (localDefault !== remoteDefault) return localDefault ? remoteVal : localVal;
      return localVal || remoteVal;
    }
    if (key === 'calColors') {
      const lt = _configBlockTime(localVal);
      const rt = _configBlockTime(remoteVal);
      if (lt || rt) return lt >= rt ? localVal : remoteVal;
    }
    return remoteVal;
  }
  return localVal !== undefined ? localVal : remoteVal;
}
function _setStateBlock(key, val) {
  try { State[key] = normalizeCoreCollection(key, val); } catch(e) { State[key] = val; }
  try { localStorage.setItem('lhn_' + key, JSON.stringify(State[key])); } catch(e) {}
}
window.SupabaseSync = {
  isReady: isSupabaseReady,
  async pushKey(key, val) {
    if (!SYNC_STATE_KEYS.includes(key)) return false;
    const c = getSupabaseConfig();
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      // ⚠️ 空数据保护：如果是空数组且云端已有数据，先拉取云端合并后再推送
      let dataToPush = val;
      const CORE_DATA_KEYS = ['appointments','customers','memberTxns','manualIncomes','expenses','images'];
      if (CORE_DATA_KEYS.includes(key) && Array.isArray(val) && val.length === 0) {
        try {
          const { data: cloudRow } = await client.from(c.table)
            .select('data')
            .eq('workspace_id', c.workspaceId)
            .eq('data_key', key)
            .single();
          if (cloudRow && cloudRow.data && Array.isArray(cloudRow.data) && cloudRow.data.length > 0) {
            // 云端有数据，本地为空 → 合并后推送（保留云端数据）
            dataToPush = mergeSupabaseBlock(key, val, cloudRow.data);
          }
        } catch(e) {
          // 🛡️ 关键修复：云端查询失败时，绝不推送空数据覆盖云端
          console.warn('[pushKey] 云端查询失败，跳过空数据推送以保护云端数据:', key, e.message);
          return false;
        }
      }
      const payload = {
        workspace_id: c.workspaceId,
        data_key: key,
        data: dataToPush == null ? {} : dataToPush,
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from(c.table).upsert(payload, { onConflict: 'workspace_id,data_key' });
      if (error) throw error;
      SupabaseRuntime.lastPushAt = Date.now();
      SupabaseRuntime.lastError = '';
      try { localStorage.setItem('lhn_supabase_last_push', String(SupabaseRuntime.lastPushAt)); } catch(e) {}
      return true;
    } catch(e) {
      SupabaseRuntime.lastError = e.message || String(e);
      try { console.warn('[SupabaseSync push]', SupabaseRuntime.lastError); } catch(_) {}
      return false;
    }
  },
  async pushAll() {
    const client = getSupabaseClient();
    if (!client) return false;
    // ⚠️ 安全保护：首次拉取完成前不推送全量数据
    if (!SupabaseRuntime.cloudPulledOnce && isSupabaseReady()) {
      try { console.warn('[SupabaseSync] pushAll 被阻止：首次云端拉取尚未完成'); } catch(_) {}
      return false;
    }
    for (const k of SYNC_STATE_KEYS) {
      if (State[k] !== undefined) await this.pushKey(k, State[k]);
    }
    return true;
  },
  async pullAll(options) {
    const client = getSupabaseClient();
    if (!client || SupabaseRuntime.pulling) return false;
    SupabaseRuntime.pulling = true;
    try {
      const c = getSupabaseConfig();
      let changed = false;
      // 🔥 全局清空标记检测：云端若存在一次比本地更新的「清空全部数据」标记，
      // 则强制清空本地业务数据（所有设备打开即自动清空，杜绝旧数据复活）
      try {
        const metaRes = await client.from(c.table)
          .select('data_key,data')
          .eq('workspace_id', c.workspaceId)
          .eq('data_key', 'syncMeta')
          .limit(1);
        const metaRow = (metaRes && metaRes.data && metaRes.data[0]) || null;
        if (metaRow) {
          const raw = metaRow.data;
          const meta = (typeof raw === 'string') ? JSON.parse(raw) : (raw || {});
          const clearAt = Number(meta && meta.clearAt) || 0;
          let seen = 0;
          try { seen = Number(localStorage.getItem('lhn_clear_seen') || 0); } catch(e){}
          if (clearAt > seen) {
            // 云端标记比本地新 → 强制清空本地业务数据
            CLEAR_DATA_KEYS.forEach(k => {
              try { localStorage.removeItem('lhn_' + k); } catch(e){}
              try { localStorage.removeItem(k); } catch(e){}
              if (Array.isArray(State[k])) State[k] = [];
            });
            try { localStorage.setItem('lhn_clear_seen', String(clearAt)); } catch(e){}
            // 回写云端空数据，确保闭环
            try { await this.pushAll(); } catch(e){}
            changed = true;
          }
        }
      } catch(e) {}
      const { data, error } = await client
        .from(c.table)
        .select('data_key,data,updated_at')
        .eq('workspace_id', c.workspaceId)
        .in('data_key', SYNC_STATE_KEYS);
      if (error) throw error;
      let needCloudSync = false; // 合并结果与云端不一致（本地删除/新增）时回写云端，形成同步闭环
      (data || []).forEach(row => {
        const key = row.data_key;
        if (!SYNC_STATE_KEYS.includes(key)) return;
        let localVal = State[key];
        try {
          const raw = localStorage.getItem('lhn_' + key);
          if (raw != null) localVal = JSON.parse(raw);
        } catch(e) {}
        const merged = mergeSupabaseBlock(key, localVal, row.data);
        if (JSON.stringify(merged) !== JSON.stringify(localVal)) {
          _setStateBlock(key, merged);
          changed = true;
        }
        // 只要合并结果与云端不一致（例如本地手动删除了一条云端仍活跃的记录、或本地新增了记录），
        // 就标记需要回写云端，避免“删除被旧设备/旧云端数据复活”的问题。
        if (JSON.stringify(merged) !== JSON.stringify(row.data)) {
          needCloudSync = true;
        }
      });
      try {
        if (restorePriceConfigIfReset()) {
          changed = true;
          await this.pushKey('prices', State.prices);
        }
      } catch(e) {}
      SupabaseRuntime.lastPullAt = Date.now();
      SupabaseRuntime.lastError = '';
      SupabaseRuntime.cloudPulledOnce = true;  // 标记首次拉取完成，允许后续推送
      try {
        localStorage.setItem('lhn_supabase_last_pull', String(SupabaseRuntime.lastPullAt));
        localStorage.setItem('lhn_lh_sync_ts', String(SupabaseRuntime.lastPullAt));
        localStorage.setItem('lh_sync_ts', String(SupabaseRuntime.lastPullAt));
      } catch(e) {}
      // 合并结果与云端不一致时回写云端，确保删除/新增在云端闭环
      if (needCloudSync) {
        try { await this.pushAll(); } catch(e) {}
      }
      if (changed && !(options && options.noRefresh)) refreshAllAfterSync();
      return changed;
    } catch(e) {
      SupabaseRuntime.lastError = e.message || String(e);
      try { console.warn('[SupabaseSync pull]', SupabaseRuntime.lastError); } catch(_) {}
      return false;
    } finally {
      SupabaseRuntime.pulling = false;
    }
  },
  getStatus() {
    return {
      ready: isSupabaseReady(),
      lastPullAt: SupabaseRuntime.lastPullAt || Number(localStorage.getItem('lhn_supabase_last_pull') || 0),
      lastPushAt: SupabaseRuntime.lastPushAt || Number(localStorage.getItem('lhn_supabase_last_push') || 0),
      lastError: SupabaseRuntime.lastError
    };
  }
};
function saveStateAll(extra) {
  // 🛡️ 关键保护：云端拉取完成前，不保存空的核心数据到 localStorage，防止覆盖已有数据
  const CORE_DATA_KEYS = ['appointments','customers','memberTxns','manualIncomes','expenses','images'];
  try {
    SYNC_STATE_KEYS.forEach(k => {
      if (State[k] !== undefined) {
        // 如果是核心数据且为空数组，检查 localStorage 是否已有数据
        if (CORE_DATA_KEYS.includes(k) && Array.isArray(State[k]) && State[k].length === 0) {
          try {
            const existing = localStorage.getItem('lhn_' + k);
            if (existing) {
              const parsed = JSON.parse(existing);
              if (Array.isArray(parsed) && parsed.length > 0) {
                // localStorage 已有数据，不要用空数据覆盖
                State[k] = parsed;
              }
            }
          } catch(_) {}
        }
        save(k, State[k]);
      }
    });
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(k => save(k, extra[k]));
    }
  } catch(e) {}
  if (!SyncRuntime.autoSyncOn) return;
  try {
    const snapshot = {};
    SYNC_STATE_KEYS.forEach(k => { snapshot[k] = State[k]; });
    const ts = Date.now();
    const hs = lightHash(snapshot);
    SyncRuntime.lastTs = ts;
    SyncRuntime.lastHash = hs;
    try {
      localStorage.setItem('lhn_lh_sync_ts', String(ts));
      localStorage.setItem('lh_sync_ts', String(ts));
      localStorage.setItem('lhn_lh_sync_hash', hs);
      localStorage.setItem('lh_sync_hash', hs);
    } catch(_) {}
  } catch(e) {}
}
async function persistKeysToCloud(keys, reason) {
  const list = Array.isArray(keys) ? keys : [];
  let ok = true;
  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise(resolve => setTimeout(() => resolve(false), ms))
  ]);
  try { saveStateAll(); } catch(e) {}
  const supabaseConfigured = !!(window.LH_SUPABASE_CONFIG && window.LH_SUPABASE_CONFIG.enabled);
  const supabaseReady = !!(window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady());
  if (supabaseConfigured && !supabaseReady) ok = false;
  if (supabaseReady) {
    // ⚠️ 安全保护：首次拉取完成前不推送，防止新设备空数据覆盖云端
    if (!SupabaseRuntime.cloudPulledOnce) {
      try { console.warn('[SupabaseSync] persistKeysToCloud 推送被阻止：首次云端拉取尚未完成'); } catch(_) {}
      // 尝试立即拉取一次
      try { await window.SupabaseSync.pullAll({ noRefresh: true }); } catch(e) {}
      if (!SupabaseRuntime.cloudPulledOnce) return false;
    }
    for (const k of list) {
      try {
        const pushed = await withTimeout(window.SupabaseSync.pushKey(k, State[k]), k === 'images' ? 4500 : 3000);
        if (!pushed) ok = false;
      } catch(e) { ok = false; }
    }
  }
  try {
    const meta = {
      keys: list,
      reason: reason || '',
      at: new Date().toISOString(),
      ok
    };
    localStorage.setItem('lhn_last_persist_meta', JSON.stringify(meta));
  } catch(e) {}
  return ok;
}
function loadStateAll() {
  try {
    SYNC_STATE_KEYS.forEach(k => {
      try {
        const raw = localStorage.getItem('lhn_' + k);
        if (raw != null) { State[k] = JSON.parse(raw); }
      } catch(_) {}
    });
    // 兼容老数据的 key 也读一下（双保险）
    ['prices','calColors','colorTypes','settings','users','bgImages','customText'].forEach(k => {
      try {
        const raw = localStorage.getItem('lhn_' + k);
        if (raw != null) { State[k] = JSON.parse(raw); }
      } catch(_) {}
    });
    SyncRuntime.lastTs = Number(localStorage.getItem('lhn_lh_sync_ts') || localStorage.getItem('lh_sync_ts') || 0);
    SyncRuntime.lastHash = localStorage.getItem('lhn_lh_sync_hash') || localStorage.getItem('lh_sync_hash') || '';
    try {
      if (typeof _ensureColorTypes === 'function') _ensureColorTypes();
      if (typeof _buildCalTypeMetaFromColorTypes === 'function') CAL_TYPE_META = _buildCalTypeMetaFromColorTypes();
    } catch(_) {}
  } catch(e) {}
}
// 全量刷新渲染
function refreshAllAfterSync(options) {
  const opt = options || {};
  try { _ensureColorTypes(); CAL_TYPE_META = _buildCalTypeMetaFromColorTypes(); } catch(_) {}
  try { autoExpireGoldMembers(); } catch(_) {}
  try { refreshAllCustomerViews(); } catch(_) {}
  try { renderPriceOptions(); } catch(_) {}
  try { renderCalendar(); } catch(_) {}
  try { renderDashboardSummary(); } catch(_) {}
  try { renderRecentActivity(); } catch(_) {}
  try { renderApptTable(); } catch(_) {}
  try { renderOverviewStats(); } catch(_) {}
  try { renderTodayAppointments(); } catch(_) {}
  try { populateMemberSelects(); } catch(_) {}
  try { renderLevelCounts(); } catch(_) {}
  try { renderIncome(); } catch(_) {}
  try { renderExpense(); } catch(_) {}
  try { if (typeof renderMembersPage === 'function') renderMembersPage(); } catch(_) {}
  try { if (typeof renderCustomerTable === 'function') renderCustomerTable(); } catch(_) {}
  try { if (typeof renderStats === 'function' && State.page === 'stats') renderStats(); } catch(_) {}
  try { renderCloudSyncUI && renderCloudSyncUI(); } catch(_) {}
  try { renderDeviceSyncUI(); } catch(_) {}
  try { renderUserTable(); } catch(_) {}
  try { updateSyncStatusBar(window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady(), false); } catch(_) {}
}
// 启动 15s 轮询自动同步
function startSyncPolling() {
  if (SyncRuntime.pollingTimer) return;
  SyncRuntime.lastTs = Number(localStorage.getItem('lhn_lh_sync_ts') || localStorage.getItem('lh_sync_ts') || 0);
  SyncRuntime.lastHash = localStorage.getItem('lhn_lh_sync_hash') || localStorage.getItem('lh_sync_hash') || '';
  SyncRuntime.pollingTimer = setInterval(async () => {
    try {
      if (!SyncRuntime.autoSyncOn) return;
      if (window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
        const changed = await window.SupabaseSync.pullAll({ noRefresh: true });
        if (changed) {
          refreshAllAfterSync();
          silentToast('🔄 已从 Supabase 云端同步最新数据');
          try { updateSyncStatusBar(true, true); } catch(_){}
          return;
        }
        try { updateSyncStatusBar(true, false); } catch(_){}
      } else {
        try { updateSyncStatusBar(false, false); } catch(_){}
      }
      const curTs = Number(localStorage.getItem('lhn_lh_sync_ts') || localStorage.getItem('lh_sync_ts') || 0);
      if (!curTs) return;
      if (curTs !== SyncRuntime.lastTs) {
        // 有新数据 → 静默同步
        loadStateAll();
        refreshAllAfterSync();
        silentToast('🔄 检测到新数据，已自动同步');
      }
    } catch(_) {}
  }, 15000);
}

// ===== 即时云端同步：页面加载/登录后立即拉取，不等15秒轮询 =====
let _immediateSyncDone = false;
async function immediateCloudSync() {
  if (_immediateSyncDone) return;
  _immediateSyncDone = true;
  try {
    // 等待 Supabase 库加载（最多等3秒）
    let waited = 0;
    while (!window.supabase && waited < 3000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
      const changed = await window.SupabaseSync.pullAll({ noRefresh: true });
      if (changed) {
        refreshAllAfterSync();
        silentToast('🔄 已从云端同步最新数据');
      }
      updateSyncStatusBar(true, changed);
    } else {
      updateSyncStatusBar(false, false);
    }
  } catch(e) {
    updateSyncStatusBar(false, false);
  }
}

// ===== 数据恢复模式：?recover=1 触发，恢复被purge软删除的数据并推送到云端 =====
async function _fullDataRecovery() {
  try {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#D4A574;color:#fff;padding:12px 20px;font-size:14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
    banner.innerHTML = '🔄 数据恢复中... 正在读取本地数据、合并云端、推送恢复';
    document.body.appendChild(banner);

    const log = (msg) => { try { console.log('[Recovery] ' + msg); } catch(_){} };
    log('开始全量数据恢复...');

    // 1. 恢复本地被 purge 软删除的记录
    const CORE_KEYS = ['appointments','customers','memberTxns','manualIncomes','expenses','images','auditLogs'];
    let totalRestored = 0;
    
    for (const key of CORE_KEYS) {
      try {
        const raw = localStorage.getItem('lhn_' + key);
        if (!raw) continue;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        
        let restored = 0;
        arr.forEach(r => {
          if (!r || !r._deleted) return;
          const reason = r._deleteReason || r._deletedReason || '';
          // 只恢复被 purge 函数软删除的记录，不恢复用户手动删除的
          if (reason.includes('一次性数据清理') || reason.includes('仅保留周菲艳') || reason.includes('purge')) {
            delete r._deleted;
            delete r.deletedAt;
            delete r._deleteReason;
            delete r._deletedBy;
            delete r._deletedReason;
            r.syncVersion = (Number(r.syncVersion) || 1) + 1;
            r.updatedAt = new Date().toISOString();
            restored++;
          }
        });
        
        if (restored > 0) {
          localStorage.setItem('lhn_' + key, JSON.stringify(arr));
          if (State[key] !== undefined) {
            State[key] = arr;
          }
          log(`${key}: 恢复 ${restored} 条 purge 软删除记录`);
          totalRestored += restored;
        }
      } catch(e) { log(`${key} 恢复失败: ${e.message}`); }
    }
    
    log(`本地恢复完成，共恢复 ${totalRestored} 条记录`);
    banner.innerHTML = `🔄 本地恢复完成（${totalRestored}条），正在合并云端数据...`;

    // 2. 等待 Supabase 加载
    let waited = 0;
    while (!window.supabase && waited < 5000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }

    if (!(window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady())) {
      banner.innerHTML = `⚠️ Supabase 未连接，仅完成本地恢复（${totalRestored}条）。请检查网络后重试。`;
      banner.style.background = '#E58A8A';
      setTimeout(() => banner.remove(), 8000);
      return;
    }

    // 3. 先拉取云端数据并合并
    log('拉取云端数据...');
    const pullChanged = await window.SupabaseSync.pullAll({ noRefresh: true });
    if (pullChanged) {
      log('云端数据已合并到本地');
    }

    // 4. 推送合并后的完整数据到云端
    banner.innerHTML = `🔄 正在推送完整数据到云端...（本地恢复${totalRestored}条 + 云端合并）`;
    log('推送完整数据到云端...');
    
    const client = getSupabaseClient();
    const c = getSupabaseConfig();
    let pushOk = 0, pushFail = 0;
    
    for (const key of CORE_KEYS) {
      try {
        let dataToPush = State[key];
        if (dataToPush === undefined) {
          const raw = localStorage.getItem('lhn_' + key);
          if (raw) dataToPush = JSON.parse(raw);
        }
        if (dataToPush === undefined || dataToPush === null) continue;
        
        const payload = {
          workspace_id: c.workspaceId,
          data_key: key,
          data: dataToPush,
          updated_at: new Date().toISOString()
        };
        const { error } = await client.from(c.table).upsert(payload, { onConflict: 'workspace_id,data_key' });
        if (error) throw error;
        log(`  ${key} 推送成功 (${Array.isArray(dataToPush) ? dataToPush.length + '条' : typeof dataToPush})`);
        pushOk++;
      } catch(e) {
        log(`  ${key} 推送失败: ${e.message}`);
        pushFail++;
      }
    }

    // 5. 也推送配置数据
    for (const key of ['prices','calColors','colorTypes','settings','users']) {
      try {
        if (State[key] === undefined) continue;
        const payload = {
          workspace_id: c.workspaceId,
          data_key: key,
          data: State[key],
          updated_at: new Date().toISOString()
        };
        const { error } = await client.from(c.table).upsert(payload, { onConflict: 'workspace_id,data_key' });
        if (!error) { log(`  ${key} 配置推送成功`); pushOk++; }
      } catch(e) {}
    }

    // 6. 标记恢复完成
    SupabaseRuntime.cloudPulledOnce = true;
    
    banner.innerHTML = `✅ 数据恢复完成！本地恢复${totalRestored}条，云端推送${pushOk}块${pushFail > 0 ? '，失败' + pushFail + '块' : ''}。页面将在3秒后刷新...`;
    banner.style.background = '#4CAF50';
    log(`恢复完成：本地恢复${totalRestored}条，推送${pushOk}块，失败${pushFail}块`);
    
    // 7. 清除 URL 参数并刷新
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('recover');
      url.searchParams.delete('reset');
      window.location.href = url.toString();
    }, 3000);
  } catch(e) {
    console.error('[Recovery] 恢复失败:', e);
    try { toast('数据恢复失败: ' + e.message, 'error'); } catch(_){}
  }
}

// ===== 更新同步状态条 =====
function updateSyncStatusBar(connected, synced) {
  try {
    const dot = document.getElementById('syncStatusDot');
    const text = document.getElementById('syncStatusText');
    if (!dot || !text) return;
    const status = window.SupabaseSync && window.SupabaseSync.getStatus ? window.SupabaseSync.getStatus() : {};
    if (!connected) {
      dot.style.background = '#E58A8A';
      text.textContent = '⚠️ 云端未连接，数据仅保存在本机。点击"立即同步"重试';
      text.style.color = '#C04848';
      return;
    }
    const lastPull = status.lastPullAt || 0;
    const lastPush = status.lastPushAt || 0;
    const lastTime = Math.max(lastPull, lastPush);
    let timeStr = '从未同步';
    if (lastTime > 0) {
      const diff = Date.now() - lastTime;
      if (diff < 60000) timeStr = Math.floor(diff / 1000) + '秒前同步';
      else if (diff < 3600000) timeStr = Math.floor(diff / 60000) + '分钟前同步';
      else timeStr = new Date(lastTime).toLocaleString('zh-CN');
    }
    if (status.lastError) {
      dot.style.background = '#E58A8A';
      text.textContent = '⚠️ 云端同步异常：' + status.lastError + '（' + timeStr + '）';
      text.style.color = '#C04848';
    } else {
      dot.style.background = '#7CC4A4';
      text.textContent = '✅ 云端已连接 · ' + (synced ? '刚同步了新数据' : '数据已是最新') + ' · ' + timeStr;
      text.style.color = '#3A7A5B';
    }
  } catch(_) {}
}

// ===== 日程页快速同步按钮 =====
async function quickSyncNow() {
  const btnTxt = document.getElementById('quickSyncBtnTxt');
  if (btnTxt) btnTxt.textContent = '⏳ 同步中...';
  try {
    if (window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
      const changed = await window.SupabaseSync.pullAll({ noRefresh: true });
      if (changed) {
        refreshAllAfterSync();
        toast('✅ 已从云端同步最新数据', 'success');
      } else {
        toast('✅ 云端数据已是最新', 'success');
      }
      updateSyncStatusBar(true, changed);
    } else {
      updateSyncStatusBar(false, false);
      toast('⚠️ 云端未连接，请检查网络后重试', 'error', 4000);
    }
  } catch(e) {
    toast('同步失败：' + (e.message || e), 'error', 4000);
    updateSyncStatusBar(false, false);
  } finally {
    if (btnTxt) setTimeout(() => { btnTxt.textContent = '🔄 立即同步'; }, 600);
  }
}

// ===== 定时刷新同步状态条（每30秒） =====
setInterval(() => {
  try {
    const ready = window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady();
    updateSyncStatusBar(ready, false);
  } catch(_) {}
}, 30000);
// -------- 一键导出 JSON 合并包（问题 A2 第1块）--------
function exportSyncJSON() {
  const pack = buildSyncPack();
  const ts = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fn = 'LHNAIL_SYNC_' + ts.getFullYear() + pad(ts.getMonth()+1) + pad(ts.getDate())
    + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + '.json';
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fn;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 600);
  try {
    localStorage.setItem('lhn_lh_sync_snapshot', JSON.stringify(pack));
    localStorage.setItem('lh_sync_snapshot', JSON.stringify(pack));
    const now = Date.now();
    localStorage.setItem('lhn_lh_sync_ts', String(now));
    localStorage.setItem('lh_sync_ts', String(now));
    SyncRuntime.lastTs = now;
  } catch(_) {}
  toast('✅ 同步包已生成', 'success');
  try { renderDeviceSyncUI(); } catch(_) {}
}
function buildSyncPack() {
  const data = {
    _meta: {
      app: 'LH Nail 美甲工作台',
      type: 'multi-sync-json',
      version: 1,
      generatedAt: Date.now(),
      shop: State.settings?.shopName || 'LH Nail',
      byUser: State.currentUser?.username || 'unknown'
    }
  };
  SYNC_STATE_KEYS.forEach(k => {
    data[k] = State[k] != null ? State[k] : (k === 'prices' ? DEFAULT_PRICES : (k === 'calColors' ? DEFAULT_CAL_COLORS : null));
  });
  return data;
}
// 选择并导入 JSON 合并包
function chooseImportSyncJSON() {
  let inp = SyncRuntime.lastImportInput;
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.style.display = 'none';
    inp.addEventListener('change', (e) => handleImportSyncJSON(e));
    SyncRuntime.lastImportInput = inp;
  }
  inp.value = '';
  inp.click();
}
function handleImportSyncJSON(ev, opts) {
  const f = ev?.target?.files?.[0];
  if (!f) return false;
  const fr = new FileReader();
  fr.onload = (e) => {
    try {
      let data;
      try { data = JSON.parse(e.target.result); } catch(err) {
        // 兼容老的设备同步包（PIN + base64 格式）
        const dec = _decodeSyncPack(String(e.target.result || ''));
        if (!dec.err && dec.data && dec.data._meta && dec.data._meta.type === 'device-sync') {
          data = dec.data;
        } else {
          throw err;
        }
      }
      const merged = mergeSyncPackIntoState(data);
      saveStateAll();
      refreshAllAfterSync();
      const totalAdded = (merged && merged.stats) ? (merged.stats.added || 0) : 0;
      const msg = '✅ 已同步成功，已合并 ' + totalAdded + ' 条新增数据';
      toast(msg, 'success');
      if (opts && opts.autoLoginAfter) {
        try {
          State.users = State.users || [];
          const u = activeRows(State.users).find(x => x.role === 'owner' && x.status === 'active') ||
            activeRows(State.users).find(x => x.status === 'active');
          if (u) {
            switchLoginTab('login');
            const nameInput = document.getElementById('lg_username');
            const pwdInput = document.getElementById('lg_password');
            if (nameInput) nameInput.value = u.username || '';
            if (pwdInput) { pwdInput.value = ''; setTimeout(() => pwdInput.focus(), 120); }
            alert('✅ 已导入电脑端账号数据。\n\n请继续输入该账号密码登录。');
          } else {
            alert('已导入同步文件，但里面没有可用账号。请确认是在电脑端「设置 → 多端同步」生成的最新同步文件。');
          }
        } catch(_) {}
      }
      try { renderDeviceSyncUI(); } catch(_) {}
    } catch(err) {
      toast('导入失败：' + (err.message || err), 'error');
    } finally {
      try { ev.target.value = ''; } catch(_) {}
    }
  };
  fr.readAsText(f, 'utf-8');
  return true;
}
// 合并规则：数组按 id 去重 + updatedAt/createdAt 更新时间较新胜出；配置类以导入方覆盖
function mergeSyncPackIntoState(remote) {
  const stats = { added: 0, updated: 0 };
  if (!remote || typeof remote !== 'object') return { ok:false, stats };
  // 数组合并
  const arrKeys = [
    { k:'appointments',  idField:'id' },
    { k:'customers',   idField:'id' },
    { k:'memberTxns', idField:'id' },
    { k:'manualIncomes', idField:'id' },
    { k:'expenses',  idField:'id' },
    { k:'users',     idField:'id' }
  ];
  arrKeys.forEach(({k, idField}) => {
    const rArr = Array.isArray(remote[k]) ? remote[k] : [];
    if (!rArr.length) return;
    if (!Array.isArray(State[k])) State[k] = [];
    const byId = new Map();
    State[k].forEach(x => { if (x && x[idField]) byId.set(x[idField], x); });
    rArr.forEach(x => {
      if (!x) return;
      const id = x[idField];
      if (id) {
        const old = byId.get(id);
        if (old) {
          const oldTs = Number(old.updatedAt || old.createdAt || old.lastLogin || old.datetime || old.date || 0);
          const newTs = Number(x.updatedAt || x.createdAt || x.lastLogin || x.datetime || x.date || 0);
          if (newTs >= oldTs) { byId.set(id, x); stats.updated++; }
        } else {
          byId.set(id, x); stats.added++;
        }
      } else {
        State[k].push(x); stats.added++;
      }
    });
    if (byId.size > 0) {
      State[k] = Array.from(byId.values()).concat(State[k].filter(x => !(x && x[idField])));
    }
  });
  // 配置类覆盖
  ['prices','calColors','colorTypes','settings','bgImages','customText'].forEach(k => {
    if (remote[k] != null) {
      State[k] = remote[k];
    }
  });
  return { ok:true, stats };
}
// 切换本端自动同步开关
function toggleAutoSync(checked) {
  SyncRuntime.autoSyncOn = !!checked;
  try {
    localStorage.setItem('lhn_lh_autosync', SyncRuntime.autoSyncOn ? '1' : '0');
    localStorage.setItem('lh_autosync', SyncRuntime.autoSyncOn ? '1' : '0');
  } catch(_) {}
  toast(SyncRuntime.autoSyncOn ? '✅ 已开启本端自动同步' : '已关闭本端自动同步');
  try { renderDeviceSyncUI(); } catch(_) {}
}
// 登录弹窗的「导入同步文件」入口
function loginModalImportSync() {
  const inp = document.getElementById('loginImportFile');
  if (inp) { inp.value = ''; inp.click(); }
}
// 渲染多端同步卡状态 & 老的设备同步 UI
function renderDeviceSyncUI() {
  try {
    // 老的设备同步卡片状态
    const autoEl = document.getElementById('dsAutoStatus');
    if (autoEl) {
      autoEl.innerHTML = '<span style="color:#3A7A5B;font-weight:700;">✅ 同浏览器多标签页：实时同步（已启用）</span>';
    }
    // 新的多端同步卡状态
    const acc = document.getElementById('msAccount');
    const lst = document.getElementById('msLastSync');
    const st  = document.getElementById('msDataStatus');
    const badge = document.getElementById('multiSyncBadge');
    const sw  = document.getElementById('autoSyncSwitch');
    if (acc) {
      if (State.currentUser) {
        const u = State.currentUser;
        acc.textContent = (u.realName || u.username || '—') + '（' + (ROLE_META[u.role]?.label || u.role || '未知') + '）';
      } else {
        const sess = loadSession();
        acc.textContent = sess && sess.uname ? sess.uname + '（记住登录）' : '未登录';
      }
    }
    if (lst) {
      const ts = Number(localStorage.getItem('lhn_lh_sync_ts') || localStorage.getItem('lh_sync_ts') || 0);
      lst.textContent = ts ? new Date(ts).toLocaleString('zh-CN') : '尚未同步';
    }
    if (st || badge) {
      const ts = Number(localStorage.getItem('lhn_lh_sync_ts') || localStorage.getItem('lh_sync_ts') || 0);
      const label = ts ? '云端已同步' : '本地数据';
      if (st) {
        st.textContent = label;
        if (ts) {
          st.style.background = '#E3F3EC'; st.style.color = '#3A7A5B'; st.style.borderColor = '#BFDCC8';
        } else {
          st.style.background = '#F1F5F9'; st.style.color = '#5A6A7A'; st.style.borderColor = '#D9DFE6';
        }
      }
      if (badge) {
        badge.textContent = label;
        if (ts) {
          badge.style.background = '#E3F3EC'; badge.style.color = '#3A7A5B'; badge.style.borderColor = '#BFDCC8';
        } else {
          badge.style.background = '#F1F5F9'; badge.style.color = '#5A6A7A'; badge.style.borderColor = '#D9DFE6';
        }
      }
    }
    if (sw) sw.checked = !!SyncRuntime.autoSyncOn;
  } catch(e) {}
}

/* =========================================================
   📡 跨设备同步核心工具函数
   ========================================================= */
// 从 localStorage 重读全部 State（BroadcastChannel/storage 事件触发后调用）
function loadAllStateFromLocalStorage() {
  try {
    const keys = ['prices','appointments','customers','memberTxns','users',
      'bgImages','customText','calColors','colorTypes','settings','__ver',
      'manualIncomes','expenses','images','auditLogs'];
    keys.forEach(k => {
      try {
        const raw = localStorage.getItem('lhn_' + k);
        if (raw != null) { State[k] = JSON.parse(raw); }
      } catch(e){}
    });
  } catch(e){}
}
// 只重渲染当前页面（不闪屏）
function reRenderCurrentPageOnly() {
  try {
    try {
      if (typeof _ensureColorTypes === 'function') _ensureColorTypes();
      if (typeof _buildCalTypeMetaFromColorTypes === 'function') CAL_TYPE_META = _buildCalTypeMetaFromColorTypes();
    } catch(_) {}
    const page = State.page || 'dashboard';
    switch(page) {
      case 'dashboard':
        try { renderTodayAppointments(); } catch(_){}
        try { renderDashboardSummary(); } catch(_){}
        try { renderOverviewStats(); } catch(_){}
        break;
      case 'schedule':
        try { renderApptTable(); } catch(_){}
        try { renderCalendar(); } catch(_){}
        break;
      case 'income':
        try { renderIncome(); } catch(_){}
        break;
      case 'expense':
        try { renderExpense(); } catch(_){}
        break;
      case 'members':
        try { populateMemberSelects(); } catch(_){}
        try { renderLevelCounts(); } catch(_){}
        try { if (typeof renderMembersPage === 'function') renderMembersPage(); } catch(_){}
        break;
      case 'customers':
        try { if (typeof renderCustomerTable === 'function') renderCustomerTable(); } catch(_){}
        break;
      case 'stats':
        try { if (typeof renderStats === 'function') renderStats(); } catch(_){}
        break;
      case 'settings':
        try { renderUserTable(); } catch(_){}
        try { if (typeof renderCloudSyncUI === 'function') renderCloudSyncUI(); } catch(_){}
        try { renderDeviceSyncUI(); } catch(_){}
        try { renderDataMaintenance(); } catch(_){}
        break;
    }
    try { renderPriceOptions(); } catch(_){}
  } catch(e){}
}

/* -------- 设备同步 B2：导出/导入 JSON 同步数据包 -------- */
const DEVICE_SYNC_KEYS = [
  'appointments','customers','memberTxns','manualIncomes','expenses',
  'prices','calColors','colorTypes','settings','users','bgImages','customText','auditLogs','images'
];
// 生成 8 位字母数字 PIN
function _genSyncPin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
// 简易 Base64 压缩编码（数据包用）
function _encodeSyncPack(obj, pin) {
  try {
    const json = JSON.stringify(obj);
    // 简单 XOR 混淆（不是加密，只是防止肉眼可读）
    let xor = '';
    const pinStr = String(pin || '');
    for (let i = 0; i < json.length; i++) {
      xor += String.fromCharCode(json.charCodeAt(i) ^ pinStr.charCodeAt(i % Math.max(1, pinStr.length)));
    }
    const b64 = btoa(unescape(encodeURIComponent(xor)));
    return (pin || '') + ':' + b64;
  } catch(e) { return ''; }
}
function _decodeSyncPack(str) {
  try {
    const idx = String(str).indexOf(':');
    if (idx < 0) return { pin: '', data: null, err: '格式错误：缺少 PIN 前缀' };
    const pin = str.slice(0, idx);
    const b64 = str.slice(idx + 1);
    const xor = decodeURIComponent(escape(atob(b64)));
    let json = '';
    const pinStr = String(pin || '');
    for (let i = 0; i < xor.length; i++) {
      json += String.fromCharCode(xor.charCodeAt(i) ^ pinStr.charCodeAt(i % Math.max(1, pinStr.length)));
    }
    const data = JSON.parse(json);
    return { pin, data, err: null };
  } catch(e) {
    return { pin: '', data: null, err: '解析失败：' + (e.message || e) };
  }
}
// 一键生成同步数据包
function generateSyncPack() {
  if (!hasPerm('*')) return alert('仅老板可以生成同步数据包');
  const pin = _genSyncPin();
  const data = {
    _meta: {
      app: 'LH Nail 美甲工作台',
      type: 'device-sync',
      version: 2,
      pin: pin,
      generatedAt: Date.now(),
      shop: State.settings?.shopName || 'LH Nail',
      byUser: State.currentUser?.username || 'unknown'
    }
  };
  DEVICE_SYNC_KEYS.forEach(k => {
    data[k] = State[k] != null ? State[k] : (load(k, null));
  });
  const pack = _encodeSyncPack(data, pin);
  // 显示数据包 UI
  const el = document.getElementById('syncPackOutput');
  const qrEl = document.getElementById('syncPackQR');
  const pinEl = document.getElementById('syncPackPin');
  if (pinEl) pinEl.textContent = pin;
  if (el) el.value = pack;
  // 尝试显示二维码（如果 qrcodejs 已加载，否则用简单的文本复制方式）
  try {
    if (qrEl) {
      qrEl.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrEl, {
          text: pack.length < 2000 ? pack : ('DATA:TOO:LONG:' + pin),
          width: 180, height: 180,
          colorDark: '#2D3E52', colorLight: '#FFFFFF',
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        qrEl.innerHTML = '<div style="padding:20px 10px;font-size:12px;color:#6E7A8A;line-height:1.7;background:#F6FAFD;border-radius:12px;text-align:center;">📱 手机扫码加载中…<br>如不显示请直接复制下方数据包文本，发送到手机粘贴导入</div>';
      }
    }
  } catch(e) {}
  toast('✅ 同步数据包已生成！PIN 码：' + pin + '（请妥善保管）', 'success');
}
// 复制数据包到剪贴板
function copySyncPack() {
  const el = document.getElementById('syncPackOutput');
  if (!el || !el.value) { toast('请先生成同步数据包', 'error'); return; }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value);
    } else {
      el.select(); document.execCommand('copy');
    }
    toast('✅ 数据包已复制！发送到手机后，在手机「设置 → 设备同步」里粘贴即可同步', 'success');
  } catch(e) {
    toast('复制失败：' + e.message, 'error');
  }
}
// 合并两个状态（以对方数据为准，弹确认框）
function mergeStates(local, remote) {
  const stats = {};
  const result = { ...local };
  // 数组合并：按 id 合并，时间戳新的覆盖旧的；没有 id 就以 remote 为准
  const arrayKeys = ['appointments','customers','memberTxns','manualIncomes','expenses','images','users','auditLogs'];
  arrayKeys.forEach(k => {
    const rArr = Array.isArray(remote[k]) ? remote[k] : [];
    const lArr = Array.isArray(local[k]) ? local[k] : [];
    if (rArr.length === 0 && lArr.length > 0) { result[k] = lArr; stats[k] = lArr.length; return; }
    if (lArr.length === 0) { result[k] = rArr; stats[k] = rArr.length; return; }
    // 按 id 合并
    const byId = new Map();
    lArr.forEach(x => { if (x && x.id) byId.set(x.id, x); });
    let added = 0, updated = 0;
    rArr.forEach(x => {
      if (!x) return;
      if (x.id && byId.has(x.id)) {
        const old = byId.get(x.id);
        const oldTs = old.updatedAt || old.createdAt || old.lastLogin || old.datetime || 0;
        const newTs = x.updatedAt || x.createdAt || x.lastLogin || x.datetime || 0;
        if (newTs >= oldTs) { byId.set(x.id, x); updated++; }
      } else if (x.id) {
        byId.set(x.id, x); added++;
      } else {
        byId.set('__no_id_' + Math.random(), x); added++;
      }
    });
    result[k] = Array.from(byId.values());
    stats[k] = result[k].length;
  });
  // 配置类：直接用 remote 覆盖（因为是用户主动修改的配置）
  ['prices','calColors','colorTypes','settings','bgImages','customText'].forEach(k => {
    if (remote[k] !== undefined && remote[k] !== null) {
      result[k] = remote[k];
      stats[k] = (typeof remote[k] === 'object' && !Array.isArray(remote[k]))
        ? Object.keys(remote[k]).length + ' 项'
        : (Array.isArray(remote[k]) ? remote[k].length + ' 条' : '已更新');
    }
  });
  return { result, stats };
}
// 导入同步数据包
function importSyncPack() {
  if (!hasPerm('*')) return alert('仅老板可以导入同步数据');
  const el = document.getElementById('syncPackInput');
  const pinEl = document.getElementById('syncPackInputPin');
  const raw = (el?.value || '').trim();
  if (!raw) { toast('请先粘贴数据包文本', 'error'); return; }
  const decoded = _decodeSyncPack(raw);
  if (decoded.err) { toast('导入失败：' + decoded.err, 'error'); return; }
  // 校验 PIN（可选，用户也可能在输入框填）
  const inputPin = (pinEl?.value || '').trim().toUpperCase();
  if (inputPin && inputPin !== decoded.pin) {
    if (!confirm('⚠️ 输入的 PIN 码与数据包 PIN 不一致！\n数据包 PIN：' + decoded.pin + '\n输入 PIN：' + inputPin + '\n\n仍要继续导入吗？')) return;
  }
  const remote = decoded.data;
  if (!remote || !remote._meta || remote._meta.type !== 'device-sync') {
    toast('数据包格式不正确', 'error'); return;
  }
  // 统计
  const summary = [];
  summary.push('📦 数据包信息');
  summary.push('• PIN 码：' + (decoded.pin || '（无）'));
  summary.push('• 生成时间：' + new Date(remote._meta.generatedAt).toLocaleString());
  summary.push('• 店铺：' + (remote._meta.shop || '未知'));
  summary.push('');
  summary.push('即将同步以下内容（以对方数据为准合并）：');
  ['appointments','customers','memberTxns','manualIncomes','expenses','images','prices','calColors','colorTypes','users'].forEach(k => {
    const label = {
      appointments:'预约', customers:'顾客', memberTxns:'会员交易',
      manualIncomes:'手动收入', expenses:'支出', prices:'定价项目',
      calColors:'旧颜色配置', colorTypes:'项目类型颜色', users:'账号权限'
    }[k] || k;
    const cnt = Array.isArray(remote[k]) ? remote[k].length
      : (typeof remote[k] === 'object' && remote[k] ? Object.keys(remote[k]).length : 0);
    summary.push(`• ${label}：${cnt} 项`);
  });
  summary.push('');
  summary.push('⚠️ 合并规则：有 ID 的按「时间戳新的覆盖旧」；配置类以对方最新值为准。');
  if (!confirm(summary.join('\n') + '\n\n确认开始同步？')) return;

  try {
    const { result, stats } = mergeStates(State, remote);
    // 写回 State + localStorage
    DEVICE_SYNC_KEYS.forEach(k => {
      if (result[k] !== undefined) {
        State[k] = result[k];
        save(k, result[k]);
      }
    });
    toast('✅ 同步完成！数据已合并到本地', 'success');
    // 清空输入框
    if (el) el.value = '';
    if (pinEl) pinEl.value = '';
    // 重新渲染
    try { location.reload(); } catch(_){}
  } catch(e) {
    toast('同步失败：' + e.message, 'error');
  }
}
/* =========================================================
   🎨 定价 ↔ 颜色 联动同步
   ========================================================= */
// 内置调色板：按分类循环分配，避免撞色
const CATEGORY_PALETTES = {
  style:      ['#E8A8B4', '#F2B8A1', '#E8C5A5', '#D4A574', '#C48D6A', '#B8926B', '#E5B194', '#E09E97', '#D68EA8', '#C8869F'],
  tip:        ['#A5C6E0', '#8EB6D6', '#7AA8CC', '#6B9BB5', '#B5CFE5', '#C3D7EC', '#94B8DA', '#84A9CC', '#A7C3D8', '#BFD0E6'],
  removeNail: ['#A8B0C0', '#97A0B3', '#B5BBC9', '#BFC4D0', '#A9B2C3', '#B7BDCD', '#9EA8BA', '#ADB5C5', '#C4C9D6', '#8C96A8'],
  lash:       ['#B2A4D4', '#A290CC', '#C2B3E0', '#D0BCE6', '#8F80BD', '#9C8CC7', '#B8A9D8', '#A99AD0', '#BFAEDC', '#C9BCE4'],
  removeLash: ['#D6CCE8', '#C9BFE0', '#E0D5EE', '#E5DAF0', '#BDB1D8', '#CDBFE0', '#CEC2E2', '#D7CAEB', '#E2D6F0', '#BFADD4']
};
// 分类默认颜色（保持向后兼容，供 resetCalColors 等老逻辑使用）
const CATEGORY_DEFAULT_COLORS = {
  style:      CATEGORY_PALETTES.style[3] || '#B8956F',
  tip:        CATEGORY_PALETTES.tip[0]   || '#A5C6E0',
  removeNail: CATEGORY_PALETTES.removeNail[0] || '#A8B0C0',
  lash:       CATEGORY_PALETTES.lash[0]  || '#B2A4D4',
  removeLash: CATEGORY_PALETTES.removeLash[0] || '#D6CCE8'
};
// 调色板取色器：按 index 循环
function _pickPaletteColor(category, idx) {
  const palette = CATEGORY_PALETTES[category] || [CATEGORY_DEFAULT_COLORS[category] || '#B8956F'];
  return palette[idx % palette.length];
}
// 核心：统一按「分类 + 项目 key/name」存颜色，用户新增/重命名后自动补色 + 旧颜色迁移
function syncColorsWithPrices(oldPrices) {
  try {
    if (!State.calColors) State.calColors = { ...DEFAULT_CAL_COLORS };
    // 1) 补齐基础 DEFAULT_CAL_COLORS
    Object.keys(DEFAULT_CAL_COLORS).forEach(k => {
      if (State.calColors[k] == null) State.calColors[k] = DEFAULT_CAL_COLORS[k];
    });
    // 2) 旧名字 → 颜色 映射（兼容重命名迁移：旧 key 或 name 存过的颜色）
    const oldByName = {};
    PRICE_GROUP_ORDER.forEach(g => {
      const oldList = (oldPrices && Array.isArray(oldPrices[g])) ? oldPrices[g] : [];
      oldList.forEach(p => {
        if (!p) return;
        if (p.name) oldByName[g + '::' + p.name] = p;
      });
    });
    // 3) 遍历 5 个分类，按「key → name」的顺序匹配已有颜色，没有就从调色板循环分配
    PRICE_GROUP_ORDER.forEach(g => {
      const list = Array.isArray(State.prices[g]) ? State.prices[g] : [];
      list.forEach((p, idx) => {
        if (!p) return;
        const identityKey = p.key || ('__NAME__' + (p.name || '未命名'));
        const colorKey = 'p_' + g + '_' + identityKey;
        let color = State.calColors[colorKey];
        // 没有 → 尝试用旧数据里同名项目颜色（兼容重命名迁移）
        if (!color && p.name && oldPrices && oldPrices[g]) {
          const oldItem = oldPrices[g].find(x => x && (x.key === p.key || x.name === p.name));
          if (oldItem) {
            const oldColorKey = 'p_' + g + '_' + (oldItem.key || ('__NAME__' + (oldItem.name || '')));
            if (State.calColors[oldColorKey]) color = State.calColors[oldColorKey];
          }
        }
        // 还是没有 → 按 name 匹配当前 calColors 里的旧名（防止 name 变了颜色丢失）
        if (!color && p.name) {
          for (const ck in State.calColors) {
            if (!ck.startsWith('p_' + g + '_')) continue;
            const old = oldByName[g + '::' + p.name];
            if (old && ck === ('p_' + g + '_' + (old.key || ('__NAME__' + old.name)))) {
              color = State.calColors[ck];
              if (color) break;
            }
          }
        }
        // 还是没有 → 从内置调色板自动分配一个颜色
        if (!color) color = _pickPaletteColor(g, idx);
        State.calColors[colorKey] = color;
      });
    });
    save('calColors', State.calColors);
  } catch(e) {}
}
// 颜色查找：先按 key，再按 name（兜底兼容旧预约 & 新增无 key 项目）
function getProjectColor(category, keyOrName) {
  if (!category || !keyOrName) return null;
  const list = Array.isArray(State.prices[category]) ? State.prices[category] : [];
  const p = list.find(x => x && x.key === keyOrName)
         || list.find(x => x && x.name === keyOrName)
         || null;
  if (p) {
    const idKey = p.key || ('__NAME__' + (p.name || ''));
    const ck = 'p_' + category + '_' + idKey;
    if (State.calColors[ck]) return State.calColors[ck];
  }
  // 再兜底：直接遍历当前 category 下所有颜色 key，按 __NAME__ 找
  const prefix = 'p_' + category + '_';
  const namePrefix = prefix + '__NAME__' + keyOrName;
  if (State.calColors[namePrefix]) return State.calColors[namePrefix];
  return null;
}
// 按 key 推断所属分类（用于颜色配置分组）
function _categoryOfPriceKey(key) {
  for (const g of PRICE_GROUP_ORDER) {
    if (State.prices && Array.isArray(State.prices[g])) {
      if (State.prices[g].some(x => x && x.key === key)) return g;
    }
  }
  return null;
}
// 获取扩展后的 CAL_TYPE_META（包含基础 6 类型 + 所有价格项目的独立颜色行）
// 🎯 关键：直接遍历 State.prices[group].items，不再硬编码 DEFAULT_PRICES，用户新增/改名立刻可见
function getExtendedColorMeta() {
  // 先加基础 6 种（甲片类型级别）
  const base = [
    { key: 'benjia',  label: '【基础】本甲',       icon: '💅', cat: 'tip_base' },
    { key: 'jiamo',   label: '【基础】甲膜',       icon: '🧴', cat: 'tip_base' },
    { key: 'gaowei',  label: '【基础】高位半贴',   icon: '✨', cat: 'tip_base' },
    { key: 'bantie',  label: '【基础】半贴',       icon: '💅', cat: 'tip_base' },
    { key: 'qiantie', label: '【基础】浅帖',       icon: '🌸', cat: 'tip_base' },
    { key: 'meijie',  label: '【基础】美睫',       icon: '👁️', cat: 'lash_base' }
  ];
  // 再追加每个价格项目（直接遍历 State.prices，保证新增项目立刻出现）
  const extras = [];
  PRICE_GROUP_ORDER.forEach(g => {
    const meta = PRICE_GROUP_META[g];
    if (!meta) return;
    const list = Array.isArray(State.prices[g]) ? State.prices[g] : [];
    list.forEach(p => {
      if (!p) return;
      const idKey = p.key || ('__NAME__' + (p.name || '未命名'));
      const colorKey = 'p_' + g + '_' + idKey;
      extras.push({
        key: colorKey,
        label: `${meta.title} · ${p.name || '未命名'}`,
        icon: meta.dot ? '🎨' : '📍',
        cat: g,
        _group: g,
        _priceKey: idKey
      });
    });
  });
  return base.concat(extras);
}
// 核心：同步颜色配置 ↔ 当前 prices（补齐缺失 + 重命名迁移 + 删除不清理）
function _syncColorConfigWithPrices(oldPrices) {
  try {
    if (!State.calColors) State.calColors = { ...DEFAULT_CAL_COLORS };
    // 1) 补齐 DEFAULT_CAL_COLORS 里没有的基础类型颜色
    Object.keys(DEFAULT_CAL_COLORS).forEach(k => {
      if (State.calColors[k] == null) State.calColors[k] = DEFAULT_CAL_COLORS[k];
    });
    // 2) 补齐当前所有价格项目的独立颜色
    PRICE_GROUP_ORDER.forEach(g => {
      const defaultColor = CATEGORY_DEFAULT_COLORS[g] || '#B8956F';
      if (!Array.isArray(State.prices[g])) return;
      State.prices[g].forEach(p => {
        if (!p || !p.key) return;
        const colorKey = 'p_' + g + '_' + p.key;
        if (State.calColors[colorKey] == null) {
          State.calColors[colorKey] = defaultColor;
        }
      });
    });
    // 3) 重命名迁移：如果提供了 oldPrices，对比找出 name 变了但 key 没变的项目，迁移颜色
    if (oldPrices && typeof oldPrices === 'object') {
      PRICE_GROUP_ORDER.forEach(g => {
        if (!Array.isArray(oldPrices[g]) || !Array.isArray(State.prices[g])) return;
        const oldMap = new Map(oldPrices[g].filter(x=>x&&x.key).map(x => [x.key, x]));
        State.prices[g].forEach(p => {
          if (!p || !p.key) return;
          const old = oldMap.get(p.key);
          if (old && old.name && p.name && old.name !== p.name) {
            // key 相同、name 变了：颜色值不变（因为 colorKey 用的是 key，不是 name）
            // 但颜色配置弹窗显示的是 name，所以只要 colorKey 不变就自动显示新名字
            // 这里不需要额外操作，保留即可
          }
        });
      });
    }
    save('calColors', State.calColors);
  } catch(e) {}
}

function statusLabel(s) {
  return { pending: '待确认', confirmed: '已确认', serving: '已确认', done: '已完成', canceled: '已取消' }[s] || s;
}
function normalizeApptStatus(s) {
  return s === 'serving' ? 'confirmed' : (s || 'pending');
}
function normalizeAppointmentStatuses() {
  let changed = false;
  (State.appointments || []).forEach(a => {
    if (a.status === 'serving') {
      a.status = 'confirmed';
      changed = true;
    }
  });
  if (changed) save('appointments', State.appointments);
}
function appointmentById(id) {
  return activeRows(State.appointments).find(a => a.id === id);
}
function isActualIncomeAppt(a) {
  return a && !a._deleted && !a.deletedAt && a.status === 'done';
}
function _findCustomerForAppt(a) {
  if (!a) return null;
  return customerById(a.customerId) ||
    activeRows(State.customers).find(c => _matchCustomer(c, a.customer, a.phone)) || null;
}
function _apptLinkedDeductAlreadyCounted(a) {
  if (!a) return false;
  if (a._memberDeductAlreadyCounted) return true;
  const tx = a.deductId ? activeRows(State.memberTxns).find(t => t.id === a.deductId) : null;
  return !!(tx && tx.type === 'deduct' && tx.subtype !== '预约完成扣卡');
}
function _syncCustomerAfterApptDone(a) {
  if (!a || a._customerSyncedOnDone) return;
  let c = _findCustomerForAppt(a);
  const date = (a.datetime || todayDateStr()).slice(0, 10);
  if (!c && (a.customer || a.phone)) {
    c = {
      id: genId('C'),
      name: a.customer || '未命名顾客',
      phone: a.phone || '',
      level: a.member || '',
      balance: 0,
      expire: '',
      remark: a.remark || '',
      firstVisit: date,
      lastVisit: date,
      visits: 0,
      totalPaid: 0
    };
    State.customers.push(c);
  }
  if (!c) return;
  a.customerId = c.id;
  if (_apptLinkedDeductAlreadyCounted(a)) {
    a.doneAt = a.doneAt || new Date().toISOString();
    a._customerSyncedOnDone = false;
    return;
  }
  c.lastVisit = date;
  if (!c.firstVisit || c.firstVisit > date) c.firstVisit = date;
  c.visits = (c.visits || 0) + 1;
  c.totalPaid = Math.round(((c.totalPaid || 0) + (Number(a.finalTotal) || 0)) * 100) / 100;
  a._customerSyncedOnDone = true;
  a.doneAt = a.doneAt || new Date().toISOString();
}
function _apptMatchesCustomer(a, c) {
  if (!a || !c) return false;
  return (a.customerId && a.customerId === c.id) ||
    _matchCustomer(c, a.customer, a.phone);
}
function _rollbackCustomerAfterApptUndo(a) {
  if (!a || !a._customerSyncedOnDone) return;
  const c = _findCustomerForAppt(a);
  if (!c) {
    a._customerSyncedOnDone = false;
    return;
  }
  const date = (a.datetime || todayDateStr()).slice(0, 10);
  c.visits = Math.max(0, (Number(c.visits) || 0) - 1);
  c.totalPaid = Math.max(0, Math.round(((Number(c.totalPaid) || 0) - (Number(a.finalTotal) || 0)) * 100) / 100);
  const otherDone = (State.appointments || [])
    .filter(x => x.id !== a.id && isActualIncomeAppt(x) && _apptMatchesCustomer(x, c))
    .map(x => (x.datetime || '').slice(0, 10))
    .filter(Boolean)
    .sort();
  if (c.lastVisit === date) c.lastVisit = otherDone.length ? otherDone[otherDone.length - 1] : '';
  if (c.firstVisit === date) c.firstVisit = otherDone.length ? otherDone[0] : '';
  a._customerSyncedOnDone = false;
}
function memberLabel(m) {
  // ⚠️ 全局唯一 memberLabel：保证任何调用处都有 cls / tag / label 三个字段，避免 .replace 报错
  const map = {
    '':        { cls:'tag tag-gray',     tag:'',         label:'非会员'   },
    gold:      { cls:'tag tag-gold',    tag:'🥇黄金',   label:'黄金会员' },
    platinum:  { cls:'tag tag-platinum',tag:'🥈铂金',   label:'铂金会员' },
    diamond:   { cls:'tag tag-diamond', tag:'🥉钻石',   label:'钻石会员' }
  };
  const mm = map[m] || map[''];
  return {
    cls:   mm.cls   || '',
    tag:   mm.tag   || '',
    label: mm.label || (m || '非会员')
  };
}

// ============ 定价：分类元数据 & 默认配置 & 消费端查找 ============
const PRICE_GROUP_META = {
  style:      { title: '美甲款式', dot: '#D4A574', short: '款式' },
  tip:        { title: '甲片',     dot: '#D4A574', short: '甲片' },
  removeNail: { title: '卸甲',     dot: '#B08963', short: '卸甲' },
  lash:       { title: '美睫款式', dot: '#8A6CB0', short: '美睫' },
  removeLash: { title: '卸睫',     dot: '#A88B66', short: '卸睫' }
};
const PRICE_GROUP_ORDER = ['style', 'tip', 'removeNail', 'lash', 'removeLash'];
const DEFAULT_PRICES = {
  style: [
    { key: 'nude', name: '裸色', price: 88, custom: false },
    { key: 'solid', name: '纯色', price: 68, custom: false },
    { key: 'cat', name: '猫眼', price: 128, custom: false },
    { key: 'custom', name: '🖼 图片款式', price: 0, custom: true }
  ],
  tip: [
    { key: 'self', name: '本甲', price: 0, custom: false },
    { key: 'reuse', name: '二次利用', price: 60, custom: false },
    { key: 'hhalf', name: '高位半贴', price: 80, custom: false },
    { key: 'jiamo', name: '甲膜', price: 30, custom: false },
    { key: 'half', name: '半贴', price: 60, custom: false },
    { key: 'shallow', name: '浅贴', price: 50, custom: false }
  ],
  removeNail: [
    { key: 'rn_self', name: '卸本甲', price: 20, custom: false },
    { key: 'rn_tip', name: '卸甲片', price: 30, custom: false },
    { key: 'rn_hard', name: '特别难卸除', price: 40, custom: false }
  ],
  lash: [
    { key: 'yy', name: 'YY 三叶草', price: 168, custom: false },
    { key: 'baby', name: '单根婴儿弯', price: 198, custom: false },
    { key: 'fairy', name: '仙子款穿插', price: 238, custom: false },
    { key: 'sun', name: '太阳花穿插', price: 218, custom: false },
    { key: 'miniComic', name: '小漫画', price: 258, custom: false },
    { key: 'bigComic', name: '大漫画狐兔系', price: 298, custom: false },
    { key: 'lower', name: '下睫毛', price: 68, custom: false }
  ],
  removeLash: [
    { key: 'rl_std', name: '卸睫毛', price: 20, custom: false }
  ]
};

/**
 * 消费端查找定价项：先按 key 匹配，找不到再按 name 匹配。
 * 兼容：旧数据 a.style 可能存的是旧 key 或旧 name（扣卡弹窗用 name 存值）
 */
function _lookupPrice(group, keyOrName) {
  if (!keyOrName) return null;
  const list = (State.prices && State.prices[group]) || [];
  return list.find(x => x && x.key === keyOrName)
      || list.find(x => x && x.name === keyOrName)
      || null;
}

/**
 * 初始化时确保每个分类下每条项目都有稳定唯一 key。
 * 老用户的 State.prices 可能从早期版本升级而来，缺 key。
 */
function _ensurePriceKeys() {
  let changed = false;
  if (!State.prices) State.prices = {};
  PRICE_GROUP_ORDER.forEach(g => {
    const fallback = JSON.parse(JSON.stringify(DEFAULT_PRICES[g] || []));
    if (!Array.isArray(State.prices[g])) { State.prices[g] = fallback; changed = true; }
    const beforeLen = State.prices[g].length;
    State.prices[g] = State.prices[g].filter(item => item && typeof item === 'object');
    if (State.prices[g].length !== beforeLen) changed = true;
    if (!State.prices[g].length) { State.prices[g] = fallback; changed = true; }
    State.prices[g].forEach(item => {
      if (!item.key) { item.key = genId('P'); changed = true; }
      if (item.custom == null) { item.custom = !!item.custom; changed = true; }
      if (item.name == null) { item.name = '未命名'; changed = true; }
      if (item.price == null || isNaN(Number(item.price))) { item.price = 0; changed = true; }
    });
  });
  return changed;
}
function touchPriceConfig() {
  if (!State.prices || typeof State.prices !== 'object') State.prices = {};
  State.prices.__updatedAt = Date.now();
  State.prices.__updatedBy = currentUserName();
  State.prices.__syncVersion = (Number(State.prices.__syncVersion) || 0) + 1;
}
function backupPriceConfig() {
  try {
    if (!State.prices || _isDefaultPriceConfig(State.prices)) return;
    localStorage.setItem('lhn_prices_backup', JSON.stringify(State.prices));
    localStorage.setItem('lhn_prices_backup_ts', String(State.prices.__updatedAt || Date.now()));
  } catch(e) {}
}
function restorePriceConfigIfReset() {
  try {
    const raw = localStorage.getItem('lhn_prices_backup');
    if (!raw) return false;
    const backup = JSON.parse(raw);
    if (!backup || _isDefaultPriceConfig(backup)) return false;
    const curDefault = _isDefaultPriceConfig(State.prices);
    const curTs = _configBlockTime(State.prices);
    const bakTs = _configBlockTime(backup) || Number(localStorage.getItem('lhn_prices_backup_ts') || 0);
    if (curDefault || (bakTs && bakTs > curTs)) {
      State.prices = backup;
      _ensurePriceKeys();
      localStorage.setItem('lhn_prices', JSON.stringify(State.prices));
      return true;
    }
  } catch(e) {}
  return false;
}

// 定价弹窗：当前打开模式（单分类 / 全部分类） & 当前激活 Tab
let _priceModalCtx = { singleGroup: null, activeGroup: null };

/** 渲染一个分类的完整卡片（头部 + 每行项目） */
function _renderPriceGroupCard(group) {
  const meta = PRICE_GROUP_META[group];
  if (!meta || !Array.isArray(State.prices[group])) return '';
  const list = State.prices[group].filter(p => p && typeof p === 'object');
  const rows = list.map((p, i) => {
    const isFirst = i === 0;
    const isLast  = i === list.length - 1;
    const keepOne = list.length <= 1;
    const custom = !!p.custom;
    return `
      <div class="pe-item-row">
        <div class="pe-order-btns">
          <button class="pe-order-btn" title="上移" ${isFirst?'disabled':''} onclick="_movePriceItem('${group}', ${i}, -1)">↑</button>
          <button class="pe-order-btn" title="下移" ${isLast?'disabled':''}  onclick="_movePriceItem('${group}', ${i}, +1)">↓</button>
        </div>
        <input type="text" class="pe-name-input" value="${escapeHtml(p.name || '')}"
               data-group="${group}" data-idx="${i}" placeholder="项目名称"
               style="min-width:110px; width:100%; font-size:14px; color:#1F2740; display:block; visibility:visible; flex:1 1 auto;" />
        <label class="pe-mode-toggle" title="勾选后不设固定价，开单时手填">
          <input type="checkbox" class="pei-custom-cb" ${custom?'checked':''}
                 data-group="${group}" data-idx="${i}" onchange="_onCustomToggle(this)" />
          手动模式
          ${custom ? '<span class="pe-mode-tag-inline">开单时手填</span>' : ''}
        </label>
        <div class="pe-price-input-wrap ${custom?'disabled':''}">
          <span>¥</span>
          <input type="number" min="0" step="1" class="pe-price-input pei-input"
                 value="${Number(p.price||0)}" ${custom?'disabled':''}
                 style="font-size:14px; color:#1F2740; display:block; visibility:visible;"
                 data-group="${group}" data-idx="${i}" />
        </div>
        <button class="pe-del-btn" title="删除该项目" ${keepOne?'disabled':''}
                onclick="_delPriceItem('${group}', ${i})">🗑</button>
      </div>
    `;
  }).join('');

  return `
    <section class="pe-group-card" data-group="${group}">
      <div class="pe-group-head">
        <div class="pe-group-title">
          <span class="pe-group-dot" style="background:${meta.dot};"></span>
          <span>${meta.title}</span>
          <span style="font-size:11px;color:var(--muted);font-weight:500;">（${list.length} 项）</span>
        </div>
        <button class="pe-add-btn" onclick="_addPriceItem('${group}')">➕ 新增项目</button>
      </div>
      <div class="pe-item-list">${rows}</div>
    </section>
  `;
}

/** 手动模式切换：联动价格输入框的禁用态与标签显示，不重渲染整卡以保留焦点 */
function _onCustomToggle(cb) {
  const wrap = cb.closest('.pe-item-row');
  if (!wrap) return;
  const priceWrap = wrap.querySelector('.pe-price-input-wrap');
  const priceInp  = wrap.querySelector('.pe-price-input');
  const tag = wrap.querySelector('.pe-mode-tag-inline');
  if (cb.checked) {
    if (priceWrap) priceWrap.classList.add('disabled');
    if (priceInp)  priceInp.disabled = true;
    if (!tag) {
      const span = document.createElement('span');
      span.className = 'pe-mode-tag-inline';
      span.textContent = '开单时手填';
      cb.parentElement.appendChild(span);
    }
  } else {
    if (priceWrap) priceWrap.classList.remove('disabled');
    if (priceInp)  priceInp.disabled = false;
    if (tag) tag.remove();
  }
}

function _addPriceItem(group) {
  if (!Array.isArray(State.prices[group])) State.prices[group] = [];
  State.prices[group].push({ key: genId('P'), name: '新项目', price: 0, custom: false });
  _rerenderPriceModalBody();
}
function _delPriceItem(group, idx) {
  const list = State.prices[group];
  if (!Array.isArray(list) || list.length <= 1) { toast('至少保留 1 个项目', 'error'); return; }
  const cur = list[idx];
  const tip = cur && cur.name ? `「${cur.name}」` : '该项目';
  if (!confirm(`确认删除 ${tip}？\n该项目仍会保留在历史预约记录中，只是下拉不再出现。`)) return;
  list.splice(idx, 1);
  _rerenderPriceModalBody();
}
function _movePriceItem(group, idx, dir) {
  const list = State.prices[group];
  if (!Array.isArray(list)) return;
  const target = idx + dir;
  if (target < 0 || target >= list.length) return;
  const tmp = list[idx]; list[idx] = list[target]; list[target] = tmp;
  _rerenderPriceModalBody();
}
function _resetPriceGroup(group) {
  if (!PRICE_GROUP_META[group]) return;
  const title = PRICE_GROUP_META[group].title;
  if (!confirm(`确认把「${title}」恢复为系统默认项目？\n将丢失当前分类下的自定义顺序/名称/新增项目。`)) return;
  // 深拷贝默认配置，避免引用共享
  State.prices[group] = JSON.parse(JSON.stringify(DEFAULT_PRICES[group] || []));
  _rerenderPriceModalBody();
  toast(`「${title}」已恢复默认`, 'success');
}
/** 恢复默认按钮：单分类模式就重置该分类；全部分类模式就按当前激活 Tab 重置 */
function _resetActivePriceGroup() {
  const g = _priceModalCtx.singleGroup || _priceModalCtx.activeGroup;
  if (!g) {
    if (!confirm('将把 5 个分类全部恢复为默认项目，确认继续？')) return;
    PRICE_GROUP_ORDER.forEach(grp => {
      State.prices[grp] = JSON.parse(JSON.stringify(DEFAULT_PRICES[grp] || []));
    });
    _rerenderPriceModalBody();
    toast('所有分类已恢复默认', 'success');
    return;
  }
  _resetPriceGroup(g);
}

/** Tab 切换（仅在「全部」模式下使用） */
function _switchPriceTab(group) {
  _priceModalCtx.activeGroup = group;
  // 更新 Tab 选中态
  document.querySelectorAll('#priceTabBar .pe-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.group === group);
  });
  // 卡片显示：对应 group 显示，其余隐藏
  document.querySelectorAll('#priceEditList .pe-group-card').forEach(card => {
    card.style.display = (card.dataset.group === group) ? '' : 'none';
  });
  // 恢复默认按钮文案
  const resetBtn = document.getElementById('priceResetAllBtn');
  if (resetBtn) {
    const m = PRICE_GROUP_META[group];
    resetBtn.textContent = `↺ 恢复「${m ? m.title : ''}」默认项目`;
  }
}

/** 重渲染整个弹窗 body（保留外层 modal 不关闭） */
function _rerenderPriceModalBody() {
  const listEl = document.getElementById('priceEditList');
  if (!listEl) return;
  const ctx = _priceModalCtx;
  if (ctx.singleGroup) {
    listEl.innerHTML = _renderPriceGroupCard(ctx.singleGroup);
  } else {
    // 全部 5 个分类
    listEl.innerHTML = PRICE_GROUP_ORDER.map(g => _renderPriceGroupCard(g)).join('');
    // 如果有 activeGroup，隐藏其他
    if (ctx.activeGroup) {
      document.querySelectorAll('#priceEditList .pe-group-card').forEach(card => {
        card.style.display = (card.dataset.group === ctx.activeGroup) ? '' : 'none';
      });
    }
  }
}

/** 弹窗：刷新 Tab 栏 + 恢复默认按钮文案 */
function _refreshPriceTabBar() {
  const ctx = _priceModalCtx;
  const tabBar = document.getElementById('priceTabBar');
  const resetBtn = document.getElementById('priceResetAllBtn');
  if (!tabBar || !resetBtn) return;
  if (ctx.singleGroup) {
    tabBar.style.display = 'none';
    tabBar.innerHTML = '';
    const m = PRICE_GROUP_META[ctx.singleGroup];
    resetBtn.textContent = `↺ 恢复「${m ? m.title : ''}」默认项目`;
  } else {
    tabBar.style.display = 'inline-flex';
    if (!ctx.activeGroup) ctx.activeGroup = PRICE_GROUP_ORDER[0];
    tabBar.innerHTML = PRICE_GROUP_ORDER.map(g => {
      const m = PRICE_GROUP_META[g];
      return `<button type="button" class="pe-tab-btn ${ctx.activeGroup===g?'active':''}"
                      data-group="${g}" onclick="_switchPriceTab('${g}')">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${m.dot};margin-right:6px;vertical-align:middle;"></span>${m.title}
              </button>`;
    }).join('');
    const m = PRICE_GROUP_META[ctx.activeGroup];
    resetBtn.textContent = `↺ 恢复「${m ? m.title : ''}」默认项目`;
  }
}

// ============ 初始化 ============
// 正式版必须先完成登录流程，再由 _afterLoginOk() 调用 init()。
// 不能在 DOMContentLoaded 直接初始化，否则手机端会绕过登录先看到首页和本地旧数据。

function init() {
  // 加载本地存储
  State.prices = load('prices', State.prices);
  const fixedPrices = _ensurePriceKeys();
  restorePriceConfigIfReset();
  if (fixedPrices) { try { save('prices', State.prices); backupPriceConfig(); } catch(e) {} }
  // 【🎨 定价 ↔ 颜色 联动 · 启动兜底】每次 init 都补一次默认色，保证新增项目日历里能立即看到色块
  // ⚠️ 启动时只写本地，不推云端——避免手机旧颜色启动时覆盖电脑刚保存的新颜色
  try { window.__LH_SILENT_SAVE = true; State.calColors = load('calColors', State.calColors); syncColorsWithPrices(null); } catch(e){} finally { try { window.__LH_SILENT_SAVE = false; } catch(_){} }
  /* 【甲膜】启动时的两步升级：
     Step1 - 补缺失：没有 jiamo 就插到「高位半贴」后面；没有 reuse 就插到「本甲」后面
     Step2 - 重排序：如果有 jiamo 但位置不对（比如在本甲后面），统一挪到高位半贴后面
     → 无论新老用户，价格/名称/用户改好的单价都不被覆盖，只改顺序 */
  (function upgradePricesTip(){
    try {
      const list = State.prices && State.prices.tip;
      if (!Array.isArray(list)) return;
      let changed = false;
      // Step 1: 补缺失
      if (!list.some(x => x && x.key === 'jiamo')) {
        const idx = list.findIndex(x => x && x.key === 'hhalf');
        const jiamo = { key: 'jiamo', name: '甲膜', price: 30 };
        if (idx >= 0) list.splice(idx + 1, 0, jiamo);
        else list.push(jiamo);
        changed = true;
      }
      // 补缺失 - 二次利用（插到「本甲」后面）
      if (!list.some(x => x && x.key === 'reuse')) {
        const idx = list.findIndex(x => x && x.key === 'self');
        const reuse = { key: 'reuse', name: '二次利用', price: 60 };
        if (idx >= 0) list.splice(idx + 1, 0, reuse);
        else list.unshift(reuse);
        changed = true;
      }
      // Step 2: 强制顺序 = self → reuse → hhalf → jiamo → half → shallow
      // （不丢项，保留用户的价格/名称；加 v1 版本标记兜底，即使之前的错误判断没触发也会强制重排一次）
      const ORDER = ['self', 'reuse', 'hhalf', 'jiamo', 'half', 'shallow'];
      const curKeys = list.map(x => x && x.key).filter(Boolean);
      // 【BUG修复】之前左右两边都是 ORDER.filter(...)，永远相等，wrongOrder 永远 false
      const curOrder = curKeys.filter(k => ORDER.includes(k)).join(',');
      const expOrder = ORDER.filter(k => curKeys.includes(k)).join(',');
      let forceReorder = (curOrder !== expOrder);
      // v1 版本兜底：即使顺序看上去相等，本次升级强制重排一次（修复之前因为 bug 没重排的用户）
      try {
        if (localStorage.getItem('lhn_reorder_v1') !== '1') {
          forceReorder = true;
          localStorage.setItem('lhn_reorder_v1', '1');
        }
      } catch (e) {}
      if (forceReorder) {
        const byKey = new Map(list.map(x => [x.key, x]));
        const sorted = ORDER.filter(k => byKey.has(k)).map(k => byKey.get(k));
        curKeys.forEach(k => { if (!ORDER.includes(k) && byKey.has(k)) sorted.push(byKey.get(k)); });
        list.length = 0;
        sorted.forEach(x => list.push(x));
        changed = true;
      }
      if (changed) save('prices', State.prices);
    } catch (e) {}
  })();
  State.appointments = normalizeCoreCollection('appointments', load('appointments', State.appointments));
  State.images = normalizeCoreCollection('images', load('images', State.images || []));
  State.auditLogs = load('auditLogs', State.auditLogs || []);
  try { autoExpireGoldMembers(); } catch(e) {}
  try { purgeLegacyDemoData(); } catch(e) {}
  State.bgImages = load('bgImages', State.bgImages);
  State.customText = load('customText', State.customText);

  // 今日日期显示
  const today = new Date();
  const w = ['日','一','二','三','四','五','六'][today.getDay()];
  const btn = document.getElementById('todayBtn');
  if (btn) btn.textContent = `${today.getMonth()+1}/${today.getDate()} 周${w}`;
  if (btn) btn.title = '今日';

  // 应用自定义文案
  applyCustomText();

  // 应用背景图
  applyBgImages();

  // 导航切换
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => switchPage(el.dataset.page));
  });

  // 背景图上传 - Sidebar
  const bgSide = document.getElementById('sidebarBgInput');
  if (bgSide) bgSide.addEventListener('change', e => handleBgUpload(e, 'sidebar'));
  // 背景图上传 - 今日汇总
  const bgSum = document.getElementById('summaryBgInput');
  if (bgSum) bgSum.addEventListener('change', e => handleBgUpload(e, 'summary'));
  const bgSumReset = document.getElementById('summaryBgReset');
  if (bgSumReset) bgSumReset.addEventListener('click', resetSummaryBg);

  // 参考图上传
  const ref = document.getElementById('refImgInput');
  if (ref) ref.addEventListener('change', handleRefUpload);

  // 渲染首页今日预约
  try { renderTodayAppointments(); } catch(e) { console.warn('renderTodayAppointments:', e); }
  // 渲染首页汇总
  try { renderDashboardSummary(); } catch(e) { console.warn('renderDashboardSummary:', e); }
  // 渲染首页最近动态
  try { renderRecentActivity(); } catch(e) { console.warn('renderRecentActivity:', e); }
  // 渲染首页数据概览（7天/月/年）
  try { renderOverviewStats(); } catch(e) { console.warn('renderOverviewStats:', e); }
  // 渲染预约列表
  try { renderApptTable(); } catch(e) { console.warn('renderApptTable:', e); }
  // 渲染价格选项
  try { renderPriceOptions(); } catch(e) { console.warn('renderPriceOptions:', e); }
  // 渲染日历
  try { renderCalendar(); } catch(e) { console.warn('renderCalendar:', e); }

  // 默认时间
  const dt = document.getElementById('f_datetime');
  if (dt) dt.value = getToday(14, 0);
}

function applyCustomText() {
  Object.keys(State.customText).forEach(f => {
    const el = document.querySelector(`[data-field="${f}"]`);
    if (el) el.textContent = State.customText[f];
  });
}

function handleBgUpload(e, type) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('请选择图片文件', 'error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    State.bgImages[type] = ev.target.result;
    save('bgImages', State.bgImages);
    applyBgImages();
    toast('背景图已更换', 'success');
  };
  reader.readAsDataURL(file);
}
function setBg(e, type) { handleBgUpload(e, type); }

function applyBgImages() {
  const bp1 = document.getElementById('bgpBanner');
  if (bp1 && State.bgImages.banner) {
    bp1.style.backgroundImage = `url(${State.bgImages.banner})`;
  }
  // Sidebar
  const sb = document.querySelector('.sidebar-brand');
  if (sb && State.bgImages.sidebar) {
    sb.style.backgroundImage = `url(${State.bgImages.sidebar})`;
    sb.style.backgroundSize = 'cover';
    sb.style.backgroundPosition = 'center';
  }
  const bp2 = document.getElementById('bgpSidebar');
  if (bp2 && State.bgImages.sidebar) {
    bp2.style.backgroundImage = `url(${State.bgImages.sidebar})`;
  }
  // 今日汇总
  applySummaryBg();
}

function applySummaryBg() {
  const s = document.getElementById('summaryBlock');
  if (!s) return;
  const resetBtn = document.getElementById('summaryBgReset');
  if (State.bgImages.summary) {
    s.style.backgroundImage = `url(${State.bgImages.summary})`;
    if (resetBtn) resetBtn.style.display = '';
  } else {
    // 恢复 CSS 默认（quick_report.jpg）
    s.style.backgroundImage = '';
    if (resetBtn) resetBtn.style.display = 'none';
  }
  // 同步刷新设置页「今日汇总背景」预览缩略图
  const bp3 = document.getElementById('bgpSummary');
  if (bp3) {
    if (State.bgImages.summary) {
      bp3.style.backgroundImage = `url(${State.bgImages.summary})`;
    } else {
      bp3.style.backgroundImage = '';
    }
  }
}

function resetSummaryBg() {
  if (!confirm('确定要恢复今日汇总的默认背景吗？')) return;
  delete State.bgImages.summary;
  save('bgImages', State.bgImages);
  applySummaryBg();
  toast('已恢复默认背景', 'success');
}

// ============ 页面切换 ============
function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  const nv = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (nv) nv.classList.add('active');
  // 面包屑：严格对应侧边栏 8 大板块，不再包含已删除的旧预约管理/本月报表独立页
  const names = {
    dashboard: '🏠 工作台首页', schedule: '📆 日程 / 预约',
    income: '💰 收入', expense: '💸 支出', members: '👑 会员管理',
    stats: '📊 统计', settings: '⚙️ 设置', customers: '👥 顾客管理'
  };
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = names[name] || name;
  // 页面专属刷新
  if (name === 'schedule') {
    renderCalendar();
    renderApptTable();
    if (State.curSelectedDay) {
      renderDayDetail(State.curSelectedDay);
    } else {
      const t = todayDateStr();
      State.curSelectedDay = t;
      renderDayDetail(t);
    }
  }
  // 滚动到顶
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function goTodaySchedule() {
  const t = todayDateStr();
  State.curSelectedDay = t;
  switchPage('schedule');
  setTimeout(() => {
    try { renderCalendar(); } catch(e) {}
    try { renderDayDetail(t); } catch(e) {}
    const el = document.getElementById('dayDetailSection');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 80);
}

// ============ 渲染：今日预约 ============
function renderTodayAppointments() {
  const list = document.getElementById('todayApptList');
  if (!list) return;
  const today = new Date();
  const todayStr = localDateStr(today);
  const todays = activeRows(State.appointments)
    .filter(a => a.status !== 'canceled' && a.datetime.startsWith(todayStr))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const elC = document.getElementById('todayApptCount');
  if (elC) elC.textContent = todays.length;
  const income = todays
    .filter(a => a.status !== 'canceled')
    .reduce((s, a) => s + a.finalTotal, 0);
  const elI = document.getElementById('todayIncome');
  if (elI) elI.textContent = '¥' + Math.round(income);

  if (todays.length === 0) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px;">今天还没有预约，去休息一下吧~ ☕</div>';
    return;
  }
  list.innerHTML = todays.map(a => {
    const d = fmtDate(a.datetime);
    const mem = memberLabel(a.member);
    const styleName = _lookupPrice('style', a.style)?.name || '-';
    const tipName   = _lookupPrice('tip',   a.tip)?.name   || '-';
    return `
      <div class="appt-item" onclick="openApptModal('${a.id}')">
        <div class="appt-time">
          <div class="at-h">${d.h}:${d.mi}</div>
          <div class="at-d">${d.m}月${d.day}日</div>
        </div>
        <div class="appt-info">
          <div class="appt-name">
            ${a.customer}
            ${mem.tag ? `<span class="appt-tag ${mem.cls||''}">${mem.tag}${(mem.label||'').replace('会员','')}</span>` : ''}
          </div>
          <div class="appt-detail">${styleName} · ${tipName} · ${fmtMoney(a.finalTotal)}</div>
        </div>
        <span class="status ${a.status}">${statusLabel(a.status)}</span>
      </div>`;
  }).join('');
}

// ============ 渲染：预约管理表格 ============
function renderApptTable() {
  const tb = document.getElementById('apptTableBody');
  if (!tb) return;

  // --- 筛选 ---
  const q = (document.getElementById('schSearch')?.value || '').trim().toLowerCase();
  const fStatus = document.getElementById('schStatus')?.value || '';
  const fBiz = document.getElementById('schBiz')?.value || '';
  const fRange = document.getElementById('schRange')?.value || '';
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  function weekStart(d) { const t = new Date(d); const day = (t.getDay()+6)%7; t.setDate(t.getDate()-day); t.setHours(0,0,0,0); return t; }
  const wkS = weekStart(todayStart); const wkE = new Date(wkS); wkE.setDate(wkE.getDate()+6); wkE.setHours(23,59,59,999);
  const mS = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const mE = new Date(todayStart.getFullYear(), todayStart.getMonth()+1, 0, 23,59,59,999);
  const n7S = new Date(todayStart); const n7E = new Date(todayStart); n7E.setDate(n7E.getDate()+7); n7E.setHours(23,59,59,999);
  function inRange(ts) {
    if (!fRange) return true;
    if (fRange === 'today') return ts >= todayStart && ts <= todayEnd;
    if (fRange === 'week') return ts >= wkS && ts <= wkE;
    if (fRange === 'month') return ts >= mS && ts <= mE;
    if (fRange === 'next7') return ts >= n7S && ts <= n7E;
    return true;
  }

  let list = activeRows(State.appointments).filter(a => {
    if (!fStatus && a.status === 'canceled') return false;
    if (q) {
      const hit = (a.customer || '').toLowerCase().includes(q) ||
                  (a.phone || '').includes(q) ||
                  (a.id || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (fStatus && a.status !== fStatus) return false;
    if (fBiz && a.biz !== fBiz) return false;
    const ts = new Date(a.datetime).getTime();
    if (!inRange(ts)) return false;
    return true;
  });

  // --- 菜单徽章（全局待办数）---
  const pendingSet = new Set(['pending', 'confirmed']);
  const pendingCount = activeRows(State.appointments).filter(a => pendingSet.has(a.status)).length;
  const badge = document.getElementById('menuApptBadge');
  if (badge) {
    if (pendingCount > 0) { badge.textContent = pendingCount; badge.style.display = ''; }
    else badge.style.display = 'none';
  }
  // --- 清单计数 ---
  const cntEl = document.getElementById('schCount');
  if (cntEl) cntEl.textContent = `共 ${list.length} 条`;

  list.sort((a, b) => b.datetime.localeCompare(a.datetime));
  tb.innerHTML = list.map(a => {
    const d = fmtDate(a.datetime);
    const mem = memberLabel(a.member);
    const tk = apptTypeKey(a);
    const col = apptColor(a);
    const meta = CAL_TYPE_META.find(m => m.key === tk) || CAL_TYPE_META[0];

    // 业务标签
    const bizTag = a.biz === 'lash'
      ? `<span class="appt-tag" style="background:#FDEAEA;color:#C76161;border:1px solid #F6CFCF;">👁️ 美睫</span>`
      : `<span class="appt-tag" style="background:#E6F1F9;color:#3F86B2;border:1px solid #C9DFF2;">💅 美甲</span>`;

    // 项目明细
    let itemText = '';
    if (a.biz === 'lash') {
      const lname = _lookupPrice('lash', a.lash)?.name || '-';
      const rl = _lookupPrice('removeLash', a.removeLash)?.name;
      itemText = `👁️ ${lname}` + (rl ? ` / ♻️ 卸睫` : '');
    } else {
      const sname = _lookupPrice('style', a.style)?.name || '-';
      const tname = _lookupPrice('tip',   a.tip)?.name   || '-';
      const rn = _lookupPrice('removeNail', a.removeNail)?.name;
      itemText = `🎨 ${sname} · 💅 ${tname}` + (rn ? ` / ♻️ ${rn}` : '');
    }
    const itemWithColor = `
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <span style="display:inline-block;width:4px;align-self:stretch;border-radius:3px;background:${col};flex-shrink:0;margin:2px 0;"></span>
        <div style="min-width:0;">
          <div style="font-size:12px;color:var(--muted);font-weight:500;margin-bottom:2px;">${meta.icon} ${meta.label}</div>
          <div style="font-size:13px;color:var(--ink);font-weight:500;line-height:1.4;">${itemText}</div>
        </div>
      </div>`;

    const imgHtml = a.images && a.images.length > 0
      ? `<div class="ref-imgs">
          ${a.images.slice(0, 3).map(ref => {
            const src = resolveImageSrc(ref);
            return `<div class="ref-thumb" onclick="showLightbox('${src.replace(/'/g,"\\'")}')"><img src="${src}"></div>`;
          }).join('')}
          ${a.images.length > 3 ? `<div class="ref-more">+${a.images.length - 3}</div>` : ''}
        </div>`
      : '<span style="color:var(--muted);font-size:12px;">—</span>';
    const staffText = a.staffName || staffNameById(a.staffId || a.technicianId || a.serviceStaffId) || '未指定';
    const durText = formatApptDurationHours(a);
    return `
      <tr>
        <td style="font-weight:600;color:var(--accent);">${a.id}</td>
        <td>${escapeHtml(a.customer || '')}</td>
        <td>${mem.tag ? `<span class="appt-tag ${mem.cls}">${mem.tag} ${mem.label}</span>` : '<span style="color:var(--muted);font-size:12px;">非会员</span>'}</td>
        <td>${d.full}</td>
        <td><div style="font-size:13px;font-weight:600;color:var(--ink);">${escapeHtml(staffText)}</div><div style="font-size:12px;color:var(--muted);">${durText}</div></td>
        <td>${bizTag}</td>
        <td style="min-width:260px;">${itemWithColor}</td>
        <td>${imgHtml}</td>
        <td style="color:var(--muted);">${fmtMoney(a.originalTotal || 0)}</td>
        <td style="font-weight:700;color:var(--accent);">${fmtMoney(a.finalTotal || 0)}</td>
        <td><span class="status ${a.status}">${statusLabel(a.status)}</span></td>
        <td>
          <button class="op-btn" style="background:#EEF5FB;color:#3F86B2;border-color:#CFE1F2;" onclick="openApptDetail('${a.id}')">🔍 详情</button>
          <button class="op-btn" onclick="openApptModal('${a.id}')">编辑</button>
          <button class="op-btn danger" onclick="deleteAppt('${a.id}')">删除</button>
        </td>
      </tr>`;
  }).join('');
  if (list.length === 0) {
    tb.innerHTML = `<tr><td colspan="12" style="padding:48px 0;text-align:center;color:var(--muted);font-size:13px;">🍵 还没有符合条件的预约</td></tr>`;
  }
}

function defaultApptDatetimeForDate(dateStr) {
  const ds = String(dateStr || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) return `${ds}T14:00`;
  return getToday(14, 0);
}

// ============ 新建/编辑预约弹窗 ============
function ensureApptDeductLinkUI() {
  try {
    if (document.getElementById('apptDeductLinkWrap')) return;
    const priceSection = Array.from(document.querySelectorAll('#apptModal .subsection h4'))
      .find(h => (h.textContent || '').includes('价格计算'))?.closest('.subsection');
    if (!priceSection) return;
    const tabs = priceSection.querySelector('.biz-tabs');
    const div = document.createElement('div');
    div.className = 'price-panel';
    div.id = 'apptDeductLinkWrap';
    div.style.cssText = 'border:1px solid #D8E7D5;background:#F7FBF5;';
    div.innerHTML = `
      <div class="price-panel-head">
        <span>🔗 关联已扣卡记录</span>
        <span style="font-size:11px;color:var(--muted);font-weight:normal;">同一天、同顾客、同金额，避免重复扣卡</span>
      </div>
      <select class="form-input" id="f_linkDeductTxn" onchange="onApptDeductLinkChange()">
        <option value="">不关联已扣卡记录</option>
      </select>
      <div id="apptDeductLinkHint" style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:6px;">
        选择顾客、日期和项目金额后，会自动匹配当天同金额的会员扣卡记录。
      </div>
    `;
    if (tabs && tabs.nextSibling) priceSection.insertBefore(div, tabs.nextSibling);
    else priceSection.appendChild(div);
  } catch(e) {}
}
function openApptModal(id = null, defaultDate = null) {
  State.editingId = id;
  State.refImages = [];
  State.selected = { style: null, tip: null, removeNail: null, lash: null, removeLash: null, customPrice: 0, manualPrices: {}, manualTouched: {} };
  State.biz = 'nail';

  document.getElementById('apptModalTitle').textContent = id ? '📅 编辑预约' : '📅 新建预约';
  // 清空
  const oldSel = document.getElementById('f_customerSel');
  if (oldSel) oldSel.value = '';
  document.getElementById('f_customerSearch').value = '';
  document.getElementById('f_customer').value = '';
  document.getElementById('f_phone').value = '';
  document.getElementById('f_member').value = '';
  document.getElementById('f_remark').value = '';
  document.getElementById('f_customPrice').value = '';
  document.getElementById('f_datetime').value = defaultApptDatetimeForDate(defaultDate);
  if (document.getElementById('f_duration')) document.getElementById('f_duration').value = durationMinutesToHoursValue(defaultApptDurationMinutes(State.biz), State.biz);
  renderStaffOptions('');
  const hint = document.getElementById('apptConflictHint');
  if (hint) { hint.style.display = 'none'; hint.textContent = ''; }
  ensureApptDeductLinkUI();
  const linkSel = document.getElementById('f_linkDeductTxn');
  if (linkSel) linkSel.innerHTML = '<option value="">不关联已扣卡记录</option>';
  const linkWrap = document.getElementById('apptDeductLinkWrap');
  if (linkWrap) linkWrap.style.display = '';
  document.getElementById('customPricePanel').style.display = 'none';
  // 重置 Tab
  switchBizTab('nail', true);
  // 填充顾客下拉
  populateApptCustomerSel();
  // 清空参考图
  renderUploadGrid();

  // 如果是编辑
  if (id) {
    const a = activeRows(State.appointments).find(x => x.id === id);
    if (a) {
      State.biz = a.biz || 'nail';
      switchBizTab(State.biz, true);
      document.getElementById('f_customer').value = a.customer;
      document.getElementById('f_phone').value = a.phone;
      document.getElementById('f_member').value = a.member;
      document.getElementById('f_remark').value = a.remark || '';
      document.getElementById('f_datetime').value = a.datetime;
      if (document.getElementById('f_duration')) document.getElementById('f_duration').value = durationMinutesToHoursValue(getApptDuration(a), a.biz || State.biz);
      renderStaffOptions(a.staffId || a.technicianId || a.serviceStaffId || '');
      State.refImages = [...(a.images || [])];
      State.selected.style = a.style || null;
      State.selected.tip = a.tip || null;
      State.selected.removeNail = a.removeNail || null;
      State.selected.lash = a.lash || null;
      State.selected.removeLash = a.removeLash || null;
      State.selected.manualPrices = { ...(a.itemPrices || a.priceOverrides || {}) };
      State.selected.manualTouched = {};
      Object.keys(State.selected.manualPrices).forEach(g => { State.selected.manualTouched[g] = true; });
      // 如果是 custom 款式，填入价格
      const st = _lookupPrice('style', a.style);
      if (st && st.custom) {
        const tipP = _lookupPrice('tip', a.tip)?.price || 0;
        const rnP  = _lookupPrice('removeNail', a.removeNail)?.price || 0;
        State.selected.customPrice = (a.originalTotal || 0) - tipP - rnP;
        document.getElementById('f_customPrice').value = State.selected.customPrice;
        document.getElementById('customPricePanel').style.display = 'block';
      }
      renderUploadGrid();
    }
  }

  renderPriceOptions(true);
  syncManualPriceControls();
  calcPrice();
  previewApptConflict();
  refreshApptDeductLinkOptions();
  document.getElementById('apptModal').classList.add('show');
}
function closeApptModal() {
  document.getElementById('apptModal').classList.remove('show');
  State.editingId = null;
}
function staffOptions() {
  const users = activeRows(State.users || []);
  const active = users.filter(u => (u.status || 'active') !== 'disabled');
  const techs = active.filter(u => ['tech','staff','manager','owner'].includes(u.role || ''));
  return (techs.length ? techs : active).map(u => ({
    id: u.id || u.username || u.name,
    name: u.name || u.username || u.id || '未命名'
  }));
}
function renderStaffOptions(selectedId) {
  const el = document.getElementById('f_staff');
  if (!el) return;
  const opts = staffOptions();
  const cur = selectedId || (State.currentUser?.role === 'tech' ? (State.currentUser.id || State.currentUser.username) : '');
  el.innerHTML = `<option value="">未指定</option>` + opts.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
  if (cur && opts.some(o => String(o.id) === String(cur))) el.value = cur;
}
function staffNameById(id) {
  if (!id) return '';
  return staffOptions().find(o => String(o.id) === String(id))?.name || id;
}
function getApptDuration(a) {
  const h = Number(a?.durationHours || a?.durationHour || 0);
  if (h > 0) return Math.round(h * 60);
  const n = Number(a?.durationMinutes || a?.duration || 0);
  if (n > 0) return n;
  return defaultApptDurationMinutes(a?.biz);
}
function findApptConflict({ id, datetime, durationMinutes, staffId }) {
  if (!datetime || !staffId) return null;
  const start = new Date(datetime).getTime();
  const dur = Math.max(15, Number(durationMinutes) || defaultApptDurationMinutes(State.biz));
  const end = start + dur * 60000;
  if (!Number.isFinite(start)) return null;
  const busyStatuses = new Set(['pending','confirmed']);
  return activeRows(State.appointments).find(a => {
    if (!a || a.id === id) return false;
    if (!busyStatuses.has(normalizeApptStatus(a.status))) return false;
    const aid = a.staffId || a.technicianId || a.serviceStaffId || '';
    if (!aid || String(aid) !== String(staffId)) return false;
    const s2 = new Date(a.datetime).getTime();
    const e2 = s2 + getApptDuration(a) * 60000;
    return start < e2 && end > s2;
  }) || null;
}
function previewApptConflict() {
  const hint = document.getElementById('apptConflictHint');
  if (!hint) return null;
  const data = {
    id: State.editingId || '',
    datetime: document.getElementById('f_datetime')?.value || '',
    durationMinutes: durationHoursInputToMinutes(document.getElementById('f_duration')?.value || 0, State.biz),
    staffId: document.getElementById('f_staff')?.value || ''
  };
  const c = findApptConflict(data);
  if (c) {
    const d = fmtDate(c.datetime);
    hint.style.display = '';
    hint.textContent = `时间冲突：${staffNameById(data.staffId)} 在 ${d.full} 已有「${c.customer || c.id}」预约，建议换时间或换技师。`;
  } else {
    hint.style.display = 'none';
    hint.textContent = '';
  }
  return c;
}

// ============ 预约弹窗：顾客自动搜索（支持姓名/手机/首字母） ============
let _selectedCustomerId = null;
// 简易中文转首字母（基于拼音首字母映射，覆盖常用字；覆盖不到的就用原文首字）
const _pinyinMap = {
  '王':'W','张':'Z','李':'L','赵':'Z','刘':'L','陈':'C','杨':'Y','黄':'H','周':'Z','吴':'W',
  '徐':'X','孙':'S','马':'M','朱':'Z','胡':'H','郭':'G','何':'H','高':'G','林':'L','罗':'L',
  '郑':'Z','梁':'L','谢':'X','宋':'S','唐':'T','许':'X','韩':'H','冯':'F','邓':'D','曹':'C',
  '彭':'P','曾':'Z','萧':'X','田':'T','董':'D','袁':'Y','潘':'P','于':'Y','蒋':'J','蔡':'C',
  '余':'Y','杜':'D','叶':'Y','程':'C','苏':'S','魏':'W','吕':'L','丁':'D','任':'R','沈':'S',
  '姚':'Y','卢':'L','傅':'F','钟':'Z','姜':'J','崔':'C','谭':'T','廖':'L','范':'F','汪':'W',
  '陆':'L','金':'J','石':'S','戴':'D','贾':'J','韦':'W','夏':'X','邱':'Q','方':'F','侯':'H',
  '邹':'Z','熊':'X','孟':'M','秦':'Q','白':'B','江':'J','阎':'Y','薛':'X','尹':'Y','段':'D',
  '雷':'L','黎':'L','史':'S','龙':'L','贺':'H','顾':'G','毛':'M','郝':'H','龚':'G','邵':'S',
  '万':'W','钱':'Q','严':'Y','覃':'Q','武':'W','戚':'Q','柳':'L','乔':'Q','欧阳':'OY','小':'X',
  '美':'M','大':'D','阿':'A','宝':'B','贝':'B','可':'K','爱':'A','仙':'X','女':'N','生':'S',
  '姐':'J','哥':'G','老':'L','师':'S','太':'T','太':'T','公':'G','婆':'P','小':'X'
};
function _pinyinInitial(str) {
  if (!str) return '';
  let out = '';
  for (let ch of str) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toUpperCase();
    else if (_pinyinMap[ch]) out += _pinyinMap[ch];
    else out += ch;
  }
  return out.toUpperCase();
}
function populateApptCustomerSel() {
  // 保留旧接口兼容
  const sel = document.getElementById('f_customerSel');
  if (sel) {
    sel.innerHTML = `<option value="">—— 从顾客档案选择（推荐）——</option>` +
      activeRows(State.customers).map(c => {
        const mem = memberLabel(c.level);
        return `<option value="${c.id}">${c.name}${c.phone ? ' · ' + c.phone : ''}${mem.tag ? ' · ' + mem.tag : ''}</option>`;
      }).join('');
  }
  _selectedCustomerId = null;
  const searchInput = document.getElementById('f_customerSearch');
  if (searchInput) searchInput.value = '';
  const sug = document.getElementById('csSuggestList');
  if (sug) { sug.classList.remove('show'); sug.innerHTML = ''; }
}
function filterCustomerList() {
  const q = (document.getElementById('f_customerSearch')?.value || '').trim();
  const sug = document.getElementById('csSuggestList');
  if (!sug) return;
  const qUp = q.toUpperCase();
  let list = activeRows(State.customers);
  if (qUp) {
    list = list.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = c.phone || '';
      const py = _pinyinInitial(c.name || '');
      return name.includes(q.toLowerCase()) ||
             phone.includes(q) ||
             py.includes(qUp) ||
             py.startsWith(qUp);
    });
  }
  if (list.length === 0) {
    sug.classList.add('show');
    sug.innerHTML = `<div class="cs-si-empty">${q ? '没有匹配的顾客，可直接在下方输入姓名新建' : '暂无顾客档案'}</div>`;
    return;
  }
  sug.classList.add('show');
  sug.innerHTML = list.slice(0, 30).map(c => {
    const mem = memberLabel(c.level);
    return `<div class="cs-suggest-item" onmousedown="pickCustomer('${c.id}')">
      <div class="cs-si-left">
        <div class="cs-si-name">${c.name}${mem.tag ? ' <span style="font-size:11px;font-weight:500;color:var(--accent);">· ' + mem.tag + '</span>' : ''}</div>
        <div class="cs-si-phone">${c.phone || '（未填手机号）'}${c.balance>0 ? ' · 余额 ' + fmtMoney(c.balance) : ''}</div>
      </div>
      <div style="font-size:11px;color:var(--muted);">${_pinyinInitial(c.name)}</div>
    </div>`;
  }).join('');
}
function pickCustomer(cid) {
  const c = customerById(cid);
  if (!c) return;
  _selectedCustomerId = cid;
  const mem = memberLabel(c.level);
  document.getElementById('f_customerSearch').value = `${c.name}${c.phone ? '（' + c.phone + '）' : ''}${mem.tag ? ' · ' + mem.tag : ''}`;
  document.getElementById('f_customer').value = c.name;
  document.getElementById('f_phone').value = c.phone || '';
  document.getElementById('f_member').value = c.level || '';
  if (c.remark) {
    const remarkEl = document.getElementById('f_remark');
    if (!remarkEl.value) remarkEl.value = c.remark;
  }
  document.getElementById('csSuggestList').classList.remove('show');
  calcPrice();
  refreshApptDeductLinkOptions();
}
function onApptCustomerSelect() {
  const cid = document.getElementById('f_customerSel')?.value;
  if (cid) pickCustomer(cid);
}
function clearApptCustomerSel() {
  _selectedCustomerId = null;
  const sel = document.getElementById('f_customerSel');
  if (sel && sel.value) sel.value = '';
}
function _resolveApptFormCustomer() {
  const cid = document.getElementById('f_customerSel')?.value || window._selectedCustomerId || '';
  let c = cid ? customerById(cid) : null;
  const name = (document.getElementById('f_customer')?.value || '').trim();
  const phone = (document.getElementById('f_phone')?.value || '').trim();
  if (!c && phone) {
    const p = _normPhone(phone);
    c = activeRows(State.customers).find(x => _normPhone(x.phone) === p && p);
  }
  if (!c && name) {
    const n = _normStr(name);
    c = activeRows(State.customers).find(x => _normStr(x.name) === n && n);
  }
  return c || null;
}
function _findSameDayDeductOptionsForAppt(a, c, includeTxnId, targetAmount) {
  if (!a || !c) return [];
  const day = (a.datetime || a.date || '').slice(0, 10);
  if (!day) return [];
  const customerNames = new Set([_normStr(c.name || ''), _normStr(a.customer || '')].filter(Boolean));
  const amount = Math.round((Number(targetAmount) || 0) * 100) / 100;
  return (State.memberTxns || []).filter(t => {
    if (!t || t.type !== 'deduct') return false;
    if (typeof _isDeletedMemberTxn === 'function' && _isDeletedMemberTxn(t)) return false;
    if (t._auditOnly || t._hiddenFromDeductArchive) return false;
    if (t._reversed) return false;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return false;
    if (t._reverseOf) return false;
    if ((t.date || '').slice(0, 10) !== day) return false;
    if (Number(t.amount) <= 0) return false;
    const txnAmount = Math.round((Number(t.amount) || 0) * 100) / 100;
    if (amount > 0 && txnAmount !== amount) return false;
    if (t.cid && c.id && t.cid === c.id) return true;
    const tc = (State.customers || []).find(x => x && x.id === t.cid);
    return tc && customerNames.has(_normStr(tc.name || ''));
  }).sort((x, y) => {
    const ax = activeRows(State.appointments).find(a0 => a0.id === x.apptId);
    const ay = activeRows(State.appointments).find(a0 => a0.id === y.apptId);
    const xBusy = x.apptId && x.id !== includeTxnId && x.apptId !== State.editingId && ax ? 1 : 0;
    const yBusy = y.apptId && y.id !== includeTxnId && y.apptId !== State.editingId && ay ? 1 : 0;
    return xBusy - yBusy || String(x.date || '').localeCompare(String(y.date || '')) || String(x.id || '').localeCompare(String(y.id || ''));
  });
}
function refreshApptDeductLinkOptions() {
  try {
    ensureApptDeductLinkUI();
    const wrap = document.getElementById('apptDeductLinkWrap');
    const sel = document.getElementById('f_linkDeductTxn');
    const hint = document.getElementById('apptDeductLinkHint');
    if (!wrap || !sel) return;
    const currentA = State.editingId ? appointmentById(State.editingId) : null;
    const c = _resolveApptFormCustomer();
    const a = {
      id: State.editingId || '',
      customerId: c?.id || '',
      customer: (document.getElementById('f_customer')?.value || '').trim(),
      phone: (document.getElementById('f_phone')?.value || '').trim(),
      datetime: document.getElementById('f_datetime')?.value || ''
    };
    const currentLinked = currentA?.deductId || '';
    const targetAmount = _currentApptFinalPriceFromForm();
    const list = _findSameDayDeductOptionsForAppt(a, c, currentLinked, targetAmount);
    wrap.style.display = '';
    if (!c || !a.datetime || !list.length) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">不关联已扣卡记录</option>';
      if (hint) {
        if (!c) hint.textContent = '先输入或选择顾客姓名；系统会按同一天、同顾客、同金额匹配已扣卡记录。';
        else if (!a.datetime) hint.textContent = '先选择预约日期；系统会按同一天、同顾客、同金额匹配已扣卡记录。';
        else if (!(targetAmount > 0)) hint.textContent = '先选择预约项目或填写价格；金额确定后会自动匹配同金额的扣卡记录。';
        else hint.textContent = `当天没有找到同顾客、同金额（${fmtMoney(targetAmount)}）的会员扣卡记录。`;
      }
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">不关联已扣卡记录</option>' + list.map(t => {
      const items = _deductItemsLabel(t);
      const linkedMark = t.id === currentLinked ? '（当前已关联）' : '';
      const linkedAppt = t.apptId ? activeRows(State.appointments).find(a0 => a0.id === t.apptId) : null;
      const occupied = t.apptId && t.id !== currentLinked && t.apptId !== State.editingId && linkedAppt;
      const occupiedMark = occupied ? `（已关联：${_apptDateTimeLabel(linkedAppt)}）` : '';
      const tail = String(t.id || '').slice(-4);
      return `<option value="${escapeHtml(t.id)}" ${occupied ? 'disabled' : ''}>${escapeHtml((t.date || '').slice(0, 10))} · ${escapeHtml(items)} · ${fmtMoney(t.amount)}${tail ? ' · #' + escapeHtml(tail) : ''}${linkedMark}${escapeHtml(occupiedMark)}</option>`;
    }).join('');
    if (currentLinked && list.some(t => t.id === currentLinked)) sel.value = currentLinked;
    if (hint) hint.textContent = `已匹配同顾客、同日期、同金额（${fmtMoney(targetAmount)}）的扣卡记录。选择后，完成预约时只关联这笔扣卡，不会再次扣卡，也不会重复增加收入。`;
  } catch(e) {}
}
function onApptDeductLinkChange() {
  try {
    const txId = document.getElementById('f_linkDeductTxn')?.value || '';
    const tx = txId ? activeRows(State.memberTxns).find(t => t.id === txId) : null;
    const hint = document.getElementById('apptDeductLinkHint');
    if (tx && hint) {
      const items = _deductItemsLabel(tx);
      hint.textContent = `已选择：${(tx.date || '').slice(0, 10)} · ${fmtMoney(tx.amount)} · ${items}。完成预约时不会再次扣卡。`;
    }
  } catch(e) {}
}
function quickNewCustomerFromAppt() {
  openCustomerModal(false);
}

// ============ 首页汇总渲染 ============
function renderDashboardSummary() {
  try { autoExpireGoldMembers(); } catch(e) {}
  const dateEl = document.getElementById('summaryDate');
  if (dateEl) {
    const d = new Date();
    const w = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
    dateEl.textContent = `${d.getMonth()+1}月${d.getDate()}日 · ${w}`;
  }
  const todayStr = todayDateStr();
  const monthStr = todayStr.slice(0,7);
  // 今日预约数
  const todayAppts = activeRows(State.appointments).filter(a => a.status !== 'canceled' && (a.datetime||'').startsWith(todayStr));
  const apptToday = todayAppts.length;
  // 待到店（待确认 / 已确认）
  const pendingSet = new Set(['pending', 'confirmed']);
  const pendingCount = activeRows(State.appointments).filter(a => pendingSet.has(a.status)).length;
  // 预计收入：今日未取消预约的 finalTotal 之和
  const estimate = todayAppts.reduce((s, a) => s + (a.finalTotal || 0), 0);
  // 本月营业额：与“收入管理 > 总收入”同口径。
  // 会员充值计入；会员单项扣卡/储值卡扣不重复计入，只统计补差或非扣卡实收。
  const rev = buildIncomeRecords()
    .filter(r => ((r.datetime || r.date || '').slice(0, 7) === monthStr))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  // 会员人数（level 非空且不等于 ''）
  const memberCount = activeRows(State.customers).filter(c => c.level && c.level !== '').length;
  // 会员总储值余额（铂金/钻石的 balance 累计）
  const totalBalance = activeRows(State.customers).reduce((s,c) => {
    if (c.level && c.level !== 'gold' && c.balance) return s + c.balance;
    return s;
  }, 0);

  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('sumApptToday', apptToday);
  setText('sumPending', pendingCount);
  setText('sumEstimate', '¥ ' + estimate.toLocaleString('zh-CN', {maximumFractionDigits: 0}));
  setText('sumMonthRev', '¥ ' + rev.toLocaleString('zh-CN', {maximumFractionDigits: 0}));
  setText('sumMemberCount', memberCount);
  setText('sumMemberBalance', '¥ ' + totalBalance.toLocaleString('zh-CN', {maximumFractionDigits: 0}));

  // 会员到期提醒横幅（7 天内到期 / 已过期）
  try {
    const expList = upcomingExpiryMembers();
    const banner = document.getElementById('expiryAlertBanner');
    if (banner) {
      if (expList.length === 0) {
        banner.style.display = 'none';
        banner.innerHTML = '';
      } else {
        const rows = expList.map(m => m.status === 'expired'
          ? `· ${escapeHtml(m.name)}（${m.expire}）<span style="color:#C75A5A;">已过期，今天将自动降级</span>`
          : `· ${escapeHtml(m.name)}（${m.expire}）<span style="color:#C77700;">还有 ${Math.max(0, memberExpiryInfo({ expire: m.expire }).daysLeft)} 天到期，记得提醒续费</span>`).join('<br>');
        banner.style.display = 'block';
        banner.innerHTML = `⏰ <b>会员到期提醒</b><br>${rows}`;
      }
    }
  } catch(e) {}
}

// ============ 首页数据概览（近7天/本月/本年 切换） ============
State.overviewRange = State.overviewRange || '7';

function setOverviewRange(range) {
  State.overviewRange = range;
  document.querySelectorAll('#overviewRangeTabs .seg-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.range === range);
  });
  renderOverviewStats();
}

function _ovBucketKey(dateStr, range) {
  // 日期分桶：7天 -> YYYY-MM-DD ；month -> YYYY-MM-DD ；year -> YYYY-MM
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  if (range === 'year') {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  return dateStr.slice(0, 10);
}

function _ovRangeList(range) {
  // 返回时间桶列表（按顺序）用于统计和渲染 mini bar
  const today = new Date();
  today.setHours(0,0,0,0);
  const buckets = [];
  if (range === '7') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      // 使用本地日期而非 toISOString（UTC），避免中国时区导致日期差一天
      buckets.push(localDateStr(d));
    }
  } else if (range === 'month') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      buckets.push(`${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`);
    }
  } else {
    const y = today.getFullYear();
    for (let m = 1; m <= 12; m++) {
      buckets.push(`${y}-${String(m).padStart(2,'0')}`);
    }
  }
  return buckets;
}

function _ovDateInRange(dateStr, range) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  // 用 T00:00:00 按本地时区解析，避免 new Date("YYYY-MM-DD") 按 UTC 解析导致“今天”算成前一天
  const d = new Date(dateStr.slice(0,10) + 'T00:00:00');
  if (isNaN(d)) return false;
  if (range === '7') {
    const diff = Math.floor((today - d) / (24*60*60*1000));
    return diff >= 0 && diff < 7;
  } else if (range === 'month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  } else {
    return d.getFullYear() === today.getFullYear();
  }
}

function _miniBarHtml(bucketValues) {
  if (!bucketValues || bucketValues.length === 0) return '';
  const max = Math.max(...bucketValues.map(v => v.v), 1);
  return bucketValues.map(b => {
    const h = max === 0 ? 5 : Math.max(5, Math.round((b.v / max) * 100));
    return `<span style="height:${h}%" title="${b.k}: ${b.v}"></span>`;
  }).join('');
}

function _trend(cur, prev) {
  if (!prev || prev <= 0) return { cls: 'up', txt: cur > 0 ? '↑ 100%' : '— 0%' };
  const pct = Math.round((cur - prev) / prev * 100);
  if (pct > 0) return { cls: 'up', txt: `↑ ${pct}%` };
  if (pct < 0) return { cls: 'down', txt: `↓ ${Math.abs(pct)}%` };
  return { cls: 'up', txt: '— 0%' };
}

function _prevRange(range) {
  // 返回上一个范围的日期过滤器（用于对比趋势）
  const today = new Date();
  today.setHours(0,0,0,0);
  if (range === '7') {
    const startPrev = new Date(today); startPrev.setDate(startPrev.getDate() - 13);
    const endPrev = new Date(today); endPrev.setDate(endPrev.getDate() - 7);
    return d => {
      const x = new Date(String(d).slice(0,10) + 'T00:00:00'); if (isNaN(x)) return false;
      return x >= startPrev && x < endPrev;
    };
  } else if (range === 'month') {
    const m = today.getMonth() - 1;
    const y = today.getFullYear() + (m < 0 ? -1 : 0);
    const mm = (m + 12) % 12;
    return d => {
      const x = new Date(d); if (isNaN(x)) return false;
      return x.getFullYear() === y && x.getMonth() === mm;
    };
  } else {
    const y = today.getFullYear() - 1;
    return d => {
      const x = new Date(d); if (isNaN(x)) return false;
      return x.getFullYear() === y;
    };
  }
}

function renderOverviewStats() {
  const range = State.overviewRange || '7';
  const buckets = _ovRangeList(range);
  const prevF = _prevRange(range);

  // ------- 按桶聚合：收入 & 预约数 -------
  const incomeMap = new Map(buckets.map(k => [k, 0]));
  const apptMap = new Map(buckets.map(k => [k, 0]));
  let curIncome = 0, curAppt = 0;
  buildIncomeRecords().forEach(r => {
    const dt = r.datetime || r.date;
    if (!_ovDateInRange(dt, range)) return;
    const amt = Number(r.amount) || 0;
    curIncome += amt;
    const k = _ovBucketKey(dt, range);
    if (incomeMap.has(k)) incomeMap.set(k, incomeMap.get(k) + amt);
  });
  activeRows(State.appointments).forEach(a => {
    if (!_ovDateInRange(a.datetime, range)) return;
    if (a.status !== 'canceled') curAppt += 1;
    const k = _ovBucketKey(a.datetime, range);
    if (incomeMap.has(k)) {
      if (a.status !== 'canceled') apptMap.set(k, apptMap.get(k) + 1);
    }
  });

  // ------- 新增会员 -------
  let curNewMem = 0;
  const memBuckets = new Map(buckets.map(k => [k, 0]));
  activeRows(State.customers).forEach(c => {
    if (!c.level) return;
    const d = c.firstVisit || c.createdAt;
    if (!d) return;
    if (!_ovDateInRange(d, range)) return;
    curNewMem += 1;
    const k = _ovBucketKey(d, range);
    if (memBuckets.has(k)) memBuckets.set(k, memBuckets.get(k) + 1);
  });

  // ------- 会员复购率：周期内有2次或以上到店的会员 / 周期内到店过的会员 -------
  const visitsByMember = new Map();
  const allVisits = [];
  activeRows(State.appointments).forEach(a => {
    if (a.status === 'canceled') return;
    if (!_ovDateInRange(a.datetime, range)) return;
    const cid = a.customerId || (a.customer ? `NAME:${a.customer}` : '');
    if (!cid) return;
    const c = customerById(a.customerId) || customerByName(a.customer);
    if (!c || !c.level) return; // 只统计会员
    allVisits.push({ cid, date: a.datetime.slice(0,10) });
    visitsByMember.set(cid, (visitsByMember.get(cid) || 0) + 1);
  });
  activeRows(State.memberTxns).forEach(t => {
    if (t._auditOnly) return;
    if (t._reversed) return;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return;
    if (t.type !== 'deduct') return;
    if (!_ovDateInRange(t.date, range)) return;
    const cid = t.cid;
    if (!cid) return;
    visitsByMember.set(cid, (visitsByMember.get(cid) || 0) + 1);
  });
  const totalMembersVisited = visitsByMember.size;
  const repeatMembers = [...visitsByMember.values()].filter(v => v >= 2).length;
  const repurchaseRate = totalMembersVisited === 0 ? 0 : Math.round(repeatMembers / totalMembersVisited * 100);

  // ------- 按周/月/年 复购分桶 -------
  const repBuckets = buckets.map(k => ({ k, v: 0 }));
  // 按桶计算实际复购率：每个桶内到店过的会员中，有多少在整段周期内到店≥2次
  const bucketMemberSet = new Map(buckets.map(k => [k, new Set()]));
  allVisits.forEach(v => {
    const bk = _ovBucketKey(v.date, range);
    if (bucketMemberSet.has(bk)) bucketMemberSet.get(bk).add(v.cid);
  });
  repBuckets.forEach(rb => {
    const members = bucketMemberSet.get(rb.k);
    if (!members || members.size === 0) { rb.v = 0; return; }
    let repeat = 0;
    members.forEach(cid => { if ((visitsByMember.get(cid) || 0) >= 2) repeat++; });
    rb.v = Math.round(repeat / members.size * 100);
  });

  // ------- 计算上一周期趋势 -------
  let prevIncome = 0, prevAppt = 0, prevNewMem = 0, prevRepVisits = 0, prevRepRepeat = 0;
  buildIncomeRecords().forEach(r => {
    const d = r.datetime || r.date;
    if (d && prevF(d)) prevIncome += (Number(r.amount) || 0);
  });
  activeRows(State.appointments).forEach(a => {
    if (a.status === 'canceled') return;
    const d = a.datetime;
    if (!d) return;
    if (prevF(d)) {
      prevAppt += 1;
    }
  });
  activeRows(State.customers).forEach(c => {
    if (!c.level) return;
    const d = c.firstVisit || c.createdAt;
    if (d && prevF(d)) prevNewMem += 1;
  });
  // 复购趋势简化：与上一周期对比按会员到店
  const prevRepMap = new Map();
  activeRows(State.appointments).forEach(a => {
    if (a.status === 'canceled') return;
    if (!prevF(a.datetime)) return;
    const c = customerById(a.customerId) || customerByName(a.customer);
    if (!c || !c.level) return;
    const cid = a.customerId || (a.customer ? `NAME:${a.customer}` : '');
    if (!cid) return;
    prevRepMap.set(cid, (prevRepMap.get(cid) || 0) + 1);
  });
  activeRows(State.memberTxns).forEach(t => {
    if (t._auditOnly) return;
    if (t._reversed) return;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return;
    if (t.type !== 'deduct') return;
    if (!prevF(t.date)) return;
    prevRepMap.set(t.cid, (prevRepMap.get(t.cid) || 0) + 1);
  });
  prevRepVisits = prevRepMap.size;
  prevRepRepeat = [...prevRepMap.values()].filter(v => v >= 2).length;
  const prevRep = prevRepVisits === 0 ? 0 : Math.round(prevRepRepeat / prevRepVisits * 100);

  // 趋势
  const tr1 = _trend(curIncome, prevIncome);
  const tr2 = _trend(curAppt, prevAppt);
  const tr3 = _trend(curNewMem, prevNewMem);
  const tr4 = _trend(repurchaseRate, prevRep);

  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('scIncome', '¥ ' + curIncome.toLocaleString('zh-CN', {maximumFractionDigits: 0}));
  setText('scAppt', curAppt + ' 单');
  setText('scNewMem', curNewMem + ' 人');
  setText('scRepurchase', repurchaseRate + '%');

  const setTr = (id, t) => {
    const el = document.getElementById(id); if (!el) return;
    el.className = 'stat-card-trend ' + t.cls;
    el.textContent = t.txt;
  };
  setTr('tr1', tr1); setTr('tr2', tr2); setTr('tr3', tr3); setTr('tr4', tr4);

  const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const incomeList = buckets.map(k => ({ k, v: incomeMap.get(k) || 0 }));
  const apptList = buckets.map(k => ({ k, v: apptMap.get(k) || 0 }));
  const newMemList = buckets.map(k => ({ k, v: memBuckets.get(k) || 0 }));
  setHtml('bar1', _miniBarHtml(incomeList));
  setHtml('bar2', _miniBarHtml(apptList));
  setHtml('bar3', _miniBarHtml(newMemList));
  setHtml('bar4', _miniBarHtml(repBuckets));
}

// ============ 参考图上传 ============
function compressImageFile(file, cb) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 900;
        let w = img.width, h = img.height;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', 0.62));
      } catch(e) {
        cb(ev.target.result);
      }
    };
    img.onerror = () => cb(ev.target.result);
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function handleRefUpload(e) {
  const files = Array.from(e.target.files || []);
  const remaining = 9 - State.refImages.length;
  files.slice(0, remaining).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    compressImageFile(file, dataUrl => {
      State.refImages.push(dataUrl);
      renderUploadGrid();
    });
  });
  e.target.value = '';
}
function renderUploadGrid() {
  const grid = document.getElementById('uploadGrid');
  if (!grid) return;
  const imgsHtml = State.refImages.map((ref, i) => {
    const src = resolveImageSrc(ref);
    return `
    <div class="uploaded-img" onclick="showLightbox('${src.replace(/'/g,"\\'")}')">
      <img src="${src}">
      <div class="del" title="删除该图片" onclick="event.stopPropagation();removeRefImg(${i})">×</div>
    </div>`;
  }).join('');
  const slotHtml = State.refImages.length < 9 ? `
    <label class="upload-slot">
      <input type="file" accept="image/*" multiple id="refImgInput2" style="display:none" onchange="handleRefUpload(event)">
      <div class="upload-slot-plus" onclick="document.getElementById('refImgInput2').click()">+</div>
      <div class="upload-slot-text" onclick="document.getElementById('refImgInput2').click()">${State.refImages.length}/9</div>
    </label>` : '';
  grid.innerHTML = '';
  grid.insertAdjacentHTML('beforeend', imgsHtml + slotHtml);
}
function removeRefImg(i) {
  State.refImages.splice(i, 1);
  renderUploadGrid();
}
function resolveImageSrc(ref) {
  if (!ref) return '';
  if (String(ref).startsWith('data:') || String(ref).startsWith('http') || String(ref).startsWith('./')) return ref;
  const img = activeRows(State.images || []).find(x => x.id === ref);
  return img?.url || img?.data || '';
}
function storeImageRefs(refs, bizType) {
  if (!Array.isArray(refs)) return [];
  State.images = Array.isArray(State.images) ? State.images : [];
  const out = [];
  refs.forEach(ref => {
    if (!ref) return;
    if (!String(ref).startsWith('data:')) { out.push(ref); return; }
    const existing = activeRows(State.images).find(x => x.url === ref || x.data === ref);
    if (existing) { out.push(existing.id); return; }
    const obj = {
      ...createRecordMeta('IMG'),
      url: ref,
      kind: bizType || 'reference',
      size: String(ref).length,
      storage: 'local-compressed-dataurl'
    };
    State.images.unshift(obj);
    out.push(obj.id);
  });
  save('images', State.images);
  return out;
}

// ============ 图片空间管理：一键清理 3 个月前的预约参考图 ============
function _fmtBytes(b) {
  b = Number(b) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}
function imgSpaceStats() {
  const imgs = activeRows(State.images || []);
  let bytes = 0;
  imgs.forEach(x => {
    const v = String(x.url || x.data || '');
    bytes += (Number(x.size) || v.length);
  });
  return { count: imgs.length, bytes };
}
function updateImgSpaceInfo() {
  const el = document.getElementById('imgSpaceInfo');
  if (!el) return;
  const st = imgSpaceStats();
  el.textContent = `当前共 ${st.count} 张参考图，约占用 ${_fmtBytes(st.bytes)}`;
}
function cleanupOldRefImages() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffStr = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getDate()).padStart(2, '0');
  const appts = activeRows(State.appointments || []);
  const oldAppts = [];
  const recentAppts = [];
  appts.forEach(a => {
    const d = String(a.datetime || '').slice(0, 10);
    if (d && d < cutoffStr) oldAppts.push(a);
    else recentAppts.push(a);
  });
  const candidateIds = new Set();
  oldAppts.forEach(a => (a.images || []).forEach(id => id && candidateIds.add(id)));
  const keepIds = new Set();
  recentAppts.forEach(a => (a.images || []).forEach(id => id && keepIds.add(id)));
  const delIds = [...candidateIds].filter(id => !keepIds.has(id));
  if (oldAppts.length === 0 || delIds.length === 0) {
    toast('没有需要清理的图片：近 3 个月内的参考图已自动保留', 'success', 3200);
    updateImgSpaceInfo();
    return;
  }
  const delCount = delIds.length;
  const delSet = new Set(delIds);
  if (!confirm(`确定清理 ${cutoffStr} 之前的预约参考图吗？\n\n将删除 ${delCount} 张图片，近 3 个月的参考图会保留。\n删除的是旧预约的图片（不可恢复），不影响顾客、收支等数据。`)) return;
  let clearedAppts = 0;
  oldAppts.forEach(a => {
    if (Array.isArray(a.images) && a.images.length) {
      a.images = a.images.filter(id => !delSet.has(id));
      touchRecord(a);
      clearedAppts++;
    }
  });
  State.images = (State.images || []).filter(x => !delSet.has(x.id));
  save('appointments', State.appointments);
  save('images', State.images);
  addAuditLog('图片清理', `一键清理 ${cutoffStr} 之前的预约参考图：删除 ${delCount} 张，涉及 ${clearedAppts} 个预约`);
  updateImgSpaceInfo();
  toast(`已清理 ${delCount} 张旧参考图（近 3 个月的已保留）`, 'success', 3800);
}

// ============ Lightbox ============
function showLightbox(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = src;
  lb.classList.add('show');
}
function openLightbox(src) {
  showLightbox(src);
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('show');
}

// ============ 业务 Tab 切换（美甲/美睫） ============
function switchBizTab(biz, silent) {
  State.biz = biz;
  document.querySelectorAll('.biz-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.biz === biz);
  });
  const nailEl = document.getElementById('biz-nail');
  const lashEl = document.getElementById('biz-lash');
  if (nailEl) nailEl.style.display = biz === 'nail' ? '' : 'none';
  if (lashEl) lashEl.style.display = biz === 'lash' ? '' : 'none';
  // 更新价格汇总的 label
  const name1 = document.getElementById('s_itemName1');
  const name2 = document.getElementById('s_itemName2');
  const name3 = document.getElementById('s_itemName3');
  const row2 = document.getElementById('rowItem2');
  const row3 = document.getElementById('rowItem3');
  if (biz === 'nail') {
    name1.textContent = '款式价格';
    name2.textContent = '甲片价格';
    name3.textContent = '卸甲价格';
    if (row2) row2.style.display = '';
    if (row3) row3.style.display = '';
  } else {
    name1.textContent = '美睫款式';
    name2.textContent = '卸睫毛';
    name3.textContent = '';
    if (row2) {
      // 复用 row2 显示卸睫毛
      name2.textContent = '卸睫毛';
      row2.style.display = '';
    }
    if (row3) row3.style.display = 'none';
  }
  const durEl = document.getElementById('f_duration');
  if (durEl && !State.editingId) durEl.value = durationMinutesToHoursValue(defaultApptDurationMinutes(biz), biz);
  if (!silent) {
    renderPriceOptions(true);
    syncManualPriceControls();
    calcPrice();
    previewApptConflict();
  }
}

// ============ 渲染：价格选项（全 5 组） ============
function renderPriceOptions(reset = false) {
  try { _ensurePriceKeys(); } catch(e) {}
  // 美甲 款式
  const sWrap = document.getElementById('stylePriceOpts');
  if (sWrap) {
    sWrap.innerHTML = (State.prices.style || []).filter(p => p && typeof p === 'object').map(p => `
      <div class="price-opt po ${p.custom ? 'custom' : ''} ${State.selected.style === p.key ? 'selected active' : ''}"
           onclick="selectPrice('style','${p.key}')">
        <span class="po-name">${p.name}</span>
        <span class="po-price">${p.custom ? '手动填' : '¥' + p.price}</span>
      </div>
    `).join('');
  }
  // 美甲 甲片
  const tWrap = document.getElementById('tipPriceOpts');
  if (tWrap) {
    tWrap.innerHTML = (State.prices.tip || []).filter(p => p && typeof p === 'object').map(p => `
      <div class="price-opt po ${State.selected.tip === p.key ? 'selected active' : ''}"
           onclick="selectPrice('tip','${p.key}')">
        <span class="po-name">${p.name}</span>
        <span class="po-price">${p.price === 0 ? '免' : '¥' + p.price}</span>
      </div>
    `).join('');
  }
  // 美甲 卸甲
  const rnWrap = document.getElementById('removeNailOpts');
  if (rnWrap) {
    rnWrap.innerHTML = (State.prices.removeNail || []).filter(p => p && typeof p === 'object').map(p => `
      <div class="price-opt po removeNail ${State.selected.removeNail === p.key ? 'selected active' : ''}"
           onclick="selectPrice('removeNail','${p.key}')">
        <span class="po-name">${p.name}</span>
        <span class="po-price">¥${p.price}</span>
      </div>
    `).join('');
  }
  // 美睫 款式
  const lWrap = document.getElementById('lashPriceOpts');
  if (lWrap) {
    lWrap.innerHTML = (State.prices.lash || []).filter(p => p && typeof p === 'object').map(p => `
      <div class="price-opt po lash ${State.selected.lash === p.key ? 'selected active' : ''}"
           onclick="selectPrice('lash','${p.key}')">
        <span class="po-name">${p.name}</span>
        <span class="po-price">¥${p.price}</span>
      </div>
    `).join('');
  }
  // 美睫 卸睫
  const rlWrap = document.getElementById('removeLashOpts');
  if (rlWrap) {
    rlWrap.innerHTML = (State.prices.removeLash || []).filter(p => p && typeof p === 'object').map(p => `
      <div class="price-opt po removeLash ${State.selected.removeLash === p.key ? 'selected active' : ''}"
           onclick="selectPrice('removeLash','${p.key}')">
        <span class="po-name">${p.name}</span>
        <span class="po-price">¥${p.price}</span>
      </div>
    `).join('');
  }
}
function selectPrice(group, key) {
  State.selected[group] = State.selected[group] === key ? null : key;
  if (!State.selected.manualPrices) State.selected.manualPrices = {};
  if (!State.selected.manualTouched) State.selected.manualTouched = {};
  if (!State.selected[group]) {
    delete State.selected.manualPrices[group];
    delete State.selected.manualTouched[group];
  } else {
    const p = _lookupPrice(group, key);
    State.selected.manualPrices[group] = Number(p?.price) || 0;
    State.selected.manualTouched[group] = false;
  }
  // 款式选中 custom 显示手填
  if (group === 'style') {
    const st = _lookupPrice('style', key);
    const show = st && st.custom && State.selected.style === key;
    document.getElementById('customPricePanel').style.display = show ? 'block' : 'none';
    if (!show) State.selected.customPrice = 0;
  }
  renderPriceOptions();
  syncManualPriceControls();
  calcPrice();
  refreshApptDeductLinkOptions();
}

const APPT_PRICE_GROUPS = ['style','tip','removeNail','lash','removeLash'];
function _roundMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}
function _manualPriceInput(group) {
  return document.getElementById('f_price_' + group);
}
function _manualPriceRow(group) {
  return document.getElementById('manualPrice_' + group);
}
function _shouldShowManualPrice(group, p) {
  return !!p && !(group === 'style' && p.custom);
}
function _setManualPriceControl(group, resetToDefault) {
  const row = _manualPriceRow(group);
  const input = _manualPriceInput(group);
  if (!row || !input) return;
  if (!State.selected.manualPrices) State.selected.manualPrices = {};
  if (!State.selected.manualTouched) State.selected.manualTouched = {};
  const key = State.selected[group];
  const p = _lookupPrice(group, key);
  const show = _shouldShowManualPrice(group, p);
  row.style.display = show ? 'flex' : 'none';
  if (!show) {
    input.value = '';
    delete State.selected.manualPrices[group];
    delete State.selected.manualTouched[group];
    return;
  }
  const defPrice = _roundMoney(p.price);
  if (resetToDefault || State.selected.manualPrices[group] == null || !State.selected.manualTouched[group]) {
    State.selected.manualPrices[group] = defPrice;
  }
  input.value = _roundMoney(State.selected.manualPrices[group]).toFixed(2);
}
function syncManualPriceControls() {
  APPT_PRICE_GROUPS.forEach(g => _setManualPriceControl(g, false));
}
function markManualPrice(group) {
  if (!State.selected.manualPrices) State.selected.manualPrices = {};
  if (!State.selected.manualTouched) State.selected.manualTouched = {};
  const input = _manualPriceInput(group);
  State.selected.manualTouched[group] = true;
  State.selected.manualPrices[group] = _roundMoney(input ? input.value : 0);
  refreshApptDeductLinkOptions();
}
function _getApptPartPrice(group) {
  const key = State.selected[group];
  const p = _lookupPrice(group, key);
  if (!p) return 0;
  if (group === 'style' && p.custom) {
    const v = parseFloat(document.getElementById('f_customPrice')?.value || 0);
    State.selected.customPrice = _roundMoney(v);
    return State.selected.customPrice;
  }
  const input = _manualPriceInput(group);
  const raw = input && _manualPriceRow(group)?.style.display !== 'none'
    ? input.value
    : State.selected.manualPrices?.[group];
  const price = _roundMoney(raw != null && raw !== '' ? raw : p.price);
  if (!State.selected.manualPrices) State.selected.manualPrices = {};
  State.selected.manualPrices[group] = price;
  return price;
}
function _currentApptItemPrices() {
  const out = {};
  APPT_PRICE_GROUPS.forEach(g => {
    if (!State.selected[g]) return;
    out[g] = _getApptPartPrice(g);
  });
  return out;
}

// ============ 价格计算（美甲/美睫双模式） ============
function calcPrice() {
  let part1 = 0, part2 = 0, part3 = 0;
  if (State.biz === 'nail') {
    const st = _lookupPrice('style',      State.selected.style);
    const tp = _lookupPrice('tip',        State.selected.tip);
    const rn = _lookupPrice('removeNail', State.selected.removeNail);
    if (st) part1 = _getApptPartPrice('style');
    part2 = tp ? _getApptPartPrice('tip') : 0;
    part3 = rn ? _getApptPartPrice('removeNail') : 0;
    document.getElementById('s_style').textContent = fmtMoney(part1);
    document.getElementById('s_tip').textContent = fmtMoney(part2);
    document.getElementById('s_remove').textContent = fmtMoney(part3);
  } else {
    // 美睫：part1 = 款式；part2 = 卸睫
    const lp = _lookupPrice('lash',       State.selected.lash);
    const rl = _lookupPrice('removeLash', State.selected.removeLash);
    part1 = lp ? _getApptPartPrice('lash') : 0;
    part2 = rl ? _getApptPartPrice('removeLash') : 0;
    part3 = 0;
    document.getElementById('s_style').textContent = fmtMoney(part1);
    document.getElementById('s_tip').textContent = fmtMoney(part2);
    document.getElementById('s_remove').textContent = fmtMoney(0);
  }
  const original = part1 + part2 + part3;

  const memberKey = document.getElementById('f_member')?.value || '';
  // 黄金会员动态折扣：首次9折，后续95折
  const cSelId = document.getElementById('f_customerSel')?.value || window._selectedCustomerId || '';
  const discount = memberKey === 'gold'
    ? _getGoldDiscountRate(cSelId)
    : (State.memberDiscounts[memberKey]?.discount || 1.0);
  const discountAmt = original * (1 - discount);
  const finalPrice = Math.round(original * discount * 100) / 100;
  document.getElementById('s_original').textContent = fmtMoney(original);
  document.getElementById('s_total').textContent = fmtMoney(finalPrice);

  const dRow = document.getElementById('discountRow');
  if (discount < 1) {
    dRow.style.display = 'flex';
    const name = memberKey === 'gold' ? '黄金会员' : (State.memberDiscounts[memberKey]?.name || '');
    const pct = Math.round(discount * 100);
    const isFirst = memberKey === 'gold' && discount === 0.90;
    document.getElementById('s_discountLabel').textContent = `${name} · ${pct}折${isFirst ? '（首次）' : ''}`;
    document.getElementById('s_discount').textContent = '- ' + fmtMoney(Math.round(discountAmt * 100) / 100);
  } else {
    dRow.style.display = 'none';
  }
}

function _currentApptFinalPriceFromForm() {
  try {
    let part1 = 0, part2 = 0, part3 = 0;
    if (State.biz === 'nail') {
      const st = _lookupPrice('style', State.selected.style);
      const tp = _lookupPrice('tip', State.selected.tip);
      const rn = _lookupPrice('removeNail', State.selected.removeNail);
      if (st) part1 = _getApptPartPrice('style');
      part2 = tp ? _getApptPartPrice('tip') : 0;
      part3 = rn ? _getApptPartPrice('removeNail') : 0;
    } else {
      const lp = _lookupPrice('lash', State.selected.lash);
      const rl = _lookupPrice('removeLash', State.selected.removeLash);
      part1 = lp ? _getApptPartPrice('lash') : 0;
      part2 = rl ? _getApptPartPrice('removeLash') : 0;
    }
    const original = _roundMoney(part1 + part2 + part3);
    const memberKey = document.getElementById('f_member')?.value || '';
    const cSelId = document.getElementById('f_customerSel')?.value || window._selectedCustomerId || '';
    const discount = memberKey === 'gold'
      ? _getGoldDiscountRate(cSelId)
      : (State.memberDiscounts[memberKey]?.discount || 1.0);
    return Math.round(original * discount * 100) / 100;
  } catch(e) {
    return 0;
  }
}

// ============ 保存预约 ============
async function saveAppt(status) {
  const customer = document.getElementById('f_customer').value.trim();
  if (!customer) { toast('请填写客户姓名', 'error'); return; }
  const datetime = document.getElementById('f_datetime').value;
  if (!datetime) { toast('请选择预约时间', 'error'); return; }
  // 根据业务类型校验必选项
  if (State.biz === 'nail') {
    if (!State.selected.style) { toast('请选择美甲款式', 'error'); return; }
    if (!State.selected.tip) { toast('请选择甲片类型', 'error'); return; }
  } else {
    if (!State.selected.lash) { toast('请选择美睫款式', 'error'); return; }
  }

  const st = _lookupPrice('style', State.selected.style);
  if (State.biz === 'nail' && st && st.custom && !(parseFloat(document.getElementById('f_customPrice').value) > 0)) {
    toast('请填写图片款式的手动价格', 'error');
    const cpEl = document.getElementById('f_customPrice');
    if (cpEl) {
      cpEl.classList.add('invalid');
      setTimeout(() => cpEl.classList.remove('invalid'), 1000);
    }
    return;
  }

  // 计算最终价：优先使用预约弹窗里的“本次单价”，默认带出定价，手动改价后按改价入账
  let part1 = 0, part2 = 0, part3 = 0;
  if (State.biz === 'nail') {
    if (st) part1 = _getApptPartPrice('style');
    part2 = State.selected.tip ? _getApptPartPrice('tip') : 0;
    part3 = State.selected.removeNail ? _getApptPartPrice('removeNail') : 0;
  } else {
    part1 = State.selected.lash ? _getApptPartPrice('lash') : 0;
    part2 = State.selected.removeLash ? _getApptPartPrice('removeLash') : 0;
  }
  const itemPrices = _currentApptItemPrices();
  const original = _roundMoney(part1 + part2 + part3);
  const member = document.getElementById('f_member').value;
  // 黄金会员动态折扣：首次9折，后续95折
  const _cidForDisc = document.getElementById('f_customerSel')?.value || window._selectedCustomerId || '';
  const disc = _getEffectiveDiscountRate(member, _cidForDisc);
  const finalPrice = Math.round(original * disc * 100) / 100;
  const staffId = document.getElementById('f_staff')?.value || '';
  const staffName = staffNameById(staffId);
  const durationMinutes = durationHoursInputToMinutes(document.getElementById('f_duration')?.value, State.biz);
  const durationHours = Math.round((durationMinutes / 60) * 100) / 100;
  const conflict = findApptConflict({ id: State.editingId || '', datetime, durationMinutes, staffId });
  if (conflict) {
    previewApptConflict();
    toast('该技师此时间段已有预约，请调整时间或换技师', 'error');
    return;
  }

  // 同步到顾客档案（如果能找到）
  const cSel = document.getElementById('f_customerSel')?.value;
  const fPhone = document.getElementById('f_phone').value.trim();
  let c = cSel ? customerById(cSel) : (_selectedCustomerId ? customerById(_selectedCustomerId) : customerByName(customer));
  if (!c && !cSel && !_selectedCustomerId && fPhone) {
    const fp = _normPhone(fPhone);
    c = activeRows(State.customers).find(cc => _normPhone(cc.phone) === fp && fp);
  }
  if (!c && !cSel && !_selectedCustomerId && customer) {
    const fn = _normStr(customer);
    c = activeRows(State.customers).find(cc => _normStr(cc.name) === fn && fn);
  }
  if (!c && (member || document.getElementById('f_phone').value.trim())) {
    // 会员或填了手机号，自动建档
    c = {
      ...createRecordMeta('C'),
      name: customer,
      phone: document.getElementById('f_phone').value.trim(),
      level: member,
      balance: 0,
      expire: '',
      remark: document.getElementById('f_remark').value.trim(),
      firstVisit: datetime.slice(0,10),
      lastVisit: datetime.slice(0,10),
      visits: 0,
      totalPaid: 0
    };
    State.customers.push(c);
    save('customers', State.customers);
  }
  // 同步等级
  if (c && member && c.level !== member) {
    // 如果改为黄金会员且之前不是，记录起始日期
    if (member === 'gold' && c.level !== 'gold' && !c.goldSince) {
      c.goldSince = todayDateStr();
    }
    // 如果从黄金会员改为其他等级，清除起始日期
    if (member !== 'gold' && c.level === 'gold') {
      c.goldSince = '';
    }
    c.level = member;
    touchRecord(c);
    save('customers', State.customers);
  }
  const memberBalance = (c && c.level && c.level !== 'gold') ? (c.balance || 0) : 0;

  const oldData = State.editingId ? activeRows(State.appointments).find(a => a.id === State.editingId) : null;
  const apptId = State.editingId || genId('A');
  const linkedDeductId = document.getElementById('f_linkDeductTxn')?.value || '';
  const linkWrapVisible = document.getElementById('apptDeductLinkWrap')?.style.display !== 'none';
  let linkedDeductTxn = null;
  if (linkedDeductId) {
    linkedDeductTxn = activeRows(State.memberTxns).find(t => t.id === linkedDeductId);
    if (!linkedDeductTxn) { toast('选择的扣卡记录不存在，请重新选择', 'error'); return; }
    if (!c || (linkedDeductTxn.cid && c.id && linkedDeductTxn.cid !== c.id)) { toast('选择的扣卡记录不属于当前会员，请重新选择', 'error'); return; }
    if ((linkedDeductTxn.date || '').slice(0, 10) !== datetime.slice(0, 10)) { toast('只能关联同一天的会员扣卡记录', 'error'); return; }
    if (Math.round((Number(linkedDeductTxn.amount) || 0) * 100) / 100 !== finalPrice) { toast(`只能关联同金额的扣卡记录：预约金额 ${fmtMoney(finalPrice)}，扣卡金额 ${fmtMoney(linkedDeductTxn.amount || 0)}`, 'error', 4500); return; }
    if (linkedDeductTxn.apptId && linkedDeductTxn.apptId !== apptId) { toast('这条扣卡记录已经关联了其他预约', 'error'); return; }
  }
  const linkedFinalTotal = linkedDeductTxn ? Math.round((Number(linkedDeductTxn.amount) || finalPrice) * 100) / 100 : finalPrice;
  const finalDeductId = linkedDeductTxn
    ? linkedDeductTxn.id
    : (linkWrapVisible && oldData?.deductId ? '' : (oldData?.deductId || ''));
  const data = {
    ...(oldData ? oldData : createRecordMeta('A')),
    id: apptId,
    biz: State.biz,
    customerId: c?.id || '',
    customer,
    phone: document.getElementById('f_phone').value.trim(),
    member,
    memberBalance,
    datetime,
    staffId,
    staffName,
    serviceStaffId: staffId,
    serviceStaffName: staffName,
    durationHours,
    durationMinutes,
    style: State.selected.style,
    tip: State.selected.tip,
    removeNail: State.selected.removeNail,
    lash: State.selected.lash,
    removeLash: State.selected.removeLash,
    itemPrices,
    priceOverrides: itemPrices,
    stylePrice: itemPrices.style || 0,
    tipPrice: itemPrices.tip || 0,
    removePrice: itemPrices.removeNail || 0,
    lashPrice: itemPrices.lash || 0,
    removeLashPrice: itemPrices.removeLash || 0,
    images: storeImageRefs(State.refImages, State.biz === 'lash' ? 'lash-reference' : 'nail-reference'),
    remark: document.getElementById('f_remark').value.trim(),
    status,
    originalTotal: original,
    finalTotal: linkedDeductTxn ? linkedFinalTotal : finalPrice,
    deductId: finalDeductId,
    linkedMemberTxnId: linkedDeductTxn ? linkedDeductTxn.id : (oldData?.linkedMemberTxnId || ''),
    _memberDeductAlreadyCounted: !!linkedDeductTxn || !!(oldData && oldData._memberDeductAlreadyCounted)
  };
  touchRecord(data);

  if (oldData && oldData.deductId && oldData.deductId !== data.deductId) {
    const oldTxn = State.memberTxns.find(t => t.id === oldData.deductId);
    if (oldTxn && oldTxn.apptId === data.id) {
      oldTxn.apptId = '';
      oldTxn.remark = (oldTxn.remark || '').replace(`；关联预约 ${data.id}`, '').replace(`关联预约 ${data.id}`, '').trim();
      try { touchRecord(oldTxn); } catch(e) {}
    }
  }
  if (linkedDeductTxn) {
    linkedDeductTxn.apptId = data.id;
    linkedDeductTxn.remark = linkedDeductTxn.remark && linkedDeductTxn.remark.includes(data.id)
      ? linkedDeductTxn.remark
      : (linkedDeductTxn.remark ? (linkedDeductTxn.remark + `；关联预约 ${data.id}`) : `关联预约 ${data.id}`);
    try { touchRecord(linkedDeductTxn); } catch(e) {}
  }

  if (State.editingId) {
    const idx = State.appointments.findIndex(a => a.id === State.editingId);
    if (idx >= 0) State.appointments[idx] = data;
    addAuditLog('预约更新', `更新预约 ${data.id}：${data.customer} · ${datetime} · ${staffName || '未指定技师'}`, data.id);
  } else {
    State.appointments.unshift(data);
    addAuditLog('预约创建', `创建预约 ${data.id}：${data.customer} · ${datetime} · ${staffName || '未指定技师'}`, data.id);
  }
  if (linkedDeductTxn) {
    addAuditLog('预约关联扣卡', `${data.customer} · ${datetime.slice(0, 10)} · 已关联会员扣卡 ${fmtMoney(linkedFinalTotal)}`, data.id, { txnId: linkedDeductTxn.id, amount: linkedFinalTotal });
  }
  if (linkedDeductTxn || (oldData && oldData.deductId && oldData.deductId !== data.deductId)) {
    save('memberTxns', State.memberTxns);
  }
  let localOk = save('appointments', State.appointments);
  if (localOk && !verifyLocalCollectionHas('appointments', data.id)) {
    try { localStorage.removeItem('lhn_images'); } catch(_) {}
    localOk = save('appointments', State.appointments) && verifyLocalCollectionHas('appointments', data.id);
  }
  if (!localOk) {
    toast('保存失败：预约没有成功写入本机，请先删除部分参考图/清理浏览器空间后再保存', 'error', 6500);
    return;
  }
  const cloudKeys = ['appointments','customers','auditLogs'];
  if (linkedDeductTxn || (oldData && oldData.deductId && oldData.deductId !== data.deductId)) cloudKeys.push('memberTxns');
  const cloudOk = await persistKeysToCloud(cloudKeys, '保存预约核心数据');
  try {
    if (State.images && State.images.length && window.SupabaseSync && window.SupabaseSync.pushKey) {
      window.SupabaseSync.pushKey('images', State.images);
    }
  } catch(_) {}
  if (cloudOk) {
    toast(State.editingId ? '预约已更新并同步云端' : '预约已创建并同步云端', 'success');
  } else {
    toast('预约已保存在本机，云端同步稍后会自动重试', 'success', 3600);
  }

  refreshAllCustomerViews();

  // 📌 ① 第一步：强制关闭新建预约弹窗（用最原始的 DOM 操作，不依赖任何函数）
  try {
    const modal = document.getElementById('apptModal');
    if (modal) modal.classList.remove('show');
  } catch(e) {}
  try { State.editingId = null; } catch(e) {}

  // 📌 ② 第二步：直接切换到日程页（手动操作 DOM，不调用 switchPage，100% 可靠）
  const savedDay = datetime ? datetime.slice(0, 10) : todayDateStr();
  try { State.curSelectedDay = savedDay; } catch(e) {}
  try {
    // 2.1 隐藏所有 page
    const allPages = document.querySelectorAll('.page');
    if (allPages) allPages.forEach(function(p){ try { p.classList.remove('active'); } catch(e){} });
    // 2.2 显示 page-schedule
    const pageSch = document.getElementById('page-schedule');
    if (pageSch) pageSch.classList.add('active');
    // 2.3 侧边栏菜单高亮
    const allNav = document.querySelectorAll('.nav-item');
    if (allNav) allNav.forEach(function(n){ try { n.classList.remove('active'); } catch(e){} });
    const navSch = document.querySelector('.nav-item[data-page="schedule"]');
    if (navSch) navSch.classList.add('active');
    // 2.4 面包屑更新
    const bc = document.getElementById('breadcrumb');
    if (bc) bc.textContent = '📆 日程 / 预约';
  } catch(e) {
    try { console.warn('[saveAppt] 切换页面DOM失败:', e); } catch(e){}
  }

  // 📌 ③ 第三步：手动刷新日程页所有视图（最全面地刷，保证刚建的预约看得见）
  // ✅ render 全部丢下一个 tick，避开 React 循环判定
  const _ds = State.curSelectedDay;
  setTimeout(function() {
    try { renderCalendar(); } catch(e){}
    try { renderApptTable(); } catch(e){}
    try { if (_ds && typeof renderDayDetail==='function') renderDayDetail(_ds); } catch(e){}
    try { renderDashboardSummary(); } catch(e){}
    try { renderOverviewStats(); } catch(e){}
    try { renderTodayAppointments(); } catch(e){}
  }, 0);

  // 📌 ④ 第四步：尝试用 window.switchPage 兜底（如果存在且可用，再走一遍完整逻辑）
  try {
    if (typeof window.switchPage === 'function') {
      setTimeout(function(){ try { window.switchPage('schedule'); } catch(e){} }, 150);
    }
  } catch(e) {}

  // 🎯 第五步：滚到当日详情位置
  setTimeout(function(){
    try {
      const el = document.getElementById('dayDetailSection');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch(e){}
  }, 450);
}

function deleteAppt(id) {
  if (!confirm('确定要删除该预约吗？')) return;
  const a = activeRows(State.appointments).find(x => x.id === id);
  if (!a) { toast('预约不存在或已删除', 'error'); return; }
  softDeleteRecord(a, '手动删除预约');
  save('appointments', State.appointments);
  addAuditLog('预约删除', `软删除预约 ${id}${a?.customer ? '：' + a.customer : ''}`, id);
  setTimeout(function() {
    try { renderTodayAppointments(); } catch(e){}
    try { renderApptTable(); } catch(e){}
    try { renderCalendar(); } catch(e){}
    try { renderDashboardSummary(); } catch(e){}
  }, 0);
  toast('已删除');
}

// ============ 更改定价弹窗（完全可自定义增删改） ============
let priceModalGroup = null; // 兼容老的 openPriceModal('style') 入口：仍保留全局引用
function openPriceModal(group) {
  priceModalGroup = group || null;
  // 打开前先补全 key，避免任何无 key 项
  if (_ensurePriceKeys()) {
    try { save('prices', State.prices); backupPriceConfig(); } catch(e) {}
  }

  // 构建上下文
  _priceModalCtx = {
    singleGroup: group && PRICE_GROUP_META[group] ? group : null,
    activeGroup: group && PRICE_GROUP_META[group] ? group : PRICE_GROUP_ORDER[0]
  };

  const title = document.getElementById('priceModalTitle');
  const dlg   = document.getElementById('priceModalDialog');
  if (title) {
    title.textContent = _priceModalCtx.singleGroup
      ? `💴 管理 · ${PRICE_GROUP_META[_priceModalCtx.singleGroup].title}定价`
      : `💴 管理全部服务定价`;
  }
  if (dlg) {
    dlg.style.maxWidth = '920px';
  }
  // 刷新 Tab 栏 + 恢复默认按钮文案
  _refreshPriceTabBar();
  // 渲染卡片内容
  _rerenderPriceModalBody();
  document.getElementById('priceModal').classList.add('show');
}
function closePriceModal() {
  document.getElementById('priceModal').classList.remove('show');
}
function savePriceConfig() {
  // 0) 先深拷贝旧 prices，用于颜色重命名迁移对比
  const oldPrices = JSON.parse(JSON.stringify(State.prices || {}));

  // 1) 先同步名称 / 手动模式 checkbox / 价格 到 State.prices
  //    名称
  let hasEmpty = false;
  let emptyGroup = '';
  document.querySelectorAll('#priceEditList .pe-name-input').forEach(inp => {
    const g = inp.dataset.group;
    const i = +inp.dataset.idx;
    const v = (inp.value || '').trim();
    if (!v) { hasEmpty = true; emptyGroup = g; }
    if (State.prices[g] && State.prices[g][i]) {
      State.prices[g][i].name = v;
    }
  });
  if (hasEmpty) {
    const gname = (PRICE_GROUP_META[emptyGroup] || {}).title || '';
    toast(`${gname ? '「' + gname + '」' : ''}存在空项目名称，不允许保存`, 'error');
    return;
  }
  //    手动模式
  document.querySelectorAll('#priceEditList .pei-custom-cb').forEach(cb => {
    const g = cb.dataset.group;
    const i = +cb.dataset.idx;
    if (State.prices[g] && State.prices[g][i]) {
      State.prices[g][i].custom = !!cb.checked;
    }
  });
  //    价格
  document.querySelectorAll('#priceEditList .pei-input').forEach(inp => {
    const g = inp.dataset.group;
    const i = +inp.dataset.idx;
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v >= 0 && State.prices[g] && State.prices[g][i]) {
      State.prices[g][i].price = v;
    }
  });

  // 2) 再次确保所有项目都有 key（防御性）
  _ensurePriceKeys();
  touchPriceConfig();

  // 3) 持久化
  save('prices', State.prices);
  backupPriceConfig();
  addAuditLog('定价更新', '保存服务定价配置');

  // 【🎨 定价 ↔ 颜色 联动】保存后立即同步颜色配置：新增项目补齐默认色 + 重命名保持颜色值
  syncColorsWithPrices(oldPrices);
  save('calColors', State.calColors);
  // 4) 刷新消费端视图：预约弹窗下拉 / 预约表格 / 今日列表 / 日历等
  renderPriceOptions();
  renderApptTable();
  try { renderTodayAppointments(); } catch (e) {}
  try { renderCalendar(); } catch (e) {}
  try { saveStateAll(); } catch (e) {}
  // ⚠️ 安全保护：首次拉取完成前不直接推送配置数据
  if (SupabaseRuntime.cloudPulledOnce) {
    try { window.SupabaseSync && window.SupabaseSync.pushKey && window.SupabaseSync.pushKey('prices', State.prices); } catch (e) {}
    try { window.SupabaseSync && window.SupabaseSync.pushKey && window.SupabaseSync.pushKey('calColors', State.calColors); } catch (e) {}
  }
  closePriceModal();
  toast('新定价已保存，开单/扣卡下拉均已同步', 'success');
}

// ============ 日历视图 ============
// ============ 日历：项目类型颜色管理 ============
// 🎯 新版：颜色设置面板 & 日历显示，统一走「colorTypes 数组」（默认就 10 项，用户可自行加）
// 旧的 DEFAULT_CAL_COLORS + calColors 保留，用作向后兼容回退
const DEFAULT_CAL_COLORS = {
  benjia:   '#D4A574',   // 本甲 - 奶茶棕
  jiamo:    '#E5C66E',   // 甲膜 - 柔金黄
  gaowei:   '#B892C9',   // 高位半贴 - 淡紫
  bantie:   '#7BA17C',   // 半贴 - 橄榄绿
  qiantie:  '#6B9BB5',   // 浅帖 - 雾霾蓝
  meijie:   '#E88C8C'    // 美睫 - 豆沙粉
};
/* 默认 10 种项目类型（完全按用户指定）：
   本甲、甲片二次利用、高位半贴、甲膜、半贴、浅帖、美睫、卸本甲、卸甲片、卸睫毛 */
const DEFAULT_COLOR_TYPES = [
  { id: 'benjia',   label: '本甲',         icon: '💅', color: '#D4A574', builtin: true,
    matchTip: ['self','tip_0','benjia'], matchStyle: [], matchBiz: [] },
  { id: 'erci',     label: '甲片二次利用', icon: '♻️', color: '#9BB87C', builtin: true,
    matchTip: ['erci','reuse','tip_reuse','jiayi','jiayong'], matchStyle: [], matchBiz: [] },
  { id: 'gaowei',   label: '高位半贴',     icon: '✨', color: '#B892C9', builtin: true,
    matchTip: ['hhalf','tip_gaowei','gaowei'], matchStyle: [], matchBiz: [] },
  { id: 'jiamo',    label: '甲膜',         icon: '🧴', color: '#E5C66E', builtin: true,
    matchTip: ['jiamo','tip_jiamo'], matchStyle: [], matchBiz: [] },
  { id: 'bantie',   label: '半贴',         icon: '💅', color: '#7BA17C', builtin: true,
    matchTip: ['half','tip_half','bantie'], matchStyle: [], matchBiz: [] },
  { id: 'qiantie',  label: '浅帖',         icon: '🌸', color: '#6B9BB5', builtin: true,
    matchTip: ['shallow','tip_shallow','qiantie'], matchStyle: [], matchBiz: [] },
  { id: 'meijie',   label: '美睫',         icon: '👁️', color: '#E88C8C', builtin: true,
    matchTip: [], matchStyle: [], matchBiz: ['lash'] },
  { id: 'rm_ben',   label: '卸本甲',       icon: '🧹', color: '#C9A98A', builtin: true,
    matchTip: [], matchStyle: [], matchBiz: [], matchRemoveNail: ['rn_self','卸本甲'] },
  { id: 'rm_tip',   label: '卸甲片',       icon: '🧹', color: '#B48B6A', builtin: true,
    matchTip: [], matchStyle: [], matchBiz: [], matchRemoveNail: ['rn_tip','卸甲片','rn_hard','特别难卸除'] },
  { id: 'rm_lash',  label: '卸睫毛',       icon: '🧹', color: '#C5A9B4', builtin: true,
    matchTip: [], matchStyle: [], matchBiz: [], matchRemoveLash: ['rl_std','卸睫毛'] }
];
/* CAL_TYPE_META：直接从 colorTypes 动态生成（给旧代码的引用兜底） */
function _buildCalTypeMetaFromColorTypes() {
  try {
    return (State.colorTypes || DEFAULT_COLOR_TYPES).map(t => ({ key: t.id, label: t.label, icon: t.icon }));
  } catch(e) {
    return DEFAULT_COLOR_TYPES.map(t => ({ key: t.id, label: t.label, icon: t.icon }));
  }
}
let CAL_TYPE_META = _buildCalTypeMetaFromColorTypes();
/* 启动时补齐 colorTypes：老用户没这字段就按默认 10 项初始化；已有但缺内置项目就补进去（保留颜色值） */
function _ensureColorTypes() {
  const current = Array.isArray(State.colorTypes) && State.colorTypes.length ? State.colorTypes : null;
  const fromLS = current || load('colorTypes', null);
  let arr = Array.isArray(fromLS) ? fromLS.slice() : [];
  // 把内置 10 项按顺序插回（已有同名/同 id 的合并颜色，不覆盖用户改的色）
  const byId = new Map();
  arr.forEach(t => { if (t && t.id) byId.set(t.id, t); });
  const merged = [];
  DEFAULT_COLOR_TYPES.forEach(def => {
    if (byId.has(def.id)) {
      const existing = byId.get(def.id);
      merged.push({
        ...def,
        ...existing,
        color: existing.color || def.color,
        icon: existing.icon || def.icon,
        label: existing.label || def.label,
        builtin: true
      });
      byId.delete(def.id);
    } else {
      merged.push({ ...def });
    }
  });
  // 用户自己新增的（不在默认 10 项里的）追加到末尾
  byId.forEach(t => merged.push({ ...t, builtin: !!t.builtin }));
  State.colorTypes = merged;
  // 启动补齐只写本地，不主动推云端；避免手机旧颜色启动时覆盖电脑刚保存的新颜色
  try { localStorage.setItem('lhn_colorTypes', JSON.stringify(State.colorTypes)); } catch(e) {}
  // 同步生成 CAL_TYPE_META 给旧代码使用
  CAL_TYPE_META = _buildCalTypeMetaFromColorTypes();
  return State.colorTypes;
}
State.calColors = State.calColors || load('calColors', null) || { ...DEFAULT_CAL_COLORS };
// 补齐缺省（旧的 calColors 保留用于老数据兼容）
Object.keys(DEFAULT_CAL_COLORS).forEach(k => { if (!State.calColors[k]) State.calColors[k] = DEFAULT_CAL_COLORS[k]; });
_ensureColorTypes();

// 【🎯 新版核心】根据预约对象 → colorTypes 中对应项目（返回 colorTypes 的一项）
function _matchColorTypeOfAppt(a) {
  if (!a) return State.colorTypes?.[0] || DEFAULT_COLOR_TYPES[0];
  const types = State.colorTypes || DEFAULT_COLOR_TYPES;
  // 1) 美甲预约：颜色优先看“甲片类型”，例如「本甲 + 卸甲片」显示本甲颜色
  if (a.biz !== 'lash' && a.tip) {
    const hit = types.find(t => {
      if (!Array.isArray(t.matchTip) || !t.matchTip.length) return false;
      return t.matchTip.some(k => k === a.tip || (typeof a.tip === 'string' && (k === a.tip.toLowerCase() || a.tip.indexOf(k) === 0)));
    });
    if (hit) return hit;
  }
  // 2) 美甲没有甲片类型时，再按卸甲取色
  if (a.biz !== 'lash' && a.removeNail) {
    const hit = types.find(t => {
      if (!Array.isArray(t.matchRemoveNail)) return false;
      return t.matchRemoveNail.some(k => k === a.removeNail || k === a.removeNailName ||
        (typeof a.removeNail === 'string' && k.indexOf(a.removeNail) >= 0));
    });
    if (hit) return hit;
  }
  // 3) 美睫业务
  if (a.biz === 'lash') {
    const hit = types.find(t => Array.isArray(t.matchBiz) && t.matchBiz.includes('lash'));
    if (hit) return hit;
  }
  // 4) 美睫卸睫毛：美睫主色找不到时再按卸睫取色
  if (a.removeLash) {
    const hit = types.find(t => {
      if (!Array.isArray(t.matchRemoveLash)) return false;
      return t.matchRemoveLash.some(k => k === a.removeLash || k === a.removeLashName ||
        (typeof a.removeLash === 'string' && k.indexOf(a.removeLash) >= 0));
    });
    if (hit) return hit;
  }
  // 5) 兜底：返回第一项（本甲）
  return types[0] || DEFAULT_COLOR_TYPES[0];
}
function typeColor(key) {
  try {
    const t = (State.colorTypes || DEFAULT_COLOR_TYPES).find(x => x.id === key);
    if (t && t.color) return t.color;
  } catch(e) {}
  return State.calColors[key] || DEFAULT_CAL_COLORS[key] || '#D4A574';
}

// 根据预约推断项目类型（用于配色）
function apptTypeKey(a) {
  try {
    const t = _matchColorTypeOfAppt(a);
    if (t && t.id) return t.id;
  } catch(e) {}
  // 旧逻辑兜底（防止 colorTypes 为空）
  if (a.biz === 'lash') return 'meijie';
  if (a.tip === 'tip_0' || a.tip === 'self' || (!a.tip && a.style)) return 'benjia';
  if (a.tip === 'jiamo' || a.tip === 'tip_jiamo') return 'jiamo';
  if (a.tip === 'tip_gaowei' || a.tip === 'hhalf') return 'gaowei';
  if (a.tip === 'tip_half' || a.tip === 'half') return 'bantie';
  if (a.tip === 'tip_shallow' || a.tip === 'shallow') return 'qiantie';
  return 'benjia';
}
function apptTypeLabel(a) {
  if (a.biz === 'lash') {
    const lp = _lookupPrice('lash', a.lash);
    return lp ? '美睫·' + lp.name : '美睫';
  }
  const tp = _lookupPrice('tip',   a.tip);
  const sp = _lookupPrice('style', a.style);
  return [sp?.name, tp?.name].filter(Boolean).join(' · ') || '美甲';
}
function _deductItemsLabel(txn) {
  const names = (txn?.items || [])
    .map(i => `${i?.name || ''}${Number(i?.qty || 1) > 1 ? '×' + Number(i.qty || 1) : ''}`)
    .filter(Boolean);
  return names.join('、') || txn?.subtype || '会员扣卡';
}
function _apptDateTimeLabel(a) {
  const raw = a?.datetime || a?.date || '';
  if (!raw) return '未填写时间';
  const day = raw.slice(0, 10);
  const time = raw.includes('T') ? raw.slice(11, 16) : (a?.time || '');
  return `${day}${time ? ' ' + time : ''}`;
}
function _apptDisplayLabel(a) {
  if (!a) return '预约不存在';
  return `${_apptDateTimeLabel(a)} · ${a.customer || '未命名顾客'} · ${apptTypeLabel(a)} · ${statusLabel(normalizeApptStatus(a.status))}`;
}
// 【🎯 新版】根据预约对象取色：只走 colorTypes（与设置面板完全同步），不再按具体款式分色
function apptColor(a) {
  try {
    const t = _matchColorTypeOfAppt(a);
    if (t && t.color) return t.color;
  } catch(e) {}
  // 旧逻辑兜底
  try {
    if (!a) return '#D4A574';
    if (a.biz === 'lash') {
      return State.calColors['meijie'] || DEFAULT_CAL_COLORS['meijie'] || '#E88C8C';
    }
    const baseKey = apptTypeKey(a);
    return State.calColors[baseKey] || DEFAULT_CAL_COLORS[baseKey] || '#D4A574';
  } catch(e) { return '#D4A574'; }
}

// ============ 日历月视图：状态/导航 ============
State.calCursor = State.calCursor || { year: new Date().getFullYear(), month: new Date().getMonth() };

function calPrevMonth() {
  State.calCursor.month--;
  if (State.calCursor.month < 0) { State.calCursor.month = 11; State.calCursor.year--; }
  renderCalendar();
}
function calNextMonth() {
  State.calCursor.month++;
  if (State.calCursor.month > 11) { State.calCursor.month = 0; State.calCursor.year++; }
  renderCalendar();
}
function calToToday() {
  const t = new Date();
  State.calCursor = { year: t.getFullYear(), month: t.getMonth() };
  renderCalendar();
}

// ============ 月视图日历渲染 ============
function renderCalendar() {
  // ---- 颜色图例（直接用 colorTypes：10 项默认 + 用户自己新增的，与设置面板完全同步）----
  const legendEl = document.getElementById('calLegend');
  if (legendEl) {
    const types = Array.isArray(State.colorTypes) && State.colorTypes.length > 0
      ? State.colorTypes
      : DEFAULT_COLOR_TYPES;
    legendEl.innerHTML = types.map(t => `
      <div class="legend-item" onclick="openColorModal()">
        <span class="legend-dot" style="background:${t.color || '#D4A574'};"></span>
        <span>${t.icon || '🎨'} ${t.label || '未命名'}</span>
      </div>
    `).join('');
  }

  const titleEl = document.getElementById('calMonthTitle');
  const gridEl = document.getElementById('calMonthGrid');
  if (!titleEl || !gridEl) return;

  const { year, month } = State.calCursor;
  titleEl.textContent = `${year} 年 ${month + 1} 月`;

  // 1号是周几（周一=0 ... 周日=6）
  const firstDay = new Date(year, month, 1);
  const jsDow = firstDay.getDay(); // 0=周日
  const offset = (jsDow + 6) % 7; // 周一为 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDaysInMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const todayStr = localDateStr(today);

  // 收集当月预约按日期分组
  const byDay = {};
  activeRows(State.appointments).forEach(a => {
    if (a.status === 'canceled') return;
    const ds = (a.datetime || '').slice(0, 10);
    if (!ds) return;
    if (!(ds in byDay)) byDay[ds] = [];
    byDay[ds].push(a);
  });
  Object.values(byDay).forEach(list => list.sort((x, y) => (x.datetime || '').localeCompare(y.datetime || '')));

  const cells = [];
  // 前置填充（上个月的尾部）
  for (let i = 0; i < offset; i++) {
    const d = prevDaysInMonth - offset + 1 + i;
    const dt = new Date(year, month - 1, d);
    const ds = localDateStr(dt);
    cells.push({ other: true, day: d, ds });
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const ds = localDateStr(dt);
    cells.push({ other: false, day: d, ds, isToday: ds === todayStr });
  }
  // 后置填充
  const remain = Math.ceil(cells.length / 7) * 7 - cells.length;
  for (let d = 1; d <= remain; d++) {
    const dt = new Date(year, month + 1, d);
    const ds = localDateStr(dt);
    cells.push({ other: true, day: d, ds });
  }

  gridEl.innerHTML = cells.map(c => {
    const list = byDay[c.ds] || [];
    const maxShow = 3;
    const show = list.slice(0, maxShow);
    const extra = list.length - maxShow;
    const eventsHtml = show.map(a => {
      const tk = apptTypeKey(a);
      const col = apptColor(a);
      const hh = new Date(a.datetime).getHours();
      const mm = new Date(a.datetime).getMinutes();
      const tm = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      const label = a.customer || '（未填客户）';
      return `<div class="cal-cell-event" style="background:${col};" onclick="event.stopPropagation(); openApptDetail('${a.id}')">
        <span class="cce-time">${tm}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(label)}</span>
      </div>`;
    }).join('');
    const moreHtml = extra > 0
      ? `<div class="cal-cell-more" onclick="event.stopPropagation(); openDayListModal('${c.ds}')">+ ${extra} 更多</div>`
      : '';
    const cellCls = [
      'cal-cell',
      c.other ? 'other-month' : '',
      c.isToday ? 'today' : '',
      State.curSelectedDay === c.ds ? 'cal-selected' : ''
    ].filter(Boolean).join(' ');
    return `<div class="${cellCls}" onclick="selectCalDay('${c.ds}')">
      <div class="cal-day-num">${c.day}</div>
      <div class="cal-cell-events">${eventsHtml}${moreHtml}</div>
    </div>`;
  }).join('');
}

// ============ 选中日历某一天，渲染当日详情 ============
function selectCalDay(ds) {
  State.curSelectedDay = ds;
  renderCalendar();
  renderDayDetail(ds);
}
function renderDayDetail(ds) {
  const titleEl = document.getElementById('dayDetailTitle');
  const metaEl  = document.getElementById('dayDetailMeta');
  const listEl  = document.getElementById('dayDetailList');
  const newBtn  = document.getElementById('dayDetailNewBtn');
  if (!titleEl || !metaEl || !listEl) return;

  const list = activeRows(State.appointments)
    .filter(a => a.status !== 'canceled' && (a.datetime || '').startsWith(ds))
    .sort((x, y) => (x.datetime || '').localeCompare(y.datetime || ''));

  const d = new Date(ds + 'T00:00:00');
  const wk = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  titleEl.textContent = `📅 ${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${wk} · 当日预约`;

  const doneCount = list.filter(a => a.status === 'done').length;
  metaEl.textContent = `共 ${list.length} 单 · 完成 ${doneCount}`;

  if (newBtn) newBtn.style.display = 'inline-flex';

  if (list.length === 0) {
    listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px;border:1.5px dashed #C5DCEF;border-radius:14px;background:#F5FAFE;">📭 当天还没有预约，点击右上角「在这天新建预约」开单吧~</div>`;
    return;
  }

  listEl.innerHTML = list.map(a => {
    const tk = apptTypeKey(a);
    const col = apptColor(a);
    const hh = new Date(a.datetime).getHours();
    const mm = new Date(a.datetime).getMinutes();
    const tm = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    const mem = memberLabel(a.member);

    const bizTag = a.biz === 'lash'
      ? `<span class="appt-tag" style="background:#FDEAEA;color:#C76161;border:1px solid #F6CFCF;font-size:11px;padding:2px 8px;">👁️ 美睫</span>`
      : `<span class="appt-tag" style="background:#E6F1F9;color:#3F86B2;border:1px solid #C9DFF2;font-size:11px;padding:2px 8px;">💅 美甲</span>`;

    const statusHtml = `<span class="status ${a.status}">${statusLabel(a.status)}</span>`;

    const cardCls = 'day-appt-card';
    const typeName = apptTypeLabel(a);
    return `
      <div class="${cardCls}" onclick="openApptDetail('${a.id}')">
        <div class="dac-color-bar" style="width:4px;align-self:stretch;border-radius:3px;background:${col};flex-shrink:0;"></div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;min-width:80px;">
          <div class="dac-time" style="font-weight:700;color:var(--ink);font-size:14px;min-width:50px;">${tm}</div>
          ${statusHtml}
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <div class="dac-name" style="font-weight:700;color:var(--ink);font-size:14px;">${escapeHtml(a.customer||'（未填姓名）')}</div>
            ${mem.tag ? `<span class="appt-tag ${mem.cls||''}" style="font-size:11px;">${mem.tag}${(mem.label||'').replace('会员','')}</span>` : ''}
            ${bizTag}
          </div>
          <div class="dac-meta" style="font-size:12px;color:var(--muted);">${typeName}</div>
        </div>
        <div class="dac-price" style="font-weight:700;color:var(--accent);font-size:14px;flex-shrink:0;margin-right:4px;">${fmtMoney(a.finalTotal||0)}</div>
        <div class="dac-actions" onclick="event.stopPropagation();">
          <button class="btn-ghost xsmall" onclick="openApptDetail('${a.id}')">📋 详情</button>
          <button class="btn-ghost xsmall" onclick="openApptModal('${a.id}')">✏️ 编辑</button>
        </div>
      </div>`;
  }).join('');
}

// ============ 点击某天的「+ N 更多」：弹窗列出当天预约 ============
function openDayListModal(ds) {
  const list = (activeRows(State.appointments).filter(a => a.status !== 'canceled' && (a.datetime || '').startsWith(ds)) || [])
    .sort((x, y) => (x.datetime || '').localeCompare(y.datetime || ''));
  const body = document.getElementById('apptDetailBody');
  if (!body) return;
  const d = new Date(ds + 'T00:00:00');
  const w = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  document.getElementById('adTitle').textContent = `📋 ${d.getMonth()+1}月${d.getDate()}日 ${w} · 当日预约（${list.length}）`;
  if (list.length === 0) {
    body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);">当天还没有预约 🍵</div>`;
  } else {
    body.innerHTML = `<div style="padding:12px 20px;display:flex;flex-direction:column;gap:8px;">` +
      list.map(a => {
        const tk = apptTypeKey(a);
        const col = apptColor(a);
        const hh = new Date(a.datetime).getHours();
        const mm = new Date(a.datetime).getMinutes();
        const tm = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
        return `<div onclick="openApptDetail('${a.id}')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--rule);border-radius:10px;cursor:pointer;background:#fff;transition:all .2s;" onmouseover="this.style.borderColor='${col}'" onmouseout="this.style.borderColor='var(--rule)'">
          <div style="width:4px;height:36px;border-radius:3px;background:${col};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <div style="font-weight:700;color:var(--ink);font-size:14px;">${escapeHtml(a.customer||'（未填姓名）')} ${memberLabel(a.member).tag||''}</div>
              <div style="font-size:12px;color:var(--muted);font-weight:600;">${tm}</div>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">${apptTypeLabel(a)} · ${fmtMoney(a.finalTotal||0)}</div>
          </div>
        </div>`;
      }).join('') + `</div>`;
  }
  // 隐藏详情底部两个操作按钮
  const editBtn = document.getElementById('adEditBtn');
  const flowActions = document.getElementById('adFlowActions');
  if (editBtn) editBtn.style.display = 'none';
  if (flowActions) flowActions.innerHTML = '';
  document.getElementById('apptDetailModal').classList.add('show');
}

// ============ 项目颜色设置弹窗 ============
let _tmpColorTypes = null;   // 编辑中的临时 colorTypes 数组
function openColorModal() {
  const modal = document.getElementById('colorModal');
  const wrap = document.getElementById('colorSettingList');
  if (!modal || !wrap) { toast('页面还在加载，请稍候再试', 'error'); return; }
  // 先确保 colorTypes 存在（老用户首次打开）
  _ensureColorTypes();
  // 做一份深拷贝，不直接改 State，点保存才落盘
  _tmpColorTypes = JSON.parse(JSON.stringify(State.colorTypes || DEFAULT_COLOR_TYPES));
  _renderColorSettingBody();
  modal.classList.add('show');
}
/* 渲染 colorTypes 列表 + 新增按钮 */
function _renderColorSettingBody() {
  const wrap = document.getElementById('colorSettingList');
  if (!wrap) return;
  const list = Array.isArray(_tmpColorTypes) ? _tmpColorTypes : [];
  const rows = list.map((t, idx) => {
    const safeId = 'ct_' + String(t.id || idx).replace(/[^a-zA-Z0-9_]/g, '_') + '_' + idx;
    const isBuiltin = !!t.builtin;
    return `
    <div class="color-set-row" data-ctidx="${idx}" style="gap:10px;">
      <div class="color-set-label" style="gap:10px;flex:1;min-width:0;">
        <span class="color-set-preview" id="${safeId}_pv" style="background:${t.color || '#D4A574'};"></span>
        <span style="display:inline-flex;align-items:center;gap:6px;flex:1;min-width:0;">
          <span style="font-size:16px;">${t.icon || '🎨'}</span>
          <input type="text" value="${escapeHtml(t.label || '')}"
                 class="form-input"
                 style="padding:4px 8px;font-size:14px;font-weight:600;flex:1;min-width:80px;"
                 onchange="_ctUpdateLabel(${idx}, this.value)">
        </span>
      </div>
      <span class="color-set-hex" id="${safeId}_hex">${t.color || '#D4A574'}</span>
      <label class="color-set-btn" title="点击选择「${escapeHtml(t.label||'项目')}」的颜色">
        <span class="csb-icon">🎨</span>
        <span class="csb-text">选色</span>
        <input type="color" class="color-set-input" id="${safeId}_in" value="${t.color || '#D4A574'}"
               oninput="_ctUpdateColor(${idx}, this.value, '${safeId}')">
      </label>
      <button class="op-btn danger"
              style="${isBuiltin ? 'opacity:0.4;cursor:not-allowed;' : ''}"
              title="${isBuiltin ? '默认10项不可删除' : '删除该项目类型'}"
              ${isBuiltin ? 'disabled' : ''}
              onclick="_ctRemoveAt(${idx})">🗑 删除</button>
    </div>`;
  }).join('');
  // 新增按钮 + 提示
  const addBtn = `
  <div style="margin-top:6px;padding:10px 4px 0;border-top:1px dashed #E3EAF1;">
    <button class="btn-secondary" style="width:100%;justify-content:center;" onclick="_ctAddNew()">
      ➕ 新增项目类型（后续需要可手动增加）
    </button>
    <div style="font-size:11px;color:#8A99A8;line-height:1.85;margin-top:10px;padding-left:4px;">
💡 使用说明：<br>
• 上方 10 个是 LH Nail 默认类型：本甲 / 甲片二次利用 / 高位半贴 / 甲膜 / 半贴 / 浅帖 / 美睫 / 卸本甲 / 卸甲片 / 卸睫毛，日程中的预约会自动按类型匹配对应颜色<br>
• 想加其他类型？直接点上面「➕ 新增项目类型」，可自定义名字和颜色<br>
• 标签文字直接点击即可修改；颜色点「🎨 选色」即可；只有你自己新增的项目可以删除
</div>
  </div>`;
  wrap.innerHTML = rows + addBtn;
}
function _ctUpdateColor(idx, color, safeKey) {
  if (!Array.isArray(_tmpColorTypes) || !_tmpColorTypes[idx]) return;
  _tmpColorTypes[idx].color = color;
  const pv = document.getElementById(safeKey + '_pv');
  if (pv) pv.style.background = color;
  const hx = document.getElementById(safeKey + '_hex');
  if (hx) hx.textContent = color;
}
function _ctUpdateLabel(idx, newLabel) {
  if (!Array.isArray(_tmpColorTypes) || !_tmpColorTypes[idx]) return;
  const v = String(newLabel || '').trim();
  if (!v) { toast('项目名称不能为空', 'error'); _renderColorSettingBody(); return; }
  _tmpColorTypes[idx].label = v;
}
function _ctRemoveAt(idx) {
  if (!Array.isArray(_tmpColorTypes)) return;
  const old = _tmpColorTypes[idx];
  if (old && old.builtin) { toast('默认 10 项不可删除', 'error'); return; }
  if (!confirm(`确定删除「${old?.label || '该项目类型'}」吗？\n删除后日程中该类型的预约将自动按第一个可匹配类型取色`)) return;
  _tmpColorTypes.splice(idx, 1);
  _renderColorSettingBody();
}
function _ctAddNew() {
  if (!Array.isArray(_tmpColorTypes)) _tmpColorTypes = [];
  const newId = 'custom_' + Date.now().toString(36);
  const defaultColors = ['#7DB5C9','#D59FA6','#C2B280','#9FA8DA','#A3C9A8','#E8B290','#B892C9','#8FB8A0','#D4A574','#89A6C4'];
  const pickColor = defaultColors[_tmpColorTypes.length % defaultColors.length];
  _tmpColorTypes.push({
    id: newId,
    label: '新项目',
    icon: '🎨',
    color: pickColor,
    builtin: false,
    matchTip: [],
    matchStyle: [],
    matchBiz: [],
    matchRemoveNail: [],
    matchRemoveLash: []
  });
  _renderColorSettingBody();
  toast('✅ 已新增，现在可以改名字 + 选颜色', 'success');
}
function closeColorModal() {
  document.getElementById('colorModal').classList.remove('show');
  _tmpColorTypes = null;
}
function resetCalColors() {
  if (!confirm('确定恢复项目颜色为默认 10 项？（自定义颜色将重置为默认色，自己新增的项目保留）')) return;
  // 重建默认 10 项，合并自己新增的（不丢）
  const byId = new Map();
  if (Array.isArray(_tmpColorTypes)) {
    _tmpColorTypes.forEach(t => { if (t && t.id) byId.set(t.id, t); });
  }
  const merged = [];
  DEFAULT_COLOR_TYPES.forEach(def => {
    const existing = byId.get(def.id);
    if (existing) {
      merged.push({ ...def, color: def.color, icon: def.icon, label: def.label, builtin: true });
    } else {
      merged.push({ ...def });
    }
    byId.delete(def.id);
  });
  byId.forEach(t => merged.push({ ...t, builtin: !!t.builtin }));
  _tmpColorTypes = merged;
  _renderColorSettingBody();
  toast('已恢复默认颜色，记得点「保存」', 'success');
}
async function saveCalColors() {
  if (!Array.isArray(_tmpColorTypes) || _tmpColorTypes.length < 1) {
    toast('至少保留 1 个项目类型', 'error'); return;
  }
  // 1) 标签空校验 & 去重
  const seenId = new Set();
  for (let i = 0; i < _tmpColorTypes.length; i++) {
    const t = _tmpColorTypes[i];
    if (!t) continue;
    const label = String(t.label || '').trim();
    if (!label) { toast(`第 ${i+1} 行项目名称为空`, 'error'); return; }
    t.label = label;
    if (!t.id) t.id = 'custom_' + genId('CT');
    if (!t.icon) t.icon = '🎨';
    if (!t.color) t.color = '#D4A574';
    if (!seenId.has(t.id)) seenId.add(t.id);
  }
  // 2) 保存 colorTypes（新格式，主数据源）
  State.colorTypes = JSON.parse(JSON.stringify(_tmpColorTypes));
  const colorTs = Date.now();
  State.colorTypes.forEach(t => {
    if (!t || typeof t !== 'object') return;
    t.updatedAt = colorTs;
    t.updatedBy = currentUserName();
  });
  save('colorTypes', State.colorTypes);
  // 3) 同步到 CAL_TYPE_META（旧代码引用点）
  CAL_TYPE_META = _buildCalTypeMetaFromColorTypes();
  // 4) 为了向后兼容：把 colorTypes 的颜色值同步写入旧 calColors（按 id 映射）
  try {
    State.colorTypes.forEach(t => {
      if (t && t.id && t.color) {
        State.calColors[t.id] = t.color;
        // 兼容旧 key 别名（不破坏老数据）
        if (t.id === 'benjia')  State.calColors['benjia'] = t.color;
        if (t.id === 'gaowei')  State.calColors['gaowei'] = t.color;
        if (t.id === 'jiamo')   State.calColors['jiamo'] = t.color;
        if (t.id === 'bantie')  State.calColors['bantie'] = t.color;
        if (t.id === 'qiantie') State.calColors['qiantie'] = t.color;
        if (t.id === 'meijie')  State.calColors['meijie'] = t.color;
      }
    });
    State.calColors.__updatedAt = colorTs;
    State.calColors.__updatedBy = currentUserName();
    State.calColors.__syncVersion = (Number(State.calColors.__syncVersion) || 0) + 1;
    save('calColors', State.calColors);
  } catch(e) {}
  let cloudOk = false;
  try {
    cloudOk = await persistKeysToCloud(['colorTypes','calColors'], '保存日程项目颜色');
  } catch(e) { cloudOk = false; }
  closeColorModal();
  try { renderCalendar(); } catch(e){}
  try { renderApptTable(); } catch(e){}
  if (cloudOk) {
    toast('✅ 颜色设置已保存并同步云端，手机端会自动更新', 'success', 3000);
  } else {
    toast('颜色已保存在本机，云端同步稍后会自动重试', 'success', 3600);
  }
}

// ============ 预约详情弹窗 ============
let _currentDetailId = null;
let _currentReceiptApptId = null;
function _formatPayTime(a) {
  const raw = a?.completedPayAt || a?.doneAt || a?.datetime || '';
  const d = raw ? new Date(raw) : new Date();
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN');
}
function _apptPayParts(a) {
  const amount = Number(a?.payAmount ?? a?.finalTotal) || 0;
  let deduct = Number(a?.deductAmount) || 0;
  let extra = Number(a?.extraAmount) || 0;
  const pay = a?.payMethod || '';
  if ((!deduct && !extra) && (pay.includes('储值卡扣') || pay.includes('扣卡'))) {
    const parts = _parseMoneyParts(pay);
    if (pay.includes('补差')) {
      deduct = parts[0] || 0;
      extra = parts[1] || Math.max(0, amount - deduct);
    } else {
      deduct = amount;
    }
  }
  if (deduct > amount) deduct = amount;
  if (extra <= 0 && deduct > 0) extra = Math.max(0, amount - deduct);
  const normal = Math.max(0, amount - deduct);
  return { amount, deduct, extra, normal };
}
function _receiptCustomerBalance(a) {
  const tx = a?.deductId ? activeRows(State.memberTxns).find(t => t.id === a.deductId) : null;
  if (tx && tx.balanceAfter != null) return Number(tx.balanceAfter) || 0;
  const c = _findCustomerForAppt(a);
  return c && c.balance != null ? Number(c.balance) || 0 : null;
}
function _paymentReceiptHtml(a, compact = false) {
  if (!a) return '';
  const c = _findCustomerForAppt(a);
  const parts = _apptPayParts(a);
  const bal = _receiptCustomerBalance(a);
  const items = _apptDeductItems(a).map(i => `${escapeHtml(i.name || '')}${i.qty ? ' ×' + i.qty : ''}`).join('，') || escapeHtml(apptTypeLabel(a));
  const extraPay = a.extraPayMethod ? `（${escapeHtml(a.extraPayMethod)}）` : '';
  const remark = a.payRemark ? escapeHtml(a.payRemark).replace(/\n/g, '<br>') : '<span style="color:var(--muted);">（无）</span>';
  return `
    <div class="${compact ? 'pay-info-card compact' : 'pay-receipt-card'}">
      <div class="pr-head">
        <div>
          <div class="pr-title">${compact ? '收款信息' : 'LH Nail 收款确认单'}</div>
          <div class="pr-sub">${escapeHtml(a.id)} · ${_formatPayTime(a)}</div>
        </div>
        <span class="pr-badge">已入账</span>
      </div>
      <div class="pr-main">
        <div class="pr-row"><span>顾客</span><strong>${escapeHtml(a.customer || c?.name || '未命名顾客')}</strong></div>
        <div class="pr-row"><span>项目</span><strong>${items}</strong></div>
        <div class="pr-row"><span>实收金额</span><strong class="money">${fmtMoney(parts.amount)}</strong></div>
        <div class="pr-row"><span>支付方式</span><strong>${escapeHtml(a.payMethod || '未填写')}</strong></div>
        ${parts.deduct > 0 ? `<div class="pr-row"><span>会员扣卡</span><strong class="deduct">- ${fmtMoney(parts.deduct)}</strong></div>` : ''}
        ${parts.extra > 0 ? `<div class="pr-row"><span>补差金额${extraPay}</span><strong>${fmtMoney(parts.extra)}</strong></div>` : ''}
        ${bal != null && parts.deduct > 0 ? `<div class="pr-row"><span>扣卡后余额</span><strong>${fmtMoney(bal)}</strong></div>` : ''}
        <div class="pr-row"><span>收款备注</span><strong>${remark}</strong></div>
      </div>
      ${compact ? '' : '<div class="pr-tip">请核对顾客、项目、金额和支付方式，确认无误后可截图或复制保存。</div>'}
    </div>
  `;
}
function _paymentReceiptText(a) {
  if (!a) return '';
  const parts = _apptPayParts(a);
  const bal = _receiptCustomerBalance(a);
  const lines = [
    'LH Nail 收款确认单',
    `预约编号：${a.id}`,
    `顾客：${a.customer || ''}`,
    `项目：${apptTypeLabel(a)}`,
    `实收金额：${fmtMoney(parts.amount)}`,
    `支付方式：${a.payMethod || '未填写'}`,
    parts.deduct > 0 ? `会员扣卡：${fmtMoney(parts.deduct)}` : '',
    parts.extra > 0 ? `补差金额：${fmtMoney(parts.extra)}${a.extraPayMethod ? '（' + a.extraPayMethod + '）' : ''}` : '',
    bal != null && parts.deduct > 0 ? `扣卡后余额：${fmtMoney(bal)}` : '',
    `收款时间：${_formatPayTime(a)}`,
    a.payRemark ? `备注：${a.payRemark}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}
function openPaymentReceiptModal(id) {
  const a = appointmentById(id);
  if (!a) { toast('预约不存在', 'error'); return; }
  _currentReceiptApptId = id;
  const body = document.getElementById('paymentReceiptBody');
  if (body) body.innerHTML = _paymentReceiptHtml(a, false);
  document.getElementById('paymentReceiptModal')?.classList.add('show');
}
function closePaymentReceiptModal() {
  document.getElementById('paymentReceiptModal')?.classList.remove('show');
}
function copyPaymentReceipt() {
  const a = appointmentById(_currentReceiptApptId);
  if (!a) { toast('没有可复制的确认单', 'error'); return; }
  const text = _paymentReceiptText(a);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('收款确认单已复制', 'success')).catch(() => toast('复制失败，请手动截图保存', 'error'));
  } else {
    toast('当前浏览器不支持自动复制，可截图保存', 'error');
  }
}
function openApptDetail(id) {
  const a = appointmentById(id);
  if (!a) { toast('预约不存在', 'error'); return; }
  _currentDetailId = id;
  const titleEl = document.getElementById('adTitle');
  if (titleEl) titleEl.textContent = '📋 预约详情';
  const body = document.getElementById('apptDetailBody');
  if (!body) return;
  const editBtn   = document.getElementById('adEditBtn');
  const delBtn    = document.getElementById('adDeleteBtn');
  if (editBtn) editBtn.style.display = '';
  if (delBtn)  delBtn.style.display  = '';
  // 权限：技师只读 → 编辑/删除按钮隐藏
  if (State.currentUser?.role === 'tech') {
    if (editBtn) editBtn.style.display = 'none';
    if (delBtn)  delBtn.style.display  = 'none';
  }

  const tk = apptTypeKey(a);
  const typeCol = typeColor(tk);
  const meta = CAL_TYPE_META.find(m => m.key === tk) || CAL_TYPE_META[0];
  const dt = new Date(a.datetime);
  const w = ['周日','周一','周二','周三','周四','周五','周六'][dt.getDay()];
  const dateStr = `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日 ${w} · ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  const mem = memberLabel(a.member);
  const curStatus = normalizeApptStatus(a.status);
  const statusMap = { pending:['待确认','pending'], confirmed:['已确认','confirmed'], done:['已完成','done'], canceled:['已取消','canceled'] };
  const [statusText, statusCls] = statusMap[curStatus] || ['未知','pending'];

  // 项目名
  const bizText = a.biz === 'lash' ? '美睫项目' : '美甲项目';
  let itemList = '';
  if (a.biz === 'lash') {
    const lname  = _lookupPrice('lash',       a.lash)?.name       || '-';
    const rlname = _lookupPrice('removeLash', a.removeLash)?.name || '无';
    itemList = `
      <div class="ad-price-line"><span>👁️ 美睫款式</span><span>${lname}</span></div>
      <div class="ad-price-line"><span>♻️ 卸睫毛</span><span>${rlname}</span></div>
    `;
  } else {
    const sname = _lookupPrice('style',      a.style)?.name      || '-';
    const tname = _lookupPrice('tip',        a.tip)?.name        || '-';
    const rname = _lookupPrice('removeNail', a.removeNail)?.name || '无';
    itemList = `
      <div class="ad-price-line"><span>🎨 款式</span><span>${sname}</span></div>
      <div class="ad-price-line"><span>💅 甲片</span><span>${tname}</span></div>
      <div class="ad-price-line"><span>♻️ 卸甲</span><span>${rname}</span></div>
    `;
  }

  // 价格明细
  const orig = (a.originalTotal != null ? a.originalTotal : (a.stylePrice||0) + (a.tipPrice||0) + (a.removePrice||0));
  const discAmt = Math.max(0, (orig || 0) - (a.finalTotal || 0));

  // 图片
  let imgHtml = '';
  if (a.images && a.images.length) {
    imgHtml = `<div class="ad-images">` + a.images.map((ref, i) => {
      const src = resolveImageSrc(ref);
      return `
      <img class="ad-img" src="${src}" onclick="event.stopPropagation(); openLightbox('${src.replace(/'/g, "\\'")}')" alt="参考图${i+1}">
    `;
    }).join('') + `</div>`;
  } else {
    imgHtml = `<div class="ad-empty-img">暂无参考图片</div>`;
  }

  body.innerHTML = `
    <div class="appt-detail">
      <div class="ad-top" style="border-left:4px solid ${typeCol};">
        <div class="ad-top-title">
          <div class="ad-customer">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${typeCol};margin-right:8px;vertical-align:middle;"></span>
            ${escapeHtml(a.customer || '（未填姓名）')}
            ${mem.tag ? `<span class="ad-tag" style="margin-left:8px;background:${mem.bg};color:${mem.color};border:1px solid ${mem.bd};">${mem.tag}</span>` : ''}
          </div>
          <div class="ad-status ${statusCls}">${statusText}</div>
        </div>
        <div class="ad-time">
          📅 ${dateStr}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          🔖 ${bizText} · ${meta.icon} ${meta.label}
        </div>
        ${a.phone ? `<div class="ad-time" style="margin-top:4px;">📱 ${escapeHtml(a.phone)}</div>` : ''}
        <div class="ad-time" style="margin-top:4px;">👩‍🎨 ${escapeHtml(a.staffName || staffNameById(a.staffId || a.serviceStaffId) || '未指定')} · ⏱ ${formatApptDurationHours(a)}</div>
      </div>
      <div class="ad-body">
        <div class="ad-price-card">
          ${itemList}
          <div class="ad-price-line"><span>原价合计</span><span>${fmtMoney(orig || 0)}</span></div>
          ${discAmt > 0 ? `<div class="ad-price-line"><span>会员优惠</span><span style="color:var(--success);">- ${fmtMoney(discAmt)}</span></div>` : ''}
          <div class="ad-price-line total"><span>实付金额</span><span>${fmtMoney(a.finalTotal || 0)}</span></div>
          ${a.payMethod ? `<div class="ad-price-line" style="color:var(--muted);"><span>支付方式</span><span style="font-weight:500;">${a.payMethod}</span></div>` : ''}
          ${a.payRemark ? `<div class="ad-price-line" style="color:var(--muted);"><span>收款备注</span><span style="font-weight:500;">${escapeHtml(a.payRemark)}</span></div>` : ''}
        </div>
        ${curStatus === 'done' && a.payMethod ? _paymentReceiptHtml(a, true) : ''}
        ${a.refundHistory && a.refundHistory.length ? `<div class="pay-void-card">
          <strong>最近撤销记录</strong>
          <span>${new Date(a.refundHistory[0].voidedAt || Date.now()).toLocaleString('zh-CN')} · 已撤销 ${fmtMoney(a.refundHistory[0].amount || 0)}${a.refundHistory[0].deductAmount ? ` · 已退回扣卡 ${fmtMoney(a.refundHistory[0].deductAmount)}` : ''}</span>
        </div>` : ''}
        <div>
          <div class="ad-row" style="margin-bottom:8px;">
            <div class="ad-row-label">预约编号</div>
            <div class="ad-row-val" style="font-family:Menlo,monospace;font-size:12px;color:var(--muted);">${a.id}</div>
          </div>
          <div class="ad-row">
            <div class="ad-row-label">备注说明</div>
            <div class="ad-row-val">${a.remark ? escapeHtml(a.remark).replace(/\n/g, '<br>') : '<span style="color:var(--muted);">（无）</span>'}</div>
          </div>
          ${a.doneAt ? `<div class="ad-row" style="margin-top:8px;">
            <div class="ad-row-label">完成时间</div>
            <div class="ad-row-val">${new Date(a.doneAt).toLocaleString('zh-CN')}</div>
          </div>` : ''}
          ${a.updatedAt ? `<div class="ad-row" style="margin-top:8px;">
            <div class="ad-row-label">最近更新</div>
            <div class="ad-row-val">${new Date(a.updatedAt).toLocaleString('zh-CN')} · ${escapeHtml(a.updatedBy || '')}</div>
          </div>` : ''}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:8px;">📷 参考图片（${a.images ? a.images.length : 0}）</div>
          ${imgHtml}
        </div>
      </div>
    </div>
  `;
  renderApptFlowActions(a);
  document.getElementById('apptDetailModal').classList.add('show');
}
function closeApptDetail() {
  document.getElementById('apptDetailModal').classList.remove('show');
  _currentDetailId = null;
}
function renderApptFlowActions(a) {
  const wrap = document.getElementById('adFlowActions');
  if (!wrap) return;
  if (!a || State.currentUser?.role === 'tech') {
    wrap.innerHTML = '';
    return;
  }
  const btn = (label, next, cls = '') =>
    `<button class="btn-ghost appt-flow-btn ${cls}" onclick="changeApptStatus('${a.id}','${next}')">${label}</button>`;
  let html = '';
  const curStatus = normalizeApptStatus(a.status);
  if (curStatus === 'pending') {
    html = btn('✓ 确认预约', 'confirmed', 'primary') + btn('取消预约', 'canceled', 'danger');
  } else if (curStatus === 'confirmed') {
    html = `<button class="btn-ghost appt-flow-btn success" onclick="openCompletePayModal('${a.id}')">✓ 已完成/收款</button>` + btn('取消预约', 'canceled', 'danger');
  } else if (curStatus === 'done') {
    html = `<span class="appt-flow-done">已完成，收入和顾客档案已同步</span><button class="btn-ghost appt-flow-btn success" onclick="openPaymentReceiptModal('${a.id}')">🧾 查看收款单</button><button class="btn-ghost appt-flow-btn danger" onclick="undoApptPayment('${a.id}')">↩ 撤销收款/退款</button>`;
  } else if (curStatus === 'canceled') {
    html = btn('恢复为待确认', 'pending', 'primary');
  }
  wrap.innerHTML = html;
}
function changeApptStatus(id, nextStatus) {
  const a = appointmentById(id);
  if (!a) { toast('预约不存在', 'error'); return; }
  const old = normalizeApptStatus(a.status);
  if (old === nextStatus) return;
  if (nextStatus === 'canceled' && old === 'done') {
    toast('已完成预约不能直接取消，如需调整请编辑或删除记录', 'error');
    return;
  }
  if (nextStatus === 'canceled') {
    const name = a.customer || '该顾客';
    const info = a.datetime ? new Date(a.datetime).toLocaleString('zh-CN') : '';
    if (!confirm(`确定取消并删除 ${name} 的预约记录吗？\n${info}\n\n删除后该预约不会再显示在日历和预约清单中。`)) return;
    softDeleteRecord(a, '取消预约自动删除');
    save('appointments', State.appointments);
    addAuditLog('预约取消', `取消并软删除预约 ${id}${a?.customer ? '：' + a.customer : ''}`, id);
    refreshAllCustomerViews();
    try { renderTodayAppointments(); } catch(e) {}
    try { renderApptTable(); } catch(e) {}
    try { renderCalendar(); } catch(e) {}
    try { if (State.curSelectedDay) renderDayDetail(State.curSelectedDay); } catch(e) {}
    try { renderDashboardSummary(); } catch(e) {}
    try { renderOverviewStats(); } catch(e) {}
    try { closeApptDetail(); } catch(e) {}
    toast('预约已取消并从日历中删除', 'success');
    return;
  }
  if (nextStatus === 'done') {
    a.doneAt = new Date().toISOString();
    _syncCustomerAfterApptDone(a);
  }
  a.status = nextStatus;
  touchRecord(a);
  save('appointments', State.appointments);
  save('customers', State.customers);
  addAuditLog('预约状态', `预约 ${id}：${statusLabel(old)} → ${statusLabel(nextStatus)}`, id);
  refreshAllCustomerViews();
  try { renderDashboardSummary(); } catch(e) {}
  try { renderOverviewStats(); } catch(e) {}
  try { renderIncome(); } catch(e) {}
  try { if (State.curSelectedDay) renderDayDetail(State.curSelectedDay); } catch(e) {}
  openApptDetail(id);
  toast(`预约状态已更新为：${statusLabel(nextStatus)}`, 'success');
}
function _payMethodLabel(v) {
  return { wechat:'微信', alipay:'支付宝', cash:'现金', card:'银行卡', balance:'储值卡扣', mixed:'储值卡扣+补差' }[v] || v || '';
}
function _apptDeductItems(a) {
  if (!a) return [];
  const items = [];
  const itemPrices = a.itemPrices || a.priceOverrides || {};
  function push(name, price) {
    if (!name) return;
    items.push({ name, qty: 1, price: Number(price) || 0 });
  }
  if (a.biz === 'lash') {
    const lash = _lookupPrice('lash', a.lash);
    const remove = _lookupPrice('removeLash', a.removeLash);
    push(lash?.name || '美睫服务', itemPrices.lash ?? a.lashPrice ?? lash?.price ?? a.originalTotal ?? a.finalTotal ?? 0);
    if (remove) push(remove.name, itemPrices.removeLash ?? a.removeLashPrice ?? remove.price);
  } else {
    const style = _lookupPrice('style', a.style);
    const tip = _lookupPrice('tip', a.tip);
    const remove = _lookupPrice('removeNail', a.removeNail);
    push(style?.name || '美甲款式', itemPrices.style ?? a.stylePrice ?? (style?.custom ? (a.originalTotal || a.finalTotal || 0) : (style?.price || 0)));
    if (tip) push(tip.name, itemPrices.tip ?? a.tipPrice ?? tip.price);
    if (remove) push(remove.name, itemPrices.removeNail ?? a.removePrice ?? remove.price);
  }
  return items.length ? items : [{ name: apptTypeLabel(a), qty: 1, price: Number(a.finalTotal) || 0 }];
}
function _findSameDayUnlinkedDeductForAppt(a, c, targetAmount) {
  if (!a || !c) return null;
  const day = (a.datetime || a.date || '').slice(0, 10);
  if (!day) return null;
  const customerNames = new Set([_normStr(c.name || ''), _normStr(a.customer || '')].filter(Boolean));
  const amt = Math.round((Number(targetAmount) || 0) * 100) / 100;
  const list = (State.memberTxns || []).filter(t => {
    if (!t || t.type !== 'deduct') return false;
    if (typeof _isDeletedMemberTxn === 'function' && _isDeletedMemberTxn(t)) return false;
    if (t._auditOnly || t._hiddenFromDeductArchive) return false;
    if (t._reversed) return false;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return false;
    if (t.apptId || t._reverseOf) return false;
    if ((t.date || '').slice(0, 10) !== day) return false;
    if (Number(t.amount) <= 0) return false;
    if (amt > 0 && Math.round((Number(t.amount) || 0) * 100) / 100 !== amt) return false;
    if (t.cid && c.id && t.cid === c.id) return true;
    const tc = customerById(t.cid);
    return tc && customerNames.has(_normStr(tc.name || ''));
  });
  if (!list.length) return null;
  list.sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')) || String(x.id || '').localeCompare(String(y.id || '')));
  return list[0];
}
function openCompletePayModal(id) {
  const a = appointmentById(id);
  if (!a) { toast('预约不存在', 'error'); return; }
  if (normalizeApptStatus(a.status) === 'done') { toast('这单已经完成', 'success'); return; }
  window._completePayApptId = id;
  const c = _findCustomerForAppt(a);
  const linkedDeduct = a.deductId ? activeRows(State.memberTxns).find(t => t.id === a.deductId && t.type === 'deduct') : null;
  // 黄金会员动态折扣：收款时重新计算优惠（首次9折/后续95折）
  let amount = linkedDeduct ? Math.round((Number(linkedDeduct.amount) || 0) * 100) / 100 : (Number(a.finalTotal) || 0);
  if (!linkedDeduct && c && a.originalTotal) {
    const lv = normalizeMemberLevel(c.level || '');
    if (lv === 'gold') {
      // 黄金会员动态折扣：收款时重新计算（首次9折/后续95折）
      const discRate = _getGoldDiscountRate(c.id);
      amount = Math.round((Number(a.originalTotal) || 0) * discRate * 100) / 100;
    } else if (lv === 'platinum' || lv === 'diamond') {
      // 铂金9折 / 钻石85折：预约结算自动应用会员折扣
      const discRate = getMemberDiscount(lv).discount;
      amount = Math.round((Number(a.originalTotal) || 0) * discRate * 100) / 100;
    }
    a.finalTotal = amount;
  }
  const info = document.getElementById('cp_apptInfo');
  if (info) {
    const mem = memberLabel(c?.level || a.member || '');
    const bal = c && c.level && c.level !== 'gold' ? ` · 余额 ${fmtMoney(c.balance || 0)}` : '';
    const goldHint = c && normalizeMemberLevel(c.level) === 'gold' ? ` · ${Math.round(_getGoldDiscountRate(c.id) * 100)}折` : '';
    info.innerHTML = `<strong>${escapeHtml(a.customer || '未命名顾客')}</strong><span>${escapeHtml(apptTypeLabel(a))} · ${fmtMoney(amount)}${mem.tag ? ' · ' + mem.tag + mem.label : ''}${goldHint}${bal}</span>`;
  }
  document.getElementById('cp_receivable').value = fmtMoney(amount);
  document.getElementById('cp_amount').value = amount.toFixed(2);
  const bal = c && c.level && c.level !== 'gold' ? (Number(c.balance) || 0) : 0;
  document.getElementById('cp_payMethod').value = linkedDeduct ? 'balance' : (bal > 0 ? (bal >= amount ? 'balance' : 'mixed') : 'wechat');
  document.getElementById('cp_balanceAmount').value = linkedDeduct ? amount.toFixed(2) : (c ? Math.min(Number(c.balance) || 0, amount).toFixed(2) : '0.00');
  document.getElementById('cp_extraPayMethod').value = 'wechat';
  document.getElementById('cp_remark').value = linkedDeduct ? `已关联历史扣卡 ${linkedDeduct.id}` : '';
  onCompletePayMethodChange();
  // 会员办理区块：对所有预约结算显示（即使顾客档案暂缺也可现场办理并自动建档）
  const joinBox = document.getElementById('cpJoinRow');
  if (joinBox) {
    const canJoin = !!a; // 有预约即显示办理/充值/升级会员模块
    joinBox.style.display = canJoin ? '' : 'none';
    document.querySelectorAll('input[name="cpJoin"]').forEach(r => r.checked = r.value === '');
    const ja = document.getElementById('cpJoinAmountRow'); if (ja) ja.style.display = 'none';
    const jai = document.getElementById('cpJoinAmount'); if (jai) jai.value = '';
  }
  document.getElementById('completePayModal').classList.add('show');
}
function closeCompletePayModal() {
  const modal = document.getElementById('completePayModal');
  if (modal) modal.classList.remove('show');
  window._completePayApptId = '';
}
function onCompletePayMethodChange() {
  const id = window._completePayApptId;
  const a = appointmentById(id);
  const c = _findCustomerForAppt(a);
  const linkedDeduct = a?.deductId ? activeRows(State.memberTxns).find(t => t.id === a.deductId && t.type === 'deduct') : null;
  const method = document.getElementById('cp_payMethod')?.value || 'wechat';
  const amount = Math.max(0, Number(document.getElementById('cp_amount')?.value) || 0);
  const box = document.getElementById('cp_balanceBox');
  const extraWrap = document.getElementById('cp_extraPayWrap');
  const balanceText = document.getElementById('cp_balanceText');
  const balanceInput = document.getElementById('cp_balanceAmount');
  const extraText = document.getElementById('cp_extraAmount');
  const showBalance = method === 'balance' || method === 'mixed';
  if (box) box.style.display = showBalance ? '' : 'none';
  if (extraWrap) extraWrap.style.display = method === 'mixed' ? '' : 'none';
  const bal = c && c.level !== 'gold' ? (Number(c.balance) || 0) : 0;
  if (balanceText) balanceText.textContent = linkedDeduct ? `已关联历史扣卡：${fmtMoney(linkedDeduct.amount)}` : (c ? (c.level === 'gold' ? '年卡制，无储值余额' : fmtMoney(bal)) : '未绑定会员');
  if (showBalance && balanceInput) {
    let deduct = Number(balanceInput.value);
    if (linkedDeduct) deduct = Math.round((Number(linkedDeduct.amount) || amount) * 100) / 100;
    if (!Number.isFinite(deduct) || deduct <= 0) deduct = Math.min(bal, amount);
    deduct = linkedDeduct ? deduct : Math.max(0, Math.min(deduct, bal, amount));
    if (method === 'balance') deduct = amount;
    balanceInput.value = deduct.toFixed(2);
    const extra = Math.max(0, amount - deduct);
    if (extraText) extraText.textContent = fmtMoney(extra);
  } else if (extraText) {
    extraText.textContent = fmtMoney(0);
  }
}
function onCompletePayJoinChange() {
  const id = window._completePayApptId;
  const a = appointmentById(id);
  if (!a) return;
  const c = _findCustomerForAppt(a);
  const cur = (c && c.level) ? normalizeMemberLevel(c.level) : '';
  const join = document.querySelector('input[name="cpJoin"]:checked')?.value || '';
  const amtWrap = document.getElementById('cpJoinAmountRow');
  if (amtWrap) amtWrap.style.display = (join === 'platinum' || join === 'diamond') ? '' : 'none';
  const rank = { '': 0, 'gold': 1, 'platinum': 2, 'diamond': 3 };
  const original = Math.round((Number(a.originalTotal || a.finalTotal) || 0) * 100) / 100;
  let rate = 1;
  let joinLabel = '';
  if (join && rank[join] < rank[cur]) {
    // 不允许选比当前更低的等级
    toast(`已是${memberLabel(cur).label}，无需办理更低级别`, 'error');
    const none = document.querySelector('input[name="cpJoin"][value=""]');
    if (none) none.checked = true;
    if (amtWrap) amtWrap.style.display = 'none';
    if (cur === 'gold') rate = _getGoldDiscountRate(c.id);
    else if (cur === 'platinum' || cur === 'diamond') rate = getMemberDiscount(cur).discount;
  } else if (join === 'gold') {
    rate = 0.90;
    joinLabel = cur === 'gold' ? '🥇 黄金年卡 · 续费（9折）' : '🥇 黄金会员 · 首消9折';
  } else if (join === 'platinum') {
    rate = 0.90;
    joinLabel = cur === 'platinum' ? '🥈 铂金会员 · 补储值（9折）' : (cur === 'gold' ? '🥈 铂金会员 · 升级（9折）' : '🥈 铂金会员 · 9折');
  } else if (join === 'diamond') {
    rate = 0.85;
    joinLabel = cur === 'diamond' ? '🥉 钻石会员 · 补储值（85折）' : '🥉 钻石会员 · 85折';
  } else if (!join && cur) {
    // 已有会员选"不办理"：维持会员折扣
    if (cur === 'gold') rate = _getGoldDiscountRate(c.id);
    else if (cur === 'platinum' || cur === 'diamond') rate = getMemberDiscount(cur).discount;
  }
  const amount = Math.round(original * rate * 100) / 100;
  const recEl = document.getElementById('cp_receivable');
  const amtEl = document.getElementById('cp_amount');
  if (recEl) recEl.value = fmtMoney(amount);
  if (amtEl) amtEl.value = amount.toFixed(2);
  const info = document.getElementById('cp_apptInfo');
  if (info && c) {
    const mem = memberLabel(c?.level || a.member || '');
    info.innerHTML = `<strong>${escapeHtml(a.customer || '未命名顾客')}</strong><span>${escapeHtml(apptTypeLabel(a))} · ${fmtMoney(amount)}${joinLabel ? ' · ' + joinLabel : (mem.tag ? ' · ' + mem.tag + mem.label : '')}</span>`;
  }
  onCompletePayMethodChange();
}
function confirmCompletePayment() {
  const id = window._completePayApptId;
  const a = appointmentById(id);
  if (!a) { toast('预约不存在', 'error'); return; }
  let amount = Math.round((Number(document.getElementById('cp_amount')?.value) || 0) * 100) / 100;
  if (amount < 0) { toast('实收金额不能为负数', 'error'); return; }
  const method = document.getElementById('cp_payMethod')?.value || 'wechat';
  let c = _findCustomerForAppt(a);
  // ---- 预约结算同步办理/续费/补储值/升级会员（所有顾客可选，办理后享受对应折扣）----
  const join = document.querySelector('input[name="cpJoin"]:checked')?.value || '';
  if (join) {
    // 顾客档案缺失时，先用预约信息自动补建档案（再办理会员）
    if (!c && (a.customer || a.phone)) {
      try { _syncCustomerAfterApptDone(a); } catch(e) {}
      c = _findCustomerForAppt(a);
    }
    if (!c) { toast('未找到顾客档案，无法办理会员', 'error'); return; }
    const prevLevel = c.level || '', prevBalance = Number(c.balance) || 0, prevExpire = c.expire || '', prevGoldSince = c.goldSince || '';
    const rank = { '': 0, 'gold': 1, 'platinum': 2, 'diamond': 3 };
    if (rank[join] < rank[prevLevel]) { toast('已是更高等级会员，无需办理更低级别', 'error'); return; }
    let fee = 0, subtype = '';
    if (join === 'gold') {
      if (method === 'balance' || method === 'mixed') { toast('黄金年卡无储值余额，请选择普通支付方式（微信/支付宝/现金/银行卡）', 'error'); return; }
      fee = 68;
      if (prevLevel === 'gold') {
        // 续年卡：到期日或今天起再延一年
        let base = new Date();
        if (c.expire) { const ex = new Date(c.expire); if (!isNaN(ex.getTime()) && ex > base) base = ex; }
        base.setFullYear(base.getFullYear() + 1);
        c.expire = localDateStr(base);
        subtype = '黄金年卡续费（预约结算）';
      } else {
        c.level = 'gold'; c.balance = 0;
        if (!c.goldSince) c.goldSince = todayDateStr();
        const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
        c.expire = localDateStr(exp);
        subtype = '年卡开通（预约结算）';
      }
    } else {
      const joinAmt = Math.round((Number(document.getElementById('cpJoinAmount')?.value) || 0) * 100) / 100;
      const min = join === 'platinum' ? 1000 : 2000;
      if (prevLevel === join) {
        // 补储值：任意金额（≥1 元）
        if (!joinAmt || joinAmt < 1) { toast('请填写本次补储值金额（≥1 元）', 'error'); return; }
      } else {
        // 开通或升级：按起充标准
        if (!joinAmt || joinAmt < min) { toast(`${join === 'platinum' ? '铂金' : '钻石'}会员需储值 ${fmtMoney(min)} 起充`, 'error'); return; }
      }
      fee = joinAmt;
      c.balance = Math.round((prevBalance + joinAmt) * 100) / 100;
      if (prevLevel === join) {
        subtype = join === 'platinum' ? '铂金会员补储值（预约结算）' : '钻石会员补储值（预约结算）';
      } else {
        c.level = join;
        c.expire = '';
        subtype = prevLevel
          ? (join === 'platinum' ? '铂金会员升级（预约结算）' : '钻石会员升级（预约结算）')
          : (join === 'platinum' ? '铂金会员开通（预约结算）' : '钻石会员开通（预约结算）');
      }
    }
    const joinTxId = genId('T');
    State.memberTxns.unshift({
      id: joinTxId, cid: c.id, type: 'recharge', subtype,
      amount: fee, payMethod: _payMethodLabel(method),
      date: todayDateStr(),
      remark: `预约结算同步办理 · ${a.id}`,
      items: null, balanceAfter: c.balance,
      beforeState: { level: prevLevel, balance: prevBalance, expire: prevExpire },
      afterState: { level: c.level || '', balance: Number(c.balance) || 0, expire: c.expire || '' }
    });
    a.joinedMember = { level: join, fee, txId: joinTxId, prevLevel, prevBalance, prevExpire, prevGoldSince, at: new Date().toISOString() };
    save('customers', State.customers);
    save('memberTxns', State.memberTxns);
  }
  const preLinkedDeduct = a.deductId ? activeRows(State.memberTxns).find(t => t.id === a.deductId && t.type === 'deduct') : null;
  if (preLinkedDeduct) {
    amount = Math.round((Number(preLinkedDeduct.amount) || amount) * 100) / 100;
    const amountInput = document.getElementById('cp_amount');
    if (amountInput) amountInput.value = amount.toFixed(2);
  }
  let deductAmt = 0;
  let extraAmt = 0;
  let payLabel = _payMethodLabel(method);
  if (preLinkedDeduct && method !== 'balance' && method !== 'mixed') {
    toast('这笔预约已关联会员扣卡记录，请使用“储值卡扣”完成，避免重复收款', 'error', 4500);
    const sel = document.getElementById('cp_payMethod');
    if (sel) sel.value = 'balance';
    onCompletePayMethodChange();
    return;
  }
  if (method === 'balance' || method === 'mixed') {
    if (!c || !c.level || c.level === 'gold') { toast('该顾客没有可扣的储值余额，请选择其他支付方式', 'error'); return; }
    deductAmt = Math.round((Number(document.getElementById('cp_balanceAmount')?.value) || 0) * 100) / 100;
    if (method === 'balance') deductAmt = amount;
    if (deductAmt <= 0) { toast('请输入扣卡金额', 'error'); return; }
    let linkedExistingDeduct = preLinkedDeduct || null;
    if (linkedExistingDeduct) {
      deductAmt = Math.round((Number(linkedExistingDeduct.amount) || deductAmt) * 100) / 100;
      linkedExistingDeduct.apptId = a.id;
      if (!linkedExistingDeduct.remark || !linkedExistingDeduct.remark.includes(a.id)) {
        linkedExistingDeduct.remark = linkedExistingDeduct.remark ? (linkedExistingDeduct.remark + `；关联预约 ${a.id}`) : `关联预约 ${a.id}`;
      }
      try { touchRecord(linkedExistingDeduct); } catch(e) {}
      a._memberDeductAlreadyCounted = linkedExistingDeduct.subtype !== '预约完成扣卡';
    }
    if (!a.deductId) {
      const existing = _findSameDayUnlinkedDeductForAppt(a, c, deductAmt || amount);
      if (existing) {
        const existingAmt = Math.round((Number(existing.amount) || 0) * 100) / 100;
        const msg = `检测到该顾客当天已有一笔未关联扣卡记录：\n\n顾客：${c.name || a.customer || ''}\n日期：${(existing.date || '').slice(0,10)}\n扣卡金额：${fmtMoney(existingAmt)}\n项目：${(existing.items || []).map(i => i.name).filter(Boolean).join('、') || existing.subtype || '扣卡记录'}\n\n是否直接把这笔扣卡记录关联到当前预约？\n\n点“确定”：只关联，不会再次扣卡。\n点“取消”：停止本次收款，避免重复扣卡。`;
        if (!confirm(msg)) return;
        existing.apptId = a.id;
        existing.remark = existing.remark ? (existing.remark + `；关联预约 ${a.id}`) : `关联预约 ${a.id}`;
        try { touchRecord(existing); } catch(e) {}
        a.deductId = existing.id;
        a.linkedMemberTxnId = existing.id;
        a._memberDeductAlreadyCounted = existing.subtype !== '预约完成扣卡';
        deductAmt = existingAmt;
        linkedExistingDeduct = existing;
      }
    }
    if (!linkedExistingDeduct && (Number(c.balance) || 0) < deductAmt) { toast(`会员余额不足，当前 ${fmtMoney(c.balance || 0)}`, 'error'); return; }
    extraAmt = Math.max(0, Math.round((amount - deductAmt) * 100) / 100);
    if (!linkedExistingDeduct && method === 'balance' && extraAmt > 0) { toast('储值卡余额不足，请选择“扣卡+补差”', 'error'); return; }
    const extraPay = document.getElementById('cp_extraPayMethod')?.value || 'wechat';
    payLabel = linkedExistingDeduct
      ? (extraAmt > 0 ? `已关联历史扣卡 ${fmtMoney(deductAmt)} + ${_payMethodLabel(extraPay)}补差 ${fmtMoney(extraAmt)}` : `已关联历史扣卡 ${fmtMoney(deductAmt)}`)
      : (extraAmt > 0 ? `储值卡扣 ${fmtMoney(deductAmt)} + ${_payMethodLabel(extraPay)}补差 ${fmtMoney(extraAmt)}` : '储值卡扣');
    if (!a.deductId) {
      const newBalance = Math.round(((Number(c.balance) || 0) - deductAmt) * 100) / 100;
      c.balance = newBalance;
      const txId = genId('T');
      State.memberTxns.unshift({
        id: txId,
        cid: c.id,
        type: 'deduct',
        subtype: '预约完成扣卡',
        amount: deductAmt,
        payMethod: 'balance',
        date: (a.datetime || todayDateStr()).slice(0, 10),
        remark: `关联预约 ${a.id}`,
        items: _apptDeductItems(a),
        balanceAfter: newBalance,
        apptId: a.id
      });
      a.deductId = txId;
    }
  }
  a.finalTotal = amount;
  a.payMethod = payLabel;
  a.payAmount = amount;
  a.deductAmount = deductAmt;
  a.extraAmount = extraAmt;
  a.extraPayMethod = method === 'mixed' ? _payMethodLabel(document.getElementById('cp_extraPayMethod')?.value || 'wechat') : '';
  a.completedPayAt = new Date().toISOString();
  a.payRemark = document.getElementById('cp_remark')?.value.trim() || '';
  changeApptStatus(id, 'done');
  if (c) { try { _recalcMemberBalance(c.id); } catch(e) {} }
  save('memberTxns', State.memberTxns);
  addAuditLog('完成收款', `${a.customer || '顾客'} · ${apptTypeLabel(a)} · ${fmtMoney(amount)} · ${payLabel}`, a.id, { amount, payMethod: payLabel, deductAmt, extraAmt });
  closeCompletePayModal();
  openPaymentReceiptModal(id);
  toast('已完成收款并入账', 'success');
}
/* ============================================================
   余额统一重算：余额 = 该会员所有「有效交易流水」之和（实时计算）
   - recharge（充值/储值/年卡/办理）→ +金额
   - deduct（扣卡消费）→ -金额
   - 排除：冲正/撤销/退会/审计类记录（它们只用于审计，不代表真实入金/出金）
   - 黄金年卡会员无储值余额，恒为 0
   任何充值/扣卡/删除/冲正/撤销/编辑后调用，确保余额永远与流水一致。
   ============================================================ */
function _recalcMemberBalance(cid) {
  const c = customerById(cid);
  if (!c) return;
  if (c.level === 'gold') { c.balance = 0; return; }
  let bal = 0;
  activeRows(State.memberTxns).forEach(t => {
    if (!t || t.cid !== cid) return;
    if (t._auditOnly || t._hiddenFromDeductArchive) return;
    if (t._reversed || t._reverseOf) return;
    const sub = t.subtype || '';
    if (sub.includes('冲正') || sub.includes('撤销') || sub.includes('退会')) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'recharge') bal += amt;
    else if (t.type === 'deduct') bal -= amt;
  });
  c.balance = Math.round(bal * 100) / 100;
}

function undoApptPayment(id) {
  const a = appointmentById(id);
  if (!a) { toast('预约不存在', 'error'); return; }
  if (normalizeApptStatus(a.status) !== 'done') { toast('只有已完成收款的预约才能撤销', 'error'); return; }
  if (a._paymentVoidedAt && !a.payMethod) { toast('这笔收款已经撤销过', 'error'); return; }
  const parts = _apptPayParts(a);
  const c = _findCustomerForAppt(a);
  const historyLinkedDeduct = _apptLinkedDeductAlreadyCounted(a);
  const msg = `确认撤销这笔收款？\n\n顾客：${a.customer || c?.name || '未命名顾客'}\n项目：${apptTypeLabel(a)}\n实收金额：${fmtMoney(parts.amount)}\n支付方式：${a.payMethod || '未填写'}\n${parts.deduct > 0 ? `会员扣卡：${fmtMoney(parts.deduct)}${historyLinkedDeduct ? '（历史扣卡记录将保留，不退回余额）' : '（将退回余额）'}\n` : ''}${parts.extra > 0 ? `补差金额：${fmtMoney(parts.extra)}（请确认已线下退款/处理）\n` : ''}\n执行后将：\n• 预约退回「已确认」，可重新收款\n• 收入统计自动减少\n${historyLinkedDeduct ? '• 保留原会员扣卡记录和余额，不重复冲正\n' : '• 顾客到店次数和累计消费回退\n• 会员扣卡余额退回，并保留撤销记录\n'}\n确认继续？`;
  if (!confirm(msg)) return;

  const now = new Date();
  const nowDate = todayDateStr();
  const nowTime = now.toTimeString().slice(0, 5);
  const oldPay = {
    amount: parts.amount,
    payMethod: a.payMethod || '',
    deductAmount: parts.deduct,
    extraAmount: parts.extra,
    extraPayMethod: a.extraPayMethod || '',
    payRemark: a.payRemark || '',
    completedPayAt: a.completedPayAt || a.doneAt || '',
    voidedAt: now.toISOString()
  };

  if (parts.deduct > 0 && a.deductId && !historyLinkedDeduct) {
    const tx = State.memberTxns.find(t => t.id === a.deductId);
    if (tx && !tx._deleted) {
      softDeleteRecord(tx, `预约 ${a.id} 撤销收款`);
      tx._voidedByAppt = a.id;
    }
    if (c && c.level && c.level !== 'gold') {
      c.balance = Math.round(((Number(c.balance) || 0) + parts.deduct) * 100) / 100;
    }
    State.memberTxns.unshift({
      id: genId('T'),
      cid: c?.id || tx?.cid || a.customerId || '',
      type: 'deduct',
      subtype: '【冲正】预约撤销收款退回扣卡',
      amount: -parts.deduct,
      payMethod: '冲正',
      date: nowDate,
      time: nowTime,
      remark: `预约 ${a.id} 撤销收款，退回扣卡 ${fmtMoney(parts.deduct)}`,
      items: [{ name: `【冲正】${apptTypeLabel(a)}`, qty: 1, price: -parts.deduct }],
      balanceAfter: c && c.balance != null ? c.balance : 0,
      apptId: a.id,
      _reverseOf: a.deductId,
      _auditOnly: true
    });
  }

  // 撤销预约结算时同步办理的会员：回滚会员状态 + 冲正充值记录（收入自动随之减少）
  if (a.joinedMember) {
    const jm = a.joinedMember;
    const jc = _findCustomerForAppt(a);
    const jtx = State.memberTxns.find(t => t.id === jm.txId);
    if (jtx && !jtx._deleted) {
      softDeleteRecord(jtx, `预约 ${a.id} 撤销收款`);
      jtx._voidedByAppt = a.id;
    }
    if (jc) {
      jc.level = jm.prevLevel || '';
      jc.expire = jm.prevExpire || '';
      if (jc.level !== 'gold') jc.goldSince = jm.prevGoldSince || '';
    }
    delete a.joinedMember;
  }

  _rollbackCustomerAfterApptUndo(a);
  a.refundHistory = Array.isArray(a.refundHistory) ? a.refundHistory : [];
  a.refundHistory.unshift(oldPay);
  a.status = 'confirmed';
  a.deductId = historyLinkedDeduct ? a.deductId : '';
  a.payMethod = '';
  a.payAmount = 0;
  a.deductAmount = 0;
  a.extraAmount = 0;
  a.extraPayMethod = '';
  a.completedPayAt = '';
  a.payRemark = '';
  a.doneAt = '';
  a._paymentVoidedAt = now.toISOString();

  // 统一按有效流水重算余额，确保撤销后余额与扣卡/办理流水严格一致
  if (c) { try { _recalcMemberBalance(c.id); } catch(e) {} }
  else if (a.customerId) { try { _recalcMemberBalance(a.customerId); } catch(e) {} }

  try {
    window.__LH_SILENT_SAVE = true;
    save('appointments', State.appointments);
    save('customers', State.customers);
    save('memberTxns', State.memberTxns);
    addAuditLog('撤销收款', `${a.customer || '顾客'} · ${apptTypeLabel(a)} · 退回 ${fmtMoney(parts.amount)}${parts.deduct ? ' · 扣卡退回 ' + fmtMoney(parts.deduct) : ''}`, a.id, oldPay);
  } finally {
    window.__LH_SILENT_SAVE = false;
  }
  try { closeApptDetail(); } catch(_) {}
  setTimeout(function() {
    try { renderDashboardSummary(); } catch(e) {}
    try { renderOverviewStats(); } catch(e) {}
    try { renderIncome(); } catch(e) {}
    try { renderApptTable(); } catch(e) {}
    try { renderCalendar(); } catch(e) {}
    try { if (State.curSelectedDay) renderDayDetail(State.curSelectedDay); } catch(e) {}
  }, 80);
  toast('已撤销收款，预约已退回已确认', 'success');
}
function adEditAppt() {
  const id = _currentDetailId;
  if (!id) return;
  closeApptDetail();
  setTimeout(() => openApptModal(id), 150);
}
function quickMarkDone(id, markAsDone) {
  changeApptStatus(id, markAsDone ? 'done' : 'confirmed');
}
function adMarkDone() {
  const id = _currentDetailId;
  if (!id) return;
  changeApptStatus(id, 'done');
}
function adDeleteAppt() {
  const id = _currentDetailId;
  if (!id) return;
  const a = appointmentById(id);
  if (!a) return;
  const name = a.customer || '该预约';
  const info = `${a.datetime ? new Date(a.datetime).toLocaleString('zh-CN') : ''}`;
  if (!confirm(`⚠️ 确认删除 ${name} 的预约？\n${info}\n\n删除后不可恢复，且该预约将不再计入收入统计。`)) return;
  softDeleteRecord(a, '详情页删除预约');
  save('appointments', State.appointments);
  addAuditLog('预约删除', `软删除预约：${name} · ${info}`, id);
  toast('预约已删除', 'success');
  closeApptDetail();
  setTimeout(function() {
    try { renderCalendar(); } catch(e){}
    try { renderApptTable(); } catch(e){}
    try { renderDashboardSummary(); } catch(e){}
    try { renderOverviewStats(); } catch(e){}
  }, 0);
}

// ============ ESC 关闭弹窗 ============
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeApptModal();
    closePriceModal();
    closeLightbox();
    closeCustomerModal();
    closeRechargeModal();
    closeDeductModal();
    closeCompletePayModal();
    closePaymentReceiptModal();
    closeColorModal();
    closeApptDetail();
  }
});

/* ============================================================
   1. 顾客 / 会员数据结构 & 初始化
   ============================================================ */
// 扩展 State
State.customers = [];          // 顾客档案（包含会员信息）
State.memberTxns = [];         // 会员交易记录（充值/扣卡）
State.editingCustomerId = null;
State.currentDeductItems = []; // 扣卡弹窗中的项目明细

// 从本地储存加载
State.customers = normalizeCoreCollection('customers', load('customers', null));
State.memberTxns = normalizeCoreCollection('memberTxns', load('memberTxns', []));

// 正式使用默认空白：不再自动生成虚拟顾客/会员交易，并清理旧版本遗留的示例种子数据
if (!Array.isArray(State.customers)) State.customers = [];
if (!Array.isArray(State.memberTxns)) State.memberTxns = [];
function autoExpireGoldMembers() {
  const today = todayDateStr();
  let changedCustomers = 0;
  let changedTxns = 0;
  activeRows(State.customers).forEach(c => {
    if (normalizeMemberLevel(c.level) !== 'gold') return;
    const exp = String(c.expire || '').slice(0, 10);
    if (!exp || exp >= today) return;
    const oldExpire = exp;
    c.level = '';
    c.balance = 0;
    c.expire = '';
    c.goldSince = '';
    c.memberExpiredAt = today;
    c.memberExpiredFrom = oldExpire;
    try { touchRecord(c); } catch(e) {}
    State.memberTxns.unshift({
      id: genId('T'),
      cid: c.id,
      type: 'recharge',
      subtype: '【到期】黄金会员 → 普通顾客',
      amount: 0,
      payMethod: 'expire',
      date: today,
      remark: `黄金会员于 ${oldExpire} 到期，已自动降级为普通顾客`,
      items: [{ name: `黄金会员到期自动降级（到期日：${oldExpire}）`, qty: 1, price: 0 }],
      _auditOnly: true,
      _hiddenFromDeductArchive: true
    });
    changedCustomers += 1;
    changedTxns += 1;
    addAuditLog('会员到期', `${c.name || '会员'} 黄金会员已于 ${oldExpire} 到期，自动降级为普通顾客，不再享受会员折扣`, c.id, { oldLevel: 'gold', expiredAt: oldExpire });
  });
  if (changedCustomers) save('customers', State.customers);
  if (changedTxns) save('memberTxns', State.memberTxns);
  return changedCustomers;
}
function purgeLegacyDemoData() {
  const demoCustomerIds = new Set(['C001','C002','C003','C004','C005','C006','C007','C008','C009','C010']);
  const demoTxnIds = new Set(['T001','T002','T003','T004','T005','T006','T007','T008','T009']);
  const demoNames = new Set(['王女士','张小姐','陈小姐','林小姐','李女士','刘小姐','周女士','吴小姐','郑女士','孙小姐']);
  const demoPhones = new Set(['138****1234','139****5678','136****9012','135****3456','137****7890','131****2234','132****5567','133****8890','130****1122','158****3344']);
  const isDemoPerson = (name, phone) => demoNames.has(name || '') && demoPhones.has(phone || '');
  let changedCustomers = false, changedTxns = false, changedAppts = false;
  State.customers = State.customers.filter(c => {
    const isDemo = c && (demoCustomerIds.has(c.id) || isDemoPerson(c.name, c.phone));
    if (isDemo) changedCustomers = true;
    return !isDemo;
  });
  State.memberTxns = State.memberTxns.filter(t => {
    const cid = t && (t.customerId || t.cid || '');
    const isDemo = t && (demoTxnIds.has(t.id) || demoCustomerIds.has(cid));
    if (isDemo) changedTxns = true;
    return !isDemo;
  });
  State.appointments = (State.appointments || []).filter(a => {
    const isDemo = a && (demoCustomerIds.has(a.customerId) || isDemoPerson(a.customer, a.phone));
    if (isDemo) changedAppts = true;
    return !isDemo;
  });
  if (changedCustomers) save('customers', State.customers);
  if (changedTxns) save('memberTxns', State.memberTxns);
  if (changedAppts) save('appointments', State.appointments);
}
purgeLegacyDemoData();

// 更新预约的 memberBalance（从 customers 同步）
function syncMemberToAppointments() {
  let changed = false;
  activeRows(State.appointments).forEach(a => {
    const c = customerById(a.customerId) ||
      activeRows(State.customers).find(x =>
        (a.phone && x.phone === a.phone) ||
        (x.name === a.customer)
      );
    if (c) {
      if (!a.customerId) { a.customerId = c.id; changed = true; }
      if (!a.phone && c.phone) { a.phone = c.phone; changed = true; }
      a.member = c.level || '';
      a.memberBalance = c.balance || 0;
    }
  });
  if (changed) save('appointments', State.appointments);
}
syncMemberToAppointments();
normalizeAppointmentStatuses();

/* ============================================================
   2. 顾客 / 会员 通用工具
   ============================================================ */
function _normStr(s) { return String(s || '').trim().replace(/\s+/g, ''); }
function _normPhone(s) { return String(s || '').replace(/[\s\-+]/g, ''); }
function _matchCustomer(c, name, phone) {
  if (!c) return false;
  const cn = _normStr(c.name);
  const cp = _normPhone(c.phone);
  const n = _normStr(name);
  const p = _normPhone(phone);
  if (n && cn && cn === n) return true;
  if (p && cp && cp === p) return true;
  return false;
}
function customerById(id) { return activeRows(State.customers).find(c => c.id === id); }
function customerByName(name) {
  const n = _normStr(name);
  if (!n) return undefined;
  return activeRows(State.customers).find(c => _normStr(c.name) === n);
}
function normalizeMemberLevel(level) {
  const s = String(level || '').trim();
  if (!s) return '';
  if (['gold','platinum','diamond'].includes(s)) return s;
  if (s.includes('黄金') || s.includes('金卡') || s.includes('gold')) return 'gold';
  if (s.includes('铂金') || s.includes('白金') || s.includes('platinum')) return 'platinum';
  if (s.includes('钻石') || s.includes('diamond')) return 'diamond';
  return s;
}
function getMemberDiscount(level) {
  const key = normalizeMemberLevel(level);
  const cfg = State.memberDiscounts?.[key] || State.memberDiscounts?.[''] || { name:'非会员', discount:1 };
  return {
    key,
    name: cfg.name || memberLabel(key).label || '会员',
    discount: Number(cfg.discount) || 1
  };
}
// 黄金会员动态折扣：首次消费9折，后续消费95折
// goldSince: 会员成为黄金的起始日期；统计此日期后已完成预约次数
function _getGoldDiscountRate(cid) {
  if (!cid) return 0.95;
  const c = customerById(cid);
  if (!c) return 0.95;
  const goldSince = c.goldSince || '';
  // 统计该顾客在黄金会员期间已完成的预约次数（排除当前正在收款的预约）
  const doneCount = activeRows(State.appointments).filter(a => {
    if (a.status !== 'done') return false;
    const apptCid = a.customerId || (_findCustomerForAppt(a)?.id || '');
    if (apptCid !== cid) return false;
    if (goldSince) {
      const apptDate = (a.datetime || '').slice(0, 10);
      if (apptDate < goldSince) return false;
    }
    return true;
  }).length;
  // 首次消费9折，后续95折
  return doneCount === 0 ? 0.90 : 0.95;
}
// 获取会员折扣率（含黄金会员动态折扣）
function _getEffectiveDiscountRate(level, cid) {
  const lv = normalizeMemberLevel(level);
  if (lv === 'gold' && cid) {
    return _getGoldDiscountRate(cid);
  }
  return getMemberDiscount(lv).discount;
}
function getCurrentDeductCustomer() {
  const sel = document.getElementById('dc_member');
  const cid = (sel?.value || window._currentDeductCustomerId || '').trim();
  return cid ? customerById(cid) : null;
}
function todayDateStr() { return localDateStr(new Date()); }
function genId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random()*99);
}

/* ============================================================
   3. 顾客管理页 渲染
   ============================================================ */
function renderCustomerStats() {
  const total = activeRows(State.customers).length;
  const now = new Date();
  const ym = now.toISOString().slice(0,7); // YYYY-MM
  const thisYear = now.getFullYear();

  // 本月新增（首次到店月份=本月）
  const monthNew = activeRows(State.customers).filter(c => (c.firstVisit||'').startsWith(ym)).length;
  // 本月回头客：本月有到店（lastVisit本月）且 visits>=2
  const monthRet = activeRows(State.customers).filter(c => {
    const last = c.lastVisit || '';
    return last.startsWith(ym) && (c.visits||0) >= 2;
  }).length;
  // 年度回头客：今年到店过且 visits>=2
  const yearRet = activeRows(State.customers).filter(c => {
    const last = c.lastVisit || '';
    return last.startsWith(String(thisYear)) && (c.visits||0) >= 2;
  }).length;

  document.getElementById('csTotal').textContent = total + ' 人';
  document.getElementById('csMonthNew').textContent = monthNew + ' 人';
  document.getElementById('csMonthRet').textContent = monthRet + ' 人';
  document.getElementById('csYearRet').textContent = yearRet + ' 人';
}

/* ============================================================
   3.1 顾客统计详情（本月新增 / 本月回头 / 年度回头 下钻）
   ============================================================ */
function _customerRangeStatsByPrefix(c, prefix) {
  // 统计顾客在指定年月前缀（YYYY-MM 或 YYYY）内的到店次数与消费金额
  let visits = 0, paid = 0;
  activeRows(State.memberTxns).forEach(t => {
    if (t._auditOnly) return;
    if (t._reversed) return;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return;
    if (t.cid !== c.id || t.type !== 'deduct') return;
    if (!String(t.date || '').startsWith(prefix)) return;
    visits++;
    paid += t.amount || 0;
  });
  // 无扣卡记录但最近到店落在范围内：按预约完成兜底 1 次（与到店排行口径一致）
  if ((c.lastVisit || '').startsWith(prefix) && visits === 0) {
    visits = 1;
    paid = c.totalPaid ? Math.min(c.totalPaid, 120) : 0;
  }
  return { visits, paid };
}

function renderCustomerStatDetail(type) {
  const now = new Date();
  const ym = now.toISOString().slice(0, 7); // 本月 YYYY-MM
  const yearStr = String(now.getFullYear());
  const cfg = {
    monthNew: {
      title: '🆕 本月新增顾客详情', prefix: ym,
      rangeLabel: '本月到店', spendLabel: '本月消费',
      sumLabel: '本月新增',
      filter: c => (c.firstVisit || '').startsWith(ym),
      subNote: '首次到店月份=' + ym
    },
    monthRet: {
      title: '🔁 本月回头客详情', prefix: ym,
      rangeLabel: '本月到店', spendLabel: '本月消费',
      sumLabel: '本月回头',
      filter: c => (c.lastVisit || '').startsWith(ym) && (c.visits || 0) >= 2,
      subNote: '本月到店且累计到店≥2 次'
    },
    yearRet: {
      title: '🏆 年度回头客总数详情', prefix: yearStr,
      rangeLabel: '今年到店', spendLabel: '今年消费',
      sumLabel: '年度回头',
      filter: c => (c.lastVisit || '').startsWith(yearStr) && (c.visits || 0) >= 2,
      subNote: '今年到店且累计到店≥2 次'
    }
  }[type];
  if (!cfg) return;

  const list = activeRows(State.customers)
    .filter(cfg.filter)
    .map(c => {
      const st = _customerRangeStatsByPrefix(c, cfg.prefix);
      return Object.assign({}, c, { _v: st.visits, _p: st.paid });
    });
  // 排序：范围消费高优先 → 范围到店次数 → 最近到店
  list.sort((a, b) => (b._p - a._p) || (b._v - a._v) || String(b.lastVisit || '').localeCompare(String(a.lastVisit || '')));

  const total = list.length;
  const totalPaid = list.reduce((s, c) => s + c._p, 0);
  const totalVisits = list.reduce((s, c) => s + c._v, 0);
  const avgVisits = total ? totalVisits / total : 0;
  const avgPaid = total ? totalPaid / total : 0;
  const memCount = list.filter(c => normalizeMemberLevel(c.level)).length;

  const titleEl = document.getElementById('custStatTitle');
  if (titleEl) titleEl.textContent = cfg.title;

  const sumEl = document.getElementById('custStatSummary');
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="csc-item">
        <div class="csc-label">${cfg.sumLabel}人数</div>
        <div class="csc-num">${total} <em>人</em></div>
        <div class="csc-sub">${cfg.subNote}</div>
      </div>
      <div class="csc-item">
        <div class="csc-label">${cfg.spendLabel}总额</div>
        <div class="csc-num">${fmtMoney(totalPaid)}</div>
        <div class="csc-sub">人均 ${fmtMoney(avgPaid)}</div>
      </div>
      <div class="csc-item">
        <div class="csc-label">${cfg.rangeLabel}总次数</div>
        <div class="csc-num">${totalVisits} <em>次</em></div>
        <div class="csc-sub">人均 ${avgVisits.toFixed(1)} 次</div>
      </div>
      <div class="csc-item">
        <div class="csc-label">会员顾客</div>
        <div class="csc-num">${memCount} <em>人</em></div>
        <div class="csc-sub">占比 ${total ? Math.round(memCount / total * 100) : 0}%</div>
      </div>`;
  }

  const colR = document.getElementById('custStatColRange');
  const colS = document.getElementById('custStatColSpend');
  if (colR) colR.textContent = cfg.rangeLabel + '次数';
  if (colS) colS.textContent = cfg.spendLabel;

  const body = document.getElementById('custStatBody');
  if (!body) return;
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px;">暂无符合条件的数据</td></tr>`;
    return;
  }
  body.innerHTML = list.map((c, i) => {
    const mem = memberLabel(c.level);
    const badgeCls = i === 0 ? 'rank-1-badge' : i === 1 ? 'rank-2-badge' : i === 2 ? 'rank-3-badge' : 'rank-n-badge';
    return `<tr>
      <td><span class="${badgeCls}">${i + 1}</span></td>
      <td style="font-weight:600;">${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.phone || '-')}</td>
      <td>${mem.tag ? `<span class="${mem.cls}">${mem.tag}</span>` : '<span style="color:var(--muted)">非会员</span>'}</td>
      <td style="font-weight:700;color:var(--accent);">${c._v} 次</td>
      <td>${c.visits || 0} 次</td>
      <td style="color:var(--ink);font-weight:600;">${fmtMoney(c._p)}</td>
      <td>${escapeHtml(c.lastVisit || '-')}</td>
      <td><button class="btn-ghost xsmall" onclick="openCustomerTxns('${c.id}')" title="查看该顾客在本店的所有消费记录与总金额">💳 消费记录</button></td>
    </tr>`;
  }).join('');
}

function openCustomerStatDetail(type) {
  renderCustomerStatDetail(type);
  document.getElementById('custStatModal')?.classList.add('show');
}
function closeCustStatModal() {
  document.getElementById('custStatModal')?.classList.remove('show');
}

/* ============================================================
   3.2 顾客消费记录弹窗（所有消费明细 + 总金额）
   ============================================================ */
function renderCustomerTxns(cid) {
  const c = customerById(cid);
  const titleEl = document.getElementById('ctTitle');
  if (!c) {
    if (titleEl) titleEl.textContent = '💳 顾客消费记录';
    toast('顾客不存在', 'error');
    return;
  }
  const cn = _normStr(c.name || '');
  // ---- 收集三类记录 ----
  const rows = [];
  // 1) 已完成预约（消费）
  activeRows(State.appointments).forEach(a => {
    if (normalizeApptStatus(a.status) !== 'done') return;
    const matched = a.customerId === c.id || (cn && _normStr(a.customer || '') === cn);
    if (!matched) return;
    const day = String(a.datetime || a.date || '').slice(0, 10);
    rows.push({
      date: day || '-', sort: day || '0',
      type: '预约消费', label: apptTypeLabel(a),
      detail: (a.remark || '').trim() || '',
      amount: Number(a.finalTotal) || 0,
      pay: a.payMethod || '-',
      isConsume: true
    });
  });
  // 2) 手动收入（消费）
  activeRows(State.manualIncomes).forEach(m => {
    const matched = m.customerId === c.id || (cn && _normStr(m.customerName || '') === cn);
    if (!matched) return;
    const day = String(m.date || '').slice(0, 10);
    rows.push({
      date: day || '-', sort: day || '0',
      type: '手动收入', label: '手动记收入',
      detail: (m.remark || '').trim() || '',
      amount: Number(m.amount) || 0,
      pay: m.payMethod || '-',
      isConsume: true
    });
  });
  // 3) 储值充值（非消费，单独标注）
  activeRows(State.memberTxns).forEach(t => {
    if (t.cid !== c.id || t.type !== 'recharge') return;
    if (t._reversed) return; // 已冲正的充值不再计入累计充值
    if (Number(t.amount) <= 0) return;
    const day = String(t.date || '').slice(0, 10);
    rows.push({
      date: day || '-', sort: day || '0',
      type: '储值充值', label: (t.items || []).map(i => i.name).filter(Boolean).join('、') || (t.subtype || '充值'),
      detail: (t.remark || '').trim() || '',
      amount: Number(t.amount) || 0,
      pay: t.payMethod ? (t.payMethod === 'manual' ? '手动' : t.payMethod) : '-',
      isConsume: false
    });
  });

  rows.sort((a, b) => String(b.sort).localeCompare(String(a.sort)) || String(b.date).localeCompare(String(a.date)));

  const consumeRows = rows.filter(r => r.isConsume);
  const totalConsume = consumeRows.reduce((s, r) => s + r.amount, 0);
  const totalRecharge = rows.filter(r => !r.isConsume).reduce((s, r) => s + r.amount, 0);

  // 头部信息
  const mem = memberLabel(c.level);
  const infoEl = document.getElementById('ctCustInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="ct-cust-name">${escapeHtml(c.name || '未命名')} ${mem.tag ? `<span class="${mem.cls}">${mem.tag}</span>` : ''}</div>
      <div class="ct-cust-meta">电话 ${escapeHtml(c.phone || '-')} · 首次到店 ${escapeHtml(c.firstVisit || '-')} · 累计到店 ${c.visits || 0} 次 · 最近到店 ${escapeHtml(c.lastVisit || '-')}</div>`;
  }
  if (titleEl) titleEl.textContent = `💳 ${c.name || '顾客'} · 消费记录`;

  // 汇总卡
  const sumEl = document.getElementById('ctSummary');
  if (sumEl) {
    const apptCount = rows.filter(r => r.type === '预约消费').length;
    const manualCount = rows.filter(r => r.type === '手动收入').length;
    sumEl.innerHTML = `
      <div class="csc-item">
        <div class="csc-label">累计消费总额</div>
        <div class="csc-num">${fmtMoney(totalConsume)}</div>
        <div class="csc-sub">完成预约 + 手动收入</div>
      </div>
      <div class="csc-item">
        <div class="csc-label">消费笔数</div>
        <div class="csc-num">${consumeRows.length} <em>笔</em></div>
        <div class="csc-sub">预约 ${apptCount} · 手动 ${manualCount}</div>
      </div>
      <div class="csc-item">
        <div class="csc-label">累计充值</div>
        <div class="csc-num">${fmtMoney(totalRecharge)}</div>
        <div class="csc-sub">储值卡入金</div>
      </div>
      <div class="csc-item">
        <div class="csc-label">当前储值余额</div>
        <div class="csc-num">${c.level && c.level !== 'gold' ? fmtMoney(c.balance || 0) : '—'}</div>
        <div class="csc-sub">${c.level === 'gold' ? '黄金会员 · 年卡制' : '可用余额'}</div>
      </div>`;
  }

  // 明细表格
  const body = document.getElementById('ctBody');
  if (!body) return;
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px;">该顾客暂无消费记录</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => {
    const typeCls = r.type === '储值充值' ? 'ct-t-recharge' : (r.type === '手动收入' ? 'ct-t-manual' : 'ct-t-appt');
    const amtHtml = r.type === '储值充值'
      ? `<span style="color:var(--success);font-weight:600;">+${fmtMoney(r.amount)}</span>`
      : `<span style="color:var(--ink);font-weight:600;">${fmtMoney(r.amount)}</span>`;
    return `<tr>
      <td>${escapeHtml(r.date)}</td>
      <td><span class="${typeCls}">${r.type}</span></td>
      <td>${escapeHtml(r.label)}${r.detail ? `<div class="ct-detail">${escapeHtml(r.detail)}</div>` : ''}</td>
      <td>${amtHtml}</td>
      <td>${escapeHtml(r.pay)}</td>
    </tr>`;
  }).join('');
}

function openCustomerTxns(cid) {
  renderCustomerTxns(cid);
  document.getElementById('customerTxnsModal')?.classList.add('show');
}
function closeCustomerTxnsModal() {
  document.getElementById('customerTxnsModal')?.classList.remove('show');
}

// 初始化年度下拉
function initYearSelectors() {
  const years = new Set();
  const now = new Date();
  years.add(now.getFullYear());
  activeRows(State.customers).forEach(c => {
    if (c.firstVisit) years.add(new Date(c.firstVisit).getFullYear());
    if (c.lastVisit) years.add(new Date(c.lastVisit).getFullYear());
  });
  const arr = Array.from(years).sort((a,b)=>b-a);
  ['newCustYearSel','retCustYearSel'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = arr.map(y => `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y} 年</option>`).join('');
  });
}

// 计算上一年同月/同年度 count 数组（用于同比）
function _getPrevYearCounts(targetYear, computeFn) {
  const py = targetYear - 1;
  const counts = Array(12).fill(0);
  activeRows(State.customers).forEach(c => {
    const r = computeFn(c, py);
    if (r !== null && r >= 0 && r < 12) counts[r]++;
  });
  return counts;
}

function renderNewCustChart() {
  const sel = document.getElementById('newCustYearSel'); if (!sel) return;
  const y = +sel.value;
  const counts = Array(12).fill(0);
  activeRows(State.customers).forEach(c => {
    if (!c.firstVisit) return;
    const d = new Date(c.firstVisit);
    if (d.getFullYear() !== y) return;
    counts[d.getMonth()]++;
  });
  // ---- 新增：3 张迷你汇总卡填充 ----
  const total = counts.reduce((s,n)=>s+n,0);
  // 月均 = 到当前月为止平均值（未来月不算入分母），否则全年平均
  const now = new Date();
  const curMonth = (now.getFullYear() === y) ? now.getMonth() : 11;
  const denom = Math.max(Math.min(curMonth + 1, 12), 1);
  const avg = (total / denom);
  // 最高月
  let topIdx = 0, topV = counts[0];
  counts.forEach((v,i)=>{ if (v > topV) { topV = v; topIdx = i; }});
  // 对比上一年
  const prevCounts = _getPrevYearCounts(y, (c, py) => {
    if (!c.firstVisit) return null;
    const d = new Date(c.firstVisit);
    return d.getFullYear() === py ? d.getMonth() : null;
  });
  const prevTotal = prevCounts.reduce((s,n)=>s+n,0);
  const diff = total - prevTotal;
  const ratio = prevTotal > 0 ? Math.round(diff / prevTotal * 100) : (total > 0 ? 100 : 0);
  const trend = diff === 0 ? '持平'
    : (diff > 0 ? `↑ 同比 +${ratio}%（多${diff}人）` : `↓ 同比 ${ratio}%（少${-diff}人）`);

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('ncTotal', total + ' 人');
  setTxt('ncTotalSub', prevTotal > 0 || total > 0 ? trend : '上一年无数据');
  setTxt('ncAvg', avg.toFixed(1) + ' 人');
  setTxt('ncTop', (topIdx+1) + ' 月');
  setTxt('ncTopSub', '新增 ' + topV + ' 人');

  renderBars('newCustChart', counts, false);
}
function renderRetCustChart() {
  const sel = document.getElementById('retCustYearSel'); if (!sel) return;
  const y = +sel.value;
  const counts = Array(12).fill(0);
  // 某月回头客 = lastVisit 落在该月 & 顾客 visits>=2（历史累计回头）
  activeRows(State.customers).forEach(c => {
    if (!c.lastVisit || (c.visits||0) < 2) return;
    const d = new Date(c.lastVisit);
    if (d.getFullYear() !== y) return;
    counts[d.getMonth()]++;
  });
  // ---- 新增：3 张迷你汇总卡填充 ----
  const total = counts.reduce((s,n)=>s+n,0);
  const now = new Date();
  const curMonth = (now.getFullYear() === y) ? now.getMonth() : 11;
  const denom = Math.max(Math.min(curMonth + 1, 12), 1);
  const avg = (total / denom);
  let topIdx = 0, topV = counts[0];
  counts.forEach((v,i)=>{ if (v > topV) { topV = v; topIdx = i; }});
  // 同比上一年
  const prevCounts = _getPrevYearCounts(y, (c, py) => {
    if (!c.lastVisit || (c.visits||0) < 2) return null;
    const d = new Date(c.lastVisit);
    return d.getFullYear() === py ? d.getMonth() : null;
  });
  const prevTotal = prevCounts.reduce((s,n)=>s+n,0);
  const diff = total - prevTotal;
  const ratio = prevTotal > 0 ? Math.round(diff / prevTotal * 100) : (total > 0 ? 100 : 0);
  const trend = diff === 0 ? '持平'
    : (diff > 0 ? `↑ 同比 +${ratio}%（多${diff}人）` : `↓ 同比 ${ratio}%（少${-diff}人）`);

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('rcTotal', total + ' 人');
  setTxt('rcTotalSub', prevTotal > 0 || total > 0 ? trend : '上一年无数据');
  setTxt('rcAvg', avg.toFixed(1) + ' 人');
  setTxt('rcTop', (topIdx+1) + ' 月');
  setTxt('rcTopSub', '回头客 ' + topV + ' 人');

  renderBars('retCustChart', counts, true);
}
function renderBars(containerId, counts, isRet) {
  const el = document.getElementById(containerId); if (!el) return;
  const max = Math.max.apply(null, counts.concat([1]));
  el.innerHTML = counts.map((c, i) => {
    const h = Math.max((c / max) * 100, c > 0 ? 4 : 0);
    return `<div class="bar ${isRet?'ret':''}" style="height:${h}%" data-count="${c}人"></div>`;
  }).join('');
}

function renderVisitRank() {
  const body = document.getElementById('visitRankBody'); if (!body) return;
  const range = document.getElementById('visitRankRange')?.value || 'all';
  const now = new Date();
  const threshold = {
    all: 0,
    year: new Date(now.getFullYear()-0, now.getMonth(), now.getDate()).setFullYear(now.getFullYear()-1),
    month: new Date(now.getFullYear(), now.getMonth()-1, now.getDate()).getTime()
  }[range];

  const list = activeRows(State.customers)
    .map(c => {
      // 根据范围重新计算 visits/累计金额
      let v = 0, paid = 0, last = c.lastVisit;
      if (range === 'all') { v = c.visits||0; paid = c.totalPaid||0; }
      else {
        // 从交易记录中统计该范围内扣款次数 + 金额
        activeRows(State.memberTxns).forEach(t => {
          if (t._auditOnly) return;
          if (t._reversed) return;
          if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return;
          if (t.cid !== c.id || t.type !== 'deduct') return;
          if (new Date(t.date).getTime() < threshold) return;
          v++;
          paid += t.amount || 0;
        });
        // 也包含无扣卡记录但预约已完成的顾客（简单匹配 lastVisit）
        if (c.lastVisit && new Date(c.lastVisit).getTime() >= threshold && v === 0) {
          v = 1;
          paid = c.totalPaid ? Math.min(c.totalPaid, 120) : 0;
        }
      }
      return { ...c, _v: v, _p: paid, _l: last };
    })
    .filter(c => c._v > 0)
    .sort((a,b) => b._v - a._v || b._p - a._p)
    .slice(0, 20);

  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px;">暂无数据</td></tr>`;
    return;
  }

  body.innerHTML = list.map((c, i) => {
    const mem = memberLabel(c.level);
    // 排名徽章：金银铜渐变卡，替代旧的 rank-badge 文字
    const badgeCls = i === 0 ? 'rank-1-badge' : i === 1 ? 'rank-2-badge' : i === 2 ? 'rank-3-badge' : 'rank-n-badge';
    return `<tr>
      <td><span class="${badgeCls}">${i+1}</span></td>
      <td style="font-weight:600;">${escapeHtml(c.name||'')}</td>
      <td>${escapeHtml(c.phone||'-')}</td>
      <td>${mem.tag ? `<span class="${mem.cls}">${mem.tag}</span>` : '<span style="color:var(--muted)">非会员</span>'}</td>
      <td style="font-weight:700;color:var(--accent);">${c._v} 次</td>
      <td>${escapeHtml(c._l||'-')}</td>
      <td>${escapeHtml(c.firstVisit||'-')}</td>
      <td style="color:var(--ink);font-weight:600;">${fmtMoney(c._p)}</td>
      <td>
        <button class="btn-ghost xsmall" onclick="openCustomerTxns('${c.id}')" title="查看该顾客在本店的所有消费记录与总金额">💳 消费记录</button>
      </td>
    </tr>`;
  }).join('');
}

function renderCustomerList() {
  const body = document.getElementById('customerListBody'); if (!body) return;
  const q = (document.getElementById('csSearch')?.value || '').trim().toLowerCase();
  let list = activeRows(State.customers);
  if (q) list = list.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));
  list.sort((a,b) => (b.lastVisit||'').localeCompare(a.lastVisit||''));

  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px;">暂无顾客，点右上角「+ 新增顾客」添加第一位吧~</td></tr>`;
    return;
  }

  body.innerHTML = list.map(c => {
    const mem = memberLabel(c.level);
    return `<tr>
      <td style="font-weight:600;">${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.phone || '-')}</td>
      <td>${mem.tag ? `<span class="${mem.cls}">${mem.tag}</span>` : '<span style="color:var(--muted)">非会员</span>'}</td>
      <td style="color:var(--success);font-weight:600;">${c.level && c.level!=='gold' ? fmtMoney(c.balance||0) : '-'}</td>
      <td>${c.firstVisit||'-'}</td>
      <td>${c.lastVisit||'-'}</td>
      <td style="font-weight:700;color:var(--accent);">${c.visits||0} 次</td>
      <td style="color:var(--ink);font-weight:600;">${fmtMoney(c.totalPaid||0)}</td>
      <td>
        <button class="btn-ghost xsmall" onclick="openCustomerModal(false,'${escapeHtml(c.id)}')">编辑</button>
        <button class="btn-ghost xsmall" onclick="openCustomerTxns('${escapeHtml(c.id)}')" title="查看该顾客在本店的所有消费记录与总金额">💳 消费记录</button>
        <button class="btn-danger xsmall" onclick="deleteCustomer('${escapeHtml(c.id)}')" title="彻底删除顾客档案（会员管理里请用「清卡退会员」以保留数据）">🗑 删除档案</button>
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   4. 顾客档案 弹窗
   ============================================================ */
function openCustomerModal(isNewMember=false, editId=null) {
  State.editingCustomerId = editId;
  const title = document.getElementById('customerModalTitle');
  const c = editId ? customerById(editId) : null;

  title.textContent = editId ? '✏️ 编辑顾客档案' : (isNewMember ? '👑 新增会员' : '👥 新增顾客');
  document.getElementById('cs_name').value = c?.name || '';
  document.getElementById('cs_phone').value = c?.phone || '';
  document.getElementById('cs_level').value = c?.level || (isNewMember ? 'gold' : '');
  document.getElementById('cs_firstVisit').value = c?.firstVisit || todayDateStr();
  document.getElementById('cs_balance').value = c?.balance || 0;
  document.getElementById('cs_expire').value = c?.expire || '';
  document.getElementById('cs_remark').value = c?.remark || '';

  document.getElementById('customerModal').classList.add('show');
}
function closeCustomerModal() {
  document.getElementById('customerModal').classList.remove('show');
  State.editingCustomerId = null;
}
function saveCustomer() {
  const name = document.getElementById('cs_name').value.trim();
  if (!name) { toast('请填写顾客姓名', 'error'); return; }
  const phone = document.getElementById('cs_phone').value.trim();
  const level = document.getElementById('cs_level').value;
  const firstVisit = document.getElementById('cs_firstVisit').value || todayDateStr();
  let balance = parseFloat(document.getElementById('cs_balance').value) || 0;
  const expire = document.getElementById('cs_expire').value;
  const remark = document.getElementById('cs_remark').value.trim();

  // 黄金会员是年卡制，余额强制 0
  if (level === 'gold') balance = 0;

  if (State.editingCustomerId) {
    const c = customerById(State.editingCustomerId);
    if (c) {
      // 如果通过编辑档案改为黄金会员且之前不是，记录起始日期
      if (level === 'gold' && c.level !== 'gold' && !c.goldSince) {
        c.goldSince = todayDateStr();
      }
      // 如果从黄金会员改为其他等级，清除起始日期
      if (level !== 'gold' && c.level === 'gold') {
        c.goldSince = '';
      }
      Object.assign(c, { name, phone, level, firstVisit, balance, expire, remark });
      touchRecord(c); addAuditLog('顾客更新', `更新顾客档案：${name}`, c.id);
    }
  } else {
    // 检查重名
    if (customerByName(name)) {
      toast('已存在同名顾客，建议编辑现有档案', 'error');
      return;
    }
    // 检查同手机号
    if (phone) {
      const fp = _normPhone(phone);
      const existing = activeRows(State.customers).find(cc => _normPhone(cc.phone) === fp && fp);
      if (existing) {
        toast('已存在相同手机号的顾客：' + (existing.name || '未命名'), 'error');
        return;
      }
    }
    const obj = {
      ...createRecordMeta('C'),
      name, phone, level, firstVisit, balance, expire, remark,
      lastVisit: '', visits: 0, totalPaid: 0
    };
    if (level === 'gold' && !obj.goldSince) obj.goldSince = todayDateStr();
    State.customers.push(obj);
    if (level && level !== 'gold' && balance > 0) {
      const tx = {
        id: genId('T'),
        cid: obj.id,
        type: 'recharge',
        subtype: '储值充值',
        amount: balance,
        payMethod: 'manual',
        date: todayDateStr(),
        time: new Date().toTimeString().slice(0, 5),
        remark: '新建会员初始储值',
        items: null,
        balanceAfter: balance,
        beforeState: { level: '', balance: 0, expire: '' },
        afterState: { level, balance, expire }
      };
      State.memberTxns.unshift(tx);
      save('memberTxns', State.memberTxns);
      addAuditLog('会员充值', `${name || '会员'} · 新建会员初始储值 · ${fmtMoney(balance)} · 余额 ${fmtMoney(balance)}`, obj.id, { amount: balance, subtype: '储值充值', source: '新建会员' });
    }
    addAuditLog('顾客创建', `新建顾客档案：${name}`, obj.id);
  }
  save('customers', State.customers);
  closeCustomerModal();
  refreshAllCustomerViews();
  toast('顾客档案已保存', 'success');
}
/* ============================================================
   两种删除场景的区别（重要！）：
   1️⃣ degradeMember(id) —— 【会员管理页】清卡退会员
        · 只清除会员权益（level / balance / expire），降级为普通顾客
        · 顾客档案保留（顾客管理还能看到）
        · 到店次数/累计消费/预约/会员交易记录 全部保留（历史存档）
        · 后续再次到店消费可正常统计，不丢任何消费数据
   2️⃣ deleteCustomer(id) —— 【顾客管理页】彻底删除档案
        · 真删 customers 记录（顾客管理也找不到了）
        · 如果是会员：交易记录也清掉
        · 预约记录保留（仅显示姓名）
   ============================================================ */
function degradeMember(id) {
  const c = customerById(id);
  if (!c) { toast('顾客不存在', 'error'); return; }
  if (!c.level || c.level === '') { toast('该顾客已经不是会员了', 'error'); return; }
  const oldLabel = memberLabel(c.level).tag;
  const bal = Number(c.balance) || 0;
  let msg = `确定要把「${c.name}」从${oldLabel}退回到普通顾客吗？\n\n`;
  msg += `✅ 会保留（不删除）：\n`;
  msg += `  · 顾客档案（顾客管理里依旧可见）\n`;
  msg += `  · 历史到店次数、累计消费、所有预约记录\n`;
  msg += `  · 历史充值/扣卡交易记录（作为存档保留）\n\n`;
  msg += `🗑 会清除：\n`;
  msg += `  · 会员等级（${oldLabel}权益失效）\n`;
  if (bal > 0) msg += `  · 当前储值余额 ${fmtMoney(bal)}（请先线下确认退款 / 清零，或改成扣卡消费完毕再操作）\n`;
  msg += `  · 有效期字段\n\n`;
  msg += `后续该顾客再来消费 → 按普通顾客正常统计消费，不会丢数据。确认继续？`;
  if (!confirm(msg)) return;

  // 降级：写一条退会记录到 memberTxns（方便日后查账）
  try {
    State.memberTxns.unshift({
      id: genId('T'),
      cid: c.id,
      type: 'recharge',    // 归类到充值大项里方便筛选，实际 subtype 标明是退会
      subtype: `【退会】${oldLabel} → 普通顾客`,
      amount: 0,
      payMethod: 'clear',
      date: todayDateStr() + ' ' + new Date().toTimeString().slice(0,5),
      items: [{ name: '退会清卡（清空等级' + (bal>0?'及余额'+fmtMoney(bal):'') + '，顾客档案保留）', qty: 1, price: 0 }]
    });
    save('memberTxns', State.memberTxns);
  } catch (e) {}

  // 清卡：等级/余额/有效期清空，其他字段全部保留
  // 同时把该顾客所有未冲正的储值充值标记为已冲正，确保余额口径一致（历史充值仍保留存档）
  if (bal > 0) {
    try {
      State.memberTxns.forEach(t => {
        if (t && t.cid === c.id && t.type === 'recharge' && !t._reversed && !_isDeletedMemberTxn(t) && !t._auditOnly) {
          t._reversed = true;
        }
      });
    } catch(e) {}
  }
  c.level = '';
  c.balance = 0;
  c.expire = '';
  c.goldSince = '';
  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  refreshAllCustomerViews();
  toast(`已清卡退会员：${c.name} 降级为普通顾客，消费数据全部保留 ✅`, 'success');
}

function deleteCustomer(id) {
  const c = customerById(id);
  const isMember = c && c.level && c.level !== '';
  const name = c?.name || '该顾客';
  let msg = `⚠️ 确定彻底删除「${name}」的顾客档案？此操作不可撤销。\n\n`;
  msg += `🗑 会被删除：\n`;
  msg += `  · 顾客档案（顾客管理里也找不到了）\n`;
  if (isMember) {
    const bal = Number(c.balance) || 0;
    msg += `  · ${memberLabel(c.level).tag}会员身份`;
    if (bal > 0) msg += `（还有储值余额 ${fmtMoney(bal)}）`;
    msg += `\n  · 所有充值/扣卡交易记录\n`;
  }
  msg += `\n✅ 会保留：\n`;
  msg += `  · 已存在的预约记录（仅显示姓名不再关联档案）\n\n`;
  if (isMember) msg += `💡 提示：如果只是会员清卡、顾客以后还会来消费 → 请到【会员管理】页点「🗑 清卡退会员」，数据不会丢。\n\n`;
  msg += `确认要彻底从顾客档案里移除？`;
  if (!confirm(msg)) return;
  softDeleteRecord(c, '手动删除顾客档案');
  save('customers', State.customers);
  // 如果是会员：同步删除所有 memberTxns 里该顾客的交易
  if (isMember) {
    let marked = 0;
    State.memberTxns.forEach(t => {
      if ((t.cid === id || t.customerId === id) && !t._deleted) { softDeleteRecord(t, '删除顾客档案联动软删除会员交易'); marked++; }
    });
    if (marked) save('memberTxns', State.memberTxns);
  }
  addAuditLog('顾客删除', `软删除顾客档案：${name}`, id);
  refreshAllCustomerViews();
  toast('已删除顾客档案', 'success');
}
function refreshAllCustomerViews() {
  try { renderCustomerStats(); } catch(e) {}
  try { renderVisitRank(); } catch(e) {}
  try { renderCustomerList(); } catch(e) {}
  try { renderMemberList(); } catch(e) {}
  try { renderLevelCounts(); } catch(e) {}
  try { populateMemberSelects(); } catch(e) {}
  try { syncMemberToAppointments(); } catch(e) {}
  try { renderApptTable(); } catch(e) {}
  try { renderTodayAppointments(); } catch(e) {}  // 修正函数名：之前写错成 renderTodayApptList
  try { renderMemberTxnList(); } catch(e) {}
  try { renderRechargeRecordsPage(); } catch(e) {}
  try { renderDeductRecordsPage(); } catch(e) {}
  try { renderCalendar(); } catch(e) {}
  // 会员页删除后：更新当前筛选标签的计数
  try { updateMemberFilterCounts(); } catch(e) {}
}

/* ============================================================
   5. 会员管理页 渲染
   ============================================================ */
// 当前会员筛选等级：all / gold / platinum / diamond
State.currentMemberLevel = State.currentMemberLevel || 'all';

function updateMemberFilterCounts() {
  const all = activeRows(State.customers).filter(c => c.level && c.level !== '');
  const gold = all.filter(c => c.level === 'gold').length;
  const platinum = all.filter(c => c.level === 'platinum').length;
  const diamond = all.filter(c => c.level === 'diamond').length;
  const total = all.length;
  // 三张等级卡的人数显示（追加「点击查看 →」文案提示可点）
  const setLc = (id, n) => { const x = document.getElementById(id); if (x) x.textContent = `当前 ${n} 人 · 点击查看 →`; };
  setLc('lcGold', gold); setLc('lcPlatinum', platinum); setLc('lcDiamond', diamond);
  // 全部会员 chip
  const allCount = document.getElementById('mbCountAll');
  if (allCount) allCount.textContent = total;
  // 3 张卡 + chip 的选中态
  ['mbChipAll','lcCardGold','lcCardPlatinum','lcCardDiamond'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.classList.remove('active');
  });
  const active = State.currentMemberLevel;
  if (active === 'all') {
    document.getElementById('mbChipAll')?.classList.add('active');
  } else if (active === 'gold') {
    document.getElementById('lcCardGold')?.classList.add('active');
  } else if (active === 'platinum') {
    document.getElementById('lcCardPlatinum')?.classList.add('active');
  } else if (active === 'diamond') {
    document.getElementById('lcCardDiamond')?.classList.add('active');
  }
  // 会员档案标题 + 筛选提示胶囊
  const title = document.getElementById('memberListTitle');
  const hint = document.getElementById('mbFilterHint');
  const labelMap = { all:'全部会员', gold:'黄金会员', platinum:'铂金会员', diamond:'钻石会员' };
  const curLabel = labelMap[active] || '全部会员';
  if (title) title.textContent = `📋 会员档案（${curLabel}）`;
  if (hint) {
    if (active === 'all') { hint.style.display = 'none'; }
    else {
      hint.style.display = '';
      hint.textContent = `当前筛选：${curLabel} · 共 ${active==='gold'?gold:active==='platinum'?platinum:diamond} 人 · 点击左上角「全部会员」取消筛选`;
    }
  }
}

function filterMemberLevel(level) {
  const valid = ['all','gold','platinum','diamond'];
  if (valid.indexOf(level) < 0) level = 'all';
  State.currentMemberLevel = level;
  updateMemberFilterCounts();
  renderMemberList();
  renderMemberTxnList();   // 最近交易也按等级过滤（更直观）
  renderRechargeRecordsPage();
}

function renderLevelCounts() { updateMemberFilterCounts(); }

// ============ 会员到期提醒（B3：到期前提醒，提醒后再降级） ============
// 返回 { status: 'ok'|'soon'|'expired'|'none', daysLeft }
// - 'soon'   ：7 天内到期（含今天），界面提醒"即将到期"
// - 'expired'：已过到期日（尚未执行降级时显示"已过期"）
function memberExpiryInfo(c) {
  const exp = String(c && c.expire || '').slice(0, 10);
  if (!exp) return { status: 'none', daysLeft: null };
  const today = todayDateStr();
  if (exp < today) return { status: 'expired', daysLeft: -1 };
  const diff = Math.ceil((new Date(exp + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (diff <= 7) return { status: 'soon', daysLeft: diff };
  return { status: 'ok', daysLeft: diff };
}
function _memberExpireCell(c) {
  const raw = escapeHtml(c.expire || (c.level === 'gold' ? '（未设置）' : '长期有效'));
  if (c.level !== 'gold' || !c.expire) return raw;
  const info = memberExpiryInfo(c);
  if (info.status === 'soon') return `${raw} <span style="color:#C77700;font-weight:700;">⚠️ 剩 ${info.daysLeft} 天到期</span>`;
  if (info.status === 'expired') return `${raw} <span style="color:#C75A5A;font-weight:700;">⚠️ 已过期，即将自动降级</span>`;
  return raw;
}
// 汇总即将到期（7 天内）或已过期的会员，供首页提醒横幅使用
function upcomingExpiryMembers() {
  return activeRows(State.customers).filter(c => {
    if (c.level !== 'gold') return false;
    const info = memberExpiryInfo(c);
    return info.status === 'soon' || info.status === 'expired';
  }).map(c => ({ name: c.name, expire: String(c.expire || '').slice(0, 10), status: memberExpiryInfo(c).status }));
}

function renderMemberList() {
  const body = document.getElementById('memberListBody'); if (!body) return;
  const q = (document.getElementById('mbSearch')?.value || '').trim().toLowerCase();
  let list = activeRows(State.customers).filter(c => c.level && c.level !== '');
  // 先按当前会员等级筛选（all 不筛）
  if (State.currentMemberLevel && State.currentMemberLevel !== 'all') {
    list = list.filter(c => c.level === State.currentMemberLevel);
  }
  if (q) list = list.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q));

  if (list.length === 0) {
    const cur = State.currentMemberLevel || 'all';
    const tips = { all:'暂无会员，点右上角「新增会员」', gold:'暂无黄金会员，可在顾客编辑页升级为黄金会员 68 元 / 年', platinum:'暂无铂金会员，可给顾客充值满 1000 元升级', diamond:'暂无钻石会员，可给顾客充值满 2000 元升级' };
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:40px 20px;line-height:1.8;">${tips[cur]||tips.all}</td></tr>`;
    return;
  }
  body.innerHTML = list.map(c => {
    const mem = memberLabel(c.level);
    const balanceStr = c.level === 'gold'
      ? '<span style="color:var(--muted);font-size:12px;">年卡制</span>'
      : `<span style="color:var(--success);font-weight:700;">${fmtMoney(c.balance||0)}</span>`;
    return `<tr>
      <td style="font-weight:600;">${escapeHtml(c.name)}</td>
      <td><span class="${mem.cls}">${mem.tag}</span></td>
      <td>${balanceStr}</td>
      <td>${_memberExpireCell(c)}</td>
      <td>
        <button class="btn-ghost xsmall" onclick="openCustomerModal(false,'${c.id}')">编辑</button>
        <button class="btn-ghost xsmall" onclick="openCustomerTxns('${c.id}')" title="查看该会员在本店的所有消费记录与总金额">💳 消费记录</button>
        <button class="btn-ghost xsmall" onclick="openRechargeModal('${c.id}')">充值</button>
        <button class="btn-ghost xsmall" onclick="openDeductModal('${c.id}')">扣卡</button>
        <button class="btn-ghost xsmall" onclick="filterDeductByCustomer('${c.id}')" title="查看该会员的扣卡记录档案">📋 扣卡记录</button>
        <button class="btn-danger xsmall" onclick="degradeMember('${c.id}')" title="清卡退会员：降级为普通顾客，消费/档案/交易记录全部保留">🗑 清卡退会员</button>
      </td>
    </tr>`;
  }).join('');
}

function renderMemberTxnList() {
  const wrap = document.getElementById('memberTxnList'); if (!wrap) return;
  const filter = document.getElementById('mbTxnFilter')?.value || 'all';
  const deletedIds = (typeof _deletedMemberTxnIdSet === 'function') ? _deletedMemberTxnIdSet() : new Set();
  let list = (State.memberTxns || []).filter(t => {
    if (!t) return false;
    if (typeof _isDeletedMemberTxn === 'function' && _isDeletedMemberTxn(t)) return false;
    if (t.id && deletedIds.has(t.id)) return false;
    if (t._auditOnly || t._hiddenFromDeductArchive) return false;
    if (t._reversed) return false;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return false;
    return true;
  });
  // 如果当前选中了某一等级的会员，交易也只看该等级
  if (State.currentMemberLevel && State.currentMemberLevel !== 'all') {
    list = list.filter(t => {
      const c = customerById(t.cid);
      return c && c.level === State.currentMemberLevel;
    });
  }
  if (filter !== 'all') list = list.filter(t => t.type === filter);
  list.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  list = list.slice(0, 20);

  if (list.length === 0) {
    wrap.innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px;">暂无交易记录</div>`;
    return;
  }

  const payMap = { wechat:'微信', alipay:'支付宝', cash:'现金', card:'银行卡', balance:'储值卡扣款' };
  wrap.innerHTML = list.map(t => {
    const c = customerById(t.cid);
    const isRe = t.type === 'recharge';
    const itemsHtml = (!isRe && t.items && t.items.length) ? `
      <div class="txn-detail">
        ${t.items.map(it => `<div class="td-row"><span>${it.name} × ${it.qty}</span><span>${fmtMoney(it.price*it.qty)}</span></div>`).join('')}
        <div class="td-total"><span>实付（已折）</span><span>${fmtMoney(t.amount)}</span></div>
      </div>` : '';
    return `<div class="txn-item">
      <div class="txn-icon ${isRe?'recharge':'deduct'}">${isRe?'💳':'💅'}</div>
      <div class="txn-body">
        <div class="txn-head">
          <span class="txn-name">${c?.name || '未知客户'} · ${t.subtype || ''}</span>
          <span class="txn-amount ${isRe?'recharge':'deduct'}">${isRe?'+':'-'} ${fmtMoney(t.amount)}</span>
        </div>
        <div class="txn-meta">
          <span class="t-tag">${t.date||''}</span>
          <span class="t-tag">${payMap[t.payMethod]||t.payMethod||''}</span>
          ${t.remark?`<span style="color:var(--ink-2);">${t.remark}</span>`:''}
        </div>
        ${itemsHtml}
      </div>
    </div>`;
  }).join('');
}

let _rechargePageState = { page: 1, pageSize: 12 };
function _rechargePayLabel(v) {
  return { wechat:'微信', alipay:'支付宝', cash:'现金', card:'银行卡', balance:'储值卡', clear:'清卡', refund:'退款', manual:'手动录入' }[v] || v || '';
}
function _activeRechargeTxns() {
  return (State.memberTxns || []).filter(t => {
    if (!t || t.type !== 'recharge') return false;
    if (typeof _isDeletedMemberTxn === 'function' && _isDeletedMemberTxn(t)) return false;
    if (t._auditOnly || t._hiddenFromDeductArchive) return false;
    if (t._reversed) return false;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return false;
    return true;
  });
}
function renderRechargeRecordsPage() {
  const body = document.getElementById('rechargeRecordsBody');
  const pager = document.getElementById('rechargePager');
  if (!body) return;
  const q = (document.getElementById('rechargeSearch')?.value || '').trim().toLowerCase();
  const from = document.getElementById('rechargeFrom')?.value || '';
  const to = document.getElementById('rechargeTo')?.value || '';
  const typeF = document.getElementById('rechargeTypeFilter')?.value || 'all';
  let list = _activeRechargeTxns();
  list = list.filter(t => {
    const c = customerById(t.cid || t.customerId);
    const subtype = t.subtype || '';
    if (typeF !== 'all' && !subtype.includes(typeF)) return false;
    if (from && (t.date || '') < from) return false;
    if (to && (t.date || '') > to) return false;
    if (q) {
      const hay = [c?.name || '', c?.phone || '', subtype, t.remark || '', t.id || ''].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a,b) => (b.date||'').localeCompare(a.date||'') || String(b.id||'').localeCompare(String(a.id||'')));
  const total = list.reduce((s,t) => s + (Number(t.amount) || 0), 0);
  const members = new Set(list.map(t => t.cid || t.customerId || '').filter(Boolean)).size;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('rscCount', list.length);
  setText('rscTotal', fmtMoney(total));
  setText('rscMembers', members);
  setText('rscAvg', fmtMoney(list.length ? total / list.length : 0));
  let { page, pageSize } = _rechargePageState;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (page > totalPages) _rechargePageState.page = page = totalPages;
  const pageList = list.slice((page - 1) * pageSize, page * pageSize);
  if (!pageList.length) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:34px;">暂无会员充值记录</td></tr>`;
  } else {
    body.innerHTML = pageList.map(t => {
      const c = customerById(t.cid || t.customerId);
      const amt = Number(t.amount) || 0;
      return `<tr>
        <td>${escapeHtml((t.date || '').slice(0,10))}</td>
        <td>${escapeHtml(c?.name || '未知会员')}</td>
        <td>${escapeHtml(t.subtype || '会员充值')}</td>
        <td class="money" style="font-weight:700;color:${amt < 0 ? 'var(--danger)' : 'var(--success)'};">${amt < 0 ? '-' : '+'} ${fmtMoney(Math.abs(amt))}</td>
        <td>${escapeHtml(_rechargePayLabel(t.payMethod))}</td>
        <td>${escapeHtml(t.remark || '')}</td>
        <td>
          <button class="btn-ghost xsmall" onclick="editRechargeRecord('${t.id}')">编辑</button>
          <button class="btn-danger xsmall" onclick="deleteRechargeRecord('${t.id}')">删除</button>
        </td>
      </tr>`;
    }).join('');
  }
  if (pager) {
    pager.innerHTML = totalPages <= 1 ? '' : `<div class="pager">
      <button class="pg-btn" ${page<=1?'disabled':''} onclick="rechargeGoPage(${page-1})">‹ 上一页</button>
      <span class="pg-total">第 ${page} / ${totalPages} 页 · 共 ${list.length} 条</span>
      <button class="pg-btn" ${page>=totalPages?'disabled':''} onclick="rechargeGoPage(${page+1})">下一页 ›</button>
    </div>`;
  }
}
function rechargeGoPage(p) { _rechargePageState.page = Math.max(1, p); renderRechargeRecordsPage(); }
function editRechargeRecord(txnId) {
  const tx = State.memberTxns.find(t => t && t.id === txnId && t.type === 'recharge');
  if (!tx || _isDeletedMemberTxn(tx)) { toast('充值记录不存在或已删除', 'error'); return; }
  const c = customerById(tx.cid || tx.customerId);
  if (!c) { toast('找不到该会员，不能编辑', 'error'); return; }
  const oldAmount = Number(tx.amount) || 0;
  const newDate = prompt('修改充值日期（YYYY-MM-DD）：', (tx.date || todayDateStr()).slice(0,10));
  if (newDate === null) return;
  const amountText = prompt('修改充值金额：', String(oldAmount));
  if (amountText === null) return;
  const newAmount = Math.round((Number(amountText) || 0) * 100) / 100;
  if (!Number.isFinite(newAmount)) { toast('金额不正确', 'error'); return; }
  const newPay = prompt('修改支付方式（wechat/alipay/cash/card）：', tx.payMethod || 'wechat');
  if (newPay === null) return;
  const newRemark = prompt('修改备注：', tx.remark || '');
  if (newRemark === null) return;
  const diff = newAmount - oldAmount;
  if (c.level !== 'gold' && (Number(c.balance)||0) + diff < -0.001) {
    toast(`余额不足：修改后需要扣回 ${fmtMoney(Math.abs(diff))}，当前余额 ${fmtMoney(c.balance || 0)}`, 'error');
    return;
  }
  const special = /年卡|升级|退会|冲正|退款/.test(tx.subtype || '');
  const msg = `确认修改这笔充值记录？\n\n会员：${c.name || ''}\n原金额：${fmtMoney(oldAmount)}\n新金额：${fmtMoney(newAmount)}\n差额：${diff>=0?'+':''}${fmtMoney(diff)}\n\n${special ? '提示：这是年卡/升级/退会/冲正类记录，系统只自动调整金额和余额，会员等级如需变化请到会员档案里编辑。' : '系统会同步调整会员余额。'}`;
  if (!confirm(msg)) return;
  tx.date = newDate || tx.date;
  tx.amount = newAmount;
  tx.payMethod = newPay || tx.payMethod;
  tx.remark = newRemark;
  tx.balanceAfter = c.level === 'gold' ? 0 : Math.round(((Number(c.balance)||0) + diff) * 100) / 100;
  touchRecord(tx); touchRecord(c);
  if (c.level !== 'gold') { try { _recalcMemberBalance(c.id); } catch(e) {} }
  tx.balanceAfter = c.level === 'gold' ? 0 : Number(c.balance) || 0;
  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  addAuditLog('充值记录编辑', `${c.name || '会员'} · ${fmtMoney(oldAmount)} → ${fmtMoney(newAmount)}`, txnId, { oldAmount, newAmount, diff });
  toast('充值记录已修改', 'success');
  refreshAllCustomerViews();
  renderMemberTxnList();
  renderRechargeRecordsPage();
  try { renderIncome(); } catch(e) {}
}
function deleteRechargeRecord(txnId) {
  const tx = State.memberTxns.find(t => t && t.id === txnId && t.type === 'recharge');
  if (!tx || _isDeletedMemberTxn(tx)) { toast('充值记录不存在或已删除', 'error'); return; }
  const c = customerById(tx.cid || tx.customerId);
  const amt = Number(tx.amount) || 0;
  const special = /年卡|升级|退会|冲正|退款/.test(tx.subtype || '');
  const msg = `确认删除这笔会员充值记录？\n\n会员：${c?.name || '未知会员'}\n类型：${tx.subtype || '会员充值'}\n金额：${fmtMoney(amt)}\n\n删除后记录不会再显示，也不会计入收入，并从会员余额中扣回 ${fmtMoney(amt)}。${special ? '\n\n提示：这是年卡/升级/退会/冲正类记录，如需恢复会员等级，请到会员档案里手动调整。' : ''}`;
  if (!confirm(msg)) return;
  if (c && c.level !== 'gold') {
    const nextBal = Math.round(((Number(c.balance)||0) - amt) * 100) / 100;
    if (nextBal < -0.001 && !confirm(`⚠️ 删除后会员余额会变成 ${fmtMoney(nextBal)}（负数）。\n\n这说明这笔充值中已有 ${fmtMoney(Math.abs(nextBal))} 被消费抵扣过了。\n· 若这笔充值确属误录，可继续删除；\n· 若顾客已实际消费该金额，建议改用「收入明细 → 该充值 → 冲正退款」处理，账目更清晰。\n\n确认继续删除？`)) return;
  }
  softDeleteRecord(tx, '删除会员充值记录');
  if (c) { try { _recalcMemberBalance(c.id); } catch(e) {} }
  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  addAuditLog('充值记录删除', `${c?.name || '会员'} · ${tx.subtype || ''} · ${fmtMoney(amt)}`, txnId, { amount: amt });
  toast('充值记录已删除', 'success');
  refreshAllCustomerViews();
  renderMemberTxnList();
  renderRechargeRecordsPage();
  try { renderIncome(); } catch(e) {}
}

/* ============================================================
   6. 会员选择下拉填充（充值/扣卡弹窗通用）
   ============================================================ */
function populateMemberSelects() {
  const memberList = activeRows(State.customers).filter(c => c.level && c.level !== '');
  const optsHtml = memberList.map(c => {
    const mem = memberLabel(c.level);
    const bal = c.level === 'gold' ? '年卡' : `余额 ${fmtMoney(c.balance||0)}`;
    return `<option value="${c.id}">${c.name} · ${mem.tag||'会员'} · ${bal}</option>`;
  }).join('');
  const rc = document.getElementById('rc_member');
  const dc = document.getElementById('dc_member');
  if (rc) rc.innerHTML = `<option value="">—— 请选择要充值的会员 ——</option>` + optsHtml;
  if (dc) dc.innerHTML = `<option value="">—— 请选择要扣款的会员 ——</option>` + optsHtml;
}

function _memberSearchText(c) {
  const mem = memberLabel(c.level);
  return [
    c.name || '',
    c.phone || '',
    _pinyinInitial(c.name || ''),
    mem.label || '',
    mem.tag || ''
  ].join(' ').toLowerCase();
}
function _memberPickLabel(c) {
  if (!c) return '';
  const mem = memberLabel(c.level);
  const bal = c.level === 'gold' ? '年卡制' : `余额 ${fmtMoney(c.balance || 0)}`;
  return `${c.name || '未命名'} · ${mem.tag || mem.label || '会员'} · ${bal}`;
}
function filterDeductMemberList() {
  const input = document.getElementById('dc_memberSearch');
  const suggest = document.getElementById('dc_memberSuggest');
  if (!input || !suggest) return;
  const q = (input.value || '').trim().toLowerCase();
  let list = activeRows(State.customers).filter(c => c.level && c.level !== '');
  if (q) list = list.filter(c => _memberSearchText(c).includes(q));
  list = list.slice(0, 12);
  if (!list.length) {
    suggest.innerHTML = `<div class="member-pick-empty">没有找到匹配会员</div>`;
    suggest.classList.add('show');
    return;
  }
  suggest.innerHTML = list.map(c => {
    const mem = memberLabel(c.level);
    const bal = c.level === 'gold' ? '年卡制' : fmtMoney(c.balance || 0);
    return `<button type="button" class="member-pick-item" onclick="pickDeductMember('${c.id}')">
      <span>
        <strong>${escapeHtml(c.name || '未命名')}</strong>
        <small>${escapeHtml(c.phone || '无手机号')} · ${escapeHtml(_pinyinInitial(c.name || ''))}</small>
      </span>
      <em>${escapeHtml(mem.tag || mem.label || '会员')} · ${escapeHtml(bal)}</em>
    </button>`;
  }).join('');
  suggest.classList.add('show');
}
function _fillDeductApptOptions(cid) {
  const el = document.getElementById('dc_appt');
  if (!el) return;
  const c = customerById(cid);
  let list = State.appointments.slice();
  if (c) {
    list = list.filter(a =>
      a.customerId === cid ||
      (c.phone && a.phone === c.phone) ||
      (_normStr(a.customer) === _normStr(c.name))
    );
  }
  list = list.slice(0, 20);
  el.innerHTML = `<option value="">不关联</option>` +
    list.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(_apptDisplayLabel(a))}</option>`).join('');
}
function pickDeductMember(cid, fromRow = false) {
  const c = customerById(cid);
  const sel = document.getElementById('dc_member');
  const input = document.getElementById('dc_memberSearch');
  const suggest = document.getElementById('dc_memberSuggest');
  const hint = document.getElementById('dc_memberHint');
  if (!c || !sel) return;
  // 隐藏 select 可能因筛选/新建会员未包含该 option，先兜底补齐再赋值
  if (![...sel.options].some(o => String(o.value) === String(cid))) {
    const opt = document.createElement('option');
    opt.value = cid;
    opt.textContent = _memberPickLabel(c);
    sel.appendChild(opt);
  }
  sel.value = cid;
  window._currentDeductCustomerId = cid;
  if (input) input.value = _memberPickLabel(c);
  if (suggest) suggest.classList.remove('show');
  if (hint) {
    if (c.level === 'gold') {
      hint.textContent = '⚠️ 黄金会员是年卡折扣权益制，无储值无扣卡。消费请通过预约 → 完成收款来记录。';
      hint.classList.toggle('picked', true);
    } else {
      hint.textContent = fromRow ? `已从会员档案带入：${c.name}，折扣和余额已自动绑定` : '已选择会员，折扣和余额会自动带入';
      hint.classList.toggle('picked', true);
    }
  }
  _fillDeductApptOptions(cid);
  onDeductMemberChange();
}

/* ============================================================
   7. 会员充值 弹窗
   ============================================================ */
function openRechargeModal() {
  populateMemberSelects();
  document.getElementById('rc_curLevel').value = '';
  document.getElementById('rc_curBalance').value = '';
  document.getElementById('rc_amount').value = '';
  document.getElementById('rc_fee').value = '';
  document.getElementById('rc_remark').value = '';
  document.querySelectorAll('input[name="rcType"]').forEach(r => r.checked = r.value === 'balance');
  document.querySelectorAll('input[name="rcUpgrade"]').forEach(r => r.checked = false);
  document.getElementById('rc_years').value = '1';
  onRechargeTypeChange();
  document.getElementById('rechargeModal').classList.add('show');
}
function closeRechargeModal() {
  document.getElementById('rechargeModal').classList.remove('show');
}
function onRechargeMemberChange() {
  const sel = document.getElementById('rc_member').value;
  const c = customerById(sel);
  const mem = memberLabel(c?.level || '');
  document.getElementById('rc_curLevel').value = c ? (mem.tag || '非会员') : '';
  document.getElementById('rc_curBalance').value = c ? (c.level === 'gold' ? '年卡制' : fmtMoney(c.balance || 0)) : '';
}
function onRechargeTypeChange() {
  const type = document.querySelector('input[name="rcType"]:checked')?.value || 'balance';
  const show = (id, yes) => { const el = document.getElementById(id); if (el) el.style.display = yes ? '' : 'none'; };
  show('rcAmountRow', type === 'balance');
  show('rcQuickRow', type === 'balance');
  show('rcUpgradeRow', type === 'upgrade');
  show('rcYearRow', type === 'year');
  show('rcFeeRow', type !== 'balance');
  if (type === 'year') calcYearFee();
  if (type === 'upgrade') calcUpgradeFee();
}
function setRcAmount(n) { document.getElementById('rc_amount').value = n; }
function calcYearFee() {
  const y = +document.getElementById('rc_years').value;
  document.getElementById('rc_fee').value = fmtMoney(68 * y);
}
function calcUpgradeFee() {
  const v = document.querySelector('input[name="rcUpgrade"]:checked')?.value;
  const feeMap = { gold: 68, platinum: 1000, diamond: 2000 };
  document.getElementById('rc_fee').value = v ? fmtMoney(feeMap[v]) : '';
}
function confirmRecharge() {
  const cid = document.getElementById('rc_member').value;
  if (!cid) { toast('请选择会员', 'error'); return; }
  const c = customerById(cid);
  if (!c) { toast('会员不存在或已删除', 'error'); return; }
  const typeRadio = document.querySelector('input[name="rcType"]:checked');
  if (!typeRadio) { toast('请选择充值类型', 'error'); return; }
  const type = typeRadio.value;
  const payMethod = document.getElementById('rc_payMethod').value;
  const remark = document.getElementById('rc_remark').value.trim();
  const beforeState = { level: c.level || '', balance: Number(c.balance) || 0, expire: c.expire || '' };

  let amount = 0, subtype = '', newBalance = c.balance || 0;
  if (type === 'balance') {
    amount = parseFloat(document.getElementById('rc_amount').value);
    if (!amount || amount <= 0) { toast('请输入充值金额', 'error'); return; }
    if (c.level === 'gold') { toast('黄金会员是年卡制，请选择「年卡续期」类型', 'error'); return; }
    newBalance = (c.balance || 0) + amount;
    subtype = '储值充值';
  } else if (type === 'year') {
    const y = +document.getElementById('rc_years').value;
    amount = 68 * y;
    // 黄金会员：设置等级 + 更新到期日
    const wasGold = c.level === 'gold';
    c.level = 'gold';
    let startExp = c.expire && new Date(c.expire) > new Date() ? new Date(c.expire) : new Date();
    startExp.setFullYear(startExp.getFullYear() + y);
    c.expire = localDateStr(startExp);
    c.balance = 0;
    newBalance = 0;
    // 新开或续期黄金会员时记录起始日期（用于首次9折判断）
    if (!wasGold || !c.goldSince) c.goldSince = todayDateStr();
    subtype = '年卡续期/开通';
  } else if (type === 'upgrade') {
    const target = document.querySelector('input[name="rcUpgrade"]:checked')?.value;
    if (!target) { toast('请选择要升级到的会员等级', 'error'); return; }
    const feeMap = { gold: 68, platinum: 1000, diamond: 2000 };
    amount = feeMap[target];
    c.level = target;
    if (target === 'gold') {
      // 开通年卡：设置到期日1年，余额0
      c.balance = 0;
      const exp = new Date(); exp.setFullYear(exp.getFullYear()+1);
      c.expire = localDateStr(exp);
      newBalance = 0;
      // 记录黄金会员起始日期
      c.goldSince = todayDateStr();
    } else {
      // 储值制：加余额
      newBalance = (c.balance || 0) + amount;
      c.balance = newBalance;
      c.expire = '';
    }
    subtype = '升级会员/开通';
  }

  c.balance = newBalance;

  // 保存交易记录
  State.memberTxns.unshift({
    id: genId('T'), cid, type: 'recharge', subtype,
    amount, payMethod, date: todayDateStr(), remark,
    items: null, balanceAfter: newBalance,
    beforeState,
    afterState: { level: c.level || '', balance: Number(c.balance) || 0, expire: c.expire || '' }
  });
  // 统一按有效流水重算余额，确保充值/年卡/升级后余额与流水一致（gold 恒0）
  try { _recalcMemberBalance(cid); } catch(e) {}
  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  addAuditLog('会员充值', `${c.name || '会员'} · ${subtype} · ${fmtMoney(amount)} · 余额 ${fmtMoney(newBalance)}`, cid, { amount, subtype, payMethod });
  closeRechargeModal();
  refreshAllCustomerViews();
  renderMemberTxnList();
  // 重置分页和筛选条件，确保新记录可见
  _rechargePageState.page = 1;
  const rsEl = document.getElementById('rechargeSearch'); if (rsEl) rsEl.value = '';
  const rfEl = document.getElementById('rechargeFrom'); if (rfEl) rfEl.value = '';
  const rtEl = document.getElementById('rechargeTo'); if (rtEl) rtEl.value = '';
  const rtfEl = document.getElementById('rechargeTypeFilter'); if (rtfEl) rtfEl.value = 'all';
  renderRechargeRecordsPage();
  toast(`充值成功：${fmtMoney(amount)}`, 'success');
}

/* ============================================================
   8. 会员扣卡 弹窗
   ============================================================ */
function openDeductModal(cid = '') {
  populateMemberSelects();
  window._currentDeductCustomerId = '';
  State.currentDeductItems = [];
  document.getElementById('dc_curLevel').value = '';
  document.getElementById('dc_curBalance').value = '';
  document.getElementById('dc_date').value = todayDateStr();
  document.getElementById('dc_remark').value = '';
  const search = document.getElementById('dc_memberSearch');
  const suggest = document.getElementById('dc_memberSuggest');
  const hint = document.getElementById('dc_memberHint');
  if (search) search.value = '';
  if (suggest) { suggest.innerHTML = ''; suggest.classList.remove('show'); }
  if (hint) { hint.textContent = '可输入顾客姓名 / 手机号 / 首字母快速搜索'; hint.classList.remove('picked'); }
  _fillDeductApptOptions('');
  document.getElementById('dc_original').textContent = fmtMoney(0);
  document.getElementById('dc_discount').textContent = '- ' + fmtMoney(0);
  document.getElementById('dc_total').textContent = fmtMoney(0);
  document.getElementById('dc_afterBalance').textContent = fmtMoney(0);
  document.getElementById('dc_discountRow').style.display = 'none';
  addDeductItem(true);
  if (cid) pickDeductMember(cid, true);
  document.getElementById('deductModal').classList.add('show');
}
function closeDeductModal() {
  document.getElementById('deductModal').classList.remove('show');
  window._currentDeductCustomerId = '';
}
function onDeductMemberChange() {
  const cid = document.getElementById('dc_member').value;
  window._currentDeductCustomerId = cid || '';
  const c = customerById(cid);
  const mem = memberLabel(c?.level || '');
  document.getElementById('dc_curLevel').value = c ? (mem.tag || '非会员') : '';
  document.getElementById('dc_curBalance').value = c ? (c.level === 'gold' ? '年卡制' : fmtMoney(c.balance || 0)) : '';
  recalcDeductSummary();
}
function addDeductItem(first=false) {
  const item = { name: '', qty: 1, price: 0 };
  State.currentDeductItems.push(item);
  renderDeductItems();
  if (first) return;
  recalcDeductSummary();
}
function removeDeductItem(idx) {
  State.currentDeductItems.splice(idx, 1);
  if (State.currentDeductItems.length === 0) State.currentDeductItems.push({ name:'', qty:1, price:0 });
  renderDeductItems();
  recalcDeductSummary();
}
function renderDeductItems() {
  const wrap = document.getElementById('deductItems'); if (!wrap) return;
  const styleOpts = State.prices.style.map(s => `<option value="${s.name}" data-price="${s.price}" ${s.custom?'data-custom="1"':''}>${s.name}</option>`).join('');
  const tipOpts = State.prices.tip.map(t => `<option value="${t.name}" data-price="${t.price}">${t.name}</option>`).join('');
  const extraOpts = `<option value="手部护理">手部护理</option><option value="脚部护理">脚部护理</option><option value="卸甲">卸甲</option><option value="贴钻/饰品">贴钻/饰品</option><option value="手绘图案">手绘图案</option><option value="延长甲">延长甲</option>`;

  wrap.innerHTML = State.currentDeductItems.map((it, i) => {
    // 【修复：选项目后不显示】
    // 关键点：render 后重写 select，必须把当前 it.name 回填成 selected，否则浏览器默认回到「— 选择项目 —」空选项
    const selValue = it.__useCustom ? '__custom__' : (it.name || '');
    const customInput = it.__useCustom
      ? `<input type="text" placeholder="输入自定义项目名" value="${escapeHtml(it.name||'')}" style="margin-top:6px;padding:7px 10px;font-size:13px;width:100%;border-radius:8px;border:1px solid var(--rule);background:#fff;" oninput="onDeductItemChange(${i},'customName',this)">`
      : '';
    return `
    <div class="deduct-item">
      <div class="form-item">
        <label>项目名称</label>
        <select onchange="onDeductItemChange(${i},'name',this)">
          <option value="" ${selValue===''?'selected':''}>— 选择项目 —</option>
          <optgroup label="款式">
            ${State.prices.style.map(s => `<option value="${s.name}" data-price="${s.price}" ${s.custom?'data-custom="1"':''} ${selValue===s.name?'selected':''}>${s.name}</option>`).join('')}
          </optgroup>
          <optgroup label="甲片">
            ${State.prices.tip.map(t => `<option value="${t.name}" data-price="${t.price}" ${selValue===t.name?'selected':''}>${t.name}</option>`).join('')}
          </optgroup>
          <optgroup label="美睫">
            ${State.prices.lash.map(l => `<option value="${l.name}" data-price="${l.price}" ${selValue===l.name?'selected':''}>${l.name}</option>`).join('')}
            ${State.prices.removeLash.map(r => `<option value="${r.name}" data-price="${r.price}" ${selValue===r.name?'selected':''}>${r.name}</option>`).join('')}
          </optgroup>
          <optgroup label="其他">
            ${['手部护理','脚部护理','卸甲','贴钻/饰品','手绘图案','延长甲'].map(x => `<option value="${x}" ${selValue===x?'selected':''}>${x}</option>`).join('')}
          </optgroup>
          <option value="__custom__" ${selValue==='__custom__'?'selected':''}>✏️ 自定义项目</option>
        </select>
        ${customInput}
      </div>
      <div class="form-item">
        <label>单价（元）</label>
        <input type="number" min="0" step="0.01" value="${Number(it.price||0).toFixed(2)}" oninput="onDeductItemChange(${i},'price',this)">
      </div>
      <div class="form-item">
        <label>数量</label>
        <input type="number" min="1" step="1" value="${Number(it.qty||1)}" oninput="onDeductItemChange(${i},'qty',this)">
      </div>
      <div class="di-sum" title="小计">${fmtMoney((Number(it.price)||0)*(Number(it.qty)||1))}</div>
      <button class="di-del" onclick="removeDeductItem(${i})" title="删除该项目">✕ 删除</button>
    </div>
  `;}).join('');
}
function onDeductItemChange(idx, field, el) {
  const it = State.currentDeductItems[idx];
  if (field === 'name') {
    const v = el.value;
    if (v === '__custom__') {
      it.__useCustom = true;
    } else {
      it.__useCustom = false;
      it.name = v;
      // 尝试从选中项的 data-price 取默认单价
      const opt = el.selectedOptions?.[0];
      const isCustom = opt?.dataset.custom === '1';
      if (!isCustom && opt?.dataset.price) {
        it.price = parseFloat(opt.dataset.price) || 0;
      }
    }
    renderDeductItems();
  } else if (field === 'customName') {
    it.name = el.value;
  } else if (field === 'price') {
    it.price = parseFloat(el.value) || 0;
  } else if (field === 'qty') {
    it.qty = Math.max(1, parseInt(el.value) || 1);
  }
  recalcDeductSummary();
}
function recalcDeductSummary() {
  let original = 0;
  State.currentDeductItems.forEach(it => {
    original += (it.price||0) * (it.qty||1);
  });
  const c = getCurrentDeductCustomer();
  // 黄金会员动态折扣：首次9折，后续95折
  const discRate = c ? _getEffectiveDiscountRate(c.level, c.id) : 1.0;
  const discName = c && normalizeMemberLevel(c.level) === 'gold' ? '黄金会员' : getMemberDiscount(c?.level || '').name;
  const discount = c ? discRate : 1.0;
  const discountAmt = original * (1 - discount);
  const final = Math.round(original * discount * 100) / 100;
  const after = (c?.balance || 0) - final;

  document.getElementById('dc_original').textContent = fmtMoney(original);
  document.getElementById('dc_total').textContent = fmtMoney(final);
  document.getElementById('dc_afterBalance').textContent = fmtMoney(Math.max(0, after));

  const row = document.getElementById('dc_discountRow');
  if (discount < 1) {
    row.style.display = 'flex';
    const isFirst = c && normalizeMemberLevel(c.level) === 'gold' && discount === 0.90;
    document.getElementById('dc_discountLabel').textContent = `${discName} · ${Math.round(discount*100)}折${isFirst ? '（首次）' : ''}`;
    document.getElementById('dc_discount').textContent = '- ' + fmtMoney(Math.round(discountAmt*100)/100);
  } else {
    row.style.display = 'none';
  }

  // 重新渲染每行小计
  const sumSpans = document.querySelectorAll('#deductItems .di-sum');
  sumSpans.forEach((span, i) => {
    const it = State.currentDeductItems[i];
    if (it) span.textContent = fmtMoney((it.price||0)*(it.qty||1));
  });
}
function confirmDeduct() {
  const cid = (document.getElementById('dc_member')?.value || window._currentDeductCustomerId || '').trim();
  if (!cid) { toast('请选择会员', 'error'); return; }
  const c = customerById(cid);
  if (!c) { toast('会员不存在', 'error'); return; }
  // 黄金会员是年卡折扣权益制，无储值无扣卡，消费通过预约完成收款来记录
  if (c.level === 'gold') {
    toast('黄金会员是年卡折扣权益制，无储值余额，不需扣卡。\n消费请通过预约 → 完成收款来记录，享受首次9折/后续95折优惠。', 'error');
    return;
  }
  const items = State.currentDeductItems.filter(it => it.name && it.price >= 0);
  if (items.length === 0) { toast('请至少添加一项服务项目', 'error'); return; }
  if (items.some(it => !it.name)) { toast('请完善所有项目名称', 'error'); return; }

  // 计算最终金额（黄金会员动态折扣：首次9折，后续95折）
  let original = 0;
  items.forEach(it => original += (it.price||0)*(it.qty||1));
  const discount = _getEffectiveDiscountRate(c.level, cid);
  const final = Math.round(original * discount * 100) / 100;

  if (c.level !== 'gold' && (c.balance||0) < final) {
    toast(`余额不足：当前 ${fmtMoney(c.balance||0)}，需 ${fmtMoney(final)}`, 'error');
    return;
  }

  // 扣余额
  const newBalance = c.level === 'gold' ? 0 : (c.balance - final);
  if (c.level !== 'gold') c.balance = newBalance;
  // 更新顾客到店次数 & 累计消费 & 最近到店
  c.visits = (c.visits || 0) + 1;
  c.totalPaid = (c.totalPaid || 0) + final;
  c.lastVisit = todayDateStr();
  if (!c.firstVisit) c.firstVisit = todayDateStr();

  const date = document.getElementById('dc_date').value || todayDateStr();
  const remark = document.getElementById('dc_remark').value.trim();
  const apptId = document.getElementById('dc_appt').value;

  // 保存交易
  const newTxnId = genId('T');
  State.memberTxns.unshift({
    id: newTxnId, cid, type: 'deduct', subtype: '服务扣款',
    amount: final, payMethod: 'balance', date, remark: remark,
    items: items.map(it => ({ name: it.name, qty: it.qty, price: it.price })),
    balanceAfter: newBalance,
    apptId: apptId || ''
  });
  // 统一按有效流水重算余额，确保扣卡后余额与流水一致
  try { _recalcMemberBalance(cid); } catch(e) {}

  // ⚠️「已完成」已移除：关联预约更新为已确认 + 实付金额 + 反向写入扣卡ID
  if (apptId) {
    const a = activeRows(State.appointments).find(x => x.id === apptId);
    if (a) {
      a.status = 'confirmed';
      a.finalTotal = final;
      a.originalTotal = original;
      a.deductId = newTxnId;
      a.linkedMemberTxnId = newTxnId;
      a._memberDeductAlreadyCounted = true;
      touchRecord(a);
    }
  }

  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  save('appointments', State.appointments);
  addAuditLog('会员扣卡', `${c.name || '会员'} · ${fmtMoney(final)} · ${items.map(i => i.name).join('、')}${apptId ? ' · 关联预约 ' + apptId : ''}`, newTxnId, { amount: final, cid, apptId });
  closeDeductModal();
  // 扣卡完成后强制刷新会员页相关列表，避免当前筛选/分页导致新记录看起来“没更新”
  try { State.currentMemberLevel = 'all'; } catch(e) {}
  try { const f = document.getElementById('mbTxnFilter'); if (f) f.value = 'all'; } catch(e) {}
  try { const s = document.getElementById('deductSearch'); if (s) s.value = ''; } catch(e) {}
  try { const f = document.getElementById('deductFrom'); if (f) f.value = ''; } catch(e) {}
  try { const t = document.getElementById('deductTo'); if (t) t.value = ''; } catch(e) {}
  try { const lv = document.getElementById('deductLevelFilter'); if (lv) lv.value = 'all'; } catch(e) {}
  try { const only = document.getElementById('deductOnlyUnlinked'); if (only) only.checked = false; } catch(e) {}
  try { _deductPageState.page = 1; } catch(e) {}
  refreshAllCustomerViews();
  try { renderLevelCounts(); } catch(e) {}
  try { renderMemberList(); } catch(e) {}
  try { renderMemberTxnList(); } catch(e) {}
  try { renderRechargeRecordsPage(); } catch(e) {}
  try { renderDeductRecordsPage(); } catch(e) {}
  try { renderApptTable(); } catch(e) {}
  toast(`扣款成功：${fmtMoney(final)}`, 'success');
}

/* ============================================================
   8.5 扣卡记录档案：列表 / 详情 / 编辑 / 关联预约 / 删除
   ============================================================ */
// 分页状态
let _deductPageState = { page: 1, pageSize: 15 };

function _isDeletedMemberTxn(t) {
  return !!(t && (t._deleted === true || t._deleted === 'true' || t.deletedAt || t._deletedAt));
}

function _deletedMemberTxnIdSet() {
  const ids = new Set();
  (State.memberTxns || []).forEach(t => {
    if (t && t.id && _isDeletedMemberTxn(t)) ids.add(t.id);
  });
  return ids;
}

function _shouldShowDeductArchiveTxn(t, deletedIds) {
  if (!t || t.type !== 'deduct') return false;
  if (_isDeletedMemberTxn(t)) return false;
  if (t.id && deletedIds && deletedIds.has(t.id)) return false;
  if (t._hiddenFromDeductArchive || t._auditOnly) return false;
  if (t._reversed) return false;
  if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return false;
  return true;
}

// ------- 列表渲染：筛选 + 分页 + 汇总 -------
function renderDeductRecordsPage() {
  const listEl = document.getElementById('deductRecordsList');
  const pagerEl = document.getElementById('deductPager');
  if (!listEl) return;

  // 1. 读取筛选条件
  const q = (document.getElementById('deductSearch')?.value || '').trim().toLowerCase();
  const from = document.getElementById('deductFrom')?.value || '';
  const to = document.getElementById('deductTo')?.value || '';
  const lv = document.getElementById('deductLevelFilter')?.value || 'all';
  const onlyUnlinked = document.getElementById('deductOnlyUnlinked')?.checked || false;

  // 2. 过滤（只取有效扣卡；兼容云端/多标签合并产生的同 ID 旧版本）
  const deletedIds = _deletedMemberTxnIdSet();
  let list = State.memberTxns.filter(t => _shouldShowDeductArchiveTxn(t, deletedIds));
  list = list.filter(t => {
    const c = customerById(t.cid);
    // 会员等级筛选
    if (lv !== 'all' && (!c || c.level !== lv)) return false;
    // 仅未关联
    if (onlyUnlinked && t.apptId) return false;
    // 搜索：姓名 / 项目名 / 备注
    if (q) {
      const name = (c?.name || '').toLowerCase();
      const itemsStr = (t.items || []).map(i => (i.name||'').toLowerCase()).join(',');
      const remark = (t.remark || '').toLowerCase();
      if (!name.includes(q) && !itemsStr.includes(q) && !remark.includes(q)) return false;
    }
    // 日期范围
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  });
  // 按日期倒序
  list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));

  // 3. 汇总卡片
  const total = list.reduce((s, t) => s + (+t.amount || 0), 0);
  const linked = list.filter(t => t.apptId).length;
  const avg = list.length ? (total / list.length) : 0;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('dscCount', list.length);
  setText('dscTotal', fmtMoney(total));
  setText('dscLinked', linked);
  setText('dscAvg', fmtMoney(avg));

  // 4. 分页
  let { page, pageSize } = _deductPageState;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (_deductPageState.page > totalPages) _deductPageState.page = page = totalPages;
  const start = (page - 1) * pageSize;
  const pageList = list.slice(start, start + pageSize);

  // 5. 渲染列表
  if (pageList.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;color:var(--muted);padding:50px 20px;line-height:1.8;">
      暂无扣卡记录，去会员操作里做一笔扣卡试试 💅</div>`;
  } else {
    listEl.innerHTML = pageList.map(t => {
      const c = customerById(t.cid);
      const mem = memberLabel(c?.level || '');
      const items = t.items || [];
      const itemsPreview = items.slice(0, 3).map(i => i.name).join('、') + (items.length > 3 ? '...' : '');
      const appt = t.apptId ? activeRows(State.appointments).find(a => a.id === t.apptId) : null;
      const linkBadge = t._auditOnly
        ? `<span class="link-badge unlinked">↩ 撤销冲正</span>`
        : appt
        ? `<span class="link-badge linked"><span class="lb-icon">🔗</span> 已关联 · ${escapeHtml(_apptDateTimeLabel(appt))}</span>`
        : `<span class="link-badge unlinked">⏳ 待关联</span>`;
      const amt = Number(t.amount) || 0;
      const amountHtml = amt < 0
        ? `<div class="drc-amount" style="color:var(--success);">退回 ${fmtMoney(Math.abs(amt))}</div>`
        : `<div class="drc-amount">- ${fmtMoney(amt)}</div>`;
      return `<div class="deduct-record-card" onclick="openDeductDetailModal('${t.id}')">
        <div class="drc-left">
          <div class="drc-date-bar">
            <div class="drc-month">${(t.date||'').slice(5,7)||''}月</div>
            <div class="drc-day">${(t.date||'').slice(8,10)||''}</div>
          </div>
          <div class="drc-cust">
            <div class="drc-name">${escapeHtml(c?.name || '未知客户')}</div>
            <span class="${mem.cls}">${mem.tag}</span>
          </div>
        </div>
        <div class="drc-mid">
          <div class="drc-items">${escapeHtml(itemsPreview) || '（无项目明细）'}</div>
          <div class="drc-remark">${escapeHtml(t.remark || '')}</div>
        </div>
        <div class="drc-right">
          ${amountHtml}
          ${linkBadge}
          <button class="btn-ghost xsmall" onclick="event.stopPropagation();openDeductDetailModal('${t.id}')">查看详情</button>
        </div>
      </div>`;
    }).join('');
  }

  // 6. 分页器
  if (totalPages <= 1) {
    pagerEl.innerHTML = '';
  } else {
    let pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    pagerEl.innerHTML = `<div class="pager">
      <button class="pg-btn" ${page<=1?'disabled':''} onclick="deductGoPage(${page-1})">‹ 上一页</button>
      ${pages.map(p => p === '...'
        ? `<span class="pg-ellipsis">...</span>`
        : `<button class="pg-btn ${p===page?'active':''}" onclick="deductGoPage(${p})">${p}</button>`
      ).join('')}
      <button class="pg-btn" ${page>=totalPages?'disabled':''} onclick="deductGoPage(${page+1})">下一页 ›</button>
      <span class="pg-total">共 ${list.length} 条 / ${totalPages} 页</span>
    </div>`;
  }
}
function deductGoPage(p) { _deductPageState.page = p; renderDeductRecordsPage(); }
function filterDeductByCustomer(cid) {
  const c = customerById(cid);
  if (!c) return;
  // 重置筛选 + 填入姓名
  const s = document.getElementById('deductSearch'); if (s) s.value = c.name || '';
  const f = document.getElementById('deductFrom'); if (f) f.value = '';
  const t = document.getElementById('deductTo'); if (t) t.value = '';
  const lv = document.getElementById('deductLevelFilter'); if (lv) lv.value = 'all';
  const ul = document.getElementById('deductOnlyUnlinked'); if (ul) ul.checked = false;
  _deductPageState.page = 1;
  // 滚动到扣卡档案区域
  const block = document.getElementById('deductArchiveBlock');
  if (block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderDeductRecordsPage();
}

// ------- 详情弹窗：填充 + 显示/关闭 -------
function openDeductDetailModal(txnId) {
  const txn = activeRows(State.memberTxns).find(t => t.id === txnId);
  if (!txn) { toast('扣卡记录不存在', 'error'); return; }
  if (_isDeletedMemberTxn(txn) || _deletedMemberTxnIdSet().has(txnId)) {
    toast('该扣卡记录已删除', 'error');
    renderDeductRecordsPage();
    return;
  }
  window._currentDeductTxnId = txnId;

  const c = customerById(txn.cid);
  const mem = memberLabel(c?.level || '');
  const items = txn.items || [];
  const subTotal = items.reduce((s, i) => s + ((+i.qty||0)*(+i.price||0)), 0);
  const discount = subTotal - (+txn.amount || 0);
  const editMemberOptions = activeRows(State.customers)
    .filter(x => x.level && x.level !== '')
    .map(x => {
      const ml = memberLabel(x.level);
      const bal = x.level === 'gold' ? '年卡制' : `余额 ${fmtMoney(x.balance || 0)}`;
      return `<option value="${escapeHtml(x.id)}" ${x.id === txn.cid ? 'selected' : ''}>${escapeHtml(x.name || '未命名')} · ${escapeHtml(ml.tag || ml.label || '会员')} · ${escapeHtml(bal)}</option>`;
    }).join('');

  const appt = txn.apptId ? activeRows(State.appointments).find(a => a.id === txn.apptId) : null;
  const apptBlock = appt ? `
    <div class="detail-appt-card linked">
      <div class="dac-icon">🔗</div>
      <div class="dac-info">
        <div class="dac-title">已关联预约 · ${escapeHtml(_apptDateTimeLabel(appt))}</div>
        <div class="dac-meta">服务：${escapeHtml(apptTypeLabel(appt))} · 状态：${escapeHtml(statusLabel(normalizeApptStatus(appt.status)))}</div>
      </div>
      <button class="btn-ghost xsmall" onclick="unlinkApptFromDeduct('${txnId}')">取消关联</button>
    </div>` : `
    <div class="detail-appt-card unlinked">
      <div class="dac-icon" style="color:var(--warning);">⏳</div>
      <div class="dac-info">
        <div class="dac-title">未关联任何预约</div>
        <div class="dac-meta">点击下方关联按钮，可绑定到该顾客的预约记录</div>
      </div>
      <button class="btn-secondary xsmall" onclick="_pickApptForDeduct('${txnId}')">关联预约</button>
    </div>`;

  // 该顾客的预约选项（供关联下拉）
  const custAppts = activeRows(State.appointments)
    .filter(a => {
      if (a.customerId === txn.cid) return true;
      if (c?.phone && a.phone === c.phone) return true;
      return c?.name && _normStr(a.customer) === _normStr(c.name);
    })
    .sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''));
  const apptOpts = custAppts.length
    ? custAppts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(_apptDisplayLabel(a))}</option>`).join('')
    : `<option value="">该顾客暂无预约记录</option>`;

  // 项目明细表格
  const itemsTable = `
    <table class="data-table" style="margin-top:8px;">
      <thead><tr><th>项目名称</th><th style="width:90px;">数量</th><th style="width:110px;">单价</th><th style="width:120px;">小计</th></tr></thead>
      <tbody>
        ${items.map((i, idx) => `<tr>
          <td>${escapeHtml(i.name)}</td>
          <td>${i.qty}</td>
          <td>${fmtMoney(i.price)}</td>
          <td style="font-weight:600;">${fmtMoney((+i.qty||0)*(+i.price||0))}</td>
        </tr>`).join('')}
        <tr style="background:var(--bg4);font-weight:600;">
          <td colspan="3" style="text-align:right;">项目合计</td>
          <td>${fmtMoney(subTotal)}</td>
        </tr>
        ${discount > 0.001 ? `<tr style="color:var(--success);">
          <td colspan="3" style="text-align:right;">折扣金额</td>
          <td>- ${fmtMoney(discount)}</td>
        </tr>` : ''}
        <tr style="background:var(--accent-4);font-weight:700;color:var(--accent);">
          <td colspan="3" style="text-align:right;">实付扣款</td>
          <td>${fmtMoney(txn.amount)}</td>
        </tr>
      </tbody>
    </table>`;

  // 编辑区（默认折叠）
  const editArea = `
    <div class="deduct-edit-area" id="deductEditArea" style="display:none;margin-top:18px;">
      <div style="color:var(--danger);font-size:12px;font-weight:600;margin-bottom:10px;padding:6px 10px;background:var(--danger-bg);border-radius:6px;">
        ⚠️ 修改金额会影响会员余额和扣后余额，请谨慎操作
      </div>
      <div class="form-grid">
        <div class="form-item full">
          <label>扣卡会员</label>
          <select class="form-input" id="dc_edit_member" onchange="_recalcDeductEditTotal()">
            ${editMemberOptions}
          </select>
        </div>
        <div class="form-item">
          <label>扣卡日期</label>
          <input type="date" class="form-input" id="dc_edit_date" value="${txn.date||''}">
        </div>
        <div class="form-item">
          <label>操作人 / 来源</label>
          <input type="text" class="form-input" id="dc_edit_operator" value="${escapeHtml(txn.operator||'前台')}">
        </div>
        <div class="form-item">
          <label>支付方式</label>
          <select class="form-input" id="dc_edit_payMethod">
            <option value="balance" ${(txn.payMethod||'balance')==='balance'?'selected':''}>储值卡扣款</option>
            <option value="wechat" ${txn.payMethod==='wechat'?'selected':''}>微信</option>
            <option value="alipay" ${txn.payMethod==='alipay'?'selected':''}>支付宝</option>
            <option value="cash" ${txn.payMethod==='cash'?'selected':''}>现金</option>
            <option value="card" ${txn.payMethod==='card'?'selected':''}>银行卡</option>
          </select>
        </div>
        <div class="form-item full">
          <label>备注</label>
          <textarea class="form-input" rows="2" id="dc_edit_remark" placeholder="服务细节、美甲师等">${escapeHtml(txn.remark||'')}</textarea>
        </div>
      </div>
      <div class="subsection">
        <div class="subsection-head">
          <h4>📝 项目明细（可增减行）</h4>
          <button class="btn-ghost xsmall" type="button" onclick="_addDeductEditItem()">+ 添加一项</button>
        </div>
        <table class="data-table" id="dc_edit_itemsTable">
          <thead><tr><th>项目名称（同步服务定价）</th><th style="width:100px;">数量</th><th style="width:120px;">单价</th><th style="width:110px;">小计</th><th style="width:70px;">操作</th></tr></thead>
          <tbody id="dc_edit_itemsBody">
            ${items.map((i, idx) => _deductEditRowHtml(idx, i.name, i.qty, i.price)).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:14px;text-align:right;">
        <span style="margin-right:14px;">项目原价：<b id="dc_edit_original">${fmtMoney(subTotal)}</b></span>
        <span style="margin-right:14px;">会员折扣：<b id="dc_edit_discount" style="color:var(--success);">- ${fmtMoney(Math.max(0, discount))}</b></span>
        <span style="margin-right:14px;">修改后扣款：<b id="dc_edit_total" style="color:var(--accent);font-size:16px;">${fmtMoney(txn.amount)}</b></span>
        <button class="btn-ghost" onclick="toggleDeductEditArea(true)" style="margin-right:8px;">取消编辑</button>
        <button class="btn-primary" onclick="saveDeductEdits('${txnId}')">💾 保存修改</button>
      </div>
    </div>`;

  // 关联预约选择器（默认隐藏，点击关联时显示）
  const pickerLayer = `
    <div class="appt-picker-layer" id="apptPickerLayer" style="display:none;">
      <div class="aplk-mask" onclick="document.getElementById('apptPickerLayer').style.display='none'"></div>
      <div class="aplk-panel">
        <h4>🔗 选择要关联的预约</h4>
        <div style="margin:12px 0;">
          <select class="form-input" id="dc_detail_apptSel">${apptOpts}</select>
        </div>
        <div style="text-align:right;display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-ghost" onclick="document.getElementById('apptPickerLayer').style.display='none'">取消</button>
          <button class="btn-primary" onclick="_confirmLinkAppt('${txnId}')">确认关联</button>
        </div>
      </div>
    </div>`;

  // 基本信息左右两列
  const body = document.getElementById('deductDetailBody');
  body.innerHTML = `
    <div class="deduct-detail-info">
      <div class="ddi-col">
        <div class="ddi-row"><span class="ddi-label">顾客姓名</span><span class="ddi-value"><b>${escapeHtml(c?.name||'未知')}</b> <span class="${mem.cls}" style="margin-left:6px;">${mem.tag}</span></span></div>
        <div class="ddi-row"><span class="ddi-label">扣卡日期</span><span class="ddi-value">${txn.date||''}</span></div>
        <div class="ddi-row"><span class="ddi-label">操作人</span><span class="ddi-value">${escapeHtml(txn.operator||'前台')}</span></div>
        <div class="ddi-row"><span class="ddi-label">记录编号</span><span class="ddi-value" style="font-family:monospace;color:var(--muted);">${txn.id}</span></div>
      </div>
      <div class="ddi-col">
        <div class="ddi-row"><span class="ddi-label">扣卡前余额</span><span class="ddi-value">${fmtMoney((+txn.balanceAfter||0) + (+txn.amount||0))}</span></div>
        <div class="ddi-row"><span class="ddi-label">${(+txn.amount||0) < 0 ? '退回金额' : '扣卡金额'}</span><span class="ddi-value" style="color:${(+txn.amount||0) < 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700;">${(+txn.amount||0) < 0 ? '退回 ' + fmtMoney(Math.abs(+txn.amount||0)) : '- ' + fmtMoney(txn.amount)}</span></div>
        <div class="ddi-row"><span class="ddi-label">扣卡后余额</span><span class="ddi-value" style="color:var(--accent);font-weight:700;">${fmtMoney(txn.balanceAfter||0)}</span></div>
        <div class="ddi-row"><span class="ddi-label">支付方式</span><span class="ddi-value">${txn.payMethod==='balance'?'储值卡扣款':(txn.payMethod||'—')}</span></div>
      </div>
    </div>

    <div class="subsection" style="margin-top:16px;">
      <div class="subsection-head"><h4>🔗 当前关联预约</h4></div>
      ${apptBlock}
    </div>

    <div class="subsection" style="margin-top:16px;">
      <div class="subsection-head"><h4>💰 项目明细</h4></div>
      ${itemsTable}
    </div>

    ${txn.remark ? `<div class="ddi-remark" style="margin-top:14px;padding:10px 14px;background:var(--bg4);border-radius:8px;"><b>备注：</b>${escapeHtml(txn.remark)}</div>` : ''}

    ${editArea}
    ${pickerLayer}
  `;

  // 更新底部按钮文案
  const linkBtn = document.getElementById('dc_detail_linkBtn');
  if (linkBtn) {
    if (appt) {
      linkBtn.textContent = '🔗 更换关联预约';
      linkBtn.className = 'btn-secondary';
    } else {
      linkBtn.textContent = '🔗 关联预约';
      linkBtn.className = 'btn-secondary';
    }
  }

  // 软删除记录禁止编辑/删除
  const delBtn = document.getElementById('dc_detail_deleteBtn');
  const editBtn = document.getElementById('dc_detail_editToggleBtn');
  if (_isDeletedMemberTxn(txn)) {
    if (delBtn) delBtn.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
    if (linkBtn) linkBtn.style.display = 'none';
  } else {
    if (delBtn) delBtn.style.display = '';
    if (editBtn) editBtn.style.display = '';
    if (linkBtn) linkBtn.style.display = '';
  }

  document.getElementById('deductDetailModal').classList.add('show');
}
function closeDeductDetailModal() {
  document.getElementById('deductDetailModal')?.classList.remove('show');
  window._currentDeductTxnId = null;
}

// ------- 编辑区：切换 + 动态行 + 保存 -------
function toggleDeductEditArea(forceClose) {
  const area = document.getElementById('deductEditArea');
  if (!area) return;
  if (forceClose || area.style.display !== 'none') {
    area.style.display = 'none';
  } else {
    area.style.display = '';
    _recalcDeductEditTotal();
  }
}
function _deductEditProjectOptions(selectedName) {
  const groups = [
    ['款式', 'style'],
    ['甲片', 'tip'],
    ['卸甲', 'removeNail'],
    ['美睫', 'lash'],
    ['卸睫', 'removeLash']
  ];
  let found = false;
  const html = groups.map(([label, group]) => {
    const opts = (State.prices?.[group] || []).filter(p => p && typeof p === 'object').map(p => {
      const sel = String(p.name || '') === String(selectedName || '');
      if (sel) found = true;
      return `<option value="${escapeHtml(p.name || '')}" data-price="${Number(p.price)||0}" ${sel ? 'selected' : ''}>${escapeHtml(p.name || '')}</option>`;
    }).join('');
    return opts ? `<optgroup label="${label}">${opts}</optgroup>` : '';
  }).join('');
  const customSelected = selectedName && !found;
  return `<option value="" ${!selectedName ? 'selected' : ''}>— 选择项目 —</option>${html}<option value="__custom__" ${customSelected ? 'selected' : ''}>✏️ 自定义项目</option>`;
}
function _onDeductEditProjectChange(sel) {
  const tr = sel.closest('tr');
  if (!tr) return;
  const custom = tr.querySelector('.dc-edit-custom-name');
  const priceInput = tr.querySelector('.dc-edit-price');
  if (sel.value === '__custom__') {
    if (custom) custom.style.display = '';
  } else {
    if (custom) { custom.style.display = 'none'; custom.value = ''; }
    const opt = sel.selectedOptions?.[0];
    if (priceInput && opt && opt.dataset.price != null) priceInput.value = Number(opt.dataset.price || 0).toFixed(2);
  }
  _recalcDeductEditTotal();
}
function _deductEditRowHtml(idx, name='', qty=1, price=0) {
  const known = PRICE_GROUP_ORDER.some(g => (State.prices?.[g] || []).some(p => p && p.name === name));
  const showCustom = name && !known;
  return `<tr data-idx="${idx}">
    <td>
      <select class="form-input dc-edit-name-select" onchange="_onDeductEditProjectChange(this)">
        ${_deductEditProjectOptions(name)}
      </select>
      <input type="text" class="form-input dc-edit-custom-name" placeholder="输入自定义项目名" value="${showCustom ? escapeHtml(name) : ''}" style="margin-top:6px;${showCustom ? '' : 'display:none;'}" oninput="_recalcDeductEditTotal()">
    </td>
    <td><input type="number" min="1" step="1" value="${qty}" class="form-input dc-edit-qty" oninput="_recalcDeductEditTotal()"></td>
    <td><input type="number" min="0" step="0.01" value="${Number(price||0).toFixed(2)}" class="form-input dc-edit-price" oninput="_recalcDeductEditTotal()"></td>
    <td class="dc-edit-sub" style="font-weight:600;">${fmtMoney((+qty||0)*(+price||0))}</td>
    <td><button class="btn-ghost xsmall" type="button" onclick="_removeDeductEditItem(this)">删除</button></td>
  </tr>`;
}
function _addDeductEditItem() {
  const body = document.getElementById('dc_edit_itemsBody');
  if (!body) return;
  const idx = body.children.length;
  body.insertAdjacentHTML('beforeend', _deductEditRowHtml(idx, '', 1, 0));
  _recalcDeductEditTotal();
}
function _removeDeductEditItem(btn) {
  const tr = btn.closest('tr');
  tr?.remove();
  _recalcDeductEditTotal();
}
function _recalcDeductEditTotal() {
  const body = document.getElementById('dc_edit_itemsBody');
  const totalEl = document.getElementById('dc_edit_total');
  const originalEl = document.getElementById('dc_edit_original');
  const discountEl = document.getElementById('dc_edit_discount');
  if (!body || !totalEl) return;
  let original = 0;
  body.querySelectorAll('tr').forEach(tr => {
    const qty = +tr.querySelector('.dc-edit-qty')?.value || 0;
    const price = +tr.querySelector('.dc-edit-price')?.value || 0;
    const sub = qty * price;
    original += sub;
    const subEl = tr.querySelector('.dc-edit-sub');
    if (subEl) subEl.textContent = fmtMoney(sub);
  });
  const cid = document.getElementById('dc_edit_member')?.value || '';
  const c = customerById(cid);
  const discRate = _getEffectiveDiscountRate(c?.level || '', c?.id || '');
  const discInfo = getMemberDiscount(c?.level || '');
  const final = Math.round(original * discRate * 100) / 100;
  const discountAmt = Math.max(0, Math.round((original - final) * 100) / 100);
  if (originalEl) originalEl.textContent = fmtMoney(original);
  if (discountEl) discountEl.textContent = '- ' + fmtMoney(discountAmt);
  totalEl.textContent = fmtMoney(final);
}
function saveDeductEdits(txnId) {
  const txn = activeRows(State.memberTxns).find(t => t.id === txnId);
  if (!txn) { toast('扣卡记录不存在', 'error'); return; }
  const oldCustomer = customerById(txn.cid);
  if (!oldCustomer) { toast('原顾客不存在', 'error'); return; }

  // 取编辑数据
  const newCid = document.getElementById('dc_edit_member')?.value || txn.cid;
  const newCustomer = customerById(newCid);
  if (!newCustomer) { toast('请选择有效会员', 'error'); return; }
  const newDate = document.getElementById('dc_edit_date')?.value || txn.date;
  const newRemark = document.getElementById('dc_edit_remark')?.value?.trim() || '';
  const newOperator = document.getElementById('dc_edit_operator')?.value?.trim() || txn.operator || '前台';
  const newPayMethod = document.getElementById('dc_edit_payMethod')?.value || txn.payMethod || 'balance';
  const body = document.getElementById('dc_edit_itemsBody');
  const newItems = [];
  if (body) {
    body.querySelectorAll('tr').forEach(tr => {
      const sel = tr.querySelector('.dc-edit-name-select');
      const custom = tr.querySelector('.dc-edit-custom-name');
      const name = ((sel?.value === '__custom__' ? custom?.value : sel?.value) || '').trim();
      const qty = +tr.querySelector('.dc-edit-qty')?.value || 0;
      const price = +tr.querySelector('.dc-edit-price')?.value || 0;
      if (!name || qty <= 0) return;
      newItems.push({ name, qty, price });
    });
  }
  if (newItems.length === 0) { toast('至少保留一项项目', 'error'); return; }

  const oldAmount = Math.round((+txn.amount || 0) * 100) / 100;
  const originalTotal = newItems.reduce((s, i) => s + i.qty * i.price, 0);
  const discRate = _getEffectiveDiscountRate(newCustomer.level, newCustomer.id);
  const disc = getMemberDiscount(newCustomer.level);
  const newAmount = Math.round(originalTotal * discRate * 100) / 100;

  // 余额检查：先撤回旧扣款，再应用新扣款
  const simulatedBalances = new Map();
  activeRows(State.customers).forEach(x => simulatedBalances.set(x.id, Number(x.balance) || 0));
  if (oldCustomer.level !== 'gold') simulatedBalances.set(oldCustomer.id, (simulatedBalances.get(oldCustomer.id) || 0) + oldAmount);
  if (newCustomer.level !== 'gold') {
    const afterNew = (simulatedBalances.get(newCustomer.id) || 0) - newAmount;
    if (afterNew < -0.001) {
      toast(`余额不足：按${disc.name}折后需 ${fmtMoney(newAmount)}，当前可用 ${fmtMoney(simulatedBalances.get(newCustomer.id) || 0)}`, 'error');
      return;
    }
  }

  if (!confirm(`确认保存扣卡记录修改？\n\n原会员：${oldCustomer.name || ''}\n新会员：${newCustomer.name || ''}\n项目原价：${fmtMoney(originalTotal)}\n会员折扣：${disc.name} · ${Math.round(discRate * 100)}折\n原扣款：${fmtMoney(oldAmount)}\n新扣款：${fmtMoney(newAmount)}\n\n系统会先撤回旧扣款，再按新会员和折扣重新扣卡。`)) return;

  // 先撤回旧扣款影响
  if (oldCustomer.level !== 'gold') oldCustomer.balance = Math.round(((Number(oldCustomer.balance) || 0) + oldAmount) * 100) / 100;
  oldCustomer.totalPaid = Math.max(0, Math.round(((Number(oldCustomer.totalPaid) || 0) - oldAmount) * 100) / 100);

  // 再应用新扣款影响
  if (newCustomer.level !== 'gold') newCustomer.balance = Math.round(((Number(newCustomer.balance) || 0) - newAmount) * 100) / 100;
  newCustomer.totalPaid = Math.round(((Number(newCustomer.totalPaid) || 0) + newAmount) * 100) / 100;
  if (newDate) newCustomer.lastVisit = newDate;

  // 更换顾客时调整到店次数：旧顾客 -1，新顾客 +1
  if (oldCustomer.id !== newCustomer.id) {
    oldCustomer.visits = Math.max(0, (Number(oldCustomer.visits) || 0) - 1);
    newCustomer.visits = (Number(newCustomer.visits) || 0) + 1;
    if (!newCustomer.firstVisit || newCustomer.firstVisit > newDate) newCustomer.firstVisit = newDate;
  }

  // 更新记录
  txn.cid = newCid;
  txn.items = newItems;
  txn.amount = newAmount;
  txn.date = newDate;
  txn.remark = newRemark;
  txn.operator = newOperator;
  txn.payMethod = newPayMethod;
  txn.balanceAfter = newCustomer.level === 'gold' ? 0 : (Number(newCustomer.balance) || 0);
  txn.discountName = disc.name;
  txn.discountRate = discRate;
  touchRecord(txn);
  touchRecord(oldCustomer);
  touchRecord(newCustomer);

  // 若关联了预约，同步 finalTotal
  if (txn.apptId) {
    const a = activeRows(State.appointments).find(x => x.id === txn.apptId);
    if (a) {
      a.customerId = newCustomer.id;
      a.customer = newCustomer.name || a.customer;
      a.phone = newCustomer.phone || a.phone;
      a.member = newCustomer.level || '';
      a.finalTotal = newAmount;
      a.deductAmount = newAmount;
      touchRecord(a);
    }
  }

  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  save('appointments', State.appointments);
  toast('修改已保存', 'success');
  toggleDeductEditArea(true);
  openDeductDetailModal(txnId); // 重新渲染
  refreshAllCustomerViews();
  renderMemberTxnList();
  renderDeductRecordsPage();
}

// ------- 关联 / 取消关联 预约 -------
function linkApptToDeduct(txnId, apptId) {
  const txn = activeRows(State.memberTxns).find(t => t.id === txnId);
  const a = activeRows(State.appointments).find(x => x.id === apptId);
  if (!txn || !a) { toast('记录或预约不存在', 'error'); return; }
  // 如果该扣卡之前关联了别的预约，先取消
  if (txn.apptId && txn.apptId !== apptId) {
    const oldA = activeRows(State.appointments).find(x => x.id === txn.apptId);
    // ⚠️「已完成」已移除：取消关联时统一回到 pending
    if (oldA) {
      oldA.deductId = '';
      oldA.linkedMemberTxnId = '';
      oldA._memberDeductAlreadyCounted = false;
      oldA.status = 'pending';
      touchRecord(oldA);
    }
  }
  if (a.deductId && a.deductId !== txnId) {
    const oldTxn = State.memberTxns.find(t => t.id === a.deductId);
    if (oldTxn && oldTxn.apptId === a.id) {
      oldTxn.apptId = '';
      touchRecord(oldTxn);
    }
  }
  txn.apptId = apptId;
  a.deductId = txnId;
  a.linkedMemberTxnId = txnId;
  a._memberDeductAlreadyCounted = true;
  a.status = 'confirmed';
  a.finalTotal = +txn.amount || 0;
  a.deductAmount = +txn.amount || 0;
  const c = customerById(txn.cid);
  if (c) {
    a.customerId = c.id;
    a.customer = c.name || a.customer;
    a.phone = c.phone || a.phone;
    a.member = c.level || a.member || '';
  }
  touchRecord(txn); touchRecord(a);
  save('memberTxns', State.memberTxns);
  save('appointments', State.appointments);
  toast('关联成功', 'success');
  openDeductDetailModal(txnId);
  renderDeductRecordsPage();
  renderApptTable();
}
function unlinkApptFromDeduct(txnId) {
  const txn = activeRows(State.memberTxns).find(t => t.id === txnId);
  if (!txn || !txn.apptId) return;
  const a = activeRows(State.appointments).find(x => x.id === txn.apptId);
  if (!confirm('确定取消关联？预约状态将改回「待处理」')) return;
  if (a) {
    a.deductId = '';
    a.linkedMemberTxnId = '';
    a._memberDeductAlreadyCounted = false;
    // ⚠️「已完成」已移除：取消关联时统一回到 pending
    a.status = 'pending';
    touchRecord(a);
  }
  txn.apptId = '';
  touchRecord(txn);
  save('memberTxns', State.memberTxns);
  save('appointments', State.appointments);
  toast('已取消关联', 'success');
  openDeductDetailModal(txnId);
  renderDeductRecordsPage();
  renderApptTable();
}
function _pickApptForDeduct(txnId) {
  const layer = document.getElementById('apptPickerLayer');
  if (!layer) return;
  layer.style.display = '';
}
function _confirmLinkAppt(txnId) {
  const sel = document.getElementById('dc_detail_apptSel');
  const apptId = sel?.value;
  if (!apptId) { toast('请选择预约', 'error'); return; }
  document.getElementById('apptPickerLayer').style.display = 'none';
  linkApptToDeduct(txnId, apptId);
}

// ------- 删除扣卡记录（软删除 + 反向冲正交易） -------
function deleteDeductRecord(txnId) {
  const txn = activeRows(State.memberTxns).find(t => t.id === txnId);
  if (!txn) { toast('扣卡记录不存在', 'error'); return; }
  const c = customerById(txn.cid);
  if (!confirm(`【危险操作】确定删除此扣卡记录？\n\n金额：${fmtMoney(txn.amount)}\n顾客：${c?.name||''}\n日期：${txn.date||''}\n\n将执行：\n• 写一条反向冲正交易（金额 ${fmtMoney(-(+txn.amount||0))}）\n• 会员余额 += ${fmtMoney(txn.amount)}\n• 关联的预约改回「待处理」\n• 累计消费回退\n• 原记录标记为已删除（保留用于审计）`)) return;

  const origAmount = +txn.amount || 0;

  // 1. 软删除原记录：同 ID 的重复版本也一并标记，避免云端/多标签合并后旧版本继续显示
  State.memberTxns.forEach(t => {
    if (t && t.id === txn.id) softDeleteRecord(t, '删除扣卡记录');
  });

  // 2. 写反向冲正交易
  State.memberTxns.unshift({
    id: genId('T'),
    cid: txn.cid,
    type: 'deduct',
    subtype: '【冲正】删除扣卡记录',
    amount: -origAmount,
    payMethod: 'balance',
    date: todayDateStr(),
    remark: `冲正原记录 ${txn.id}，原日期 ${txn.date}，金额 ${fmtMoney(origAmount)}`,
    items: [{ name: '【冲正】' + (txn.items?.[0]?.name || '扣卡退款'), qty: 1, price: -origAmount }],
    balanceAfter: (c?.balance || 0) + origAmount,
    apptId: '',
    _reverseOf: txn.id,
    _auditOnly: true,
    _hiddenFromDeductArchive: true
  });

  // 3. 退回会员余额 & 累计消费回退（余额统一按有效流水重算，避免与流水不一致）
  if (c) {
    c.totalPaid = Math.max(0, (c.totalPaid || 0) - origAmount);
    try { _recalcMemberBalance(c.id); } catch(e) {}
  }

  // 4. 取消关联预约
  if (txn.apptId) {
    const a = activeRows(State.appointments).find(x => x.id === txn.apptId);
    if (a) {
      a.deductId = '';
      // ⚠️「已完成」已移除：取消关联时统一回到 pending
      a.status = 'pending';
      a.finalTotal = 0;
      touchRecord(a);
    }
  }

  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  save('appointments', State.appointments);
  addAuditLog('删除扣卡记录', `${c?.name || '会员'} · 原金额 ${fmtMoney(origAmount)} · 已冲正`, txnId, { amount: origAmount, cid: txn.cid, apptId: txn.apptId || '' });
  toast('记录已删除（冲正交易已入账）', 'success');
  closeDeductDetailModal();
  refreshAllCustomerViews();
  renderMemberTxnList();
  renderDeductRecordsPage();
  renderApptTable();
}

/* ============================================================
   9. 页面切换时，渲染对应新增模块（严格对应侧边栏 8 大板块）
   ============================================================ */
const _origSwitch = window.switchPage;
window.switchPage = function(page) {
  _origSwitch(page);
  if (page === 'dashboard') {
    renderDashboardSummary();
    renderTodayAppointments();
    renderOverviewStats();
  } else if (page === 'schedule') {
    // 日程 / 预约合并页：同时渲染月历视图 + 预约表格
    renderCalendar();
    renderApptTable();
  } else if (page === 'customers') {
    renderCustomerStats();
    initYearSelectors();
    renderNewCustChart();
    renderRetCustChart();
    renderVisitRank();
    renderCustomerList();
  } else if (page === 'members') {
    renderLevelCounts();
    renderMemberList();
    renderMemberTxnList();
    renderRechargeRecordsPage();
    renderDeductRecordsPage();
  } else if (page === 'income') {
    renderIncome();
  } else if (page === 'expense') {
    renderExpense();
  } else if (page === 'stats') {
    renderStats();
  }
};

/* ============================================================
   11. 收入 / 支出 核心系统（第二阶段）
   ============================================================ */
// -------- 分类元数据 --------
const INC_TYPE_META = {
  'appt-nail':  { label:'💅 美甲预约',   cls:'nail' },
  'appt-lash':  { label:'👁️ 美睫预约',   cls:'lash' },
  'deduct':     { label:'👑 会员扣卡',   cls:'deduct' },
  'recharge':   { label:'💳 会员充值',   cls:'rech' },
  'manual':     { label:'📝 手动记收入', cls:'man' },
  'gift-card':  { label:'🎁 礼品卡',     cls:'man' },
  'deposit':    { label:'🔒 定金',       cls:'man' },
  'other':      { label:'💼 其他收入',   cls:'man' }
};
const EXP_CAT_META = {
  gel:       { label:'💅 甲油胶进货', cls:'gel',      goods:true },
  lash:      { label:'👁️ 睫毛进货',   cls:'lash',     goods:true },
  ornament:  { label:'💎 饰品/钻饰',   cls:'ornament', goods:true },
  tool:      { label:'🔧 工具/耗材',   cls:'tool',     op:true },
  rent:      { label:'🏠 房租',        cls:'rent',     op:true },
  utility:   { label:'💡 水电/物业',   cls:'utility',  op:true },
  salary:    { label:'👩 人工工资',    cls:'salary',   op:true },
  other:     { label:'📦 其他支出',    cls:'other' }
};
const INC_SOURCE_COLORS = ['#5AA9D9','#E6A5B2','#7CC4A4','#8F82C7','#E7B866','#7EBEDD','#C7D98F','#E49292'];

// -------- State 初始化 --------
State.manualIncomes = normalizeCoreCollection('manualIncomes', State.manualIncomes || load('manualIncomes', null) || []);
State.expenses      = normalizeCoreCollection('expenses', State.expenses      || load('expenses',      null) || []);

// -------- 时间范围辅助 --------
function getRange(rangeKey) {
  const now = new Date();
  function dayStart(d){ const t=new Date(d); t.setHours(0,0,0,0); return t; }
  function dayEnd(d)  { const t=new Date(d); t.setHours(23,59,59,999); return t; }
  const todayS = dayStart(now), todayE = dayEnd(now);
  function weekStart(d){ const t=dayStart(d); const day=(t.getDay()+6)%7; t.setDate(t.getDate()-day); return t; }
  switch (rangeKey) {
    case 'today':     return [todayS, todayE];
    case 'week': {
      const s = weekStart(now); const e = new Date(s); e.setDate(s.getDate()+6); return [s, dayEnd(e)];
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth()+1, 0);
      return [dayStart(s), dayEnd(e)];
    }
    case 'lastMonth': {
      const s = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return [dayStart(s), dayEnd(e)];
    }
    case 'year': {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear(), 11, 31);
      return [dayStart(s), dayEnd(e)];
    }
    case 'all':
    default:          return [new Date(2000,0,1), dayEnd(new Date(2099,11,31))];
  }
}
function inRange(dateStrOrTime, [s, e]) {
  const t = (typeof dateStrOrTime === 'number') ? dateStrOrTime : new Date(dateStrOrTime).getTime();
  return t >= s.getTime() && t <= e.getTime();
}

/* ---------- getPrevRange(rangeKey)：上一个等长区间（用于环比） ---------- */
function getPrevRange(rangeKey) {
  function dayStart(d){ const t=new Date(d); t.setHours(0,0,0,0); return t; }
  function dayEnd(d)  { const t=new Date(d); t.setHours(23,59,59,999); return t; }
  const now = new Date();
  const msPerDay = 86400000;
  switch (rangeKey) {
    case 'today':
    case '7':
    case 'week': {
      // 上一个 7 天
      const end = new Date(now.getTime() - msPerDay);
      const start = new Date(end.getTime() - msPerDay * (rangeKey === 'today' ? 0 : 6));
      return rangeKey === 'today'
        ? [dayStart(new Date(now.getTime() - msPerDay)), dayEnd(new Date(now.getTime() - msPerDay))]
        : [dayStart(start), dayEnd(end)];
    }
    case 'month':
    case 'lastMonth': {
      const monthsAgo = rangeKey === 'lastMonth' ? 2 : 1;
      const s = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
      const e = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
      return [dayStart(s), dayEnd(e)];
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), (q-1)*3, 1);
      const e = new Date(now.getFullYear(), q*3, 0);
      return [dayStart(s), dayEnd(e)];
    }
    case 'year': {
      const s = new Date(now.getFullYear()-1, 0, 1);
      const e = new Date(now.getFullYear()-1, 11, 31);
      return [dayStart(s), dayEnd(e)];
    }
    case 'all':
    default:
      return [new Date(2000,0,1), dayEnd(new Date(2099,11,31))];
  }
}

// -------- 收入：构建完整流水（预约+会员交易+手动） --------
function buildIncomeRecords() {
  const recs = [];
  // 1) 预约实际收入：只有“已完成”才进入收入流水
  activeRows(State.appointments).filter(a => isActualIncomeAppt(a)).forEach(a => {
    const t = new Date(a.datetime).getTime();
    const type = a.biz === 'lash' ? 'appt-lash' : 'appt-nail';
    const payParts = _apptPayParts(a);
    // 收入口径：会员储值/历史扣卡部分不重复计入总营收；只计非扣卡实收和补差。
    // 会员充值已在 recharge 记录中计入，扣卡只是消耗储值余额。
    const actualAmount = _roundMoney(payParts.normal);
    recs.push({
      id: 'INC-A-' + a.id,
      date: (a.datetime||'').slice(0,10),
      datetime: a.datetime,
      type,
      time: t,
      customer: a.customer || '',
      customerId: a.customerId || '',
      desc: apptTypeLabel(a),
      payMethod: a.payMethod || (a.member ? '扣卡' : '微信'),
      amount: actualAmount,
      grossAmount: payParts.amount,
      payDeductAmount: payParts.deduct,
      payExtraAmount: payParts.extra,
      bizRevenue: true,
      refId: a.id
    });
  });
  // 2) 会员扣卡 / 充值
  activeRows(State.memberTxns).forEach(tx => {
    if (tx._deleted) return;
    if (tx._auditOnly) return;
    if (tx._reversed) return; // 已冲正的充值/扣卡不再计入收入
    if ((tx.subtype || '').includes('冲正') || (tx.subtype || '').includes('撤销')) return;
    const txCustomerId = tx.customerId || tx.cid || '';
    if (tx.type === 'deduct') {
      // 扣卡不算收入：充值时已计入收入，扣卡只是消费储值余额，不重复计算
      return;
    } else if (tx.type === 'recharge') {
      if (Number(tx.amount) <= 0) return; // 跳过冲正负数
      const t = new Date(tx.date + 'T' + (tx.time || '00:00:00')).getTime();
      recs.push({
        id: 'INC-TX-' + tx.id,
        date: tx.date,
        datetime: tx.date + 'T' + (tx.time || '00:00:00'),
        type: 'recharge',
        time: t,
        customer: (customerById(txCustomerId) || {}).name || '',
        customerId: txCustomerId,
        desc: `会员充值 ${tx.level === 'gold' ? '黄金年卡' : (tx.giftAmount ? `本金+赠${tx.giftAmount}` : '储值本金')}`,
        payMethod: tx.payMethod || '微信',
        amount: Number(tx.amount) || 0,
        recharge: true,
        refId: tx.id
      });
    }
  });
  // 3) 手动记收入
  activeRows(State.manualIncomes).forEach(m => {
    const t = new Date(m.date + 'T00:00:00').getTime();
    recs.push({
      id: m.id,
      date: m.date,
      datetime: m.date + 'T00:00:00',
      type: m.subType || 'manual',
      time: t,
      customer: m.customerName || '',
      customerId: m.customerId || '',
      desc: m.remark || (INC_TYPE_META[m.subType || 'manual']?.label || '其他收入'),
      payMethod: m.payMethod || '',
      amount: Number(m.amount) || 0,
      manual: true,
      refNo: m.refNo || ''
    });
  });
  return recs.sort((a, b) => b.time - a.time);
}

function _parseMoneyParts(text) {
  const matches = String(text || '').match(/¥\s*[\d,]+(?:\.\d+)?/g) || [];
  return matches.map(s => Number(s.replace(/[¥,\s]/g, '')) || 0);
}

function _apptIncomeBreakdown(r) {
  const a = r?.refId ? activeRows(State.appointments).find(x => x.id === r.refId) : null;
  const amount = Number(r?.amount) || 0;
  if (r && (r.payDeductAmount != null || r.grossAmount != null)) {
    return {
      normal: amount,
      deduct: Math.max(0, Number(r.payDeductAmount) || 0),
      extra: Math.max(0, Number(r.payExtraAmount) || 0),
      extraPayMethod: a?.extraPayMethod || ''
    };
  }
  const pay = a?.payMethod || r?.payMethod || '';
  if (a && Number(a.deductAmount) > 0) {
    const deduct = Math.max(0, Number(a.deductAmount) || 0);
    const extra = Math.max(0, Number(a.extraAmount) || 0);
    return {
      normal: Math.max(0, amount - deduct),
      deduct,
      extra,
      extraPayMethod: a.extraPayMethod || ''
    };
  }
  if (pay.includes('储值卡扣') && pay.includes('补差')) {
    const parts = _parseMoneyParts(pay);
    const deduct = Math.max(0, parts[0] || 0);
    const extra = Math.max(0, parts[1] || Math.max(0, amount - deduct));
    return { normal: extra, deduct, extra, extraPayMethod: pay.replace(/^.*\+\s*/, '').replace(/补差.*$/, '') };
  }
  if (pay.includes('储值卡扣') || pay.includes('扣卡')) {
    return { normal: 0, deduct: amount, extra: 0, extraPayMethod: '' };
  }
  return { normal: amount, deduct: 0, extra: 0, extraPayMethod: '' };
}

function renderTodayBusinessSummary() {
  const today = todayDateStr();
  const recs = buildIncomeRecords().filter(r => (r.date || '').slice(0, 10) === today);
  const doneAppts = activeRows(State.appointments).filter(a => isActualIncomeAppt(a) && (a.datetime || '').slice(0, 10) === today);
  let total = 0, normal = 0, deduct = 0, mixedExtra = 0, deductCount = 0;
  const payMap = {};
  recs.forEach(r => {
    const amount = Number(r.amount) || 0;
    total += amount;
    if (r.type && r.type.startsWith('appt')) {
      const bd = _apptIncomeBreakdown(r);
      normal += bd.normal;
      deduct += bd.deduct;
      mixedExtra += bd.extra;
      if (bd.deduct > 0) deductCount += 1;
      const payName = (r.payMethod || '').includes('储值卡扣') ? '预约收款' : (r.payMethod || '未填写');
      payMap[payName] = (payMap[payName] || 0) + amount;
    } else if (r.type === 'deduct') {
      deduct += amount;
      deductCount += 1;
      payMap['会员扣卡'] = (payMap['会员扣卡'] || 0) + amount;
    } else if (r.type === 'recharge') {
      payMap['会员充值'] = (payMap['会员充值'] || 0) + amount;
    } else {
      normal += amount;
      payMap[r.payMethod || '其他收入'] = (payMap[r.payMethod || '其他收入'] || 0) + amount;
    }
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('todayBizDate', today);
  set('tbTotal', fmtMoney(total));
  set('tbNormal', fmtMoney(normal));
  set('tbDeduct', fmtMoney(deduct));
  set('tbMixedExtra', fmtMoney(mixedExtra));
  set('tbCompleted', `完成预约 ${doneAppts.length} 单`);
  set('tbDeductCount', `扣卡 ${deductCount} 笔`);
  const wrap = document.getElementById('todayPayBreakdown');
  if (wrap) {
    const rows = Object.entries(payMap).filter(([,v]) => Math.abs(v) > 0.001).sort((a,b) => b[1] - a[1]);
    if (!rows.length) {
      wrap.innerHTML = `<div class="tpb-empty">今天还没有完成收款，收款后这里会自动汇总。</div>`;
    } else {
      const max = Math.max(...rows.map(([,v]) => Math.abs(v)), 1);
      wrap.innerHTML = rows.map(([name, val]) => `
        <div class="tpb-row">
          <span class="tpb-name">${escapeHtml(name)}</span>
          <span class="tpb-bar"><i style="width:${Math.max(4, Math.round(Math.abs(val) / max * 100))}%;"></i></span>
          <span class="tpb-money">${fmtMoney(val)}</span>
        </div>
      `).join('');
    }
  }
}

function setIncomeTodayView() {
  const range = document.getElementById('incRange');
  const type = document.getElementById('incType');
  const search = document.getElementById('incSearch');
  if (range) range.value = 'today';
  if (type) type.value = '';
  if (search) search.value = '';
  renderIncome();
  document.getElementById('incTableBody')?.closest('.table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -------- 收入：渲染 --------
function renderIncome() {
  const rangeKey = document.getElementById('incRange')?.value || 'month';
  const range = getRange(rangeKey);
  const q = (document.getElementById('incSearch')?.value || '').trim().toLowerCase();
  const fType = document.getElementById('incType')?.value || '';
  let all = buildIncomeRecords().filter(r => inRange(r.datetime, range));
  if (q) all = all.filter(r => (r.customer||'').toLowerCase().includes(q) || (r.desc||'').toLowerCase().includes(q) || (r.id||'').toLowerCase().includes(q) || (r.refNo||'').toLowerCase().includes(q));
  if (fType) all = all.filter(r => r.type === fType);

  // 汇总卡
  const total  = all.reduce((s,r) => s + r.amount, 0);
  const bizRev = all.filter(r => r.bizRevenue).reduce((s,r) => s + r.amount, 0);
  const rech   = all.filter(r => r.recharge).reduce((s,r) => s + r.amount, 0);
  const manAmt = all.filter(r => r.manual).reduce((s,r) => s + r.amount, 0);
  const setMoney = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = '¥ ' + Number(v).toLocaleString('zh-CN', {maximumFractionDigits: 2}); };
  setMoney('incTotal',  total);
  setMoney('incBiz',    bizRev);
  setMoney('incRecharge', rech);
  setMoney('incOther',  manAmt);
  renderTodayBusinessSummary();
  try { renderDashboardSummary(); } catch(e) {}
  // 趋势：对比上一周期
  const [s, e] = range; const dur = e.getTime() - s.getTime();
  const prevRange = [new Date(s.getTime()-dur-86400000), new Date(s.getTime()-86400000)];
  const prevTotal = buildIncomeRecords().filter(r => inRange(r.datetime, prevRange)).reduce((s,r)=>s+r.amount,0);
  const trEl = document.getElementById('incTotalTrend');
  if (trEl) {
    if (prevTotal <= 0 && total > 0) { trEl.textContent = '新收入 ✓'; trEl.className = 'stat-card-trend up'; }
    else if (prevTotal === 0) { trEl.textContent = '持平 0%'; trEl.className = 'stat-card-trend'; }
    else {
      const pct = Math.round((total - prevTotal)/prevTotal * 100);
      trEl.textContent = (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(pct) + '%';
      trEl.className = 'stat-card-trend ' + (pct >= 0 ? 'up' : 'down');
    }
  }
  // mini bar：按月分布（本年 12 月）
  const yBar = document.getElementById('incTotalBar');
  if (yBar) {
    const y = new Date().getFullYear();
    const monthAmts = Array(12).fill(0);
    buildIncomeRecords().forEach(r => {
      const dt = new Date(r.datetime);
      if (dt.getFullYear() === y) monthAmts[dt.getMonth()] += r.amount;
    });
    const max = Math.max(...monthAmts, 1);
    yBar.innerHTML = monthAmts.map(v => `<span style="height:${Math.max(6, Math.round(v/max*100))}%;"></span>`).join('');
  }

  // 来源分布：横条图
  const src = {};
  all.forEach(r => { const key = INC_TYPE_META[r.type]?.label || r.type; src[key] = (src[key]||0) + r.amount; });
  const srcArr = Object.entries(src).sort((a,b)=>b[1]-a[1]);
  const srcEl = document.getElementById('incSourceChart');
  if (srcEl) {
    if (srcArr.length === 0) { srcEl.innerHTML = `<div class="dist-empty">🍵 当前范围暂无收入数据</div>`; }
    else {
      const maxA = Math.max(...srcArr.map(x=>x[1]));
      srcEl.innerHTML = `<div class="dist-list">` + srcArr.map(([k, v], i) => `
        <div class="dist-row">
          <div class="dist-label"><span class="dist-dot" style="background:${INC_SOURCE_COLORS[i%INC_SOURCE_COLORS.length]};"></span>${k}</div>
          <div class="dist-bar-wrap"><div class="dist-bar" style="width:${Math.round(v/maxA*100)}%;background:${INC_SOURCE_COLORS[i%INC_SOURCE_COLORS.length]};"></div></div>
          <div class="dist-amount">¥ ${Number(v).toLocaleString('zh-CN',{maximumFractionDigits:0})}</div>
        </div>`).join('') + `</div>`;
    }
  }
  // 趋势：按月柱图（本年 12 月）
  const trE = document.getElementById('incTrendChart');
  if (trE) {
    const y = new Date().getFullYear(); const curM = new Date().getMonth();
    const monthAmts = Array(12).fill(0);
    buildIncomeRecords().forEach(r => {
      const dt = new Date(r.datetime);
      if (dt.getFullYear() === y) monthAmts[dt.getMonth()] += r.amount;
    });
    const maxA = Math.max(...monthAmts, 1);
    trE.innerHTML = `<div class="bar-chart">` + monthAmts.map((v, i) => `
      <div class="bar-col ${i===curM?'current':''}">
        <div class="bar" style="height:${Math.max(2, Math.round(v/maxA*100))}%;">
          ${v > 0 ? `<div class="bar-val">${Math.round(v)}</div>` : ''}
        </div>
        <div class="bar-mon">${i+1}月</div>
      </div>`).join('') + `</div>`;
  }

  // 明细表
  const cntEl = document.getElementById('incCount'); if (cntEl) cntEl.textContent = `共 ${all.length} 条`;
  const tb = document.getElementById('incTableBody');
  if (tb) {
    if (all.length === 0) {
      tb.innerHTML = `<tr><td colspan="8" style="padding:48px 0;text-align:center;color:var(--muted);font-size:13px;">🍵 当前范围暂无收入记录</td></tr>`;
    } else {
      tb.innerHTML = all.map(r => {
        const meta = INC_TYPE_META[r.type] || { label:r.type, cls:'man' };
        const dt = new Date(r.datetime);
        const dStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        // 操作按钮：
        //  1) 查看预约 / 打开顾客（针对预约/充值/扣卡）
        //  2) 编辑：所有类型都可编辑（但系统联动类型只让改日期/备注/支付方式，避免破坏业务数据）
        //  3) 删除：手动收入真删；系统联动类型弹提示（预约→改预约状态，充值/扣卡→写反向交易）
        const viewBtn = (r.refId && r.type.startsWith('appt'))
          ? `<button class="btn-ghost xsmall" onclick="openApptDetail('${r.refId}')">📋 查看预约</button>`
          : (r.refId && (r.type==='recharge' || r.type==='deduct'))
            ? `<button class="btn-ghost xsmall" onclick="openCustomerModal(false,'${r.customerId||''}')">👤 查看顾客</button>`
            : '';
        const editBtn = `<button class="btn-ghost xsmall" onclick="editIncome('${r.id}')">✏️ 编辑</button>`;
        const delBtn = `<button class="btn-danger xsmall" onclick="deleteIncome('${r.id}')">🗑 删除</button>`;
        return `<tr>
          <td style="font-family:Menlo,monospace;font-size:11px;color:var(--muted);">${r.id}</td>
          <td>${dStr}</td>
          <td><span class="tag-inc ${meta.cls}">${meta.label}</span></td>
          <td>${escapeHtml(r.customer) || '<span style="color:var(--muted);">—</span>'}</td>
          <td style="color:var(--ink-2);font-size:12px;line-height:1.5;max-width:260px;">${escapeHtml(r.desc)}</td>
          <td>${r.payMethod ? escapeHtml(r.payMethod) : '<span style="color:var(--muted);">—</span>'}</td>
          <td style="font-weight:700;color:var(--accent);">${fmtMoney(r.amount)}</td>
          <td style="white-space:nowrap;">
            ${viewBtn}
            ${editBtn}
            ${delBtn}
          </td>
        </tr>`;
      }).join('');
    }
  }
}

// -------- 收入：弹窗 & 保存 --------
function openIncomeModal() {
  const today = todayDateStr();
  const $ = id => document.getElementById(id);
  $('inc_date').value = today;
  $('inc_type').value = 'manual';
  $('inc_amount').value = '';
  $('inc_pay').value = '微信';
  $('inc_remark').value = '';
  $('inc_refno').value = 'INC-' + Date.now().toString().slice(-6);
  // 客户下拉
  const cSel = $('inc_customer');
  cSel.innerHTML = `<option value="">— 非会员/不关联 —</option>` +
    activeRows(State.customers).map(c => `<option value="${c.id}">${escapeHtml(c.name)} ${c.phone ? '('+c.phone+')' : ''} ${memberLabel(c.level).tag||''}</option>`).join('');
  cSel.value = '';
  $('incomeModal').classList.add('show');
}
function closeIncomeModal() { document.getElementById('incomeModal').classList.remove('show'); }
function saveIncome() {
  const $ = id => document.getElementById(id);
  const date = $('inc_date').value; if (!date) return toast('请选择日期', 'error');
  const subType = $('inc_type').value;
  const amount = parseFloat($('inc_amount').value);
  if (!amount || amount <= 0) return toast('请输入有效金额', 'error');
  const customerId = $('inc_customer').value || '';
  const customerName = customerId ? (customerById(customerId)?.name || '') : '';
  const obj = {
    ...createRecordMeta('MAN'),
    id: $('inc_refno').value || ('MAN-' + genId()),
    date, subType, amount,
    customerId, customerName,
    payMethod: $('inc_pay').value,
    remark: $('inc_remark').value.trim()
  };
  State.manualIncomes.push(obj);
  save('manualIncomes', State.manualIncomes);
  addAuditLog('收入新增', `新增手动收入 ${obj.id}：${fmtMoney(amount)}`, obj.id);
  closeIncomeModal();
  toast('收入已记录 ✅', 'success');
  renderIncome();
  renderDashboardSummary();
  renderOverviewStats();
}
function deleteManualIncome(id) {
  const m = activeRows(State.manualIncomes).find(x => x.id === id);
  if (!m) { toast('收入记录不存在或已删除', 'error'); return; }
  const amount = Number(m.amount) || 0;
  const msg = `确认删除这笔手动收入？\n\n流水号：${m.id}\n金额：${fmtMoney(amount)}\n日期：${m.date}\n备注：${m.remark||'(无)'}\n\n删除后总收入/本月营业额会自动重算，不可撤销。`;
  if (!confirm(msg)) return;
  softDeleteRecord(m, '手动删除收入');
  save('manualIncomes', State.manualIncomes);
  addAuditLog('收入删除', `软删除手动收入 ${id}：${fmtMoney(amount)}`, id);
  renderIncome();
  renderDashboardSummary();
  renderOverviewStats();
  toast('已删除', 'success');
}

/* ============================================================
   收入明细：通用删除 + 编辑（用户新需求）
   - deleteIncome(id)：识别来源，手动直接删；预约/扣卡/充值给出明确指引
   - editIncome(id)：打开编辑弹窗；手动收入全字段可改；联动类型只改日期/备注/支付方式
   - saveIncomeEdit()：保存改动到对应数据源 + save + 重渲染
   ============================================================ */
function deleteIncome(id) {
  if (!id) return;
  // 1) 手动收入：真删
  if (activeRows(State.manualIncomes).some(x => x.id === id)) {
    deleteManualIncome(id); return;
  }
  // 2) 预约收入（INC-A-xxx）：走预约撤销收款，保持预约/收入/会员/顾客一致
  if (id.startsWith('INC-A-')) {
    const apptId = id.slice(6);
    const a = appointmentById(apptId);
    if (!a) { toast('对应预约不存在，无法撤销', 'error'); return; }
    undoApptPayment(apptId);
    return;
  }
  // 3) 会员交易（INC-TX-xxx）：充值 → 退回；扣卡 → 撤销扣卡；写反向交易保证余额对得上
  if (id.startsWith('INC-TX-')) {
    const txId = id.slice(7);
    const tx = activeRows(State.memberTxns).find(t => t.id === txId);
    if (!tx) { toast('对应交易记录不存在，可能已删除', 'error'); return; }
    const txCustomerId = tx.customerId || tx.cid || '';
    const c = customerById(txCustomerId);
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'recharge') {
      let msg = c ? `这笔「${c.name}」的充值记录：\n  · 充值本金：${fmtMoney(amt)}\n  · 支付方式：${tx.payMethod||'微信'}\n\n` : `这笔充值记录：\n  · 充值本金：${fmtMoney(amt)}\n\n`;
      msg += `取消后会生成一条【冲正充值退款】记录：\n  · 会员余额扣除 ${fmtMoney(amt)}\n  · 总收入自动减去 ${fmtMoney(amt)}\n  · 原充值记录保留（作为存档，不再计入统计）\n\n确认执行退款冲正？（注意：如果之前已经把钱线下退给顾客了，再点确认，避免重复退款）`;
      if (!confirm(msg)) return;
      const newTxId = genId('TX');
      // 原充值标记为已冲正（保留存档，但不再计入余额/收入/累计充值）
      tx._reversed = true;
      tx._reverseOf = newTxId;
      const newTx = {
        id: newTxId,
        cid: txCustomerId,
        type: 'recharge',
        subtype: '【冲正】充值退款（取消收入明细）',
        amount: -amt,
        giftAmount: 0,
        payMethod: '冲正',
        date: todayDateStr(),
        time: new Date().toTimeString().slice(0,5),
        items: [{ name: '收入明细删除冲正：' + (tx.subtype||'会员充值'), qty: 1, price: -amt }],
        _auditOnly: true,
        _hiddenFromDeductArchive: true,
        _reverseOf: newTxId
      };
      State.memberTxns.push(newTx);
      // 统一按有效流水重算余额（原记录已 _reversed，余额自动扣除冲正金额）
      if (c) { try { _recalcMemberBalance(c.id); } catch(e) {} }
      save('customers', State.customers);
      save('memberTxns', State.memberTxns);
      toast(`已冲正退款：${fmtMoney(amt)} 已从会员余额中扣回 ✅`, 'success');
    } else if (tx.type === 'deduct') {
      let msg = c ? `这笔「${c.name}」的扣卡消费记录：\n  · 扣卡金额：${fmtMoney(amt)}\n  · 项目：${tx.items && tx.items.length ? tx.items.map(i=>i.name).join('、') : '会员服务'}\n\n` : `这笔扣卡消费记录：\n  · 扣卡金额：${fmtMoney(amt)}\n\n`;
      msg += `取消后会生成一条【撤销扣卡】记录：\n  · 会员余额退回 ${fmtMoney(amt)}\n  · 总收入自动减去 ${fmtMoney(amt)}\n  · 原扣卡记录保留（作为存档，不再计入统计）\n\n确认执行撤销？`;
      if (!confirm(msg)) return;
      const newTxId = genId('TX');
      // 原扣卡标记为已冲正（保留存档，但不再计入余额/收入）
      tx._reversed = true;
      tx._reverseOf = newTxId;
      const newTx = {
        id: newTxId,
        cid: txCustomerId,
        type: 'deduct',
        subtype: '【冲正】撤销扣卡（取消收入明细）',
        amount: -amt,
        payMethod: '冲正',
        date: todayDateStr(),
        time: new Date().toTimeString().slice(0,5),
        items: [{ name: '收入明细删除冲正：撤销扣卡项目（' + (tx.items && tx.items.length ? tx.items.map(i=>i.name).join('、') : '服务') + '）', qty: 1, price: -amt }],
        _auditOnly: true,
        _hiddenFromDeductArchive: true,
        _reverseOf: newTxId
      };
      State.memberTxns.push(newTx);
      // 统一按有效流水重算余额（原记录已 _reversed，余额自动退回扣卡金额）
      if (c) { try { _recalcMemberBalance(c.id); } catch(e) {} }
      save('customers', State.customers);
      save('memberTxns', State.memberTxns);
      toast(`已撤销扣卡：${fmtMoney(amt)} 已退回会员余额 ✅`, 'success');
    } else {
      if (!confirm('确认删除这笔会员交易记录？删除后总收入会自动重算。')) return;
      softDeleteRecord(tx, '收入明细删除会员交易');
      save('memberTxns', State.memberTxns);
      addAuditLog('会员交易删除', `软删除会员交易 ${txId}`, txId);
      toast('已删除', 'success');
    }
    renderIncome(); renderMemberList(); renderMemberTxnList();
    renderDashboardSummary(); renderOverviewStats();
    return;
  }
  // 兜底：未知来源
  if (!confirm('确认删除这笔收入？删除后总收入会自动重算，不可撤销。')) return;
  const m = activeRows(State.manualIncomes).find(x => x.id === id);
  if (!m) { toast('收入记录不存在', 'error'); return; }
  softDeleteRecord(m, '收入明细兜底删除');
  save('manualIncomes', State.manualIncomes);
  addAuditLog('收入删除', `软删除收入 ${id}`, id);
  renderIncome(); renderDashboardSummary(); renderOverviewStats();
  toast('已删除', 'success');
}

// -------- 收入编辑弹窗 + 保存 --------
let _editingIncome = null;   // { id, record, source, rawData }
function editIncome(id) {
  if (!id) return;
  const all = buildIncomeRecords();
  const r = all.find(x => x.id === id);
  if (!r) { toast('收入记录不存在', 'error'); return; }
  _editingIncome = { id, record: {...r} };
  const $ = x => document.getElementById(x);
  const title = $('incEditTitle');
  const locked = $('incEditLockedWarn');
  // 类型判断：manual 全字段可改；其他=系统联动，部分锁定
  const isManual = !!r.manual;
  const isAppt = r.type && r.type.startsWith('appt');
  const isTxRecharge = r.type === 'recharge';
  const isTxDeduct = r.type === 'deduct';
  let typeLabel = '手动收入';
  if (isAppt) typeLabel = (r.type==='appt-lash'?'美睫预约':'美甲预约') + '实付（系统联动）';
  else if (isTxRecharge) typeLabel = '会员充值（系统联动）';
  else if (isTxDeduct) typeLabel = '会员扣卡（系统联动）';
  if (title) title.textContent = `✏️ 编辑收入 · ${typeLabel}`;

  // 填值
  $('incEdit_date').value = r.date || (r.datetime||'').slice(0,10);
  $('incEdit_customer').innerHTML = `<option value="">— 非会员/不关联 —</option>` +
    activeRows(State.customers).map(c => `<option value="${c.id}">${escapeHtml(c.name)} ${c.phone ? '('+c.phone+')' : ''}</option>`).join('');
  $('incEdit_customer').value = r.customerId || '';
  $('incEdit_amount').value = Number(r.amount) || 0;
  $('incEdit_pay').value = r.payMethod || '微信';
  $('incEdit_desc').value = r.desc || '';
  $('incEdit_refno').value = r.id || '';

  // 系统联动类型：金额/客户锁定，只允许改日期/备注/支付方式
  const amtInput = $('incEdit_amount');
  const custSel = $('incEdit_customer');
  const refInput = $('incEdit_refno');
  const fields = [amtInput, custSel, refInput];
  if (isManual) {
    fields.forEach(el => { if (el) { el.disabled = false; el.style.background = ''; el.style.opacity = ''; } });
    if (locked) locked.style.display = 'none';
  } else {
    fields.forEach(el => { if (el) { el.disabled = true; el.style.background = '#F6F7F9'; el.style.opacity = '0.85'; } });
    if (locked) {
      locked.style.display = '';
      let reason = '该记录来自系统联动：';
      if (isAppt) reason += '预约「已完成」自动生成。如需改金额 → 到【预约详情】改项目/金额/状态后保存，会自动同步。';
      if (isTxRecharge) reason += '会员充值本金自动入账。如需改金额 → 到【会员管理】打开对应顾客，先做一笔退款再重新充值。';
      if (isTxDeduct) reason += '会员扣卡自动入账。如需改金额 → 到【会员管理】撤销扣卡再重新做一笔正确的扣卡。';
      locked.textContent = '⚠️ ' + reason + ' 为避免账务不一致，仅允许修改「日期 / 备注 / 支付方式」这三项。';
    }
  }
  $('incomeEditModal').classList.add('show');
}
function closeIncomeEdit() {
  document.getElementById('incomeEditModal').classList.remove('show');
  _editingIncome = null;
}
function saveIncomeEdit() {
  if (!_editingIncome || !_editingIncome.record) return;
  const rec = _editingIncome.record;
  const $ = x => document.getElementById(x);
  const newDate = $('incEdit_date').value;
  const newPay = $('incEdit_pay').value;
  const newDesc = $('incEdit_desc').value.trim();
  if (!newDate) return toast('请选择日期', 'error');
  const isManual = !!rec.manual;

  if (isManual) {
    // 手动收入：全字段保存回 manualIncomes
    const raw = activeRows(State.manualIncomes).find(x => x.id === rec.id);
    if (!raw) { toast('记录不存在，可能已删除', 'error'); return; }
    const newAmt = parseFloat($('incEdit_amount').value);
    if (!newAmt || newAmt <= 0) return toast('请输入有效金额', 'error');
    const newCid = $('incEdit_customer').value || '';
    raw.date = newDate;
    raw.payMethod = newPay;
    raw.remark = newDesc;
    raw.amount = newAmt;
    raw.customerId = newCid;
    raw.customerName = newCid ? (customerById(newCid)?.name || '') : '';
    save('manualIncomes', State.manualIncomes);
  } else if (rec.type && rec.type.startsWith('appt')) {
    // 预约：改 appointment 的 datetime / payMethod；备注写到 income 的备注会用 apptTypeLabel，不直接改预约避免冲突
    const apptId = rec.refId;
    const a = appointmentById(apptId);
    if (!a) return toast('关联预约不存在', 'error');
    // 新日期 + 原时分
    const t = new Date(a.datetime);
    const ymd = newDate.split('-');
    if (ymd.length === 3) {
      t.setFullYear(parseInt(ymd[0]));
      t.setMonth(parseInt(ymd[1]) - 1);
      t.setDate(parseInt(ymd[2]));
      a.datetime = localDateTimeStr(t);
    }
    a.payMethod = newPay;
    save('appointments', State.appointments);
    // desc 改不进预约项目描述，用 a.notes 存（如果用户改了备注）
    if (newDesc && a.notes !== newDesc) {
      a.notes = newDesc;
      save('appointments', State.appointments);
    }
  } else if (rec.type === 'recharge' || rec.type === 'deduct') {
    // 会员交易：改 date / time / payMethod；备注不进 desc
    const txId = rec.refId;
    const tx = activeRows(State.memberTxns).find(t => t.id === txId);
    if (!tx) return toast('关联会员交易不存在', 'error');
    tx.date = newDate;
    tx.payMethod = newPay;
    if (newDesc) tx._editRemark = newDesc;   // 用私有字段存备注（不覆盖原始扣卡项目明细）
    save('memberTxns', State.memberTxns);
  }
  addAuditLog('收入编辑', `编辑收入记录 ${rec.id} · ${isManual ? '手动收入' : rec.type}`, rec.id, { date: newDate, payMethod: newPay });
  closeIncomeEdit();
  renderIncome();
  renderDashboardSummary();
  renderOverviewStats();
  if (!isManual) { try { renderApptTable(); renderCalendar(); } catch(e) {} }
  toast('收入已更新 ✅', 'success');
}


// ============================================================
// 支出（进货）核心
// ============================================================
function buildExpenseRecords() {
  return activeRows(State.expenses).slice().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
function renderExpense() {
  const rangeKey = document.getElementById('expRange')?.value || 'month';
  const range = getRange(rangeKey);
  const q = (document.getElementById('expSearch')?.value || '').trim().toLowerCase();
  const fCat = document.getElementById('expCat')?.value || '';
  let all = buildExpenseRecords().filter(r => inRange(r.date + 'T00:00:00', range));
  if (q) all = all.filter(r => (r.supplier||'').toLowerCase().includes(q) || (r.remark||'').toLowerCase().includes(q) || (r.id||'').toLowerCase().includes(q));
  if (fCat) all = all.filter(r => r.category === fCat);

  const total  = all.reduce((s,r) => s + Number(r.amount||0), 0);
  const goods  = all.filter(r => EXP_CAT_META[r.category]?.goods).reduce((s,r) => s + Number(r.amount||0), 0);
  const op     = all.filter(r => EXP_CAT_META[r.category]?.op).reduce((s,r) => s + Number(r.amount||0), 0);

  // 利润 = 同时间范围的营业总收入(bizRevenue+manual) - 总支出
  const incRange = getRange(rangeKey);
  const incBiz = buildIncomeRecords().filter(r => inRange(r.datetime, incRange) && (r.bizRevenue || r.manual))
    .reduce((s,r) => s + Number(r.amount||0), 0);
  const profit = incBiz - total;

  const setMoney = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = '¥ ' + Number(v).toLocaleString('zh-CN', {maximumFractionDigits: 2}); };
  setMoney('expTotal', total);
  setMoney('expGoods', goods);
  setMoney('expOp',    op);
  setMoney('expProfit', profit);
  const pLabel = document.getElementById('profitLabel');
  if (pLabel) {
    if (profit > 0) { pLabel.textContent = '📈 盈利'; pLabel.className = 'stat-card-trend up'; }
    else if (profit < 0) { pLabel.textContent = '📉 亏损'; pLabel.className = 'stat-card-trend down'; }
    else { pLabel.textContent = '持平'; pLabel.className = 'stat-card-trend'; }
  }
  // 趋势：上一周期
  const [s, e] = range; const dur = e.getTime() - s.getTime();
  const prevRange = [new Date(s.getTime()-dur-86400000), new Date(s.getTime()-86400000)];
  const prevT = buildExpenseRecords().filter(r => inRange(r.date+'T00:00:00', prevRange)).reduce((s,r)=>s+Number(r.amount||0),0);
  const trEl = document.getElementById('expTotalTrend');
  if (trEl) {
    if (prevT === 0 && total > 0) { trEl.textContent = '新支出'; trEl.className = 'stat-card-trend down'; }
    else if (prevT === 0) { trEl.textContent = '持平 0%'; trEl.className = 'stat-card-trend'; }
    else {
      const pct = Math.round((total - prevT)/prevT * 100);
      // 支出上涨=标红 down；下降=标绿 up
      trEl.textContent = (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(pct) + '%';
      trEl.className = 'stat-card-trend ' + (pct >= 0 ? 'down' : 'up');
    }
  }
  // mini bar
  const yBar = document.getElementById('expTotalBar');
  if (yBar) {
    const y = new Date().getFullYear();
    const monthAmts = Array(12).fill(0);
    buildExpenseRecords().forEach(r => {
      const dt = new Date(r.date);
      if (dt.getFullYear() === y) monthAmts[dt.getMonth()] += Number(r.amount||0);
    });
    const max = Math.max(...monthAmts, 1);
    yBar.innerHTML = monthAmts.map(v => `<span style="height:${Math.max(6, Math.round(v/max*100))}%;"></span>`).join('');
  }

  // 分类分布
  const cat = {};
  all.forEach(r => { const m = EXP_CAT_META[r.category] || { label: r.category, cls: 'other' }; cat[m.label] = (cat[m.label]||0) + Number(r.amount||0); });
  const catArr = Object.entries(cat).sort((a,b)=>b[1]-a[1]);
  const cEl = document.getElementById('expCatChart');
  if (cEl) {
    if (catArr.length === 0) cEl.innerHTML = `<div class="dist-empty">🍵 当前范围暂无支出数据</div>`;
    else {
      const maxA = Math.max(...catArr.map(x=>x[1]));
      const palette = ['#5AA9D9','#E6A5B2','#7CC4A4','#8F82C7','#E7B866','#7EBEDD','#C7D98F','#E49292'];
      cEl.innerHTML = `<div class="dist-list">` + catArr.map(([k, v], i) => `
        <div class="dist-row">
          <div class="dist-label"><span class="dist-dot" style="background:${palette[i%palette.length]};"></span>${k}</div>
          <div class="dist-bar-wrap"><div class="dist-bar" style="width:${Math.round(v/maxA*100)}%;background:${palette[i%palette.length]};"></div></div>
          <div class="dist-amount">¥ ${Number(v).toLocaleString('zh-CN',{maximumFractionDigits:0})}</div>
        </div>`).join('') + `</div>`;
    }
  }
  // 月趋势：支出柱（粉色）
  const tE = document.getElementById('expTrendChart');
  if (tE) {
    const y = new Date().getFullYear(); const curM = new Date().getMonth();
    const monthAmts = Array(12).fill(0);
    buildExpenseRecords().forEach(r => {
      const dt = new Date(r.date);
      if (dt.getFullYear() === y) monthAmts[dt.getMonth()] += Number(r.amount||0);
    });
    const maxA = Math.max(...monthAmts, 1);
    tE.innerHTML = `<div class="bar-chart">` + monthAmts.map((v, i) => `
      <div class="bar-col ${i===curM?'current':''}">
        <div class="bar exp-bar" style="height:${Math.max(2, Math.round(v/maxA*100))}%;">
          ${v > 0 ? `<div class="bar-val">${Math.round(v)}</div>` : ''}
        </div>
        <div class="bar-mon">${i+1}月</div>
      </div>`).join('') + `</div>`;
  }

  // 明细表
  const cntEl = document.getElementById('expCount'); if (cntEl) cntEl.textContent = `共 ${all.length} 条`;
  const tb = document.getElementById('expTableBody');
  if (tb) {
    if (all.length === 0) {
      tb.innerHTML = `<tr><td colspan="8" style="padding:48px 0;text-align:center;color:var(--muted);font-size:13px;">🍵 当前范围暂无支出/进货记录</td></tr>`;
    } else {
      tb.innerHTML = all.map(r => {
        const m = EXP_CAT_META[r.category] || { label: r.category, cls: 'other' };
        const imgHtml = r.images && r.images.length
          ? `<div class="ref-imgs">${r.images.slice(0,3).map(ref => { const src = resolveImageSrc(ref); return `<div class="ref-thumb" onclick="showLightbox('${src.replace(/'/g,"\\'")}')"><img src="${src}"></div>`; }).join('')}${r.images.length>3?`<div class="ref-more">+${r.images.length-3}</div>`:''}</div>`
          : '<span style="color:var(--muted);font-size:12px;">—</span>';
        return `<tr>
          <td style="font-family:Menlo,monospace;font-size:11px;color:var(--muted);">${r.id}</td>
          <td>${r.date}</td>
          <td><span class="tag-exp ${m.cls}">${m.label}</span></td>
          <td>${escapeHtml(r.supplier) || '<span style="color:var(--muted);">—</span>'}</td>
          <td style="color:var(--ink-2);font-size:12px;line-height:1.5;max-width:260px;">${escapeHtml(r.remark) || '<span style="color:var(--muted);">—</span>'}</td>
          <td>${imgHtml}</td>
          <td style="font-weight:700;color:#C75A5A;">${fmtMoney(r.amount)}</td>
          <td style="white-space:nowrap;">
            <button class="btn-ghost xsmall" onclick="editExpense('${r.id}')">✏️ 编辑</button>
            <button class="btn-danger xsmall" onclick="deleteExpense('${r.id}')">🗑 删除</button>
          </td>
        </tr>`;
      }).join('');
    }
  }
}

// -------- 支出：删除（带详情确认） --------
function deleteExpense(id) {
  const e = activeRows(State.expenses).find(x => x.id === id);
  if (!e) { toast('支出记录不存在或已删除', 'error'); return; }
  let msg;
  {
    const cat = EXP_CAT_META[e.category] || { label: e.category };
    msg = `确认删除这笔支出/进货记录？\n\n流水号：${e.id}\n分类：${cat.label}\n日期：${e.date}\n金额：${fmtMoney(e.amount)}\n${e.supplier?`供应商：${e.supplier}\n`:''}${e.remark?`备注：${e.remark}\n`:''}${e.images && e.images.length ? `凭证图片：${e.images.length} 张\n` : ''}\n删除后本月支出/利润统计会自动重算，不可撤销。`;
  }
  if (!confirm(msg)) return;
  softDeleteRecord(e, '手动删除支出');
  save('expenses', State.expenses);
  addAuditLog('支出删除', `软删除支出 ${id}${e ? '：' + fmtMoney(e.amount || 0) : ''}`, id);
  renderExpense();
  renderDashboardSummary();
  renderOverviewStats();
  toast('已删除', 'success');
}

// -------- 支出编辑弹窗 + 保存（含凭证图片增删） --------
let _editingExpense = null;
let _editExpImages = [];
function editExpense(id) {
  const e = activeRows(State.expenses).find(x => x.id === id);
  if (!e) { toast('支出记录不存在', 'error'); return; }
  _editingExpense = e;
  _editExpImages = (e.images || []).slice();
  const $ = x => document.getElementById(x);
  $('expEdit_date').value = e.date || todayDateStr();
  $('expEdit_cat').value = e.category || 'gel';
  $('expEdit_amount').value = Number(e.amount) || 0;
  $('expEdit_supplier').value = e.supplier || '';
  $('expEdit_pay').value = e.payMethod || '微信';
  $('expEdit_refno').value = e.id || '';
  $('expEdit_remark').value = e.remark || '';
  renderExpEditImgPreview();
  // 绑定上传
  const zone = $('expEdit_uploadZone'); const input = $('expEdit_images');
  zone.onclick = () => input.click();
  input.onchange = (ev) => {
    const files = Array.from(ev.target.files || []);
    files.forEach(f => {
      if (!f.type.startsWith('image/')) return;
      const fr = new FileReader();
      fr.onload = e2 => {
        _editExpImages.push(e2.target.result);
        renderExpEditImgPreview();
      };
      fr.readAsDataURL(f);
    });
    input.value = '';
  };
  $('expenseEditModal').classList.add('show');
}
function renderExpEditImgPreview() {
  const c = document.getElementById('expEdit_imgPreview');
  if (!c) return;
  c.innerHTML = _editExpImages.map((src, i) => `
    <div class="ref-thumb" style="position:relative;" onclick="event.stopPropagation();">
      <img src="${src}">
      <button type="button" class="thumb-del" title="删除该凭证" onclick="event.stopPropagation();removeExpEditImg(${i})">✕ 删除</button>
    </div>
  `).join('');
}
function removeExpEditImg(i) {
  _editExpImages.splice(i, 1);
  renderExpEditImgPreview();
}
function closeExpenseEdit() {
  document.getElementById('expenseEditModal').classList.remove('show');
  _editingExpense = null; _editExpImages = [];
}
function saveExpenseEdit() {
  if (!_editingExpense) return;
  const $ = x => document.getElementById(x);
  const date = $('expEdit_date').value;
  if (!date) return toast('请选择日期', 'error');
  const amount = parseFloat($('expEdit_amount').value);
  if (!amount || amount <= 0) return toast('请输入有效金额', 'error');
  const e = _editingExpense;
  e.date = date;
  e.category = $('expEdit_cat').value;
  e.amount = amount;
  e.supplier = $('expEdit_supplier').value.trim();
  e.payMethod = $('expEdit_pay').value;
  e.remark = $('expEdit_remark').value.trim();
  e.images = _editExpImages.slice();
  save('expenses', State.expenses);
  closeExpenseEdit();
  renderExpense();
  renderDashboardSummary();
  renderOverviewStats();
  toast('支出已更新 ✅', 'success');
}

// -------- 支出：弹窗 & 保存 --------
let _expImages = [];
function openExpenseModal() {
  const today = todayDateStr();
  const $ = id => document.getElementById(id);
  $('exp_date').value = today;
  $('exp_cat').value = 'gel';
  $('exp_amount').value = '';
  $('exp_supplier').value = '';
  $('exp_pay').value = '微信';
  $('exp_refno').value = 'EXP-' + Date.now().toString().slice(-6);
  $('exp_remark').value = '';
  _expImages = [];
  $('exp_imgPreview').innerHTML = '';
  // 绑定上传
  const zone = $('exp_uploadZone'); const input = $('exp_images');
  zone.onclick = () => input.click();
  input.onchange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      if (!f.type.startsWith('image/')) return;
      compressImageFile(f, dataUrl => {
        _expImages.push(dataUrl);
        renderExpImgPreview();
      });
    });
    input.value = '';
  };
  $('expenseModal').classList.add('show');
}
function renderExpImgPreview() {
  const c = document.getElementById('exp_imgPreview');
  if (!c) return;
  c.innerHTML = _expImages.map((ref, i) => {
    const src = resolveImageSrc(ref);
    return `
    <div class="ref-thumb" style="position:relative;" onclick="event.stopPropagation();">
      <img src="${src}">
      <button type="button" class="thumb-del" title="删除该凭证" onclick="event.stopPropagation();removeExpImg(${i})">✕ 删除</button>
    </div>`;
  }).join('');
}
function removeExpImg(i) { _expImages.splice(i, 1); renderExpImgPreview(); }
function closeExpenseModal() { document.getElementById('expenseModal').classList.remove('show'); _expImages=[]; }
function saveExpense() {
  const $ = id => document.getElementById(id);
  const date = $('exp_date').value; if (!date) return toast('请选择日期', 'error');
  const category = $('exp_cat').value;
  const amount = parseFloat($('exp_amount').value);
  if (!amount || amount <= 0) return toast('请输入有效金额', 'error');
  const obj = {
    ...createRecordMeta('EXP'),
    id: $('exp_refno').value || ('EXP-' + genId()),
    date, category, amount,
    supplier: $('exp_supplier').value.trim(),
    payMethod: $('exp_pay').value,
    remark: $('exp_remark').value.trim(),
    images: storeImageRefs(_expImages, 'expense-voucher')
  };
  State.expenses.push(obj);
  save('expenses', State.expenses);
  addAuditLog('支出新增', `新增支出 ${obj.id}：${fmtMoney(amount)}`, obj.id);
  closeExpenseModal();
  toast('支出已记录 ✅', 'success');
  renderExpense();
  renderDashboardSummary();
  renderOverviewStats();
}

// -------- 页面切换挂钩 --------
const _origSwitch2 = window.switchPage;
window.switchPage = function(page) {
  _origSwitch2(page);
  if (page === 'income') renderIncome();
  else if (page === 'expense') renderExpense();
};

/* ============================================================
   12. 启动附加（收入支出 & 客户下拉预填）
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // 【📡 跨设备同步 A1+A3：BroadcastChannel + storage 事件双重保险】
  try {
    window.__BC_SENDER_ID = Math.random().toString(36).slice(2, 8);
    if ('BroadcastChannel' in window) {
      window.__BC = new BroadcastChannel('lh-nail-sync-v2');
      window.__BC.onmessage = (e) => {
        try {
          if (!e.data || !e.data.sender) return;
          if (e.data.sender === window.__BC_SENDER_ID) return; // 自己发的忽略
          if (e.data.type === 'state-changed') {
            loadStateAll();
            try { reRenderCurrentPageOnly(); } catch(_){}
            try { silentToast('🔄 已同步其他标签页的修改'); } catch(_){}
          }
        } catch(_) {}
      };
    }
  } catch(_) {}
  // storage 事件：同浏览器多标签页时，其他标签改 localStorage 会触发
  try {
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key.startsWith('lhn_')) {
        loadStateAll();
        try { reRenderCurrentPageOnly(); } catch(_){}
      }
      // 多端同步卡监听：lh_sync_ts 或 lh_sync_hash 变化 → 静默刷新
      if (e.key === 'lhn_lh_sync_ts' || e.key === 'lh_sync_ts' || e.key === 'lhn_lh_sync_hash' || e.key === 'lh_sync_hash') {
        try {
          const curTs = Number(localStorage.getItem('lhn_lh_sync_ts') || localStorage.getItem('lh_sync_ts') || 0);
          if (curTs && curTs !== SyncRuntime.lastTs) {
            loadStateAll();
            refreshAllAfterSync();
            silentToast('🔄 检测到新数据，已自动同步');
          }
        } catch(_) {}
      }
    });
  } catch(_) {}

  // 🔧 URL 后门：?reset=1 自动清登录缓存。正式版禁用 ?demo=1 演示入口
  try {
    const p = new URLSearchParams(location.search || '');
    if (p.get('reset') === '1' || p.get('clear') === '1') {
        clearSession();
        localStorage.removeItem('lhn_lh_session');
        localStorage.removeItem('lh_session');
        localStorage.removeItem('lhn_users');
        State.currentUser = null;
        State.users = [];
        // 清掉 query 避免刷新重复
        history.replaceState(null, '', location.pathname);
      }
    if (p.get('demo') === '1') history.replaceState(null, '', location.pathname);
  } catch(e){}
  // 📲 PWA Service Worker 注册 + 一键安装弹窗监听（第二阶段 App 化）
  try {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js', { scope: './' })
          .then(reg => {
            try { window.__SW_REG = reg; } catch(e){}
            try {
              reg.addEventListener('updatefound', () => {
                const nw = reg.installing;
                if (!nw) return;
                nw.addEventListener('statechange', () => {
                  if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                    toast('发现新版本，进入设置页点“清缓存更新”即可刷新', 'success', 5000);
                  }
                });
              });
            } catch(e){}
          }).catch(() => {});
      });
    }
    // 一键安装：beforeinstallprompt 触发前拦截，全局暴露 API
    window.__PWA_INSTALL = {
      deferred: null,
      installed: false,
      isSupported: function() {
        try { return 'BeforeInstallPromptEvent' in window || navigator.userAgent.match(/Chrome|Edg|Android/i); }
        catch(e){ return false; }
      },
      canInstall: function() { return !!window.__PWA_INSTALL.deferred && !window.__PWA_INSTALL.installed; },
      prompt: function() {
        const d = window.__PWA_INSTALL.deferred;
        if (!d) return Promise.resolve({ ok:false, msg:'当前浏览器暂不支持一键安装，请在菜单里手动「添加到主屏幕 / 安装应用」' });
        return d.prompt().then(() => d.userChoice).then(r => {
          if (r.outcome === 'accepted') {
            window.__PWA_INSTALL.installed = true;
            window.__PWA_INSTALL.deferred = null;
            try {
              const btn = document.getElementById('csInstallBtn');
              if (btn) { btn.disabled = true; btn.innerHTML = '✅ 已安装'; }
              const s = document.getElementById('csInstallStatus');
              if (s) s.textContent = '🎉 已成功安装为独立 App，可在桌面/主屏幕找到';
            } catch(e){}
            return { ok:true, msg:'安装成功！可在桌面/主屏幕找到 LH Nail 图标 ✅' };
          }
          return { ok:false, msg:'已取消安装' };
        });
      }
    };
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.__PWA_INSTALL.deferred = e;
      // 设置页按钮状态更新
      try {
        const btn = document.getElementById('csInstallBtn');
        if (btn && !btn.dataset.bound) {
          btn.disabled = false;
          btn.innerHTML = '⬇️ 一键安装到桌面';
          btn.classList.remove('btn-ghost'); btn.classList.add('btn-primary');
          btn.dataset.bound = '1';
          btn.onclick = () => {
            const p = window.__PWA_INSTALL.prompt();
            if (p && typeof p.then === 'function') p.then(r => toast(r.msg, r.ok?'success':'error'));
            else toast(typeof p==='object'?p.msg:'开始安装…', 'info');
          };
        }
        const s = document.getElementById('csInstallStatus');
        if (s && !s.textContent.includes('可安装')) s.textContent = '💡 检测到可安装，点击右侧按钮一键安装';
      } catch(e){}
    });
    window.addEventListener('appinstalled', () => {
      window.__PWA_INSTALL.installed = true;
      try {
        const s = document.getElementById('csInstallStatus');
        if (s) s.textContent = '🎉 已安装为独立应用，随时从桌面/主屏幕打开';
        toast('LH Nail 已安装为 App ✅', 'success');
      } catch(e){}
    });
    // iOS：提示「添加到主屏幕」
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        const s = document.getElementById('csInstallStatus');
        if (s) s.textContent = '🍎 iOS 用户：点击 Safari 底部分享按钮 → 选择「添加到主屏幕」';
        const btn = document.getElementById('csInstallBtn');
        if (btn) { btn.innerHTML = '📖 查看安装步骤'; btn.onclick = () => window.open('./app-install-guide.html', '_blank'); }
      } catch(e){}
    }
  } catch(e){}
  // 先不 init，启动登录流程
  setTimeout(() => {
    bootLoginFlow();
  }, 60);
});

/* ============================================================
   13. 登录权限系统（第二阶段）
   ============================================================ */
// 简易"加密"：可逆 Base64 + 混淆盐，仅防止肉眼偷看密码明文
// 对于本地工具型单页 APP，这已经足够（若要真正安全，需要后端服务器）
const AUTH_SALT = 'LH-Nail-2026-X9K7M';
function obfuscate(str) {
  try {
    const s = AUTH_SALT + '::' + String(str);
    // btoa 不支持中文，先 encode
    return btoa(unescape(encodeURIComponent(s)));
  } catch (e) { return btoa(AUTH_SALT); }
}
function deobfuscate(str) {
  try {
    const raw = decodeURIComponent(escape(atob(String(str || ''))));
    if (raw.startsWith(AUTH_SALT + '::')) return raw.slice((AUTH_SALT + '::').length);
    return '';
  } catch (e) { return ''; }
}
function hashPwd(pwd) {
  // 非加密哈希：重复混淆加盐
  return obfuscate('PWD:' + AUTH_SALT + ':' + String(pwd||'') + ':' + AUTH_SALT.length);
}
function checkPwd(input, stored) {
  return hashPwd(input) === String(stored || '');
}

// 角色元
const ROLE_META = {
  owner:   { label:'老板',  av:'👑', color:'#E7B866',
    perms: new Set(['*']) },
  manager: { label:'店长',  av:'🧑‍💼', color:'#5AA9D9',
    perms: new Set(['appt.*','member.*','customer.*','income.view','income.add.manual',
      'expense.*','stats.view','settings.bg','settings.calColor']) },
  staff:   { label:'技师',  av:'👩', color:'#7CC4A4',
    perms: new Set(['appt.view','calendar.view','member.view','customer.view','stats.view']) }
};
function isLegacyDemoUser(u) {
  if (!u) return false;
  const id = String(u.id || '');
  const realName = String(u.realName || '');
  const remark = String(u.remark || '');
  return id.startsWith('U-DEMO-') ||
    realName.includes('老板（演示）') ||
    remark.includes('演示模式自动创建');
}
function purgeLegacyDemoAuth() {
  try {
    localStorage.removeItem('lh_force_demo');
    State.users = State.users || load('users', null) || [];
    if (!Array.isArray(State.users)) State.users = [];
    const before = State.users.length;
    const removedNames = new Set(State.users.filter(isLegacyDemoUser).map(u => u.username));
    State.users = State.users.filter(u => !isLegacyDemoUser(u));
    if (State.currentUser && isLegacyDemoUser(State.currentUser)) State.currentUser = null;
    const sess = loadSession();
    if (sess && removedNames.has(sess.uname)) {
      clearSession();
      localStorage.removeItem('lhn_lh_session');
      localStorage.removeItem('lh_session');
    }
    if (State.users.length !== before) save('users', State.users);
  } catch(e) {}
}
function hasPerm(perm) {
  const me = State.currentUser;
  if (!me) return false;
  const r = ROLE_META[me.role];
  if (!r) return false;
  if (r.perms.has('*')) return true;
  if (r.perms.has(perm)) return true;
  // 支持 appt.* 通配
  if (perm.includes('.')) {
    const pfx = perm.split('.')[0] + '.*';
    if (r.perms.has(pfx)) return true;
  }
  return false;
}

/* ============================================================
   🚨 全局错误兜底 — 任何 JS 异常都显示友好提示 + 不锁死页面
   ============================================================ */
(function _installGlobalErrorGuard() {
  let _lastErr = '';
  function _friendly(msg) {
    try {
      // 兜底：只要 toast 元素存在就处理，不依赖不存在的 app 容器 id
      const t = document.getElementById('toast');
      if (!t) return;
      if (msg === _lastErr) return; // 防止同一个错连弹
      _lastErr = msg;
      setTimeout(() => _lastErr = '', 4000);
      t.textContent = '⚠️ ' + msg + '（可继续操作，不影响已保存数据）';
      t.style.background = '#E8B56A';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3500);
    } catch(_) {}
  }
  window.addEventListener('error', function(e) {
    try {
      if (e && e.target && e.target !== window) {
        const tag = String(e.target.tagName || '').toUpperCase();
        if (tag !== 'SCRIPT') return true;
      }
      const msg = (e && e.error && e.error.message) ? e.error.message : (e.message || '脚本异常');
      // 过滤第三方/CDN/跨域脚本错误（Script error.）—— 但仍然吃掉错误不冒泡
      const filtered = /^script error/i.test(msg) || msg === '脚本异常' || /TRAEWORK|react|vscode/i.test(msg);
      if (!filtered) _friendly(msg.slice(0, 40));
    } catch(_) {}
    // 关键：任何分支都强制吞掉，防止冒泡到 TRAE 预览容器引发 React #185
    try { if (e && typeof e.stopPropagation==='function') e.stopPropagation(); } catch(_){}
    try { if (e && typeof e.preventDefault==='function') e.preventDefault(); } catch(_){}
    return true; // 🚨 强制最后一行 return true，任何分支都不能跳过
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    try {
      const msg = (e && e.reason && (e.reason.message || String(e.reason).slice(0,40))) || '异步任务异常';
      const filtered = /TRAEWORK|react|vscode/i.test(msg);
      if (!filtered) _friendly(String(msg).slice(0, 40));
    } catch(_){}
    // 🚨 强制吞掉所有 unhandledrejection，无论过滤与否
    try { if (e && typeof e.preventDefault==='function') e.preventDefault(); } catch(_){}
    try { if (e && typeof e.stopPropagation==='function') e.stopPropagation(); } catch(_){}
    return true; // 🚨 强制最后一行 return true
  });
  // 防止 localStorage 满 / 读写异常冒泡
  const _origLSGet = window.Storage.prototype.getItem;
  const _origLSSet = window.Storage.prototype.setItem;
  try {
    window.Storage.prototype.getItem = function(k) { try { return _origLSGet.call(this, k); } catch(e) { return null; } };
    window.Storage.prototype.setItem = function(k,v) { try { _origLSSet.call(this, k, v); return true; } catch(e) { return false; } };
  } catch(_) {}
})();

// -------- 登录流程启动 --------
let _booted = false;
async function bootLoginFlow() {
  if (_booted) return;
  _booted = true;
  /* =========================================================
     【卡住 & 模糊 强清障 守卫】
     - 移除所有"残留遮罩层"（mobileMask / lightbox / 未关闭的 modal）
     - Windows + 非 100% DPI 下：全局关闭 backdrop-filter，避免混合缩放使人眼感觉"发虚模糊"
     - 移除 body / sidebar 所有陈旧类名
     ========================================================= */
  (function guardCleanup(){
    try {
      ['mobileMask','_lightboxBox','_lbOverlay'].forEach(id => document.getElementById(id)?.remove());
      document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
      document.querySelector('.sidebar')?.classList.remove('mobile-open');
      document.body.classList.remove('sidebar-open');
      document.documentElement.classList.remove('sidebar-open');
      // DPI 守卫：Windows / Chrome + 缩放 125/150% 时 backdrop-filter 会让页面有"一层薄雾"的模糊感
      const dpr = window.devicePixelRatio || 1;
      const isWin = /Windows/i.test(navigator.userAgent) || /Win/i.test(navigator.platform);
      const blurIntolerant = isWin && Math.abs(dpr - Math.round(dpr)) > 0.001; // 1.25 / 1.5
      if (blurIntolerant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const style = document.createElement('style');
        style.textContent = `*,*::before,*::after{ backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: none !important; }`;
        document.head.appendChild(style);
      }
      // 像素级清晰：高 DPI + 整数缩放时仍开启 subpixel
      const crisp = document.createElement('style');
      crisp.textContent = `html,body{ text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`;
      document.head.appendChild(crisp);
      // 卡死保护：1.2s 后若还没有可交互内容（例如登录弹窗没显示出来），自动强制移除 mask + 恢复滚动
      setTimeout(() => {
        try {
          if (document.body.style.overflow) document.body.style.overflow = '';
          document.getElementById('mobileMask')?.remove();
          // 只有当前会话已确认登录时才允许强制关闭弹窗，避免旧 session 绕过登录
          const sess = load('lh_session', null);
          if (State.currentUser && sess && sess.uname) document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
        } catch(e){}
      }, 1200);
    } catch(e){}
  })();

  try {
  // ⚠️ 关键修复：不再 await pullAll，改为后台异步拉取，确保登录界面立即显示
  // 之前 await 会导致 Supabase 响应慢时登录界面永远出不来
  try {
    if (window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
      // 带 5 秒超时的后台拉取，不阻塞登录流程
      Promise.race([
        window.SupabaseSync.pullAll({ noRefresh: true }),
        new Promise(resolve => setTimeout(() => resolve(false), 5000))
      ]).then(() => {
        try {
          // 拉取完成后刷新用户列表，如果登录界面还开着就更新 Tab
          State.users = State.users || load('users', null) || [];
          const loginModal = document.getElementById('loginModal');
          if (loginModal && loginModal.classList.contains('show') && State.users.length > 0) {
            switchLoginTab('login');
          }
        } catch(_) {}
      }).catch(() => {});
    }
  } catch(e) {}

  State.users = State.users || load('users', null) || [];
  State.currentUser = null;
  purgeLegacyDemoAuth();

  // 正式版禁用旧演示模式标记，避免手机端继续自动进入“老板（演示）”
  try {
    if (localStorage.getItem('lh_force_demo') === '1') {
      localStorage.removeItem('lh_force_demo');
    }
  } catch(e){}

  // 记住登录恢复（30 天内免登：localStorage + cookie 双保险）
  const sess = loadSession();
  if (sess && sess.uname) {
    State.users = State.users || load('users', null) || [];
    const u = State.users.find(x => x.username === sess.uname && x.status === 'active');
    if (u) {
      State.currentUser = u;
      // 登录恢复成功后，启动 15s 轮询 + 同步引擎
      try { SyncRuntime.autoSyncOn = localStorage.getItem('lhn_lh_autosync') !== '0' && localStorage.getItem('lh_autosync') !== '0'; } catch(_) {}
      try { startSyncPolling(); } catch(_) {}
      _afterLoginOk(false);
      return;
    }
  }
  // 没有账号：要求初始化老板（默认显示注册 Tab）
  showLogin(!State.users.length);
  } catch(err) {
    console.error('[bootLoginFlow] 启动失败:', err);
    // 兜底：确保至少显示登录界面，不让用户卡在白屏
    try { showLogin(State.users && State.users.length > 0 ? false : true); } catch(_){
      try { const m = document.getElementById('loginModal'); if (m) m.classList.add('show'); } catch(_){}
    }
  }
}

// -------- 登录弹窗 --------
function showLogin(forceRegister) {
  const m = document.getElementById('loginModal');
  if (m) m.classList.add('show');
  switchLoginTab(forceRegister ? 'register' : 'login');
}
function switchLoginTab(t) {
  const tabs = document.querySelectorAll('#loginModal [data-ltab]');
  tabs.forEach(el => el.classList.toggle('active', el.dataset.ltab === t));
  const lg = document.getElementById('lt-login'), rg = document.getElementById('lt-register');
  if (lg) lg.style.display = t === 'login' ? '' : 'none';
  if (rg) rg.style.display = t === 'register' ? '' : 'none';
  if (t === 'login') setTimeout(()=>document.getElementById('lg_username')?.focus(),120);
  else setTimeout(()=>document.getElementById('rg_username')?.focus(),120);
}

// -------- 初始化老板账号 --------
function initBoss() {
  const $ = id => (document.getElementById(id)?.value || '').trim();
  const uname = $('rg_username'), shop = $('rg_shop') || 'LH Nail',
        real = $('rg_realname'), phone = $('rg_phone'),
        p1 = $('rg_password'), p2 = $('rg_password2');
  State.users = State.users || load('users', null) || [];
  purgeLegacyDemoAuth();
  const hasOwner = activeRows(State.users || []).some(u => u.role === 'owner' && (u.status || 'active') === 'active');
  if (hasOwner) {
    alert('已存在老板账号，不能重复初始化老板账号。请直接登录，或登录后在「设置 → 账号与权限」新增/修改账号。');
    switchLoginTab('login');
    return;
  }
  if (!uname) return alert('请输入老板用户名');
  if (!real) return alert('请输入老板姓名');
  if (!p1 || p1.length < 6) return alert('密码至少 6 位');
  if (p1 !== p2) return alert('两次密码不一致');
  const boss = {
    id: 'U-' + Date.now(),
    username: uname,
    realName: real,
    phone: phone,
    role: 'owner',
    status: 'active',
    password: hashPwd(p1),
    remark: '店铺老板 / 超级管理员',
    createdAt: Date.now(),
    lastLogin: null
  };
  State.users = [boss].concat((State.users || []).filter(u => u.role !== 'owner'));
  save('users', State.users);
  if (shop) { State.settings = State.settings || {}; State.settings.shopName = shop; save('settings', State.settings); }
  State.currentUser = boss;
  // 【📱 登录态持久化 30 天】初始化老板也写一次，避免首次在手机上初始化完又"像恢复出厂"
  const sess = { uname:boss.username, expiresAt: Date.now() + 30*86400*1000, expire: Date.now() + 30*86400*1000, loginAt: Date.now() };
  save('lh_session', sess);
  persistSession(sess);
  try { SyncRuntime.autoSyncOn = localStorage.getItem('lhn_lh_autosync') !== '0' && localStorage.getItem('lh_autosync') !== '0'; } catch(_) {}
  try { startSyncPolling(); } catch(_) {}
  alert('✅ 老板账号初始化成功！现在进入工作台');
  _afterLoginOk(true);
}

// -------- 登录 --------
async function tryLogin() {
  const uname = (document.getElementById('lg_username')?.value || '').trim();
  const pwd   = document.getElementById('lg_password')?.value || '';
  const rem   = document.getElementById('lg_remember')?.checked !== false;
  if (!uname || !pwd) return alert('请输入用户名和密码');
  let u = activeRows(State.users).find(x => x.username === uname);
  if (!u && window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
    try {
      // 带 5 秒超时，防止 Supabase 响应慢导致登录卡死
      await Promise.race([
        window.SupabaseSync.pullAll({ noRefresh: true }),
        new Promise(resolve => setTimeout(() => resolve(false), 5000))
      ]);
      State.users = State.users || load('users', null) || [];
      u = activeRows(State.users).find(x => x.username === uname);
    } catch(e) {}
  }
  if (!u) {
    const userCount = activeRows(State.users || []).length;
    if (userCount === 0) {
      return alert('❌ 当前手机还没有账号数据。\n\n如果已配置 Supabase，请确认 supabase-config.js 已填写 URL / anon key，并已在电脑端登录或点击同步，把账号推送到云端。\n\n如果还没配置 Supabase，请先在电脑端「设置 → 多端同步」生成同步文件，然后在手机登录页导入。');
    }
    return alert('❌ 当前设备没有找到这个用户名。\n\n请确认用户名是否和电脑端完全一致；如果这是电脑端新建的账号，请先确认电脑端已推送到 Supabase，或重新导出同步文件并在手机登录页导入。');
  }
  if (u.status !== 'active') return alert('❌ 该账号已被禁用，请联系老板');
  if (!checkPwd(pwd, u.password)) return alert('❌ 密码错误');
  u.lastLogin = Date.now();
  save('users', State.users);
  State.currentUser = u;
  // 【📱 登录态持久化 30 天】localStorage + cookie 双保险（cookie 在 PWA 清理缓存后仍保留）
  if (rem) {
    const sess = { uname:u.username, expiresAt: Date.now() + 30*86400*1000, expire: Date.now() + 30*86400*1000, loginAt: Date.now() };
    save('lh_session', sess);
    persistSession(sess);
  } else {
    try { localStorage.removeItem('lh_session'); } catch(e){}
    clearSession();
  }
  // 启动 15s 轮询 + 同步指纹
  try { SyncRuntime.autoSyncOn = localStorage.getItem('lhn_lh_autosync') !== '0' && localStorage.getItem('lh_autosync') !== '0'; } catch(_) {}
  try { startSyncPolling(); } catch(_) {}
  _afterLoginOk(false);
}

function _afterLoginOk(firstInit) {
  const m = document.getElementById('loginModal');
  if (m) m.classList.remove('show');
  // 顶栏角色 chip
  const chip = document.getElementById('roleChip');
  if (chip && State.currentUser) {
    const r = ROLE_META[State.currentUser.role] || ROLE_META.owner;
    document.getElementById('roleAv').textContent = r.av;
    document.getElementById('roleAv').style.background = 'linear-gradient(135deg,'+r.color+',#fff)';
    document.getElementById('roleName').textContent = r.label;
    document.getElementById('roleUser').textContent = State.currentUser.realName || State.currentUser.username;
    chip.style.display = 'inline-flex';
  }
  // 真正执行 init
  try {
    if (typeof init === 'function') init();
  } catch(e) {
    console.error('[init] 初始化失败:', e);
    try { toast('页面初始化遇到问题，但不影响已保存数据', 'error', 3000); } catch(_){}
  }
  // 登录后立即从云端拉取最新数据（不等15秒轮询）
  setTimeout(() => { try { immediateCloudSync(); } catch(_) {} }, 800);
  // 数据恢复模式：?recover=1 触发全量数据恢复
  setTimeout(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('recover') === '1') {
        _fullDataRecovery();
      }
    } catch(_) {}
  }, 2000);
  setTimeout(() => {
    try { populateMemberSelects(); } catch(e) { console.warn('populateMemberSelects:', e); }
    try { renderLevelCounts(); } catch(e) { console.warn('renderLevelCounts:', e); }
    try { renderUserTable(); } catch(e) { console.warn('renderUserTable:', e); }
    try { applyRolePermissionsUI(); } catch(e) { console.warn('applyRolePermissionsUI:', e); }
    try { renderDeviceSyncUI(); } catch(_){}
    try { if (typeof renderCloudSyncUI === 'function') renderCloudSyncUI(); } catch(_){}
    try { updateSyncStatusBar(window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady(), false); } catch(_){}
    try { if (State.page === 'stats') renderStats(); } catch(e) { console.warn('renderStats:', e); }
    try { if (State.page === 'income') renderIncome(); } catch(e) { console.warn('renderIncome:', e); }
    try { if (State.page === 'expense') renderExpense(); } catch(e) { console.warn('renderExpense:', e); }
    try { if (State.page === 'monthlyReport') renderMonthlyReport(); } catch(e) { console.warn('renderMonthlyReport:', e); }
  }, 160);
  if (firstInit) {
    // 新初始化，刷新统计页 mini 数据
    setTimeout(()=>{ try { if (typeof renderDashboard === 'function') renderDashboard(); } catch(e){} }, 300);
  }
}

// -------- 登出 --------
function logout() {
  if (!confirm('确定要退出登录吗？')) return;
  logoutUI();
  showLogin(false);
}
function logoutUI() {
  State.currentUser = null;
  try { localStorage.removeItem('lh_session'); } catch(e){}
  clearSession();
  const chip = document.getElementById('roleChip');
  if (chip) chip.style.display = 'none';
}
// 登录框 × 按钮：智能关闭（如果是首次初始化未建账号则提示）
function tryCloseLoginModal() {
  const m = document.getElementById('loginModal');
  // 正式版：未登录时不允许关闭登录框，避免绕过登录直接进入首页
  const hasUsers = State.users && State.users.length > 0;
  const remembered = !!loadSession();
  if (State.currentUser && (hasUsers || remembered)) {
    m?.classList.remove('show');
    return;
  }
  alert('请先登录，或切到「首次初始化老板账号」创建老板账号。');
  if (!hasUsers) switchLoginTab('register');
}
// 🧹 一键清除登录缓存（解决"登录挡住了进不去"）
function oneClickClearLogin() {
  try {
    clearSession();
    localStorage.removeItem('lhn_lh_session');
    localStorage.removeItem('lh_session');
    localStorage.removeItem('lh_force_demo');
    purgeLegacyDemoAuth();
    // 不删账号数据，只清记住登录 + 强制刷新
    document.getElementById('lg_username').value = '';
    document.getElementById('lg_password').value = '';
    State.currentUser = null;
    document.getElementById('roleChip') && (document.getElementById('roleChip').style.display='none');
    toast('✅ 已清缓存！请重新输入账号密码登录，或切到右边 Tab「首次初始化老板账号」', 'success', 2600);
    setTimeout(() => {
      if (!State.users || State.users.length === 0) switchLoginTab('register');
      else switchLoginTab('login');
    }, 400);
  } catch(e) { alert('清缓存失败：' + e.message); }
}
// 正式版已禁用演示模式，保留函数名仅防止旧 HTML/缓存调用时报错
function skipToDemoMode() {
  purgeLegacyDemoAuth();
  alert('正式版已关闭演示模式。请初始化老板账号或使用已有账号登录。');
  showLogin(!(State.users && State.users.length));
}
async function forgotPassword() {
  const uname = prompt('请输入要重置密码的用户名：');
  if (!uname) return;
  State.users = State.users || load('users', null) || [];
  let u = State.users.find(x => x.username === uname.trim());
  // 本地没找到 → 尝试从 Supabase 拉取
  if (!u && window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
    try {
      await window.SupabaseSync.pullAll({ noRefresh: true });
      State.users = State.users || load('users', null) || [];
      u = State.users.find(x => x.username === uname.trim());
    } catch(e) {}
  }
  if (!u) {
    alert('❌ 未找到用户名「' + uname + '」。\n\n请确认用户名拼写正确。如果是电脑端新建的账号，请确保电脑端已同步到 Supabase 云端。');
    return;
  }
  if (u.status !== 'active') {
    alert('❌ 该账号已被禁用，无法重置密码。');
    return;
  }
  const np = prompt('为「' + (u.realName || u.username) + '」设置新密码（至少 6 位）：');
  if (np === null) return;
  if (np.length < 6) return alert('❌ 密码至少 6 位');
  const np2 = prompt('请再次输入新密码以确认：');
  if (np2 === null) return;
  if (np !== np2) return alert('❌ 两次输入的密码不一致');
  u.password = hashPwd(np);
  u.updatedAt = Date.now();
  u.syncVersion = (Number(u.syncVersion) || 1) + 1;
  save('users', State.users);
  alert('✅ 密码重置成功！\n\n现在请用新密码登录。');
  const nameInput = document.getElementById('lg_username');
  const pwdInput = document.getElementById('lg_password');
  if (nameInput) nameInput.value = u.username;
  if (pwdInput) { pwdInput.value = ''; setTimeout(() => pwdInput.focus(), 120); }
}

// -------- 权限控制：UI 层面（技师只读） --------
function applyRolePermissionsUI() {
  // 技师：隐藏/禁用删除、定价编辑、导入导出清空、新建账号等
  const isOwner = hasPerm('*');
  const isStaff = State.currentUser?.role === 'staff';
  // 定价按钮隐藏
  document.querySelectorAll('[onclick*="openPriceModal"]').forEach(b => {
    if (b.tagName) b.style.display = isStaff ? 'none' : '';
  });
  // 数据备份恢复：仅老板
  const setsCards = document.querySelectorAll('#page-settings .settings-card');
  // 最后一张是备份恢复（index 靠后）
  setsCards.forEach(c => {
    const h = c.querySelector('h3')?.textContent || '';
    if (h.includes('备份')) c.style.display = isOwner ? '' : 'none';
    if (h.includes('账号与权限')) {
      // 新建账号按钮仅老板
      const btns = c.querySelectorAll('.settings-card-head button');
      btns.forEach(b => {
        if ((b.textContent||'').includes('新建账号')) b.style.display = isOwner ? '' : 'none';
      });
    }
  });
}

// -------- 用户 CRUD --------
let _editingUserId = null;
function openUserModal(id) {
  if (!hasPerm('*')) return alert('仅老板可以管理账号');
  _editingUserId = id || null;
  document.getElementById('umTitle').textContent = id ? '👥 编辑账号' : '👥 新建账号';
  const u = id ? State.users.find(x => x.id === id) : null;
  const $ = i => document.getElementById(i);
  $('um_username').value = u?.username || '';
  $('um_role').value     = u?.role || 'staff';
  $('um_realname').value = u?.realName || '';
  $('um_phone').value    = u?.phone || '';
  $('um_password').value = '';
  $('um_password').placeholder = u ? '留空表示不修改原密码' : '≥6 位';
  $('um_status').value   = u?.status || 'active';
  $('um_remark').value   = u?.remark || '';
  document.getElementById('userModal').classList.add('show');
}
function closeUserModal() {
  document.getElementById('userModal').classList.remove('show');
}
function saveUser() {
  const $ = i => (document.getElementById(i)?.value || '').trim();
  const uname = $('um_username'), role = $('um_role'),
        real = $('um_realname'), phone = $('um_phone'),
        pwd  = document.getElementById('um_password')?.value || '',
        status = $('um_status'), remark = $('um_remark');
  State.users = State.users || [];
  if (!uname) return alert('请输入用户名');
  if (!real) return alert('请输入真实姓名');
  if (!['owner','manager','staff'].includes(role)) return alert('角色非法');
  // 唯一性
  const exist = State.users.find(x => x.username === uname && x.id !== _editingUserId);
  if (exist) return alert('该用户名已被占用');
  if (_editingUserId) {
    const u = State.users.find(x => x.id === _editingUserId);
    if (!u) return;
    if (u.id === State.currentUser?.id && status !== 'active') return alert('⚠️ 不能禁用当前登录账号');
    const nextUsers = State.users.map(x => x.id === _editingUserId ? { ...x, username: uname, role, realName: real, phone, status, remark } : x);
    if (!nextUsers.some(x => x.role === 'owner' && x.status === 'active')) return alert('⚠️ 至少保留 1 个启用的老板账号');
    u.username = uname; u.role = role; u.realName = real; u.phone = phone;
    u.status = status; u.remark = remark;
    if (pwd) {
      if (pwd.length < 6) return alert('密码至少 6 位');
      u.password = hashPwd(pwd);
    }
    u.updatedAt = Date.now();
    if (u.id === State.currentUser?.id) {
      State.currentUser = u;
      const sess = { uname:u.username, expiresAt: Date.now() + 30*86400*1000, expire: Date.now() + 30*86400*1000, loginAt: Date.now() };
      save('lh_session', sess);
      persistSession(sess);
    }
  } else {
    if (!pwd || pwd.length < 6) return alert('密码至少 6 位');
    State.users.push({
      id: 'U-' + Date.now(),
      username: uname, realName: real, phone, role,
      status, password: hashPwd(pwd), remark,
      createdAt: Date.now(), lastLogin: null
    });
  }
  save('users', State.users);
  closeUserModal();
  renderUserTable();
  alert('✅ 保存成功');
}
function resetUserPwd(id) {
  if (!hasPerm('*')) return;
  const u = State.users.find(x => x.id === id);
  if (!u) return;
  const np = prompt('为 ' + (u.realName||u.username) + ' 设置新密码（至少6位）：');
  if (np === null) return;
  if (np.length < 6) return alert('密码至少 6 位');
  u.password = hashPwd(np);
  save('users', State.users);
  alert('✅ 密码已重置');
}
function toggleUserStatus(id) {
  if (!hasPerm('*')) return;
  const u = State.users.find(x => x.id === id);
  if (!u) return;
  if (u.id === State.currentUser?.id && u.status === 'active') {
    return alert('⚠️ 不能禁用当前登录账号');
  }
  if (u.role === 'owner' && activeRows(State.users).filter(x=>x.role==='owner').length <= 1 && u.status === 'active') {
    return alert('⚠️ 至少保留 1 个老板账号可用');
  }
  if (u.role === 'owner' && u.status === 'active' && activeRows(State.users).filter(x=>x.role==='owner' && x.status === 'active').length <= 1) {
    return alert('⚠️ 至少保留 1 个启用的老板账号');
  }
  u.status = u.status === 'active' ? 'disabled' : 'active';
  save('users', State.users);
  renderUserTable();
}
function deleteUser(id) {
  if (!hasPerm('*')) return;
  const u = State.users.find(x => x.id === id);
  if (!u) return;
  if (u.id === State.currentUser?.id) return alert('⚠️ 不能删除当前登录账号');
  if (u.role === 'owner' && activeRows(State.users).filter(x=>x.role==='owner').length <= 1) {
    return alert('⚠️ 至少保留 1 个老板账号');
  }
  if (u.role === 'owner' && u.status === 'active' && activeRows(State.users).filter(x=>x.role==='owner' && x.status === 'active').length <= 1) {
    return alert('⚠️ 至少保留 1 个启用的老板账号');
  }
  if (!confirm('确定删除账号 ' + (u.realName||u.username) + '？此操作不可撤销')) return;
  softDeleteRecord(u, '删除账号');
  save('users', State.users);
  renderUserTable();
}
function renderUserTable() {
  const tb = document.querySelector('#userTable tbody');
  if (!tb) return;
  const visibleUsers = activeRows(State.users);
  if (!visibleUsers.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">暂无账号（请先登录/初始化）</td></tr>';
    return;
  }
  tb.innerHTML = visibleUsers.map(u => {
    const r = ROLE_META[u.role] || ROLE_META.staff;
    const last = u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '从未登录';
    return `<tr>
      <td style="font-weight:600;">${escapeHtml(u.username)}</td>
      <td><span class="tag" style="background:${r.color}22;color:${r.color};border-color:${r.color}55;">${r.av} ${r.label}</span></td>
      <td>${escapeHtml(u.realName||'-')}</td>
      <td>${u.status === 'active'
          ? '<span class="tag" style="background:#E8F6F0;color:#54A181;border-color:#CDE3D3;">✅ 启用</span>'
          : '<span class="tag" style="background:#FCECEC;color:#C75A5A;border-color:#F2CFCF;">🚫 禁用</span>'}</td>
      <td style="color:var(--muted);font-size:12px;">${last}</td>
      <td style="white-space:nowrap;">
        <button class="btn-ghost xsmall" onclick="openUserModal('${u.id}')">编辑</button>
        <button class="btn-ghost xsmall" onclick="resetUserPwd('${u.id}')">重置密码</button>
        <button class="btn-ghost xsmall" onclick="toggleUserStatus('${u.id}')">${u.status==='active'?'禁用':'启用'}</button>
        <button class="btn-ghost xsmall" onclick="deleteUser('${u.id}')" style="color:#C75A5A;border-color:#F2CFCF;">删除</button>
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   14. 数据备份 / 恢复（第二阶段）
   ============================================================ */
const BACKUP_KEYS = [
  'appointments','customers','memberTxns','members',
  'manualIncomes','expenses',
  'prices','calColors','colorTypes','settings','users','auditLogs','images'
];
function exportAllData() {
  if (!hasPerm('*')) return alert('仅老板可以导出数据');
  const exportedAt = new Date().toISOString();
  const data = {
    _meta: {
      app: 'LH Nail 美甲工作台',
      version: '2.0',
      shop: State.settings?.shopName || 'LH Nail',
      exportedAt,
      byUser: State.currentUser?.username || 'unknown'
    }
  };
  BACKUP_KEYS.forEach(k => {
    data[k] = State[k] || load(k, null) || (k === 'prices' ? DEFAULT_PRICES : (k==='calColors'?DEFAULT_CAL_COLORS:null));
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fn = `LH-Nail-备份-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
  a.href = url; a.download = fn;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  State.settings = State.settings || {};
  State.settings.lastBackupAt = exportedAt;
  State.settings.lastBackupFile = fn;
  save('settings', State.settings);
  addAuditLog('数据备份', `导出全部数据：${fn}`);
  renderDataMaintenance();
  toast('✅ 备份文件已导出：' + fn);
}
function importAllData(ev) {
  if (!hasPerm('*')) return alert('仅老板可以恢复数据');
  const f = ev.target.files?.[0];
  if (!f) return;
  if (!confirm('即将用备份文件覆盖当前全部数据（预约/会员/顾客/收支/定价/账号），是否继续？\n\n建议：先导出当前数据作为二次备份')) return;
  const fr = new FileReader();
  fr.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('JSON 格式错误');
      BACKUP_KEYS.forEach(k => {
        if (data[k] !== undefined) {
          State[k] = data[k];
          save(k, data[k]);
        }
      });
      // 登出后重新进入
      State.currentUser = null;
      try { localStorage.removeItem('lh_session'); } catch(e){}
      alert('✅ 数据恢复成功！\n导出时间：' + (data._meta?.exportedAt||'未知') + '\n请重新登录');
      location.reload();
    } catch (err) {
      alert('❌ 恢复失败：' + err.message);
    } finally {
      ev.target.value = '';
    }
  };
  fr.readAsText(f, 'utf-8');
}
// 清空业务数据使用的 key（保留 账号 users / 定价 prices / 配色 calColors,colorTypes / 设置 settings）
const CLEAR_DATA_KEYS = ['appointments','customers','memberTxns','members','manualIncomes','expenses','auditLogs','images'];
function clearAllData() {
  if (!hasPerm('*')) return alert('仅老板可以清空数据');
  if (!confirm('⚠️⚠️⚠️ 即将清空【所有业务数据】\n\n包括：所有预约、顾客、会员、充值扣卡记录、手动收入、支出、审计日志、预约参考图\n\n账号、定价、日程配色、店铺设置会保留。\n\n此操作不可逆！是否继续？')) return;
  if (!confirm('二次确认：真的要清空所有业务数据吗？\n\n建议先点「导出全部数据」做备份！')) return;
  CLEAR_DATA_KEYS.forEach(k => {
    try { localStorage.removeItem(k); } catch(e){}
    State[k] = null;
  });
  // 🔥 同步清空云端业务数据（权威覆盖，防止旧数据从云端再次拉回复活）
  // ⚠️ 必须等云端清空请求全部完成后再刷新页面：否则刷新会中断请求，云端旧数据会在下次打开时被拉回
  clearAllDataSync();
}

async function clearAllDataSync() {
  const ok = await _pushCloudClear();
  alert(ok
    ? '✅ 已清空所有业务数据（账号与配置保留），页面将重新加载'
    : '⚠️ 本地已清空，但云端清空未完成（网络异常）。页面将重新加载，若数据仍存在请再次重试');
  location.reload();
}

// 直接写空数组到 Supabase（绕过 pushKey 的空数组合并保护，权威覆盖云端）
async function _pushCloudClear() {
  try {
    const cfg = getSupabaseConfig();
    if (!cfg.enabled || !cfg.url || !cfg.anonKey) return false;
    const endpoint = cfg.url.replace(/\/+$/, '') + '/rest/v1/' + (cfg.table || 'lh_nail_sync');
    const clearAt = Date.now();
    const body = CLEAR_DATA_KEYS.map(k => ({
      workspace_id: cfg.workspaceId, data_key: k, data: [], updated_at: new Date().toISOString()
    }));
    // 同时写入「全局清空标记」，其他设备打开时自动清空本地
    body.push({ workspace_id: cfg.workspaceId, data_key: 'syncMeta', data: { clearAt }, updated_at: new Date().toISOString() });
    const tasks = body.map(item => {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([item])
      }).then(r => ({ ok: r.ok })).catch(() => ({ ok: false }));
    });
    const results = await Promise.all(tasks);
    const ok = results.every(r => r.ok);
    if (ok) {
      try { localStorage.setItem('lhn_clear_seen', String(clearAt)); } catch(e){}
    }
    return ok;
  } catch(e) { return false; }
}

/* ============================================================
   14.5 数据维护中心：自检 / 重复检测 / 备份提示 / 旧数据整理 / 审计日志
   ============================================================ */
function ensureAuditLogs() {
  if (!Array.isArray(State.auditLogs)) State.auditLogs = load('auditLogs', []);
  if (!Array.isArray(State.auditLogs)) State.auditLogs = [];
  return State.auditLogs;
}
function addAuditLog(type, detail, refId = '', meta = {}) {
  try {
    const logs = ensureAuditLogs();
    logs.unshift({
      id: genId('LOG'),
      time: new Date().toISOString(),
      user: State.currentUser?.username || 'unknown',
      type,
      detail,
      refId,
      meta
    });
    State.auditLogs = logs.slice(0, 500);
    save('auditLogs', State.auditLogs);
    if (!window.__LH_SILENT_SAVE) renderAuditLogs();
    if (!window.__LH_SILENT_SAVE) renderRecentActivity();
  } catch(e) {}
}
function _auditDotColor(type) {
  if (String(type || '').includes('到期')) return 'gold';
  if (String(type || '').includes('收款') || String(type || '').includes('充值')) return 'green';
  if (String(type || '').includes('预约')) return 'blue';
  if (String(type || '').includes('删除') || String(type || '').includes('撤销')) return 'gray';
  return 'blue';
}
function renderRecentActivity() {
  const box = document.getElementById('recentActivityList');
  if (!box) return;
  const logs = ensureAuditLogs().slice(0, 6);
  if (!logs.length) {
    box.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted);font-size:13px;border:1.5px dashed #E7EEF5;border-radius:14px;background:#FAFCFE;">
      暂无最近动态，完成预约、充值或扣卡后会在这里显示。
    </div>`;
    return;
  }
  box.innerHTML = logs.map(log => {
    const d = new Date(log.time || Date.now());
    const time = isNaN(d) ? '' : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const color = _auditDotColor(log.type);
    return `<div class="tl-item">
      <div class="tl-time">${escapeHtml(time)}</div>
      <div class="tl-dot ${color}"></div>
      <div class="tl-content">
        <div class="tl-title">${escapeHtml(log.type || '系统动态')}</div>
        <div class="tl-desc">${escapeHtml(log.detail || '')}</div>
      </div>
    </div>`;
  }).join('');
}
function _customerKey(c) {
  return c?.id || c?.phone || c?.name || '';
}
function _customerStatsFromRecords(c) {
  const rows = [];
  activeRows(State.appointments).forEach(a => {
    if (!isActualIncomeAppt(a) || !_apptMatchesCustomer(a, c)) return;
    rows.push({ date: (a.datetime || '').slice(0,10), amount: Number(a.finalTotal) || 0, source: 'appt', id: a.id });
  });
  activeRows(State.memberTxns).forEach(t => {
    if (t._auditOnly || t.type !== 'deduct' || Number(t.amount) <= 0) return;
    const cid = t.customerId || t.cid || '';
    if (cid !== c.id) return;
    const linkedDone = t.apptId && activeRows(State.appointments).some(a => a.id === t.apptId && isActualIncomeAppt(a));
    if (linkedDone) return;
    rows.push({ date: t.date || '', amount: Number(t.amount) || 0, source: 'deduct', id: t.id });
  });
  rows.sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  return {
    visits: rows.length,
    totalPaid: Math.round(rows.reduce((s,r) => s + r.amount, 0) * 100) / 100,
    firstVisit: rows[0]?.date || '',
    lastVisit: rows[rows.length - 1]?.date || ''
  };
}
function analyzeDataHealth() {
  const issues = [];
  const duplicates = [];
  const fixes = [];
  const appts = activeRows(State.appointments);
  const customers = activeRows(State.customers);
  const txns = activeRows(State.memberTxns);
  const imgs = activeRows(State.images || []);

  appts.forEach(a => {
    const st = normalizeApptStatus(a.status);
    if (a.status === 'serving') issues.push({ level:'warn', text:`预约 ${a.id} 仍是旧状态“服务中”，建议整理为“已确认”。`, fix:'legacy-status' });
    if (st === 'done' && !a.payMethod) issues.push({ level:'bad', text:`已完成预约 ${a.id} 缺少收款方式。`, fix:'legacy-pay' });
    if (a.deductId && !txns.some(t => t.id === a.deductId)) issues.push({ level:'bad', text:`预约 ${a.id} 关联的扣卡记录 ${a.deductId} 不存在。`, fix:'missing-deduct-link' });
    if (!a.customerId && _findCustomerForAppt(a)) issues.push({ level:'warn', text:`预约 ${a.id} 可以匹配顾客档案，但缺少 customerId 关联。`, fix:'customer-link' });
    if (!a.staffId && !a.serviceStaffId) issues.push({ level:'warn', text:`预约 ${a.id} 缺少服务人员/技师字段。`, fix:'staff-field' });
    if (!a.durationMinutes && !a.durationHours) issues.push({ level:'warn', text:`预约 ${a.id} 缺少预计时长，默认按 ${formatApptDurationHours(a)} 处理。`, fix:'duration-field' });
  });
  [['预约', appts], ['顾客', customers], ['会员交易', txns], ['手动收入', activeRows(State.manualIncomes)], ['支出', activeRows(State.expenses)], ['图片', imgs]].forEach(([label, arr]) => {
    arr.forEach(r => {
      ['id','createdAt','updatedAt','createdBy','updatedBy','deviceId','syncVersion'].forEach(f => {
        if (!r[f]) issues.push({ level:'warn', text:`${label} ${r.id || '未编号'} 缺少标准元字段 ${f}。`, fix:'meta-field' });
      });
    });
  });
  imgs.forEach(img => {
    const size = Number(img.size || String(img.url || img.data || '').length);
    if (size > 600000) issues.push({ level:'warn', text:`图片 ${img.id} 体积偏大（约 ${Math.round(size/1024)}KB），建议重新上传压缩图。`, fix:'large-image' });
  });

  txns.forEach(t => {
    const cid = t.customerId || t.cid || '';
    if ((t.type === 'deduct' || t.type === 'recharge') && cid && !customerById(cid)) {
      issues.push({ level:'bad', text:`会员交易 ${t.id} 找不到对应顾客 ${cid}。`, fix:'missing-customer' });
    }
    if (t.apptId && !appts.some(a => a.id === t.apptId)) {
      issues.push({ level:'warn', text:`会员交易 ${t.id} 关联的预约 ${t.apptId} 不存在。`, fix:'missing-appt' });
    }
  });

  customers.forEach(c => {
    const s = _customerStatsFromRecords(c);
    const diffVisits = Math.abs((Number(c.visits) || 0) - s.visits);
    const diffPaid = Math.abs((Number(c.totalPaid) || 0) - s.totalPaid);
    if (diffVisits || diffPaid > 0.01 || (s.lastVisit && c.lastVisit !== s.lastVisit)) {
      issues.push({ level:'warn', text:`顾客 ${c.name || c.id} 档案统计可能不一致：档案 ${c.visits || 0} 次/${fmtMoney(c.totalPaid || 0)}，按历史记录应为 ${s.visits} 次/${fmtMoney(s.totalPaid)}。`, fix:'customer-stats', cid:c.id });
    }
  });

  const seenAppt = new Map();
  appts.forEach(a => {
    if (!a.id) return;
    if (seenAppt.has(a.id)) duplicates.push(`重复预约编号：${a.id}`);
    seenAppt.set(a.id, true);
  });
  const seenTx = new Map();
  txns.forEach(t => {
    if (!t.id) return;
    if (seenTx.has(t.id)) duplicates.push(`重复会员交易编号：${t.id}`);
    seenTx.set(t.id, true);
  });
  const activeDeductByAppt = {};
  txns.forEach(t => {
    if (t.type !== 'deduct' || t._deleted || t._auditOnly || !t.apptId || Number(t.amount) <= 0) return;
    activeDeductByAppt[t.apptId] = activeDeductByAppt[t.apptId] || [];
    activeDeductByAppt[t.apptId].push(t.id);
  });
  Object.keys(activeDeductByAppt).forEach(apptId => {
    if (activeDeductByAppt[apptId].length > 1) duplicates.push(`预约 ${apptId} 有多笔有效扣卡记录：${activeDeductByAppt[apptId].join('、')}`);
  });
  appts.forEach(a => {
    const voids = (a.refundHistory || []).filter(Boolean);
    if (voids.length > 1) duplicates.push(`预约 ${a.id} 有 ${voids.length} 次撤销记录，请人工确认是否合理。`);
  });

  return { issues, duplicates, fixableCount: issues.filter(x => x.fix !== 'missing-customer' && x.fix !== 'missing-appt').length };
}
function renderDataMaintenance() {
  ensureAuditLogs();
  const lastBackup = State.settings?.lastBackupAt;
  const backupEl = document.getElementById('dmBackupStatus');
  const backupSub = document.getElementById('dmBackupSub');
  if (backupEl) backupEl.textContent = lastBackup ? new Date(lastBackup).toLocaleDateString('zh-CN') : '未备份';
  if (backupSub) backupSub.textContent = lastBackup ? `${new Date(lastBackup).toLocaleString('zh-CN')} · ${State.settings?.lastBackupFile || ''}` : '建议定期导出 JSON 备份';
  const auditCount = document.getElementById('dmAuditCount');
  if (auditCount) auditCount.textContent = `${State.auditLogs.length} 条`;
  const verEl = document.getElementById('dmAppVersion');
  const verSub = document.getElementById('dmVersionSub');
  if (verEl) verEl.textContent = State.appVersion || '1.0.12';
  if (verSub) verSub.textContent = `当前缓存版本：${State.appVersion || '1.0.12'} · 手机端如未更新可点“清缓存更新”`;
  renderAuditLogs();
}
function _renderHealthResult(report) {
  const box = document.getElementById('dataHealthResult');
  if (!box) return;
  const issueHtml = report.issues.length
    ? `<div class="mh-group"><div class="mh-title">数据异常 / 可修复项（${report.issues.length}）</div>${report.issues.map(i => `<div class="mh-item ${i.level === 'bad' ? 'bad' : 'warn'}"><span>${i.level === 'bad' ? '⚠️' : '提醒'}</span><div>${escapeHtml(i.text)}</div></div>`).join('')}</div>`
    : `<div class="mh-group"><div class="mh-item ok"><span>✓</span><div>未发现明显数据异常。</div></div></div>`;
  const dupHtml = report.duplicates.length
    ? `<div class="mh-group"><div class="mh-title">重复流水风险（${report.duplicates.length}）</div>${report.duplicates.map(t => `<div class="mh-item bad"><span>重复</span><div>${escapeHtml(t)}</div></div>`).join('')}</div>`
    : `<div class="mh-group"><div class="mh-item ok"><span>✓</span><div>未发现重复预约、重复扣卡或重复撤销风险。</div></div></div>`;
  box.innerHTML = issueHtml + dupHtml;
}
function runDataHealthCheck() {
  const report = analyzeDataHealth();
  const h = document.getElementById('dmHealthStatus');
  const hs = document.getElementById('dmHealthSub');
  const d = document.getElementById('dmDuplicateStatus');
  const ds = document.getElementById('dmDuplicateSub');
  const badCount = report.issues.filter(i => i.level === 'bad').length;
  if (h) h.textContent = report.issues.length ? `${report.issues.length} 项` : '正常';
  if (hs) hs.textContent = badCount ? `${badCount} 项需人工关注，${report.fixableCount} 项可尝试修复` : `${report.fixableCount} 项可优化`;
  if (d) d.textContent = report.duplicates.length ? `${report.duplicates.length} 项` : '正常';
  if (ds) ds.textContent = report.duplicates.length ? '建议人工核对重复项' : '未发现重复风险';
  _renderHealthResult(report);
  addAuditLog('数据自检', `发现异常 ${report.issues.length} 项，重复风险 ${report.duplicates.length} 项`);
}
async function forceAppUpdate() {
  if (!confirm('将清理本应用缓存，以便下次打开获取最新版。不会清除业务数据。\n\n清理完成后请手动关闭并重新打开工作台，继续吗？')) return;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(()=>{})));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.indexOf('lhnail') >= 0).map(k => caches.delete(k)));
    }
    addAuditLog('版本更新', `清缓存准备更新到 ${State.appVersion || '1.0.13'}`);
  } catch(e) {}
  toast('缓存已清理。请手动关闭并重新打开工作台', 'success', 5200);
  alert('✅ 缓存已清理完成。\n\n为了避免当前预览环境自动刷新崩溃，请手动关闭这个页面，再重新打开工作台。业务数据不会丢。');
}
function autoFixDataIssues() {
  if (!hasPerm('*')) return alert('仅老板可以执行数据修复');
  const before = analyzeDataHealth();
  if (!confirm(`将自动修复安全项：旧状态、预约顾客关联、缺失收款默认值、顾客统计重算、重复扣卡软标记。\n\n当前检测到异常 ${before.issues.length} 项，继续吗？`)) return;
  let fixed = 0;
  (State.appointments || []).forEach(a => {
    if (a.status === 'serving') { a.status = 'confirmed'; fixed++; }
    normalizeRecordMeta(a, 'appointments');
    if (!a.durationMinutes) { a.durationMinutes = getApptDuration(a); fixed++; }
    if (!a.durationHours) { a.durationHours = Math.round((getApptDuration(a) / 60) * 100) / 100; fixed++; }
    if (!a.staffName && (a.staffId || a.serviceStaffId)) { a.staffName = staffNameById(a.staffId || a.serviceStaffId); fixed++; }
    const c = _findCustomerForAppt(a);
    if (!a.customerId && c) { a.customerId = c.id; fixed++; }
    if (normalizeApptStatus(a.status) === 'done' && !a.payMethod) {
      a.payMethod = a.member ? '储值卡扣' : '未记录';
      a.payAmount = Number(a.finalTotal) || 0;
      a.completedPayAt = a.doneAt || a.datetime || new Date().toISOString();
      fixed++;
    }
  });
  (State.customers || []).forEach(c => {
    normalizeRecordMeta(c, 'customers');
    const s = _customerStatsFromRecords(c);
    if ((Number(c.visits) || 0) !== s.visits || Math.abs((Number(c.totalPaid) || 0) - s.totalPaid) > 0.01 || c.lastVisit !== s.lastVisit || c.firstVisit !== s.firstVisit) {
      c.visits = s.visits;
      c.totalPaid = s.totalPaid;
      c.firstVisit = s.firstVisit || c.firstVisit || '';
      c.lastVisit = s.lastVisit || '';
      fixed++;
    }
  });
  const byAppt = {};
  (State.memberTxns || []).forEach(t => {
    normalizeRecordMeta(t, 'memberTxns');
    if (t.type !== 'deduct' || t._deleted || t._auditOnly || !t.apptId || Number(t.amount) <= 0) return;
    byAppt[t.apptId] = byAppt[t.apptId] || [];
    byAppt[t.apptId].push(t);
  });
  Object.values(byAppt).forEach(list => {
    if (list.length <= 1) return;
    list.sort((a,b) => String(a.id).localeCompare(String(b.id)));
    list.slice(1).forEach(t => {
      softDeleteRecord(t, '数据自检：同预约重复扣卡软标记');
      fixed++;
    });
  });
  save('appointments', State.appointments);
  save('customers', State.customers);
  save('memberTxns', State.memberTxns);
  save('manualIncomes', normalizeCoreCollection('manualIncomes', State.manualIncomes || []));
  save('expenses', normalizeCoreCollection('expenses', State.expenses || []));
  save('images', normalizeCoreCollection('images', State.images || []));
  refreshAllCustomerViews();
  try { renderIncome(); renderDashboardSummary(); renderOverviewStats(); } catch(e) {}
  const after = analyzeDataHealth();
  _renderHealthResult(after);
  addAuditLog('数据修复', `自动修复 ${fixed} 处；剩余异常 ${after.issues.length} 项，重复风险 ${after.duplicates.length} 项`);
  toast(`已修复 ${fixed} 处数据`, 'success');
}
function renderAuditLogs() {
  const el = document.getElementById('auditLogList');
  if (!el) return;
  const logs = ensureAuditLogs().slice(0, 80);
  const cnt = document.getElementById('dmAuditCount');
  if (cnt) cnt.textContent = `${State.auditLogs.length} 条`;
  if (!logs.length) {
    el.innerHTML = `<div class="mh-empty">暂无审计日志。</div>`;
    return;
  }
  el.innerHTML = logs.map(l => `
    <div class="audit-log-item">
      <div class="audit-log-time">${new Date(l.time).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
      <div class="audit-log-type">${escapeHtml(l.type || '')}</div>
      <div class="audit-log-detail">${escapeHtml(l.detail || '')}${l.user ? ` · ${escapeHtml(l.user)}` : ''}</div>
    </div>
  `).join('');
}
function exportAuditLogs() {
  const logs = ensureAuditLogs();
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  const pad = n => String(n).padStart(2,'0');
  a.href = url;
  a.download = `LH-Nail-审计日志-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  toast('审计日志已导出', 'success');
}
function clearAuditLogs() {
  if (!hasPerm('*')) return alert('仅老板可以清空审计日志');
  if (!confirm('确认清空审计日志？建议先导出留档。')) return;
  State.auditLogs = [];
  save('auditLogs', State.auditLogs);
  renderDataMaintenance();
  toast('审计日志已清空', 'success');
}

/* ============================================================
   15. 统计模块（第二阶段）renderStats
   ============================================================ */
function renderStats() {
  const rangeKey = document.getElementById('stRange')?.value || 'month';
  const range = getRange(rangeKey);
  const inRange0 = (dt) => inRange(dt, range);

  // 收入流水
  const incAll = buildIncomeRecords().filter(r => inRange0(r.datetime || r.date));
  const rev = incAll.reduce((s,r) => s + r.amount, 0);
  const bizRev = incAll.filter(r => r.bizRevenue).reduce((s,r) => s + r.amount, 0);
  const rech   = incAll.filter(r => r.recharge).reduce((s,r) => s + r.amount, 0);
  const manualInc = incAll.filter(r => r.manual).reduce((s,r) => s + r.amount, 0);

  // 支出
  const expAll = activeRows(State.expenses).filter(e => inRange0(e.date));
  const exp = expAll.reduce((s,e) => s + (Number(e.amount)||0), 0);

  // 订单：⚠️「已完成」已移除，改为未取消预约
  const ords = activeRows(State.appointments).filter(a => a.status !== 'canceled' && inRange0(a.datetime));
  const orders = ords.length;
  const avg = orders ? (bizRev / orders) : 0;

  // 利润
  const profit = rev - exp;
  const profitRate = rev > 0 ? (profit / rev * 100) : 0;

  // 新增会员（range 内升级/开通付费会员的）—— 会员信息统一存在 State.customers（带 level 字段）里
  const memsInRange = activeRows(State.customers).filter(c => {
    if (!c.level || c.level === '') return false;
    const t = Number(c.createdAt) || (c.firstVisit ? new Date(c.firstVisit).getTime() : 0);
    return inRange0(t);
  });
  const totalMem = activeRows(State.customers).filter(c => c.level && c.level !== '').length;

  // 新增顾客（首次到店在 range 内）——直接从 State.customers 读取（顾客档案字段：firstVisit / visits / lastVisit / totalPaid）
  const cusInRange = activeRows(State.customers).filter(c => {
    if (!c.firstVisit) return false;
    const t = new Date(c.firstVisit).getTime();
    return inRange0(t);
  });
  const totalCust = activeRows(State.customers).length;
  // 回头客：range 内 ≥ 2 次到店（按顾客 id 聚合）
  const visits = {};
  ords.forEach(o => {
    const cid = o.customerId || ('n::' + (o.customer||'未命名'));
    visits[cid] = (visits[cid] || 0) + 1;
  });
  const backCnt = Object.values(visits).filter(n => n >= 2).length;
  const retRate = orders > 0 ? (backCnt / Math.max(1, Object.keys(visits).length) * 100) : 0;

  // 环比：上一个区间
  const prevRange = getPrevRange(rangeKey);
  const inPrev = (dt) => inRange(dt, prevRange);
  const prevRev = buildIncomeRecords().filter(r => inPrev(r.datetime||r.date)).reduce((s,r)=>s+r.amount,0);
  const prevExp = activeRows(State.expenses).filter(e => inPrev(e.date)).reduce((s,e)=>s+(Number(e.amount)||0),0);
  const prevOrd = activeRows(State.appointments).filter(a => a.status !== 'canceled' && inPrev(a.datetime)).length;
  const pct = (cur, prev) => {
    if (prev === 0) return cur === 0 ? '0%' : '+100%';
    const v = (cur - prev) / prev * 100;
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  };

  // ---- 指标卡填值 ----
  const setM = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = '¥ ' + Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2}); };
  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const setTrend = (id, cur, prev, invert) => {
    const el = document.getElementById(id); if (!el) return;
    const v = prev === 0 ? (cur===0?0:1) : (cur - prev) / Math.abs(prev);
    const txt = pct(cur, prev);
    let cls = '';
    if (invert) {
      // 支出：升=坏
      if (v > 0) cls = 'down'; else if (v < 0) cls = 'up';
    } else {
      if (v > 0) cls = 'up'; else if (v < 0) cls = 'down';
    }
    el.className = 'stat-card-trend ' + cls;
    el.textContent = txt;
  };
  setM('stRev', rev);      setTrend('stRevTrend', rev, prevRev, false);
  setM('stExp', exp);      setTrend('stExpTrend', exp, prevExp, true);
  setM('stProfit', profit);
  const pt = document.getElementById('stProfitTrend');
  if (pt) {
    const prevProf = prevRev - prevExp;
    if (prevProf === 0 && profit === 0) pt.textContent = '0%';
    else if (prevProf === 0) pt.textContent = (profit>=0?'+':'-') + '100%';
    else { const v = (profit - prevProf) / Math.abs(prevProf) * 100;
           pt.textContent = (v>=0?'+':'') + v.toFixed(1) + '%';
           pt.className = 'stat-card-trend ' + (v>=0?'up':'down'); }
  }
  setT('stProfitRate', profitRate.toFixed(1) + '%');
  setT('stOrd', orders + ' 单');   setTrend('stOrdTrend', orders, prevOrd, false);
  setT('stAvg', '¥ ' + avg.toFixed(0));
  setT('stNewMem', memsInRange.length + ' 人');
  setT('stMemTotal', totalMem + ' 人');
  setT('stNewCus', cusInRange.length + ' 人');
  setT('stRetRate', retRate.toFixed(1) + '%');

  // mini 柱状：最近 14 天营收
  renderMiniBar('stRevBar', lastNDaysRevenue(14, false), false);
  renderMiniBar('stExpBar', lastNDaysExpense(14), true);

  // ---- 营收趋势图：本年 12 个月 ----
  renderRevTrendChart();

  // ---- 美甲 vs 美睫（收入维度） ----
  const nailAmt = incAll.filter(r => r.type==='appt-nail').reduce((s,r)=>s+r.amount,0);
  const lashAmt = incAll.filter(r => r.type==='appt-lash').reduce((s,r)=>s+r.amount,0);
  const deductAmt = incAll.filter(r => r.type==='deduct').reduce((s,r)=>s+r.amount,0);
  const otherAmt = rev - nailAmt - lashAmt - deductAmt;
  renderBizChart(nailAmt, lashAmt, deductAmt, rech, manualInc);

  // ---- 项目排行榜 ----
  renderItemRank(ords);

  // ---- 会员消费 TOP10 ----
  renderMemberRank(incAll);

  // ---- 回头客分析（近 6 个月） ----
  renderRepeatChart();
}

// mini 柱状
function renderMiniBar(id, arr, isExp) {
  const el = document.getElementById(id); if (!el) return;
  el.className = 'stat-mini-bar' + (isExp ? ' exp' : '');
  const max = Math.max(...arr, 1);
  el.innerHTML = arr.map(v => {
    const h = Math.max(2, Math.round(v / max * 26));
    return `<i style="height:${h}px;"></i>`;
  }).join('');
}
function lastNDaysRevenue(n, incAllBuild) {
  const arr = new Array(n).fill(0);
  const today = new Date(); today.setHours(0,0,0,0);
  const records = buildIncomeRecords();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - (n-1-i) * 86400000);
    const dStr = localDateStr(d);
    arr[i] = records.filter(r => (r.datetime||r.date||'').slice(0,10) === dStr)
                    .reduce((s,r) => s + r.amount, 0);
  }
  return arr;
}
function lastNDaysExpense(n) {
  const arr = new Array(n).fill(0);
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() - (n-1-i) * 86400000);
    const dStr = localDateStr(d);
    arr[i] = activeRows(State.expenses).filter(e => e.date === dStr).reduce((s,e)=>s+(Number(e.amount)||0),0);
  }
  return arr;
}

// 营收趋势：本年 12 个月
function renderRevTrendChart() {
  const box = document.getElementById('stRevTrendChart'); if (!box) return;
  const now = new Date();
  const Y = now.getFullYear();
  const labels = [], revA = [], expA = [], profitA = [];
  const incAll = buildIncomeRecords();
  for (let m = 0; m < 12; m++) {
    labels.push((m+1) + '月');
    const s = new Date(Y, m, 1).getTime();
    const e = new Date(Y, m+1, 1).getTime() - 1;
    revA.push(incAll.filter(r => {
      const t = r.time || new Date(r.datetime||r.date).getTime();
      return t >= s && t <= e;
    }).reduce((sum,r)=>sum+r.amount,0));
    expA.push(activeRows(State.expenses).filter(x => {
      const t = new Date(x.date).getTime();
      return t >= s && t <= e;
    }).reduce((sum,x)=>sum+(Number(x.amount)||0),0));
    profitA.push(revA[m] - expA[m]);
  }
  const max = Math.max(...revA, ...expA, 1);
  const colHtml = (i) => {
    const revH  = Math.max(2, revA[i]/max*100);
    const expH  = Math.max(2, expA[i]/max*100);
    const profH = Math.max(2, Math.max(0, profitA[i])/max*100);
    const tip = `${labels[i]}\n营收 ¥${revA[i].toFixed(0)}\n支出 ¥${expA[i].toFixed(0)}\n净利 ¥${profitA[i].toFixed(0)}`;
    return `<div class="bar-col" title="${tip}">
      <div class="bar"   style="height:${revH}%;"></div>
      <div class="bar exp" style="height:${expH}%;"></div>
      <div class="bar profit" style="height:${profH}%;"></div>
      <span class="bar-label">${labels[i]}</span>
    </div>`;
  };
  box.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap;font-size:12px;color:var(--ink-2);">
      <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(180deg,#5AA9D9,#8CC3E3);border-radius:2px;margin-right:6px;"></i>营收</span>
      <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(180deg,#E49292,#E9B0B0);border-radius:2px;margin-right:6px;"></i>支出</span>
      <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(180deg,#7CC4A4,#A8D8C2);border-radius:2px;margin-right:6px;"></i>净利润</span>
    </div>
    <div class="bar-chart">${labels.map((_,i)=>colHtml(i)).join('')}</div>`;
}

// 美甲 vs 美睫 饼图
function renderBizChart(nail, lash, deduct, rech, other) {
  const box = document.getElementById('stBizChart'); if (!box) return;
  const total = Math.max(1, nail + lash + deduct + rech + other);
  const items = [
    { name:'美甲预约',   v: nail,  c:'#5AA9D9' },
    { name:'美睫预约',   v: lash,  c:'#E6A5B2' },
    { name:'会员扣卡',   v: deduct,c:'#7CC4A4' },
    { name:'会员充值',   v: rech,  c:'#8F82C7' },
    { name:'其他收入',   v: other, c:'#E7B866' }
  ];
  // 累计百分比
  let acc = 0;
  const stops = items.filter(it => it.v > 0).map(it => {
    const s = (acc / total * 100).toFixed(3) + '%';
    acc += it.v;
    const e = (acc / total * 100).toFixed(3) + '%';
    return `${it.c} ${s} ${e}`;
  }).join(', ');
  const donutStyle = stops ? ('background:conic-gradient(from 0deg, ' + stops + ');') : '';
  const legend = items.map(it => {
    const p = (it.v / total * 100).toFixed(1);
    return `<div class="row"><span><span class="dot" style="background:${it.c};"></span>${escapeHtml(it.name)}</span><span style="font-weight:600;">¥ ${Number(it.v).toLocaleString('zh-CN',{maximumFractionDigits:0})} <small style="color:var(--muted);font-weight:400;">(${p}%)</small></span></div>`;
  }).join('');
  box.innerHTML = `<div class="donut-row">
    <div class="donut" style="${donutStyle}">
      <div class="donut-center">
        <div style="font-size:11px;color:var(--muted);">总收入</div>
        <div style="font-size:18px;font-weight:700;color:var(--ink);margin-top:2px;">¥${Number(total).toLocaleString('zh-CN',{maximumFractionDigits:0})}</div>
      </div>
    </div>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

// 项目排行榜
function renderItemRank(ords) {
  const box = document.getElementById('stItemRank'); if (!box) return;
  const map = {};
  ords.forEach(a => {
    const biz = a.biz === 'lash' ? '美睫' : '美甲';
    let name = (a.styleName || a.lashName || '未命名');
    if (a.tipName) name += ' · ' + a.tipName;
    if (a.removeNailName) name += ' + 卸甲';
    if (a.removeLashName) name += ' + 卸睫';
    const key = biz + '｜' + name;
    map[key] = map[key] || { name:key, amt:0, cnt:0 };
    map[key].amt += Number(a.finalTotal) || 0;
    map[key].cnt += 1;
  });
  const arr = Object.values(map).sort((a,b)=>b.amt - a.amt).slice(0,10);
  const max = Math.max(1, arr[0]?.amt || 1);
  if (!arr.length) { box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">暂无数据（完成的预约会出现在这里）</div>'; return; }
  box.innerHTML = `<div class="rank-list">${arr.map((it, i) => `
    <div class="rank-item ${i<3?'top'+(i+1):''}">
      <span class="rank-no">${i+1}</span>
      <span class="rank-name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)} <small style="color:var(--muted);font-weight:400;">· ${it.cnt}单</small></span>
      <span class="rank-bar"><span style="width:${(it.amt/max*100).toFixed(1)}%;"></span></span>
      <span class="rank-amt">¥ ${Number(it.amt).toLocaleString('zh-CN',{maximumFractionDigits:0})}</span>
    </div>`).join('')}</div>`;
}

// 会员消费 TOP 10
function renderMemberRank(incAll) {
  const box = document.getElementById('stMemberRank'); if (!box) return;
  const map = {};
  incAll.filter(r => r.customerId).forEach(r => {
    const mid = r.customerId;
    const m = customerById(mid);
    const lvLabel = m && m.level ? memberLabel(m.level).label : '';
    const name = m ? (m.name + (lvLabel && lvLabel !== '非会员' ? `（${lvLabel}）` : '') ) : (r.customer || '未知顾客');
    map[mid] = map[mid] || { name, amt:0, cnt:0 };
    map[mid].amt += r.amount;
    map[mid].cnt += 1;
  });
  const arr = Object.values(map).sort((a,b)=>b.amt-a.amt).slice(0,10);
  const max = Math.max(1, arr[0]?.amt || 1);
  if (!arr.length) { box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">暂无会员消费数据</div>'; return; }
  box.innerHTML = `<div class="rank-list">${arr.map((it,i)=>`
    <div class="rank-item ${i<3?'top'+(i+1):''}">
      <span class="rank-no">${i+1}</span>
      <span class="rank-name">${escapeHtml(it.name)} <small style="color:var(--muted);font-weight:400;">· ${it.cnt} 次</small></span>
      <span class="rank-bar"><span style="width:${(it.amt/max*100).toFixed(1)}%;background:linear-gradient(90deg,#8F82C7,#B6AADC);"></span></span>
      <span class="rank-amt">¥ ${Number(it.amt).toLocaleString('zh-CN',{maximumFractionDigits:0})}</span>
    </div>`).join('')}</div>`;
}

// 回头客分析（近 6 个月）
function renderRepeatChart() {
  const box = document.getElementById('stRepeatChart'); if (!box) return;
  const now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
  const rows = [];
  for (let i = 5; i >= 0; i--) {
    const ym = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const s = ym.getTime();
    const e = new Date(ym.getFullYear(), ym.getMonth()+1, 1).getTime() - 1;
    const ords = activeRows(State.appointments).filter(a => a.status !== 'canceled' && (new Date(a.datetime).getTime() >= s) && (new Date(a.datetime).getTime() <= e));
    const visits = {};
    ords.forEach(o => { const cid = o.customerId || ('n::'+(o.customer||'未命名')); visits[cid]=(visits[cid]||0)+1; });
    const totalCus = Object.keys(visits).length;
    const back = Object.values(visits).filter(n => n >= 2).length;
    const brandNew = totalCus - back;
    rows.push({ label: ym.getFullYear() + '/' + String(ym.getMonth()+1).padStart(2,'0'), totalCus, back, brandNew, total: ords.length });
  }
  const tot = Math.max(1, ...rows.map(r => r.totalCus));
  box.innerHTML = `<div class="seg-bars">${rows.map(r => {
    const newW = (r.brandNew / tot * 100).toFixed(1) + '%';
    const backW = (r.back / tot * 100).toFixed(1) + '%';
    return `<div class="seg-row">
      <div class="seg-label">${r.label}</div>
      <div class="seg-track">
        <div class="s-new"  style="width:${newW};"></div>
        <div class="s-back" style="width:${backW};"></div>
      </div>
      <div class="seg-nums">新客 <b>${r.brandNew}</b> · 回头 <b>${r.back}</b> · 共 ${r.totalCus}</div>
    </div>`;
  }).join('')}
  <div style="display:flex;gap:16px;font-size:12px;color:var(--ink-2);margin-top:6px;">
    <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(90deg,#8CC3E3,#5AA9D9);border-radius:2px;margin-right:6px;"></i>本月新增顾客</span>
    <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(90deg,#7CC4A4,#54A181);border-radius:2px;margin-right:6px;"></i>本月回头客（≥2 次）</span>
  </div>
  </div>`;
}

/* ============================================================
   本月报表（快捷入口）独立 render
   ============================================================ */
function mrMonthRange() {
  const sel = document.getElementById('mrMonth');
  let ym = sel?.value || '';
  if (!ym) {
    const d = new Date();
    ym = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  const [Y, M] = ym.split('-').map(Number);
  const s = new Date(Y, M-1, 1); s.setHours(0,0,0,0);
  const e = new Date(Y, M, 1); e.setHours(0,0,0,0); e.setTime(e.getTime()-1);
  return { ym, Y, M, s, e };
}
function inTimeRange(t, s, e) { return t >= s.getTime() && t <= e.getTime(); }
function fillMonthOptions() {
  const sel = document.getElementById('mrMonth'); if (!sel) return;
  if (sel.dataset.inited === '1') return;
  sel.dataset.inited = '1';
  const now = new Date();
  const cur = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const opts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.getFullYear() + '年' + (d.getMonth()+1) + '月';
    opts.push(`<option value="${v}" ${v===cur?'selected':''}>${label}</option>`);
  }
  sel.innerHTML = opts.join('');
}
function mrDonutChart(boxId, title, items, centerLabel, centerValue) {
  const box = document.getElementById(boxId); if (!box) return;
  const total = items.reduce((s,i)=>s+Number(i.v||0),0);
  if (total <= 0) { box.innerHTML = `<div style="padding:28px;text-align:center;color:var(--muted);font-size:13px;">暂无${title || '数据'}</div>`; return; }
  let acc = 0;
  const stops = items.filter(i=>Number(i.v||0)>0).map(it => {
    const s = (acc/total*100).toFixed(3) + '%';
    acc += Number(it.v||0);
    const e = (acc/total*100).toFixed(3) + '%';
    return `${it.c} ${s} ${e}`;
  }).join(', ');
  const donutStyle = stops ? ('background:conic-gradient(from 0deg, ' + stops + ');') : '';
  const legend = items.map(it => {
    const p = total>0 ? ((Number(it.v||0)/total)*100).toFixed(1) : '0.0';
    return `<div class="row"><span><span class="dot" style="background:${it.c};"></span>${escapeHtml(it.name)}</span><span style="font-weight:600;">¥ ${Number(it.v||0).toLocaleString('zh-CN',{maximumFractionDigits:0})} <small style="color:var(--muted);font-weight:400;">(${p}%)</small></span></div>`;
  }).join('');
  box.innerHTML = `<div class="donut-row">
    <div class="donut" style="${donutStyle}">
      <div class="donut-center">
        <div style="font-size:11px;color:var(--muted);">${centerLabel || '合计'}</div>
        <div style="font-size:18px;font-weight:700;color:var(--ink);margin-top:2px;">¥${Number(centerValue||total).toLocaleString('zh-CN',{maximumFractionDigits:0})}</div>
      </div>
    </div>
    <div class="donut-legend">${legend}</div>
  </div>`;
}
function renderProfitTrend(boxId, {ym, Y, M}) {
  const box = document.getElementById(boxId); if (!box) return;
  const labels = [], revA = [], expA = [], profitA = [];
  const incAll = buildIncomeRecords();
  // 选中年 + 前 5 个月
  for (let i = 5; i >= 0; i--) {
    const ymDate = new Date(Y, M-1 - i, 1);
    const label = (ymDate.getMonth()+1) + '月';
    labels.push(label);
    const s = new Date(ymDate.getFullYear(), ymDate.getMonth(), 1).getTime();
    const e = new Date(ymDate.getFullYear(), ymDate.getMonth()+1, 1).getTime() - 1;
    const rev = incAll.filter(r => {
      const t = r.time || new Date(r.datetime||r.date).getTime();
      return t >= s && t <= e;
    }).reduce((sum,r)=>sum+r.amount,0);
    const exp = activeRows(State.expenses).filter(x => {
      const t = new Date(x.date).getTime();
      return t >= s && t <= e;
    }).reduce((sum,x)=>sum+(Number(x.amount)||0),0);
    revA.push(rev); expA.push(exp); profitA.push(rev - exp);
  }
  const max = Math.max(...revA, ...expA, 1);
  const colHtml = (i) => {
    const revH  = Math.max(2, revA[i]/max*100);
    const expH  = Math.max(2, expA[i]/max*100);
    const profH = Math.max(2, Math.max(0, profitA[i])/max*100);
    const tip = `${labels[i]}\n收入 ¥${revA[i].toFixed(0)}\n支出 ¥${expA[i].toFixed(0)}\n利润 ¥${profitA[i].toFixed(0)}`;
    return `<div class="bar-col" title="${tip}">
      <div class="bar"         style="height:${revH}%;"></div>
      <div class="bar exp"     style="height:${expH}%;"></div>
      <div class="bar profit"  style="height:${profH}%;"></div>
      <span class="bar-label">${labels[i]}</span>
    </div>`;
  };
  const curIdx = 5; // 选中月高亮
  box.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap;font-size:12px;color:var(--ink-2);">
      <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(180deg,#5AA9D9,#8CC3E3);border-radius:2px;margin-right:6px;"></i>收入</span>
      <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(180deg,#E49292,#E9B0B0);border-radius:2px;margin-right:6px;"></i>支出</span>
      <span><i style="display:inline-block;width:10px;height:10px;background:linear-gradient(180deg,#7CC4A4,#A8D8C2);border-radius:2px;margin-right:6px;"></i>净利润</span>
      <span style="margin-left:auto;color:var(--accent);font-weight:600;">→ 当前选中 ${Y}年${M}月（高亮第 ${curIdx+1} 根）</span>
    </div>
    <div class="bar-chart">${labels.map((_,i)=>colHtml(i)).join('')}</div>`;
}
function renderMonthlyReport() {
  fillMonthOptions();
  const {ym, Y, M, s, e} = mrMonthRange();
  const inRange = (t) => inTimeRange(t, s, e);
  const incAll = buildIncomeRecords().filter(r => inRange(r.time || new Date(r.datetime||r.date).getTime()));
  const expAll = activeRows(State.expenses).filter(e => inRange(new Date(e.date).getTime()));
  const ords   = activeRows(State.appointments).filter(a => a.status !== 'canceled' && inRange(new Date(a.datetime).getTime()));
  const income   = incAll.reduce((s,r)=>s+r.amount,0);
  const bizRev   = incAll.filter(r => r.bizRevenue).reduce((s,r)=>s+r.amount,0);
  const rech     = incAll.filter(r => r.recharge).reduce((s,r)=>s+r.amount,0);
  const manual   = incAll.filter(r => r.manual).reduce((s,r)=>s+r.amount,0);
  const expense  = expAll.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const profit   = income - expense;
  const ordDone  = ords.length;
  const customers = new Set(ords.map(a => a.customerId || ('n::'+(a.customer||'未命名')))).size;
  const deductCount = activeRows(State.memberTxns).filter(t => {
    if (t._auditOnly) return false;
    if (t._reversed) return false;
    if ((t.subtype || '').includes('冲正') || (t.subtype || '').includes('撤销')) return false;
    return t.type === 'deduct' && inRange(new Date(t.date).getTime());
  }).length;
  const avgOrder   = ordDone > 0 ? bizRev / ordDone : 0;
  const newCustCount = activeRows(State.customers).filter(c => {
    const t = new Date(c.createdAt||c.firstVisit||'').getTime();
    return inRange(t);
  }).length;

  // 8 指标卡
  const cards = [
    { id:'mr1', icon:'💰', label:'总收入',     value:fmtMoney(income),   cls:'sc-income', trend:`共 ${incAll.length} 笔流水` },
    { id:'mr2', icon:'📈', label:'营业收入',   value:fmtMoney(bizRev),   cls:'',        trend:`${ordDone} 个完成订单` },
    { id:'mr3', icon:'💳', label:'会员充值',   value:fmtMoney(rech),     cls:'',        trend:`铂金/钻石储值本金` },
    { id:'mr4', icon:'📝', label:'手动收入',   value:fmtMoney(manual),   cls:'',        trend:`非业务类其他收入` },
    { id:'mr5', icon:'💸', label:'总支出',     value:fmtMoney(expense),  cls:'sc-expense',trend:`共 ${expAll.length} 笔支出` },
    { id:'mr6', icon:'💎', label:'净利润',     value:fmtMoney(profit),   cls: profit<0 ? 'sc-expense' : '', trend: profit>=0 ? `利润率 ${income>0?(profit/income*100).toFixed(1):'0.0'}%` : '亏损，请注意控制支出' },
    { id:'mr7', icon:'👥', label:'到店顾客数', value:String(customers),  cls:'',        trend:`新增顾客 ${newCustCount} 人` },
    { id:'mr8', icon:'🧮', label:'客单价',     value:fmtMoney(avgOrder), cls:'',        trend:`含扣卡 ${deductCount} 单` }
  ];
  const el = document.getElementById('mrMetrics');
  if (el) {
    el.innerHTML = cards.map(c => `
      <div class="stat-card ${c.cls||''}">
        <div class="stat-card-top">
          <span class="stat-card-label">${c.icon} ${c.label}</span>
          <span class="stat-card-trend up" style="${c.cls?.includes('sc-expense')?'color:#C75A5A;background:#FCE9E9;border-color:#F2CFCF;':''}">${c.trend}</span>
        </div>
        <div class="stat-card-num money">${c.value}</div>
      </div>
    `).join('');
  }
  // 1) 收入/支出/利润 6 月趋势
  renderProfitTrend('mrProfitTrend', {ym, Y, M});
  // 2) 收入来源环形
  const nailAmt   = incAll.filter(r => r.type==='appt-nail').reduce((s,r)=>s+r.amount,0);
  const lashAmt   = incAll.filter(r => r.type==='appt-lash').reduce((s,r)=>s+r.amount,0);
  const deductAmt = incAll.filter(r => r.type==='deduct').reduce((s,r)=>s+r.amount,0);
  const rechAmt   = incAll.filter(r => r.type==='recharge').reduce((s,r)=>s+r.amount,0);
  const otherAmt  = income - nailAmt - lashAmt - deductAmt - rechAmt;
  mrDonutChart('mrSourceChart','本月收入来源', [
    { name:'美甲预约', v: nailAmt,   c:'#5AA9D9' },
    { name:'美睫预约', v: lashAmt,   c:'#E6A5B2' },
    { name:'会员扣卡', v: deductAmt, c:'#7CC4A4' },
    { name:'会员充值', v: rechAmt,   c:'#8F82C7' },
    { name:'其他收入', v: Math.max(0,otherAmt), c:'#E7B866' }
  ], '本月收入', income);
  // 3) 美甲 vs 美睫
  mrDonutChart('mrBizChart','业务构成', [
    { name:'美甲预约', v: nailAmt, c:'#5AA9D9' },
    { name:'美睫预约', v: lashAmt, c:'#E6A5B2' }
  ], '业务收入', nailAmt + lashAmt);
  // 4) 支出分类
  const expMap = {};
  expAll.forEach(e => { const cat = e.category || 'other'; expMap[cat] = (expMap[cat]||0) + Number(e.amount||0); });
  const expColors = { gel:'#B48EAD', lash:'#7EBEDD', ornament:'#E4C084', tool:'#7CC4A4', rent:'#C7958D', utility:'#8F82C7', salary:'#E7B866', other:'#BFC7CF' };
  const expItems = Object.keys(expMap).map(k => ({ name: EXP_CAT_META[k]?.label || k, v: expMap[k], c: expColors[k] || '#BFC7CF' })).sort((a,b)=>b.v-a.v);
  mrDonutChart('mrExpCatChart','本月支出分类', expItems, '本月支出', expense);
  // TOP 榜
  renderItemRankTo('mrTopItems', ords);
  renderMemberRankTo('mrTopMembers', incAll);
  // 明细表：预约收入
  const apptBody = document.getElementById('mrApptBody');
  const apptCnt  = document.getElementById('mrApptCount');
  if (apptCnt) apptCnt.textContent = `共 ${ords.length} 条 · 实付合计 ${fmtMoney(nailAmt + lashAmt)}`;
  if (apptBody) {
    if (!ords.length) apptBody.innerHTML = `<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--muted);">${Y}年${M}月暂无完成预约</td></tr>`;
    else apptBody.innerHTML = ords.map(a => {
      const tk = apptTypeKey(a);
      const meta = CAL_TYPE_META.find(m => m.key===tk) || CAL_TYPE_META[0];
      const biz = a.biz==='lash'?'美睫':'美甲';
      const d = new Date(a.datetime);
      const t = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return `<tr>
        <td>${t}</td>
        <td>${escapeHtml(a.customer||'未填姓名')}</td>
        <td><span style="display:inline-flex;align-items:center;gap:4px;">${meta.icon||''} ${biz}</span></td>
        <td>${escapeHtml(apptTypeLabel(a))}</td>
        <td>${escapeHtml(a.payMethod || (a.member?'会员扣卡':'未填写'))}</td>
        <td style="font-weight:600;color:var(--accent-2);">${fmtMoney(Number(a.finalTotal)||0)}</td>
      </tr>`;
    }).join('');
  }
  const expBody = document.getElementById('mrExpBody');
  const expCnt  = document.getElementById('mrExpCount');
  if (expCnt) expCnt.textContent = `共 ${expAll.length} 条 · 合计 ${fmtMoney(expense)}`;
  if (expBody) {
    if (!expAll.length) expBody.innerHTML = `<tr><td colspan="6" style="padding:28px;text-align:center;color:var(--muted);">${Y}年${M}月暂无支出记录（在支出页点🛒记一笔支出录入进货额）</td></tr>`;
    else expBody.innerHTML = expAll.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e => {
      const meta = EXP_CAT_META[e.category] || EXP_CAT_META.other;
      return `<tr>
        <td>${escapeHtml(e.date||'')}</td>
        <td><span style="display:inline-flex;align-items:center;gap:4px;">${meta.label||e.category}</span></td>
        <td>${escapeHtml((e.supplier?'【'+e.supplier+'】':'') + (e.remark||'（无说明）'))}</td>
        <td>${escapeHtml(e.payMethod||'未填')}</td>
        <td style="font-family:Menlo,Consolas,monospace;color:var(--muted);font-size:12px;">${escapeHtml(e.refNo||'—')}</td>
        <td style="font-weight:600;color:#C75A5A;">${fmtMoney(Number(e.amount)||0)}</td>
      </tr>`;
    }).join('');
  }
}
function renderItemRankTo(id, ords) {
  const box = document.getElementById(id); if (!box) return;
  const map = {};
  ords.forEach(a => {
    const biz = a.biz === 'lash' ? '美睫' : '美甲';
    let name = (a.styleName || a.lashName || '未命名');
    if (a.tipName) name += ' · ' + a.tipName;
    if (a.removeNailName) name += ' + 卸甲';
    if (a.removeLashName) name += ' + 卸睫';
    const key = biz + '｜' + name;
    map[key] = map[key] || { name:key, amt:0, cnt:0 };
    map[key].amt += Number(a.finalTotal) || 0;
    map[key].cnt += 1;
  });
  const arr = Object.values(map).sort((a,b)=>b.amt - a.amt).slice(0,10);
  const max = Math.max(1, arr[0]?.amt || 1);
  if (!arr.length) { box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">暂无数据（完成的预约会出现在这里）</div>'; return; }
  box.innerHTML = arr.map((it, i) => `
    <div class="rank-item ${i<3?'top'+(i+1):''}">
      <span class="rank-no">${i+1}</span>
      <span class="rank-name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)} <small style="color:var(--muted);font-weight:400;">· ${it.cnt}单</small></span>
      <span class="rank-bar"><span style="width:${(it.amt/max*100).toFixed(1)}%;"></span></span>
      <span class="rank-amt">¥ ${Number(it.amt).toLocaleString('zh-CN',{maximumFractionDigits:0})}</span>
    </div>`).join('');
}
function renderMemberRankTo(id, incAll) {
  const box = document.getElementById(id); if (!box) return;
  const map = {};
  incAll.filter(r => r.customerId).forEach(r => {
    const mid = r.customerId;
    const m = customerById(mid);
    const lvLabel = m && m.level ? memberLabel(m.level).label : '';
    const name = m ? (m.name + (lvLabel && lvLabel !== '非会员' ? `（${lvLabel}）` : '') ) : (r.customer || '未知顾客');
    map[mid] = map[mid] || { name, amt:0, cnt:0 };
    map[mid].amt += r.amount;
    map[mid].cnt += 1;
  });
  const arr = Object.values(map).sort((a,b)=>b.amt-a.amt).slice(0,10);
  const max = Math.max(1, arr[0]?.amt || 1);
  if (!arr.length) { box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">暂无会员消费数据</div>'; return; }
  box.innerHTML = arr.map((it,i)=>`
    <div class="rank-item ${i<3?'top'+(i+1):''}">
      <span class="rank-no">${i+1}</span>
      <span class="rank-name">${escapeHtml(it.name)} <small style="color:var(--muted);font-weight:400;">· ${it.cnt} 次</small></span>
      <span class="rank-bar"><span style="width:${(it.amt/max*100).toFixed(1)}%;background:linear-gradient(90deg,#8F82C7,#B6AADC);"></span></span>
      <span class="rank-amt">¥ ${Number(it.amt).toLocaleString('zh-CN',{maximumFractionDigits:0})}</span>
    </div>`).join('');
}
function exportMonthlyReportCSV() {
  const {ym, Y, M, s, e} = mrMonthRange();
  const inRange = (t) => inTimeRange(t, s, e);
  const incAll = buildIncomeRecords().filter(r => inRange(r.time || new Date(r.datetime||r.date).getTime()));
  const expAll = (State.expenses||[]).filter(e => inRange(new Date(e.date).getTime()));
  // CSV 转义函数
  const csvCell = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [];
  lines.push(`LH Nail 月度报表,${Y}年${M}月`);
  lines.push('');
  lines.push('汇总指标');
  const income  = incAll.reduce((s,r)=>s+r.amount,0);
  const expense = expAll.reduce((s,e)=>s+(Number(e.amount)||0),0);
  lines.push(`总收入,${income.toFixed(2)}`);
  lines.push(`总支出,${expense.toFixed(2)}`);
  lines.push(`净利润,${(income-expense).toFixed(2)}`);
  lines.push('');
  lines.push('收入明细');
  lines.push('日期,类型,客户,说明,支付方式,金额');
  incAll.forEach(r => {
    lines.push([r.date||'', INC_TYPE_META[r.type]?.label||r.type, r.customer||'', r.desc||'', r.payMethod||'', r.amount.toFixed(2)].map(csvCell).join(','));
  });
  lines.push('');
  lines.push('支出明细');
  lines.push('日期,分类,供应商,说明,支付方式,单号,金额');
  expAll.forEach(x => {
    lines.push([x.date||'', EXP_CAT_META[x.category]?.label||x.category, x.supplier||'', x.remark||'', x.payMethod||'', x.refNo||'', Number(x.amount||0).toFixed(2)].map(csvCell).join(','));
  });
  const csv = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LH-Nail-月度报表-${ym}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('✅ 本月报表 CSV 已导出', 'success');
}

/* ============================================================
   16. 侧边栏控制（桌面端 展开/折叠 + 移动端 抽屉式遮罩）
   - 桌面端（>1080px）：body.sidebar-collapsed → sidebar 68px + main 同步缩小，无遮罩不遮挡
   - 移动端（≤1080px）：sidebar.mobile-open → 抽屉展开 + mobileMask 遮罩，点遮罩关闭
   - localStorage 记住用户偏好：lhn_sb_pref = expanded / collapsed
   ============================================================ */
function _sbIsDesktop() {
  const w = window.innerWidth || document.documentElement.clientWidth || 1920;
  return w > 1080;
}
function _sbGetPref() {
  try { return localStorage.getItem('lhn_sb_pref') || ''; } catch (e) { return ''; }
}
function _sbSetPref(p) {
  try { localStorage.setItem('lhn_sb_pref', p); } catch (e) {}
}
function _sbCloseDrawer() {
  const el = document.querySelector('.sidebar');
  el?.classList.remove('mobile-open');
  document.getElementById('mobileMask')?.remove();
  document.body.classList.remove('sidebar-open');
  document.documentElement.classList.remove('sidebar-open');
}
function _sbOpenDrawer() {
  const el = document.querySelector('.sidebar'); if (!el) return;
  document.querySelectorAll('#mobileMask, [id^="_lb"], ._sideMask').forEach(n => n.remove());
  let mask = document.getElementById('mobileMask');
  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'mobileMask';
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(12,28,46,0.58);z-index:209;';
    mask.addEventListener('click', () => _sbCloseDrawer());
    document.body.appendChild(mask);
  }
  el.classList.add('mobile-open');
  document.body.classList.add('sidebar-open');
  document.documentElement.classList.add('sidebar-open');
}
function _sbCollapseDesktop() {
  document.body.classList.add('sidebar-collapsed');
  document.documentElement.classList.add('sidebar-collapsed');
}
function _sbExpandDesktop() {
  document.body.classList.remove('sidebar-collapsed');
  document.documentElement.classList.remove('sidebar-collapsed');
}

function toggleSidebar() {
  const el = document.querySelector('.sidebar'); if (!el) return;
  if (_sbIsDesktop()) {
    // 桌面端：折叠 ↔ 展开，不创建遮罩（sidebar 始终在左侧不遮挡）
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    if (collapsed) { _sbExpandDesktop(); _sbSetPref('expanded'); }
    else           { _sbCollapseDesktop(); _sbSetPref('collapsed'); }
    // 确保桌面端不会残留 mobile-open/mask
    el.classList.remove('mobile-open');
    document.getElementById('mobileMask')?.remove();
  } else {
    // 移动端/平板：抽屉 ↔ 关闭（带遮罩）
    if (el.classList.contains('mobile-open')) _sbCloseDrawer();
    else _sbOpenDrawer();
  }
}

// 初始化：根据窗口尺寸 + 用户偏好，设置初始状态（保证页面一打开就不遮挡）
(function initSidebarState(){
  const desktop = _sbIsDesktop();
  const pref = _sbGetPref();
  if (desktop) {
    _sbCloseDrawer();
    if (pref === 'collapsed') _sbCollapseDesktop();
    else _sbExpandDesktop();  // 默认展开，空间足够
  } else {
    // ≤1080px：默认关闭抽屉，主体满屏不被遮挡（点击汉堡才弹出来）
    _sbCloseDrawer();
    _sbExpandDesktop();       // 清除 collapsed 状态（防止 68px 混乱）
  }
})();

// 窗口 resize：跨 1080px 断点时，强制切模式并清理状态
(function patchResizeGuard(){
  let tid = null;
  let lastDesktop = _sbIsDesktop();
  window.addEventListener('resize', () => {
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => {
      const nowDesktop = _sbIsDesktop();
      if (nowDesktop !== lastDesktop) {
        lastDesktop = nowDesktop;
        if (nowDesktop) {
          // 切到桌面端：关抽屉+按偏好折叠/展开
          _sbCloseDrawer();
          const pref = _sbGetPref();
          if (pref === 'collapsed') _sbCollapseDesktop(); else _sbExpandDesktop();
        } else {
          // 切到移动端：主体满屏，抽屉默认关闭，无遮挡
          _sbCloseDrawer();
          _sbExpandDesktop();
        }
      }
      // 始终清理桌面端的残留遮罩
      if (nowDesktop) {
        document.getElementById('mobileMask')?.remove();
      }
    }, 120);
  }, { passive: true });
})();

// 页面切换时自动关闭移动端侧栏抽屉（桌面端折叠状态保持用户偏好）
const _origNav = typeof navigateTo === 'function' ? navigateTo : null;
if (_origNav) {
  window.navigateTo = function(page) {
    if (!_sbIsDesktop()) _sbCloseDrawer();
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    _origNav(page);
    if (page === 'stats') setTimeout(renderStats, 50);
    if (page === 'settings') {
      setTimeout(renderUserTable, 50);
      setTimeout(renderDataMaintenance, 70);
    }
    if (page === 'monthlyReport') setTimeout(renderMonthlyReport, 50);
  };
}

// 旧版临时浮层提示：不能命名为 toast，避免覆盖上方统一 toast(msg,type,durationMs)
function floatingToast(msg, ms=1800) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;top:30px;transform:translateX(-50%);background:rgba(42,58,77,0.92);color:#fff;padding:10px 18px;border-radius:10px;z-index:9999;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,0.2);';
  document.body.appendChild(t);
  const dur = typeof ms === 'number' && ms > 0 ? ms : 1800;
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(), 320); }, dur);
}

// 设置页用户表格：页面切换时刷新
(function patchSettings(){
  const _origRender = typeof renderSettings === 'function' ? renderSettings : null;
  if (_origRender) {
    window.renderSettings = function() {
      _origRender();
      setTimeout(renderUserTable, 30);
      setTimeout(() => { if (typeof renderCloudSyncUI === 'function') renderCloudSyncUI(); }, 40);
      setTimeout(renderDataMaintenance, 60);
    };
  }
})();

/* ============================================================
   16. ☁️ 云端同步界面与日志（数据通道已统一为 Supabase，TRAE 归档已停用）
   - 数据通道：云同步统一走 Supabase（东京节点），save/load 只写 localStorage + Supabase；
     本模块保留云同步界面渲染、同步日志与「从云端拉取 / 立即同步」按钮。
   ============================================================ */
(function initCloudSync() {
  const LS_SETTINGS = 'lhn_cloud_settings';
  const LS_LOG = 'lhn_cloud_log';
  const DB_NAME = 'LHNailCloudArchive';
  const DB_VER = 1;
  const STORE = 'snapshots';

  // ---------- 设置默认值 ----------
  const defaultSettings = {
    enabled: false,       // TRAE 云端归档已停用：云同步只走 Supabase（见 save/load）
    mergeMode: 'auto',    // auto / newer / local / cloud
    lastSyncAt: 0,
    account: null,
  };
  function getSettings() {
    try { return Object.assign({}, defaultSettings, load(LS_SETTINGS.replace('lhn_',''), null) || {}); }
    catch (e) { return {...defaultSettings}; }
  }
  function setSettings(s) {
    try {
      // 避免递归调用 save → writeSnapshot：直接写 localStorage
      localStorage.setItem('lhn_' + LS_SETTINGS.replace('lhn_',''), JSON.stringify(s));
    } catch (e) {}
  }

  // ---------- IndexedDB：大容量本地归档库（云端快照池） ----------
  let _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (ev) => {
          const db = ev.target.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const st = db.createObjectStore(STORE, { keyPath: 'key' });
            st.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
    return _dbPromise;
  }
  async function dbPut(key, val) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const size = new Blob([JSON.stringify(val)]).size;
      st.put({ key, value: val, updatedAt: Date.now(), size });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbCount() {
    const db = await openDB();
    return new Promise(resolve => {
      const req = db.transaction(STORE,'readonly').objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result || 0);
    });
  }
  async function dbTotalSize() {
    const db = await openDB();
    return new Promise(resolve => {
      let total = 0;
      const cur = db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
      cur.onsuccess = (ev) => {
        const c = ev.target.result;
        if (!c) return resolve(total);
        total += (c.value.size || 0);
        c.continue();
      };
    });
  }
  async function dbAllKeys() {
    const db = await openDB();
    return new Promise(resolve => {
      const keys = [];
      const cur = db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
      cur.onsuccess = (ev) => {
        const c = ev.target.result;
        if (!c) return resolve(keys);
        keys.push(c.value);
        c.continue();
      };
    });
  }

  // ---------- 日志 ----------
  function pushLog(level, msg) {
    const now = new Date();
    const ts = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+' '+
               String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');
    try {
      const list = JSON.parse(localStorage.getItem(LS_LOG) || '[]');
      list.unshift({ level, msg, ts });
      while (list.length > 50) list.pop();
      localStorage.setItem(LS_LOG, JSON.stringify(list));
    } catch (e) {}
    // 同步刷新 UI
    if (typeof renderCloudLog === 'function') renderCloudLog();
  }

  // ---------- 合并策略 ----------
  function mergeValues(mode, local, remote, remoteTs) {
    if (mode === 'local') return local;
    if (mode === 'cloud') return remote != null ? remote : local;
    // newer / auto：数组以较长/较新者优先；对象深度合并 + 数组长度优先 + 标量以时间戳新者优先
    if (remote == null) return local;
    if (local == null) return remote;
    if (Array.isArray(local) && Array.isArray(remote)) {
      // auto: 合并去重（按 id 或整行）+ 新的优先
      const map = new Map();
      const pushItem = (arr) => arr.forEach(x => {
        const k = (x && typeof x === 'object' && x.id) ? x.id : JSON.stringify(x);
        const prev = map.get(k);
        if (!prev) map.set(k, x);
        else {
          const pT = Number(prev.updatedAt||prev.createdAt||0);
          const nT = Number(x.updatedAt||x.createdAt||0);
          if (nT > pT) map.set(k, x);
        }
      });
      pushItem(remote); pushItem(local);
      return Array.from(map.values());
    }
    if (typeof local === 'object' && typeof remote === 'object' && local !== null && remote !== null) {
      return Object.assign({}, remote, local);
    }
    // 标量：取更新的
    return (remoteTs > (localStorage.getItem('lhn__ts_') || 0)) ? remote : local;
  }

  // ---------- CloudSync 对外 API（save/load 里调用） ----------
  const snapCache = {};  // 内存缓存：key -> { value, updatedAt }
  window.CloudSync = {
    async writeSnapshot(key, val) {
      try {
        snapCache[key] = { value: val, updatedAt: Date.now() };
        await dbPut(key, val);
        const s = getSettings(); s.lastSyncAt = Date.now(); setSettings(s);
      } catch (e) { pushLog('ERROR', 'writeSnapshot 失败: key=' + key + ' ' + (e.message||e)); }
    },
    mergeSnapshot(key, local, def) {
      try {
        const s = getSettings();
        if (!s.enabled) return local != null ? local : def;
        // 优先内存缓存
        const cached = snapCache[key];
        let remote = cached ? cached.value : null;
        let remoteTs = cached ? cached.updatedAt : 0;
        // 没有缓存才从 IndexedDB 读（首次加载）
        if (remote == null) {
          // 同步读：这里用 Promise 无法同步返回，所以 load() 里先返回本地；
          // 启动时 initCloudSync 会异步回填；用户点立即同步会再跑一次。
          return local != null ? local : def;
        }
        const merged = mergeValues(s.mergeMode, local, remote, remoteTs);
        return merged != null ? merged : def;
      } catch (e) {
        return local != null ? local : def;
      }
    },
    getSettings,
  };

  // ---------- UI 渲染 ----------
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/1024/1024).toFixed(2) + ' MB';
  }
  function fmtTime(ts) {
    if (!ts) return '从未';
    const d = new Date(ts); const diff = (Date.now() - ts)/1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff/60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff/3600) + ' 小时前';
    return d.getMonth()+1 + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  window.renderCloudSyncUI = async function() {
    // 徽章：按 Supabase 连接状态显示（TRAE 云端归档已停用，只走 Supabase）
    const badge = document.getElementById('cloudSyncBadge');
    if (badge) {
      const sbReady = !!(window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady());
      badge.style.background = sbReady ? '#E3F3EC' : '#F1F1F3';
      badge.style.color = sbReady ? '#3A7A5B' : '#8A929C';
      badge.style.borderColor = sbReady ? '#BFDCC8' : '#D5D9DE';
      badge.innerHTML = sbReady ? '● Supabase 云端同步已开启' : '○ Supabase 未连接';
    }
    // 账号信息（从当前用户 / 记住登录 / 本地账号表读取）
    try {
      const session = JSON.parse(localStorage.getItem('lh_session') || 'null');
      const users = JSON.parse(localStorage.getItem('lhn_users') || '[]');
      if (session && document.getElementById('csAccountName')) {
        const sessName = session.uname || session.username || '';
        const u = State.currentUser || users.find(x => x.username === sessName) || {};
        const nick = u.username || sessName || u.realName || u.nickname || 'LH Nail';
        const role = u.role || '';
        const roleName = ROLE_META[role]?.label || (role === '*' ? '老板' : role === 'owner' ? '老板' : role === 'manager' ? '店长' : role === 'staff' || role === 'tech' ? '技师' : '未知');
        const roleDesc = role === '*' || role === 'owner' ? '老板 / 全部权限' : role === 'manager' ? '店长 / 业务与财务' : role === 'staff' || role === 'tech' ? '技师 / 只读' : '未知角色';
        document.getElementById('csAccountName').textContent = nick + '（' + roleName + '账号）';
        document.getElementById('csAccountRole').textContent = '角色：' + roleDesc;
        const av = (nick || 'L').slice(0,2).toUpperCase();
        const el = document.getElementById('csAvatar');
        if (el) el.textContent = av;
      }
    } catch (e) {}
    renderCloudLog();
    try { updateImgSpaceInfo && updateImgSpaceInfo(); } catch (e) {}
  };
  window.renderCloudLog = function() {
    const box = document.getElementById('csLog'); if (!box) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(LS_LOG) || '[]'); } catch (e) {}
    if (list.length === 0) {
      box.innerHTML = `<div><span style="color:#7CC4A4;">[INFO]</span> 欢迎使用 Supabase 云端同步 · 点击上方「🔄 立即同步」开始首次同步</div>`;
      return;
    }
    const colorMap = { INFO:'#7CC4A4', SYNC:'#E5C66E', WARN:'#E5A06E', ERROR:'#E58A8A' };
    box.innerHTML = list.slice(0, 10).map(item => {
      const c = colorMap[item.level] || '#A8C5E0';
      return `<div><span style="color:${c};">[${item.level}]</span> <span style="color:#8A99A8;">${item.ts}</span> · ${item.msg}</div>`;
    }).join('');
  };

  // ---------- 按钮函数 ----------
  window.pullSupabaseNow = async function() {
    const btn = document.getElementById('csPullBtnTxt');
    if (btn) btn.textContent = '⏳ 拉取中...';
    pushLog('INFO', '开始从 Supabase 拉取云端最新数据...');
    try {
      if (!(window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady())) {
        throw new Error('Supabase 尚未配置或未连接');
      }
      const changed = await window.SupabaseSync.pullAll({ noRefresh: true });
      refreshAllAfterSync();
      pushLog('SYNC', changed ? '已从 Supabase 拉取并合并云端最新数据' : 'Supabase 云端已是最新，无需合并');
      if (typeof toast === 'function') toast(changed ? '✅ 已拉取云端最新数据' : '✅ 云端数据已是最新');
    } catch (e) {
      pushLog('ERROR', '拉取失败：' + (e.message || e));
      if (typeof toast === 'function') toast('拉取失败：' + (e.message || e), 'error');
    } finally {
      if (btn) setTimeout(() => btn.textContent = '⬇️ 从云端拉取', 400);
      renderCloudSyncUI();
    }
  };
  window.forceSyncNow = async function() {
    const btn = document.getElementById('csSyncBtnTxt');
    if (btn) btn.textContent = '⏳ 同步中...';
    pushLog('INFO', '开始全量双向同步...');
    try {
      if (window.SupabaseSync && window.SupabaseSync.isReady && window.SupabaseSync.isReady()) {
        pushLog('INFO', '检测到 Supabase 配置，使用 Supabase 云数据库同步...');
        // ⚠️ 安全同步：先拉取云端数据合并到本地，再推送合并后的数据
        // 避免新设备空数据直接覆盖云端
        const changed = await window.SupabaseSync.pullAll({ noRefresh: true });
        if (changed) refreshAllAfterSync();
        await window.SupabaseSync.pushAll();
        pushLog('SYNC', 'Supabase 同步完成：已拉取云端最新数据并推送本机合并数据');
        if (typeof toast === 'function') toast('✅ Supabase 云端同步完成');
        return;
      }
      pushLog('WARN', 'Supabase 未配置或未连接，无法进行云端同步');
      if (typeof toast === 'function') toast('Supabase 未配置，无法同步', 'error');
    } catch (e) {
      pushLog('ERROR', '同步失败：' + (e.message || e));
      if (typeof toast === 'function') toast('同步失败：' + (e.message || e), 'error');
    } finally {
      if (btn) setTimeout(() => btn.textContent = '🔄 立即同步', 400);
      renderCloudSyncUI();
    }
  };
  // ---------- 启动时：渲染云端同步 UI + 页面可见时触发同步 ----------
  (async function bootSync() {
    pushLog('INFO', 'Supabase 云同步已启用（跨设备实时双向）');
    // 延迟渲染 UI
    setTimeout(() => { if (typeof renderCloudSyncUI === 'function') renderCloudSyncUI(); }, 300);
    // 页面可见时（切 tab 回来）再同步一次
    document.addEventListener && document.addEventListener('visibilitychange', () => {
      if (!document.hidden) window.forceSyncNow && window.forceSyncNow();
    });
  })();
})();


