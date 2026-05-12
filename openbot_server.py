import os
import threading
import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
from groq import Groq
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json
import time
import asyncio
import sounddevice as sd

# Configuración
API_KEY = ""
client = Groq(api_key=API_KEY)
RATE = 44100

app = FastAPI()

# Habilitar CORS para que el dashboard web pueda comunicarse
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OpenBotBrain:
    def __init__(self):
        self.history = [
            {"role": "system", "content": "Eres OpenBot, un sistema de agentes autónomos avanzado. Tu objetivo es ayudar al usuario a programar, crear agentes y automatizar tareas. Responde siempre en español de forma profesional, eficiente y segura."}
        ]
        self.is_listening = False
        self.logs = []
        self.recording_active = False
        self.audio_data = []
        self.current_stream = None

    def add_log(self, message, type="info"):
        log_entry = {"time": time.strftime("%H:%M:%S"), "message": message, "type": type}
        self.logs.append(log_entry)
        print(f"[{type.upper()}] {message}")
        return log_entry

brain = OpenBotBrain()

@app.get("/status")
async def get_status():
    return {"status": "online", "name": "OpenBot Core"}

@app.get("/audio/devices")
async def get_audio_devices():
    try:
        devices = sd.query_devices()
        input_devices = []
        output_devices = []
        
        # Obtener dispositivos predeterminados
        default_input = sd.default.device[0]
        default_output = sd.default.device[1]

        for i, d in enumerate(devices):
            device_info = {
                "id": i,
                "name": d['name'],
                "hostapi": d['hostapi'],
                "max_input_channels": d['max_input_channels'],
                "max_output_channels": d['max_output_channels'],
                "is_default": (i == default_input or i == default_output)
            }
            if d['max_input_channels'] > 0:
                input_devices.append(device_info)
            if d['max_output_channels'] > 0:
                output_devices.append(device_info)
                
        return {
            "inputs": input_devices, 
            "outputs": output_devices,
            "default_input": default_input,
            "default_output": default_output
        }
    except Exception as e:
        return {"error": str(e)}

def audio_callback(indata, frames, time, status):
    if brain.recording_active:
        brain.audio_data.append(indata.copy())

@app.post("/audio/record/start")
async def start_recording(request: dict):
    device_id = request.get("device_id")
    if brain.recording_active:
        return {"status": "already_recording"}
    
    brain.audio_data = []
    brain.recording_active = True
    
    try:
        # Si device_id es None, sounddevice usará el predeterminado
        brain.current_stream = sd.InputStream(
            device=device_id,
            channels=1,
            samplerate=RATE,
            callback=audio_callback
        )
        brain.current_stream.start()
        brain.add_log(f"Grabación iniciada en dispositivo {device_id}", "system")
        return {"status": "started"}
    except Exception as e:
        brain.recording_active = False
        return {"error": str(e)}

@app.post("/audio/record/stop")
async def stop_recording(data: dict):
    if not brain.recording_active:
        return {"error": "not_recording"}
    
    brain.recording_active = False
    if brain.current_stream:
        brain.current_stream.stop()
        brain.current_stream.close()
    
    if not brain.audio_data:
        return {"error": "no_audio_data"}
    
    # Procesar audio
    audio_np = np.concatenate(brain.audio_data, axis=0)
    filename = "voice_input.wav"
    wav.write(filename, RATE, audio_np)
    
    try:
        # Usar la clave enviada por el frontend
        current_key = data.get("cloud_key") or API_KEY
        temp_client = Groq(api_key=current_key)
        
        with open(filename, "rb") as f:
            transcription = temp_client.audio.transcriptions.create(
                file=(filename, f.read()),
                model="whisper-large-v3",
                response_format="text"
            )
        brain.add_log(f"Voz procesada: {transcription}", "voice")
        return {"text": transcription}
    except Exception as e:
        error_str = str(e)
        if "429" in error_str:
            msg = "¡Límite de créditos alcanzado! Groq necesita un breve descanso. "
            if "try again in" in error_str:
                tiempo = error_str.split("try again in")[-1].strip().split(".")[0]
                msg += f"Por favor, inténtalo de nuevo en {tiempo}."
            else:
                msg += "Por favor, espera un minuto y vuelve a intentarlo."
            brain.add_log(msg, "warning")
            return {"error": msg}
        
        brain.add_log(f"Error en transcripción: {error_str}", "error")
        return {"error": error_str}

import base64
from fastapi import FastAPI, WebSocket, UploadFile, File, Form

# ... (código anterior)

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    temp_filename = "temp_audio.wav"
    with open(temp_filename, "wb") as f:
        f.write(await audio.read())
    
    try:
        with open(temp_filename, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=(temp_filename, f.read()),
                model="whisper-large-v3",
                response_format="text"
            )
        brain.add_log(f"Audio transcrito: {transcription}", "voice")
        return {"text": transcription}
    except Exception as e:
        return {"error": str(e)}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), description: str = Form(None)):
    content = await file.read()
    filename = file.filename
    
    # Guardar archivo localmente en una carpeta 'uploads'
    if not os.path.exists("uploads"):
        os.makedirs("uploads")
    
    filepath = os.path.join("uploads", filename)
    with open(filepath, "wb") as f:
        f.write(content)
    
    brain.add_log(f"Archivo subido: {filename}", "file")
    
    # Si es imagen, podríamos usar un modelo Vision
    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        brain.add_log("Analizando imagen...", "vision")
        # Simulación de respuesta vision
        return {"status": "success", "message": f"Imagen {filename} recibida y analizada.", "type": "image"}
    
    return {"status": "success", "message": f"Archivo {filename} recibido.", "type": "text"}

@app.post("/chat")
async def chat(request: dict):
    message = request.get("message")
    mode = request.get("mode", "cloud")
    provider = request.get("provider", "Ollama")
    url = request.get("url", "http://localhost:11434")
    model = request.get("model", "llama3.2:latest")
    
    brain.add_log(f"Mensaje recibido [{mode.upper()}]: {message}", "user")
    brain.history.append({"role": "user", "content": message})
    
    if mode == "local":
        brain.add_log(f"Consultando IA Local ({provider}) en {url}...", "agent")
        try:
            import requests
            response = requests.post(
                f"{url}/api/chat",
                json={
                    "model": model,
                    "messages": brain.history,
                    "stream": False
                }
            )
            response.raise_for_status()
            ai_response = response.json()["message"]["content"]
            
            brain.history.append({"role": "assistant", "content": ai_response})
            brain.add_log(f"Respuesta local ({model}) generada.", "success")
            return {"response": ai_response, "time": time.strftime("%I:%M %p")}
        except Exception as e:
            error_msg = f"Error conectando con IA Local: {str(e)}"
            brain.add_log(error_msg, "error")
            return {"error": error_msg}
    
    # Modo Cloud (por defecto)
    try:
        # Usar la API Key enviada desde el frontend si existe, si no usar la de respaldo
        cloud_key = request.get("cloud_key") or API_KEY
        temp_client = Groq(api_key=cloud_key)
        
        completion = temp_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=brain.history
        )
        ai_response = completion.choices[0].message.content
        brain.history.append({"role": "assistant", "content": ai_response})
        brain.add_log(f"Respuesta nube generada [{request.get('cloud_provider', 'Groq')}].", "success")
        return {"response": ai_response, "time": time.strftime("%I:%M %p")}
    except Exception as e:
        error_str = str(e)
        if "429" in error_str:
            msg = "He agotado mis créditos temporales en la nube. "
            if "try again in" in error_str:
                tiempo = error_str.split("try again in")[-1].strip().split(".")[0]
                msg += f"Podré responderte de nuevo en {tiempo}."
            else:
                msg += "Podré responderte de nuevo en un momento."
            brain.add_log(msg, "warning")
            return {"response": msg, "time": time.strftime("%I:%M %p"), "is_limit": True}
            
        brain.add_log(f"Error en Cloud: {str(e)}", "error")
        return {"error": str(e)}

@app.post("/new-session")
async def new_session():
    brain.history = [brain.history[0]] # Mantener solo el system prompt
    brain.add_log("Nueva sesión iniciada.", "system")
    return {"status": "cleared"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        try:
            # Aquí enviaremos actualizaciones en tiempo real al dashboard
            if brain.logs:
                await websocket.send_json(brain.logs[-1])
            await asyncio.sleep(1)
        except Exception:
            break

if __name__ == "__main__":
    brain.add_log("Sistemas de OpenBot inicializados.")
    uvicorn.run(app, host="0.0.0.0", port=8000)
