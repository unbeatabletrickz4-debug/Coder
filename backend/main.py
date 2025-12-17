import os
import sys
import subprocess
import pty
import select
import signal
import socketio
import threading
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient

# --- CONFIG ---
MONGO_URI = os.getenv("MONGO_URI") # Get this from MongoDB Atlas (Free)
client = MongoClient(MONGO_URI)
db = client["cloud_ide"]
files_collection = db["files"]

app = FastAPI()
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State for the running process
current_process = None
master_fd = None

# --- API ENDPOINTS ---

class FileData(BaseModel):
    filename: str
    content: str

@app.get("/files")
def get_files():
    # Load files from DB
    files = {}
    for doc in files_collection.find():
        files[doc["filename"]] = doc["content"]
    if not files:
        # Default Template
        return {"main.py": "import time\nprint('Hello Cloud!')\nwhile True:\n  time.sleep(1)"}
    return files

@app.post("/save")
def save_file(data: FileData):
    files_collection.update_one(
        {"filename": data.filename}, 
        {"$set": {"content": data.content}}, 
        upsert=True
    )
    # Also save locally so python can run it
    with open(data.filename, "w") as f:
        f.write(data.content)
    return {"status": "Saved"}

@app.post("/install")
def install_package(package: dict):
    pkg_name = package.get("name")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg_name])
        return {"status": f"Installed {pkg_name}"}
    except Exception as e:
        return {"status": f"Error: {str(e)}"}

# --- TERMINAL & RUNNER LOGIC ---

@sio.event
async def run_code(sid, filename):
    global current_process, master_fd
    
    # 1. Kill existing process
    if current_process:
        try:
            os.kill(current_process.pid, signal.SIGTERM)
        except:
            pass
    
    # 2. Start new process with PTY (Pseudo Terminal)
    # This allows interactive input() to work!
    master_fd, slave_fd = pty.openpty()
    
    current_process = subprocess.Popen(
        [sys.executable, "-u", filename], # -u for unbuffered output
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        preexec_fn=os.setsid,
        close_fds=True
    )
    
    os.close(slave_fd) # Close slave in parent
    
    await sio.emit('status', 'Running...', room=sid)

    # 3. Stream output loop
    def read_output():
        global master_fd
        while True:
            try:
                r, _, _ = select.select([master_fd], [], [], 0.1)
                if master_fd in r:
                    data = os.read(master_fd, 1024).decode(errors='ignore')
                    if data:
                        asyncio.run(sio.emit('term-data', data))
                    else:
                        break
            except (OSError, ValueError):
                break
    
    threading.Thread(target=read_output, daemon=True).start()

@sio.event
async def stop_code(sid):
    global current_process
    if current_process:
        try:
            os.kill(current_process.pid, signal.SIGTERM)
            current_process = None
            await sio.emit('term-data', '\n\u001b[31m[Process Stopped by User]\u001b[0m\n')
            await sio.emit('status', 'Stopped')
        except:
            pass

@sio.event
async def term_input(sid, data):
    global master_fd
    if master_fd:
        try:
            os.write(master_fd, data.encode())
        except:
            pass
