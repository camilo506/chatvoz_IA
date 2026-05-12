import os
import threading
from groq import Groq
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import time
import asyncio

# Configuración
API_KEY = "" # Respaldo
TELEGRAM_TOKEN = "8689817549:AAH-53j1LwmGEJYoueJ6GfObKeNEJ-BtmSg"
app = FastAPI()

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OpenBotBrain:
    def __init__(self):
        self.logs = []
        self.agents_file = "agents.json"
        self.agents = self.load_agents()
        self.active_agent_name = "OpenBot Original"
        self.history = self.get_agent_history(self.active_agent_name)
        self.telegram_chat_id = None # Se guardará al recibir el primer mensaje

    def load_agents(self):
        if os.path.exists(self.agents_file):
            try:
                with open(self.agents_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except:
                return self.get_default_agents()
        return self.get_default_agents()

    def get_default_agents(self):
        default = {
            "OpenBot Original": {
                "role": "Asistente General",
                "instructions": "Eres OpenBot, un sistema de agentes autónomos avanzado. Tu objetivo es ayudar al usuario a programar, crear agentes y automatizar tareas. Responde siempre en español de forma profesional y segura."
            }
        }
        self.save_agents_to_file(default)
        return default

    def save_agents_to_file(self, agents_dict):
        with open(self.agents_file, "w", encoding="utf-8") as f:
            json.dump(agents_dict, f, indent=4, ensure_ascii=False)

    def get_agent_history(self, agent_name):
        agent = self.agents.get(agent_name, self.agents["OpenBot Original"])
        return [{"role": "system", "content": agent["instructions"]}]

    def add_log(self, message, type="info"):
        log_entry = {"time": time.strftime("%H:%M:%S"), "message": message, "type": type}
        self.logs.append(log_entry)
        print(f"[{type.upper()}] {message}")
        return log_entry

    def process_command(self, text):
        """
        Procesa comandos de texto y ejecuta acciones en el sistema.
        Retorna (respuesta, fue_comando)
        """
        t = text.lower()
        
        # 1. Info del Sistema
        if any(x in t for x in ["componentes", "hardware", "dime mi pc", "info sistema"]):
            import platform
            try:
                cpu = platform.processor() or "Desconocido"
                os_info = f"{platform.system()} {platform.release()}"
                ram = "Desconocida"
                try:
                    import psutil
                    ram = f"{round(psutil.virtual_memory().total / (1024**3), 2)} GB"
                except: pass
                res = f"🖥️ Sistema: {os_info}\n🧠 CPU: {cpu}\n💾 RAM: {ram}"
                return res, True
            except:
                return "Error al leer hardware.", True

        # 2. Creación de Carpetas
        if "crea" in t and "carpeta" in t:
            import os
            try:
                name = "Nueva Carpeta"
                path = os.path.join(os.path.expanduser("~"), "Desktop")
                
                if " en " in t:
                    parts = t.split(" en ")
                    name_part = parts[0].split("carpeta")[-1].replace("llamada", "").replace("con nombre", "").strip()
                    path_part = parts[1].split(" y pon")[0].strip()
                    if name_part: name = name_part
                    if path_part and path_part != "escritorio": path = path_part
                else:
                    name_part = t.split("carpeta")[-1].replace("llamada", "").replace("con nombre", "").strip()
                    if name_part: name = name_part

                full_path = os.path.join(path, name)
                if not os.path.exists(full_path):
                    os.makedirs(full_path)
                
                res = f"✅ Carpeta '{name}' creada en {path}"
                if "y pon" in t or "con la info" in t:
                    with open(os.path.join(full_path, "info.txt"), "w") as f:
                        f.write(f"Reporte generado por OpenBot\nFecha: {time.ctime()}")
                    res += " con el archivo de información."
                return res, True
            except Exception as e:
                return f"❌ Error creando carpeta: {str(e)}", True

        return None, False

brain = OpenBotBrain()

# --- LÓGICA DE TELEGRAM ---
def telegram_worker():
    import requests
    last_update_id = 0
    brain.add_log("Telegram Worker activo y esperando...", "telegram")
    
    while True:
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates"
            params = {"offset": last_update_id + 1, "timeout": 30}
            response = requests.get(url, params=params).json()
            
            if "result" in response:
                for update in response["result"]:
                    last_update_id = update["update_id"]
                    if "message" in update and "text" in update["message"]:
                        chat_id = update["message"]["chat"]["id"]
                        text = update["message"]["text"]
                        
                        # Guardar el chat_id del primer mensaje (dueño)
                        if not brain.telegram_chat_id:
                            brain.telegram_chat_id = chat_id
                            brain.add_log(f"Telegram enlazado con Chat ID: {chat_id}", "success")

                        brain.add_log(f"Telegram [{chat_id}]: {text}", "user")
                        
                        # 1. Ver si es comando
                        cmd_res, is_cmd = brain.process_command(text)
                        
                        if is_cmd:
                            final_res = cmd_res
                        else:
                            # 2. Si no es comando, usar IA (Nube por defecto para Telegram)
                            try:
                                # Aquí podríamos reusar la lógica de chat de la nube
                                from groq import Groq
                                temp_client = Groq(api_key=API_KEY)
                                history = brain.get_agent_history(brain.active_agent_name)
                                history.append({"role": "user", "content": text})
                                completion = temp_client.chat.completions.create(
                                    model="llama-3.3-70b-versatile",
                                    messages=history
                                )
                                final_res = completion.choices[0].message.content
                            except Exception as e:
                                final_res = f"Error IA: {str(e)}"
                        
                        # Enviar respuesta a Telegram
                        send_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
                        requests.post(send_url, json={"chat_id": chat_id, "text": final_res})
                        
            time.sleep(1)
        except Exception as e:
            print(f"Error en Telegram: {e}")
            time.sleep(5)

# Iniciar hilo de Telegram
threading.Thread(target=telegram_worker, daemon=True).start()

@app.get("/status")
async def get_status():
    return {"status": "online", "name": "OpenBot Core"}

@app.post("/chat")
async def chat(request: dict):
    message = request.get("message")
    mode = request.get("mode", "cloud")
    provider = request.get("provider", "Ollama")
    url = request.get("url", "http://localhost:11434")
    model = request.get("model", "llama3.2:latest")
    
    brain.add_log(f"Mensaje recibido [{mode.upper()}]: {message}", "user")
    
    if not brain.history:
        brain.history = brain.get_agent_history(brain.active_agent_name)
        
    brain.history.append({"role": "user", "content": message})
    
    if mode == "local":
        try:
            import requests
            response = requests.post(
                f"{url}/api/chat",
                json={"model": model, "messages": brain.history, "stream": False}
            )
            response.raise_for_status()
            ai_response = response.json()["message"]["content"]
            brain.history.append({"role": "assistant", "content": ai_response})
            return {"response": ai_response, "time": time.strftime("%I:%M %p")}
        except Exception as e:
            return {"error": f"Error Local: {str(e)}"}
    
    try:
        cloud_key = request.get("cloud_key") or API_KEY
        temp_client = Groq(api_key=cloud_key)
        completion = temp_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=brain.history
        )
        ai_response = completion.choices[0].message.content
        brain.history.append({"role": "assistant", "content": ai_response})
        return {"response": ai_response, "time": time.strftime("%I:%M %p")}
    except Exception as e:
        return {"error": f"Error Cloud: {str(e)}"}

@app.post("/new-session")
async def new_session():
    brain.history = brain.get_agent_history(brain.active_agent_name)
    return {"status": "cleared"}

@app.get("/agents")
async def get_agents():
    return {"agents": brain.agents, "active": brain.active_agent_name}

@app.post("/agents")
async def create_agent(data: dict):
    name, role, inst = data.get("name"), data.get("role"), data.get("instructions")
    if name and inst:
        brain.agents[name] = {"role": role or "Agente", "instructions": inst}
        brain.save_agents_to_file(brain.agents)
        return {"status": "success"}
    return {"error": "Faltan datos"}

@app.post("/agents/activate")
async def activate_agent(data: dict):
    name = data.get("name")
    if name in brain.agents:
        brain.active_agent_name = name
        brain.history = brain.get_agent_history(name)
        return {"status": "activated", "name": name}
    return {"error": "No encontrado"}

@app.delete("/agents/{name}")
async def delete_agent(name: str):
    if name != "OpenBot Original" and name in brain.agents:
        del brain.agents[name]
        brain.save_agents_to_file(brain.agents)
        return {"status": "deleted"}
    return {"error": "No permitido"}

@app.get("/system-info")
async def get_system_info():
    import platform
    try:
        cpu = platform.processor() or "Procesador Genérico"
        os_info = f"{platform.system()} {platform.release()}"
        ram = "No disponible"
        try:
            import psutil
            ram = f"{round(psutil.virtual_memory().total / (1024**3), 2)} GB"
        except:
            import subprocess
            output = subprocess.check_output("wmic computersystem get totalphysicalmemory", shell=True).decode()
            ram = f"{round(int(output.split()[1]) / (1024**3), 2)} GB"

        return {"info": f"🖥️ **Sistema:** {os_info}\n🧠 **Procesador:** {cpu}\n💾 **Memoria RAM:** {ram}"}
    except:
        return {"info": "No pude acceder a la info del sistema."}

@app.post("/create-folder-anywhere")
async def create_folder_anywhere(data: dict):
    import os
    name, path, content = data.get("name"), data.get("path"), data.get("content")
    try:
        if not path or path.lower() == "escritorio":
            path = os.path.join(os.path.expanduser("~"), "Desktop")
        full_path = os.path.join(path, name)
        if not os.path.exists(full_path):
            os.makedirs(full_path)
        if content:
            # Si el contenido es el flag de info, generarlo
            if content == "info_del_pc":
                import platform
                content = f"Reporte de {platform.node()}\nCPU: {platform.processor()}\nOS: {platform.system()}"
            
            with open(os.path.join(full_path, "nota.txt"), "w", encoding="utf-8") as f:
                f.write(content)
        return {"status": "success", "message": f"Carpeta creada en {path}"}
    except Exception as e:
        return {"error": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        try:
            if brain.logs: await websocket.send_json(brain.logs[-1])
            await asyncio.sleep(1)
        except: break

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
