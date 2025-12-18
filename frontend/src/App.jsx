import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import io from 'socket.io-client';
import axios from 'axios';
import { 
  Play, 
  Terminal as TermIcon, 
  Settings, 
  Save, 
  Box, 
  DownloadCloud, 
  Zap 
} from 'lucide-react';
import 'xterm/css/xterm.css';

// 🛑 REPLACE WITH YOUR RENDER BACKEND URL
const BACKEND_URL = "https://coder-dvli.onrender.com"; 

function App() {
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor', 'terminal', 'pip'
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Ready");
  const [pkgName, setPkgName] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([]); // For mobile-friendly log view if xterm fails
  
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Load File
    axios.get(`${BACKEND_URL}/files`).then(res => {
      if(res.data['main.py']) setCode(res.data['main.py']);
    });

    // 2. Connect Socket
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    // 3. Setup Terminal (Xterm.js)
    const term = new Terminal({
      theme: { background: '#13111c', foreground: '#e0e0e0', cursor: '#fbbf24' },
      fontFamily: 'monospace',
      fontSize: 12, // Smaller font for mobile
      cursorBlink: true,
      rows: 20
    });
    
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // We delay opening terminal until the tab is visible (handled in effects)
    xtermRef.current = term;

    // 4. Socket Events
    newSocket.on('term-data', (data) => {
      if(xtermRef.current) xtermRef.current.write(data);
    });

    newSocket.on('status', (val) => setStatus(val));
    
    // 5. Send Input from Terminal to Backend
    term.onData(data => newSocket.emit('term_input', data));

    return () => newSocket.disconnect();
  }, []);

  // --- HANDLE RESIZING & TABS ---
  useEffect(() => {
    if (activeTab === 'terminal' && xtermRef.current && terminalRef.current) {
      // Clear previous instance if needed or just open
      if (!xtermRef.current.element) {
        xtermRef.current.open(terminalRef.current);
      }
      fitAddonRef.current.fit();
      xtermRef.current.focus();
    }
  }, [activeTab]);

  // --- ACTIONS ---
  const handleSave = async () => {
    setStatus("Saving...");
    await axios.post(`${BACKEND_URL}/save`, { filename: 'main.py', content: code });
    setStatus("Saved ✅");
    setTimeout(() => setStatus("Ready"), 2000);
  };

  const handleRun = async () => {
    await handleSave();
    setActiveTab('terminal'); // Auto-switch to terminal
    socket.emit('run_code', 'main.py');
  };

  const handleStop = () => {
    socket.emit('stop_code');
  };

  const handleInstall = async () => {
    if (!pkgName) return;
    setStatus(`Installing ${pkgName}...`);
    xtermRef.current.write(`\r\n\x1b[33m[PIP] Installing ${pkgName}...\x1b[0m\r\n`);
    try {
      const res = await axios.post(`${BACKEND_URL}/install`, { name: pkgName });
      xtermRef.current.write(`\r\n\x1b[32m[PIP] ${res.data.status}\x1b[0m\r\n`);
      setPkgName("");
      setStatus("Installed ✅");
    } catch (e) {
      setStatus("Error ❌");
    }
  };

  // --- RENDER HELPERS ---
  return (
    <div className="flex flex-col h-[100dvh] bg-[#13111c] text-white font-sans overflow-hidden">
      
      {/* 1. TOP HEADER (Mobile App Style) */}
      <div className="h-14 bg-[#1e1b2e] flex items-center justify-between px-4 shadow-lg border-b border-[#2d2a42] z-10">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-yellow-400 to-orange-500 p-1.5 rounded-lg">
            <Zap size={18} className="text-white" fill="white"/>
          </div>
          <span className="font-bold text-lg tracking-wide text-gray-100">PyDroid Cloud</span>
        </div>
        
        {/* Status Chip */}
        <div className="flex items-center gap-2 bg-[#2d2a42] px-3 py-1 rounded-full border border-[#ffffff10]">
          <div className={`w-2 h-2 rounded-full ${status.includes("Running") ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
          <span className="text-xs font-medium text-gray-300">{status}</span>
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 relative overflow-hidden bg-[#13111c]">
        
        {/* --- VIEW: EDITOR --- */}
        <div className={`h-full w-full absolute top-0 left-0 transition-opacity duration-300 ${activeTab === 'editor' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          <Editor 
            height="100%" 
            defaultLanguage="python" 
            theme="vs-dark" 
            value={code} 
            onChange={setCode}
            options={{
              minimap: { enabled: false },
              fontSize: 14, // Readable on mobile
              lineNumbers: "on",
              folding: false,
              padding: { top: 20 }
            }}
          />
          
          {/* FLOATING ACTION BUTTON (FAB) - Pydroid Style */}
          <button 
            onClick={handleRun}
            className="absolute bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full shadow-2xl flex items-center justify-center text-white active:scale-95 transition-transform z-50 border-4 border-[#13111c]"
          >
            <Play size={28} fill="currentColor" className="ml-1"/>
          </button>

          {/* Save Button (Mini FAB) */}
          <button 
            onClick={handleSave}
            className="absolute bottom-24 right-8 w-12 h-12 bg-[#2d2a42] rounded-full shadow-xl flex items-center justify-center text-blue-400 active:scale-95 transition-transform border border-[#ffffff20]"
          >
            <Save size={20} />
          </button>
        </div>

        {/* --- VIEW: TERMINAL --- */}
        <div className={`h-full w-full flex flex-col absolute top-0 left-0 bg-black transition-opacity duration-300 ${activeTab === 'terminal' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
           {/* Terminal Toolbar */}
           <div className="h-10 bg-[#1e1b2e] flex items-center justify-end px-4 gap-3 border-b border-[#333]">
              <span className="text-xs text-gray-500 mr-auto">INTERACTIVE SHELL</span>
              <button onClick={handleStop} className="text-red-400 text-xs font-bold border border-red-900 bg-red-900/20 px-3 py-1 rounded">STOP PROCESS</button>
           </div>
           {/* Xterm Container */}
           <div className="flex-1 p-2 overflow-hidden" ref={terminalRef}></div>
        </div>

        {/* --- VIEW: PIP INSTALLER --- */}
        <div className={`h-full w-full p-6 absolute top-0 left-0 bg-[#13111c] transition-opacity duration-300 ${activeTab === 'pip' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Box className="text-yellow-400"/> Pip Install
          </h2>
          
          <div className="bg-[#1e1b2e] p-6 rounded-2xl border border-[#ffffff10] shadow-xl">
            <label className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2 block">Library Name</label>
            <div className="flex gap-2">
              <input 
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="e.g. telebot, numpy, requests"
                className="flex-1 bg-[#13111c] text-white p-4 rounded-xl border border-[#ffffff20] focus:border-yellow-400 focus:outline-none"
              />
            </div>
            <button 
              onClick={handleInstall}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
            >
              <DownloadCloud size={20}/> Install Now
            </button>
          </div>

          <div className="mt-8 text-center text-gray-500 text-sm">
            <p>Popular libraries to try:</p>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {['telebot', 'requests', 'flask', 'pymongo'].map(lib => (
                <span key={lib} onClick={() => setPkgName(lib)} className="bg-[#2d2a42] px-3 py-1 rounded-full text-xs cursor-pointer border border-[#ffffff10]">
                  {lib}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* 3. BOTTOM NAVIGATION BAR (Mobile Style) */}
      <div className="h-16 bg-[#1e1b2e] border-t border-[#2d2a42] flex items-center justify-around px-2 pb-safe z-50">
        
        <NavButton 
          active={activeTab === 'editor'} 
          onClick={() => setActiveTab('editor')} 
          icon={<Zap size={24}/>} 
          label="Code"
        />
        
        <NavButton 
          active={activeTab === 'terminal'} 
          onClick={() => setActiveTab('terminal')} 
          icon={<TermIcon size={24}/>} 
          label="Terminal" 
        />
        
        <NavButton 
          active={activeTab === 'pip'} 
          onClick={() => setActiveTab('pip')} 
          icon={<Box size={24}/>} 
          label="Pip" 
        />
        
      </div>
    </div>
  );
}

// Helper Component for Bottom Nav
function NavButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick} 
      className={`flex flex-col items-center justify-center w-full h-full transition-colors ${active ? 'text-yellow-400' : 'text-gray-500'}`}
    >
      <div className={`p-1 rounded-xl transition-all ${active ? 'bg-[#ffffff10] -translate-y-1' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] font-medium mt-1">{label}</span>
    </button>
  );
}

export default App;
