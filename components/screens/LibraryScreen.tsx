import React, { useState, useRef } from 'react';
import { Upload, Play, Trash2, Edit2, Download, CheckSquare, Square, Music, Clock, Zap, Plus, FileJson, Trophy, Layers, Lock, Disc, Info, X, Calendar, Activity, Loader2, AlertTriangle, PlayCircle, MoreHorizontal } from 'lucide-react';
import { SavedSong } from '../../types';
import { deleteSong, updateSongMetadata, exportSongAsZip } from '../../services/storageService';
import { calculateAccuracy } from '../../utils/scoring';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface LibraryScreenProps {
  songs: SavedSong[];
  onImportAudioClick: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  onImportMapClick: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  onSelectSong: (song: SavedSong) => void;
  onRefreshLibrary: () => void;
  isLoading: boolean;
  hasApiKey: boolean; 
  onOpenSettings: () => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  songs,
  onImportAudioClick,
  onImportMapClick,
  onSelectSong,
  onRefreshLibrary,
  isLoading,
  hasApiKey,
  onOpenSettings
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', artist: '' });
  
  // Details Modal State
  const [showDetailsId, setShowDetailsId] = useState<string | null>(null);
  
  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(true);

  // Delete Confirm Modal State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);

  const getLevelDisplay = (rating: number) => {
      // Omega Level (20+)
      if (rating >= 20.0) {
          return { val: 'Ω', color: '#ff0044', isTitan: true, isOmega: true }; 
      }
      if (rating < 1.0) return { val: 1, color: '#00f3ff' }; 
      
      const ranges = [
          { max: 2.0, level: 2, color: '#00f3ff' },
          { max: 3.0, level: 3, color: '#00f3ff' },
          { max: 4.0, level: 4, color: '#00fa9a' },
          { max: 5.0, level: 5, color: '#00fa9a' },
          { max: 6.0, level: 6, color: '#ffd700' },
          { max: 7.0, level: 7, color: '#ffd700' },
          { max: 8.5, level: 8, color: '#ff8c00' },
          { max: 10.0, level: 9, color: '#ff4500' },
          { max: 11.5, level: 10, color: '#ff0055' }
      ];

      for (const r of ranges) {
          if (rating < r.max) return { val: r.level, color: r.color };
      }

      // Titan Levels (11-19)
      const val = Math.floor(rating);
      const color = val >= 14 ? '#bd00ff' : '#d946ef'; 
      return { val, color, isTitan: true };
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === songs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(songs.map(s => s.id)));
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    for (const id of selectedIds) {
        await deleteSong(id);
    }
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    onRefreshLibrary();
  };

  const openExportModal = () => {
      setShowExportModal(true);
  };

  const handleExportConfirm = async () => {
     setIsExporting(true);
     try {
         const songsToExport = songs.filter(s => selectedIds.has(s.id));
         for (const song of songsToExport) {
             await exportSongAsZip(song, includeHistory);
         }
         setShowExportModal(false);
         setSelectedIds(new Set());
         setIsSelectionMode(false);
     } catch (e) {
         console.error(e);
         console.error("Export failed");
     } finally {
         setIsExporting(false);
     }
  };

  const startEdit = (song: SavedSong, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(song.id);
    setEditForm({ title: song.title, artist: song.artist });
  };

  const saveEdit = async () => {
    if (editingId) {
        await updateSongMetadata(editingId, editForm.title, editForm.artist);
        setEditingId(null);
        onRefreshLibrary();
    }
  };

  const handleCreateClick = () => {
      audioInputRef.current?.click();
  };
  
  const detailSong = songs.find(s => s.id === showDetailsId);

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[#030304]">
      
      {/* Top Toolbar (Fixed) */}
      <div className="shrink-0 p-4 md:p-6 z-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-b from-[#030304] to-transparent pointer-events-none">
         <div className="pointer-events-auto">
             <div className="flex items-center gap-3 mb-1">
                <Music className="w-5 h-5 text-neon-blue" />
                <h2 className="text-xl font-black text-white tracking-widest uppercase">曲目选择</h2>
             </div>
             <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{songs.length} 首可用</p>
         </div>

         <div className="pointer-events-auto flex items-center gap-2">
             {isSelectionMode ? (
                 <div className="flex items-center bg-black/50 backdrop-blur-md rounded-xl p-1 border border-white/10">
                    <button onClick={selectAll} className="px-3 py-2 text-xs font-bold text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition">
                         {selectedIds.size === songs.length ? "取消全选" : "全选"}
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1"></div>
                    <button onClick={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0} className="px-3 py-2 text-xs font-bold text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition disabled:opacity-30">
                        删除 ({selectedIds.size})
                    </button>
                    <button onClick={openExportModal} disabled={selectedIds.size === 0} className="px-3 py-2 text-xs font-bold text-neon-blue hover:text-white rounded-lg hover:bg-neon-blue/10 transition disabled:opacity-30">
                        导出
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1"></div>
                    <button onClick={() => setIsSelectionMode(false)} className="px-3 py-2 text-xs font-bold text-white bg-white/10 rounded-lg">完成</button>
                 </div>
             ) : (
                 <div className="flex items-center gap-2">
                     <button onClick={() => setIsSelectionMode(true)} className="p-3 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/5 hover:border-white/20">
                        <CheckSquare className="w-5 h-5" />
                     </button>
                     <button onClick={() => mapInputRef.current?.click()} className="p-3 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/5 hover:border-white/20">
                        <Upload className="w-5 h-5" />
                     </button>
                     <button 
                        onClick={handleCreateClick}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-sm transition-all shadow-lg bg-white text-black hover:bg-neon-blue hover:shadow-neon-blue/20`}
                     >
                         {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />}
                         <span>新乐谱</span>
                     </button>
                 </div>
             )}
         </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-6 pb-24">
          {songs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                  <Disc className="w-16 h-16 mb-4 animate-spin-slow" />
                  <p className="text-lg font-bold">空空如也</p>
                  <p className="text-sm">导入或创建新的乐谱以开始游戏。</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {songs.map(song => {
                      const levelInfo = (song as any)._displayLevel || getLevelDisplay(song.difficultyRating);
                      const secondaryColor = song.theme?.secondaryColor || '#222';
                      
                      return (
                          <div 
                             key={song.id}
                             onClick={() => isSelectionMode ? toggleSelection(song.id, {} as any) : onSelectSong(song)}
                             className={`group relative aspect-[4/3] rounded-3xl overflow-hidden border transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl cursor-pointer bg-[#0a0a0a] transform-gpu
                                ${selectedIds.has(song.id) ? 'border-neon-blue ring-2 ring-neon-blue/50' : 'border-white/5 hover:border-white/20'}
                             `}
                             style={{ isolation: 'isolate' }}
                          >
                             {/* Cover Art Container */}
                             <div className="absolute inset-0 z-0 bg-black">
                                 {song.coverArt ? (
                                    <>
                                        <img 
                                            src={song.coverArt} 
                                            alt="cover" 
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                        />
                                        {/* Gradient Overlay - strictly positioned over image */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none"></div>
                                    </>
                                 ) : (
                                    // Fallback
                                    <div 
                                        className="w-full h-full relative overflow-hidden"
                                        style={{ background: `linear-gradient(135deg, ${secondaryColor}, #000)` }}
                                    >
                                        <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                             <div className="relative">
                                                 <Disc className="w-24 h-24 text-white animate-spin-slow" style={{ animationDuration: '8s' }} />
                                                 <Music className="w-8 h-8 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" />
                                             </div>
                                        </div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 pointer-events-none"></div>
                                    </div>
                                 )}
                             </div>
                             
                             {/* Content Layer (Higher Z-Index) */}
                             <div className="absolute inset-0 z-10 pointer-events-none p-5 flex flex-col justify-between">
                                 {/* Top Section */}
                                 <div className="flex justify-between items-start">
                                     {/* Level Badge */}
                                     <div className="flex flex-col items-center">
                                         <div 
                                            className="w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg bg-black/40"
                                            style={{ borderColor: levelInfo.color }}
                                         >
                                             <span className="font-black italic text-xl text-white drop-shadow-md" style={{ color: levelInfo.color }}>{levelInfo.val}</span>
                                         </div>
                                     </div>

                                     {/* Top Right Controls (Pointer events enabled for buttons) */}
                                     {!isSelectionMode && (
                                         <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 pointer-events-auto">
                                             <button 
                                                onClick={(e) => setShowDetailsId(song.id) || e.stopPropagation()}
                                                className="p-2 bg-black/40 backdrop-blur-md rounded-lg text-white hover:bg-white/20 border border-white/5"
                                             >
                                                 <Info className="w-4 h-4" />
                                             </button>
                                             <button 
                                                onClick={(e) => startEdit(song, e)}
                                                className="p-2 bg-black/40 backdrop-blur-md rounded-lg text-white hover:bg-white/20 border border-white/5"
                                             >
                                                 <Edit2 className="w-4 h-4" />
                                             </button>
                                         </div>
                                     )}
                                     
                                     {/* Selection Checkbox */}
                                     {isSelectionMode && (
                                         <div className="pointer-events-auto">
                                             <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${selectedIds.has(song.id) ? 'bg-neon-blue border-neon-blue text-black' : 'border-white/30 bg-black/40'}`}>
                                                 {selectedIds.has(song.id) && <CheckSquare className="w-4 h-4" />}
                                             </div>
                                         </div>
                                     )}
                                 </div>

                                 {/* Middle Rank (Centered) */}
                                 {song.bestResult && (
                                     <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none w-full text-center">
                                         <div className={`text-6xl font-black italic drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] opacity-30 group-hover:opacity-100 transition-all duration-500 scale-75 group-hover:scale-100 ${song.bestResult.rank === 'S' || song.bestResult.rank === 'OPUS' || song.bestResult.rank === 'DIVINE' ? 'text-neon-blue' : 'text-white'}`}>
                                             {song.bestResult.rank}
                                         </div>
                                     </div>
                                 )}

                                 {/* Bottom Info */}
                                 <div className="pointer-events-auto">
                                     {editingId === song.id ? (
                                          <div className="flex flex-col gap-2 bg-black/80 p-2 rounded-xl backdrop-blur-md" onClick={e => e.stopPropagation()}>
                                              <input 
                                                className="bg-transparent border-b border-white/20 text-white font-bold text-lg outline-none"
                                                value={editForm.title}
                                                onChange={e => setEditForm({...editForm, title: e.target.value})}
                                                autoFocus
                                              />
                                              <div className="flex gap-2">
                                                  <input 
                                                    className="flex-1 bg-transparent border-b border-white/20 text-gray-400 text-xs outline-none"
                                                    value={editForm.artist}
                                                    onChange={e => setEditForm({...editForm, artist: e.target.value})}
                                                  />
                                                  <button onClick={saveEdit} className="text-xs bg-neon-blue text-black px-2 rounded font-bold">SAVE</button>
                                              </div>
                                          </div>
                                     ) : (
                                         <>
                                            <h3 className="text-xl font-black text-white leading-tight truncate drop-shadow-md mb-1">{song.title}</h3>
                                            <p className="text-xs text-white/70 font-bold uppercase tracking-wider mb-3 truncate">{song.artist}</p>
                                            
                                            <div className="flex items-center gap-3 text-[10px] font-bold text-white/50 uppercase tracking-widest">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {formatTime(song.duration)}</span>
                                                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                                <span>{Math.round(song.structure.bpm)} BPM</span>
                                                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                                <span className={`${song.laneCount === 6 ? 'text-purple-400' : 'text-neon-blue'}`}>{song.laneCount}K</span>
                                            </div>
                                         </>
                                     )}
                                 </div>
                             </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>

      {/* Hidden Inputs */}
      <input ref={audioInputRef} type="file" accept="audio/*" onChange={onImportAudioClick} className="hidden" />
      <input ref={mapInputRef} type="file" multiple accept=".json,.zip,.nfz,application/json,application/zip,application/octet-stream" onChange={onImportMapClick} className="hidden" />

      {/* --- Details Modal --- */}
      {detailSong && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
                   {/* Gradient Header / Cover Art */}
                   <div className="absolute top-0 left-0 right-0 h-48 z-0 overflow-hidden bg-[#0a0a0a]">
                       {detailSong.coverArt ? (
                           <>
                             <img src={detailSong.coverArt} className="w-full h-full object-cover opacity-80 blur-sm scale-110" />
                             <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f172a]"></div>
                           </>
                       ) : (
                           <div 
                                className="w-full h-full relative overflow-hidden"
                                style={{ background: `linear-gradient(135deg, ${detailSong.theme?.secondaryColor || '#333'}, #0f172a)` }}
                           >
                                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                     <div className="relative">
                                         <Disc className="w-32 h-32 text-white animate-spin-slow" style={{ animationDuration: '8s' }} />
                                         <Music className="w-10 h-10 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" />
                                     </div>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f172a]"></div>
                           </div>
                       )}
                   </div>
                   
                   <button 
                        onClick={() => setShowDetailsId(null)} 
                        className="absolute top-4 right-4 text-white/70 hover:text-white z-50 bg-black/30 p-2 rounded-full backdrop-blur-md hover:bg-black/50 transition-colors"
                   >
                      <X className="w-5 h-5" />
                   </button>

                   <div className="p-8 pb-4 relative z-10 pt-16">
                       <h2 className="text-3xl md:text-5xl font-black text-white mb-2 leading-tight tracking-tight shadow-sm drop-shadow-lg">{detailSong.title}</h2>
                       <p className="text-lg md:text-xl text-white/80 font-medium mb-6">{detailSong.artist} {detailSong.album ? `— ${detailSong.album}` : ''}</p>
                       
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">时长</div>
                               <div className="text-white font-bold">{formatTime(detailSong.duration)}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">BPM</div>
                               <div className="text-white font-bold">{Math.round(detailSong.structure.bpm)}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">音符数</div>
                               <div className="text-white font-bold">{detailSong.notes.length}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">模式</div>
                               <div className="text-white font-bold">{detailSong.laneCount}K</div>
                           </div>
                       </div>
                   </div>

                   <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar relative z-10 bg-[#0f172a]">
                       <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <Trophy className="w-4 h-4 text-yellow-500" /> 最佳战绩
                       </h3>
                       
                       {detailSong.bestResult ? (
                           <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col md:flex-row items-center gap-6">
                               <div className="flex-1 text-center md:text-left">
                                   <div className="text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-br from-neon-blue to-white drop-shadow-lg">
                                       {detailSong.bestResult.rank}
                                   </div>
                                   <div className="text-2xl font-bold text-white mt-1">{detailSong.bestResult.score.toLocaleString()}</div>
                               </div>
                               
                               <div className="w-px h-16 bg-white/10 hidden md:block"></div>

                               <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Perf</span>
                                       <span className="font-mono text-neon-purple font-bold">{detailSong.bestResult.perfect}</span>
                                   </div>
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Good</span>
                                       <span className="font-mono text-neon-blue font-bold">{detailSong.bestResult.good}</span>
                                   </div>
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Miss</span>
                                       <span className="font-mono text-gray-400 font-bold">{detailSong.bestResult.miss}</span>
                                   </div>
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Combo</span>
                                       <span className="font-mono text-neon-yellow font-bold">{detailSong.bestResult.maxCombo}</span>
                                   </div>
                               </div>
                           </div>
                       ) : (
                           <div className="h-24 flex items-center justify-center text-gray-600 bg-white/5 rounded-2xl border border-dashed border-white/5">
                               暂无记录
                           </div>
                       )}
                   </div>
                   
                   <div className="p-6 border-t border-white/5 bg-[#0f172a] z-20">
                       <button 
                            onClick={() => { onSelectSong(detailSong); setShowDetailsId(null); }} 
                            className="group relative w-full py-4 rounded-xl overflow-hidden shadow-lg hover:shadow-neon-blue/20 transition-all"
                       >
                           <div className="absolute inset-0 bg-white group-hover:bg-neon-blue transition-colors"></div>
                           <div className="relative z-10 flex items-center justify-center gap-2 text-black font-black uppercase tracking-widest">
                               <Play className="w-5 h-5 fill-current" />
                               开始游戏
                           </div>
                       </button>
                   </div>
              </div>
          </div>
      )}

      {/* --- Export Modal --- */}
      {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                  <button onClick={() => !isExporting && setShowExportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white disabled:opacity-50">
                      <X className="w-5 h-5" />
                  </button>
                  <h2 className="text-xl font-bold text-white mb-4">导出选项</h2>
                  <p className="text-gray-400 text-sm mb-6">即将导出 {selectedIds.size} 首曲目。</p>
                  
                  <label className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors mb-6">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${includeHistory ? 'bg-neon-blue border-neon-blue text-black' : 'border-gray-500'}`}>
                          {includeHistory && <CheckSquare className="w-3.5 h-3.5" />}
                      </div>
                      <input type="checkbox" className="hidden" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} />
                      <div className="flex flex-col">
                          <span className="font-bold text-sm">包含历史成绩</span>
                          <span className="text-xs text-gray-500">导出的文件中将保留您的最高分记录</span>
                      </div>
                  </label>

                  <button 
                    onClick={handleExportConfirm} 
                    disabled={isExporting}
                    className="w-full py-3 bg-neon-blue text-black font-bold rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                      {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {isExporting ? '正在打包...' : '开始导出'}
                  </button>
              </div>
          </div>
      )}

      {/* --- Delete Confirmation Modal --- */}
      {showDeleteConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                  <div className="flex items-center gap-3 text-red-400 font-black text-xl mb-4">
                      <AlertTriangle className="w-6 h-6" />
                      确认删除
                  </div>
                  <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                      您确定要删除选中的 <span className="text-white font-bold">{selectedIds.size}</span> 首曲目吗？<br/>
                      此操作<span className="text-red-400 font-bold">无法撤销</span>。
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors"
                      >
                          取消
                      </button>
                      <button 
                        onClick={confirmDelete}
                        className="py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors shadow-lg"
                      >
                          删除
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};