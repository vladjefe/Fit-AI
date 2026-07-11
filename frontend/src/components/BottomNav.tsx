import { motion } from "framer-motion";
import { BarChart3, Dumbbell, Home, Target, UserRound } from "lucide-react";
import type { AppTab } from "../types";

interface BottomNavProps {
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

const items: Array<{
  id: AppTab;
  label: string;
  icon: typeof Home;
}> = [
  { id: "home", label: "Главная", icon: Home },
  { id: "workout", label: "Тренировка", icon: Dumbbell },
  { id: "progress", label: "Прогресс", icon: BarChart3 },
  { id: "goals", label: "Цели", icon: Target },
  { id: "profile", label: "Профиль", icon: UserRound },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[520px] border-t border-white/[0.07] bg-[#0b0d0c]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className="relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl"
              aria-current={selected ? "page" : undefined}
              aria-label={item.label}
            >
              {selected && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute top-0 h-[3px] w-6 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 460, damping: 34 }}
                />
              )}
              <Icon
                size={20}
                strokeWidth={selected ? 2.4 : 1.8}
                className={selected ? "text-accent" : "text-white/40"}
              />
              <span
                className={`text-[9px] font-bold tracking-[-0.01em] ${selected ? "text-white" : "text-white/35"}`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

