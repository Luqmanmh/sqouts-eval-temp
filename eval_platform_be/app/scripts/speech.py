from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs.core.api_error import ApiError
import os
import numpy as np
import time
import threading
from cartesia import Cartesia, RateLimitError


load_dotenv()
elevenlabs = ElevenLabs(
    api_key=os.getenv("ELEVENLABS_API_KEY"),
)

client = Cartesia(
    api_key=os.getenv("CARTESIA_API_KEY"),
    base_url="https://api.cartesia.ai",
)

tts_slots = threading.BoundedSemaphore(5)

def eleven_call(text, voice_id="gpzZjtWbZNetDrq8CXKD", model_id="eleven_v3", output_format="pcm_48000", lang_code="id"):
    audio_chunks = elevenlabs.text_to_speech.convert(
                    text=text,
                    voice_id=voice_id,
                    model_id=model_id,
                    output_format=output_format,
                    language_code=lang_code
                )
    return b"".join(audio_chunks), len(text)

def cartesia_call(text, voice_id="47c38ca4-5f35-497b-b1a3-415245fb35e1", model_id="sonic-3.6", lang_code="id"):
    response = client.tts.generate(
        model_id=model_id,
        transcript=text,
        voice=voice_id,
        language=lang_code,
        output_format={
            "container": "raw",
            "encoding": "pcm_s16le",
            "sample_rate": 48000
        },
        # generation_config={
        #     "speed": 1,
        #     "volume": 1
        # },
    )
    return response.read(), len(text)

def cast_tts(text, voice_id, model_id="sonic-3.6", output_format="pcm_48000", lang_code="id"):
    """turn text to speech"""
    for attempt in range(3):
        try:
            with tts_slots:
                pcm, cost = cartesia_call(
                    text=text,
                    voice_id=voice_id,
                    lang_code=lang_code
                )
                
            break
        except ApiError as e:
            if e.status_code != 429 or attempt == 2:
                raise
            time.sleep(attempt + 1)  # outside the semaphore, so the slot is free meanwhile
        except RateLimitError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)

    pcm = pcm[: len(pcm) // 2 * 2]          # frombuffer raises on an odd byte count
    return np.frombuffer(pcm, dtype=np.int16), cost
