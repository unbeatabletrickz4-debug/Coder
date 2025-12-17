import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { Play, Save, Settings, Terminal } from 'lucide-react';

// REPLACE THIS with your actual Backend URL after you deploy the backend part
const BACKEND_URL = "https://coder-dvli.onrender.com"; 

function App() {
  const [code, setCode] = useState(`import telebot\nimport os\n\nTOKEN = os.getenv("BOT_TOKEN")\nbot = telebot.TeleBot(TOKEN)\n\n@bot.message_handler(commands=['start'])\ndef send_welcome(message):\n    bot.reply_to(message, "Hello World!")\n\nbot.infinity_polling()`);
  const [envVars, setEnvVars] = useState([{ key: 'BOT_TOKEN', value: '' }]);
  const [logs, setLogs] = useState("Ready to deploy...");
  const [view, setView] = useState('editor'); // 'editor' or 'settings'

  const deploy = async () => {
    setLogs("Deploying...");
    try {
      const formattedEnvs = envVars.reduce((acc, curr) => {
        if(curr.key) acc[curr.key] = curr.value;
        return acc;
      }, {});

      // Random User ID for demo (In real app, get from Telegram WebApp)
      const userId = "user_" + Math.floor(Math.random() * 1000);

      await axios.post(`${BACKEND_URL}/deploy`, {
        userId: userId,
        code: code,
        envVars: formattedEnvs
      });
      setLogs("✅ Success! Bot is running.");
    } catch (err) {
      setLogs("❌ Error: " + err.message);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', color: 'white', fontFamily: 'monospace' }}>
      
      {/* Header */}
      <div style={{ padding: '10px', background: '#2d2d2d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold' }}>🐍 PyDeploy</span>
        <button onClick={deploy} style={{ background: '#2ea043', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center' }}>
          <Play size={16}/> Run
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: '#252526', display: 'flex' }}>
        <button onClick={()=>setView('editor')} style={{ padding: '10px', background: view==='editor'?'#1e1e1e':'transparent', color: view==='editor'?'white':'#888', border: 'none', cursor: 'pointer' }}>main.py</button>
        <button onClick={()=>setView('settings')} style={{ padding: '10px', background: view==='settings'?'#1e1e1e':'transparent', color: view==='settings'?'white':'#888', border: 'none', cursor: 'pointer', display: 'flex', gap: '5px' }}><Settings size={14}/> Env Vars</button>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        {view === 'editor' ? (
          <Editor 
            height="100%" 
            defaultLanguage="python" 
            theme="vs-dark" 
            value={code} 
            onChange={(val)=>setCode(val)} 
          />
        ) : (
          <div style={{ padding: '20px' }}>
            <h3>Environment Variables</h3>
            {envVars.map((env, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <input placeholder="KEY" value={env.key} onChange={e=>{const n=[...envVars];n[i].key=e.target.value;setEnvVars(n)}} style={{ background: '#3c3c3c', border: 'none', color: 'white', padding: '8px' }} />
                <input placeholder="VALUE" value={env.value} onChange={e=>{const n=[...envVars];n[i].value=e.target.value;setEnvVars(n)}} style={{ background: '#3c3c3c', border: 'none', color: 'white', padding: '8px', flex: 1 }} />
              </div>
            ))}
            <button onClick={()=>setEnvVars([...envVars, {key:'', value:''}])} style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '5px', cursor: 'pointer' }}>+ Add Var</button>
          </div>
        )}
      </div>

      {/* Logs Footer */}
      <div style={{ padding: '5px 10px', background: '#007acc', fontSize: '12px' }}>
        {logs}
      </div>
    </div>
  );
}

export default App;
