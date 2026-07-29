import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = dirname(fileURLToPath(import.meta.url));
const exercisesDir = resolve(here, "../assets/exercises");

/**
 * Иллюстрации упражнений живут в общем каталоге репозитория и на сервере
 * раздаются FastAPI. В APK сервера нет, поэтому кладём их прямо в бандл.
 */
function bundleExerciseImages(): Plugin {
  return {
    name: "fit-ai-exercise-images",
    apply: "build",
    closeBundle() {
      if (!existsSync(exercisesDir)) {
        this.warn(`Каталог ${exercisesDir} не найден — картинки упражнений не попадут в сборку`);
        return;
      }
      cpSync(exercisesDir, resolve(here, "dist/assets/exercises"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), bundleExerciseImages()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});

