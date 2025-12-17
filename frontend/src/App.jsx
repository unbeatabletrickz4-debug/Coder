import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import io from 'socket.io-client';
import axios from 'axios';
import { 
  Play, Square, Save, Box, 
  Terminal as TermIcon, FileCode, Check 
} from 'lucide-react';
import 'xterm/css/xterm.css';

// 🛑 REPLACE WITH YOUR RENDER BACKEND URL
const BACKEND_URL = "https://coder-dvli.onrender.com"; 

function App() {
  const [socket, setSocket] = useState(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("Idle");
  const [pkgName, setPkgName] = useState("");
  
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);

  // Load code on start
  useEffect(() => {
    axios.get(`${BACKEND_URL}/files`).then(res => {
      if(res.data['main.py']) setCode(res.data['main.py']);
    });

    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    // Setup Terminal
    const term = new Terminal({
      theme: { background: '#0f0f0f', foreground: '#00ff00' },
      fontFamily: 'Menlo, monospace',
      fontSize: 13,
      cursorBlink: true
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    term.write('\x1b[33mWelcome to Python Cloud OS v2.0\x1b[0m\r\n');

    // Socket Events
    newSocket.on('term-data', (data) => term.write(data));
    newSocket.on('status', (val) => setStatus(val));
    
    // Send Input
    term.onData(data => newSocket.emit('term_input', data));

    return () => newSocket.disconnect();
  }, []);

  const saveCode = async () => {
    await axios.post(`${BACKEND_URL}/save`, { filename: 'main.py', content: code });
    xtermRef.current.write('\r\n\x1b[32m[System] File Saved Successfully.\x1b[0m\r\n');
  };

  const runCode = async () => {
    await saveCode();
    socket.emit('run_code', 'main.py');
  };

  const stopCode = () => {
    socket.emit('stop_code');
  };

  const installPkg = async () => {
    xtermRef.current.write(`\r\n[Pip] Installing ${pkgName}...\r\n`);
    const res = await axios.post(`${BACKEND_URL}/install`, { name: pkgName });
    xtermRef.current.write(`[Pip] ${res.data.status}\r\n`);
    setPkgName("");
  };

  return (
    <div className="h-screen flex flex-col bg-[#111] text-white font-mono">
      
      {/* --- TOP BAR --- */}
      <div className="h-12 bg-[#1a1a1a] border-b border-[#333] flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-cyan-400 font-bold">
          <FileCode size={18}/> CLOUD.PY
        </div>
        
        {/* Run Controls */}
        <div className="flex items-center gap-2 bg-[#222] p-1 rounded-lg border border-[#333]">
          <button onClick={saveCode} className="p-2 hover:bg-[#333] rounded" title="Save">
            <Save size={16} className="text-gray-400"/>
          </button>
          <div className="w-px h-4 bg-[#444]"></div>
          <button onClick={runCode} className="flex items-center gap-2 px-3 py-1 bg-green-900/50 hover:bg-green-800 text-green-400 text-xs rounded transition">
            <Play size={14}/> EXECUTE
          </button>
          <button onClick={stopCode} className="flex items-center gap-2 px-3 py-1 bg-red-900/50 hover:bg-red-800 text-red-400 text-xs rounded transition">
            <Square size={14}/> STOP
          </button>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${status === 'Running...' ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
          <span className="text-gray-400 uppercase">{status}</span>
        </div>
      </div>

      {/* --- MIDDLE: EDITOR & TOOLS --- */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 relative">
          <Editor 
            height="100%" 
            defaultLanguage="python" 
            theme="vs-dark" 
            value={code} 
            onChange={setCode}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: '"JetBrains Mono", monospace'
            }}
          />
        </div>

        {/* Sidebar Tools (Package Manager) */}
        <div className="w-64 bg-[#181818] border-l border-[#333] p-4 flex flex-col gap-4">
          <div className="text-xs text-gray-500 font-bold tracking-wider mb-2">PACKAGE MANAGER</div>
          <div className="bg-[#222] p-3 rounded border border-[#333]">
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
              <Box size={12}/> Install Library
            </div>
            <div className="flex gap-2">
              <input 
                className="w-full bg-[#111] border border-[#444] text-xs p-2 rounded text-white focus:outline-none focus:border-cyan-500"
                placeholder="e.g. telebot"
                value={pkgName}
                onChange={e => setPkgName(e.target.value)}
              />
              <button onClick={installPkg} className="bg-cyan-700 hover:bg-cyan-600 p-2 rounded text-white">
                <Check size={14}/>
              </button>
            </div>
            <div className="text-[10px] text-gray-600 mt-2">
              Installs pip packages directly to the host server.
            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM: TERMINAL --- */}
      <div className="h-[35%] bg-black border-t border-[#333] flex flex-col">
        <div className="px-4 py-1 bg-[#1a1a1a] text-[10px] text-gray-500 flex items-center gap-2 uppercase tracking-widest border-b border-[#333]">
          <TermIcon size={12}/> Interactive Console
        </div>
        <div className="flex-1 p-2 overflow-hidden" ref={terminalRef}></div>
      </div>
    </div>
  );
}

export default App;
