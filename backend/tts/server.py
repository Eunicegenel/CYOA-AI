from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from kokoro import KPipeline
import soundfile as sf
import numpy as np
import io
import traceback

app = Flask(__name__)
CORS(app)

SAMPLE_RATE = 24000

# 'a' = American English
# 'b' = British English
pipeline = KPipeline(lang_code="a")

AVAILABLE_VOICES = [
    {"id": "af_heart", "label": "Heart - Female American"},
    {"id": "af_bella", "label": "Bella - Female American"},
    {"id": "af_nicole", "label": "Nicole - Female American"},
    {"id": "af_sarah", "label": "Sarah - Female American"},
    {"id": "af_sky", "label": "Sky - Female American"},
    {"id": "am_adam", "label": "Adam - Male American"},
    {"id": "am_michael", "label": "Michael - Male American"},
    {"id": "bf_emma", "label": "Emma - Female British"},
    {"id": "bf_isabella", "label": "Isabella - Female British"},
    {"id": "bm_george", "label": "George - Male British"},
    {"id": "bm_lewis", "label": "Lewis - Male British"},
]


@app.get("/")
def home():
    return jsonify({
        "app": "CYOA Kokoro TTS Server",
        "status": "running",
        "sampleRate": SAMPLE_RATE,
    })


@app.get("/api/voices")
def get_voices():
    return jsonify({
        "voices": AVAILABLE_VOICES,
        "defaultVoice": "af_heart",
    })


@app.post("/api/tts")
def text_to_speech():
    try:
        data = request.get_json(force=True) or {}

        text = str(data.get("text", "")).strip()
        voice = str(data.get("voice", "af_heart")).strip()
        speed = float(data.get("speed", 1.0))

        if not text:
            return jsonify({"error": "Text is required."}), 400

        # Keep calls sane while testing.
        # Later, we can chunk long story replies properly.
        text = text[:3000]

        generator = pipeline(
            text,
            voice=voice,
            speed=speed,
            split_pattern=r"\n+",
        )

        audio_chunks = []

        for _, _, audio in generator:
            audio_chunks.append(audio)

        if not audio_chunks:
            return jsonify({"error": "No audio was generated."}), 500

        combined_audio = np.concatenate(audio_chunks)

        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, combined_audio, SAMPLE_RATE, format="WAV")
        wav_buffer.seek(0)

        return send_file(
            wav_buffer,
            mimetype="audio/wav",
            as_attachment=False,
            download_name="cyoa-voice.wav",
        )

    except Exception as error:
        print("TTS ERROR:", error)
        traceback.print_exc()

        return jsonify({
            "error": "Failed to generate speech.",
            "details": str(error),
        }), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5070,
        debug=False,
        use_reloader=False
    )
		