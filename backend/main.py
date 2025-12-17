import os
import sys
import subprocess
from typing import Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Allow connections from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store running processes: { "user_id": subprocess_object }
running_bots: Dict[str, subprocess.Popen] = {}

class DeployRequest(BaseModel):
    userId: str
    code: str
    envVars: Dict[str, str]

# Create folder for user scripts
if not os.path.exists("user_bots"):
    os.makedirs("user_bots")

@app.get("/")
def read_root():
    return {"status": "Python Host Active"}

@app.post("/deploy")
def deploy_bot(data: DeployRequest):
    user_id = data.userId
    
    # 1. Stop existing bot for this user if running
    if user_id in running_bots:
        try:
            running_bots[user_id].terminate()
            running_bots[user_id].wait()
        except:
            pass

    # 2. Save Code to File
    filename = f"user_bots/{user_id}.py"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(data.code)

    # 3. Prepare Environment Variables
    env = os.environ.copy()
    env.update(data.envVars)
    env["PYTHONUNBUFFERED"] = "1" # Important for logs

    # 4. Run the script using the same Python interpreter
    try:
        proc = subprocess.Popen(
            [sys.executable, filename],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        running_bots[user_id] = proc
        return {"success": True, "message": "Bot Deployed Successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
