import os
import base64
import time
import asyncio
import numpy as np
from io import BytesIO
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
import google.generativeai as genai
from gtts import gTTS
import gradio as gr
from gradio.utils import get_space
from fastrtc import AsyncAudioVideoStreamHandler, Stream, get_twilio_turn_credentials, WebRTC
from dotenv import load_dotenv
from PIL import Image

load_dotenv()
app = FastAPI()

# --------------------- TTS API for Telegram ---------------------
@app.post("/tts")
async def text_to_speech(request: Request):
    data = await request.json()
    text = data.get("text", "")

    if not text:
        return JSONResponse({"error": "No text provided"}, status_code=400)

    tts = gTTS(text, lang="en")
    tts.save("response.mp3")

    return FileResponse("response.mp3", media_type="audio/mpeg")

# --------------------- WebRTC Handler for Live Chat ---------------------
class GeminiHandler(AsyncAudioVideoStreamHandler):
    def __init__(self) -> None:
        super().__init__("mono", output_sample_rate=24000, output_frame_size=480, input_sample_rate=16000)
        self.audio_queue = asyncio.Queue()
        self.video_queue = asyncio.Queue()
        self.quit = asyncio.Event()
        self.session = None
        self.last_frame_time = 0

    def copy(self) -> "GeminiHandler":
        return GeminiHandler()

    async def start_up(self):
        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"), http_options={"api_version": "v1alpha"})
        config = {"response_modalities": ["AUDIO"]}

        async with client.aio.live.connect(model="gemini-2.0-flash-exp", config=config) as session:
            self.session = session
            while not self.quit.is_set():
                async for response in session.receive():
                    if data := response.data:
                        audio = np.frombuffer(data, dtype=np.int16).reshape(1, -1)
                        self.audio_queue.put_nowait(audio)

    async def receive(self, frame: tuple[int, np.ndarray]) -> None:
        _, array = frame
        array = array.squeeze()
        audio_message = {
            "mime_type": "audio/pcm",
            "data": base64.b64encode(array.tobytes()).decode("UTF-8"),
        }
        if self.session:
            await self.session.send(input=audio_message)

    async def emit(self):
        array = await self.audio_queue.get()
        return (self.output_sample_rate, array)

    async def shutdown(self) -> None:
        if self.session:
            self.quit.set()
            await self.session._websocket.close()
            self.quit.clear()

# --------------------- WebRTC & Gradio UI ---------------------
stream = Stream(
    handler=GeminiHandler(),
    modality="audio-video",
    mode="send-receive",
    rtc_configuration=get_twilio_turn_credentials() if get_space() else None,
    time_limit=90 if get_space() else None,
    additional_inputs=[gr.Image(label="Image", type="numpy", sources=["upload", "clipboard"])],
    ui_args={
        "icon": "https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030456e93de685481c559f160ea06b.png",
        "pulse_color": "rgb(255, 255, 255)",
        "icon_button_color": "rgb(255, 255, 255)",
        "title": "Gemini Audio Video Chat",
    },
)

with gr.Blocks() as demo:
    gr.HTML("""
    <h1>Gemini Voice Chat</h1>
    <p>Real-time AI-powered chat with voice & video</p>
    """)
    with gr.Row():
        webrtc = WebRTC(label="Video Chat", modality="audio-video", mode="send-receive")
        image_input = gr.Image(label="Image", type="numpy", sources=["upload", "clipboard"])
        webrtc.stream(GeminiHandler(), inputs=[webrtc, image_input], outputs=[webrtc])

stream.ui = demo

# --------------------- Render Startup ---------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
