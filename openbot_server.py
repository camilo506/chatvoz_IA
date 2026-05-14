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

# Misma resolución que la nube (Pollinations gen … width=height) para que local y nube se vean igual en el chat.
IMAGE_GEN_SIZE = 1024

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
        self.active_agent_name = "OpenBot"
        self.history = self.get_agent_history(self.active_agent_name)
        self.telegram_chat_id = None # Se guardará al recibir el primer mensaje

    def load_agents(self):
        if os.path.exists(self.agents_file):
            try:
                with open(self.agents_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "OpenBot Original" in data:
                    if "OpenBot" not in data:
                        data["OpenBot"] = data.pop("OpenBot Original")
                    else:
                        del data["OpenBot Original"]
                    self.save_agents_to_file(data)
                return data
            except:
                return self.get_default_agents()
        return self.get_default_agents()

    def get_default_agents(self):
        default = {
            "OpenBot": {
                "role": "Asistente General",
                "instructions": "Eres OpenBot, un sistema de agentes autónomos avanzado. Tu objetivo es ayudar al usuario a programar, crear agentes y automatizar tareas. Responde siempre en español de forma profesional y segura. Si el usuario pide dibujar o generar una imagen ilustrada, no sustituyas eso con una descripción larga de la escena: indica en una frase breve que debe usar en el mismo chat frases como «dibuja…» o «crea una imagen de…» para que el sistema genere la imagen en el panel."
            }
        }
        self.save_agents_to_file(default)
        return default

    def save_agents_to_file(self, agents_dict):
        with open(self.agents_file, "w", encoding="utf-8") as f:
            json.dump(agents_dict, f, indent=4, ensure_ascii=False)

    def get_agent_history(self, agent_name):
        agent = self.agents.get(agent_name, self.agents["OpenBot"])
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
        Retorna (respuesta, fue_comando, imagen_data_url_o_None).
        Si imagen_data_url no es None, el cliente puede mostrar la imagen en el chat.
        """
        def _file_to_data_url(image_path):
            import base64 as b64
            with open(image_path, "rb") as imgf:
                raw = imgf.read()
            if raw[:8] == b"\x89PNG\r\n\x1a\n":
                mime = "image/png"
            elif len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
                mime = "image/webp"
            elif raw[:2] == b"\xff\xd8":
                mime = "image/jpeg"
            else:
                mime = "image/jpeg"
            return f"data:{mime};base64," + b64.standard_b64encode(raw).decode("ascii")

        def _bytes_to_data_url(raw: bytes):
            """Igual que leer archivo pero desde memoria: no guarda en disco (solo panel + descarga manual)."""
            import base64 as b64
            if raw[:8] == b"\x89PNG\r\n\x1a\n":
                mime = "image/png"
            elif len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
                mime = "image/webp"
            elif raw[:2] == b"\xff\xd8":
                mime = "image/jpeg"
            else:
                mime = "image/jpeg"
            return f"data:{mime};base64," + b64.standard_b64encode(raw).decode("ascii")

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
                return res, True, None
            except:
                return "Error al leer hardware.", True, None

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
                return f"✅ Archivo Excel de Inversiones generado y guardado en la carpeta de salidas como 'Reporte_OpenBot.xlsx'.", True, None
            except Exception as e:
                return f"❌ Error creando Excel: Asegúrate de que no esté abierto el archivo. Detalles: {str(e)}", True, None

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
                return f"✅ Archivo Word generado y guardado en la carpeta de salidas como 'Documento_OpenBot.docx'.", True, None
            except Exception as e:
                return f"❌ Error creando Word: {str(e)}", True, None

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
                return f"✅ Archivo PDF generado y guardado en la carpeta de salidas como 'Reporte_OpenBot.pdf'.", True, None
            except Exception as e:
                return f"❌ Error creando PDF: {str(e)}", True, None
        # 3. Generación de Imágenes (txt2img & img2img)
        # Frases que disparan generación real (no respuesta de texto del LLM).
        img_keywords = [
            "generame una imagen",
            "genera una imagen",
            "muéstrame una imagen",
            "muestrame una imagen",
            "necesito una imagen",
            "quiero una imagen",
            "hazme una imagen",
            "haz una imagen",
            "dame una imagen",
            "creo una imagen",
            "crea una imagen",
            "crea una image",
            "creo imagen",
            "crea imagen",
            "generame imagen",
            "genera imagen",
            "haz un dibujo",
            "hazme un dibujo",
            "dibujame",
            "dibújame",
            "dibuja",
            "pintame",
            "pinta",
            "ilustra",
            "diseña una imagen",
            "diseña imagen",
            "edita",
            "modifica",
            "transforma",
            "cambia",
        ]

        def _message_requests_image(low: str) -> bool:
            if any(kw in low for kw in img_keywords):
                return True
            pad = " " + " ".join(low.split()) + " "
            has_subject = (
                " una imagen " in pad
                or " imagen de " in pad
                or " imagen del " in pad
                or " un dibujo " in pad
                or " una ilustración " in pad
                or " una ilustracion " in pad
                or " ilustración de " in pad
                or " ilustracion de " in pad
            )
            if not has_subject:
                return False
            markers = (
                " dibuja",
                " dibujame",
                " genera",
                " generame",
                " crea ",
                " creo ",
                " crees",
                " creas",
                " haz ",
                " hazme",
                " haz una",
                " pinta",
                " ilustra",
                " diseña",
                " disena",
                " muestrame",
                " muéstrame",
                " dame ",
                " quiero ",
                " necesito ",
            )
            return any(m in pad for m in markers)

        if _message_requests_image(t):
            import os
            import urllib.parse
            import urllib.request
            import requests

            prompt = t
            for kw in sorted(img_keywords, key=len, reverse=True):
                prompt = prompt.replace(kw, " ")
            for noise in (
                "si te pido",
                "te pido que",
                "te pido",
                "por favor",
                "quiero que",
                "quisiera que",
                "me gustaría que",
                "me gustaria que",
                "podrías",
                "podrias",
                "puedes",
            ):
                prompt = prompt.replace(noise, " ")
            prompt = prompt.replace("esta imagen", "").replace("la foto", "").strip()
            while "  " in prompt:
                prompt = prompt.replace("  ", " ")
            
            if len(prompt) < 3: prompt = "cyberpunk city landscape"

            # Imágenes solo para el chat (data URL): no escribimos en OUTPUT_DIR; el usuario descarga con "Descargar" en el panel.
            # Si hay una imagen adjunta, forzamos modo local (Img2Img) porque Pollinations no lo soporta de forma simple.
            is_img2img = image_base64 is not None
            
            if mode == "cloud" and not is_img2img:
                try:
                    import base64 as b64_mod

                    p = prompt.strip()
                    if len(p) > 1500:
                        p = p[:1500].rsplit(" ", 1)[0]
                    q = urllib.parse.quote(p, safe="")
                    ua = (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/131.0.0.0 Safari/537.36"
                    )
                    poll_key = os.environ.get("POLLINATIONS_API_KEY", "").strip()
                    size_str = f"{IMAGE_GEN_SIZE}x{IMAGE_GEN_SIZE}"

                    if poll_key:
                        # Documentación Pollinations: generación vía POST + API key (gen.pollinations.ai/v1).
                        # El GET legacy a veces devuelve 500 si detecta credenciales (.netrc, etc.).
                        img_session = requests.Session()
                        img_session.trust_env = False
                        try:
                            r = img_session.post(
                                "https://gen.pollinations.ai/v1/images/generations",
                                headers={
                                    "Authorization": f"Bearer {poll_key}",
                                    "Content-Type": "application/json",
                                    "User-Agent": ua,
                                },
                                json={
                                    "prompt": p,
                                    "model": "flux",
                                    "size": size_str,
                                    "response_format": "b64_json",
                                    "n": 1,
                                    "nologo": True,
                                },
                                timeout=180,
                            )
                            if r.status_code != 200:
                                hint = (r.text or "")[:450].replace("\n", " ").strip()
                                return (
                                    f"❌ Pollinations (HTTP {r.status_code}): {hint}",
                                    True,
                                    None,
                                )
                            try:
                                data = r.json()
                            except ValueError:
                                return (
                                    "❌ Pollinations devolvió un cuerpo que no es JSON válido.",
                                    True,
                                    None,
                                )
                            if isinstance(data, dict) and data.get("success") is False:
                                err = data.get("error") or {}
                                msg = err.get("message") if isinstance(err, dict) else str(data)
                                return (f"❌ Pollinations: {msg}", True, None)
                            row = (data.get("data") or [None])[0]
                            if not row:
                                return ("❌ Pollinations no devolvió ninguna imagen.", True, None)
                            b64_field = row.get("b64_json") or row.get("base64")
                            if b64_field:
                                raw = b64_mod.standard_b64decode(b64_field)
                            elif row.get("url"):
                                r2 = img_session.get(
                                    row["url"],
                                    headers={"User-Agent": ua},
                                    timeout=120,
                                )
                                if r2.status_code != 200:
                                    return (
                                        f"❌ No se pudo descargar la imagen (HTTP {r2.status_code}).",
                                        True,
                                        None,
                                    )
                                raw = r2.content
                            else:
                                return (
                                    "❌ Respuesta Pollinations sin b64_json/base64 ni url.",
                                    True,
                                    None,
                                )
                            if len(raw) < 500:
                                return ("❌ Imagen recibida demasiado pequeña.", True, None)
                        finally:
                            img_session.close()
                    else:
                        # Sin API key (solo nube): 1) URL mínima como al inicio del proyecto;
                        # 2) mismo host con width/height/nologo si la primera no devuelve bytes válidos.
                        opener = urllib.request.build_opener(
                            urllib.request.HTTPHandler(),
                            urllib.request.HTTPSHandler(),
                            urllib.request.HTTPRedirectHandler(),
                        )
                        simple_legacy = f"https://image.pollinations.ai/prompt/{q}"
                        legacy_sized = (
                            f"https://image.pollinations.ai/prompt/{q}"
                            f"?width={IMAGE_GEN_SIZE}&height={IMAGE_GEN_SIZE}&nologo=true"
                        )
                        raw = None
                        for attempt_url in (simple_legacy, legacy_sized):
                            try:
                                req = urllib.request.Request(attempt_url, headers={"User-Agent": ua})
                                with opener.open(req, timeout=120) as resp:
                                    candidate = resp.read()
                                if len(candidate) >= 500:
                                    raw = candidate
                                    break
                            except Exception:
                                continue
                        if raw is None:
                            return (
                                "❌ Imagen en nube sin clave Pollinations: el anónimo no respondió bien. "
                                "https://enter.pollinations.ai → define POLLINATIONS_API_KEY y reinicia el servidor, "
                                "o usa modo Local (Forge).",
                                True,
                                None,
                            )
                    return "Imagen generada.", True, _bytes_to_data_url(raw)
                except Exception as e:
                    return f"❌ Error creando imagen en la nube: {str(e)}", True, None
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
                            "width": IMAGE_GEN_SIZE,
                            "height": IMAGE_GEN_SIZE,
                            "init_images": [base64_data],
                            "denoising_strength": 0.65
                        }
                    else:
                        url = "http://127.0.0.1:7860/sdapi/v1/txt2img"
                        payload = {
                            "prompt": prompt, 
                            "negative_prompt": "ugly, deformed, mutated, extra limbs, poorly drawn, double body, two heads, bad anatomy", 
                            "steps": 25, 
                            "width": IMAGE_GEN_SIZE,
                            "height": IMAGE_GEN_SIZE
                        }
                    
                    response = requests.post(url, json=payload, timeout=120)
                    if response.status_code == 200:
                        import base64
                        try:
                            r = response.json()
                            b64img = (r.get("images") or [None])[0]
                            if not b64img:
                                return (
                                    "❌ El motor local devolvió JSON sin imágenes (revisa la consola de Forge).",
                                    True,
                                    None,
                                )
                            image_data = base64.b64decode(b64img)
                        except (ValueError, KeyError, TypeError) as e:
                            return (
                                f"❌ Respuesta local inválida al generar imagen: {e}",
                                True,
                                None,
                            )
                        return "Imagen generada.", True, _bytes_to_data_url(image_data)
                    else:
                        return f"❌ Error: El motor local respondió con código {response.status_code}.", True, None
                except requests.exceptions.ConnectionError:
                    return "❌ Error: El motor local (Automatic1111/Forge) no está encendido en el puerto 7860. Por favor, inícialo primero.", True, None
                except Exception as e:
                    return f"❌ Error local desconocido: {str(e)}", True, None


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
                return res, True, None
            except Exception as e:
                return f"❌ Error creando carpeta: {str(e)}", True, None

        return None, False, None

brain = OpenBotBrain()


def telegram_send_photo(chat_id, photo_data_url: str, caption=None):
    """
    Envía una imagen en formato data URL por la API sendPhoto de Telegram.
    Retorna (éxito: bool, detalle_error: str).
    """
    import base64
    import io
    import requests

    if not photo_data_url or "," not in photo_data_url:
        return False, "data URL inválida"
    header, b64part = photo_data_url.split(",", 1)
    mime = "image/png"
    if "image/jpeg" in header or "image/jpg" in header:
        mime = "image/jpeg"
    elif "image/webp" in header:
        mime = "image/webp"
    try:
        raw = base64.standard_b64decode(b64part)
    except Exception as e:
        return False, f"base64: {e}"
    buf = io.BytesIO(raw)
    buf.seek(0)
    ext = mime.split("/")[-1]
    send_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto"
    cap = (caption or "").strip()
    if len(cap) > 1024:
        cap = cap[:1021] + "..."
    data = {"chat_id": str(chat_id)}
    if cap:
        data["caption"] = cap
    files = {"photo": (f"openbot.{ext}", buf, mime)}
    r = requests.post(send_url, data=data, files=files, timeout=120)
    if not r.ok:
        return False, (r.text or "")[:300]
    return True, ""


def telegram_download_voice_bytes(file_id: str):
    """Descarga el archivo de voz de Telegram. Retorna (bytes|None, error, nombre_archivo)."""
    import os
    import requests

    try:
        r = requests.get(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getFile",
            params={"file_id": file_id},
            timeout=60,
        )
        j = r.json()
        if not j.get("ok"):
            return None, str(j)[:400], "voice.ogg"
        fp = j.get("result", {}).get("file_path")
        if not fp:
            return None, "Sin file_path en getFile", "voice.ogg"
        fname = os.path.basename(fp) or "voice.ogg"
        r2 = requests.get(
            f"https://api.telegram.org/file/bot{TELEGRAM_TOKEN}/{fp}",
            timeout=120,
        )
        if not r2.ok:
            return None, f"Descarga HTTP {r2.status_code}", fname
        if not r2.content:
            return None, "Archivo vacío", fname
        return r2.content, "", fname
    except Exception as e:
        return None, str(e), "voice.ogg"


def groq_transcribe_telegram_voice(audio_bytes: bytes, filename="voice.ogg"):
    """Whisper en Groq (misma API key que el chat). Retorna (texto|None, error).

    Telegram suele usar .oga (Opus en OGG); la API de Groq no admite esa extensión,
    solo ogg, opus, mp3, etc. — renombramos a .ogg con tipo audio/ogg.
    """
    import requests

    try:
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {API_KEY}"}
        fn = (filename or "voice.ogg").strip()
        if "." not in fn:
            fn = "voice.ogg"
        low = fn.lower()
        ext = low.rsplit(".", 1)[-1]
        allowed = {"flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "opus", "wav", "webm"}
        if ext not in allowed:
            fn = "telegram_voice.ogg"
            mime = "audio/ogg"
        elif ext in ("ogg",):
            mime = "audio/ogg"
        elif ext == "opus":
            mime = "audio/opus"
        elif ext == "mp3" or ext == "mpeg" or ext == "mpga":
            mime = "audio/mpeg"
        elif ext in ("m4a", "mp4"):
            mime = "audio/mp4"
        elif ext == "flac":
            mime = "audio/flac"
        elif ext == "wav":
            mime = "audio/wav"
        elif ext == "webm":
            mime = "audio/webm"

        files = {"file": (fn, audio_bytes, mime)}
        data = {"model": "whisper-large-v3-turbo"}
        r = requests.post(url, headers=headers, files=files, data=data, timeout=120)
        if not r.ok:
            return None, (r.text or "")[:500]
        t = (r.json().get("text") or "").strip()
        if not t:
            return None, "Transcripción vacía"
        return t, ""
    except Exception as e:
        return None, str(e)


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
                    if "message" not in update:
                        continue
                    msg = update["message"]
                    chat_id = msg["chat"]["id"]

                    text = None
                    if "text" in msg:
                        text = (msg.get("text") or "").strip()
                    elif "voice" in msg:
                        file_id = msg["voice"].get("file_id")
                        if not file_id:
                            continue
                        raw, derr, vname = telegram_download_voice_bytes(file_id)
                        if derr or not raw:
                            brain.add_log(f"Telegram voz (descarga): {derr}", "error")
                            requests.post(
                                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                                json={
                                    "chat_id": chat_id,
                                    "text": f"❌ No pude obtener el audio de voz: {derr or 'error'}",
                                },
                                timeout=60,
                            )
                            continue
                        text, terr = groq_transcribe_telegram_voice(raw, vname)
                        if terr or not text:
                            brain.add_log(f"Telegram voz (transcripción): {terr}", "error")
                            requests.post(
                                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                                json={
                                    "chat_id": chat_id,
                                    "text": f"❌ No pude transcribir el audio: {terr or 'error'}",
                                },
                                timeout=60,
                            )
                            continue
                    else:
                        continue

                    if not text:
                        continue

                    # Guardar el chat_id del primer mensaje (dueño)
                    if not brain.telegram_chat_id:
                        brain.telegram_chat_id = chat_id
                        brain.add_log(f"Telegram enlazado con Chat ID: {chat_id}", "success")

                    brain.add_log(f"Telegram [{chat_id}]: {text}", "user")

                    cmd_res, is_cmd, cmd_image = brain.process_command(text, mode="cloud")

                    if is_cmd:
                        final_res = cmd_res
                        if cmd_image:
                            ok, err = telegram_send_photo(chat_id, cmd_image, final_res)
                            if not ok:
                                brain.add_log(f"Telegram sendPhoto falló: {err}", "error")
                                fallback = (final_res or "Imagen generada.") + f"\n\n❌ No se pudo enviar la foto por Telegram: {err}"
                                requests.post(
                                    f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                                    json={"chat_id": chat_id, "text": fallback[:4090]},
                                    timeout=60,
                                )
                        else:
                            requests.post(
                                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                                json={"chat_id": chat_id, "text": final_res or "Listo."},
                                timeout=60,
                            )
                    else:
                        # Si no es comando, usar IA (Nube por defecto para Telegram)
                        try:
                            from groq import Groq

                            temp_client = Groq(api_key=API_KEY)
                            history = brain.get_agent_history(brain.active_agent_name)
                            history.append({"role": "user", "content": text})
                            completion = temp_client.chat.completions.create(
                                model="llama-3.3-70b-versatile",
                                messages=history,
                            )
                            final_res = completion.choices[0].message.content
                        except Exception as e:
                            final_res = f"Error IA: {str(e)}"

                        requests.post(
                            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                            json={"chat_id": chat_id, "text": final_res},
                            timeout=60,
                        )
                        
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
    
    cmd_res, is_cmd, cmd_image = brain.process_command(message, mode=mode, image_base64=image_base64)
    if is_cmd:
        brain.history.append({"role": "assistant", "content": cmd_res})
        out = {"response": cmd_res, "time": time.strftime("%I:%M %p")}
        if cmd_image:
            out["image"] = cmd_image
        return out
    
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
    if name != "OpenBot" and name in brain.agents:
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
