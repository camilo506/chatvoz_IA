import os
import sounddevice as sd
import numpy as np
import scipy.io.wavfile as wav
from groq import Groq
import pyttsx3
import time

# Configuración
API_KEY = "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"
RATE = 44100
FILENAME = "input.wav"

client = Groq(api_key=API_KEY)
engine = pyttsx3.init()

def speak(text):
    print(f"Bot: {text}")
    engine.say(text)
    engine.runAndWait()

def record_audio(duration=5):
    print(f"\n🎤 Grabando por {duration} segundos... Habla ahora.")
    recording = sd.rec(int(duration * RATE), samplerate=RATE, channels=1)
    sd.wait()
    wav.write(FILENAME, RATE, recording)
    print("✅ Grabación finalizada.")

def main():
    speak("Hola, soy tu tutor de inglés. ¿Qué quieres saber cómo se dice?")
    
    while True:
        try:
            # 1. Grabar
            input("\nPresiona ENTER para empezar a hablar (o Ctrl+C para salir)... ")
            record_audio(4)
            
            # 2. Transcribir (STT)
            print("⏳ Transcribiendo...")
            with open(FILENAME, "rb") as file:
                transcription = client.audio.transcriptions.create(
                    file=(FILENAME, file.read()),
                    model="whisper-large-v3",
                    response_format="text"
                )
            
            print(f"Tú dijiste: {transcription}")
            
            if not transcription.strip():
                speak("No te escuché bien, ¿puedes repetir?")
                continue

            # 3. Chat (LLM)
            print("⏳ Pensando...")
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "Eres un traductor de español a inglés. Responde de forma corta y clara. Si te preguntan cómo se dice algo, dilo directamente en inglés y da un ejemplo corto."},
                    {"role": "user", "content": transcription}
                ]
            )
            
            response = completion.choices[0].message.content
            
            # 4. Voz (TTS)
            speak(response)

        except KeyboardInterrupt:
            print("\n¡Adiós!")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
