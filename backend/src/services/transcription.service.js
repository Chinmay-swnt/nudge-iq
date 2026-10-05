const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";

/**
 * Free local speech-to-text service
 * @param {Buffer|string} audioData - Audio buffer or path to audio file
 * @param {string} [filename] - Original file name
 * @returns {Promise<{ raw_text: string, diarized_json: Array }>}
 */
async function transcribeAudio(audioData, filename = "meeting_audio.webm") {
  try {
    const form = new FormData();

    if (Buffer.isBuffer(audioData)) {
      form.append("audio_file", audioData, { filename });
    } else if (typeof audioData === "string" && fs.existsSync(audioData)) {
      form.append("audio_file", fs.readFileSync(audioData), {
        filename: path.basename(audioData),
      });
    } else {
      form.append("audio_url", String(audioData));
    }

    const buffer = form.getBuffer();
    const headers = form.getHeaders();

    const response = await fetch(`${ML_SERVICE_URL}/transcribe`, {
      method: "POST",
      body: buffer,
      headers: headers,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[transcription.service] ML service returned ${response.status}: ${errText}`);
      throw new Error(`ML service error: ${response.status}`);
    }

    const data = await response.json();
    return {
      raw_text: data.raw_text || "",
      diarized_json: data.diarized_json || [],
    };
  } catch (err) {
    console.warn("[transcription.service] Local ML service error:", err.message);
    
    return {
      raw_text: "",
      diarized_json: [],
    };
  }
}

module.exports = {
  transcribeAudio,
};
