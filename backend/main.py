import os
import sys
import subprocess
import pty
import select
import signal
import socketio
import threading
import asyncio
import fcntl
import struct
import termios
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient

# --- DATABASE CONNECTION ---
# 1. Get this from Render Environment Variables
# If no DB is provided, we use a temporary in-memory dict (Code is lost on restart)
MONGO_URI = os.getenv("MONGO_URI")

if MONGO_URI:
    try:
        client = MongoClient(MONGO_URI)
        db = client["cloud_ide"]
        files_collection = db["files"]
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"❌ MongoDB Error: {e}")
        files_collection = None
else:
    print("⚠️ No MONGO_URI found. Using temporary memory.")
    files_collection = None

# In-memory fallback
memory_store = {"main.py": "print('Hello from Mobile IDE!')"}

app = FastAPI()

# Allow connection from your Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# SocketIO for Real-Time Terminal
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Global process state
sessions = {} # { sid: { fd, pid } }

# --- API ENDPOINTS ---

@app.get("/")
def health():
    return {"status": "Mobile Backend Active 🚀"}

@app.get("/files")
def get_files():
    if files_collection:
        data = files_collection.find_one({"filename": "main.py"})
        content = data["content"] if data else ""
    else:
        content = memory_store.get("main.py", "")
    
    return {"main.py": content}

class SaveRequest(BaseModel):
    filename: str
    content: str

@app.post("/save")
def save_file(data: SaveRequest):
    # 1. Save to DB (Persistence)
    if files_collection:
        files_collection.update_one(
            {"filename": data.filename},
            {"$set": {"content": data.content}},
            upsert=True
        )
    else:
        memory_store[data.filename] = data.content
    
    # 2. Save to Disk (So Python can run it)
    with open(data.filename, "w", encoding="utf-8") as f:
        f.write(data.content)
        
    return {"status": "Saved"}

class InstallRequest(BaseModel):
    name: str

@app.post("/install")
def install_package(data: InstallRequest):
    try:
        # Runs 'pip install package_name' on the server
        subprocess.check_call([sys.executable, "-m", "pip", "install", data.name])
        return {"status": f"Successfully installed {data.name}"}
    except Exception as e:
        return {"status": f"Failed: {str(e)}"}

# --- TERMINAL LOGIC (The Magic) ---

@sio.event
async def run_code(sid, filename):
    # Kill previous session if exists
    if sid in sessions:
        try:
            os.kill(sessions[sid]["pid"], signal.SIGTERM)
            os.close(sessions[sid]["fd"])
        except: 
            pass
        del sessions[sid]

    await sio.emit('status', 'Running...', room=sid)

    # Create PTY (Pseudo-Terminal) - Makes it interactive!
    master_fd, slave_fd = pty.openpty()

    process = subprocess.Popen(
        [sys.executable, "-u", filename], # Run Python unbuffered
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        preexec_fn=os.setsid,
        close_fds=True
    )

    os.close(slave_fd)
    sessions[sid] = {"fd": master_fd, "pid": process.pid}

    # Background thread to read output
    def read_output(fd, s_id):
        while True:
            try:
                # Wait for data
                r, _, _ = select.select([fd], [], [], 0.5)
                if fd in r:
                    output = os.read(fd, 1024).decode(errors='ignore')
                    if not output: break # Process finished
                    
                    # Send to Frontend
                    asyncio.run(sio.emit('term-data', output, room=s_id))
                
                # Check if process is dead
                if process.poll() is not None:
                    asyncio.run(sio.emit('status', 'Stopped', room=s_id))
                    break
            except:
                break
        
        # Cleanup
        if s_id in sessions: del sessions[s_id]

    threading.Thread(target=read_output, args=(master_fd, sid), daemon=True).start()

@sio.event
async def term_input(sid, data):
    # Receive keystrokes from mobile keyboard
    if sid in sessions:
        fd = sessions[sid]["fd"]
        try:
            os.write(fd, data.encode())
        except:
            pass

@sio.event
async def stop_code(sid):
    if sid in sessions:
        try:
            os.kill(sessions[sid]["pid"], signal.SIGKILL)
            await sio.emit('term-data', '\r\n\x1b[31m[Stopped by User]\x1b[0m\r\n', room=sid)
        except:
            pass
