import { createRoot } from "react-dom/client";

import "../../src/ui/theme.css";
import "../../src/ui/panel.css";
import { Panel } from "./Panel";

createRoot(document.getElementById("root")!).render(<Panel />);
