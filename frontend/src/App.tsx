import { useEffect, useRef, useState } from "react";

function App() {
  const socket = useRef<WebSocket | null>(null);
  const lastSent = useRef<number>(0);        // ← tracks last send time
  const [message, setMessage] = useState("");
  const [server, setServer] = useState("");
  const [throttled, setThrottled] = useState(false);  // ← UI feedback

  useEffect(() => {
    let ws: WebSocket;

    function connect() {
      ws = new WebSocket("ws://localhost:8000/ws/chat/room1/");
      socket.current = ws;

      ws.onopen = () => console.log("connected");

      ws.onmessage = (event) => {
        console.log("received", event.data);
        setServer(event.data);
      };

      ws.onclose = (event) => {
        console.log("closed", event.code);
      };

      ws.onerror = (err) => console.error("ws error", err);
    }

    connect();

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  function sendMessage() {
    const now = Date.now();
    const THROTTLE_MS = 1000;  // 1 second

    // If last message was sent less than 1 second ago, block it
    if (now - lastSent.current < THROTTLE_MS) {
      console.log("throttled — too fast");
      setThrottled(true);
      setTimeout(() => setThrottled(false), THROTTLE_MS);
      return;
    }

    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      console.log("Sending:", message);
      socket.current.send(JSON.stringify({ message }));
      lastSent.current = now;  // ← update last sent time
    } else {
      console.log("socket not open", socket.current?.readyState);
    }
  }

  return (
    <div>
      <h1>WebSocket Chat Test</h1>
      <p>Server:{server}</p>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button onClick={sendMessage} disabled={throttled}>
        {throttled ? "Wait..." : "Send"}
      </button>
      {throttled && <p style={{ color: "red" }}>Sending too fast, slow down!</p>}
    </div>
  );
}

export default App;