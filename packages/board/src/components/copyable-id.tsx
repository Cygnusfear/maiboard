import { useState, useCallback } from "react";
import { Copy, Check } from "@phosphor-icons/react";

interface CopyableIdProps {
  id: string;
  className?: string;
}

export function CopyableId({ id, className = "" }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [id]);

  return (
    <button
      onClick={handleCopy}
      title="Copy ticket ID"
      className={`group inline-flex items-center gap-1 font-mono transition-colors ${
        copied ? "text-green-400" : "text-zinc-500 hover:text-zinc-300"
      } ${className}`}
    >
      {id}
      {copied ? (
        <Check size={12} weight="bold" className="shrink-0" />
      ) : (
        <Copy size={12} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
