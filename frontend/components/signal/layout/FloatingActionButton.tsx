"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Bot } from "lucide-react";

export function FloatingActionButton() {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            aria-label="AI Assistant (coming soon)"
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              backgroundColor: "var(--sg-fab-bg, var(--sg-accent))",
              color: "var(--sg-fab-color, #fff)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
              zIndex: 60,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 6px 24px rgba(0,0,0,0.22), 0 3px 10px rgba(0,0,0,0.14)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 4px 16px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)";
            }}
          >
            <Bot className="w-5 h-5" />
          </button>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            side="left"
            sideOffset={10}
            style={{
              fontSize: "12px",
              fontWeight: 500,
              fontFamily: "var(--font-inter, Inter, sans-serif)",
              padding: "5px 10px",
              borderRadius: "6px",
              backgroundColor: "var(--sg-text)",
              color: "var(--sg-bg)",
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            AI Assistant (coming soon)
            <Tooltip.Arrow style={{ fill: "var(--sg-text)" }} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
