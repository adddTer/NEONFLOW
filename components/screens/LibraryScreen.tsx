import React, { useState, useRef } from 'react';
import { Upload, Play, Trash2, Edit2, Download, CheckSquare, Square, Music, Clock, Zap, Plus, FileJson, Trophy, Layers, Lock, Disc, Info, X, Calendar, Activity, Loader2, AlertTriangle } from 'lucide-react';
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

  const getLevel = (rating: number) => {
      if (rating < 1.0) return 1;
      if (rating < 2.0) return 2;
      if (rating < 3.0) return 3;
      if (rating < 4.0) return 4;
      if (rating < 5.0) return 5;
      if (rating < 6.0) return 6;
      if (rating < 7.0) return 7;
      if (rating < 8.5) return 8;
      if (rating < 10.0) return 9;
      return 10;
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
         // Keeping it simple with alert for export errors, or could be replaced similarly
         // alert("导出失败");
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
    <div className="w-full max-w-6xl mx-auto p-6 flex flex-col h-[calc(100vh-100px)] animate-fade-in relative">
      
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

      {/* --- Details Modal --- */}
      {detailSong && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/20 rounded-2xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                   {/* Header Background */}
                   <div className="h-32 absolute top-0 left-0 right-0 z-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                   
                   {/* UPDATED: Increased z-index to 50 and ensured pointer-events-auto */}
                   <button 
                        onClick={() => setShowDetailsId(null)} 
                        className="absolute top-4 right-4 text-gray-400 hover:text-white z-50 bg-black/20 p-2 rounded-full backdrop-blur-md cursor-pointer pointer-events-auto hover:bg-black/40 transition-colors"
                   >
                      <X className="w-5 h-5" />
                   </button>

                   <div className="p-8 pb-4 relative z-10">
                       <h2 className="text-3xl font-black text-white mb-1 leading-tight">{detailSong.title}</h2>
                       <p className="text-lg text-gray-400 font-medium mb-4">{detailSong.artist} {detailSong.album ? `— ${detailSong.album}` : ''}</p>
                       
                       <div className="flex flex-wrap gap-2 mb-6">
                           <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono text-gray-300 border border-white/5 flex items-center gap-1">
                               <Clock className="w-3 h-3" /> {formatTime(detailSong.duration)}
                           </span>
                           <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono text-gray-300 border border-white/5 flex items-center gap-1">
                               <Activity className="w-3 h-3" /> BPM {Math.round(detailSong.structure.bpm)}
                           </span>
                           <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono text-gray-300 border border-white/5 flex items-center gap-1">
                               <Zap className="w-3 h-3" /> {detailSong.notes.length} Notes
                           </span>
                           <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono text-gray-300 border border-white/5 flex items-center gap-1">
                               <Calendar className="w-3 h-3" /> {new Date(detailSong.createdAt).toLocaleDateString()}
                           </span>
                       </div>
                   </div>

                   <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar relative z-10">
                       <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <Trophy className="w-4 h-4" /> 历史最佳成绩
                       </h3>
                       
                       {detailSong.bestResult ? (
                           <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
                               <div className="flex items-center justify-between mb-6">
                                   <div>
                                       <div className="text-4xl font-black text-white font-mono">{detailSong.bestResult.score}</div>
                                       <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Score</div>
                                   </div>
                                   <div className="text-right">
                                       <div className="text-6xl font-black italic text-neon-blue drop-shadow-lg">{detailSong.bestResult.rank}</div>
                                   </div>
                               </div>

                               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                   <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                       <span className="text-xs text-gray-500 uppercase">Perfect</span>
                                       <span className="text-xl font-bold text-neon-purple">{detailSong.bestResult.perfect}</span>
                                   </div>
                                   <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                       <span className="text-xs text-gray-500 uppercase">Good</span>
                                       <span className="text-xl font-bold text-neon-blue">{detailSong.bestResult.good}</span>
                                   </div>
                                   <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                       <span className="text-xs text-gray-500 uppercase">Miss</span>
                                       <span className="text-xl font-bold text-gray-400">{detailSong.bestResult.miss}</span>
                                   </div>
                                   <div className="bg-black/30 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                       <span className="text-xs text-gray-500 uppercase">Max Combo</span>
                                       <span className="text-xl font-bold text-neon-yellow">{detailSong.bestResult.maxCombo}</span>
                                   </div>
                               </div>
                               
                               <div className="text-center text-xs text-gray-600 font-mono">
                                   RECORDED AT: {new Date(detailSong.bestResult.timestamp).toLocaleString()}
                               </div>
                           </div>
                       ) : (
                           <div className="h-32 flex flex-col items-center justify-center text-gray-500 bg-white/5 rounded-2xl border border-dashed border-white/10">
                               <p>暂无游玩记录</p>
                               <p className="text-xs mt-2">快去挑战吧！</p>
                           </div>
                       )}
                   </div>
                   
                   <div className="p-6 border-t border-white/10 bg-[#0f172a] z-20">
                       <button onClick={() => { onSelectSong(detailSong); setShowDetailsId(null); }} className="w-full py-4 bg-neon-blue text-black font-bold rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2">
                           <Play className="w-5 h-5 fill-current" />
                           开始游戏
                       </button>
                   </div>
              </div>
          </div>
      )}

      {/* --- Toolbar --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-[#0f172a]/90 backdrop-blur-md p-5 rounded-2xl border border-white/10 shadow-2xl z-10">
         <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-blue to-purple-600 flex items-center justify-center text-white shadow-lg">
                <Music className="w-6 h-6" />
             </div>
             <div>
                <h2 className="text-2xl font-black text-white tracking-tight">
                    我的曲库
                </h2>
                <p className="text-xs text-gray-400 uppercase tracking-wider">{songs.length} 首曲目</p>
             </div>
         </div>

         <div className="flex items-center gap-3">
             {isSelectionMode ? (
                 <>
                    <button onClick={selectAll} className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg hover:bg-white/10 transition border border-white/10">
                         {selectedIds.size === songs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                         全选
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-1"></div>
                    <button onClick={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0} className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50">
                        <Trash2 className="w-4 h-4" /> 删除
                    </button>
                    <button onClick={openExportModal} disabled={selectedIds.size === 0} className="flex items-center gap-2 px-4 py-2 text-sm text-neon-blue hover:bg-neon-blue/10 rounded-lg transition disabled:opacity-50">
                        <Download className="w-4 h-4" /> 导出
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-1"></div>
                    <button onClick={() => setIsSelectionMode(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">完成</button>
                 </>
             ) : (
                 <>
                    <button onClick={() => setIsSelectionMode(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition border border-transparent hover:border-white/10">
                        <CheckSquare className="w-4 h-4" /> 批量管理
                    </button>
                    
                    <div className="h-8 w-px bg-white/10 mx-2"></div>
                    
                    <button 
                        onClick={() => mapInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-200 bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/10 hover:border-white/30"
                        title="导入 .nfz 谱面文件"
                    >
                        <FileJson className="w-4 h-4" />
                        导入谱面
                    </button>

                    <button 
                        onClick={handleCreateClick} 
                        disabled={isLoading || !hasApiKey}
                        className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all group border
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
                    <input ref={mapInputRef} type="file" accept=".json,.zip,.nfz" onChange={onImportMapClick} className="hidden" />
                 </>
             )}
         </div>
      </div>

      {/* --- Song List --- */}
      {songs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-white/10 rounded-3xl m-4 bg-white/5">
              <div className="p-6 bg-black/30 rounded-full mb-4">
                 <Music className="w-12 h-12 opacity-40" />
              </div>
              <p className="text-xl font-bold text-white mb-2">曲库是空的</p>
              <p className="text-sm opacity-60 mb-8 max-w-md text-center">
                  您可以通过点击右上角的 <span className="text-white font-bold">"创作新谱"</span> 来上传音乐并自动生成谱面，或者导入现有的谱面文件。
              </p>
          </div>
      ) : (
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 pb-20">
              {songs.map(song => {
                  const level = getLevel(song.difficultyRating);
                  const primaryColor = song.theme?.primaryColor || '#00f3ff';
                  const secondaryColor = song.theme?.secondaryColor || '#222';
                  
                  return (
                  <div 
                    key={song.id}
                    className={`group relative flex items-center bg-[#131b2e] border transition-all duration-300 rounded-xl overflow-hidden hover:shadow-xl hover:scale-[1.01]
                        ${selectedIds.has(song.id) ? 'border-neon-blue' : 'border-white/5 hover:border-white/20'}
                    `}
                    style={{
                        background: `linear-gradient(90deg, ${secondaryColor}33 0%, #131b2e 60%)`,
                        borderColor: selectedIds.has(song.id) ? primaryColor : undefined
                    }}
                  >
                      {/* Selection Checkbox */}
                      {isSelectionMode && (
                          <div 
                            className="pl-4 pr-2 cursor-pointer h-full flex items-center"
                            onClick={() => toggleSelection(song.id)}
                          >
                             <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.has(song.id) ? 'bg-neon-blue border-neon-blue text-black' : 'border-gray-600 bg-black/40'}`}>
                                {selectedIds.has(song.id) && <CheckSquare className="w-3.5 h-3.5" />}
                             </div>
                          </div>
                      )}

                      {/* Level Badge */}
                      <div className="px-6 py-4 flex flex-col items-center justify-center border-r border-white/5 w-24 shrink-0 h-full min-h-[5.5rem] relative">
                           <div 
                                className={`w-12 h-12 rounded-lg border-2 flex flex-col items-center justify-center transition-all bg-black/40 shadow-lg`}
                                style={{
                                    borderColor: primaryColor,
                                    color: primaryColor,
                                    boxShadow: `0 0 10px ${primaryColor}22`
                                }}
                           >
                               <span className="text-2xl font-black italic leading-none">{level}</span>
                               <span className="text-[8px] font-normal not-italic opacity-80 font-sans leading-none mt-0.5">LV</span>
                           </div>

                           {/* Show Best Rank Badge if exists */}
                           {song.bestResult && (
                               <div className="absolute top-2 right-2 translate-x-1/2 -translate-y-1/2 bg-white text-black text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg border border-white">
                                   {song.bestResult.rank}
                               </div>
                           )}
                      </div>

                      {/* Info Section */}
                      <div className="flex-1 px-6 py-3 min-w-0">
                           {editingId === song.id ? (
                               <div className="flex flex-col gap-2 max-w-md">
                                  <input 
                                    className="bg-black/40 border border-white/20 rounded px-3 py-1.5 text-base font-bold text-white focus:border-neon-blue outline-none"
                                    value={editForm.title}
                                    onChange={e => setEditForm({...editForm, title: e.target.value})}
                                    placeholder="歌名"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                      <input 
                                        className="flex-1 bg-black/40 border border-white/20 rounded px-3 py-1 text-xs text-gray-400 focus:border-neon-blue outline-none"
                                        value={editForm.artist}
                                        onChange={e => setEditForm({...editForm, artist: e.target.value})}
                                        placeholder="艺术家"
                                      />
                                      <button onClick={saveEdit} className="text-xs px-3 py-1 rounded bg-neon-blue text-black font-bold hover:bg-white">保存</button>
                                      <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20">取消</button>
                                  </div>
                               </div>
                           ) : (
                               <div className="flex flex-col">
                                   <div className="flex items-center gap-3 mb-1">
                                       <h3 className="font-bold text-xl text-white truncate max-w-md" title={song.title}>{song.title}</h3>
                                       <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-gray-400 border border-white/5 font-mono">
                                           {formatTime(song.duration)}
                                       </span>
                                       {song.theme?.moodDescription && (
                                           <span 
                                                className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/5 uppercase tracking-wide"
                                                style={{ color: primaryColor, borderColor: `${primaryColor}33` }}
                                           >
                                               {song.theme.moodDescription}
                                           </span>
                                       )}
                                       {song.laneCount === 6 && (
                                           <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wide flex items-center gap-1">
                                               <Layers className="w-3 h-3" /> 6K
                                           </span>
                                       )}
                                   </div>
                                   <div className="flex items-center gap-4 text-xs text-gray-400">
                                       <span className="flex items-center gap-1"><Music className="w-3 h-3" /> {song.artist || '未知艺术家'}</span>
                                       {song.album && <span className="flex items-center gap-1"><Disc className="w-3 h-3" /> {song.album}</span>}
                                       <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                                       <span>{new Date(song.createdAt).toLocaleDateString()}</span>
                                   </div>
                               </div>
                           )}
                      </div>

                      {/* Actions Section */}
                      {!isSelectionMode && !editingId && (
                          <div className="flex items-center gap-2 pr-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <button 
                                onClick={() => setShowDetailsId(song.id)}
                                className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 hover:border-white/20 transition-colors"
                                title="详情"
                              >
                                  <Info className="w-4 h-4" />
                              </button>
                              
                              <button 
                                onClick={() => startEdit(song)} 
                                className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 hover:border-white/20 transition-colors"
                                title="编辑信息"
                              >
                                  <Edit2 className="w-4 h-4" />
                              </button>
                              
                              <div className="w-px h-8 bg-white/10 mx-2"></div>

                              <button 
                                onClick={() => onSelectSong(song)} 
                                className="pl-4 pr-5 py-2.5 rounded-xl text-black font-bold flex items-center gap-2 hover:bg-white hover:scale-105 transition-all shadow-[0_0_15px_rgba(0,0,0,0.3)]"
                                style={{ backgroundColor: primaryColor, color: '#000000' }}
                              >
                                  <Play className="w-4 h-4 fill-current" />
                                  开始
                              </button>
                          </div>
                      )}

                      {/* Mobile fallback */}
                      <div className="md:hidden absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                          <button 
                            onClick={() => setShowDetailsId(song.id)} 
                            className="p-3 rounded-full text-white bg-white/10 border border-white/5 backdrop-blur-md"
                          >
                              <Info className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => onSelectSong(song)} 
                            className="p-3 rounded-full text-black shadow-lg"
                            style={{ backgroundColor: primaryColor, color: '#000000' }}
                          >
                              <Play className="w-5 h-5 fill-current" />
                          </button>
                      </div>
                  </div>
              )})}
          </div>
      )}
    </div>
  );
};