import { SavedSong } from '../types';
import JSZip from 'jszip';
import { calculateDifficultyRating } from '../utils/beatmapGenerator';

const DB_NAME = 'NeonFlowDB';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
};

export const saveSong = async (song: SavedSong): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(song);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getSongById = async (id: string): Promise<SavedSong | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllSongs = async (): Promise<SavedSong[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const songs: SavedSong[] = [];
    // Use cursor for better memory management and control
    const request = store.openCursor();
    
    request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
            const song = cursor.value as SavedSong;
            
            // Migration / Type fixes
             if (song.notes) {
                 song.notes.forEach(note => {
                     if (!note.type) note.type = 'NORMAL';
                 });
             }
             
             // Recalculate rating if needed (fix broken old ratings)
             if (song.notes && song.notes.length > 0 && song.duration > 0) {
                 const newRating = calculateDifficultyRating(song.notes, song.duration);
                 if (song.difficultyRating > 20 || Math.abs(song.difficultyRating - newRating) > 1.0) {
                     song.difficultyRating = newRating;
                 }
             }

            // OPTIMIZATION: Create lightweight version without heavy audioData for the list
            // This significantly reduces memory usage and load time for the library screen
            // We pass a 0-byte buffer to satisfy the type definition while saving memory
            const lightSong = { ...song, audioData: new ArrayBuffer(0) };
            songs.push(lightSong);
            
            cursor.continue();
        } else {
            songs.sort((a, b) => b.createdAt - a.createdAt);
            resolve(songs);
        }
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteSong = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const updateSongMetadata = async (id: string, title: string, artist: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
          const song = getReq.result as SavedSong;
          if (song) {
              song.title = title;
              song.artist = artist;
              store.put(song).onsuccess = () => resolve();
          } else {
              reject(new Error("Song not found"));
          }
      };
      getReq.onerror = () => reject(getReq.error);
    });
};

/**
 * Export song as a ZIP file containing:
 * 1. map.json (metadata + notes, NO audio)
 * 2. audio.bin (raw audio arraybuffer)
 * 
 * @param song The song to export
 * @param includeHistory Whether to include the 'bestResult' field in the export
 */
export const exportSongAsZip = async (song: SavedSong, includeHistory: boolean = true) => {
    // If song is lightweight (from list), fetch full data first
    let fullSong = song;
    if (song.audioData.byteLength === 0) {
        const fetched = await getSongById(song.id);
        if (fetched) fullSong = fetched;
        else throw new Error(`Could not find full audio data for song ${song.id}`);
    }

    const zip = new JSZip();
    
    // 1. Create JSON part (exclude heavy audioData)
    // If includeHistory is false, we strip the bestResult
    const { audioData, bestResult, ...metaData } = fullSong;
    
    const exportData = {
        ...metaData,
        bestResult: includeHistory ? bestResult : undefined,
        _isNeonFlowExport: true,
        version: 2
    };

    const jsonContent = JSON.stringify(exportData);
    
    zip.file("map.json", jsonContent);
    // OPTIMIZATION: Use STORE for audio to avoid re-compressing already compressed audio
    // This makes the export process significantly faster
    zip.file("audio.bin", fullSong.audioData, { compression: "STORE" });

    // 2. Generate ZIP
    const blob = await zip.generateAsync({type: "blob"});
    
    // 3. Trigger Download
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `${fullSong.title}.nfz`); // NeonFlow Zip
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
};

/**
 * Import song from ZIP or Legacy JSON
 */
export const parseSongImport = async (file: File): Promise<SavedSong> => {
    // Check extension or try to read as ZIP first
    if (file.name.endsWith('.json')) {
        return parseLegacyJsonImport(file);
    }
    
    try {
        const zip = await JSZip.loadAsync(file);
        
        const mapFile = zip.file("map.json");
        const audioFile = zip.file("audio.bin");
        
        if (!mapFile || !audioFile) {
            throw new Error("无效的 NeonFlow 文件包 (缺少必要文件)");
        }
        
        const jsonStr = await mapFile.async("string");
        const metaData = JSON.parse(jsonStr);
        
        if (!metaData._isNeonFlowExport) {
            throw new Error("缺少谱面签名");
        }
        
        // Ensure type exists
        if (metaData.notes) {
            metaData.notes.forEach((n: any) => {
                if (!n.type) n.type = 'NORMAL';
            });
        }

        const audioArrayBuffer = await audioFile.async("arraybuffer");

        // Use current calculation to ensure imported songs are also rated correctly
        let rating = metaData.difficultyRating;
        if (metaData.notes && metaData.duration) {
             rating = calculateDifficultyRating(metaData.notes, metaData.duration);
        }

        return {
            ...metaData,
            difficultyRating: rating,
            audioData: audioArrayBuffer,
            id: crypto.randomUUID(),
            createdAt: Date.now()
        };

    } catch (e: any) {
        console.warn("ZIP parsing failed, trying legacy JSON...", e);
        try {
            return await parseLegacyJsonImport(file);
        } catch (legacyError) {
            throw new Error("无法读取文件：请确保是 .nfz 或 .json 格式");
        }
    }
};

const parseLegacyJsonImport = (file: File): Promise<SavedSong> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const resultStr = e.target?.result as string;
                if (!resultStr.trim().startsWith('{')) throw new Error("Invalid JSON");
                const json = JSON.parse(resultStr);
                
                // Helper to decode base64 if needed (legacy format stored audio as base64 string in json)
                const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
                    const binary_string = window.atob(base64);
                    const len = binary_string.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binary_string.charCodeAt(i);
                    }
                    return bytes.buffer;
                };

                const audioBuffer = base64ToArrayBuffer(json.audioData);
                
                // Compatibility check for 'type'
                if (json.notes) {
                    json.notes.forEach((n: any) => {
                        if (!n.type) n.type = 'NORMAL';
                    });
                }
                
                // Recalc rating
                const rating = calculateDifficultyRating(json.notes || [], json.duration || 1);

                const song: SavedSong = {
                    ...json,
                    difficultyRating: rating,
                    id: crypto.randomUUID(),
                    audioData: audioBuffer,
                    createdAt: Date.now()
                };
                delete (song as any)._isNeonFlowExport;
                resolve(song);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsText(file);
    });
};