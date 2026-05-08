import os
import threading
import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
import customtkinter as ctk
from groq import Groq
import pyttsx3

# Configuración
API_KEY = "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"
RATE = 44100
FILENAME = "input.wav"

client = Groq(api_key=API_KEY)

class SimpleVoiceGUI(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Traductor de Voz Inglés")
        self.geometry("500x600")
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # UI
        self.label_titulo = ctk.CTkLabel(self, text="Tutor de Inglés", font=("Inter", 24, "bold"))
        self.label_titulo.pack(pady=20)

        self.chat_display = ctk.CTkTextbox(self, width=400, height=300, font=("Inter", 14))
        self.chat_display.pack(pady=10)
        self.chat_display.configure(state="disabled")

        self.btn_hablar = ctk.CTkButton(
            self, 
            text="PRESIONAR PARA HABLAR", 
            command=self.iniciar_proceso,
            height=50,
            font=("Inter", 16, "bold")
        )
        self.btn_hablar.pack(pady=20)

        self.label_status = ctk.CTkLabel(self, text="Listo para ayudarte", text_color="gray")
        self.label_status.pack(pady=5)

        self.agregar_mensaje("Bot", "Hola! Presiona el botón y pregúntame cómo se dice algo en inglés.")
        
        # Init engine inside a function to avoid global issues
        try:
            self.engine = pyttsx3.init()
            self.engine.setProperty('rate', 150)
        except:
            self.engine = None

    def agregar_mensaje(self, autor, texto):
        self.chat_display.configure(state="normal")
        self.chat_display.insert("end", f"\n{autor}: {texto}\n")
        self.chat_display.configure(state="disabled")
        self.chat_display.see("end")

    def speak(self, text):
        if self.engine:
            try:
                self.engine.say(text)
                self.engine.runAndWait()
            except:
                pass

    def iniciar_proceso(self):
        self.btn_hablar.configure(state="disabled", text="ESCUCHANDO...")
        self.label_status.configure(text="Grabando audio (4 segundos)...")
        threading.Thread(target=self.proceso_voz, daemon=True).start()

    def proceso_voz(self):
        try:
            # 1. Grabar
            recording = sd.rec(int(4 * RATE), samplerate=RATE, channels=1)
            sd.wait()
            wav.write(FILENAME, RATE, recording)
            
            self.after(0, lambda: self.label_status.configure(text="Pensando..."))

            # 2. Transcribir
            with open(FILENAME, "rb") as file:
                transcription = client.audio.transcriptions.create(
                    file=(FILENAME, file.read()),
                    model="whisper-large-v3",
                    response_format="text"
                )
            
            if not transcription.strip():
                self.after(0, self.reset_ui)
                return

            self.after(0, lambda: self.agregar_mensaje("Tú", transcription))

            # 3. Chat / Traducción
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "Eres un traductor corto. Responde solo con la traducción y un ejemplo breve."},
                    {"role": "user", "content": transcription}
                ]
            )
            response = completion.choices[0].message.content
            
            self.after(0, lambda: self.agregar_mensaje("Bot", response))
            self.after(0, lambda: self.label_status.configure(text="Hablando..."))
            
            # 4. Hablar
            self.speak(response)

        except Exception as e:
            # FIX: Capture error string before lambda
            err_str = str(e)
            self.after(0, lambda: self.label_status.configure(text=f"Error: {err_str}"))
        
        self.after(0, self.reset_ui)

    def reset_ui(self):
        self.btn_hablar.configure(state="normal", text="PRESIONAR PARA HABLAR")
        self.label_status.configure(text="Listo")

if __name__ == "__main__":
    app = SimpleVoiceGUI()
    app.mainloop()
