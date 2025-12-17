import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import io from 'socket.io-client';
import axios from 'axios';
import { Play, CloudUpload, Terminal as TermIcon, FileCode } from 'lucide-react';
import 'xterm/css/xterm.css';

// REPLACE WITH YOUR BACKEND URL
const BACKEND_URL = "https://your-backend-service.onrender.com"; 

function App() {
  const [code, setCode] = useState(`print("Hello World")\nname = input("What is your name? ")\nprint(f"Nice to meet you, {name}")`);
  const [status, setStatus] = useState("Ready");
  const terminalRef = useRef(null);
  const socketRef = useRef(null);
  const xtermRef = useRef(null);

  useEffect(() => {
    // 1. Setup Socket.IO
    socketRef.current = io(BACKEND_URL);

    // 2. Setup Xterm.js
    const term = new Terminal({
      theme: { background: '#000000' },
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, monospace'
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // 3. Connect IO
    term.onData(data => socketRef.current.emit('terminal-input', data));
    socketRef.current.on('terminal-output', data => term.write(data));

    return () => {
      socketRef.current.disconnect();
      term.dispose();
    };
  }, []);

  const runLocally = () => {
    // This sends a command to the terminal to write the file and run it
    const escapedCode = code.replace(/"/g, '\\"');
    // Command: echo "code" > main.py && python3 main.py
    socketRef.current.emit('terminal-input', `cat <<EOF > main.py\n${code}\nEOF\n`);
    setTimeout(() => {
      socketRef.current.emit('terminal-input', `python3 main.py\r`);
    }, 500);
  };

  const deploy = async () => {
    setStatus("Deploying to GitHub...");
    try {
      await axios.post(`${BACKEND_URL}/save-and-deploy`, {
        filename: "main.py",
        content: code
      });
      setStatus("✅ Pushed to GitHub! Render is building...");
    } catch (err) {
      setStatus("❌ Error: " + err.message);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-white">
      {/* Header */}
      <div className="flex justify-between items-center p-3 bg-[#2d2d2d] border-b border-gray-700">
        <div className="flex items-center gap-2 font-bold text-blue-400">
          <FileCode size={20}/> Python IDE
        </div>
        <div className="flex gap-3">
          <button onClick={runLocally} className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-3 py-1 rounded text-sm transition">
            <Play size={14}/> Test in Terminal
          </button>
          <button onClick={deploy} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded text-sm transition">
            <CloudUpload size={14}/> Deploy to Render
          </button>
        </div>
      </div>

      {/* Editor (60%) */}
      <div className="flex-grow">
        <Editor 
          height="100%" 
          defaultLanguage="python" 
          theme="vs-dark" 
          value={code} 
          onChange={setCode}
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      </div>

      {/* Terminal (40%) */}
      <div className="h-[40%] bg-black border-t border-gray-700 flex flex-col">
        <div className="px-3 py-1 bg-[#252526] text-xs text-gray-400 flex items-center gap-2">
          <TermIcon size={12}/> TERMINAL
        </div>
        <div ref={terminalRef} className="flex-grow p-1 overflow-hidden" />
      </div>

      {/* Footer */}
      <div className="bg-[#007acc] text-xs px-2 py-1">
        {status}
      </div>
    </div>
  );
}

export default App;
