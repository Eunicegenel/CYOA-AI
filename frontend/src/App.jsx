import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from "@mui/material";

const API_URL = "http://localhost:5050/api/chat";
const MODELS_URL = "http://localhost:5050/api/models";

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

  const chatMutation = useMutation({
    mutationFn: async ({ message, conversationId, mode }) => {
      const response = await axios.post(API_URL, {
        message,
        conversationId,
        mode,
      });

      return response.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No response received.",
          mode: data.mode,
          model: data.model,
        },
      ]);
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
    },
  });

  const selectedModel = availableModels.find((item) => item.key === mode);

  const sendMessage = () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || chatMutation.isPending) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: trimmedMessage,
        mode,
      },
    ]);

    setMessage("");

    chatMutation.mutate({
      message: trimmedMessage,
      conversationId: "main",
      mode,
    });
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

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0f172a",
        color: "white",
        py: 4,
      }}
    >
      <Container maxWidth="md">
        <Typography
          variant="h3"
          sx={{
            fontWeight: 900,
            mb: 1,
            letterSpacing: -1,
          }}
        >
          CYOA Brain v0
        </Typography>

        <Typography sx={{ color: "rgba(255,255,255,0.7)", mb: 3 }}>
          Your local AI chat interface with switchable modes.
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            mb: 2,
            alignItems: "center",
          }}
        >
          <FormControl
            size="small"
            sx={{
              minWidth: 220,
              "& .MuiInputBase-root": {
                bgcolor: "white",
                borderRadius: 2,
              },
            }}
          >
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

          <Button
            variant="outlined"
            onClick={resetVisibleChat}
            sx={{
              color: "white",
              borderColor: "rgba(255,255,255,0.3)",
              borderRadius: 2,
            }}
          >
            Clear View
          </Button>

          <Typography sx={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
            Active: {selectedModel?.model || "loading..."}
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            height: "65vh",
            overflowY: "auto",
            p: 2,
            mb: 2,
            borderRadius: 4,
            bgcolor: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
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
                    maxWidth: "75%",
                    px: 2,
                    py: 1.5,
                    borderRadius: 3,
                    bgcolor: isUser ? "#2563eb" : "rgba(255,255,255,0.1)",
                    color: "white",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 700,
                      mb: 0.5,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {isUser ? "You" : "CYOA Brain"}
                    {item.model ? ` | ${item.model}` : ""}
                  </Typography>

                  <Typography>{item.content}</Typography>
                </Box>
              </Box>
            );
          })}

          {chatMutation.isPending && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={18} sx={{ color: "white" }} />
              <Typography sx={{ color: "rgba(255,255,255,0.7)" }}>
                Thinking with {selectedModel?.label || mode} mode...
              </Typography>
            </Box>
          )}
        </Paper>

        <Box sx={{ display: "flex", gap: 1 }}>
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
                bgcolor: "white",
                borderRadius: 3,
              },
            }}
          />

          <Button
            variant="contained"
            onClick={sendMessage}
            disabled={chatMutation.isPending || !message.trim()}
            sx={{
              px: 4,
              borderRadius: 3,
              fontWeight: 800,
            }}
          >
            Send
          </Button>
        </Box>
      </Container>
    </Box>
  );
}

export default App;
