import { useEffect, useState } from "react";


function App() {

  const [message, setMessage] = useState<string>("");

  const [input, setInput] = useState<string>("");


  const [socket, setSocket] =
    useState<WebSocket | null>(null);



  useEffect(() => {

    const ws = new WebSocket(
      "ws://127.0.0.1:8000/ws/chat/"
    );


    ws.onmessage = (event: MessageEvent) => {

      setMessage(event.data);

    };


    setSocket(ws);


    return () => {

      ws.close();

    };


  }, []);



  const sendMessage = () => {

    console.log("Sending:", input);


    if (socket) {

      socket.send(
        JSON.stringify({
          message: input
        })
      );

    }

  };



  return (

    <div>

      <h1>
        WebSocket Chat Test
      </h1>


      <p>
        Server:
        {message}
      </p>


      <input

        value={input}

        onChange={(e) =>
          setInput(e.target.value)
        }

      />


      <button onClick={sendMessage}>

        Send

      </button>


    </div>

  );

}


export default App;