import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

const API_URL = "http://localhost:5050/api/chat";
const MODELS_URL = "http://localhost:5050/api/models";
const ALARMS_EVENTS_URL = "http://localhost:5050/api/alarms/events";

const TTS_URL = "http://127.0.0.1:5070/api/tts";
const TTS_VOICES_URL = "http://127.0.0.1:5070/api/voices";

function cleanTextForSpeech(text = "") {
  return text
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#*_`>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanModelReplyForDisplay(text = "") {
  const emojiRegex =
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

  const variationSelectorRegex = /\uFE0F/g;

  const metaLineRegex =
    /^\s*(?:\(?\s*)?(?:p\.?s\.?|no internet|no outside data|just your imagination|type one of|reply with|i'll send|i’ll send).*$/i;

  const cleanOutsideCodeBlocks = (value) => {
    return value
      .split(/(```[\s\S]*?```)/g)
      .map((part) => {
        if (part.startsWith("```")) return part;

        return part
          .replace(emojiRegex, "")
          .replace(variationSelectorRegex, "")
          .replace(/^\s{0,3}#{1,6}\s+/gm, "")
          .replace(/\*\*([^*\n]+)\*\*/g, "$1")
          .replace(/__([^_\n]+)__/g, "$1")
          .replace(/^[ \t]*[-–—]{3,}[ \t]*$/gm, "");
      })
      .join("");
  };

  return cleanOutsideCodeBlocks(String(text || ""))
    .split("\n")
    .filter((line) => !metaLineRegex.test(line))
    .join("\n")
    .replace(
      /^\s*(?:ah|okay|sure|alright|perfect|great|absolutely)[,.! ]*(?:[-–—:])?\s*/i,
      ""
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function App() {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("assistant");
  const [availableModels, setAvailableModels] = useState([]);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello. I am CYOA Brain v0. Choose a mode and ask me anything.",
    },
  ]);

  const [isListening, setIsListening] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");
  const [silenceDelay, setSilenceDelay] = useState(3);
  const [autoSpeak, setAutoSpeak] = useState(false);

  const [ttsVoices, setTtsVoices] = useState([]);
  const [selectedTtsVoiceId, setSelectedTtsVoiceId] = useState("af_heart");
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [ringingAlarm, setRingingAlarm] = useState(null);

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const currentVoiceTextRef = useRef("");
  const silenceTimerRef = useRef(null);

  const sendVoiceMessageRef = useRef(null);
  const safeStartRecognitionRef = useRef(null);

  const listeningRef = useRef(false);
  const manuallyStoppedRef = useRef(false);
  const pauseRestartRef = useRef(false);
  const pendingRef = useRef(false);
  const autoSpeakRef = useRef(autoSpeak);
  const suppressSpeechResultsRef = useRef(false);
  const silenceDelayRef = useRef(silenceDelay);
  const selectedTtsVoiceIdRef = useRef(selectedTtsVoiceId);
  const ttsSpeedRef = useRef(ttsSpeed);

  const currentAudioRef = useRef(null);
  const currentAudioUrlRef = useRef("");
  const ttsPlayIdRef = useRef(0);

  const alarmAudioContextRef = useRef(null);
  const alarmBeepIntervalRef = useRef(null);

  const chatScrollRef = useRef(null);

  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => {
    silenceDelayRef.current = silenceDelay;
  }, [silenceDelay]);

  useEffect(() => {
    selectedTtsVoiceIdRef.current = selectedTtsVoiceId;
  }, [selectedTtsVoiceId]);

  useEffect(() => {
    ttsSpeedRef.current = ttsSpeed;
  }, [ttsSpeed]);

  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = "";
      currentAudioRef.current = null;
    }

    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = "";
    }
  };

  const clearVoiceTranscriptState = () => {
    clearTimeout(silenceTimerRef.current);

    finalTranscriptRef.current = "";
    currentVoiceTextRef.current = "";
    setVoiceDraft("");
  };

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await axios.get(MODELS_URL);
        setAvailableModels(response.data.models || []);
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    };

    loadModels();
  }, []);

  useEffect(() => {
    const loadTtsVoices = async () => {
      try {
        const response = await axios.get(TTS_VOICES_URL);
        const voices = response.data.voices || [];

        setTtsVoices(voices);

        if (response.data.defaultVoice) {
          setSelectedTtsVoiceId(response.data.defaultVoice);
        } else if (voices.length > 0) {
          setSelectedTtsVoiceId(voices[0].id);
        }
      } catch (error) {
        console.error("Failed to load Kokoro voices:", error);
      }
    };

    loadTtsVoices();
  }, []);

  const restartRecognitionAfterResponse = () => {
    if (!listeningRef.current || manuallyStoppedRef.current) return;

    setTimeout(() => {
      clearVoiceTranscriptState();
      suppressSpeechResultsRef.current = false;
      safeStartRecognitionRef.current?.();
    }, 500);
  };

  const stopVoiceNow = () => {
    ttsPlayIdRef.current += 1;

    stopCurrentAudio();
    setIsVoicePlaying(false);

    pauseRestartRef.current = false;
    restartRecognitionAfterResponse();
  };

  const playKokoroSpeech = async (text) => {
    const cleanText = cleanTextForSpeech(text);

    if (!cleanText) {
      pauseRestartRef.current = false;
      setIsVoicePlaying(false);
      restartRecognitionAfterResponse();
      return;
    }

    const playbackId = ttsPlayIdRef.current + 1;
    ttsPlayIdRef.current = playbackId;

    pauseRestartRef.current = true;
    setIsVoicePlaying(true);

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop errors.
    }

    try {
      stopCurrentAudio();

      const response = await axios.post(
        TTS_URL,
        {
          text: cleanText,
          voice: selectedTtsVoiceIdRef.current || "af_heart",
          speed: ttsSpeedRef.current || 1,
        },
        {
          responseType: "blob",
        }
      );

      if (playbackId !== ttsPlayIdRef.current) {
        return;
      }

      const audioUrl = URL.createObjectURL(response.data);
      const audio = new Audio(audioUrl);

      currentAudioRef.current = audio;
      currentAudioUrlRef.current = audioUrl;

      audio.onended = () => {
        if (playbackId !== ttsPlayIdRef.current) return;

        stopCurrentAudio();
        setIsVoicePlaying(false);
        pauseRestartRef.current = false;
        restartRecognitionAfterResponse();
      };

      audio.onerror = () => {
        if (playbackId !== ttsPlayIdRef.current) return;

        stopCurrentAudio();
        setIsVoicePlaying(false);
        pauseRestartRef.current = false;
        restartRecognitionAfterResponse();
      };

      await audio.play();
    } catch (error) {
      if (playbackId !== ttsPlayIdRef.current) {
        return;
      }

      console.error("Kokoro TTS error:", error);

      setIsVoicePlaying(false);
      pauseRestartRef.current = false;
      restartRecognitionAfterResponse();
    }
  };

  const speakReply = async (text) => {
    if (!autoSpeakRef.current) {
      pauseRestartRef.current = false;
      restartRecognitionAfterResponse();
      return;
    }

    await playKokoroSpeech(text);
  };

  const replayMessageVoice = async (text) => {
    await playKokoroSpeech(text);
  };

  const chatMutation = useMutation({
    mutationFn: async ({ message, conversationId, mode }) => {
      const response = await axios.post(API_URL, {
        message,
        conversationId,
        mode,
      });

      return response.data;
    },
    onMutate: () => {
      pendingRef.current = true;
    },
    onSuccess: (data) => {
      const cleanedReply = cleanModelReplyForDisplay(
        data.reply || "No response received."
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: cleanedReply || "No response received.",
          mode: data.mode,
          model: data.model,
        },
      ]);

      speakReply(cleanedReply || "");
    },
    onError: (error) => {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I could not reach the local AI backend. Make sure the backend is running on port 5050.",
        },
      ]);

      pauseRestartRef.current = false;
      restartRecognitionAfterResponse();
    },
    onSettled: () => {
      pendingRef.current = false;
    },
  });

  const selectedModel = availableModels.find((item) => item.key === mode);

  useEffect(() => {
    const scrollToBottom = () => {
      const chatBox = chatScrollRef.current;

      if (!chatBox) return;

      chatBox.scrollTo({
        top: chatBox.scrollHeight,
        behavior: "smooth",
      });
    };

    const animationFrame = window.requestAnimationFrame(() => {
      scrollToBottom();

      window.setTimeout(scrollToBottom, 120);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [messages.length, chatMutation.isPending]);

  const sendMessage = (forcedMessage = null) => {
    const rawMessage = forcedMessage ?? message;
    const trimmedMessage = String(rawMessage).trim();

    if (!trimmedMessage || pendingRef.current) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: trimmedMessage,
        mode,
      },
    ]);

    if (!forcedMessage) {
      setMessage("");
    }

    chatMutation.mutate({
      message: trimmedMessage,
      conversationId: "main",
      mode,
    });
  };

  const sendVoiceMessage = () => {
    const transcript = currentVoiceTextRef.current.trim();

    if (!transcript || pendingRef.current) return;

    suppressSpeechResultsRef.current = true;
    pauseRestartRef.current = true;

    clearVoiceTranscriptState();

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop errors.
    }

    sendMessage(transcript);
  };

  useEffect(() => {
    sendVoiceMessageRef.current = sendVoiceMessage;
  });

  const safeStartRecognition = () => {
    const recognition = recognitionRef.current;

    if (!recognition) return;
    if (!listeningRef.current) return;
    if (manuallyStoppedRef.current) return;
    if (pauseRestartRef.current) return;
    if (pendingRef.current) return;

    try {
      recognition.start();
    } catch {
      // Browser may throw if recognition is already running.
    }
  };

  useEffect(() => {
    safeStartRecognitionRef.current = safeStartRecognition;
  });

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);

      if (
        listeningRef.current &&
        !manuallyStoppedRef.current &&
        !pauseRestartRef.current &&
        !pendingRef.current
      ) {
        setTimeout(() => {
          safeStartRecognitionRef.current?.();
        }, 350);
      }
    };

    recognition.onresult = (event) => {
      if (
        suppressSpeechResultsRef.current ||
        pauseRestartRef.current ||
        pendingRef.current
      ) {
        return;
      }

      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;

        if (event.results[index].isFinal) {
          finalText += ` ${transcript}`;
        } else {
          interimText += ` ${transcript}`;
        }
      }

      if (finalText.trim()) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalText}`.trim();
      }

      const combinedText = `${finalTranscriptRef.current} ${interimText}`.trim();

      currentVoiceTextRef.current = combinedText;
      setVoiceDraft(combinedText);

      if (combinedText) {
        clearTimeout(silenceTimerRef.current);

        silenceTimerRef.current = setTimeout(() => {
          sendVoiceMessageRef.current?.();
        }, silenceDelayRef.current * 1000);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      clearTimeout(silenceTimerRef.current);

      try {
        recognition.stop();
      } catch {
        // Ignore cleanup errors.
      }

      stopCurrentAudio();
    };
  }, []);

  const startListening = () => {
    if (!recognitionRef.current) {
      return;
    }

    manuallyStoppedRef.current = false;
    listeningRef.current = true;
    pauseRestartRef.current = false;
    suppressSpeechResultsRef.current = false;

    finalTranscriptRef.current = "";
    currentVoiceTextRef.current = "";
    setVoiceDraft("");

    safeStartRecognition();
  };

  const stopListening = () => {
    suppressSpeechResultsRef.current = true;

    manuallyStoppedRef.current = true;
    listeningRef.current = false;
    pauseRestartRef.current = false;

    clearVoiceTranscriptState();
    setIsListening(false);

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop errors.
    }

    ttsPlayIdRef.current += 1;
    stopCurrentAudio();
    setIsVoicePlaying(false);
  };

  const resetVisibleChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `Chat view reset. Current mode: ${mode}.`,
      },
    ]);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const selectedVoice = ttsVoices.find((voice) => voice.id === selectedTtsVoiceId);

  const fieldSx = {
    "& .MuiInputBase-root": {
      bgcolor: "#111827",
      color: "#f8fafc",
      borderRadius: 2.5,
      border: "1px solid rgba(148,163,184,0.22)",
      transition: "0.2s ease",
      "&:hover": {
        borderColor: "rgba(96,165,250,0.45)",
      },
      "&.Mui-focused": {
        borderColor: "#60a5fa",
        boxShadow: "0 0 0 3px rgba(96,165,250,0.16)",
      },
      "&.Mui-disabled": {
        bgcolor: "rgba(15,23,42,0.7)",
        color: "rgba(248,250,252,0.45)",
      },
    },
    "& .MuiInputLabel-root": {
      color: "#94a3b8",
      fontWeight: 700,
      "&.Mui-focused": {
        color: "#93c5fd",
      },
    },
    "& .MuiSelect-icon": {
      color: "#cbd5e1",
    },
    "& .MuiOutlinedInput-notchedOutline": {
      border: "none",
    },
  };

  const ghostButtonSx = {
    color: "#e2e8f0",
    borderColor: "rgba(148,163,184,0.28)",
    bgcolor: "rgba(15,23,42,0.72)",
    borderRadius: 2.5,
    fontWeight: 900,
    px: 2,
    "&:hover": {
      bgcolor: "rgba(30,41,59,0.92)",
      borderColor: "rgba(96,165,250,0.55)",
    },
  };

  const stopAlarmSound = useCallback(() => {
    if (alarmBeepIntervalRef.current) {
      clearInterval(alarmBeepIntervalRef.current);
      alarmBeepIntervalRef.current = null;
    }
  }, []);

  const playAlarmPulse = useCallback(async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    if (!alarmAudioContextRef.current) {
      alarmAudioContextRef.current = new AudioContext();
    }

    const audioContext = alarmAudioContextRef.current;

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, audioContext.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.65);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.7);
  }, []);

  const startAlarmRinging = useCallback(
    (alarm) => {
      stopAlarmSound();

      setRingingAlarm(alarm);

      playAlarmPulse();

      alarmBeepIntervalRef.current = setInterval(() => {
        playAlarmPulse();
      }, 1200);
    },
    [playAlarmPulse, stopAlarmSound]
  );

  const dismissAlarm = useCallback(() => {
    stopAlarmSound();
    setRingingAlarm(null);
  }, [stopAlarmSound]);

  useEffect(() => {
    const events = new EventSource(ALARMS_EVENTS_URL);

    events.addEventListener("alarm", (event) => {
      try {
        const alarm = JSON.parse(event.data);
        startAlarmRinging(alarm);
      } catch (error) {
        console.error("Failed to read alarm event:", error);
      }
    });

    events.onerror = () => {
      console.warn("Alarm event connection issue.");
    };

    return () => {
      events.close();
      stopAlarmSound();
    };
  }, [startAlarmRinging, stopAlarmSound]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#020617",
        color: "#f8fafc",
        p: { xs: 1.5, md: 2.5 },
        background:
          "radial-gradient(circle at top left, rgba(37,99,235,0.18), transparent 28%), radial-gradient(circle at top right, rgba(168,85,247,0.14), transparent 34%), #020617",
      }}
    >
      <Container
        maxWidth={false}
        sx={{
          maxWidth: 1560,
          mx: "auto",
          height: { xs: "auto", lg: "calc(100vh - 40px)" },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "380px minmax(0, 1fr)",
            },
            gap: 2,
            height: "100%",
          }}
        >
          {/* LEFT PANEL */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minHeight: 0,
            }}
          >
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 5,
                bgcolor: "rgba(15,23,42,0.84)",
                border: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
                backdropFilter: "blur(14px)",
              }}
            >
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 950,
                  letterSpacing: -1,
                  fontSize: { xs: 34, md: 42 },
                  lineHeight: 1,
                  mb: 1.25,
                  color: "#fff",
                  textShadow: "0 4px 24px rgba(96,165,250,0.25)",
                }}
              >
                CYOA Brain v0
              </Typography>

              <Typography
                sx={{
                  color: "#cbd5e1",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                Local AI chat with model modes, microphone input, and Kokoro voice replies.
              </Typography>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 5,
                bgcolor: "rgba(15,23,42,0.84)",
                border: "1px solid rgba(148,163,184,0.18)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
                backdropFilter: "blur(14px)",
              }}
            >
              <Typography
                sx={{
                  mb: 1.5,
                  color: "#e2e8f0",
                  fontWeight: 950,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  fontSize: 12,
                }}
              >
                Controls
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 1.25,
                }}
              >
                <FormControl size="small" sx={fieldSx}>
                  <InputLabel>Mode</InputLabel>
                  <Select
                    value={mode}
                    label="Mode"
                    onChange={(event) => setMode(event.target.value)}
                  >
                    {availableModels.map((item) => (
                      <MenuItem key={item.key} value={item.key}>
                        {item.label} | {item.model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={fieldSx}>
                  <InputLabel>Silence</InputLabel>
                  <Select
                    value={silenceDelay}
                    label="Silence"
                    onChange={(event) => setSilenceDelay(Number(event.target.value))}
                  >
                    <MenuItem value={3}>3 seconds</MenuItem>
                    <MenuItem value={5}>5 seconds</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  variant={isListening ? "contained" : "outlined"}
                  color={isListening ? "error" : "primary"}
                  onClick={isListening ? stopListening : startListening}
                  sx={{
                    height: 44,
                    borderRadius: 2.5,
                    fontWeight: 950,
                    letterSpacing: 0.3,
                    color: "white",
                    borderColor: "rgba(148,163,184,0.28)",
                    bgcolor: isListening ? "#dc2626" : "rgba(37,99,235,0.2)",
                    "&:hover": {
                      bgcolor: isListening ? "#b91c1c" : "rgba(37,99,235,0.34)",
                    },
                  }}
                >
                  {isListening ? "Stop Mic" : "Start Mic"}
                </Button>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: 2.5,
                    bgcolor: "rgba(2,6,23,0.5)",
                    border: "1px solid rgba(148,163,184,0.12)",
                    minHeight: 44,
                  }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        checked={autoSpeak}
                        onChange={(event) => setAutoSpeak(event.target.checked)}
                      />
                    }
                    label="Voice replies"
                    sx={{
                      color: "#e2e8f0",
                      m: 0,
                      "& .MuiFormControlLabel-label": {
                        fontWeight: 800,
                        fontSize: 14,
                      },
                    }}
                  />
                </Box>

                <FormControl
                  size="small"
                  disabled={!autoSpeak || ttsVoices.length === 0}
                  sx={fieldSx}
                >
                  <InputLabel>Kokoro Voice</InputLabel>
                  <Select
                    value={selectedTtsVoiceId}
                    label="Kokoro Voice"
                    onChange={(event) => setSelectedTtsVoiceId(event.target.value)}
                  >
                    {ttsVoices.map((voice) => (
                      <MenuItem key={voice.id} value={voice.id}>
                        {voice.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" disabled={!autoSpeak} sx={fieldSx}>
                  <InputLabel>Speed</InputLabel>
                  <Select
                    value={ttsSpeed}
                    label="Speed"
                    onChange={(event) => setTtsSpeed(Number(event.target.value))}
                  >
                    <MenuItem value={0.85}>0.85x</MenuItem>
                    <MenuItem value={0.95}>0.95x</MenuItem>
                    <MenuItem value={1}>1.00x</MenuItem>
                    <MenuItem value={1.05}>1.05x</MenuItem>
                    <MenuItem value={1.1}>1.10x</MenuItem>
                  </Select>
                </FormControl>

                <Button variant="outlined" onClick={resetVisibleChat} sx={ghostButtonSx}>
                  Clear View
                </Button>

                <Button
                  variant="outlined"
                  onClick={stopVoiceNow}
                  disabled={!isVoicePlaying}
                  sx={{
                    ...ghostButtonSx,
                    color: isVoicePlaying ? "#fecaca" : "rgba(226,232,240,0.38)",
                    borderColor: isVoicePlaying
                      ? "rgba(248,113,113,0.55)"
                      : "rgba(148,163,184,0.16)",
                    bgcolor: isVoicePlaying
                      ? "rgba(127,29,29,0.28)"
                      : "rgba(15,23,42,0.42)",
                    "&:hover": {
                      bgcolor: "rgba(127,29,29,0.4)",
                      borderColor: "rgba(248,113,113,0.75)",
                    },
                    "&.Mui-disabled": {
                      color: "rgba(226,232,240,0.34)",
                      borderColor: "rgba(148,163,184,0.14)",
                    },
                  }}
                >
                  Stop Voice
                </Button>
              </Box>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 5,
                bgcolor: "rgba(15,23,42,0.72)",
                border: "1px solid rgba(148,163,184,0.16)",
              }}
            >
              <Typography
                sx={{
                  mb: 1.25,
                  color: "#e2e8f0",
                  fontWeight: 950,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  fontSize: 12,
                }}
              >
                Status
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.85,
                    borderRadius: 2.5,
                    bgcolor: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.28)",
                    color: "#bbf7d0",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Model: {selectedModel?.model || "loading..."}
                </Box>

                {selectedVoice && (
                  <Box
                    sx={{
                      px: 1.25,
                      py: 0.85,
                      borderRadius: 2.5,
                      bgcolor: "rgba(59,130,246,0.14)",
                      border: "1px solid rgba(59,130,246,0.3)",
                      color: "#bfdbfe",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    Voice: {selectedVoice.label}
                  </Box>
                )}

                <Box
                  sx={{
                    px: 1.25,
                    py: 0.85,
                    borderRadius: 2.5,
                    bgcolor: isListening
                      ? "rgba(239,68,68,0.14)"
                      : "rgba(148,163,184,0.08)",
                    border: isListening
                      ? "1px solid rgba(239,68,68,0.35)"
                      : "1px solid rgba(148,163,184,0.14)",
                    color: isListening ? "#fecaca" : "#cbd5e1",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  Mic: {isListening ? "listening" : "idle"}
                </Box>
              </Box>
            </Paper>

            {voiceDraft && (
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 4,
                  bgcolor: "rgba(30,64,175,0.28)",
                  border: "1px solid rgba(96,165,250,0.38)",
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "#bfdbfe",
                    mb: 0.5,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Transcribing
                </Typography>

                <Typography sx={{ color: "#f8fafc", lineHeight: 1.6 }}>
                  {voiceDraft}
                </Typography>

                <Typography sx={{ color: "#93c5fd", fontSize: 12, mt: 1 }}>
                  Auto-sends after {silenceDelay} seconds of silence.
                </Typography>
              </Paper>
            )}
          </Box>

          {/* RIGHT CHAT PANEL */}
          <Paper
            elevation={0}
            sx={{
              height: { xs: "72vh", lg: "100%" },
              minHeight: { xs: 560, lg: 0 },
              borderRadius: 5,
              bgcolor: "rgba(15,23,42,0.76)",
              border: "1px solid rgba(148,163,184,0.18)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
              backdropFilter: "blur(14px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                px: { xs: 2, md: 2.5 },
                py: 2,
                borderBottom: "1px solid rgba(148,163,184,0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                bgcolor: "rgba(2,6,23,0.24)",
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontWeight: 950,
                    fontSize: 18,
                    letterSpacing: 0.2,
                    color: "#fff"
                  }}
                >
                  Conversation
                </Typography>

                <Typography sx={{ color: "#94a3b8", fontSize: 13 }}>
                  Mode: {selectedModel?.label || mode}
                </Typography>
              </Box>

              {chatMutation.isPending && (
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.85,
                    borderRadius: 999,
                    bgcolor: "rgba(59,130,246,0.12)",
                    border: "1px solid rgba(59,130,246,0.3)",
                  }}
                >
                  <CircularProgress size={16} sx={{ color: "#93c5fd" }} />
                  <Typography sx={{ color: "#bfdbfe", fontWeight: 800, fontSize: 13 }}>
                    Thinking...
                  </Typography>
                </Box>
              )}
            </Box>

            <Box
              ref={chatScrollRef}
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                p: { xs: 1.5, md: 2.5 },
                "&::-webkit-scrollbar": {
                  width: 10,
                },
                "&::-webkit-scrollbar-thumb": {
                  bgcolor: "rgba(148,163,184,0.28)",
                  borderRadius: 999,
                },
              }}
            >
              {messages.map((item, index) => {
                const isUser = item.role === "user";

                return (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      mb: 2,
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: { xs: "92%", md: "76%" },
                        px: 2,
                        py: 1.5,
                        borderRadius: 3,
                        background: isUser
                          ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                          : "rgba(30,41,59,0.92)",
                        color: "#f8fafc",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.65,
                        border: isUser
                          ? "1px solid rgba(96,165,250,0.35)"
                          : "1px solid rgba(148,163,184,0.14)",
                        boxShadow: isUser
                          ? "0 12px 30px rgba(37,99,235,0.18)"
                          : "0 12px 30px rgba(0,0,0,0.18)",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 1,
                          mb: 0.75,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontWeight: 950,
                            color: isUser ? "#dbeafe" : "#cbd5e1",
                            textTransform: "uppercase",
                            letterSpacing: 0.6,
                          }}
                        >
                          {isUser ? "You" : "CYOA Brain"}
                          {item.model ? ` | ${item.model}` : ""}
                        </Typography>

                        {!isUser && (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => replayMessageVoice(item.content)}
                            sx={{
                              minWidth: 0,
                              width: 30,
                              height: 30,
                              p: 0,
                              color: "#bfdbfe",
                              fontSize: 15,
                              borderRadius: 999,
                              bgcolor: "rgba(96,165,250,0.1)",
                              "&:hover": {
                                bgcolor: "rgba(96,165,250,0.2)",
                                color: "#ffffff",
                              },
                            }}
                            title="Replay this message"
                          >
                            🔊
                          </Button>
                        )}
                      </Box>

                      <Typography sx={{ fontSize: 15.5 }}>{item.content}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Box
              sx={{
                p: { xs: 1.25, md: 1.5 },
                borderTop: "1px solid rgba(148,163,184,0.14)",
                bgcolor: "rgba(2,6,23,0.34)",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "flex-end",
                }}
              >
                <TextField
                  fullWidth
                  multiline
                  minRows={1}
                  maxRows={4}
                  placeholder="Talk to your local AI..."
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={handleKeyDown}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: "#f8fafc",
                      color: "#020617",
                      borderRadius: 3,
                      fontWeight: 650,
                      "& fieldset": {
                        border: "none",
                      },
                      "&:hover fieldset": {
                        border: "none",
                      },
                      "&.Mui-focused": {
                        boxShadow: "0 0 0 3px rgba(96,165,250,0.2)",
                      },
                    },
                  }}
                />

                <Button
                  variant="contained"
                  onClick={() => sendMessage()}
                  disabled={chatMutation.isPending || !message.trim()}
                  sx={{
                    minHeight: 52,
                    px: { xs: 2.5, md: 4 },
                    borderRadius: 3,
                    fontWeight: 950,
                    bgcolor: "#2563eb",
                    boxShadow: "0 14px 30px rgba(37,99,235,0.25)",
                    "&:hover": {
                      bgcolor: "#1d4ed8",
                    },
                    "&.Mui-disabled": {
                      bgcolor: "rgba(71,85,105,0.6)",
                      color: "rgba(226,232,240,0.45)",
                    },
                  }}
                >
                  Send
                </Button>
              </Box>
            </Box>
          </Paper>
        </Box>
      </Container>

      <Dialog
        open={Boolean(ringingAlarm)}
        onClose={dismissAlarm}
        PaperProps={{
          sx: {
            width: "100%",
            maxWidth: 420,
            borderRadius: 4,
            bgcolor: "#111827",
            color: "#f8fafc",
            border: "1px solid rgba(248,113,113,0.45)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 950,
            color: "#fecaca",
          }}
        >
          Alarm
        </DialogTitle>

        <DialogContent>
          <Typography
            sx={{
              fontWeight: 800,
              mb: 1,
            }}
          >
            {ringingAlarm?.label || "Alarm"}
          </Typography>

          <Typography sx={{ color: "#cbd5e1" }}>
            Scheduled for{" "}
            {ringingAlarm?.triggerAt
              ? new Date(ringingAlarm.triggerAt).toLocaleString()
              : "now"}
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            variant="contained"
            color="error"
            onClick={dismissAlarm}
            sx={{
              borderRadius: 2.5,
              fontWeight: 950,
            }}
          >
            Dismiss
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
