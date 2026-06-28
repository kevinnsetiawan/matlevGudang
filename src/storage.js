/**
 * WARNOTO Storage Adapter
 * 
 * Di Claude Artifact: pakai window.storage (cloud persistent)
 * Di Claude Code / lokal: pakai localStorage browser
 * 
 * API sama persis — komponen tidak perlu tahu bedanya.
 */

const isArtifact = typeof window !== 'undefined' && typeof window.storage !== 'undefined';

export const CLOUD = {
  async get(key) {
    if (isArtifact) {
      try {
        const result = await window.storage.get(key);
        return result ? JSON.parse(result.value) : null;
      } catch { return null; }
    } else {
      // localStorage
      try {
        const val = localStorage.getItem('warnoto_' + key);
        return val ? JSON.parse(val) : null;
      } catch { return null; }
    }
  },

  async set(key, value) {
    if (isArtifact) {
      try {
        await window.storage.set(key, JSON.stringify(value));
        return true;
      } catch { return false; }
    } else {
      try {
        localStorage.setItem('warnoto_' + key, JSON.stringify(value));
        return true;
      } catch { return false; }
    }
  },

  async delete(key) {
    if (isArtifact) {
      try { await window.storage.delete(key); return true; }
      catch { return false; }
    } else {
      localStorage.removeItem('warnoto_' + key);
      return true;
    }
  }
};
