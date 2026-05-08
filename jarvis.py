import os
import threading
import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
import customtkinter as ctk
from groq import Groq
import pyttsx3
import time

# Configuración
API_KEY = "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"
RATE = 44100
FILENAME = "jarvis_input.wav"

client = Groq(api_key=API_KEY)

class JarvisGUI(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("STARK INDUSTRIES - JARVIS")
        self.geometry("600x750")
        ctk.set_appearance_mode("dark")
        
        # UI Elements
        self.label_stark = ctk.CTkLabel(self, text="STARK INDUSTRIES", font=("Orbitron", 12), text_color="#00ffff")
        self.label_stark.pack(pady=(10, 0))

        self.label_titulo = ctk.CTkLabel(self, text="J.A.R.V.I.S.", font=("Orbitron", 40, "bold"), text_color="#00ffff")
        self.label_titulo.pack(pady=20)

        # Core / Arc Reactor (Visual)
        self.canvas = ctk.CTkCanvas(self, width=250, height=250, bg="#1a1a1a", highlightthickness=0)
        self.canvas.pack(pady=30)
        self.core = self.canvas.create_oval(25, 25, 225, 225, outline="#00ffff", width=5)
        self.glow = self.canvas.create_oval(50, 50, 200, 200, fill="#003333", outline="")
        
        self.text_display = ctk.CTkTextbox(self, width=500, height=150, font=("Consolas", 14), fg_color="#0d1117", text_color="#00ffff")
        self.text_display.pack(pady=10)
        self.text_display.insert("0.0", "SYSTEMS ONLINE. WAITING FOR COMMANDS...")
        self.text_display.configure(state="disabled")

        # Power Switch (On/Off)
        self.is_active = False
        self.btn_power = ctk.CTkSwitch(
            self, 
            text="POWER SYSTEM (OFF)", 
            command=self.toggle_power,
            font=("Orbitron", 14, "bold"),
            progress_color="#00ffff"
        )
        self.btn_power.pack(pady=30)

        self.status = ctk.CTkLabel(self, text="SYSTEM IDLE", font=("Consolas", 12), text_color="#555555")
        self.status.pack()

        # Voice Engine
        try:
            self.engine = pyttsx3.init()
            voices = self.engine.getProperty('voices')
            if len(voices) > 1:
                self.engine.setProperty('voice', voices[0].id) 
            self.engine.setProperty('rate', 170)
        except:
            self.engine = None

        # Logic State
        self.chat_history = [
            {"role": "system", "content": "Eres JARVIS, el asistente avanzado de Industrias Stark. Hablas de forma elegante y sofisticada, usando siempre 'Señor'. Tu misión es ayudar al usuario a aprender inglés. Responde de forma bilingüe (español e inglés) para asegurar que el usuario comprenda, pero mantén el tono de Jarvis."}
        ]

    def log(self, text):
        self.text_display.configure(state="normal")
        self.text_display.insert("end", f"\n> {text}")
        self.text_display.see("end")
        self.text_display.configure(state="disabled")

    def animate_core(self, color):
        self.canvas.itemconfig(self.core, outline=color)
        self.canvas.itemconfig(self.glow, fill=color if color != "#00ffff" else "#003333")

    def speak(self, text):
        if self.engine:
            try:
                self.engine.say(text)
                self.engine.runAndWait()
            except:
                pass

    def toggle_power(self):
        if self.btn_power.get():
            self.is_active = True
            self.btn_power.configure(text="POWER SYSTEM (ON)")
            self.log("SYSTEMS INITIALIZED. CONTINUOUS LISTENING ACTIVE.")
            self.run_cycle()
        else:
            self.is_active = False
            self.btn_power.configure(text="POWER SYSTEM (OFF)")
            self.log("SYSTEMS SHUTTING DOWN...")
            self.animate_core("#00ffff")

    def run_cycle(self):
        if not self.is_active: return
        self.animate_core("#ff0000")
        self.status.configure(text="LISTENING...")
        threading.Thread(target=self.process, daemon=True).start()

    def process(self):
        try:
            # 1. Grabación
            rec = sd.rec(int(4 * RATE), samplerate=RATE, channels=1)
            sd.wait()
            
            if not self.is_active: return 
            
            wav.write(FILENAME, RATE, rec)
            
            self.after(0, lambda: self.animate_core("#ffff00"))
            self.after(0, lambda: self.status.configure(text="ANALYZING DATA..."))

            # 2. Transcripción
            with open(FILENAME, "rb") as f:
                trans = client.audio.transcriptions.create(
                    file=(FILENAME, f.read()),
                    model="whisper-large-v3",
                    response_format="text"
                )
            
            if not trans.strip():
                if self.is_active: self.after(500, self.run_cycle)
                return

            # DETECCIÓN DE WAKE WORD (Jarvis/Yarvis/Jarbis)
            wake_words = ["jarvis", "yarvis", "jarbis", "yarbis", "yarbi", "jarbi"]
            found_wake = any(word in trans.lower() for word in wake_words)
            
            if not found_wake:
                self.after(0, lambda: self.status.configure(text="WAITING FOR WAKE WORD..."))
                if self.is_active: self.after(500, self.run_cycle)
                return

            self.after(0, lambda: self.log(f"USER: {trans}"))
            self.after(0, lambda: self.status.configure(text="WAKE WORD DETECTED!"))
            
            self.chat_history.append({"role": "user", "content": trans})

            # 3. Jarvis Logic
            try:
                comp = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=self.chat_history
                )
                resp = comp.choices[0].message.content
            except Exception as e:
                self.after(0, lambda: self.log("SWITCHING TO LOCAL SYSTEMS..."))
                import ollama
                response = ollama.chat(model='llama3.1:8b', messages=self.chat_history)
                resp = response['message']['content']
            
            self.chat_history.append({"role": "assistant", "content": resp})
            
            if len(self.chat_history) > 15:
                self.chat_history = [self.chat_history[0]] + self.chat_history[-10:]

            self.after(0, lambda: self.log(f"JARVIS: {resp}"))
            self.after(0, lambda: self.animate_core("#00ffff"))
            self.after(0, lambda: self.status.configure(text="SPEAKING..."))
            
            # 4. Voz
            self.speak(resp)

        except Exception as e:
            err_str = str(e)
            self.after(0, lambda: self.log(f"ERROR: {err_str}"))
        
        # Auto-loop
        if self.is_active:
            self.after(500, self.run_cycle)

if __name__ == "__main__":
    app = JarvisGUI()
    app.mainloop()
