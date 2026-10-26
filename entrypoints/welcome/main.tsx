import { createRoot } from "react-dom/client";

import "../../src/ui/theme.css";
import "../../src/ui/panel.css";
import { Welcome } from "./Welcome";

createRoot(document.getElementById("root")!).render(<Welcome />);
