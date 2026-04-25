import { useEffect, useRef, type RefObject, type ReactNode } from "react";
import styles from "./Popover.module.css";

export interface PopoverProps {
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function Popover({ onClose, triggerRef, children, className, "data-testid": testId }: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, triggerRef]);

  const classNames = [styles.popover, className].filter(Boolean).join(" ");

  return (
    <div ref={popoverRef} className={classNames} data-testid={testId}>
      {children}
    </div>
  );
}
