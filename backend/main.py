import os
import pty
import select
import subprocess
import struct
import fcntl
import termios
import signal
import socketio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from github import Github

# --- CONFIG ---
# Get these from Render Env Vars
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN") 
REPO_NAME = os.getenv("GITHUB_REPO") # Format: "your-username/your-repo"

app = FastAPI()
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- TERMINAL LOGIC (The "VS Code" part) ---
# We use PTY (Pseudo-Terminal) to make it real and interactive
sessions = {}

@sio.event
async def connect(sid, environ):
    # Spawn a new terminal process (bash)
    master_fd, slave_fd = pty.openpty()
    pid = subprocess.Popen(
        ["bash"], 
        stdin=slave_fd, 
        stdout=slave_fd, 
        stderr=slave_fd, 
        preexec_fn=os.setsid,
        shell=False,
        close_fds=True
    ).pid
    
    sessions[sid] = {"fd": master_fd, "pid": pid}
    
    # Read output from terminal and send to frontend
    def read_output():
        while True:
            try:
                if sid not in sessions: break
                r, _, _ = select.select([master_fd], [], [], 0.1)
                if master_fd in r:
                    output = os.read(master_fd, 1024).decode(errors='ignore')
                    if output:
                        # Send to frontend Xterm.js
                        import asyncio
                        asyncio.run(sio.emit('terminal-output', output, room=sid))
            except:
                break
    
    import threading
    threading.Thread(target=read_output, daemon=True).start()

@sio.event
async def disconnect(sid):
    if sid in sessions:
        os.close(sessions[sid]["fd"])
        del sessions[sid]

@sio.event
async def terminal_input(sid, data):
    if sid in sessions:
        os.write(sessions[sid]["fd"], data.encode())

# --- DEPLOY LOGIC (The "One-Click" part) ---
class FileData(BaseModel):
    filename: str
    content: str

@app.post("/save-and-deploy")
def deploy_to_github(data: FileData):
    if not GITHUB_TOKEN or not REPO_NAME:
        raise HTTPException(500, "GitHub Token/Repo not configured on server.")

    try:
        # Save locally first (so you can run it in terminal)
        with open(data.filename, "w") as f:
            f.write(data.content)

        # Push to GitHub
        g = Github(GITHUB_TOKEN)
        repo = g.get_repo(REPO_NAME)
        
        try:
            # Update file if exists
            contents = repo.get_contents(data.filename)
            repo.update_file(contents.path, "Update via Cloud IDE", data.content, contents.sha)
        except:
            # Create file if new
            repo.create_file(data.filename, "Create via Cloud IDE", data.content)
            
        return {"status": "success", "message": "Code pushed to GitHub! Render will deploy now."}
    except Exception as e:
        raise HTTPException(500, str(e))
