import os
import threading
from groq import Groq
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import time
import asyncio

# Variables Globales y Configuración
API_KEY = "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" # Respaldo
TELEGRAM_TOKEN = "8813314130:AAEu39peX5CMd_dNCaip3ay2x8LfX5hIWZk"

# Directorio donde se guardarán todos los archivos e imágenes generados
OUTPUT_DIR = r"C:\Users\LEGOLAS\Pictures\OpenBot"
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

app = FastAPI(title="OpenBot Server")

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

    def get_local_model_for_prompt(self, text, default_model):
        t = text.lower()
        if any(keyword in t for keyword in ["codigo", "código", "programa", "script", "python", "javascript", "html", "css", "java", "c++", "funcion", "función"]):
            return "qwen2.5-coder:7b"
        return default_model

    def process_command(self, text, mode="cloud", image_base64=None):
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

        # 2. Creación de Documentos (Excel, Word, PDF)
        if "crea un excel" in t or "haz un excel" in t:
            try:
                import pandas as pd
                import os
                path = os.path.join(OUTPUT_DIR, "Reporte_OpenBot.xlsx")
                df = pd.DataFrame({
                    "Activo": ["Bitcoin (BTC)", "Ethereum (ETH)", "Solana (SOL)"],
                    "Precio Estimado": [65000, 3500, 150],
                    "Recomendación": ["Mantener", "Comprar", "Observar"]
                })
                df.to_excel(path, index=False)
                return f"✅ Archivo Excel de Inversiones generado y guardado en la carpeta de salidas como 'Reporte_OpenBot.xlsx'.", True
            except Exception as e:
                return f"❌ Error creando Excel: Asegúrate de que no esté abierto el archivo. Detalles: {str(e)}", True

        if "crea un word" in t or "haz un word" in t:
            try:
                from docx import Document
                import os
                path = os.path.join(OUTPUT_DIR, "Documento_OpenBot.docx")
                doc = Document()
                doc.add_heading('Análisis de OpenBot', 0)
                doc.add_paragraph('Este documento fue generado automáticamente por el sistema Multi-Agente.')
                doc.add_paragraph('Aquí se puede incluir todo el análisis detallado de acciones, código o investigación.')
                doc.save(path)
                return f"✅ Archivo Word generado y guardado en la carpeta de salidas como 'Documento_OpenBot.docx'.", True
            except Exception as e:
                return f"❌ Error creando Word: {str(e)}", True

        if "crea un pdf" in t or "haz un pdf" in t:
            try:
                from fpdf import FPDF
                import os
                path = os.path.join(OUTPUT_DIR, "Reporte_OpenBot.pdf")
                pdf = FPDF()
                pdf.add_page()
                pdf.set_font("Arial", size=15)
                pdf.cell(200, 10, txt="Reporte Confidencial - OpenBot", ln=1, align='C')
                pdf.set_font("Arial", size=12)
                pdf.cell(200, 10, txt="Generado por el Agente Autónomo Local", ln=1, align='C')
                pdf.output(path)
                return f"✅ Archivo PDF generado y guardado en la carpeta de salidas como 'Reporte_OpenBot.pdf'.", True
            except Exception as e:
                return f"❌ Error creando PDF: {str(e)}", True
        # 3. Generación de Imágenes (txt2img & img2img)
        img_keywords = ["dibuja", "genera una imagen", "pinta", "crea una imagen", "edita", "modifica", "transforma", "cambia"]
        if any(keyword in t for keyword in img_keywords):
            import urllib.request
            import os
            import time
            import requests
            
            prompt = t
            for kw in img_keywords:
                prompt = prompt.replace(kw, "")
            prompt = prompt.replace("esta imagen", "").replace("la foto", "").strip()
            
            if len(prompt) < 3: prompt = "cyberpunk city landscape"
            
            path = os.path.join(OUTPUT_DIR, f"Imagen_OpenBot_{int(time.time())}.jpg")
            
            # Si hay una imagen adjunta, forzamos modo local (Img2Img) porque Pollinations no lo soporta de forma simple.
            is_img2img = image_base64 is not None
            
            if mode == "cloud" and not is_img2img:
                try:
                    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}"
                    urllib.request.urlretrieve(url, path)
                    return f"✅ Imagen generada en la NUBE y guardada en la carpeta de salidas como '{os.path.basename(path)}'.", True
                except Exception as e:
                    return f"❌ Error creando imagen en la nube: {str(e)}", True
            else:
                try:
                    # API Local de Automatic1111 / Forge
                    if is_img2img:
                        url = "http://127.0.0.1:7860/sdapi/v1/img2img"
                        # Limpiar cabecera base64 (ej: "data:image/jpeg;base64,")
                        base64_data = image_base64.split(",")[1] if "," in image_base64 else image_base64
                        payload = {
                            "prompt": prompt,
                            "negative_prompt": "ugly, deformed, mutated, extra limbs, poorly drawn, bad anatomy",
                            "steps": 25,
                            "width": 512,
                            "height": 768,
                            "init_images": [base64_data],
                            "denoising_strength": 0.65
                        }
                    else:
                        url = "http://127.0.0.1:7860/sdapi/v1/txt2img"
                        payload = {
                            "prompt": prompt, 
                            "negative_prompt": "ugly, deformed, mutated, extra limbs, poorly drawn, double body, two heads, bad anatomy", 
                            "steps": 25, 
                            "width": 512, 
                            "height": 768
                        }
                    
                    response = requests.post(url, json=payload, timeout=20)
                    if response.status_code == 200:
                        import base64
                        r = response.json()
                        image_data = base64.b64decode(r['images'][0])
                        with open(path, 'wb') as f:
                            f.write(image_data)
                        action_str = "editada" if is_img2img else "generada"
                        return f"✅ Imagen {action_str} LOCALMENTE y guardada en la carpeta de salidas como '{os.path.basename(path)}'.", True
                    else:
                        return f"❌ Error: El motor local respondió con código {response.status_code}.", True
                except requests.exceptions.ConnectionError:
                    return "❌ Error: El motor local (Automatic1111/Forge) no está encendido en el puerto 7860. Por favor, inícialo primero.", True
                except Exception as e:
                    return f"❌ Error local desconocido: {str(e)}", True


        # 3. Creación de Carpetas
        if "crea" in t and "carpeta" in t:
            import os
            try:
                name = "Nueva Carpeta"
                path = OUTPUT_DIR
                
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
                    brain.add_log(f"Raw update: {update}", "debug")
                    if "message" in update and "text" in update["message"]:
                        chat_id = update["message"]["chat"]["id"]
                        text = update["message"]["text"]
                        
                        # Guardar el chat_id del primer mensaje (dueño)
                        if not brain.telegram_chat_id:
                            brain.telegram_chat_id = chat_id
                            brain.add_log(f"Telegram enlazado con Chat ID: {chat_id}", "success")

                        brain.add_log(f"Telegram [{chat_id}]: {text}", "user")
                        
                        # 1. Ver si es comando
                        cmd_res, is_cmd = brain.process_command(text, mode="cloud")
                        
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
            brain.add_log(f"Error en Telegram: {e}", "error")
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
    image_base64 = request.get("image_base64", None)
    
    brain.add_log(f"Mensaje recibido [{mode.upper()}]: {message}", "user")
    
    if not brain.history:
        brain.history = brain.get_agent_history(brain.active_agent_name)
        
    brain.history.append({"role": "user", "content": message})
    
    cmd_res, is_cmd = brain.process_command(message, mode=mode, image_base64=image_base64)
    if is_cmd:
        brain.history.append({"role": "assistant", "content": cmd_res})
        return {"response": cmd_res, "time": time.strftime("%I:%M %p")}
    
    if mode == "local":
        try:
            import requests
            routed_model = brain.get_local_model_for_prompt(message, model)
            if routed_model != model:
                brain.add_log(f"Enrutador AI: Cambiando de {model} a {routed_model} basado en la petición.", "info")
            
            response = requests.post(
                f"{url}/api/chat",
                json={"model": routed_model, "messages": brain.history, "stream": False}
            )
            response.raise_for_status()
            ai_response = response.json()["message"]["content"]
            brain.history.append({"role": "assistant", "content": ai_response})
            return {"response": ai_response, "time": time.strftime("%I:%M %p")}
        except Exception as e:
            return {"error": f"Error Local: {str(e)}"}
    
    try:
        cloud_key = request.get("cloud_key", "")
        if isinstance(cloud_key, str):
            cloud_key = cloud_key.strip()
        if not cloud_key:
            cloud_key = API_KEY
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
