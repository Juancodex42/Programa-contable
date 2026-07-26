import os
import json
import subprocess
import psutil

# [ROBUSTNESS] Absolute paths
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCK_FILE = os.path.join(ROOT_DIR, 'system.lock')

def is_valid_app_process(pid, expected_keywords):
    try:
        if not psutil.pid_exists(pid):
            return False
        proc = psutil.Process(pid)
        cmdline = " ".join(proc.cmdline()).lower()
        for keyword in expected_keywords:
            if keyword in cmdline:
                return True
        return False
    except Exception:
        return False

def kill_pid_tree(pid, expected_keywords):
    """Kills a process and all its children recursively using psutil after verification."""
    try:
        if not psutil.pid_exists(pid):
            print(f"PID {pid} no existe o ya fue detenido.")
            return
            
        parent = psutil.Process(pid)
        cmdline = " ".join(parent.cmdline()).lower()
        matched = False
        for keyword in expected_keywords:
            if keyword in cmdline:
                matched = True
                break
                
        if not matched:
            print(f"PID {pid} ignorado (su comando '{cmdline}' no coincide con {expected_keywords}).")
            return
            
        print(f"Deteniendo árbol de procesos para PID {pid} (Comando: '{cmdline}')...")
        
        try:
            children = parent.children(recursive=True)
        except Exception:
            children = []
            
        for child in children:
            try:
                if child.is_running():
                    print(f"Deteniendo subproceso hijo: {child.pid} ({child.name()})")
                    child.kill()
            except Exception:
                pass
                
        try:
            if parent.is_running():
                print(f"Deteniendo proceso principal: {parent.pid} ({parent.name()})")
                parent.kill()
        except Exception:
            pass
            
    except Exception as e:
        print(f"Error deteniendo PID {pid}: {e}")

def stop_system():
    if not os.path.exists(LOCK_FILE):
        print(f"No se encontró un lock activo del sistema en {LOCK_FILE}")
        return

    try:
        with open(LOCK_FILE, 'r') as f:
            pids = json.load(f)
            
        print("Deteniendo componentes del Sistema Contable...")
        
        # Kill backend
        if 'backend_pid' in pids:
            kill_pid_tree(pids['backend_pid'], ["python", "app.py"])
            
        # Kill frontend
        if 'frontend_pid' in pids:
            kill_pid_tree(pids['frontend_pid'], ["node", "npm", "cmd.exe"])
            
        print("Sistema detenido exitosamente.")
        
    except Exception as e:
        print(f"Error al detener el sistema: {e}")
    finally:
        try:
            if os.path.exists(LOCK_FILE):
                os.remove(LOCK_FILE)
        except Exception as e:
            print(f"No se pudo eliminar el archivo de lock: {e}")

if __name__ == "__main__":
    stop_system()
