import React, { useState, useRef } from 'react';
import { Upload, Play, Trash2, Edit2, Download, CheckSquare, Square, Music, Clock, Zap, Plus, FileJson, Trophy, Layers, Lock, Disc, Info, X, Calendar, Activity, Loader2, AlertTriangle, PlayCircle } from 'lucide-react';
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
  onImportAudioClick: (e: React.ChangeEvent<HTMLInputElement>) => void; // New map from audio
  onImportMapClick: (e: React.ChangeEvent<HTMLInputElement>) => void; // Load existing map
  onSelectSong: (song: SavedSong) => void;
  onRefreshLibrary: () => void;
  isLoading: boolean;
  hasApiKey: boolean; // Control creation button state
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
          return { val: 'Ω', color: '#ff0044', isTitan: true, isOmega: true }; // Special Red
      }

      // Basic scaling for display
      if (rating < 1.0) return { val: 1, color: '#00f3ff' }; // Cyan
      
      const ranges = [
          { max: 2.0, level: 2, color: '#00f3ff' },
          { max: 3.0, level: 3, color: '#00f3ff' },
          { max: 4.0, level: 4, color: '#00fa9a' }, // Spring Green
          { max: 5.0, level: 5, color: '#00fa9a' },
          { max: 6.0, level: 6, color: '#ffd700' }, // Gold
          { max: 7.0, level: 7, color: '#ffd700' },
          { max: 8.5, level: 8, color: '#ff8c00' }, // Dark Orange
          { max: 10.0, level: 9, color: '#ff4500' }, // Orange Red
          { max: 11.5, level: 10, color: '#ff0055' } // Red
      ];

      for (const r of ranges) {
          if (rating < r.max) return { val: r.level, color: r.color };
      }

      // Titan Levels (11-19)
      const val = Math.floor(rating);
      // Purple for 11-13, Deep Purple/Black for 14+
      const color = val >= 14 ? '#bd00ff' : '#d946ef'; 
      return { val, color, isTitan: true };
  };

  const toggleSelection = (id: string) => {
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

  const startEdit = (song: SavedSong) => {
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
      // Logic update: The button is disabled if no key, but if somehow clicked:
      if (!hasApiKey) return; 
      audioInputRef.current?.click();
  };
  
  const detailSong = songs.find(s => s.id === showDetailsId);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 flex flex-col h-[100dvh] animate-fade-in relative">
      
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

      {/* --- Details Modal (Improved Design) --- */}
      {detailSong && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
                   {/* Gradient Header */}
                   <div 
                        className="absolute top-0 left-0 right-0 h-48 z-0" 
                        style={{ background: `linear-gradient(to bottom, ${detailSong.theme?.secondaryColor || '#333'} 0%, #0f172a 100%)`, opacity: 0.6 }}
                   ></div>
                   
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
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">Length</div>
                               <div className="text-white font-bold">{formatTime(detailSong.duration)}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">BPM</div>
                               <div className="text-white font-bold">{Math.round(detailSong.structure.bpm)}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">Objects</div>
                               <div className="text-white font-bold">{detailSong.notes.length}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">Mode</div>
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
                               START GAME
                           </div>
                       </button>
                   </div>
              </div>
          </div>
      )}

      {/* --- Toolbar --- */}
      <div className="flex flex-col gap-4 mb-4 bg-[#0f172a]/80 backdrop-blur-md p-4 rounded-3xl border border-white/10 shadow-2xl z-10 shrink-0">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center text-white shadow-inner">
                    <Music className="w-6 h-6 text-neon-blue" />
                </div>
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                        我的曲库
                    </h2>
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">{songs.length} TRACKS</p>
                </div>
            </div>
            
            {/* Mobile Create Button (Short version) */}
            <div className="md:hidden">
                 <button 
                        onClick={handleCreateClick} 
                        disabled={isLoading || !hasApiKey}
                        className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all border
                            ${hasApiKey 
                                ? 'bg-white text-black border-transparent shadow-lg shadow-white/10 active:scale-95' 
                                : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
                            }`}
                    >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
                 </button>
            </div>
         </div>

         <div className="flex flex-wrap items-center gap-2">
             {isSelectionMode ? (
                 <>
                    <button onClick={selectAll} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 text-xs md:text-sm rounded-lg hover:bg-white/10 transition border border-white/10">
                         {selectedIds.size === songs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                         全选
                    </button>
                    
                    <button onClick={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 text-xs md:text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50 border border-white/5">
                        <Trash2 className="w-4 h-4" /> 删除
                    </button>
                    
                    <button onClick={openExportModal} disabled={selectedIds.size === 0} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 text-xs md:text-sm text-neon-blue hover:bg-neon-blue/10 rounded-lg transition disabled:opacity-50 border border-white/5">
                        <Download className="w-4 h-4" /> 导出
                    </button>
                    
                    <button onClick={() => setIsSelectionMode(false)} className="flex-1 md:flex-none px-4 py-2 text-xs md:text-sm text-gray-400 hover:text-white border border-white/10 rounded-lg">完成</button>
                 </>
             ) : (
                 <>
                    <button onClick={() => setIsSelectionMode(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2.5 text-xs md:text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition border border-transparent hover:border-white/10">
                        <CheckSquare className="w-4 h-4" /> 管理
                    </button>
                    
                    <button 
                        onClick={() => mapInputRef.current?.click()}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2.5 text-xs md:text-sm font-bold text-gray-200 bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/10 hover:border-white/30"
                        title="导入 .nfz 谱面文件"
                    >
                        <FileJson className="w-4 h-4" />
                        导入
                    </button>

                    {/* Desktop Create Button */}
                    <button 
                        onClick={handleCreateClick} 
                        disabled={isLoading || !hasApiKey}
                        className={`hidden md:flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all group border
                            ${hasApiKey 
                                ? 'bg-white text-black hover:bg-neon-blue hover:border-neon-blue hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] border-transparent' 
                                : 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
                            }`}
                        title={hasApiKey ? "创作新谱面" : "API 未连接，功能已锁定"}
                    >
                        {isLoading ? (
                            <span className="animate-spin">⏳</span>
                        ) : hasApiKey ? (
                            <>
                                <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                                创作新谱
                            </>
                        ) : (
                            <>
                                <Lock className="w-4 h-4" />
                                创作新谱
                            </>
                        )}
                    </button>

                    <input ref={audioInputRef} type="file" accept="audio/*" onChange={onImportAudioClick} className="hidden" />
                    <input ref={mapInputRef} type="file" multiple accept=".json,.zip,.nfz" onChange={onImportMapClick} className="hidden" />
                 </>
             )}
         </div>
      </div>

      {/* --- Song List --- */}
      {songs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-white/10 rounded-3xl m-2 bg-white/5">
              <div className="p-6 bg-black/30 rounded-full mb-4">
                 <Music className="w-12 h-12 opacity-40" />
              </div>
              <p className="text-xl font-bold text-white mb-2">曲库是空的</p>
              <p className="text-sm opacity-60 mb-8 max-w-md text-center px-4">
                  请点击上方的 <span className="text-white font-bold">"创作新谱"</span> (需要 API Key) 或导入 .nfz 文件。
              </p>
          </div>
      ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-24 p-4 md:p-6">
              {songs.map(song => {
                  const levelInfo = (song as any)._displayLevel || getLevelDisplay(song.difficultyRating);
                  const primaryColor = song.theme?.primaryColor || '#00f3ff';
                  const secondaryColor = song.theme?.secondaryColor || '#222';
                  
                  return (
                  <div 
                    key={song.id}
                    className={`group relative flex flex-row items-stretch bg-[#0a0f1e] border transition-all duration-300 rounded-2xl overflow-hidden hover:shadow-2xl hover:scale-[1.01]
                        ${selectedIds.has(song.id) ? 'border-neon-blue' : 'border-white/5 hover:border-white/20'}
                    `}
                    style={{
                        // Background gradient that subtly hints the song color
                        backgroundImage: `linear-gradient(90deg, ${secondaryColor}11 0%, transparent 100%)`,
                        borderColor: selectedIds.has(song.id) ? primaryColor : undefined
                    }}
                  >
                      {/* Selection Checkbox (Left) */}
                      {isSelectionMode && (
                          <div 
                            className="pl-4 pr-2 cursor-pointer flex items-center justify-center"
                            onClick={() => toggleSelection(song.id)}
                          >
                             <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${selectedIds.has(song.id) ? 'bg-neon-blue border-neon-blue text-black' : 'border-gray-600 bg-black/40'}`}>
                                {selectedIds.has(song.id) && <CheckSquare className="w-4 h-4" />}
                             </div>
                          </div>
                      )}

                      {/* Level Badge (Left) - Modernized */}
                      <div className="w-20 md:w-24 shrink-0 flex flex-col items-center justify-center relative p-3">
                           <div 
                                className={`w-12 h-12 md:w-14 md:h-14 rounded-xl border flex flex-col items-center justify-center transition-all bg-black/40 shadow-lg backdrop-blur-sm relative overflow-hidden`}
                                style={{
                                    borderColor: `${levelInfo.color}44`,
                                    color: levelInfo.color,
                                    boxShadow: levelInfo.isOmega ? `0 0 20px ${levelInfo.color}33` : undefined
                                }}
                           >
                               <div className="absolute inset-0 opacity-20" style={{backgroundColor: levelInfo.color}}></div>
                               <span className={`font-black italic leading-none z-10 ${levelInfo.isOmega ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'}`}>
                                   {levelInfo.val}
                               </span>
                           </div>
                           
                           {/* Rank Badge */}
                           {song.bestResult && (
                               <div className="absolute -bottom-1 md:bottom-2 bg-black/80 text-white border border-white/20 px-2 py-0.5 rounded text-[10px] font-black shadow-lg">
                                   {song.bestResult.rank}
                               </div>
                           )}
                      </div>

                      {/* Info Section (Middle) */}
                      <div className="flex-1 p-3 md:p-4 min-w-0 flex flex-col justify-center gap-1">
                           {editingId === song.id ? (
                               <div className="flex flex-col gap-2 w-full">
                                  <input 
                                    className="bg-black/40 border border-white/20 rounded px-2 py-1 text-base font-bold text-white focus:border-neon-blue outline-none w-full"
                                    value={editForm.title}
                                    onChange={e => setEditForm({...editForm, title: e.target.value})}
                                    placeholder="歌名"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                      <input 
                                        className="flex-1 bg-black/40 border border-white/20 rounded px-2 py-1 text-xs text-gray-400 focus:border-neon-blue outline-none"
                                        value={editForm.artist}
                                        onChange={e => setEditForm({...editForm, artist: e.target.value})}
                                        placeholder="艺术家"
                                      />
                                      <button onClick={saveEdit} className="text-xs px-2 py-1 rounded bg-neon-blue text-black font-bold whitespace-nowrap">保存</button>
                                  </div>
                               </div>
                           ) : (
                               <>
                                   <div className="flex items-center gap-2 overflow-hidden mb-1">
                                       <h3 className="font-black text-lg md:text-xl text-white truncate tracking-tight" title={song.title}>{song.title}</h3>
                                   </div>
                                   
                                   <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-gray-500">
                                       <span className="truncate max-w-[120px] md:max-w-xs text-gray-400">{song.artist || 'Unknown Artist'}</span>
                                       
                                       <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                                       
                                       <span>{formatTime(song.duration)}</span>
                                       
                                       <span className="w-1 h-1 rounded-full bg-gray-600"></span>

                                       <span>{Math.round(song.structure.bpm)} BPM</span>
                                       
                                       {song.laneCount === 6 && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                                                <span className="text-purple-400 font-bold border border-purple-500/30 px-1 rounded bg-purple-500/10">6K</span>
                                            </>
                                       )}
                                   </div>
                               </>
                           )}
                      </div>

                      {/* Actions Section (Right) */}
                      {!isSelectionMode && !editingId && (
                          <div className="flex items-center gap-1 md:gap-3 pr-3 md:pr-6">
                              
                              {/* Desktop Edit/Info */}
                              <div className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0">
                                  <button onClick={() => startEdit(song)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition">
                                      <Edit2 className="w-4 h-4" />
                                  </button>
                              </div>

                              {/* Play Button - Redesigned */}
                              <button 
                                onClick={() => onSelectSong(song)} 
                                className="w-10 h-10 md:w-auto md:h-auto md:px-5 md:py-2.5 rounded-full md:rounded-xl text-black font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg md:shadow-none md:hover:shadow-lg hover:brightness-110"
                                style={{ backgroundColor: primaryColor }}
                              >
                                  <Play className="w-5 h-5 md:w-4 md:h-4 fill-current ml-0.5 md:ml-0" />
                                  <span className="hidden md:inline uppercase tracking-wider text-sm">Play</span>
                              </button>
                              
                              {/* Mobile Info Trigger */}
                              <button 
                                onClick={() => setShowDetailsId(song.id)} 
                                className="md:hidden p-2 text-gray-500 active:text-white"
                              >
                                  <Info className="w-6 h-6" />
                              </button>
                              
                              {/* Desktop Info Trigger (Styled) */}
                              <button 
                                onClick={() => setShowDetailsId(song.id)} 
                                className="hidden md:flex p-2 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                              >
                                  <Info className="w-4 h-4" />
                              </button>
                          </div>
                      )}
                  </div>
              )})}
          </div>
      )}
    </div>
  );
};