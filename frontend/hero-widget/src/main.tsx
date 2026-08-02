import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HeroSlider from "./HeroSlider";

const mount = document.getElementById("hero-root");

if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <HeroSlider />
    </StrictMode>,
  );
}
