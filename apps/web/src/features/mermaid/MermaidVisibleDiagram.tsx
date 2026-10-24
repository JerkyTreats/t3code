import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { observeResize } from "~/lib/observeResize";

import { readMermaidDiagramHeight, rememberMermaidDiagramHeight } from "./mermaidDiagramHeights";
import { usePreserveScrollOnMermaidResize } from "./mermaidScrollStability";

function useVisibleOnce(elementRef: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible) return;
    const element = elementRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, visible]);

  return visible;
}

/**
 * Wraps the pele diagram in a Markdown fence. The diagram mounts only once the fence
 * enters the visible scroll area, a remounted fence reserves the last rendered height
 * of the same source, and height changes above the viewport keep the reading position.
 */
export function MermaidVisibleDiagram({
  source,
  placeholder,
  children,
}: {
  source: string;
  placeholder: ReactNode;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = useVisibleOnce(containerRef);
  const [reservedHeight] = useState(() => readMermaidDiagramHeight(source));
  usePreserveScrollOnMermaidResize(containerRef);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;
    return observeResize(container, () => {
      if (!container.querySelector("svg")) return;
      rememberMermaidDiagramHeight(source, container.getBoundingClientRect().height);
    });
  }, [source, visible]);

  return (
    <div
      ref={containerRef}
      data-mermaid-visibility={visible ? "visible" : "pending"}
      style={!visible && reservedHeight !== null ? { minHeight: reservedHeight } : undefined}
    >
      {visible ? children : placeholder}
    </div>
  );
}
