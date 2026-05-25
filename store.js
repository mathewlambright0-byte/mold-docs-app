/* ============================================================
   Mold Docs — Data Store
   On-device storage so job data survives between sessions.

   - Photos  -> IndexedDB (handles large image blobs well)
   - Projects, timeline, small settings -> localStorage (plain JSON)

   This is the local-first layer. A cloud sync (Supabase) can be
   added later behind these same methods without touching the
   rest of the app.
   ============================================================ */

const MoldDocsStore = (() => {

  /* ---------- IndexedDB (photos) ---------- */

  const DB_NAME = 'molddocs';
  const DB_VERSION = 1;
  const PHOTOS = 'photos';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTOS)) {
          db.createObjectStore(PHOTOS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function withStore(mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTOS, mode);
      const store = tx.objectStore(PHOTOS);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  function reqAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ---------- localStorage helpers ---------- */

  const K_PROJECTS = 'md_projects';
  const K_TIMELINE = 'md_timeline';
  const K_CURRENT = 'md_current_project';

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write failed for ' + key + ':', e);
      return false;
    }
  }

  function uid(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  return {

    /* ===== Photos (async) ===== */

    addPhoto(photo) {
      const record = Object.assign({
        id: uid('ph'),
        ts: Date.now()
      }, photo);
      return withStore('readwrite', (store) => reqAsPromise(store.put(record)))
        .then(() => record);
    },

    allPhotos() {
      return withStore('readonly', (store) => reqAsPromise(store.getAll()))
        .then((rows) => (rows || []).sort((a, b) => b.ts - a.ts));
    },

    deletePhoto(id) {
      return withStore('readwrite', (store) => reqAsPromise(store.delete(id)));
    },

    countPhotos() {
      return withStore('readonly', (store) => reqAsPromise(store.count()));
    },

    /* ===== Projects (sync) ===== */

    getProjects() {
      return lsGet(K_PROJECTS, []);
    },

    getProject(id) {
      return this.getProjects().find((p) => p.id === id) || null;
    },

    addProject(project) {
      const record = Object.assign({
        id: uid('pj'),
        createdAt: Date.now()
      }, project);
      const all = this.getProjects();
      all.unshift(record);
      lsSet(K_PROJECTS, all);
      return record;
    },

    updateProject(id, patch) {
      const all = this.getProjects();
      const i = all.findIndex((p) => p.id === id);
      if (i === -1) return null;
      all[i] = Object.assign({}, all[i], patch);
      lsSet(K_PROJECTS, all);
      return all[i];
    },

    saveProjects(arr) {
      lsSet(K_PROJECTS, arr || []);
    },

    /* ===== Timeline (sync) ===== */

    getTimeline() {
      return lsGet(K_TIMELINE, []);
    },

    timelineForProject(projectId) {
      return this.getTimeline()
        .filter((e) => e.projectId === projectId)
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    },

    addTimelineEntry(entry) {
      const record = Object.assign({
        id: uid('tl'),
        ts: Date.now()
      }, entry);
      const all = this.getTimeline();
      all.push(record);
      lsSet(K_TIMELINE, all);
      return record;
    },

    deleteTimelineEntry(id) {
      lsSet(K_TIMELINE, this.getTimeline().filter((e) => e.id !== id));
    },

    /* ===== Current project ===== */

    getCurrentProjectId() {
      return lsGet(K_CURRENT, null);
    },

    setCurrentProjectId(id) {
      lsSet(K_CURRENT, id);
    },

    /* ===== Generic small settings (e.g. materials list) ===== */

    kvGet(key, fallback) {
      return lsGet('md_kv_' + key, fallback);
    },

    kvSet(key, value) {
      lsSet('md_kv_' + key, value);
    }
  };
})();
