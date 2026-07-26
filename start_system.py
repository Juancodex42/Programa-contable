import subprocess
import time
import webbrowser
import os
import sys
import json
import psutil

# Hide Console Window & Detach Process Flags
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000
SPAWN_FLAGS = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW

def check_already_running(lock_file):
    if not os.path.exists(lock_file):
        return False, False, False

    backend_running = False
    frontend_running = False

    try:
        with open(lock_file, 'r') as f:
            pids = json.load(f)
        
        # Check backend
        if 'backend_pid' in pids:
            b_pid = pids['backend_pid']
            if psutil.pid_exists(b_pid):
                try:
                    proc = psutil.Process(b_pid)
                    cmd = " ".join(proc.cmdline()).lower()
                    if "python" in cmd and "app.py" in cmd:
                        backend_running = True
                except Exception:
                    pass
        
        # Check frontend
        if 'frontend_pid' in pids:
            f_pid = pids['frontend_pid']
            if psutil.pid_exists(f_pid):
                try:
                    proc = psutil.Process(f_pid)
                    cmd = " ".join(proc.cmdline()).lower()
                    if "node" in cmd or "npm" in cmd or "vite" in cmd:
                        frontend_running = True
                except Exception:
                    pass
    except Exception:
        pass

    return backend_running, frontend_running, (backend_running and frontend_running)

def load_ports(root_dir):
    backend_port = 5000
    frontend_port = 5173
    env_path = os.path.join(root_dir, "webapp", "backend", ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        parts = line.split('=', 1)
                        k = parts[0].strip()
                        v = parts[1].strip().strip("'").strip('"')
                        if k == 'BACKEND_PORT':
                            backend_port = int(v)
                        elif k == 'FRONTEND_PORT':
                            frontend_port = int(v)
        except Exception:
            pass
    return backend_port, frontend_port

def get_python_executable():
    py311 = r"C:\Users\juanc\AppData\Local\Programs\Python\Python311\python.exe"
    if os.path.exists(py311):
        return py311
    return sys.executable

def start_hidden():
    ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
    lock_file = os.path.join(ROOT_DIR, 'system.lock')
    
    backend_port, frontend_port = load_ports(ROOT_DIR)
    
    backend_running, frontend_running, both_running = check_already_running(lock_file)
    
    if both_running:
        print("El sistema contable ya se encuentra en ejecución.")
        webbrowser.open(f"http://localhost:{frontend_port}")
        sys.exit(0)
        
    print("Iniciando Sistema Contable (Modo Silencioso)...")
    
    # 0. Update documentation dynamically
    try:
        py_exe = get_python_executable()
        docs_script = os.path.join(ROOT_DIR, "scripts", "update_docs.py")
        subprocess.run([py_exe, docs_script], cwd=ROOT_DIR, creationflags=CREATE_NO_WINDOW)
    except Exception as e:
        print(f"No se pudo actualizar la documentación: {e}")
    
    pids = {}
    if os.path.exists(lock_file):
        try:
            with open(lock_file, 'r') as f:
                pids = json.load(f)
        except Exception:
            pass

    # 1. Start Backend if not running
    if not backend_running:
        py_exe = get_python_executable()
        backend_dir = os.path.join(ROOT_DIR, "webapp", "backend")
        env_vars = os.environ.copy()
        env_vars["PORT"] = str(backend_port)
        backend_proc = subprocess.Popen([py_exe, "app.py"], cwd=backend_dir, env=env_vars, creationflags=SPAWN_FLAGS)
        print(f"Backend PID: {backend_proc.pid} (Port: {backend_port}, Py: {py_exe})")
        pids['backend_pid'] = backend_proc.pid
    else:
        print("Backend ya se encuentra en ejecución.")

    # 2. Start Frontend if not running
    if not frontend_running:
        frontend_dir = os.path.join(ROOT_DIR, "webapp", "frontend")
        frontend_cmd = ["npm.cmd", "run", "dev", "--", "--port", str(frontend_port)]
        frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir, creationflags=SPAWN_FLAGS)
        print(f"Frontend PID: {frontend_proc.pid} (Port: {frontend_port})")
        pids['frontend_pid'] = frontend_proc.pid
    else:
        print("Frontend ya se encuentra en ejecución.")
    
    # SAVE PIDS
    with open(lock_file, 'w') as f:
        json.dump(pids, f)
        
    # 3. Wait for servers to spin up
    time.sleep(3)
    
    # 4. Open Browser safely
    url = f"http://localhost:{frontend_port}"
    webbrowser.open(url)

if __name__ == "__main__":
    start_hidden()
