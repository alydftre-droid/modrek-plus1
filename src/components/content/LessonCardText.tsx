import { useState } from "react";

type Props = {
  text: string;
  lines?: 2 | 3;
  className?: string;
};

/**
 * Arabic-safe clamped description with an explicit "read more" toggle.
 * Guarantees the text can never push sibling action buttons out of the card:
 * it is clamped to a fixed number of lines and breaks very long unbroken words.
 */
const LessonCardText = ({ text, lines = 2, className = "" }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 90;

  return (
    <div className="min-w-0">
      <p
        dir="auto"
        className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
          expanded ? "" : lines === 3 ? "line-clamp-3" : "line-clamp-2"
        } ${className}`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "عرض أقل" : "... اقرأ المزيد"}
        </button>
      )}
    </div>
  );
};

export default LessonCardText;
