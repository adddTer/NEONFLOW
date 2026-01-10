import React, { useState } from 'react';
import { X, Upload, Bug, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { extractCoverArt } from '../../utils/audioMetadata';

export const MetadataDebugger = ({ onClose }: { onClose: () => void }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [image, setImage] = useState<string | null>(null);
    const [fileName, setFileName] = useState("");

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLogs([]);
        setImage(null);
        setFileName(file.name);
        
        const timestamp = new Date().toLocaleTimeString();
        setLogs([`[${timestamp}] Selected file: ${file.name}`, `[${timestamp}] Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`, `[${timestamp}] Type: ${file.type}`]);

        try {
            const result = await extractCoverArt(file, (msg) => {
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
            });
            
            if (result) {
                setImage(result);
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] SUCCESS: Image data extracted.`]);
            } else {
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] FAILURE: No image found in metadata.`]);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`]);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#0f172a] w-full max-w-4xl h-[85vh] rounded-3xl flex flex-col border border-white/20 relative shadow-2xl overflow-hidden">
                 
                 {/* Header */}
                 <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                     <h2 className="text-xl font-black text-white flex items-center gap-3">
                         <div className="p-2 bg-neon-purple/20 rounded-lg">
                             <Bug className="text-neon-purple w-6 h-6" />
                         </div>
                         封面解析调试器
                     </h2>
                     <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                        <X className="w-5 h-5 text-white"/>
                     </button>
                 </div>

                 {/* Content */}
                 <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                     
                     {/* Left: Controls & Logs */}
                     <div className="flex-1 flex flex-col p-6 border-b md:border-b-0 md:border-r border-white/10 min-w-[50%]">
                         
                         <label className="flex items-center justify-center gap-3 w-full py-4 bg-neon-blue text-black font-black rounded-xl cursor-pointer hover:bg-white transition-all shadow-lg active:scale-95 mb-6">
                             <Upload className="w-5 h-5" /> 
                             {fileName ? '更换文件' : '选择音频文件 (.mp3, .flac)'}
                             <input type="file" onChange={handleFile} className="hidden" accept="audio/*,.flac" />
                         </label>

                         <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                             <ActivityIcon /> 解析日志
                         </div>
                         
                         <div className="flex-1 bg-black/50 rounded-xl p-4 font-mono text-xs overflow-y-auto border border-white/5 custom-scrollbar">
                             {logs.length === 0 ? (
                                 <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                     <AlertTriangle className="w-8 h-8 opacity-50" />
                                     <p>请上传文件以开始分析</p>
                                 </div>
                             ) : (
                                 logs.map((l, i) => {
                                     const isError = l.includes('ERROR') || l.includes('FAILURE');
                                     const isSuccess = l.includes('SUCCESS');
                                     const isHeader = l.includes('Block Found') || l.includes('Detected');
                                     
                                     return (
                                        <div key={i} className={`mb-1.5 break-all ${isError ? 'text-red-400 font-bold' : isSuccess ? 'text-green-400 font-bold' : isHeader ? 'text-blue-300' : 'text-gray-300'}`}>
                                            {l}
                                        </div>
                                     );
                                 })
                             )}
                         </div>
                     </div>

                     {/* Right: Preview */}
                     <div className="flex-1 p-6 flex flex-col bg-black/20">
                         <div className="flex items-center gap-2 mb-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                             <ImageIcon className="w-4 h-4" /> 结果预览
                         </div>
                         
                         <div className="flex-1 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-black/40 rounded-2xl border border-dashed border-white/10 flex items-center justify-center overflow-hidden relative">
                             {image ? (
                                 <>
                                     <img src={image} className="max-w-full max-h-full object-contain shadow-2xl relative z-10" alt="Extracted Cover" />
                                     <div className="absolute inset-0 bg-contain bg-center opacity-20 blur-xl" style={{ backgroundImage: `url(${image})` }}></div>
                                 </>
                             ) : (
                                 <div className="text-gray-600 text-sm font-bold flex flex-col items-center gap-2">
                                     <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                                         <ImageIcon className="w-8 h-8 opacity-20" />
                                     </div>
                                     <span>暂无图片数据</span>
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>
            </div>
        </div>
    );
};

const ActivityIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
);
