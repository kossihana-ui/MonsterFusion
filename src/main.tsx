import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { giveTheKeyboardRoom } from "./shared/keyboardRoom";
import "./styles.css";

// Once, for the whole app: on a touch screen, keep a focused text field out
// from under the keyboard. See shared/keyboardRoom.ts for why the browser
// does not always manage this on its own.
giveTheKeyboardRoom();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
